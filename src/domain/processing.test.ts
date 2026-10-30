import { describe, expect, it } from 'vitest'
import { parseCsv } from './importers'
import {
  applyProcessing,
  defaultProcessing,
  activeRules,
  addsNothing,
  hasCriteria,
  isLocked,
  isProcessed,
  whollyExcluded,
  matches,
  outcomeOf,
  parseProcessingConfig,
  processedAmounts,
  recordKey,
  ruleEffect,
  rulesAhead,
  UNASSIGNED_OFFSET,
  type Condition,
  type ProcessingConfig,
} from './processing'
import { rawMonthlyRows } from './raw'
import { csv } from './testData'

const txs = parseCsv(csv).transactions
const rows = (list: typeof txs) => rawMonthlyRows(list, '2026-01', '2026-03')
const balance = (list: typeof txs) => rows(list).reduce((s, r) => s + r.income - r.expense, 0)
const byMemo = (list: typeof txs, memo: string) => list.find((t) => t.memo === memo)

const allOn = { offset: true, exclude: true }
/** offset の target は差し引く先のカテゴリー名（null なら指定しない） */
const config = (exclude: { when: Condition }[] = [], offset: { when: Condition; target: string | null }[] = []): ProcessingConfig => ({
  version: 3,
  rules: [
    ...offset.map((r, i) => ({ id: `o${i}`, enabled: true, when: r.when, target: { category: r.target } })),
    ...exclude.map((r, i) => ({ id: `e${i}`, enabled: true, target: null, ...r })),
  ],
  enabled: { income: allOn, expense: allOn },
})

describe('conditions', () => {
  const super1 = txs[0] // -1000 2026/01/05 スーパー 食費

  it('matches by side, category, memo (text or regex) and period', () => {
    expect(matches({ side: 'expense', category: '食費' }, super1)).toBe(true)
    expect(matches({ side: 'income', category: '食費' }, super1)).toBe(false)
    expect(matches({ side: 'expense', memo: 'スー' }, super1)).toBe(true)
    expect(matches({ side: 'expense', memo: '^スーパー$', memoIsRegex: true }, super1)).toBe(true)
    expect(matches({ side: 'expense', memo: '(', memoIsRegex: true }, super1)).toBe(false)
    expect(matches({ side: 'expense', category: '食費', from: '2026-02-01' }, super1)).toBe(false)
    expect(matches({ side: 'expense', category: '食費', to: '2026-01-05' }, super1)).toBe(true)
  })

  it('matches records picked by their contents, regardless of the CSV row', () => {
    const picked: Condition = { side: 'expense', records: [recordKey(super1)] }
    expect(matches(picked, super1)).toBe(true)
    // 書き出し直して行がずれても（id が違っても）、中身が同じなら同じ記録
    expect(matches(picked, { ...super1, id: '99' })).toBe(true)
    expect(matches(picked, { ...super1, memo: 'スーパー（書き換え）' })).toBe(false)
    expect(matches(picked, byMemo(txs, '携帯1月')!)).toBe(false)
    expect(hasCriteria({ side: 'expense', records: [] })).toBe(false)
    expect(parseProcessingConfig(config([{ when: picked }])).rules[0].when).toEqual(picked)
  })

  it('treats a condition with only a side as inactive', () => {
    expect(hasCriteria({ side: 'expense' })).toBe(false)
    expect(matches({ side: 'expense' }, super1)).toBe(false)
    expect(activeRules(config([{ when: { side: 'expense' } }]))).toEqual([])
  })
})

describe('exclude', () => {
  it('drops matching records from their side only', () => {
    const out = applyProcessing(txs, config([{ when: { side: 'expense', category: '貯蓄' } }, { when: { side: 'income', category: '回収' } }]))
    expect(out.map((t) => t.category)).toEqual(['食費', '食費', '給与', '食費', '家賃', '家賃'])
  })

  it('can target part of a category by memo', () => {
    // 家賃のカテゴリーのうち、宿泊だけを除く
    const out = applyProcessing(txs, config([{ when: { side: 'expense', category: '家賃', memo: '泊' } }]))
    expect(byMemo(out, 'ホテル2泊')).toBeUndefined()
    expect(byMemo(out, '家賃')).toBeDefined()
  })

  it('ignores disabled rules and disabled sections (side × kind)', () => {
    const c = config([{ when: { side: 'expense', category: '貯蓄' } }])
    expect(applyProcessing(txs, { ...c, enabled: { ...c.enabled, expense: { offset: true, exclude: false } } })).toBe(txs)
    expect(applyProcessing(txs, { ...c, enabled: { ...c.enabled, income: { offset: false, exclude: false } } })).not.toBe(txs)
    expect(applyProcessing(txs, { ...c, rules: [{ ...c.rules[0], enabled: false }] })).toBe(txs)
  })
})

describe('offset', () => {
  it('income → expense: subtracts reimbursements from the chosen expense, keeping the balance', () => {
    const out = applyProcessing(txs, config([], [{ when: { side: 'income', category: '回収' }, target: '食費' }]))
    expect(byMemo(out, '割り勘 半額')).toMatchObject({ category: '食費', side: 'expense', amount: 500 })
    // 3月: 食費 800 − 回収 500 = 300、収入は 0
    expect(rows(out)[2]).toMatchObject({ expense: 300, income: 0 })
    expect(balance(out)).toBe(balance(txs))
    // 除外だけだと、回収した額だけ収支が少なく出る
    expect(balance(applyProcessing(txs, config([{ when: { side: 'income', category: '回収' } }])))).toBe(balance(txs) - 500)
  })

  it('expense → income: removes rent from expenses and subtracts it from income, keeping the balance', () => {
    const out = applyProcessing(txs, config([], [{ when: { side: 'expense', category: '家賃', memo: '家賃' }, target: '給与' }]))
    expect(rows(out)[0].byCategory.expense.家賃).toBeUndefined()
    expect(rows(out)[0].byCategory.income.給与).toBe(140000)
    expect(balance(out)).toBe(balance(txs))
  })

  it('can subtract into the blank category, or from the whole other side when no target is chosen', () => {
    const blank = applyProcessing(txs, config([], [{ when: { side: 'income', category: '回収' }, target: '' }]))
    expect(byMemo(blank, '割り勘 半額')).toMatchObject({ category: '', side: 'expense' })
    const unassigned = applyProcessing(txs, config([], [{ when: { side: 'income', category: '回収' }, target: null }]))
    expect(byMemo(unassigned, '割り勘 半額')).toMatchObject({ category: UNASSIGNED_OFFSET, side: 'expense' })
    expect(balance(unassigned)).toBe(balance(txs))
  })

  it('takes priority over exclusion, and is dropped when the target is excluded', () => {
    const both = config([{ when: { side: 'income', category: '回収' } }], [{ when: { side: 'income', category: '回収' }, target: '食費' }])
    expect(outcomeOf(byMemo(txs, '割り勘 半額')!, both).kind).toBe('offset')
    // 相殺を後に並べても、相殺が優先
    expect(outcomeOf(byMemo(txs, '割り勘 半額')!, { ...both, rules: [...both.rules].reverse() }).kind).toBe('offset')
    const intoExcluded = config([{ when: { side: 'expense', category: '貯蓄' } }], [{ when: { side: 'income', category: '回収' }, target: '貯蓄' }])
    expect(byMemo(applyProcessing(txs, intoExcluded), '割り勘 半額')).toBeUndefined()
  })
})

describe('records whose handling is already decided', () => {
  const rent = byMemo(txs, 'ホテル2泊')!
  const excluded = config([{ when: { side: 'expense', category: '家賃' } }])
  const offset = config([], [{ when: { side: 'expense', category: '家賃' }, target: '給与' }])

  it('adds nothing to exclude an excluded record, but offsetting it takes effect', () => {
    expect(addsNothing(outcomeOf(rent, excluded), 'exclude')).toBe(true)
    expect(addsNothing(outcomeOf(rent, excluded), 'offset')).toBe(false)
  })

  it('adds nothing to an offset record, and free records can take either', () => {
    expect(addsNothing(outcomeOf(rent, offset), 'exclude')).toBe(true)
    expect(addsNothing(outcomeOf(rent, offset), 'offset')).toBe(true)
    expect(addsNothing(outcomeOf(rent, config()), 'exclude')).toBe(false)
  })
})

describe('what a new or edited rule would change', () => {
  const hotel = byMemo(txs, 'ホテル2泊')!
  const rent = byMemo(txs, '家賃')!
  const excludeRent = { when: { side: 'expense', category: '家賃' } } as const
  const offsetHotel = { when: { side: 'expense', memo: '泊' }, target: '給与' } as const

  it('locks records by the kind of rule being added', () => {
    const c = config([excludeRent], [offsetHotel])
    expect(isLocked(rent, c, 'exclude')).toBe(true)
    expect(isLocked(rent, c, 'offset')).toBe(false)
    expect(isLocked(hotel, c, 'exclude')).toBe(true)
    expect(isLocked(hotel, c, 'offset')).toBe(true)
  })

  it('does not count the rule being edited against itself', () => {
    const c = config([excludeRent])
    expect(isLocked(rent, c, 'exclude', 'e0')).toBe(false)
    // 無効の条件や無効の区分は、数えない
    expect(isLocked(rent, { ...c, rules: [{ ...c.rules[0], enabled: false }] }, 'exclude')).toBe(false)
    expect(isLocked(rent, { ...c, enabled: { ...c.enabled, expense: { offset: true, exclude: false } } }, 'exclude')).toBe(false)
  })

  it('treats only earlier offsets as winning over an edited offset', () => {
    const c = config([], [offsetHotel, { when: { side: 'expense', category: '家賃' }, target: '給与' }])
    // 先の相殺は、後ろの相殺に負けない
    expect(isLocked(hotel, c, 'offset', 'o0')).toBe(false)
    expect(isLocked(hotel, c, 'offset', 'o1')).toBe(true)
    expect(rulesAhead(c, 'offset', 'o0').rules).toEqual([])
    // 除外は、後ろの相殺にも負ける
    expect(rulesAhead(c, 'exclude').rules).toHaveLength(2)
  })

  it('reports what a rule hits and what it actually changes', () => {
    const c = config([{ when: { side: 'expense', memo: '泊' } }])
    expect(ruleEffect(txs, c, excludeRent.when, 'exclude')).toEqual({ count: 2, total: 68_000, changedCount: 1, changedTotal: 60_000 })
    expect(ruleEffect(txs, c, excludeRent.when, 'offset')).toEqual({ count: 2, total: 68_000, changedCount: 2, changedTotal: 68_000 })
    expect(ruleEffect(txs, c, { side: 'expense' }, 'exclude').count).toBe(0)
  })

  it('reports the change that saving really makes to the expense total', () => {
    const c = config([{ when: { side: 'expense', memo: '泊' } }])
    const { changedTotal } = ruleEffect(txs, c, excludeRent.when, 'exclude')
    const after = config([{ when: { side: 'expense', memo: '泊' } }, excludeRent])
    const expense = (list: typeof txs) => rows(list).reduce((s, r) => s + r.expense, 0)
    expect(expense(applyProcessing(txs, c)) - expense(applyProcessing(txs, after))).toBe(changedTotal)
  })

  it('picks records by key, and counts identical records together', () => {
    const twin = { ...rent, id: '99' }
    const when: Condition = { side: 'expense', records: [recordKey(rent)] }
    expect(ruleEffect([rent, twin, hotel], config(), when, 'exclude')).toMatchObject({ count: 2, total: 120_000 })
  })
})

describe('overlapping rules', () => {
  const total = (c: ProcessingConfig, side: 'income' | 'expense') => [...processedAmounts(txs, c)[side].values()]
  const sum = (list: { excluded: number; offset: number }[], key: 'excluded' | 'offset') => list.reduce((s, a) => s + a[key], 0)
  const broad = { when: { side: 'expense', category: '家賃' } } as const
  const narrow = { when: { side: 'expense', memo: '泊' } } as const

  it('counts a record hit by two exclusions once, in totals and in the balance', () => {
    const one = config([broad])
    const both = config([broad, narrow])
    expect(rows(applyProcessing(txs, both))).toEqual(rows(applyProcessing(txs, one)))
    expect(sum(total(both, 'expense'), 'excluded')).toBe(68_000)
  })

  it('keeps the same result in either order, and the other rule takes over when one is turned off', () => {
    const both = config([broad, narrow])
    expect(rows(applyProcessing(txs, { ...both, rules: [...both.rules].reverse() }))).toEqual(rows(applyProcessing(txs, both)))
    const broadOff = { ...both, rules: both.rules.map((r) => (r.id === 'e0' ? { ...r, enabled: false } : r)) }
    expect(sum(total(broadOff, 'expense'), 'excluded')).toBe(8_000)
    expect(byMemo(applyProcessing(txs, broadOff), '家賃')).toBeDefined()
  })

  it('lets one offset win inside a wholly excluded category, and excludes the rest', () => {
    const c = config([broad], [{ when: { side: 'expense', memo: '泊' }, target: '給与' }])
    expect(total(c, 'expense')).toEqual([{ excluded: 60_000, offset: 8_000 }])
    // 収支が変わるのは除外した分だけ（支出を除くので 60,000 増える）
    expect(balance(applyProcessing(txs, c))).toBe(balance(txs) + 60_000)
  })

  it('follows the exclusion dynamically: an offset into a category that gets excluded later works like an exclusion', () => {
    const offset = { when: { side: 'income', category: '回収' }, target: '貯蓄' } as const
    const c = config([{ when: { side: 'expense', category: '貯蓄' } }], [offset])
    expect(balance(applyProcessing(txs, c))).toBe(balance(txs) + 50_000 - 500)
    // 除外の区分を切ると、相殺に戻る
    const off = { ...c, enabled: { ...c.enabled, expense: { offset: true, exclude: false } } }
    expect(balance(applyProcessing(txs, off))).toBe(balance(txs))
  })

  it('reports amounts that explain the balance: balance after = before − excluded income + excluded expense', () => {
    const cases = [
      config([broad, narrow]),
      config([broad], [{ when: { side: 'expense', memo: '泊' }, target: '給与' }]),
      config([{ when: { side: 'expense', category: '貯蓄' } }], [{ when: { side: 'income', category: '回収' }, target: '貯蓄' }]),
      config([{ when: { side: 'income', category: '回収' } }], [{ when: { side: 'income', category: '回収' }, target: '食費' }]),
    ]
    for (const c of cases) {
      const after = balance(applyProcessing(txs, c))
      expect(after).toBe(balance(txs) - sum(total(c, 'income'), 'excluded') + sum(total(c, 'expense'), 'excluded'))
    }
  })
})

describe('summaries and parsing', () => {
  it('lists categories excluded as a whole (offsetting into them would equal excluding)', () => {
    const c = config([{ when: { side: 'expense', category: '貯蓄' } }, { when: { side: 'expense', category: '家賃', memo: '泊' } }])
    expect([...whollyExcluded(c, 'expense')]).toEqual(['貯蓄'])
    expect([...whollyExcluded(c, 'income')]).toEqual([])
    expect([...whollyExcluded({ ...c, enabled: { ...c.enabled, expense: { offset: true, exclude: false } } }, 'expense')]).toEqual([])
  })

  it('reports processed amounts per category and side', () => {
    const c = config([{ when: { side: 'expense', category: '家賃', memo: '泊' } }], [{ when: { side: 'income', category: '回収' }, target: '食費' }])
    const amounts = processedAmounts(txs, c)
    expect(amounts.expense.get('家賃')).toEqual({ excluded: 8000, offset: 0 })
    expect(amounts.income.get('回収')).toEqual({ excluded: 0, offset: 500 })
    expect(isProcessed(c, 'income')).toBe(true)
    expect(isProcessed(config([{ when: { side: 'expense', category: '貯蓄' } }]), 'income')).toBe(false)
  })

  it('parses configs and rejects broken ones', () => {
    expect(defaultProcessing).toEqual(config())
    // target が無い条件は除外、区分の有効・無効が無ければ有効
    expect(parseProcessingConfig({ version: 3, rules: [{ id: 'e0', enabled: true, when: { side: 'income', category: '回収' } }] })).toEqual(config([{ when: { side: 'income', category: '回収' } }]))
    // 差し引く先の「指定なし」（category: null）と空欄のカテゴリー（''）を区別して読み込む
    const targets = config([], [{ when: { side: 'income', category: '回収' }, target: null }, { when: { side: 'income', category: '回収' }, target: '' }])
    expect(parseProcessingConfig(JSON.parse(JSON.stringify(targets)))).toEqual(targets)
    expect(() => parseProcessingConfig({ version: 3, rules: [{ id: 'a', when: { side: 'x' } }] })).toThrow()
    expect(() => parseProcessingConfig({ version: 2, exclude: { rules: [] }, offset: { rules: [] } })).toThrow()
  })
})
