import { describe, expect, it } from 'vitest'
import { parseCsv } from './importers'
import {
  applyProcessing,
  defaultProcessing,
  excludedExpenses,
  hasActiveModule,
  incomeRules,
  parseProcessingConfig,
  setIncomeRule,
  updateModule,
  type IncomeModule,
  type ProcessingConfig,
} from './processing'
import { rawMonthlyRows } from './raw'
import { csv } from './testData'

const config: ProcessingConfig = {
  version: 1,
  modules: [
    { id: 'inc', type: 'income', enabled: true, rules: [{ category: '回収', action: 'exclude' }] },
    { id: 'exp', type: 'excludeExpense', enabled: true, categories: ['貯蓄', '家賃'] },
  ],
}
const withRules = (rules: IncomeModule['rules']): ProcessingConfig => updateModule(config, 'inc', { rules })

describe('processing', () => {
  const txs = parseCsv(csv).transactions

  it('excludes income and expense categories separately by sign', () => {
    const out = applyProcessing(txs, config)
    expect(out.map((t) => t.category)).toEqual(['食費', '食費', '給与', '食費'])
  })

  it('only applies income rules to income records', () => {
    // 同じカテゴリーでも、収入側の扱いは支出の取引には効かない
    const mixed = [...txs, { id: 'x', date: '2026-01-01', amount: -100, memo: '', category: '回収' }]
    expect(applyProcessing(mixed, updateModule(config, 'exp', { enabled: false })).filter((t) => t.category === '回収').map((t) => t.amount)).toEqual([-100])
  })

  it('ignores disabled cards and reports what is applied', () => {
    const off = updateModule(updateModule(config, 'inc', { enabled: false }), 'exp', { enabled: false })
    expect(applyProcessing(txs, off)).toBe(txs)
    expect(excludedExpenses(config)).toEqual(new Set(['貯蓄', '家賃']))
    expect(incomeRules(off).size).toBe(0)
    expect(hasActiveModule(off, 'income')).toBe(false)
    expect(hasActiveModule(config, 'income')).toBe(true)
    expect(hasActiveModule(withRules([]), 'income')).toBe(false)
  })

  it('parses configs and fills in missing cards', () => {
    expect(defaultProcessing.modules.map((m) => m.type)).toEqual(['income', 'excludeExpense'])
    const partial = parseProcessingConfig({ version: 1, modules: [{ id: 'e', type: 'excludeExpense', enabled: true, categories: [] }] })
    expect(partial.modules.map((m) => m.type)).toEqual(['excludeExpense', 'income'])
    expect(() => parseProcessingConfig({ version: 1, modules: [{ id: 'a', type: 'nope' }] })).toThrow()
  })
})

describe('offset (相殺)', () => {
  const txs = parseCsv(csv).transactions
  const offset = withRules([{ category: '回収', action: 'offset', to: '食費' }])

  it('turns income records into reductions of the chosen expense category', () => {
    const out = applyProcessing(txs, offset)
    expect(out.find((t) => t.memo === '割り勘 半額')).toMatchObject({ category: '食費', side: 'expense', amount: 500 })
    const rows = rawMonthlyRows(out, '2026-03', '2026-03')
    // 3月: 食費 800 − 回収 500 = 300、収入は 0
    expect(rows[0]).toMatchObject({ expense: 300, income: 0 })
    expect(rows[0].byCategory.expense).toEqual({ 食費: 300 })
  })

  it('keeps the balance the same as leaving the record in income, unlike excluding it', () => {
    const balance = (list: typeof txs) => rawMonthlyRows(list, '2026-01', '2026-03').reduce((s, r) => s + r.income - r.expense, 0)
    const noExpenseCard = (c: ProcessingConfig) => updateModule(c, 'exp', { enabled: false })
    expect(balance(applyProcessing(txs, noExpenseCard(offset)))).toBe(balance(txs))
    // 除くだけだと、回収した額だけ収支が少なく出る
    expect(balance(applyProcessing(txs, noExpenseCard(config)))).toBe(balance(txs) - 500)
  })

  it('does nothing until a target is chosen, and drops offsets into excluded expenses', () => {
    expect(applyProcessing(txs, updateModule(withRules([{ category: '回収', action: 'offset', to: '' }]), 'exp', { enabled: false }))).toEqual(txs)
    const toExcluded = withRules([{ category: '回収', action: 'offset', to: '貯蓄' }])
    expect(applyProcessing(txs, toExcluded).some((t) => t.memo === '割り勘 半額')).toBe(false)
  })

  it('sets one treatment per category', () => {
    const m = offset.modules[0] as IncomeModule
    expect(setIncomeRule(m, '回収', { category: '回収', action: 'exclude' })).toEqual([{ category: '回収', action: 'exclude' }])
    expect(setIncomeRule(m, '回収', null)).toEqual([])
  })
})

describe('migration from separate income / offset cards', () => {
  it('merges exclusions and offsets into one income card, preferring offsets', () => {
    const c = parseProcessingConfig({
      version: 1,
      modules: [
        { id: 'real-income', type: 'excludeIncome', enabled: true, categories: ['出金', '回収'] },
        { id: 'real-expense', type: 'excludeExpense', enabled: true, categories: [] },
        { id: 'offset', type: 'offset', enabled: true, pairs: [{ from: '回収', to: '外食' }] },
      ],
    })
    expect(c.modules.map((m) => m.type)).toEqual(['income', 'excludeExpense'])
    expect(c.modules[0]).toEqual({
      id: 'real-income',
      type: 'income',
      enabled: true,
      rules: [
        { category: '出金', action: 'exclude' },
        { category: '回収', action: 'offset', to: '外食' },
      ],
    })
  })

  it('only carries over cards that were enabled', () => {
    const c = parseProcessingConfig({
      version: 1,
      modules: [
        { id: 'real-income', type: 'excludeIncome', enabled: true, categories: ['出金'] },
        { id: 'offset', type: 'offset', enabled: false, pairs: [{ from: '回収', to: '' }] },
      ],
    })
    expect((c.modules[0] as IncomeModule).rules).toEqual([{ category: '出金', action: 'exclude' }])
  })
})
