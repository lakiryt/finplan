import { describe, expect, it } from 'vitest'
import { parseCsv } from './importers'
import {
  applyProcessing,
  defaultProcessing,
  hasCriteria,
  isProcessed,
  isStepActive,
  matches,
  outcomeOf,
  parseProcessingConfig,
  processedAmounts,
  recordKey,
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

const config = (
  exclude: { when: Condition }[] = [],
  offset: { when: Condition; target: string }[] = [],
): ProcessingConfig => ({
  version: 2,
  exclude: { enabled: true, rules: exclude.map((r, i) => ({ id: `e${i}`, enabled: true, ...r })) },
  offset: { enabled: true, rules: offset.map((r, i) => ({ id: `o${i}`, enabled: true, ...r })) },
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
    expect(parseProcessingConfig(config([{ when: picked }])).exclude.rules[0].when).toEqual(picked)
  })

  it('treats a condition with only a side as inactive', () => {
    expect(hasCriteria({ side: 'expense' })).toBe(false)
    expect(matches({ side: 'expense' }, super1)).toBe(false)
    expect(isStepActive(config([{ when: { side: 'expense' } }]).exclude)).toBe(false)
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

  it('ignores disabled rules and disabled steps', () => {
    const c = config([{ when: { side: 'expense', category: '貯蓄' } }])
    expect(applyProcessing(txs, { ...c, exclude: { ...c.exclude, enabled: false } })).toBe(txs)
    expect(applyProcessing(txs, { ...c, exclude: { ...c.exclude, rules: [{ ...c.exclude.rules[0], enabled: false }] } })).toBe(txs)
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

  it('subtracts from the whole other side when no target is chosen', () => {
    const out = applyProcessing(txs, config([], [{ when: { side: 'income', category: '回収' }, target: '' }]))
    expect(byMemo(out, '割り勘 半額')).toMatchObject({ category: UNASSIGNED_OFFSET, side: 'expense' })
  })

  it('takes priority over exclusion, and is dropped when the target is excluded', () => {
    const both = config([{ when: { side: 'income', category: '回収' } }], [{ when: { side: 'income', category: '回収' }, target: '食費' }])
    expect(outcomeOf(byMemo(txs, '割り勘 半額')!, both).kind).toBe('offset')
    const intoExcluded = config([{ when: { side: 'expense', category: '貯蓄' } }], [{ when: { side: 'income', category: '回収' }, target: '貯蓄' }])
    expect(byMemo(applyProcessing(txs, intoExcluded), '割り勘 半額')).toBeUndefined()
  })
})

describe('summaries and parsing', () => {
  it('reports processed amounts per category and side', () => {
    const c = config([{ when: { side: 'expense', category: '家賃', memo: '泊' } }], [{ when: { side: 'income', category: '回収' }, target: '' }])
    const amounts = processedAmounts(txs, c)
    expect(amounts.expense.get('家賃')).toEqual({ excluded: 8000, offset: 0 })
    expect(amounts.income.get('回収')).toEqual({ excluded: 0, offset: 500 })
    expect(isProcessed(c, 'income')).toBe(true)
    expect(isProcessed(config([{ when: { side: 'expense', category: '貯蓄' } }]), 'income')).toBe(false)
  })

  it('parses configs and rejects broken ones', () => {
    expect(defaultProcessing).toEqual({ version: 2, exclude: { enabled: false, rules: [] }, offset: { enabled: false, rules: [] } })
    expect(() => parseProcessingConfig({ version: 2, exclude: { rules: [{ id: 'a', when: { side: 'x' } }] }, offset: { rules: [] } })).toThrow()
    expect(() => parseProcessingConfig({ version: 1, modules: [] })).toThrow()
  })
})
