import { Fragment, useState } from 'react'
import type { RawCategoryStat } from '../domain/raw'
import { moveKey, type SuperCategory } from '../domain/view'
import { ColorInput } from './ColorInput'
import { yen } from './format'
import { SuperCategorySelect } from './SuperCategorySelect'

export interface LegendItem {
  /** 表示名（カテゴリー名またはスーパーカテゴリー名） */
  key: string
  color: string
  stat: RawCategoryStat
  /** スーパーカテゴリーとしてまとめて表示している場合の中身 */
  members?: RawCategoryStat[]
}

export interface SuperHandlers {
  superCategories: SuperCategory[]
  superIdOf: (category: string) => string | null
  onSelect: (category: string, superId: string | null) => void
  onCreate: (category: string, label: string) => void
  onRename: (superId: string, label: string) => void
  onDelete: (superId: string) => void
}

interface Props {
  items: LegendItem[]
  onReorder: (moving: string, target: string) => void
  onColorChange: (key: string, color: string) => void
  supers: SuperHandlers
}

/** 最初に見せる行数。残りはフェードアウトさせて「すべて表示」で開く */
const VISIBLE = 8
const FADE_ROWS = 2

/** グラフの凡例を兼ねるカテゴリー別の表。行のつまみをドラッグして並べ替えると、グラフの順番も変わる */
export function CategoryLegendTable({ items, onReorder, onColorChange, supers }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [armed, setArmed] = useState<string>()
  const [dragging, setDragging] = useState<string>()
  const [over, setOver] = useState<string>()

  const keys = items.map((i) => i.key)
  const hidden = expanded ? 0 : Math.max(0, items.length - VISIBLE)
  const shown = expanded ? items : items.slice(0, VISIBLE + FADE_ROWS)

  const dropClass = (key: string) => {
    if (!dragging || over !== key || dragging === key) return ''
    return keys.indexOf(dragging) < keys.indexOf(key) ? 'drop-after' : 'drop-before'
  }
  const fadeClass = (i: number) => (!expanded && i >= VISIBLE ? `fade fade-${i - VISIBLE + 1}` : '')
  const endDrag = () => {
    setArmed(undefined)
    setDragging(undefined)
    setOver(undefined)
  }

  const dropHandlers = (key: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragging) return
      e.preventDefault()
      setOver(key)
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      if (dragging && moveKey(keys, dragging, key) !== keys) onReorder(dragging, key)
      endDrag()
    },
  })

  const superCell = (category: string) => (
    <SuperCategorySelect
      superCategories={supers.superCategories}
      value={supers.superIdOf(category)}
      onSelect={(id) => supers.onSelect(category, id)}
      onCreate={(label) => supers.onCreate(category, label)}
      onRename={supers.onRename}
      onDelete={supers.onDelete}
    />
  )

  const numbers = (s: RawCategoryStat) => (
    <>
      <td className="num">{s.count}</td>
      <td className="num">{yen(s.total)}</td>
      <td className="num">{(s.share * 100).toFixed(1)}%</td>
      <td className="num">{yen(s.monthlyMean)}</td>
      <td className="num">{yen(s.monthlyMedian)}</td>
    </>
  )

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
            <th>スーパーカテゴリー</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((item, i) => (
            <Fragment key={item.key}>
              <tr
                className={`${dropClass(item.key)} ${fadeClass(i)} ${dragging === item.key ? 'dragging' : ''}`}
                draggable={armed === item.key}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', item.key)
                  setDragging(item.key)
                }}
                onDragEnd={endDrag}
                {...dropHandlers(item.key)}
              >
                <td
                  className="handle"
                  title="ドラッグして並べ替え"
                  onMouseDown={() => setArmed(item.key)}
                  onMouseUp={() => setArmed(undefined)}
                >
                  ⋮⋮
                </td>
                <td>
                  <ColorInput value={item.color} onChange={(c) => onColorChange(item.key, c)} title={`${item.key}の色を変える`} />
                  {item.members ? <strong>{item.key}</strong> : item.key || '（空欄）'}
                </td>
                {numbers(item.stat)}
                <td>{item.members ? <span className="muted small">{item.members.length}件をまとめて表示</span> : superCell(item.key)}</td>
              </tr>
              {item.members?.map((m) => (
                <tr key={m.category} className={`member ${fadeClass(i)}`} {...dropHandlers(item.key)}>
                  <td />
                  <td className="member-name">{m.category}</td>
                  {numbers(m)}
                  <td>{superCell(m.category)}</td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
      {items.length > VISIBLE && (
        <button className="expand" onClick={() => setExpanded((v) => !v)}>
          {expanded ? '∧ 閉じる' : `∨ すべて表示（残り${hidden}件）`}
        </button>
      )}
    </div>
  )
}
