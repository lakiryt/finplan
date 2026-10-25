import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TAKE_HOME,
  employeeShare,
  healthInsurance,
  parseTakeHomeInput,
  pensionStandardMonthly,
  residentTax,
  standardMonthly,
  takeHome,
  type TakeHomeInput,
} from './takeHome'

const input = (patch: (i: TakeHomeInput) => TakeHomeInput) => patch(structuredClone(DEFAULT_TAKE_HOME))

describe('social insurance', () => {
  it('finds the standard monthly remuneration, clamped for pension', () => {
    expect(standardMonthly(50_000)).toBe(58_000)
    expect(standardMonthly(145_999)).toBe(142_000)
    expect(standardMonthly(150_000)).toBe(150_000)
    expect(pensionStandardMonthly(50_000)).toBe(88_000)
    expect(pensionStandardMonthly(700_000)).toBe(650_000)
  })

  it('rounds the employee share: 50 sen or less down, more than 50 sen up', () => {
    expect(employeeShare(150_000, 9.9)).toBe(7_425)
    expect(employeeShare(150_000, 10.13)).toBe(7_597) // 7,597.5
    expect(employeeShare(118_000, 10.13)).toBe(5_977) // 5,976.7
    expect(employeeShare(144_000, 0.5, false)).toBe(720)
  })

  it('computes national health insurance from salary income − 430,000', () => {
    // 月15万円 → 年180万円 → 給与所得106万円 → 所得割の元63万円
    const h = healthInsurance(input((i) => ({ ...i, health: { ...i.health, mode: 'national' } })), 150_000)
    expect(h.annual).toBe(94_900 + 35_200 + 3_500)
    const reduced = healthInsurance(input((i) => ({ ...i, health: { ...i.health, mode: 'national', reduction: 0.5 } })), 150_000)
    expect(reduced.annual).toBeLessThan(h.annual)
  })
})

describe('resident tax', () => {
  it('computes the income levy with the adjustment credit, and the per-capita levy', () => {
    // 給与所得126万円 − 43万円 = 83万円 → 市 48,300 + 県 32,200 + 均等割 5,000
    expect(residentTax(2_000_000, 0, 'r8', 5_000, 1)).toMatchObject({ taxable: 830_000, incomeLevy: 80_500, total: 85_500 })
  })

  it('is exempt at or below 450,000 of income (grade 1)', () => {
    expect(residentTax(1_190_000, 0, 'r8', 5_000, 1).total).toBe(0)
    expect(residentTax(1_200_000, 0, 'r8', 5_000, 1).total).toBe(1_500 + 5_000)
    // 3級地は均等割のかからない線が低い
    expect(residentTax(1_190_000, 0, 'r8', 5_000, 3).perCapitaLevy).toBe(5_000)
  })
})

describe('take-home', () => {
  it('subtracts only the included items, and deducts only included insurance from taxes', () => {
    const all = takeHome(DEFAULT_TAKE_HOME)
    const noHealth = takeHome(input((i) => ({ ...i, health: { ...i.health, include: false } })))
    expect(noHealth.socialInsurance).toBe(all.socialInsurance - all.health.annual)
    expect(noHealth.incomeTax.total).toBeGreaterThanOrEqual(all.incomeTax.total)
    const nothing = takeHome(
      input((i) => ({
        ...i,
        incomeTax: { include: false },
        residentTax: { ...i.residentTax, include: false },
        health: { ...i.health, include: false },
        pension: { ...i.pension, include: false },
        employment: { ...i.employment, include: false },
      })),
    )
    expect(nothing.takeHomeMonthly).toBe(nothing.monthlyPay)
  })

  it('uses a manual resident tax amount (e.g. from last year’s income)', () => {
    const r = takeHome(input((i) => ({ ...i, residentTax: { ...i.residentTax, mode: 'manual', manualAnnual: 120_000 } })))
    expect(r.items.residentTax.annual).toBe(120_000)
    expect(r.residentTax).toBeNull()
  })

  it('restores saved input onto the defaults', () => {
    expect(parseTakeHomeInput(null)).toEqual(DEFAULT_TAKE_HOME)
    const saved = parseTakeHomeInput({ wage: { hourly: 1500, nightHourly: 2000 }, health: { mode: 'national', national: [] } })
    expect(saved.wage).toEqual({ hourly: 1500, hours: 120, nightHours: 0, nightHourly: 2000 })
    expect(saved.health.mode).toBe('national')
    expect(saved.health.national).toEqual(DEFAULT_TAKE_HOME.health.national)
  })
})
