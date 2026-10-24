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
  /** 表示名の並び順（表・グラフ共通）。ここに無いものは支出の多い順で後ろに並ぶ */
  order: string[]
  superCategories: SuperCategory[]
}

export function parseViewConfig(raw: unknown): ViewConfig {
  const c = raw as Partial<ViewConfig> | null
  if (!c || typeof c !== 'object' || c.version !== 1) throw new Error('表示の設定の形式が正しくありません')
  if (!c.colors || typeof c.colors !== 'object') throw new Error('colors がありません')
  if (!Array.isArray(c.superCategories) || !c.superCategories.every((s) => s.id && Array.isArray(s.members))) {
    throw new Error('superCategories の形式が正しくありません')
  }
  return {
    version: 1,
    useSuperCategories: Boolean(c.useSuperCategories),
    colors: c.colors,
    order: Array.isArray(c.order) ? c.order : [],
    superCategories: c.superCategories,
  }
}

/** 初期設定。中身は src/config/default-view.json で編集する */
export const defaultView: ViewConfig = parseViewConfig(defaultViewJson)

export const superLabel = (s: SuperCategory) => s.label || s.id

export function superOf(view: ViewConfig, category: string): SuperCategory | undefined {
  return view.superCategories.find((s) => s.members.includes(category))
}

/** カテゴリー名 → 表示名。スーパーカテゴリーを使わない設定なら、そのまま返す */
export function displayNameOf(view: ViewConfig): (category: string) => string {
  if (!view.useSuperCategories) return (c) => c
  const map = new Map<string, string>()
  for (const s of view.superCategories) for (const m of s.members) if (!map.has(m)) map.set(m, superLabel(s))
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

/** order にあるものをその順で先に、残りは fallback（支出の多い順など）の順で並べる */
export function orderKeys(keys: string[], order: string[], fallback: string[]): string[] {
  const rank = (k: string) => {
    const i = order.indexOf(k)
    if (i >= 0) return i
    const j = fallback.indexOf(k)
    return order.length + (j >= 0 ? j : fallback.length)
  }
  return [...keys].sort((a, b) => rank(a) - rank(b))
}

/** keys（今の並び）の中で moving を target の位置に動かした新しい並びを返す */
export function moveKey(keys: string[], moving: string, target: string): string[] {
  const from = keys.indexOf(moving)
  const to = keys.indexOf(target)
  if (from < 0 || to < 0 || from === to) return keys
  const next = keys.filter((k) => k !== moving)
  next.splice(to, 0, moving)
  return next
}

/**
 * 並び順に沿って色を決める。選ばれた色を優先し、残りは palette を先頭から（選ばれた色を飛ばして）割り当てる。
 * palette を使い切ったら fallback（目立たない色）にする。同じ色を使い回さないため
 */
export function assignColors(keys: string[], chosen: Record<string, string>, palette: string[], fallback: string): Record<string, string> {
  const used = new Set(keys.map((k) => chosen[k]?.toLowerCase()).filter(Boolean))
  const free = palette.filter((c) => !used.has(c.toLowerCase()))
  const out: Record<string, string> = {}
  let i = 0
  for (const key of keys) out[key] = chosen[key] ?? free[i++] ?? fallback
  return out
}

// ---- スーパーカテゴリーの編集（どれも新しい ViewConfig を返す） ----

/** category を superId のスーパーカテゴリーに入れる。null なら外す。1つのカテゴリーは1つにしか入らない */
export function assignSuper(view: ViewConfig, category: string, superId: string | null): ViewConfig {
  return {
    ...view,
    superCategories: view.superCategories.map((s) => {
      const members = s.members.filter((m) => m !== category)
      return { ...s, members: s.id === superId ? [...members, category] : members }
    }),
  }
}

export function createSuper(view: ViewConfig, id: string, label: string, firstMember?: string): ViewConfig {
  const added = { ...view, superCategories: [...view.superCategories, { id, label, members: [] }] }
  return firstMember ? assignSuper(added, firstMember, id) : added
}

export function deleteSuper(view: ViewConfig, id: string): ViewConfig {
  return { ...view, superCategories: view.superCategories.filter((s) => s.id !== id) }
}

/** 名前を変える。色と並び順は表示名で覚えているので、新しい名前に引き継ぐ */
export function renameSuper(view: ViewConfig, id: string, label: string): ViewConfig {
  const target = view.superCategories.find((s) => s.id === id)
  if (!target || !label) return view
  const old = superLabel(target)
  const colors = { ...view.colors }
  if (old in colors) {
    colors[label] = colors[old]
    delete colors[old]
  }
  return {
    ...view,
    colors,
    order: view.order.map((k) => (k === old ? label : k)),
    superCategories: view.superCategories.map((s) => (s.id === id ? { ...s, label } : s)),
  }
}
