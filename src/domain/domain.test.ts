import { describe, expect, it } from 'vitest'
import { monthRange, monthlyRows } from './aggregate'
import { addMonths, classify, splitAmount } from './classify'
import { defaultConfig, parseConfig } from './config'
import { parseCsv, parseDate } from './importers'
import { expenseRanking, rawExpenseByCategory, rawMonthlyRows } from './raw'
import { median, seriesStats } from './stats'
import type { ClassifyConfig, Rule } from './types'
import {
  applyDisplayNames,
  assignColors,
  assignSuper,
  createSuper,
  defaultView,
  deleteSuper,
  moveKey,
  orderKeys,
  parseViewConfig,
  renameSuper,
  type ViewConfig,
} from './view'

const csv = `金額,日付,メモ,カテゴリー名
-1000,2026/01/05,スーパー,食費
-5000,2026/01/10,携帯1月,食費
200000,2026/01/25,給与,給与
-50000,2026/02/01,証券,貯蓄
500,2026/03/02,割り勘 半額,回収
-800,2026/03/03,スーパー,食費
-60000,2026/01/20,家賃,家賃
-8000,2026/02/10,ホテル2泊,家賃
`

const rule = (id: string, match: Rule['match'], effect: Rule['effect']): Rule => ({ id, label: id, enabled: true, match, effect })

const config: ClassifyConfig = {
  version: 2,
  groups: [
    { id: 'var', label: '変動', role: 'living' },
    { id: 'fix', label: '固定', role: 'living' },
    { id: 'house', label: '住居', role: 'housing' },
    { id: 'inc', label: '収入', role: 'income' },
    { id: 'skip', label: '除外', role: 'ignore' },
  ],
  categoryGroup: { 食費: 'var', 通信: 'fix', 宿泊: 'var', 家賃: 'house', 給与: 'inc', 貯蓄: 'skip' },
  rules: [
    rule('phone', { memo: '携帯' }, { category: '通信' }),
    rule('refund', { memo: '半額$', memoIsRegex: true }, { groupId: 'var' }),
    rule('lodging', { category: '家賃', memo: '泊' }, { category: '宿泊' }),
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
    expect(r.transactions).toHaveLength(8)
    expect(r.transactions[0]).toMatchObject({ date: '2026-01-05', amount: -1000, category: '食費' })
  })

  it('rejects unknown formats', () => {
    expect(() => parseCsv('a,b\n1,2')).toThrow()
  })
})

describe('classify', () => {
  const txs = parseCsv(csv).transactions

  it('applies rules before category mapping', () => {
    const c = classify(txs, config)
    expect(c[1]).toMatchObject({ category: '通信', originalCategory: '食費', groupId: 'fix' })
    expect(c[4]).toMatchObject({ groupId: 'var', role: 'living' })
    expect(c[7]).toMatchObject({ category: '宿泊', groupId: 'var' })
    expect(c[6]).toMatchObject({ category: '家賃', groupId: 'house' })
  })

  it('limits rules by period and stacks effects in order', () => {
    const c = classify(txs, {
      ...config,
      rules: [
        rule('a', { category: '食費', from: '2026-03-01' }, { category: '外食', groupId: 'skip' }),
        rule('b', { memo: 'スーパー', to: '2026-12-31' }, { groupId: 'fix' }),
      ],
    })
    expect(c[0]).toMatchObject({ category: '食費', groupId: 'fix' })
    expect(c[5]).toMatchObject({ category: '外食', groupId: 'fix' })
  })

  it('ignores disabled rules and rules without conditions', () => {
    const c = classify(txs, {
      ...config,
      rules: [rule('x', {}, { groupId: 'skip' }), { ...rule('y', { memo: 'スーパー' }, { groupId: 'skip' }), enabled: false }],
    })
    expect(c[0].groupId).toBe('var')
  })

  it('amortizes an expense across months', () => {
    const c = classify(txs, { ...config, rules: [rule('am', { memo: 'ホテル' }, { amortizeMonths: 3 })] })
    const parts = c.filter((t) => t.amortizedFrom === '7')
    expect(parts.map((t) => [t.date, t.amount])).toEqual([
      ['2026-02-10', -2668],
      ['2026-03-01', -2666],
      ['2026-04-01', -2666],
    ])
  })

  it('splits amounts without losing yen', () => {
    expect(splitAmount(-1000, 3)).toEqual([-334, -333, -333])
    expect(addMonths('2025-11-15', 3)).toBe('2026-02-01')
  })
})

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

describe('config', () => {
  it('loads the default config file', () => {
    expect(defaultConfig.version).toBe(2)
    expect(defaultConfig.rules.length).toBeGreaterThan(0)
  })

  it('migrates v1 memo rules', () => {
    const c = parseConfig({
      version: 1,
      groups: config.groups,
      categoryGroup: {},
      memoRules: [{ id: '1', pattern: '携帯', isRegex: false, category: '通信' }],
    })
    expect(c.rules[0]).toMatchObject({ match: { memo: '携帯' }, effect: { category: '通信' }, enabled: true })
  })

  it('rejects broken configs', () => {
    expect(() => parseConfig({ version: 2, groups: [{ id: 'a', role: 'nope' }], categoryGroup: {}, rules: [] })).toThrow()
  })
})

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
    expect(expenseRanking(txs)).toEqual(['家賃', '貯蓄', '食費'])
  })
})

describe('view', () => {
  const txs = parseCsv(csv).transactions
  const view: ViewConfig = {
    version: 1,
    useSuperCategories: true,
    colors: {},
    order: [],
    superCategories: [{ id: 's', label: '住まいと食', members: ['食費', '家賃'] }],
  }

  it('merges categories into super categories only when enabled', () => {
    expect(applyDisplayNames(txs, view).map((t) => t.category)).toContain('住まいと食')
    expect(applyDisplayNames(txs, { ...view, useSuperCategories: false })).toEqual(txs)
    const rows = rawMonthlyRows(applyDisplayNames(txs, view), '2026-01', '2026-01')
    expect(rows[0].expenseByCategory).toEqual({ 住まいと食: 66000 })
  })

  it('keeps chosen colors, fills the rest from the palette without duplicates, then falls back', () => {
    expect(assignColors(['a', 'b', 'c', 'd'], { b: '#111111' }, ['#111111', '#222222', '#333333'], '#999999')).toEqual({
      a: '#222222',
      b: '#111111',
      c: '#333333',
      d: '#999999',
    })
  })

  it('orders keys by saved order first, then by fallback ranking', () => {
    expect(orderKeys(['a', 'b', 'c', 'd'], ['c', 'x'], ['d', 'a', 'b', 'c'])).toEqual(['c', 'd', 'a', 'b'])
  })

  it('moves a key to the target position', () => {
    expect(moveKey(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd'])
    expect(moveKey(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
  })

  it('edits super categories', () => {
    let v = createSuper(view, 'n', '新しい', '通信')
    expect(v.superCategories[1]).toEqual({ id: 'n', label: '新しい', members: ['通信'] })
    v = assignSuper(v, '食費', 'n')
    expect(v.superCategories.map((s) => s.members)).toEqual([['家賃'], ['通信', '食費']])
    v = assignSuper(v, '食費', null)
    expect(v.superCategories[1].members).toEqual(['通信'])
    v = renameSuper({ ...v, colors: { 新しい: '#123456' }, order: ['新しい'] }, 'n', '改名')
    expect(v).toMatchObject({ colors: { 改名: '#123456' }, order: ['改名'] })
    expect(deleteSuper(v, 'n').superCategories).toHaveLength(1)
  })

  it('loads the default view file and rejects broken ones', () => {
    expect(defaultView.version).toBe(1)
    expect(() => parseViewConfig({ version: 1, colors: {}, superCategories: [{ members: [] }] })).toThrow()
  })
})
