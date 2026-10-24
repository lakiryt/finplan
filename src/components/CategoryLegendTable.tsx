import { useRef, useState } from 'react'
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
} from '../domain/view'
import { ColorInput } from './ColorInput'
import { yen } from './format'
import { Popover } from './Popover'

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
  /** 色が未設定のときの色 */
  gray: string
  uid: IdGenerator
}

/** 最初に見せる行数。残りはフェードアウトさせて「すべて表示」で開く */
const VISIBLE = 8
const FADE_ROWS = 2

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
}

/**
 * グラフの凡例を兼ねるカテゴリー別の表。
 * 左のつまみで行を並べ替え、表の横のバーでスーパーカテゴリー（連続した行のまとめ）を作る
 */
export function CategoryLegendTable({ rows, groups, onGroupsChange, onColorChange, gray, uid }: Props) {
  const [expanded, setExpanded] = useState(false)
  // 行の並べ替え
  const [armed, setArmed] = useState<string>()
  const [dragging, setDragging] = useState<string>()
  const [over, setOver] = useState<string>()
  // バーの伸び縮み
  const resize = useRef<ResizeDrag | null>(null)
  const suppressClick = useRef(false)
  const [preview, setPreview] = useState<CategoryGroup[] | null>(null)

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
    resize.current = { id: g.id, start, end: start + g.members.length - 1, grab: rowIndex, origin: groups, prefix: uid(), moved: false }
  }

  /**
   * バーのどこを押してもドラッグできる。範囲の外へ動かすとそこまで伸び、
   * 端の行を押して内側へ動かすとその端が縮む
   */
  const moveResize = (e: React.PointerEvent) => {
    const d = resize.current
    if (!d) return
    const t = rowIndexAt(e.clientX, e.clientY)
    if (t === null) return
    if (t !== d.grab) d.moved = true
    let [a, b] = [d.start, d.end]
    if (t > d.end) b = t
    else if (t < d.start) a = t
    else if (d.grab === d.end && d.start !== d.end) b = t
    else if (d.grab === d.start && d.start !== d.end) a = t
    setPreview(a === d.start && b === d.end ? null : resizeGroup(d.origin, d.id, a, b, seqUid(d.prefix)))
  }

  const endResize = () => {
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
    const color = g.color ?? (g.members.length === 1 ? colorOf.get(category) : undefined) ?? gray
    return (
      <td className="super-cell">
        <Popover
          trigger={(toggle) => (
            <div
              className={`seg ${first ? '' : 'join-up'} ${last ? '' : 'join-down'}`}
              style={{ background: color }}
              title={groupLabel(g)}
              onPointerDown={(e) => startResize(e, rowIndex)}
              onPointerMove={moveResize}
              onPointerUp={endResize}
              onPointerCancel={() => {
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
              <label>
                色
                <ColorInput value={g.color ?? gray} onChange={(c) => onGroupsChange(updateGroup(groups, g.id, { color: c }))} />
                {g.color && <button onClick={() => onGroupsChange(updateGroup(groups, g.id, { color: undefined }))}>色を消す</button>}
              </label>
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
        <span className="seg-actions">
          {first && gi > 0 && (
            <button title="上とまとめる" onClick={() => onGroupsChange(mergeWithNext(groups, gi - 1))}>
              ↑
            </button>
          )}
          {last && gi < shownGroups.length - 1 && (
            <button title="下とまとめる" onClick={() => onGroupsChange(mergeWithNext(groups, gi))}>
              ↓
            </button>
          )}
          {g.members.length > 1 && (
            <button title="このカテゴリーを切り離す" onClick={() => onGroupsChange(detachCategory(groups, category, uid))}>
              ✂
            </button>
          )}
        </span>
      </td>
    )
  }

  return (
    <div className="legend-table">
      <table>
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
              data-index={i}
              className={`${dropClass(row.category)} ${fadeClass(i)} ${dragging === row.category ? 'dragging' : ''}`}
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
                if (dragging && dragging !== row.category) onGroupsChange(moveCategory(groups, dragging, row.category, uid))
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
                <ColorInput value={row.color ?? gray} onChange={(c) => onColorChange(row.category, c)} title={`${row.category}の色を変える`} />
                {row.category || '（空欄）'}
                {row.color && (
                  <button className="clear-color" title="色を消す" onClick={() => onColorChange(row.category, undefined)}>
                    ×
                  </button>
                )}
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
      {rows.length > VISIBLE && (
        <button className="expand" onClick={() => setExpanded((v) => !v)}>
          {expanded ? '∧ 閉じる' : `∨ すべて表示（残り${hidden}件）`}
        </button>
      )}
    </div>
  )
}
