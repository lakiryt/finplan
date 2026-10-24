export interface WageInput {
  /** 月の生活費（家賃を除く） */
  living: number
  /** 引っ越し先の家賃（全額） */
  rent: number
  /** 社会保険・住民税など、手取り率に含めず別に見積もる月額 */
  extraFixed: number
  /** 毎月貯めたい額 */
  savings: number
  /** 額面に対する手取りの割合（0〜1）。extraFixed で別に見積もる分は含めない */
  takeHomeRate: number
  /** 月の労働時間 */
  hoursPerMonth: number
}

export interface WageResult {
  requiredTakeHome: number
  requiredGross: number
  hourlyWage: number
}

/** 必要な手取り → 額面 → 時給 の逆算。税・社会保険の詳しい計算は後で差し替える前提の簡易版 */
export function requiredWage(i: WageInput): WageResult {
  const requiredTakeHome = i.living + i.rent + i.extraFixed + i.savings
  const requiredGross = i.takeHomeRate > 0 ? requiredTakeHome / i.takeHomeRate : 0
  const hourlyWage = i.hoursPerMonth > 0 ? requiredGross / i.hoursPerMonth : 0
  return { requiredTakeHome, requiredGross, hourlyWage }
}
