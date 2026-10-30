import type { Condition, Kind, Target } from '../domain/processing'
import type { Side } from '../domain/raw'

export const SIDE_LABEL: Record<Side, string> = { income: '収入', expense: '支出' }
export const KIND_LABEL: Record<Kind, string> = { offset: '相殺', exclude: '除外' }

/** 3. の区分の見出し。例: 「支出側からの除外」 */
export const sectionTitle = (side: Side, kind: Kind) => `${SIDE_LABEL[side]}側からの${KIND_LABEL[kind]}`

/** 編集中の条件。target は相殺で差し引く反対側の先（null なら差し引かない＝除外） */
export interface RuleDraft {
  name?: string
  enabled: boolean
  when: Condition
  target: Target | null
}

/** 記録の画面を開く内容。id があれば既存の条件の編集 */
export interface RecordsRequest {
  draft: RuleDraft
  id?: string
}

/**
 * バッジに出す短い説明。側と相殺・除外は、バッジを置く場所で分かるので書かない。
 * 例: 「家賃｜メモ「トランク」｜2025-03-01〜」「選んだ記録 3件 → 「給与」」「回収 → 指定なし」
 */
export function describeRule(rule: RuleDraft): string {
  const c = rule.when
  const parts: string[] = []
  if (c.category !== undefined) parts.push(c.category || '（空欄）')
  if (c.memo) parts.push(c.memoIsRegex ? `メモ /${c.memo}/` : `メモ「${c.memo}」`)
  if (c.from || c.to) parts.push(`${c.from ?? ''}〜${c.to ?? ''}`)
  if (c.records?.length) parts.push(`選んだ記録 ${c.records.length}件`)
  const text = parts.join('｜') || '（条件なし）'
  if (rule.target === null) return text
  const cat = rule.target.category
  return `${text} → ${cat === null ? '指定なし' : `「${cat || '（空欄）'}」`}`
}

/** バッジの文字。名前があれば名前、無ければ条件の内容 */
export const ruleLabel = (rule: RuleDraft) => rule.name || describeRule(rule)
