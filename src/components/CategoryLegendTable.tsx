import { useLayoutEffect, useRef, useState } from 'react'
import type { RawCategoryStat } from '../domain/raw'
import {
  detachCategory,
  groupLabel,
  mergeWithNext,
  moveCategory,
  resizeGroup,
  ungroup,
  updateGroup,
  type CategoryGroup,
  type IdGenerator,
} from '../domain/groups'
import { ColorPanel, ColorPicker } from './ColorPicker'
import { yen } from './format'
import { Popover } from './Popover'
import { createPullBus } from './pullBus'
import { ROW_EASING, ROW_MS, SuperBlobs, type BlobLayout } from './SuperBlobs'

export interface LegendRow {
  category: string
  stat: RawCategoryStat
  /** 未設定なら灰色 */
  color?: string
}

interface Props {
  /** 表の行。groups の中身を順に並べたものと一致している前提 */
  rows: LegendRow[]
  groups: CategoryGroup[]
  onGroupsChange: (groups: CategoryGroup[]) => void
  onColorChange: (category: string, color: string | undefined) => void
  onGroupColorChange: (groupId: string, color: string | undefined) => void
  /** 中身のカテゴリーにスーパーカテゴリーと似た色を割り当て直す */
  onRecolorMembers: (groupId: string) => void
  /** 色の選択に出す使用中の色（カテゴリーとスーパーカテゴリーで別々） */
  categoryColorsInUse: string[]
  groupColorsInUse: string[]
  /** 色が未設定のときの色 */
  gray: string
  uid: IdGenerator
}

/** 最初に見せる行数。残りはフェードアウトさせて「すべて表示」で開く */
const VISIBLE = 8
const FADE_ROWS = 2
/** フェードアウトさせる行の不透明度（CSS の .fade-1 / .fade-2 と揃える） */
const FADE_OPACITY = [0.45, 0.15]
/** 右端のセルの左端から、バー（滴）の中心までの距離 */
const BLOB_CENTER = 28
/** 動かした行を目立たせておく時間 */
const HIGHLIGHT_MS = 1200

/** ドラッグ中のプレビューで同じIDが振られるよう、ドラッグごとに決まった順でIDを作る */
const seqUid = (prefix: string): IdGenerator => {
  let n = 0
  return () => `${prefix}-${n++}`
}

interface ResizeDrag {
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

/**
 * グラフの凡例を兼ねるカテゴリー別の表。
 * 左のつまみで行を並べ替え、表の横のバーでスーパーカテゴリー（連続した行のまとめ）を作る
 */
export function CategoryLegendTable(props: Props) {
  const { rows, groups, onGroupsChange, onColorChange, onGroupColorChange, onRecolorMembers, categoryColorsInUse, groupColorsInUse, gray, uid } = props
  const [expanded, setExpanded] = useState(false)
  // 行の並べ替え
  const [armed, setArmed] = useState<string>()
  const [dragging, setDragging] = useState<string>()
  const [over, setOver] = useState<string>()
  // バーの伸び縮み
  const resize = useRef<ResizeDrag | null>(null)
  const suppressClick = useRef(false)
  const [preview, setPreview] = useState<CategoryGroup[] | null>(null)
  const [pullBus] = useState(createPullBus)
  // 表の上に重ねるバーの位置と、行の移動のアニメーション
  const wrapRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const rowEls = useRef(new Map<string, HTMLTableRowElement>())
  const lastTops = useRef(new Map<string, number>())
  const lastOrder = useRef('')
  const [layout, setLayout] = useState<BlobLayout | null>(null)
  const [justMoved, setJustMoved] = useState<string>()

  const shownGroups = preview ?? groups
  const groupIndexOf = new Map<string, number>()
  shownGroups.forEach((g, gi) => g.members.forEach((m) => groupIndexOf.set(m, gi)))
  const colorOf = new Map(rows.map((r) => [r.category, r.color]))

  const categories = rows.map((r) => r.category)
  const hidden = expanded ? 0 : Math.max(0, rows.length - VISIBLE)
  const shown = expanded ? rows : rows.slice(0, VISIBLE + FADE_ROWS)

  const dropClass = (category: string) => {
    if (!dragging || over !== category || dragging === category) return ''
    return categories.indexOf(dragging) < categories.indexOf(category) ? 'drop-after' : 'drop-before'
  }
  const fadeClass = (i: number) => (!expanded && i >= VISIBLE ? `fade fade-${i - VISIBLE + 1}` : '')
  const groupColor = (g: CategoryGroup) => g.color ?? (g.members.length === 1 ? colorOf.get(g.members[0]) : undefined) ?? gray

  /** 表の上に重ねるバーのために、各行の中心の位置を測る（変わったときだけ更新する） */
  const measure = () => {
    const wrap = wrapRef.current
    const table = tableRef.current
    const td = table?.querySelector<HTMLElement>('td.super-cell')
    if (!wrap || !table || !td) return
    const x = td.getBoundingClientRect().left - wrap.getBoundingClientRect().left + wrap.scrollLeft + BLOB_CENTER
    // 行の位置は offsetTop で測る（移動のアニメーション中の transform に影響されないように）
    const measured = shown.flatMap((row, i) => {
      const el = rowEls.current.get(row.category)
      if (!el) return []
      const opacity = !expanded && i >= VISIBLE ? FADE_OPACITY[i - VISIBLE] : 1
      return [{ category: row.category, y: table.offsetTop + el.offsetTop + el.offsetHeight / 2, opacity }]
    })
    const next = { x, rows: measured }
    setLayout((cur) => (JSON.stringify(cur) === JSON.stringify(next) ? cur : next))
  }

  const orderKey = categories.join('\n')
  // 並びが変わったら、各行を元の位置から新しい位置へ滑らせる（FLIP）
  useLayoutEffect(() => {
    const tops = new Map<string, number>()
    rowEls.current.forEach((el, c) => tops.set(c, el.offsetTop))
    if (lastOrder.current && lastOrder.current !== orderKey) {
      rowEls.current.forEach((el, c) => {
        const before = lastTops.current.get(c)
        const after = tops.get(c)
        if (before === undefined || after === undefined || before === after) return
        el.animate([{ transform: `translateY(${before - after}px)` }, { transform: 'none' }], { duration: ROW_MS, easing: ROW_EASING })
      })
    }
    lastOrder.current = orderKey
    lastTops.current = tops
    measure()
  })

  // 表の大きさが変わったとき（画面幅・文字の読み込みなど）も測り直す。見張りは1回だけ作り、測るのは最新の measure で
  const measureRef = useRef(measure)
  useLayoutEffect(() => {
    measureRef.current = measure
  })
  useLayoutEffect(() => {
    const table = tableRef.current
    if (!table) return
    const observer = new ResizeObserver(() => measureRef.current())
    observer.observe(table)
    return () => observer.disconnect()
  }, [])
  const endRowDrag = () => {
    setArmed(undefined)
    setDragging(undefined)
    setOver(undefined)
  }

  const rowIndexAt = (x: number, y: number) => {
    const tr = document.elementFromPoint(x, y)?.closest('tr[data-index]')
    return tr ? Number(tr.getAttribute('data-index')) : null
  }

  const startResize = (e: React.PointerEvent, rowIndex: number) => {
    const g = shownGroups[groupIndexOf.get(categories[rowIndex])!]
    const start = categories.indexOf(g.members[0])
    e.currentTarget.setPointerCapture(e.pointerId)
    resize.current = { id: g.id, start, end: start + g.members.length - 1, grab: rowIndex, origin: groups, prefix: uid(), moved: false, last: '' }
  }

  /**
   * バーのどこを押してもドラッグできる。範囲の外へ動かすとそこまで伸び、
   * 端の行を押して内側へ動かすとその端が縮む
   */
  const moveResize = (e: React.PointerEvent) => {
    const d = resize.current
    if (!d) return
    const t = rowIndexAt(e.clientX, e.clientY)
    const wrap = wrapRef.current
    if (wrap) pullBus.emit({ groupId: d.id, y: e.clientY - wrap.getBoundingClientRect().top })
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

  const endResize = () => {
    pullBus.emit(null)
    if (preview) onGroupsChange(preview)
    suppressClick.current = Boolean(resize.current?.moved)
    resize.current = null
    setPreview(null)
  }

  const superCell = (category: string, rowIndex: number) => {
    const gi = groupIndexOf.get(category)!
    const g = shownGroups[gi]
    const first = g.members[0] === category
    const last = g.members[g.members.length - 1] === category
    return (
      <td className="super-cell">
        <Popover
          trigger={(toggle) => (
            <div
              className="seg-hit"
              title={groupLabel(g)}
              onPointerDown={(e) => startResize(e, rowIndex)}
              onPointerMove={moveResize}
              onPointerUp={endResize}
              onPointerCancel={() => {
                pullBus.emit(null)
                resize.current = null
                setPreview(null)
              }}
              onClick={(e) => {
                if (suppressClick.current) suppressClick.current = false
                else toggle(e)
              }}
            />
          )}
        >
          {(close) => (
            <div className="group-editor">
              <label>
                名前
                <input
                  autoFocus
                  value={g.label ?? ''}
                  placeholder={g.members.join('・')}
                  onChange={(e) => onGroupsChange(updateGroup(groups, g.id, { label: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && close()}
                />
              </label>
              {/* カテゴリーの色の窓と同じ中身を、ここでは窓を重ねずにそのまま出す */}
              <div className="editor-color">
                <ColorPanel value={g.color} onChange={(c) => onGroupColorChange(g.id, c)} inUse={groupColorsInUse} />
              </div>
              <div className="editor-row">
                {g.color && (
                  <button
                    onClick={() => onRecolorMembers(g.id)}
                    title={g.members.length > 1 ? '中身のカテゴリーに、この色と似た色を割り当て直す' : 'カテゴリーの色をこの色にする'}
                  >
                    {g.members.length > 1 ? '中身に似た色を割り当てる' : 'カテゴリーにも同じ色を設定'}
                  </button>
                )}
              </div>
              <div className="muted small">中身: {g.members.join('、')}</div>
              {g.members.length > 1 && (
                <button
                  onClick={() => {
                    onGroupsChange(ungroup(groups, g.id, uid))
                    close()
                  }}
                >
                  まとめを解除
                </button>
              )}
            </div>
          )}
        </Popover>
        {/* どの行も同じ並びで出し、使えないものは無効にする（位置がずれない・スマホでも押せる） */}
        <span className="seg-actions">
          <button title="上とまとめる" disabled={!first || gi === 0} onClick={() => onGroupsChange(mergeWithNext(groups, gi - 1))}>
            ↑
          </button>
          <button
            title="下とまとめる"
            disabled={!last || gi === shownGroups.length - 1}
            onClick={() => onGroupsChange(mergeWithNext(groups, gi))}
          >
            ↓
          </button>
          <button
            title="このカテゴリーを切り離す"
            disabled={g.members.length === 1}
            onClick={() => onGroupsChange(detachCategory(groups, category, uid))}
          >
            ✂
          </button>
        </span>
      </td>
    )
  }

  return (
    <div className="legend-table">
      <div className="table-wrap" ref={wrapRef}>
      <table ref={tableRef}>
        <thead>
          <tr>
            <th aria-label="並べ替え" />
            <th>カテゴリー</th>
            <th className="num">件数</th>
            <th className="num">期間合計</th>
            <th className="num">割合</th>
            <th className="num">月平均</th>
            <th className="num">月の中央値</th>
            <th className="super-head">スーパーカテゴリー</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row, i) => (
            <tr
              key={row.category}
              ref={(el) => {
                if (el) rowEls.current.set(row.category, el)
                else rowEls.current.delete(row.category)
              }}
              data-index={i}
              className={`${dropClass(row.category)} ${fadeClass(i)} ${dragging === row.category ? 'dragging' : ''} ${justMoved === row.category ? 'just-moved' : ''}`}
              draggable={armed === row.category}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', row.category)
                setDragging(row.category)
              }}
              onDragEnd={endRowDrag}
              onDragOver={(e) => {
                if (!dragging) return
                e.preventDefault()
                setOver(row.category)
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragging && dragging !== row.category) {
                  onGroupsChange(moveCategory(groups, dragging, row.category, uid))
                  // 動かした行をしばらく目立たせ、どこへ行ったか分かるようにする
                  const moved = dragging
                  setJustMoved(moved)
                  window.setTimeout(() => setJustMoved((cur) => (cur === moved ? undefined : cur)), HIGHLIGHT_MS)
                }
                endRowDrag()
              }}
            >
              <td
                className="handle"
                title="ドラッグして並べ替え"
                onMouseDown={() => setArmed(row.category)}
                onMouseUp={() => setArmed(undefined)}
              >
                ⋮⋮
              </td>
              <td className="category-cell">
                <ColorPicker
                  value={row.color}
                  onChange={(c) => onColorChange(row.category, c)}
                  inUse={categoryColorsInUse}
                  title={`${row.category}の色（無色ならスーパーカテゴリーの色で表示）`}
                />
                {row.category || '（空欄）'}
              </td>
              <td className="num">{row.stat.count}</td>
              <td className="num">{yen(row.stat.total)}</td>
              <td className="num">{(row.stat.share * 100).toFixed(1)}%</td>
              <td className="num">{yen(row.stat.monthlyMean)}</td>
              <td className="num">{yen(row.stat.monthlyMedian)}</td>
              {superCell(row.category, i)}
            </tr>
          ))}
        </tbody>
      </table>
      <SuperBlobs layout={layout} groups={shownGroups} colorOf={groupColor} pullBus={pullBus} />
      </div>
      {rows.length > VISIBLE && (
        <button className="expand" onClick={() => setExpanded((v) => !v)}>
          {expanded ? '∧ 閉じる' : `∨ すべて表示（残り${hidden}件）`}
        </button>
      )}
    </div>
  )
}
