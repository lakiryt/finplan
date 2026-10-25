import { annualIncomeTax, monthlyPay, salaryIncome, type IncomeTaxBreakdown, type TaxYear, type Wage } from './incomeTax'

/*
 * 給与の手取りの見積もり。所得税・住民税・健康保険・年金・雇用保険を、項目ごとに含める・含めないを選んで差し引く。
 * 同じ働き方が1年以上続いた場合（住民税・国民健康保険は前の年の所得で決まるので、2年目以降）の月の平均を出す。
 * 料率の初期値と、計算の正確さ・限界は docs/take-home-pay.md を参照。
 */

/** 国民健康保険の区分（基礎分・支援金分など）ごとの所得割率・均等割・上限 */
export interface NhiPart {
  label: string
  /** 所得割の率（%） */
  rate: number
  /** 均等割（年額） */
  perCapita: number
  /** 上限（年額） */
  cap: number
}

/** 月給と賞与（会社員など） */
export interface Salary {
  /** 月給（額面） */
  monthly: number
  /** 賞与1回あたりの額面 */
  bonus: number
  /** 賞与の年の回数 */
  bonusTimes: number
}

export interface TakeHomeInput {
  /** 時給で計算するか（アルバイト）、月給と賞与で計算するか */
  payMode: 'hourly' | 'salary'
  wage: Wage
  salary: Salary
  year: TaxYear
  /** 40〜64歳なら介護保険料がかかる */
  age40to64: boolean
  incomeTax: { include: boolean }
  residentTax: {
    include: boolean
    mode: 'calc' | 'manual'
    /** 均等割（年額。森林環境税を含む） */
    perCapita: number
    /** 均等割がかからない所得の線を決める級地 */
    grade: 1 | 2 | 3
    /** 金額を入れるときの年額（例: 前の年の所得で決まった住民税） */
    manualAnnual: number
  }
  health: {
    include: boolean
    /** 勤務先の健康保険・国民健康保険・金額を入れる */
    mode: 'employee' | 'national' | 'manual'
    /** 勤務先の健康保険の料率（%、本人と勤務先の合計） */
    employeeRate: number
    /** 介護保険料率（%、40〜64歳。本人と勤務先の合計） */
    careRate: number
    /** 子ども・子育て支援金率（%、本人と勤務先の合計） */
    childRate: number
    /** 国民健康保険の区分（介護分を除く） */
    national: NhiPart[]
    /** 国民健康保険の介護分（40〜64歳） */
    nationalCare: NhiPart
    /** 国民健康保険の均等割の軽減（0・0.2・0.5・0.7） */
    reduction: number
    manualAnnual: number
  }
  pension: {
    include: boolean
    mode: 'employee' | 'national'
    /** 厚生年金の料率（%、本人と勤務先の合計） */
    employeeRate: number
    /** 国民年金の月額 */
    nationalMonthly: number
  }
  employment: {
    include: boolean
    /** 本人の負担率（%） */
    rate: number
  }
}

/** 初期値。料率は 2026年度のもの。国民健康保険は東京都中央区の 2026年度の値を例にしている（市区町村ごとに違う） */
export const DEFAULT_TAKE_HOME: TakeHomeInput = {
  payMode: 'hourly',
  wage: { hourly: 1200, hours: 120, nightHours: 0 },
  salary: { monthly: 250_000, bonus: 0, bonusTimes: 2 },
  year: 'r8',
  age40to64: false,
  incomeTax: { include: true },
  residentTax: { include: true, mode: 'calc', perCapita: 5_000, grade: 1, manualAnnual: 0 },
  health: {
    include: true,
    mode: 'employee',
    employeeRate: 9.9,
    careRate: 1.62,
    childRate: 0.23,
    national: [
      { label: '基礎分', rate: 7.51, perCapita: 47_600, cap: 670_000 },
      { label: '後期高齢者支援金分', rate: 2.8, perCapita: 17_600, cap: 260_000 },
      { label: '子ども・子育て支援金分', rate: 0.27, perCapita: 1_873, cap: 30_000 },
    ],
    nationalCare: { label: '介護分', rate: 2.43, perCapita: 17_800, cap: 170_000 },
    reduction: 0,
    manualAnnual: 0,
  },
  pension: { include: true, mode: 'employee', employeeRate: 18.3, nationalMonthly: 17_920 },
  employment: { include: true, rate: 0.5 },
}

/** 保存していた入力を、初期値と同じ形に整える（足りない・型の違う項目は初期値にする） */
export function parseTakeHomeInput(raw: unknown): TakeHomeInput {
  return mergeDefaults(DEFAULT_TAKE_HOME, raw) as TakeHomeInput
}

function mergeDefaults(def: unknown, raw: unknown): unknown {
  if (Array.isArray(def)) {
    if (!Array.isArray(raw) || raw.length !== def.length) return def
    return def.map((d, i) => mergeDefaults(d, raw[i]))
  }
  if (def && typeof def === 'object') {
    const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(def)) out[k] = mergeDefaults(v, r[k])
    // 深夜の時給のように、初期値に無い任意の項目は数値なら残す
    for (const [k, v] of Object.entries(r)) if (!(k in out) && typeof v === 'number') out[k] = v
    return out
  }
  return typeof raw === typeof def && (typeof raw !== 'number' || Number.isFinite(raw)) ? raw : def
}

// ---- 社会保険 ----

const floorTo = (n: number, unit: number) => Math.floor(n / unit) * unit
const NO_BONUS = { amount: 0, times: 0 }

/** 健康保険の標準報酬月額の等級（報酬月額の下限, 標準報酬月額）。厚生年金は 88,000〜650,000 の範囲 */
const GRADES: [number, number][] = [
  [0, 58_000], [63_000, 68_000], [73_000, 78_000], [83_000, 88_000], [93_000, 98_000], [101_000, 104_000],
  [107_000, 110_000], [114_000, 118_000], [122_000, 126_000], [130_000, 134_000], [138_000, 142_000],
  [146_000, 150_000], [155_000, 160_000], [165_000, 170_000], [175_000, 180_000], [185_000, 190_000],
  [195_000, 200_000], [210_000, 220_000], [230_000, 240_000], [250_000, 260_000], [270_000, 280_000],
  [290_000, 300_000], [310_000, 320_000], [330_000, 340_000], [350_000, 360_000], [370_000, 380_000],
  [395_000, 410_000], [425_000, 440_000], [455_000, 470_000], [485_000, 500_000], [515_000, 530_000],
  [545_000, 560_000], [575_000, 590_000], [605_000, 620_000], [635_000, 650_000], [665_000, 680_000],
  [695_000, 710_000], [730_000, 750_000], [770_000, 790_000], [810_000, 830_000], [855_000, 880_000],
  [905_000, 930_000], [955_000, 980_000], [1_005_000, 1_030_000], [1_055_000, 1_090_000], [1_115_000, 1_150_000],
  [1_175_000, 1_210_000], [1_235_000, 1_270_000], [1_295_000, 1_330_000], [1_355_000, 1_390_000],
]

/** 健康保険の標準報酬月額 */
export function standardMonthly(pay: number): number {
  let std = GRADES[0][1]
  for (const [from, value] of GRADES) if (pay >= from) std = value
  return std
}

/** 厚生年金の標準報酬月額（健康保険の等級を 88,000〜650,000 に収める） */
export const pensionStandardMonthly = (pay: number) => Math.min(Math.max(standardMonthly(pay), 88_000), 650_000)

/** 標準賞与額の上限。健康保険は年度の累計、厚生年金は1回あたり */
const HEALTH_BONUS_CAP_PER_YEAR = 5_730_000
const PENSION_BONUS_CAP_PER_PAYMENT = 1_500_000

/** 賞与1回ごとの標準賞与額（1,000円未満切り捨て）。健康保険は年度の累計の上限まで */
export function standardBonuses(bonus: Bonus, kind: 'health' | 'pension'): number[] {
  const std = floorTo(Math.max(0, bonus.amount), 1_000)
  let left = HEALTH_BONUS_CAP_PER_YEAR
  return Array.from({ length: Math.max(0, Math.floor(bonus.times)) }, () => {
    if (kind === 'pension') return Math.min(std, PENSION_BONUS_CAP_PER_PAYMENT)
    const v = Math.min(std, left)
    left -= v
    return v
  })
}

/** 賞与（1回あたりの額と年の回数）。時給で計算するときは無し */
export interface Bonus {
  amount: number
  times: number
}

/**
 * 本人の負担分（料率の半分）。給与から差し引くときの端数は、50銭以下を切り捨て、50銭を超えたら切り上げる。
 * 小数の誤差を避けるため、料率は 0.001% 単位の整数にしてから計算する
 */
export function employeeShare(base: number, ratePercent: number, half = true): number {
  const num = Math.round(base) * Math.round(ratePercent * 1000)
  const den = 100_000 * (half ? 2 : 1)
  const q = Math.floor(num / den)
  return (num - q * den) * 2 > den ? q + 1 : q
}

export interface InsuranceResult {
  /** 年額 */
  annual: number
  /** 内訳の説明（画面に出す） */
  lines: { label: string; value: number; note?: string }[]
}

/** 賞与にかかる保険料の、1回ごとの額の合計と内訳の行 */
function bonusShares(bonus: Bonus, kind: 'health' | 'pension', rate: number) {
  const shares = standardBonuses(bonus, kind).map((std) => employeeShare(std, rate))
  const total = shares.reduce((s, v) => s + v, 0)
  const lines = shares.length && bonus.amount > 0 ? [{ label: `賞与の分（${shares.length}回の合計）`, value: total, note: '標準賞与額 × 料率の半分' }] : []
  return { total, lines }
}

export function healthInsurance(input: TakeHomeInput, pay: number, bonus: Bonus = NO_BONUS): InsuranceResult {
  const h = input.health
  if (h.mode === 'manual') return { annual: Math.max(0, h.manualAnnual), lines: [] }
  if (h.mode === 'employee') {
    const std = standardMonthly(pay)
    const rate = h.employeeRate + h.childRate + (input.age40to64 ? h.careRate : 0)
    const monthly = employeeShare(std, rate)
    const b = bonusShares(bonus, 'health', rate)
    return {
      annual: monthly * 12 + b.total,
      lines: [
        { label: '標準報酬月額', value: std },
        { label: '料率（本人と勤務先の合計）', value: rate, note: '%' },
        { label: '月額（本人の負担）', value: monthly, note: '料率の半分' },
        ...b.lines,
      ],
    }
  }
  // 国民健康保険: 所得割の元は、給与所得 − 43万円（住民税の基礎控除）
  const base = Math.max(0, salaryIncome(pay * 12 + bonus.amount * bonus.times, input.year) - 430_000)
  const parts = input.age40to64 ? [...h.national, h.nationalCare] : h.national
  const lines = parts.map((p) => {
    const levy = Math.floor((base * p.rate) / 100) + Math.floor(p.perCapita * (1 - h.reduction))
    return { label: p.label, value: Math.min(levy, p.cap) }
  })
  // 保険料は区分ごとに100円未満を切り捨てる自治体が多い
  const annual = lines.reduce((s, l) => s + Math.floor(l.value / 100) * 100, 0)
  return { annual, lines: [{ label: '所得割の元（給与所得 − 43万円）', value: base }, ...lines] }
}

export function pension(input: TakeHomeInput, pay: number, bonus: Bonus = NO_BONUS): InsuranceResult {
  const p = input.pension
  if (p.mode === 'national') return { annual: p.nationalMonthly * 12, lines: [{ label: '月額', value: p.nationalMonthly }] }
  const std = pensionStandardMonthly(pay)
  const monthly = employeeShare(std, p.employeeRate)
  const b = bonusShares(bonus, 'pension', p.employeeRate)
  return {
    annual: monthly * 12 + b.total,
    lines: [
      { label: '標準報酬月額', value: std },
      { label: '月額（本人の負担）', value: monthly, note: `${p.employeeRate}% の半分` },
      ...b.lines,
    ],
  }
}

export function employmentInsurance(input: TakeHomeInput, pay: number, bonus: Bonus = NO_BONUS): InsuranceResult {
  const monthly = employeeShare(pay, input.employment.rate, false)
  // 賞与には、標準賞与額ではなく賞与の額そのものにかかる
  const perBonus = bonus.amount > 0 ? employeeShare(bonus.amount, input.employment.rate, false) : 0
  const times = Math.max(0, Math.floor(bonus.times))
  return {
    annual: monthly * 12 + perBonus * times,
    lines: [
      { label: '月額', value: monthly, note: `給与の ${input.employment.rate}%` },
      ...(perBonus && times ? [{ label: `賞与の分（${times}回の合計）`, value: perBonus * times, note: `賞与の ${input.employment.rate}%` }] : []),
    ],
  }
}

// ---- 住民税 ----

export interface ResidentTaxBreakdown {
  salaryIncome: number
  basicDeduction: number
  socialInsurance: number
  /** 課税所得（1,000円未満切り捨て） */
  taxable: number
  /** 調整控除（所得税との基礎控除の差による、税額からの控除） */
  adjustment: number
  /** 所得割（市区町村6%・都道府県4%、それぞれ100円未満切り捨て） */
  incomeLevy: number
  /** 均等割 */
  perCapitaLevy: number
  total: number
}

/** 均等割がかからない合計所得の上限（単身、級地ごと） */
const PER_CAPITA_EXEMPT: Record<1 | 2 | 3, number> = { 1: 450_000, 2: 415_000, 3: 380_000 }

/** 単身・給与だけの人の住民税（年額）。所得は、同じ年の給与で代わりにする（実際は前の年の所得で決まる） */
export function residentTax(revenue: number, socialInsurance: number, year: TaxYear, perCapita: number, grade: 1 | 2 | 3): ResidentTaxBreakdown {
  const income = salaryIncome(revenue, year)
  const social = Math.max(0, Math.floor(socialInsurance))
  const taxable = floorTo(Math.max(0, income - 430_000 - social), 1_000)
  // 所得割は、総所得が45万円以下ならかからない（単身）
  const noIncomeLevy = income <= 450_000
  // 調整控除: 基礎控除の差（5万円）と課税所得の小さい方の5%（課税所得200万円超は2,500円）
  const adjBase = taxable <= 2_000_000 ? Math.min(50_000, taxable) : 50_000
  const city = Math.max(0, floorTo((taxable * 6) / 100 - (adjBase * 3) / 100, 100))
  const pref = Math.max(0, floorTo((taxable * 4) / 100 - (adjBase * 2) / 100, 100))
  const incomeLevy = noIncomeLevy ? 0 : city + pref
  const perCapitaLevy = income <= PER_CAPITA_EXEMPT[grade] ? 0 : perCapita
  return {
    salaryIncome: income,
    basicDeduction: 430_000,
    socialInsurance: social,
    taxable,
    adjustment: noIncomeLevy ? 0 : (adjBase * 5) / 100,
    incomeLevy,
    perCapitaLevy,
    total: incomeLevy + perCapitaLevy,
  }
}

// ---- まとめ ----

export type ItemKey = 'incomeTax' | 'residentTax' | 'health' | 'pension' | 'employment'

export interface TakeHomeResult {
  /** 月の給与（時給なら時給と労働時間から、月給なら月給） */
  monthlyPay: number
  /** 賞与の年額 */
  bonusTotal: number
  /** 年収（月の給与 × 12 ＋ 賞与） */
  annualPay: number
  health: InsuranceResult
  pension: InsuranceResult
  employment: InsuranceResult
  /** 含めた社会保険料の年額（所得税・住民税の社会保険料控除になる） */
  socialInsurance: number
  incomeTax: IncomeTaxBreakdown
  residentTax: ResidentTaxBreakdown | null
  /** 項目ごとの年額と、手取りの計算に含めるか */
  items: Record<ItemKey, { annual: number; include: boolean }>
  /** 手取りの月の平均（含めた項目だけを差し引く） */
  takeHomeMonthly: number
}

export function takeHome(input: TakeHomeInput): TakeHomeResult {
  const salaryMode = input.payMode === 'salary'
  const pay = salaryMode ? Math.max(0, Math.round(input.salary.monthly)) : monthlyPay(input.wage)
  const bonus: Bonus = salaryMode ? { amount: Math.max(0, Math.round(input.salary.bonus)), times: Math.max(0, Math.floor(input.salary.bonusTimes)) } : NO_BONUS
  const bonusTotal = bonus.amount * bonus.times
  const annualPay = pay * 12 + bonusTotal
  const health = healthInsurance(input, pay, bonus)
  const pensionResult = pension(input, pay, bonus)
  const employment = employmentInsurance(input, pay, bonus)
  // 含めない社会保険料は、払わないものとして扱う（控除にもしない）
  const socialInsurance =
    (input.health.include ? health.annual : 0) + (input.pension.include ? pensionResult.annual : 0) + (input.employment.include ? employment.annual : 0)
  const incomeTax = annualIncomeTax(annualPay, socialInsurance, input.year)
  const r = input.residentTax
  const resident = r.mode === 'calc' ? residentTax(annualPay, socialInsurance, input.year, r.perCapita, r.grade) : null
  const items: TakeHomeResult['items'] = {
    incomeTax: { annual: incomeTax.total, include: input.incomeTax.include },
    residentTax: { annual: resident ? resident.total : Math.max(0, r.manualAnnual), include: r.include },
    health: { annual: health.annual, include: input.health.include },
    pension: { annual: pensionResult.annual, include: input.pension.include },
    employment: { annual: employment.annual, include: input.employment.include },
  }
  const deducted = Object.values(items).reduce((s, i) => s + (i.include ? i.annual : 0), 0)
  return {
    monthlyPay: pay,
    bonusTotal,
    annualPay,
    health,
    pension: pensionResult,
    employment,
    socialInsurance,
    incomeTax,
    residentTax: resident,
    items,
    takeHomeMonthly: Math.floor((annualPay - deducted) / 12),
  }
}
