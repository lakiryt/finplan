import { describe, expect, it } from 'vitest'
import { monthRange, monthlyRows } from './aggregate'
import { classify } from './classify'
import { parseCsv } from './importers'
import { histogram, median, quantile, seriesStats } from './stats'
import { config, csv } from './testData'

describe('aggregate & stats', () => {
  const txs = classify(parseCsv(csv).transactions, config)

  it('fills empty months, excludes rent, and nets refunds against living costs', () => {
    const rows = monthlyRows(txs, '2026-01', '2026-03')
    expect(rows.map((r) => r.living)).toEqual([6000, 8000, 300])
    expect(rows[0].housing).toBe(60000)
    expect(rows[0].income).toBe(200000)
  })

  it('lists months across a year boundary', () => {
    expect(monthRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })

  it('computes median and recent means', () => {
    expect(median([3, 1, 2, 10])).toBe(2.5)
    expect(seriesStats([1, 2, 3, 4, 5, 6]).recent[3]).toBe(5)
  })
})

describe('histogram', () => {
  it('bins monthly values and clips extreme months into the edge bins', () => {
    const values = [10, 11, 12, 13, 14, 15, 16, 17, 18, 500]
    const h = histogram(values, 4)
    expect(h.counts.reduce((a, b) => a + b, 0)).toBe(values.length)
    expect(h.clippedHigh).toBe(1)
    expect(h.hi).toBeLessThan(500)
    expect(h.counts[h.counts.length - 1]).toBeGreaterThanOrEqual(1)
  })

  it('handles negative values, a single value, and no values', () => {
    expect(histogram([-30, -10, 0, 20], 4).lo).toBe(-30)
    expect(histogram([5, 5, 5], 4).counts).toEqual([3, 0, 0, 0])
    expect(histogram([], 4).counts).toEqual([0, 0, 0, 0])
  })

  it('computes quantiles with interpolation', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5)
  })
})
