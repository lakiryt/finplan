import { describe, expect, it } from 'vitest'
import { rawMonthlyRows } from './raw'
import { sampleTransactions } from './sample'

describe('sample data', () => {
  const txs = sampleTransactions()

  it('is the same every time and covers 2025 with both sides', () => {
    expect(sampleTransactions()).toEqual(txs)
    const rows = rawMonthlyRows(txs, '2025-01', '2025-12')
    expect(rows).toHaveLength(12)
    expect(rows.every((r) => r.income > 0 && r.expense > 0)).toBe(true)
    expect(txs.every((t) => t.amount !== 0 && /^2025-\d{2}-\d{2}$/.test(t.date))).toBe(true)
  })

  it('includes records worth processing', () => {
    const categories = new Set(txs.map((t) => t.category))
    for (const c of ['積立', '回収', '出金']) expect(categories.has(c)).toBe(true)
  })
})
