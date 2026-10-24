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
 * グループの役割。集計はこの役割だけを見る。
 * - living: 生活費（家賃を除く）
 * - housing: 住居費（家賃など）
 * - income: 収入
 * - ignore: 集計から外す（貯蓄・口座移動・調整・一時的な支出など）
 */
export type GroupRole = 'living' | 'housing' | 'income' | 'ignore'

export interface Group {
  id: string
  label: string
  role: GroupRole
}

/** ルールの条件。指定した項目すべてに一致した取引が対象（未指定の項目は問わない） */
export interface RuleMatch {
  /** 元のカテゴリー（CSVに書かれていたもの） */
  category?: string
  memo?: string
  memoIsRegex?: boolean
  /** YYYY-MM-DD（この日を含む） */
  from?: string
  /** YYYY-MM-DD（この日を含む） */
  to?: string
}

/** ルールの効果。新しい分析機能はここに項目を足して classify.ts で実装する */
export interface RuleEffect {
  /** カテゴリーを付け替える（新しい名前でもよい） */
  category?: string
  /** カテゴリーの割り当てより優先してこのグループに入れる */
  groupId?: string
  /** 取引月から N か月に均等に割って計上する（大きな出費をならす） */
  amortizeMonths?: number
}

export interface Rule {
  id: string
  label: string
  enabled: boolean
  match: RuleMatch
  effect: RuleEffect
}

export interface ClassifyConfig {
  version: 2
  groups: Group[]
  /** カテゴリー名 → グループID */
  categoryGroup: Record<string, string>
  /** 上から順に、一致したものすべてを適用する（同じ効果は後のルールが上書き） */
  rules: Rule[]
}

export interface ClassifiedTransaction extends Transaction {
  originalCategory: string
  /** どのグループにも割り当てられていない場合は null */
  groupId: string | null
  role: GroupRole | null
  /** 按分で作られた取引の場合、元の取引のID */
  amortizedFrom?: string
}
