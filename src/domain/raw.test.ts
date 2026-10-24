import { describe, expect, it } from 'vitest'
import { parseCsv } from './importers'
import { categoryTotals, rankByTotal, rawCategoryStats, rawMonthlyRows } from './raw'
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
    const food = rawCategoryStats(txs, rows, 'expense').find((c) => c.category === '食費')!
    expect(food).toMatchObject({ count: 3, total: 6800, monthlyMedian: 800 })
    expect(food.monthlyMean).toBeCloseTo(6800 / 3)
    expect(food.share).toBeCloseTo(6800 / 124800)
  })

  it('computes income per category in the same way', () => {
    const income = rawCategoryStats(txs, rows, 'income')
    expect(income.map((c) => [c.category, c.total])).toEqual([
      ['給与', 200000],
      ['回収', 500],
    ])
    expect(rows[2].byCategory.income).toEqual({ 回収: 500 })
  })

  it('ranks categories by total expense', () => {
    expect(rankByTotal(categoryTotals(txs, 'expense'))).toEqual(['家賃', '貯蓄', '食費'])
    expect(rankByTotal(categoryTotals(txs, 'income'))).toEqual(['給与', '回収'])
  })
})
