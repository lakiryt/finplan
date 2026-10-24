import { monthOf, monthRange } from './aggregate'
import { mean, median } from './stats'
import type { Transaction } from './types'

/**
 * 加工なしの集計。ルールやグループは使わず、CSVのカテゴリーと金額の符号だけで数える。
 * マイナスの取引は支出、プラスの取引は収入として、どちらもプラスの金額で持つ。
 */
export interface RawMonth {
  month: string
  expense: number
  income: number
  expenseByCategory: Record<string, number>
}

export interface RawCategoryStat {
  category: string
  count: number
  total: number
  /** 月ごとの合計の平均・中央値（その月に支出が無ければ 0 として数える） */
  monthlyMean: number
  monthlyMedian: number
  /** 期間の支出全体に占める割合（0〜1） */
  share: number
}

export function rawMonthlyRows(txs: Transaction[], from: string, to: string): RawMonth[] {
  const rows = new Map(
    monthRange(from, to).map((month) => [month, { month, expense: 0, income: 0, expenseByCategory: {} } as RawMonth]),
  )
  for (const tx of txs) {
    const row = rows.get(monthOf(tx.date))
    if (!row) continue
    if (tx.amount < 0) {
      row.expense -= tx.amount
      row.expenseByCategory[tx.category] = (row.expenseByCategory[tx.category] ?? 0) - tx.amount
    } else {
      row.income += tx.amount
    }
  }
  return [...rows.values()]
}

/** 支出のカテゴリー別の集計（期間合計の多い順） */
export function rawExpenseByCategory(txs: Transaction[], rows: RawMonth[]): RawCategoryStat[] {
  const counts = new Map<string, number>()
  for (const tx of txs) if (tx.amount < 0) counts.set(tx.category, (counts.get(tx.category) ?? 0) + 1)
  const totalExpense = rows.reduce((s, r) => s + r.expense, 0)

  return [...counts.entries()]
    .map(([category, count]) => {
      const monthly = rows.map((r) => r.expenseByCategory[category] ?? 0)
      const total = monthly.reduce((a, b) => a + b, 0)
      return {
        category,
        count,
        total,
        monthlyMean: mean(monthly),
        monthlyMedian: median(monthly),
        share: totalExpense ? total / totalExpense : 0,
      }
    })
    .sort((a, b) => b.total - a.total)
}

/**
 * 全データでの支出合計の多い順に並べたカテゴリー名。
 * 期間を変えても並び（と色）が変わらないよう、表示順の初期値にはこれを使う。
 */
export function expenseRanking(txs: Transaction[]): string[] {
  const totals = new Map<string, number>()
  for (const tx of txs) if (tx.amount < 0) totals.set(tx.category, (totals.get(tx.category) ?? 0) - tx.amount)
  return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c)
}
