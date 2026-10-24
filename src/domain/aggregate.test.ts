import { describe, expect, it } from 'vitest'
import { filterByMonths, monthRange } from './aggregate'
import { median, seriesStats } from './stats'

describe('months & stats', () => {
  it('filters records by month range', () => {
    const txs = [{ date: '2025-12-31' }, { date: '2026-01-01' }, { date: '2026-02-28' }, { date: '2026-03-01' }]
    expect(filterByMonths(txs, '2026-01', '2026-02').map((t) => t.date)).toEqual(['2026-01-01', '2026-02-28'])
  })

  it('lists months across a year boundary', () => {
    expect(monthRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })

  it('computes median and recent means', () => {
    expect(median([3, 1, 2, 10])).toBe(2.5)
    expect(seriesStats([1, 2, 3, 4, 5, 6]).recent[3]).toBe(5)
  })
})
