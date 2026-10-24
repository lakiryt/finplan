import { describe, expect, it } from 'vitest'
import { parseCsv } from './importers'
import { applyProcessing, defaultProcessing, excludedCategories, hasActiveModule, parseProcessingConfig, updateModule, type ProcessingConfig } from './processing'
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
    expect(defaultProcessing.modules.map((m) => m.type)).toEqual(['excludeIncome', 'excludeExpense'])
    expect(() => parseProcessingConfig({ version: 1, modules: [{ id: 'a', type: 'nope', categories: [] }] })).toThrow()
  })
})
