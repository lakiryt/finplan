/** 家計簿アプリの形式に依存しない、共通の取引データ */
export interface Transaction {
  id: string
  /** YYYY-MM-DD */
  date: string
  /** 支出はマイナス、収入はプラス */
  amount: number
  memo: string
  category: string
}

/**
 * グループの役割。集計・シミュレーションはこの役割だけを見る。
 * - living: 生活費（家賃を除く）
 * - housing: 住居費（家賃・更新料など）
 * - income: 収入
 * - ignore: 集計から外す（貯蓄・口座移動・調整など）
 */
export type GroupRole = 'living' | 'housing' | 'income' | 'ignore'

export interface Group {
  id: string
  label: string
  role: GroupRole
}

/** メモに一致した取引のカテゴリーやグループを上書きするルール */
export interface MemoRule {
  id: string
  pattern: string
  isRegex: boolean
  /** 指定するとカテゴリーを置き換える */
  category?: string
  /** 指定するとカテゴリーの割り当てより優先してこのグループに入れる */
  groupId?: string
}

export interface ClassifyConfig {
  version: 1
  groups: Group[]
  /** カテゴリー名 → グループID */
  categoryGroup: Record<string, string>
  memoRules: MemoRule[]
}

export interface ClassifiedTransaction extends Transaction {
  originalCategory: string
  /** どのグループにも割り当てられていない場合は null */
  groupId: string | null
  role: GroupRole | null
}
