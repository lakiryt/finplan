import { useRef, useState, type MouseEvent, type PointerEvent, type RefObject } from 'react'
import { resizeGroup, type CategoryGroup, type IdGenerator } from '../../domain/groups'
import type { PullBus } from './pullBus'

interface Drag {
  id: string
  start: number
  end: number
  /** 押した行 */
  grab: number
  origin: CategoryGroup[]
  prefix: string
  /** 別の行まで動かしたか（動かしていなければクリックとして扱う） */
  moved: boolean
  /** 直前のプレビューの範囲（同じなら描き直さない） */
  last: string
}

/** ドラッグ中のプレビューで同じIDが振られるよう、ドラッグごとに決まった順でIDを作る */
const seqUid = (prefix: string): IdGenerator => {
  let n = 0
  return () => `${prefix}-${n++}`
}

const rowIndexAt = (x: number, y: number) => {
  const tr = document.elementFromPoint(x, y)?.closest('tr[data-index]')
  return tr ? Number(tr.getAttribute('data-index')) : null
}

interface Options {
  /** 表の行の並び（groups の中身を順に並べたもの） */
  categories: string[]
  groups: CategoryGroup[]
  onCommit: (groups: CategoryGroup[]) => void
  uid: IdGenerator
  /** ポインターの位置を表の上端からの距離にするための基準 */
  wrapRef: RefObject<HTMLElement | null>
  pullBus: PullBus
}

/**
 * 大分類のバーをドラッグして範囲を変える。ドラッグ中はプレビューを返し、離したときに確定する。
 * バーのどこを押してもドラッグでき、範囲の外へ動かすとそこまで伸び、端の行を押して内側へ動かすとその端が縮む
 */
export function useBarResize({ categories, groups, onCommit, uid, wrapRef, pullBus }: Options) {
  const drag = useRef<Drag | null>(null)
  const suppressClick = useRef(false)
  const [preview, setPreview] = useState<CategoryGroup[] | null>(null)
  const shownGroups = preview ?? groups

  const start = (e: PointerEvent, rowIndex: number) => {
    const g = shownGroups.find((x) => x.members.includes(categories[rowIndex]))
    if (!g) return
    const first = categories.indexOf(g.members[0])
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { id: g.id, start: first, end: first + g.members.length - 1, grab: rowIndex, origin: groups, prefix: uid(), moved: false, last: '' }
  }

  const move = (e: PointerEvent) => {
    const d = drag.current
    if (!d) return
    const wrap = wrapRef.current
    if (wrap) pullBus.emit({ groupId: d.id, y: e.clientY - wrap.getBoundingClientRect().top })
    const t = rowIndexAt(e.clientX, e.clientY)
    if (t === null) return
    if (t !== d.grab) d.moved = true
    let [a, b] = [d.start, d.end]
    if (t > d.end) b = t
    else if (t < d.start) a = t
    else if (d.grab === d.end && d.start !== d.end) b = t
    else if (d.grab === d.start && d.start !== d.end) a = t
    const key = `${a}-${b}`
    if (key === d.last) return
    d.last = key
    setPreview(a === d.start && b === d.end ? null : resizeGroup(d.origin, d.id, a, b, seqUid(d.prefix)))
  }

  const end = (commit: boolean) => {
    pullBus.emit(null)
    if (commit && preview) onCommit(preview)
    suppressClick.current = commit && Boolean(drag.current?.moved)
    drag.current = null
    setPreview(null)
  }

  /** バーの当たり判定の要素に付ける。onClick はドラッグしなかったときだけ呼ぶ */
  const hitProps = (rowIndex: number, onClick: (e: MouseEvent<HTMLElement>) => void) => ({
    onPointerDown: (e: PointerEvent) => start(e, rowIndex),
    onPointerMove: move,
    onPointerUp: () => end(true),
    onPointerCancel: () => end(false),
    onClick: (e: MouseEvent<HTMLElement>) => {
      if (suppressClick.current) suppressClick.current = false
      else onClick(e)
    },
  })

  return { shownGroups, hitProps }
}
