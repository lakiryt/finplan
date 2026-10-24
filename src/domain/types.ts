/** 家計簿アプリの形式に依存しない、共通の取引データ */
export interface Transaction {
  id: string
  /** YYYY-MM-DD */
  date: string
  /** 支出はマイナス、収入はプラス */
  amount: number
  memo: string
  category: string
  /**
   * 支出側か収入側かを、金額の符号ではなく明示する（3. の相殺で付ける）。
   * 相殺した記録は反対側に移し、金額の符号はそのままにする。収入の記録（プラス）を支出側にすると支出が減り、
   * 支出の記録（マイナス）を収入側にすると収入が減る
   */
  side?: 'expense' | 'income'
}
