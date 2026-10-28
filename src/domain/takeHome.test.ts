import { describe, expect, it } from 'vitest'
import {
  addJob,
  DEFAULT_JOB,
  DEFAULT_TAKE_HOME,
  employeeShare,
  healthInsurance,
  jobPay,
  parseTakeHomeInput,
  pensionStandardMonthly,
  residentTax,
  standardBonuses,
  standardMonthly,
  takeHome,
  type Job,
  type TakeHomeInput,
} from './takeHome'

const input = (patch: (i: TakeHomeInput) => TakeHomeInput) => patch(structuredClone(DEFAULT_TAKE_HOME))
const job = (patch: Partial<Job>): Job => ({ ...structuredClone(DEFAULT_JOB), ...patch })
/** 月給だけの職（賞与なし） */
const monthlyJob = (monthly: number, patch: Partial<Job> = {}) => job({ payMode: 'salary', salary: { monthly, bonus: 0, bonusTimes: 0 }, ...patch })

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
    const pays = [jobPay(monthlyJob(150_000, { socialInsurance: false }))]
    const h = healthInsurance(DEFAULT_TAKE_HOME, pays)
    expect(h.scheme).toBe('national')
    expect(h.annual).toBe(94_900 + 35_200 + 3_500)
    const reduced = healthInsurance(input((i) => ({ ...i, health: { ...i.health, reduction: 0.5 } })), pays)
    expect(reduced.annual).toBeLessThan(h.annual)
  })
})

describe('salary and bonus', () => {
  const salary = input((i) => ({ ...i, jobs: [job({ payMode: 'salary', salary: { monthly: 300_000, bonus: 500_000, bonusTimes: 2 } })] }))

  it('adds bonuses to the yearly pay and charges insurance on them', () => {
    const r = takeHome(salary)
    expect(r.monthlyPay).toBe(300_000)
    expect(r.annualPay).toBe(4_600_000)
    // 健康保険: 月 300,000 × 10.13% ÷ 2 = 15,195、賞与 500,000 × 10.13% ÷ 2 = 25,325
    expect(r.health.annual).toBe(15_195 * 12 + 25_325 * 2)
    // 厚生年金: 月 300,000 × 9.15% = 27,450、賞与 500,000 × 9.15% = 45,750
    expect(r.pension.annual).toBe(27_450 * 12 + 45_750 * 2)
    // 雇用保険: 月 1,500、賞与 2,500
    expect(r.employment.annual).toBe(1_500 * 12 + 2_500 * 2)
  })

  it('rounds the standard bonus down to 1,000 yen and applies the caps', () => {
    expect(standardBonuses({ amount: 123_456, times: 1 }, 'health')).toEqual([123_000])
    expect(standardBonuses({ amount: 2_000_000, times: 2 }, 'pension')).toEqual([1_500_000, 1_500_000])
    expect(standardBonuses({ amount: 3_000_000, times: 2 }, 'health')).toEqual([3_000_000, 2_730_000])
  })

  it('ignores the salary fields in hourly mode', () => {
    const hourly = takeHome(input((i) => ({ ...i, jobs: [job({ salary: { monthly: 300_000, bonus: 500_000, bonusTimes: 2 } })] })))
    expect(hourly.bonusTotal).toBe(0)
    expect(hourly.monthlyPay).toBe(144_000)
  })
})

describe('several jobs', () => {
  it('adds up all salaries for taxes, deducting the employment income once', () => {
    const two = takeHome(input((i) => ({ ...i, jobs: [monthlyJob(150_000), monthlyJob(100_000, { id: 'b', socialInsurance: false, employmentInsurance: false })] })))
    const one = takeHome(input((i) => ({ ...i, jobs: [monthlyJob(250_000)] })))
    expect(two.annualPay).toBe(3_000_000)
    // 給与所得控除は合算した300万円に1回だけ（職ごとに引くと少なく出る）
    expect(two.incomeTax.salaryIncome).toBe(one.incomeTax.salaryIncome)
  })

  it('combines the pay of insured jobs into one standard monthly remuneration', () => {
    const pays = [jobPay(monthlyJob(200_000)), jobPay(monthlyJob(100_000, { id: 'b' }))]
    const h = healthInsurance(DEFAULT_TAKE_HOME, pays)
    // 合計30万円 → 標準報酬月額30万円 × 10.13% ÷ 2
    expect(h.annual).toBe(employeeShare(300_000, 10.13) * 12)
    // 勤務先で加入しない職の給与は入れない
    const partly = healthInsurance(DEFAULT_TAKE_HOME, [pays[0], jobPay(monthlyJob(100_000, { id: 'b', socialInsurance: false }))])
    expect(partly.annual).toBe(employeeShare(200_000, 10.13) * 12)
  })

  it('uses national health insurance and pension only when no job is insured', () => {
    const r = takeHome(input((i) => ({ ...i, jobs: [monthlyJob(100_000, { socialInsurance: false }), monthlyJob(80_000, { id: 'b', socialInsurance: false })] })))
    expect(r.health.scheme).toBe('national')
    expect(r.pension.scheme).toBe('national')
    expect(r.pension.annual).toBe(17_920 * 12)
  })

  it('charges employment insurance only on the jobs that join it', () => {
    const r = takeHome(input((i) => ({ ...i, jobs: [monthlyJob(150_000), monthlyJob(100_000, { id: 'b', employmentInsurance: false })] })))
    expect(r.employment.annual).toBe(750 * 12)
  })

  it('counts the health insurance bonus cap across jobs', () => {
    expect(standardBonuses([{ amount: 3_000_000, times: 1 }, { amount: 3_000_000, times: 1 }], 'health')).toEqual([3_000_000, 2_730_000])
  })

  it('adds jobs with unique ids, uninsured by default', () => {
    const jobs = addJob(addJob([DEFAULT_JOB]))
    expect(new Set(jobs.map((j) => j.id)).size).toBe(3)
    expect(jobs[1]).toMatchObject({ socialInsurance: false, employmentInsurance: false })
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
    const saved = parseTakeHomeInput({ jobs: [{ wage: { hourly: 1500, nightHourly: 2000 } }, { id: 'x', payMode: 'salary' }], health: { mode: 'manual', national: [] } })
    expect(saved.jobs[0].wage).toEqual({ hourly: 1500, hours: 120, nightHours: 0, nightHourly: 2000 })
    expect(saved.jobs.map((j) => j.id)).toEqual(['job1', 'x'])
    expect(saved.jobs[1].payMode).toBe('salary')
    expect(saved.health.mode).toBe('manual')
    expect(saved.health.national).toEqual(DEFAULT_TAKE_HOME.health.national)
  })
})
