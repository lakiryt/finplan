import { describe, expect, it } from 'vitest'
import { monthRange, monthlyRows } from './aggregate'
import { classify } from './classify'
import { parseCsv } from './importers'
import { median, seriesStats } from './stats'
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
