import { useState } from 'react'
import { detachCategory, groupLabel, mergeWithNext, moveCategory, ungroup, updateGroup, type CategoryGroup, type IdGenerator } from '../../domain/groups'
import type { RawCategoryStat } from '../../domain/raw'
import { ColorPicker } from '../ColorPicker'
import { yen } from '../format'
import { Popover } from '../Popover'
import { GroupEditor } from './GroupEditor'
import { createPullBus } from './pullBus'
import { SuperBlobs } from './SuperBlobs'
import { useBarResize } from './useBarResize'
import { useRowLayout } from './useRowLayout'
import { useRowReorder } from './useRowReorder'

export interface LegendRow {
  category: string
  stat: RawCategoryStat
  /** 未設定なら無色 */
  color?: string
  /** 3. の加工で除いている場合の説明（行を薄くして添える） */
  excluded?: string
}

interface Props {
  /** 表の行。groups の中身を順に並べたものと一致している前提 */
  rows: LegendRow[]
  groups: CategoryGroup[]
  onGroupsChange: (groups: CategoryGroup[]) => void
  onColorChange: (category: string, color: string | undefined) => void
  onGroupColorChange: (groupId: string, color: string | undefined) => void
  /** 中身のカテゴリーに大分類と似た色を割り当て直す */
  onRecolorMembers: (groupId: string) => void
  /** 色の選択に出す使用中の色（カテゴリーと大分類で別々） */
  categoryColorsInUse: string[]
  groupColorsInUse: string[]
  /** 色が未設定のときの色 */
  gray: string
  uid: IdGenerator
}

/** 最初に見せる行数。残りはフェードアウトさせて「すべて表示」で開く */
const VISIBLE = 8
/** フェードアウトさせる行の不透明度（CSS の .fade-1 / .fade-2 と揃える） */
const FADE_OPACITY = [0.45, 0.15]

/**
 * グラフの凡例を兼ねるカテゴリー別の表。
 * 左のつまみで行を並べ替え、表の横のバーで大分類（連続した行のまとめ）を作る
 */
export function CategoryLegendTable(props: Props) {
  const { rows, groups, onGroupsChange, onColorChange, onGroupColorChange, onRecolorMembers, categoryColorsInUse, groupColorsInUse, gray, uid } = props
  const [expanded, setExpanded] = useState(false)
  const [pullBus] = useState(createPullBus)

  const categories = rows.map((r) => r.category)
  const shown = expanded ? rows : rows.slice(0, VISIBLE + FADE_OPACITY.length)
  const opacityOf = (i: number) => (!expanded && i >= VISIBLE ? FADE_OPACITY[i - VISIBLE] : 1)

  const { wrapRef, tableRef, rowRef, layout } = useRowLayout(shown.map((r, i) => ({ category: r.category, opacity: opacityOf(i) })))
  const reorder = useRowReorder(categories, (moving, target) => onGroupsChange(moveCategory(groups, moving, target, uid)))
  const { shownGroups, hitProps } = useBarResize({ categories, groups, onCommit: onGroupsChange, uid, wrapRef, pullBus })

  const colorOf = new Map(rows.map((r) => [r.category, r.color]))
  const groupColor = (g: CategoryGroup) => g.color ?? (g.members.length === 1 ? colorOf.get(g.members[0]) : undefined) ?? gray

  const superCell = (category: string, rowIndex: number) => {
    const gi = shownGroups.findIndex((x) => x.members.includes(category))
    const g = shownGroups[gi]
    const first = g.members[0] === category
    const last = g.members[g.members.length - 1] === category
    return (
      <td className="super-cell">
        {/* 見た目は表の上に重ねた SuperBlobs が描く。ここは押す・ドラッグするための透明な領域 */}
        <Popover trigger={(toggle) => <div className="seg-hit" title={groupLabel(g)} {...hitProps(rowIndex, toggle)} />}>
          {(close) => (
            <GroupEditor
              group={g}
              onLabelChange={(label) => onGroupsChange(updateGroup(groups, g.id, { label }))}
              onColorChange={(c) => onGroupColorChange(g.id, c)}
              onRecolorMembers={() => onRecolorMembers(g.id)}
              onUngroup={() => onGroupsChange(ungroup(groups, g.id, uid))}
              colorsInUse={groupColorsInUse}
              close={close}
            />
          )}
        </Popover>
        {/* どの行も同じ並びで出し、使えないものは無効にする（位置がずれない・スマホでも押せる） */}
        <span className="seg-actions">
          <button title="上とまとめる" disabled={!first || gi === 0} onClick={() => onGroupsChange(mergeWithNext(groups, gi - 1))}>
            ↑
          </button>
          <button title="下とまとめる" disabled={!last || gi === shownGroups.length - 1} onClick={() => onGroupsChange(mergeWithNext(groups, gi))}>
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
              <th className="super-head">大分類</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row, i) => (
              <tr
                key={row.category}
                ref={rowRef(row.category)}
                data-index={i}
                className={`${reorder.rowClass(row.category)} ${opacityOf(i) < 1 ? `fade fade-${i - VISIBLE + 1}` : ''} ${row.excluded ? 'excluded' : ''}`}
                {...reorder.rowProps(row.category)}
              >
                <td className="handle" title="ドラッグして並べ替え" {...reorder.handleProps(row.category)}>
                  ⋮⋮
                </td>
                <td className="category-cell">
                  <ColorPicker
                    value={row.color}
                    onChange={(c) => onColorChange(row.category, c)}
                    inUse={categoryColorsInUse}
                    title={`${row.category}の色（無色なら大分類の色で表示）`}
                  />
                  {row.category || '（空欄）'}
                  {row.excluded && <span className="excluded-note">{row.excluded}</span>}
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
          {expanded ? '∧ 閉じる' : `∨ すべて表示（残り${rows.length - VISIBLE}件）`}
        </button>
      )}
    </div>
  )
}
