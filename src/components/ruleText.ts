import { opposite, type Condition } from '../domain/processing'
import type { Side } from '../domain/raw'

export const SIDE_LABEL: Record<Side, string> = { income: '収入', expense: '支出' }

/** 編集中の条件（相殺のときだけ target を使う） */
export interface RuleDraft {
  enabled: boolean
  when: Condition
  target?: string
}

/** バッジに出す短い説明。例: 「支出｜家賃｜メモ「トランク」｜2025-03-01〜」「支出｜選んだ記録 3件」「収入｜回収 → 支出「他」」 */
export function describeRule(rule: RuleDraft): string {
  const c = rule.when
  const parts = [SIDE_LABEL[c.side]]
  if (c.category !== undefined) parts.push(c.category || '（空欄）')
  if (c.memo) parts.push(c.memoIsRegex ? `メモ /${c.memo}/` : `メモ「${c.memo}」`)
  if (c.from || c.to) parts.push(`${c.from ?? ''}〜${c.to ?? ''}`)
  if (c.records?.length) parts.push(`選んだ記録 ${c.records.length}件`)
  const text = parts.join('｜')
  if (rule.target === undefined) return text
  return `${text} → ${SIDE_LABEL[opposite(c.side)]}「${rule.target || '指定なし'}」`
}
