import defaultViewJson from '../config/default-view.json'
import type { Transaction } from './types'

/** 表示上だけ複数のカテゴリーをまとめるもの。集計の加工（ルール）とは別 */
export interface SuperCategory {
  id: string
  label: string
  members: string[]
}

/** 表示の設定。分類の設定（ClassifyConfig）とは独立している */
export interface ViewConfig {
  version: 1
  useSuperCategories: boolean
  /** 表示名（カテゴリー名またはスーパーカテゴリー名）→ 色（#rrggbb） */
  colors: Record<string, string>
  superCategories: SuperCategory[]
}

export function parseViewConfig(raw: unknown): ViewConfig {
  const c = raw as Partial<ViewConfig> | null
  if (!c || typeof c !== 'object' || c.version !== 1) throw new Error('表示の設定の形式が正しくありません')
  if (!c.colors || typeof c.colors !== 'object') throw new Error('colors がありません')
  if (!Array.isArray(c.superCategories) || !c.superCategories.every((s) => s.id && Array.isArray(s.members))) {
    throw new Error('superCategories の形式が正しくありません')
  }
  return { version: 1, useSuperCategories: Boolean(c.useSuperCategories), colors: c.colors, superCategories: c.superCategories }
}

/** 初期設定。中身は src/config/default-view.json で編集する */
export const defaultView: ViewConfig = parseViewConfig(defaultViewJson)

/** カテゴリー名 → 表示名。スーパーカテゴリーを使わない設定なら、そのまま返す */
export function displayNameOf(view: ViewConfig): (category: string) => string {
  if (!view.useSuperCategories) return (c) => c
  const map = new Map<string, string>()
  for (const s of view.superCategories) for (const m of s.members) if (!map.has(m)) map.set(m, s.label || s.id)
  return (c) => map.get(c) ?? c
}

/** カテゴリーを表示名に置き換えた取引を返す（集計関数をそのまま使えるように） */
export function applyDisplayNames(txs: Transaction[], view: ViewConfig): Transaction[] {
  const nameOf = displayNameOf(view)
  return txs.map((t) => {
    const category = nameOf(t.category)
    return category === t.category ? t : { ...t, category }
  })
}

/**
 * 表示名ごとの色を決める。指定された色を優先し、残りは palette を順に（指定済みの色を飛ばして）割り当てる。
 * individually に含まれないものは色を持たない（「その他」にまとめる）
 */
export function assignColors(individually: string[], chosen: Record<string, string>, palette: string[]): Record<string, string> {
  const used = new Set(individually.map((k) => chosen[k]?.toLowerCase()).filter(Boolean))
  const free = palette.filter((c) => !used.has(c.toLowerCase()))
  const out: Record<string, string> = {}
  let i = 0
  for (const key of individually) out[key] = chosen[key] ?? free[i++ % Math.max(free.length, 1)] ?? palette[0]
  return out
}
