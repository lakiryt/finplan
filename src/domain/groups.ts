/*
 * スーパーカテゴリー（表の上で連続したカテゴリーの範囲）の編集。並び順とまとめだけを扱い、色の決め方は view.ts に任せる。
 * どの関数も新しい配列を返す。
 */

/**
 * スーパーカテゴリー。表の上で連続したカテゴリーの範囲を1つにまとめる（表示上だけで、集計の加工とは別）。
 * 1件だけのグループは「まとめていない」カテゴリーと同じ。
 */
export interface CategoryGroup {
  id: string
  /** 未設定なら中身のカテゴリー名から作る */
  label?: string
  /** 未設定なら灰色（1件だけのグループはカテゴリーの色） */
  color?: string
  members: string[]
}

export type IdGenerator = () => string

export const groupLabel = (g: CategoryGroup) => g.label || g.members.join('・')

export const flatten = (groups: CategoryGroup[]) => groups.flatMap((g) => g.members)

/**
 * 保存されたグループを今のデータに合わせる。データに無いカテゴリーは外し、グループに入っていないカテゴリーは
 * categories の順（支出の多い順など）で1件ずつのグループとして後ろに足す
 */
export function reconcileGroups(groups: CategoryGroup[], categories: string[]): CategoryGroup[] {
  const exists = new Set(categories)
  const seen = new Set<string>()
  const out: CategoryGroup[] = []
  for (const g of groups) {
    const members = g.members.filter((m) => exists.has(m) && !seen.has(m))
    members.forEach((m) => seen.add(m))
    if (members.length) out.push({ ...g, members })
  }
  const ids = new Set(out.map((g) => g.id))
  for (const c of categories) {
    if (seen.has(c)) continue
    let id = `c:${c}`
    while (ids.has(id)) id += '_'
    ids.add(id)
    out.push({ id, members: [c] })
  }
  return out
}

// ---- 編集（どれも新しい配列を返す）----
// 内部では「カテゴリーの並び」と「各行がどのグループに属するか」に分けて考え、最後にグループへ組み直す

type Meta = Pick<CategoryGroup, 'label' | 'color'>

function toRows(groups: CategoryGroup[]) {
  const cats: string[] = []
  const owners: string[] = []
  const meta = new Map<string, Meta>()
  for (const g of groups) {
    meta.set(g.id, { label: g.label, color: g.color })
    for (const m of g.members) {
      cats.push(m)
      owners.push(g.id)
    }
  }
  return { cats, owners, meta }
}

/** 同じグループが離れた場所に現れたら、後の方は新しいグループにする（連続していることを保つ） */
function fromRows(cats: string[], owners: string[], meta: Map<string, Meta>, uid: IdGenerator): CategoryGroup[] {
  const out: CategoryGroup[] = []
  const used = new Set<string>()
  for (let i = 0; i < cats.length; i++) {
    const last = out[out.length - 1]
    if (i > 0 && owners[i] === owners[i - 1]) {
      last.members.push(cats[i])
      continue
    }
    const id = used.has(owners[i]) ? uid() : owners[i]
    used.add(id)
    out.push({ id, ...(id === owners[i] ? meta.get(id) : {}), members: [cats[i]] })
  }
  return out.map((g) => {
    const clean: CategoryGroup = { id: g.id, members: g.members }
    if (g.label) clean.label = g.label
    if (g.color) clean.color = g.color
    return clean
  })
}

/** index 番目のグループと、その次のグループを1つにする。名前と色は上のものを優先 */
export function mergeWithNext(groups: CategoryGroup[], index: number): CategoryGroup[] {
  const upper = groups[index]
  const lower = groups[index + 1]
  if (!upper || !lower) return groups
  const merged: CategoryGroup = {
    id: upper.id,
    members: [...upper.members, ...lower.members],
  }
  // 1件だけのグループの名前は、まとめた後には合わないので引き継がない
  const label = (upper.members.length > 1 && upper.label) || (lower.members.length > 1 && lower.label)
  const color = upper.color || lower.color
  if (label) merged.label = label
  if (color) merged.color = color
  return [...groups.slice(0, index), merged, ...groups.slice(index + 2)]
}

/** カテゴリーをグループから切り離して1件だけのグループにする。途中なら前後に分かれる */
export function detachCategory(groups: CategoryGroup[], category: string, uid: IdGenerator): CategoryGroup[] {
  const { cats, owners, meta } = toRows(groups)
  const i = cats.indexOf(category)
  if (i < 0) return groups
  const owner = owners[i]
  if (owners.filter((o) => o === owner).length === 1) return groups
  // 名前と色は、切り離すカテゴリーが先頭なら残りの側に、それ以外なら前の側に残す
  const isFirst = i === 0 || owners[i - 1] !== owner
  if (isFirst) {
    owners[i] = uid()
  } else {
    owners[i] = uid()
    const rest = uid()
    for (let k = i + 1; k < cats.length && owners[k] === owner; k++) owners[k] = rest
  }
  return fromRows(cats, owners, meta, uid)
}

/** グループを並びの start〜end 行目（両端を含む）に伸び縮みさせる。覆ったグループは吸収し、外れた行は1件ずつになる */
export function resizeGroup(groups: CategoryGroup[], id: string, start: number, end: number, uid: IdGenerator): CategoryGroup[] {
  const { cats, owners, meta } = toRows(groups)
  if (!meta.has(id)) return groups
  for (let k = 0; k < cats.length; k++) {
    if (k >= start && k <= end) owners[k] = id
    else if (owners[k] === id) owners[k] = uid()
  }
  return fromRows(cats, owners, meta, uid)
}

/**
 * カテゴリーを target の位置に動かす（上から下へなら target の後ろ、下から上へなら前）。
 * 同じグループの間に入れたらそのグループに加わり、それ以外は1件だけのグループになる
 */
export function moveCategory(groups: CategoryGroup[], category: string, target: string, uid: IdGenerator): CategoryGroup[] {
  const { cats, owners, meta } = toRows(groups)
  const from = cats.indexOf(category)
  const to = cats.indexOf(target)
  if (from < 0 || to < 0 || from === to) return groups
  const ownOwner = owners[from]
  const wasAlone = owners.filter((o) => o === ownOwner).length === 1
  cats.splice(from, 1)
  owners.splice(from, 1)
  cats.splice(to, 0, category)
  owners.splice(to, 0, '')
  const prev = owners[to - 1]
  const next = owners[to + 1]
  owners[to] = prev !== undefined && prev === next ? prev : wasAlone ? ownOwner : uid()
  return fromRows(cats, owners, meta, uid)
}

export function updateGroup(groups: CategoryGroup[], id: string, patch: Partial<Meta>): CategoryGroup[] {
  return groups.map((g) => {
    if (g.id !== id) return g
    const next = { ...g, ...patch }
    if (!next.label) delete next.label
    if (!next.color) delete next.color
    return next
  })
}

/** グループのまとめを解いて、中身を1件ずつにする */
export function ungroup(groups: CategoryGroup[], id: string, uid: IdGenerator): CategoryGroup[] {
  return groups.flatMap((g) => (g.id === id ? g.members.map((m, i) => (i === 0 ? { id: g.id, members: [m] } : { id: uid(), members: [m] })) : [g]))
}

/** グループを合計の多い順に、グループの中もカテゴリーの合計の多い順に並べる（まとめは保つ） */
export function sortByTotal(groups: CategoryGroup[], totals: Map<string, number>): CategoryGroup[] {
  const t = (c: string) => totals.get(c) ?? 0
  return groups
    .map((g) => ({ ...g, members: [...g.members].sort((a, b) => t(b) - t(a)) }))
    .sort((a, b) => b.members.reduce((s, m) => s + t(m), 0) - a.members.reduce((s, m) => s + t(m), 0))
}
