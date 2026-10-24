import { monthOf, monthRange } from './aggregate'
import { mean, median } from './stats'
import type { Transaction } from './types'

/*
 * 2. の集計。ルールやグループは使わず、CSVのカテゴリーと金額の符号だけで数える。
 * マイナスの取引は支出、プラスの取引は収入として、どちらもプラスの金額で持つ。0円の記録は数えない。
 */

export type Side = 'expense' | 'income'

/**
 * 金額の符号から、支出側か収入側か。0円の記録はどちらでもない（null）。
 * 0円を収入側に数えると、支出のカテゴリーが収入の表に0円の行として紛れ込むため
 */
export const sideOf = (amount: number): Side | null => (amount < 0 ? 'expense' : amount > 0 ? 'income' : null)

/** 取引が支出側か収入側か。加工で明示されていればそれを使う（相殺など） */
export const txSide = (tx: Transaction): Side | null => (tx.amount === 0 ? null : (tx.side ?? sideOf(tx.amount)))

/** その側として数える金額。支出側はマイナスの金額を足す（相殺したプラスの記録は支出を減らす） */
const signedFor = (tx: Transaction, side: Side) => (side === 'expense' ? -tx.amount : tx.amount)

export interface RawMonth {
  month: string
  expense: number
  income: number
  /** 支出側・収入側それぞれの、カテゴリーごとの合計 */
  byCategory: Record<Side, Record<string, number>>
}

export interface RawCategoryStat {
  category: string
  count: number
  total: number
  /** 月ごとの合計の平均・中央値（その月に記録が無ければ 0 として数える） */
  monthlyMean: number
  monthlyMedian: number
  /** 期間の支出（または収入）全体に占める割合（0〜1） */
  share: number
}

export function rawMonthlyRows(txs: Transaction[], from: string, to: string): RawMonth[] {
  const rows = new Map(
    monthRange(from, to).map((month): [string, RawMonth] => [month, { month, expense: 0, income: 0, byCategory: { expense: {}, income: {} } }]),
  )
  for (const tx of txs) {
    const row = rows.get(monthOf(tx.date))
    if (!row) continue
    const side = txSide(tx)
    if (!side) continue
    const amount = signedFor(tx, side)
    row[side] += amount
    row.byCategory[side][tx.category] = (row.byCategory[side][tx.category] ?? 0) + amount
  }
  return [...rows.values()]
}

/** 支出側（または収入側）のカテゴリー別の集計（期間合計の多い順） */
export function rawCategoryStats(txs: Transaction[], rows: RawMonth[], side: Side): RawCategoryStat[] {
  const counts = new Map<string, number>()
  for (const tx of txs) if (txSide(tx) === side) counts.set(tx.category, (counts.get(tx.category) ?? 0) + 1)
  const sideTotal = rows.reduce((s, r) => s + r[side], 0)

  return [...counts.entries()]
    .map(([category, count]) => {
      const monthly = rows.map((r) => r.byCategory[side][category] ?? 0)
      const total = monthly.reduce((a, b) => a + b, 0)
      return {
        category,
        count,
        total,
        monthlyMean: mean(monthly),
        monthlyMedian: median(monthly),
        share: sideTotal ? total / sideTotal : 0,
      }
    })
    .sort((a, b) => b.total - a.total)
}

/** その期間に記録が無かったカテゴリーの集計（表の行を期間によって増減させないため） */
export const emptyCategoryStat = (category: string): RawCategoryStat => ({
  category,
  count: 0,
  total: 0,
  monthlyMean: 0,
  monthlyMedian: 0,
  share: 0,
})

/** 支出側（または収入側）のカテゴリーごとの合計（プラスの金額） */
export function categoryTotals(txs: Transaction[], side: Side): Map<string, number> {
  const totals = new Map<string, number>()
  for (const tx of txs) if (txSide(tx) === side) totals.set(tx.category, (totals.get(tx.category) ?? 0) + signedFor(tx, side))
  return totals
}

/**
 * 合計の多い順に並べたカテゴリー名。
 * 期間を変えても並び（と色）が変わらないよう、表示順の初期値には全データでのこの順を使う。
 */
export function rankByTotal(totals: Map<string, number>): string[] {
  return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c)
}
