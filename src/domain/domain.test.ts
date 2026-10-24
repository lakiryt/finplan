import { describe, expect, it } from 'vitest'
import { monthRange, monthlyRows } from './aggregate'
import { addMonths, classify, splitAmount } from './classify'
import { defaultConfig, parseConfig } from './config'
import { parseCsv, parseDate } from './importers'
import { expenseRanking, rawExpenseByCategory, rawMonthlyRows } from './raw'
import { median, seriesStats } from './stats'
import type { ClassifyConfig, Rule } from './types'
import {
  colorsInUse,
  defaultView,
  detachCategory,
  displaySeries,
  mergeWithNext,
  moveCategory,
  parseViewConfig,
  reconcileGroups,
  resizeGroup,
  sortByTotal,
  ungroup,
  type CategoryGroup,
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

describe('view groups', () => {
  /** テスト用に決まった順でIDを作る */
  const ids = () => {
    let n = 0
    return () => `n${n++}`
  }
  const g = (id: string, members: string[], extra: Partial<CategoryGroup> = {}): CategoryGroup => ({ id, members, ...extra })
  const shape = (groups: CategoryGroup[]) => groups.map((x) => x.members.join('+'))

  // A B C D E がそれぞれ1件ずつ
  const singles = ['A', 'B', 'C', 'D', 'E'].map((c) => g(`c:${c}`, [c]))

  it('reconciles saved groups with the categories in the data', () => {
    const r = reconcileGroups([g('x', ['B', 'Z', 'C'], { label: 'まとめ' })], ['A', 'B', 'C', 'D'])
    expect(r).toEqual([g('x', ['B', 'C'], { label: 'まとめ' }), g('c:A', ['A']), g('c:D', ['D'])])
  })

  it('merges adjacent groups, keeping the upper name and color', () => {
    const groups = [g('x', ['A', 'B'], { label: '上', color: '#111111' }), g('y', ['C'], { label: 'C' })]
    expect(mergeWithNext(groups, 0)).toEqual([g('x', ['A', 'B', 'C'], { label: '上', color: '#111111' })])
    // 1件だけのグループの名前は引き継がない
    expect(mergeWithNext([g('a', ['A'], { label: 'A名' }), g('b', ['B'])], 0)).toEqual([g('a', ['A', 'B'])])
  })

  it('detaches a category, splitting the group around it', () => {
    const groups = [g('x', ['A', 'B', 'C'], { label: 'まとめ' }), g('y', ['D'])]
    expect(detachCategory(groups, 'B', ids())).toEqual([g('x', ['A'], { label: 'まとめ' }), g('n0', ['B']), g('n1', ['C']), g('y', ['D'])])
    // 先頭を切り離すと、名前は残りの側に残る
    expect(detachCategory(groups, 'A', ids())).toEqual([g('n0', ['A']), g('x', ['B', 'C'], { label: 'まとめ' }), g('y', ['D'])])
  })

  it('resizes a group by dragging its edge: absorbs covered rows and releases the rest', () => {
    const grown = resizeGroup(singles, 'c:B', 1, 3, ids())
    expect(shape(grown)).toEqual(['A', 'B+C+D', 'E'])
    expect(grown[1].id).toBe('c:B')
    const shrunk = resizeGroup(grown, 'c:B', 1, 1, ids())
    expect(shape(shrunk)).toEqual(['A', 'B', 'C', 'D', 'E'])
    // 他のグループの一部だけを覆った場合、そのグループの残りはそのまま
    const partial = resizeGroup([g('x', ['A']), g('y', ['B', 'C', 'D'], { label: 'Y' }), g('z', ['E'])], 'x', 0, 1, ids())
    expect(partial).toEqual([g('x', ['A', 'B']), g('y', ['C', 'D'], { label: 'Y' }), g('z', ['E'])])
  })

  it('moves a category: joins a group only when dropped inside it', () => {
    const groups = [g('x', ['A', 'B', 'C']), g('d', ['D'], { color: '#222222' }), g('e', ['E'])]
    // D を B の位置へ（下から上なので B の前）→ A と B の間に入り、x に加わる
    expect(shape(moveCategory(groups, 'D', 'B', ids()))).toEqual(['A+D+B+C', 'E'])
    // D を E の後ろへ → 1件だけのグループのまま（色も保つ）
    expect(moveCategory(groups, 'D', 'E', ids())).toEqual([g('x', ['A', 'B', 'C']), g('e', ['E']), g('d', ['D'], { color: '#222222' })])
    // A を C の位置へ（上から下なので C の後ろ）→ グループの端なので外れる
    expect(shape(moveCategory(groups, 'A', 'C', ids()))).toEqual(['B+C', 'A', 'D', 'E'])
  })

  it('ungroups and sorts by total while keeping groups together', () => {
    expect(shape(ungroup([g('x', ['A', 'B'])], 'x', ids()))).toEqual(['A', 'B'])
    const totals = new Map([['A', 1], ['B', 5], ['C', 2], ['D', 4]])
    expect(shape(sortByTotal([g('x', ['A', 'C']), g('b', ['B']), g('d', ['D'])], totals))).toEqual(['B', 'D', 'C+A'])
  })

  it('builds chart series per category or per group', () => {
    const groups = [g('x', ['A', 'B'], { label: 'まとめ' }), g('c', ['C'])]
    const colors = { A: '#aaaaaa', C: '#cccccc' }
    expect(displaySeries(groups, { useSuperCategories: false, colors }).map((s) => [s.label, s.color])).toEqual([
      ['A', '#aaaaaa'],
      ['B', undefined],
      ['C', '#cccccc'],
    ])
    expect(displaySeries(groups, { useSuperCategories: true, colors }).map((s) => [s.label, s.color])).toEqual([
      ['まとめ', undefined],
      ['C', '#cccccc'],
    ])
  })

  it('lists colors in use and parses configs (including v1)', () => {
    expect(colorsInUse({ version: 2, useSuperCategories: false, colors: { A: '#AA0000' }, groups: [g('x', ['B'], { color: '#aa0000' })] })).toEqual([
      '#aa0000',
    ])
    expect(defaultView.version).toBe(2)
    const migrated = parseViewConfig({ version: 1, colors: {}, superCategories: [{ id: 's', label: 'S', members: ['A', 'B'] }] })
    expect(migrated.groups).toEqual([{ id: 's', label: 'S', members: ['A', 'B'] }])
    expect(() => parseViewConfig({ version: 2, colors: {}, groups: [{ members: [] }] })).toThrow()
  })
})
