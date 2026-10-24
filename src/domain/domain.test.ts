import { describe, expect, it } from 'vitest'
import { monthRange, monthlyRows } from './aggregate'
import { classify } from './classify'
import { parseCsv, parseDate } from './importers'
import { median, seriesStats } from './stats'
import type { ClassifyConfig } from './types'
import { requiredWage } from './wage'

const csv = `金額,日付,メモ,カテゴリー名
-1000,2026/01/05,スーパー,食費
-5000,2026/01/10,携帯1月,食費
200000,2026/01/25,給与,給与
-50000,2026/02/01,証券,貯蓄
500,2026/03/02,割り勘 半額,回収
-800,2026/03/03,スーパー,食費
`

const config: ClassifyConfig = {
  version: 1,
  groups: [
    { id: 'var', label: '変動', role: 'living' },
    { id: 'fix', label: '固定', role: 'living' },
    { id: 'inc', label: '収入', role: 'income' },
    { id: 'skip', label: '除外', role: 'ignore' },
  ],
  categoryGroup: { 食費: 'var', 通信: 'fix', 給与: 'inc', 貯蓄: 'skip' },
  memoRules: [
    { id: '1', pattern: '携帯', isRegex: false, category: '通信' },
    { id: '2', pattern: '半額$', isRegex: true, groupId: 'var' },
  ],
}

describe('importers', () => {
  it('parses dates in several formats', () => {
    expect(parseDate('2026/1/5')).toBe('2026-01-05')
    expect(parseDate('2026-10-24')).toBe('2026-10-24')
    expect(parseDate('10/24')).toBeNull()
  })

  it('parses the CSV and strips a BOM', () => {
    const r = parseCsv('\uFEFF' + csv)
    expect(r.transactions).toHaveLength(6)
    expect(r.transactions[0]).toMatchObject({ date: '2026-01-05', amount: -1000, category: '食費' })
  })

  it('rejects unknown formats', () => {
    expect(() => parseCsv('a,b\n1,2')).toThrow()
  })
})

describe('classify + aggregate', () => {
  const txs = classify(parseCsv(csv).transactions, config)

  it('applies memo rules before category mapping', () => {
    expect(txs[1]).toMatchObject({ category: '通信', originalCategory: '食費', groupId: 'fix' })
    expect(txs[4]).toMatchObject({ groupId: 'var', role: 'living' })
  })

  it('fills empty months and nets refunds against living costs', () => {
    const rows = monthlyRows(txs, '2026-01', '2026-03')
    expect(rows.map((r) => r.living)).toEqual([6000, 0, 300])
    expect(rows[0].income).toBe(200000)
    expect(rows[0].byGroup).toEqual({ var: 1000, fix: 5000, inc: 200000 })
  })

  it('lists months across a year boundary', () => {
    expect(monthRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })
})

describe('stats & wage', () => {
  it('computes median and recent means', () => {
    expect(median([3, 1, 2, 10])).toBe(2.5)
    expect(seriesStats([1, 2, 3, 4, 5, 6]).recent[3]).toBe(5)
  })

  it('back-calculates the hourly wage', () => {
    const r = requiredWage({ living: 100000, rent: 60000, extraFixed: 20000, savings: 0, takeHomeRate: 0.8, hoursPerMonth: 150 })
    expect(r.requiredTakeHome).toBe(180000)
    expect(r.requiredGross).toBe(225000)
    expect(r.hourlyWage).toBe(1500)
  })
})
