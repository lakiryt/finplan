import defaultViewJson from '../config/default-view.json'
import { colorDistance, harmoniousShades, type Random } from './colors'
import { groupLabel, updateGroup, type CategoryGroup } from './groups'
import type { Side } from './raw'

/** 表示の設定。分類の設定（ClassifyConfig）とは独立している */
export interface ViewConfig {
  version: 2
  /** グラフをスーパーカテゴリー単位で表示するか（表は変わらない） */
  useSuperCategories: boolean
  /** カテゴリー名 → 色（#rrggbb）。未設定は灰色 */
  colors: Record<string, string>
  /** 支出の表の並び順そのもの。グループの順に、中身を順に並べたものが表の行になる */
  groups: CategoryGroup[]
  /** 収入の表の並び順（支出の表とは別に持つ） */
  incomeGroups: CategoryGroup[]
}

const isGroups = (v: unknown): v is CategoryGroup[] =>
  Array.isArray(v) && v.every((g) => g && typeof g === 'object' && 'id' in g && Array.isArray((g as CategoryGroup).members))

/** 保存された設定を検証する */
export function parseViewConfig(raw: unknown): ViewConfig {
  const c = raw as Record<string, unknown> | null
  if (!c || typeof c !== 'object') throw new Error('表示の設定の形式が正しくありません')
  const colors = (c.colors && typeof c.colors === 'object' ? c.colors : {}) as Record<string, string>

  if (c.version !== 2) throw new Error(`未対応の表示の設定のバージョンです: ${c.version}`)
  if (!isGroups(c.groups)) throw new Error('groups の形式が正しくありません')
  return {
    version: 2,
    useSuperCategories: Boolean(c.useSuperCategories),
    colors,
    groups: c.groups,
    // 収入の表の並び順は後から足したので、無ければ空（データに合わせるときに支出の多い順で補われる）
    incomeGroups: isGroups(c.incomeGroups) ? c.incomeGroups : [],
  }
}

/** 初期設定。中身は src/config/default-view.json で編集する */
export const defaultView: ViewConfig = parseViewConfig(defaultViewJson)

/**
 * 支出側か収入側の表を groups に置いた設定。下の変更の関数は groups だけを見るので、
 * 収入の表を編集するときはこれで差し替えて渡し、結果を fromSide で元の場所に戻す
 */
export function withSide(view: ViewConfig, side: Side): ViewConfig {
  return side === 'income' ? { ...view, groups: view.incomeGroups } : view
}

export function fromSide(base: ViewConfig, side: Side, edited: ViewConfig): ViewConfig {
  return side === 'income' ? { ...edited, groups: base.groups, incomeGroups: edited.groups } : { ...edited, incomeGroups: base.incomeGroups }
}

// ---- 表示の設定の変更（どれも新しい ViewConfig を返す）----
// groups は reconcileGroups でデータに合わせた後のものを渡す（全カテゴリーがどこかのグループに入っている前提）

/** グループ（並び順・まとめ）を変える。色付きのスーパーカテゴリーに無色のカテゴリーが加わったら似た色を割り当てる */
export function changeGroups(view: ViewConfig, groups: CategoryGroup[], random?: Random): ViewConfig {
  return { ...view, groups, colors: colorJoinedMembers(view.groups, groups, view.colors, random) }
}

/** カテゴリーの色を変える。undefined なら無色に戻す */
export function setCategoryColor(view: ViewConfig, category: string, color: string | undefined): ViewConfig {
  const colors = { ...view.colors }
  if (color) colors[category] = color
  else delete colors[category]
  return { ...view, colors }
}

/** スーパーカテゴリーの色を変える。2件以上まとめていて中身がすべて無色なら、中身にも似た色を割り当てる */
export function setGroupColor(view: ViewConfig, id: string, color: string | undefined, random?: Random): ViewConfig {
  const next = { ...view, groups: updateGroup(view.groups, id, { color }) }
  const g = next.groups.find((x) => x.id === id)
  if (!color || !g || g.members.length < 2 || g.members.some((m) => view.colors[m])) return next
  return recolorMembers(next, id, random)
}

/** 中身のカテゴリーに、スーパーカテゴリーの色と色相がほぼ同じ色を割り当てる（既存の色は上書き）。1件だけなら同じ色 */
export function recolorMembers(view: ViewConfig, id: string, random?: Random): ViewConfig {
  const g = view.groups.find((x) => x.id === id)
  if (!g?.color) return view
  const shades = g.members.length === 1 ? [g.color] : harmoniousShades(g.color, g.members.length, random)
  return { ...view, colors: { ...view.colors, ...Object.fromEntries(g.members.map((m, i) => [m, shades[i]])) } }
}

/** カテゴリーとスーパーカテゴリーの色をすべて消す */
export function clearColors(view: ViewConfig): ViewConfig {
  return { ...view, colors: {}, groups: view.groups.map(({ id, label, members }) => (label ? { id, label, members } : { id, members })) }
}

// ---- 表示 ----

/** グラフに出す系列。まとめる設定ならグループ単位、そうでなければカテゴリー単位（どちらも表の順） */
export interface DisplaySeries {
  key: string
  label: string
  /** 未設定なら灰色 */
  color?: string
  members: string[]
}

export function displaySeries(view: Pick<ViewConfig, 'useSuperCategories' | 'colors' | 'groups'>): DisplaySeries[] {
  const { groups, colors } = view
  if (!view.useSuperCategories) {
    // 無色のカテゴリーは、スーパーカテゴリーの色で表示する
    return groups.flatMap((g) => g.members.map((c) => ({ key: c, label: c, color: colors[c] ?? g.color, members: [c] })))
  }
  return groups.map((g) => ({
    key: g.id,
    label: groupLabel(g),
    color: g.color ?? (g.members.length === 1 ? colors[g.members[0]] : undefined),
    members: g.members,
  }))
}

const uniqueColors = (colors: (string | undefined)[]) => [...new Set(colors.filter((c): c is string => Boolean(c)).map((c) => c.toLowerCase()))]

/** カテゴリーに設定されている色（カテゴリーの色を選ぶときの候補） */
export function categoryColorsInUse(view: Pick<ViewConfig, 'colors'>): string[] {
  return uniqueColors(Object.values(view.colors))
}

/** スーパーカテゴリーに設定されている色（スーパーカテゴリーの色を選ぶときの候補） */
export function groupColorsInUse(view: Pick<ViewConfig, 'groups'>): string[] {
  return uniqueColors(view.groups.map((g) => g.color))
}

/**
 * 色付きのスーパーカテゴリーに新しく加わった無色のカテゴリーに、似た色を割り当てる。
 * 似た色の候補の中から、すでにいる中身の色と一番離れたものを順に選ぶ（見分けやすくするため）
 */
function colorJoinedMembers(
  before: CategoryGroup[],
  after: CategoryGroup[],
  colors: Record<string, string>,
  random?: Random,
): Record<string, string> {
  const previousMembers = new Map(before.map((g) => [g.id, new Set(g.members)]))
  let next = colors
  for (const g of after) {
    if (!g.color || g.members.length < 2) continue
    const old = previousMembers.get(g.id) ?? new Set<string>()
    const joined = g.members.filter((m) => !old.has(m) && !next[m])
    if (!joined.length) continue
    const taken = g.members.map((m) => next[m]).filter((c): c is string => Boolean(c))
    const candidates = harmoniousShades(g.color, Math.max(6, (taken.length + joined.length) * 2), random)
    next = { ...next }
    for (const m of joined) {
      const best = candidates
        .filter((c) => !taken.includes(c))
        .reduce<{ c: string; d: number } | null>((acc, c) => {
          const d = taken.length ? Math.min(...taken.map((t) => colorDistance(c, t))) : 1
          return !acc || d > acc.d ? { c, d } : acc
        }, null)
      const color = best?.c ?? g.color
      next[m] = color
      taken.push(color)
    }
  }
  return next
}
