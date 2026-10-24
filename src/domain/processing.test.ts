import { describe, expect, it } from 'vitest'
import { parseCsv } from './importers'
import {
  applyProcessing,
  defaultProcessing,
  excludedCategories,
  hasActiveModule,
  offsetTargets,
  parseProcessingConfig,
  updateModule,
  UNASSIGNED_OFFSET,
  type ProcessingConfig,
} from './processing'
import { rawMonthlyRows } from './raw'
import { csv } from './testData'

const config: ProcessingConfig = {
  version: 1,
  modules: [
    { id: 'inc', type: 'excludeIncome', enabled: true, categories: ['回収'] },
    { id: 'exp', type: 'excludeExpense', enabled: true, categories: ['貯蓄', '家賃'] },
    { id: 'off', type: 'offset', enabled: false, pairs: [] },
  ],
}
const withOffset = (to: string, base = config, on = true) => updateModule(base, 'off', { enabled: true, pairs: [{ from: '回収', enabled: on, to }] })
const noExpenseCard = (c: ProcessingConfig) => updateModule(c, 'exp', { enabled: false })

describe('processing', () => {
  const txs = parseCsv(csv).transactions

  it('excludes income and expense categories separately by sign', () => {
    const out = applyProcessing(txs, config)
    expect(out.map((t) => t.category)).toEqual(['食費', '食費', '給与', '食費'])
  })

  it('only excludes the matching sign', () => {
    // 同じカテゴリーでも、収入のカードは支出の取引を除かない
    const mixed = [...txs, { id: 'x', date: '2026-01-01', amount: -100, memo: '', category: '回収' }]
    expect(applyProcessing(mixed, noExpenseCard(config)).filter((t) => t.category === '回収').map((t) => t.amount)).toEqual([-100])
  })

  it('ignores disabled cards and reports what is excluded', () => {
    const off = updateModule(noExpenseCard(config), 'inc', { enabled: false })
    expect(applyProcessing(txs, off)).toBe(txs)
    expect(excludedCategories(config).expense).toEqual(new Set(['貯蓄', '家賃']))
    expect(hasActiveModule(off, 'excludeIncome')).toBe(false)
    expect(hasActiveModule(config, 'excludeIncome')).toBe(true)
    expect(hasActiveModule(updateModule(config, 'inc', { categories: [] }), 'excludeIncome')).toBe(false)
  })

  it('parses configs and rejects unknown cards', () => {
    expect(defaultProcessing.modules.map((m) => m.type)).toEqual(['excludeIncome', 'excludeExpense', 'offset'])
    expect(() => parseProcessingConfig({ version: 1, modules: [{ id: 'a', type: 'nope' }] })).toThrow()
  })
})

describe('offset (相殺)', () => {
  const txs = parseCsv(csv).transactions
  const balance = (list: typeof txs) => rawMonthlyRows(list, '2026-01', '2026-03').reduce((s, r) => s + r.income - r.expense, 0)

  it('subtracts an excluded income category from the chosen expense category', () => {
    const out = applyProcessing(txs, withOffset('食費'))
    expect(out.find((t) => t.memo === '割り勘 半額')).toMatchObject({ category: '食費', side: 'expense', amount: 500 })
    const rows = rawMonthlyRows(out, '2026-03', '2026-03')
    // 3月: 食費 800 − 回収 500 = 300、収入は 0
    expect(rows[0]).toMatchObject({ expense: 300, income: 0 })
    expect(rows[0].byCategory.expense).toEqual({ 食費: 300 })
  })

  it('keeps the balance the same as no processing, while excluding alone makes it smaller', () => {
    expect(balance(applyProcessing(txs, noExpenseCard(withOffset('食費'))))).toBe(balance(txs))
    expect(balance(applyProcessing(txs, noExpenseCard(config)))).toBe(balance(txs) - 500)
  })

  it('only applies to categories excluded by the income card', () => {
    // 実収入のカードで除いていなければ、相殺も効かない（相殺は「除く」の一種）
    const notExcluded = withOffset('食費', updateModule(config, 'inc', { categories: [] }))
    expect(offsetTargets(notExcluded).size).toBe(0)
    expect(applyProcessing(txs, noExpenseCard(notExcluded)).find((t) => t.memo === '割り勘 半額')?.category).toBe('回収')
    expect(hasActiveModule(withOffset('食費', updateModule(config, 'inc', { enabled: false })), 'offset')).toBe(false)
  })

  it('just excludes when the row is unchecked, keeping the chosen target', () => {
    const unchecked = withOffset('食費', config, false)
    expect(offsetTargets(unchecked).size).toBe(0)
    expect(applyProcessing(txs, unchecked).some((t) => t.memo === '割り勘 半額')).toBe(false)
  })

  it('subtracts from the whole expense when no target is chosen, and drops offsets into excluded expenses', () => {
    const unassigned = applyProcessing(txs, withOffset(''))
    expect(unassigned.find((t) => t.memo === '割り勘 半額')).toMatchObject({ category: UNASSIGNED_OFFSET, side: 'expense' })
    expect(balance(applyProcessing(txs, noExpenseCard(withOffset(''))))).toBe(balance(txs))
    expect(hasActiveModule(withOffset(''), 'offset')).toBe(true)
    expect(applyProcessing(txs, withOffset('貯蓄')).some((t) => t.memo === '割り勘 半額')).toBe(false)
  })
})
