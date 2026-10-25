import { describe, expect, it } from 'vitest'
import { annualIncomeTax, basicDeduction, baseTax, monthlyPay, salaryIncome } from './incomeTax'

describe('monthly pay', () => {
  it('pays night hours at 1.25x unless a night wage is given', () => {
    expect(monthlyPay({ hourly: 1200, hours: 100, nightHours: 20 })).toBe(1200 * 80 + 1500 * 20)
    expect(monthlyPay({ hourly: 1200, hours: 100, nightHours: 20, nightHourly: 1600 })).toBe(1200 * 80 + 1600 * 20)
    // 深夜の時間は労働時間を超えない
    expect(monthlyPay({ hourly: 1000, hours: 10, nightHours: 30 })).toBe(12500)
  })
})

describe('salary income (令和8・9年分)', () => {
  it('follows the minimum deduction of 740,000 and the special rows below 2.2M', () => {
    expect(salaryIncome(740_999, 'r8')).toBe(0)
    expect(salaryIncome(1_780_000, 'r8')).toBe(1_040_000)
    expect(salaryIncome(2_192_000, 'r8')).toBe(1_451_000)
    expect(salaryIncome(2_199_999, 'r8')).toBe(1_456_000)
    expect(salaryIncome(2_200_000, 'r8')).toBe(1_460_000)
  })

  it('rounds income down to 4,000 yen below 6.6M, like the statutory table', () => {
    expect(salaryIncome(3_000_000, 'r8')).toBe(2_020_000)
    expect(salaryIncome(3_003_999, 'r8')).toBe(2_020_000)
    expect(salaryIncome(3_004_000, 'r8')).toBe(2_022_800)
    expect(salaryIncome(5_000_000, 'r8')).toBe(3_560_000)
    expect(salaryIncome(7_000_000, 'r8')).toBe(5_200_000)
    expect(salaryIncome(10_000_000, 'r8')).toBe(8_050_000)
  })

  it('uses the 690,000 minimum from 令和10年分', () => {
    expect(salaryIncome(1_000_000, 'r10')).toBe(310_000)
    expect(salaryIncome(3_000_000, 'r10')).toBe(2_020_000)
  })
})

describe('basic deduction and tax', () => {
  it('uses the special addition by year', () => {
    expect(basicDeduction(4_890_000, 'r8')).toBe(1_040_000)
    expect(basicDeduction(4_890_001, 'r8')).toBe(670_000)
    expect(basicDeduction(1_320_000, 'r10')).toBe(990_000)
    expect(basicDeduction(1_320_001, 'r10')).toBe(620_000)
  })

  it('applies the progressive rates', () => {
    expect(baseTax(1_950_000)).toBe(97_500)
    expect(baseTax(3_000_000)).toBe(202_500)
  })

  it('is zero up to 1.78M of salary in 令和8・9年分', () => {
    expect(annualIncomeTax(1_780_000, 0, 'r8').total).toBe(0)
    expect(annualIncomeTax(1_790_000, 0, 'r8').total).toBe(500)
  })

  it('computes the yearly tax with reconstruction tax and rounding', () => {
    // 給与所得 2,020,000 − 基礎控除 1,040,000 = 980,000 → 49,000 + 復興 1,029 → 50,000
    expect(annualIncomeTax(3_000_000, 0, 'r8')).toMatchObject({ taxable: 980_000, baseTax: 49_000, reconstruction: 1_029, total: 50_000 })
    // 社会保険料は全額差し引く
    expect(annualIncomeTax(3_000_000, 400_000, 'r8')).toMatchObject({ taxable: 580_000, total: 29_600 })
  })
})
