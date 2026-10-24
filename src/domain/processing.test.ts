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
  type ProcessingConfig,
} from './processing'
import { rawMonthlyRows } from './raw'
import { csv } from './testData'

const config: ProcessingConfig = {
  version: 1,
  modules: [
    { id: 'inc', type: 'excludeIncome', enabled: true, categories: ['回収'] },
    { id: 'exp', type: 'excludeExpense', enabled: true, categories: ['貯蓄', '家賃'] },
  ],
}

describe('processing', () => {
  const txs = parseCsv(csv).transactions

  it('excludes income and expense categories separately by sign', () => {
    const out = applyProcessing(txs, config)
    expect(out.map((t) => t.category)).toEqual(['食費', '食費', '給与', '食費'])
  })

  it('only excludes the matching sign', () => {
    // 同じカテゴリーでも、収入のカードは支出の取引を除かない
    const onlyIncome = updateModule(config, 'exp', { enabled: false })
    const mixed = [...txs, { id: 'x', date: '2026-01-01', amount: -100, memo: '', category: '回収' }]
    expect(applyProcessing(mixed, onlyIncome).filter((t) => t.category === '回収').map((t) => t.amount)).toEqual([-100])
  })

  it('ignores disabled cards and reports what is excluded', () => {
    const off = updateModule(updateModule(config, 'inc', { enabled: false }), 'exp', { enabled: false })
    expect(applyProcessing(txs, off)).toBe(txs)
    expect(excludedCategories(config).expense).toEqual(new Set(['貯蓄', '家賃']))
    expect(hasActiveModule(off, 'excludeIncome')).toBe(false)
    expect(hasActiveModule(config, 'excludeIncome')).toBe(true)
    expect(hasActiveModule(updateModule(config, 'inc', { categories: [] }), 'excludeIncome')).toBe(false)
  })

  it('parses configs', () => {
    expect(defaultProcessing.modules.map((m) => m.type)).toEqual(['excludeIncome', 'excludeExpense', 'offset'])
    expect(() => parseProcessingConfig({ version: 1, modules: [{ id: 'a', type: 'nope', categories: [] }] })).toThrow()
  })
})

describe('offset', () => {
  const txs = parseCsv(csv).transactions
  const offset: ProcessingConfig = {
    version: 1,
    modules: [
      { id: 'inc', type: 'excludeIncome', enabled: true, categories: ['回収'] },
      { id: 'off', type: 'offset', enabled: true, pairs: [{ from: '回収', to: '食費' }] },
    ],
  }

  it('turns income records into reductions of the chosen expense category, before exclusions', () => {
    const out = applyProcessing(txs, offset)
    const moved = out.find((t) => t.memo === '割り勘 半額')!
    expect(moved).toMatchObject({ category: '食費', side: 'expense', amount: 500 })
    const rows = rawMonthlyRows(out, '2026-03', '2026-03')
    // 3月: 食費 800 − 回収 500 = 300、収入は 0
    expect(rows[0]).toMatchObject({ expense: 300, income: 0 })
    expect(rows[0].byCategory.expense).toEqual({ 食費: 300 })
  })

  it('keeps the balance the same as leaving the record in income', () => {
    const balance = (list: typeof txs) => rawMonthlyRows(list, '2026-01', '2026-03').reduce((s, r) => s + r.income - r.expense, 0)
    expect(balance(applyProcessing(txs, offset))).toBe(balance(txs))
  })

  it('ignores pairs without a target and disabled cards', () => {
    expect(offsetTargets(updateModule(offset, 'off', { pairs: [{ from: '回収', to: '' }] })).size).toBe(0)
    expect(hasActiveModule(updateModule(offset, 'off', { enabled: false }), 'offset')).toBe(false)
    expect(hasActiveModule(offset, 'offset')).toBe(true)
  })

  it('adds cards missing from older saved configs', () => {
    const old = parseProcessingConfig({ version: 1, modules: [{ id: 'real-income', type: 'excludeIncome', enabled: true, categories: [] }] })
    expect(old.modules.map((m) => m.type)).toEqual(['excludeIncome', 'excludeExpense', 'offset'])
  })
})
