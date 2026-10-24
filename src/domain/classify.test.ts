import { describe, expect, it } from 'vitest'
import { addMonths, classify, splitAmount } from './classify'
import { defaultConfig, parseConfig } from './config'
import { parseCsv } from './importers'
import { config, csv, rule } from './testData'

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
