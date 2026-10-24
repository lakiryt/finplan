import { describe, expect, it } from 'vitest'
import { parseCsv, parseDate } from './importers'
import { csv } from './testData'

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
