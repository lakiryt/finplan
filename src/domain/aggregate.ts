import type { ClassifiedTransaction, GroupRole } from './types'

/** 1か月分の集計。支出系はプラスの金額（使った額）、収入はプラスの金額（入った額）で持つ */
export interface MonthRow {
  month: string
  living: number
  housing: number
  income: number
  byGroup: Record<string, number>
  byCategory: Record<string, number>
}

export interface CategorySummary {
  category: string
  groupId: string | null
  role: GroupRole | null
  count: number
  /** 期間内の合計（役割に応じて符号をそろえたもの） */
  total: number
  monthlyMean: number
}

export const monthOf = (date: string) => date.slice(0, 7)

/** from から to まで（両端を含む）の YYYY-MM を並べる */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = []
  let [y, m] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    if (++m > 12) {
      m = 1
      y++
    }
  }
  return out
}

/** 役割に応じて符号をそろえる。支出系は「使った額」をプラスにする（返金はマイナスとして差し引かれる） */
export function signedForRole(amount: number, role: GroupRole | null): number {
  return role === 'income' ? amount : -amount
}

export function filterByMonths<T extends { date: string }>(txs: T[], from: string, to: string): T[] {
  return txs.filter((t) => {
    const m = monthOf(t.date)
    return m >= from && m <= to
  })
}

/** 取引の無い月も 0 として含める（平均が実態より高くならないように） */
export function monthlyRows(txs: ClassifiedTransaction[], from: string, to: string): MonthRow[] {
  const rows = new Map(
    monthRange(from, to).map((month) => [
      month,
      { month, living: 0, housing: 0, income: 0, byGroup: {}, byCategory: {} } as MonthRow,
    ]),
  )
  for (const tx of txs) {
    const row = rows.get(monthOf(tx.date))
    if (!row || !tx.role || tx.role === 'ignore' || !tx.groupId) continue
    const v = signedForRole(tx.amount, tx.role)
    row[tx.role] += v
    row.byGroup[tx.groupId] = (row.byGroup[tx.groupId] ?? 0) + v
    row.byCategory[tx.category] = (row.byCategory[tx.category] ?? 0) + v
  }
  return [...rows.values()]
}

export function categorySummaries(txs: ClassifiedTransaction[], monthCount: number): CategorySummary[] {
  const map = new Map<string, CategorySummary>()
  for (const tx of txs) {
    let s = map.get(tx.category)
    if (!s) {
      s = { category: tx.category, groupId: tx.groupId, role: tx.role, count: 0, total: 0, monthlyMean: 0 }
      map.set(tx.category, s)
    }
    // 按分で展開された取引は、元の1件として数える
    if (!tx.amortizedFrom || tx.id.endsWith('#0')) s.count++
    s.total += signedForRole(tx.amount, tx.role)
  }
  for (const s of map.values()) s.monthlyMean = monthCount ? s.total / monthCount : 0
  return [...map.values()].sort((a, b) => b.total - a.total)
}
