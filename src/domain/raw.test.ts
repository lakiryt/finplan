import { describe, expect, it } from 'vitest'
import { parseCsv } from './importers'
import { expenseRanking, expenseTotals, rawExpenseByCategory, rawMonthlyRows } from './raw'
import { csv } from './testData'

describe('raw (no processing)', () => {
  const txs = parseCsv(csv).transactions
  const rows = rawMonthlyRows(txs, '2026-01', '2026-03')

  it('sums expenses and income by sign only', () => {
    expect(rows.map((r) => [r.expense, r.income])).toEqual([
      [66000, 200000],
      [58000, 0],
      [800, 500],
    ])
  })

  it('computes per-category monthly mean, median, and share', () => {
    const food = rawExpenseByCategory(txs, rows).find((c) => c.category === '食費')!
    expect(food).toMatchObject({ count: 3, total: 6800, monthlyMedian: 800 })
    expect(food.monthlyMean).toBeCloseTo(6800 / 3)
    expect(food.share).toBeCloseTo(6800 / 124800)
  })

  it('ranks categories by total expense', () => {
    expect(expenseRanking(expenseTotals(txs))).toEqual(['家賃', '貯蓄', '食費'])
  })
})
