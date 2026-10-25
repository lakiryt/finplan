/*
 * 給与だけの人の所得税（年税額）の計算。年末調整・確定申告で決まる1年分の税額を出す（毎月の源泉徴収額ではない）。
 * 住民税・社会保険料は計算しない（社会保険料は、分かっていれば所得控除として差し引く）。
 * 考え方・根拠・限界は docs/take-home-pay.md を参照。
 */

/** どの年分のルールで計算するか（令和8・9年分は特例込み。令和10年分以後は令和8年度税制改正の大綱の時点の予定） */
export type TaxYear = 'r8' | 'r10'
export const TAX_YEARS: { key: TaxYear; label: string }[] = [
  { key: 'r8', label: '2026・2027年分（令和8・9年分）' },
  { key: 'r10', label: '2028年分以後（令和10年分〜、予定）' },
]

/** 月の給与（額面）。深夜の時間は深夜の時給で数える（深夜の時給を指定しなければ、時給の1.25倍） */
export interface Wage {
  hourly: number
  /** 月の労働時間（深夜の時間を含む） */
  hours: number
  /** うち深夜（22時〜5時）の時間 */
  nightHours: number
  nightHourly?: number
}

/** 深夜の割増（労働基準法では25%以上） */
export const NIGHT_PREMIUM = 0.25

export function monthlyPay(w: Wage): number {
  const night = Math.min(Math.max(w.nightHours, 0), Math.max(w.hours, 0))
  const nightHourly = w.nightHourly ?? w.hourly * (1 + NIGHT_PREMIUM)
  return Math.round(w.hourly * (Math.max(w.hours, 0) - night) + nightHourly * night)
}

const floorTo = (n: number, unit: number) => Math.floor(n / unit) * unit

/**
 * 給与所得（収入 − 給与所得控除）。660万円未満は所得税法の別表第五（4,000円刻みの表）にならい、
 * 収入を4,000円単位に切り捨ててから計算する。令和8・9年分の220万円未満は、国税庁が示す特例の表どおり
 */
export function salaryIncome(revenue: number, year: TaxYear): number {
  const r = Math.floor(revenue)
  if (r >= 8_500_000) return r - 1_950_000
  if (r >= 6_600_000) return Math.floor((r * 9) / 10) - 1_100_000
  const a = floorTo(r, 4_000)
  // 小数の誤差を避けるため、割合は整数で掛けてから割る（a は4,000の倍数なので割り切れる）
  const table = r >= 3_600_000 ? (a * 8) / 10 - 440_000 : (a * 7) / 10 - 80_000
  if (year === 'r8') {
    if (r < 741_000) return 0
    if (r < 2_191_000) return r - 740_000
    if (r < 2_193_000) return 1_451_000
    if (r < 2_196_000) return 1_453_000
    if (r < 2_200_000) return 1_456_000
    return table
  }
  // 令和10年分以後: 最低保障額69万円（220万円付近の細かな表は未公表のため、控除の大きい方で近似）
  return Math.max(0, Math.min(r - 690_000, table))
}

/** 基礎控除。給与だけなら、合計所得金額は給与所得 */
export function basicDeduction(totalIncome: number, year: TaxYear): number {
  if (year === 'r8') {
    if (totalIncome <= 4_890_000) return 1_040_000 // 本則62万円 + 特例42万円
    if (totalIncome <= 6_550_000) return 670_000 // 本則62万円 + 特例5万円
  } else if (totalIncome <= 1_320_000) {
    return 990_000 // 本則62万円 + 特例37万円
  }
  if (totalIncome <= 23_500_000) return 620_000
  if (totalIncome <= 24_000_000) return 480_000
  if (totalIncome <= 24_500_000) return 320_000
  if (totalIncome <= 25_000_000) return 160_000
  return 0
}

/** 所得税の速算表（課税所得の上限・税率・控除額） */
const RATES: [number, number, number][] = [
  [1_950_000, 0.05, 0],
  [3_300_000, 0.1, 97_500],
  [6_950_000, 0.2, 427_500],
  [9_000_000, 0.23, 636_000],
  [18_000_000, 0.33, 1_536_000],
  [40_000_000, 0.4, 2_796_000],
  [Infinity, 0.45, 4_796_000],
]

/** 課税所得に対する所得税（復興特別所得税を含まない基準所得税額） */
export function baseTax(taxable: number): number {
  const [, rate, minus] = RATES.find(([limit]) => taxable <= limit)!
  return Math.max(0, Math.floor(taxable * rate - minus))
}

export interface IncomeTaxBreakdown {
  revenue: number
  salaryIncome: number
  /** 給与所得控除 */
  salaryDeduction: number
  basicDeduction: number
  socialInsurance: number
  /** 課税所得（1,000円未満切り捨て） */
  taxable: number
  baseTax: number
  /** 復興特別所得税（基準所得税額の2.1%） */
  reconstruction: number
  /** 年税額（100円未満切り捨て） */
  total: number
}

/** 給与だけの人の1年分の所得税。socialInsurance は1年に払う社会保険料（全額が所得控除になる） */
export function annualIncomeTax(revenue: number, socialInsurance: number, year: TaxYear): IncomeTaxBreakdown {
  const income = salaryIncome(revenue, year)
  const basic = basicDeduction(income, year)
  const social = Math.max(0, Math.floor(socialInsurance))
  const taxable = floorTo(Math.max(0, income - basic - social), 1_000)
  const base = baseTax(taxable)
  const reconstruction = Math.floor(base * 0.021)
  return {
    revenue,
    salaryIncome: income,
    salaryDeduction: revenue - income,
    basicDeduction: basic,
    socialInsurance: social,
    taxable,
    baseTax: base,
    reconstruction,
    total: floorTo(base + reconstruction, 100),
  }
}
