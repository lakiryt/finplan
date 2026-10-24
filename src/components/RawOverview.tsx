import { useMemo } from 'react'
import { initialView } from '../config/initial'
import { filterByMonths } from '../domain/aggregate'
import { expenseRanking, rawExpenseByCategory, rawMonthlyRows, type RawCategoryStat } from '../domain/raw'
import { seriesStats } from '../domain/stats'
import type { Transaction } from '../domain/types'
import {
  categoryColorsInUse,
  colorJoinedMembers,
  groupColorsInUse,
  displaySeries,
  flatten,
  parseViewConfig,
  reconcileGroups,
  recolorMembers,
  setGroupColor,
  sortByTotal,
  type ViewConfig,
} from '../domain/view'
import { downloadJson, useStoredState } from '../state/storage'
import { CategoryLegendTable, type LegendRow } from './CategoryLegendTable'
import { yen } from './format'
import { useChartTheme } from './palette'
import { RawCharts } from './RawCharts'
import { StatTiles } from './StatTiles'

interface Props {
  transactions: Transaction[]
  from: string
  to: string
}

const uid = () => crypto.randomUUID()

/** 加工なしの概要。CSVのカテゴリーと金額の符号だけで集計する（スーパーカテゴリーは表示上のまとめ） */
export function RawOverview({ transactions, from, to }: Props) {
  const theme = useChartTheme()
  const [view, setView] = useStoredState<ViewConfig>('finplan.view', initialView, parseViewConfig)

  const inPeriod = useMemo(() => filterByMonths(transactions, from, to), [transactions, from, to])
  const rows = useMemo(() => rawMonthlyRows(inPeriod, from, to), [inPeriod, from, to])
  const stats = useMemo(() => new Map(rawExpenseByCategory(inPeriod, rows).map((s) => [s.category, s])), [inPeriod, rows])
  const expense = seriesStats(rows.map((r) => r.expense))
  const income = seriesStats(rows.map((r) => r.income))

  // 表の行は、全データで支出のあるカテゴリーすべて（期間を変えても表が動かないように）
  const ranking = useMemo(() => expenseRanking(transactions), [transactions])
  const groups = useMemo(() => reconcileGroups(view.groups, ranking), [view.groups, ranking])
  const zero = (category: string): RawCategoryStat => ({ category, count: 0, total: 0, monthlyMean: 0, monthlyMedian: 0, share: 0 })
  const legendRows: LegendRow[] = flatten(groups).map((c) => ({ category: c, stat: stats.get(c) ?? zero(c), color: view.colors[c] }))

  // グラフは重いので、系列とデータは関係する値が変わったときだけ作り直す
  const { useSuperCategories, colors } = view
  const series = useMemo(
    () =>
      displaySeries(groups, { useSuperCategories, colors })
        .map((s) => ({ ...s, color: s.color ?? theme.other, total: s.members.reduce((sum, m) => sum + (stats.get(m)?.total ?? 0), 0) }))
        .filter((s) => s.total > 0),
    [groups, useSuperCategories, colors, stats, theme],
  )
  const barData = useMemo(
    () =>
      rows.map((r) => {
        // 0 の系列はツールチップに出さない
        const d: Record<string, number | string | undefined> = { month: r.month }
        series.forEach((s, i) => (d[`s${i}`] = s.members.reduce((sum, m) => sum + (r.expenseByCategory[m] ?? 0), 0) || undefined))
        return d
      }),
    [rows, series],
  )

  const setColor = (category: string, color: string | undefined) => {
    const colors = { ...view.colors }
    if (color) colors[category] = color
    else delete colors[category]
    setView({ ...view, colors })
  }
  const setGroupColorAndMembers = (id: string, color: string | undefined) => {
    const next = setGroupColor(groups, view.colors, id, color)
    setView({ ...view, ...next })
  }

  async function importView(file: File) {
    try {
      setView(parseViewConfig(JSON.parse(await file.text())))
    } catch (e) {
      alert(`表示の設定を読み込めませんでした: ${e instanceof Error ? e.message : e}`)
    }
  }

  const totals = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of transactions) if (t.amount < 0) m.set(t.category, (m.get(t.category) ?? 0) - t.amount)
    return m
  }, [transactions])

  return (
    <div>
      <p className="muted small">
        CSVの記録をそのまま集計しています（マイナスを支出、プラスを収入として合計）。家賃・貯金・口座移動なども含まれます。
      </p>
      <StatTiles
        tiles={[
          { label: '支出 月平均', value: expense.mean, note: `${expense.count}か月` },
          { label: '支出 中央値', value: expense.median, note: `最小 ${yen(expense.min)} / 最大 ${yen(expense.max)}` },
          { label: '収入 月平均', value: income.mean },
          { label: '収入 中央値', value: income.median },
        ]}
      />

      <RawCharts series={series} barData={barData} mean={expense.mean} median={expense.median} theme={theme} />

      <div className="row">
        <label>
          <input
            type="checkbox"
            checked={view.useSuperCategories}
            onChange={(e) => setView({ ...view, useSuperCategories: e.target.checked })}
          />
          グラフをスーパーカテゴリーでまとめる
        </label>
        <span className="muted small">
          表の順番がグラフの順番（棒グラフは下から）です。左のつまみ（⋮⋮）で並べ替え、右のバーの端をドラッグするか ↑↓ でスーパーカテゴリーにまとめます。
        </span>
      </div>
      <CategoryLegendTable
        rows={legendRows}
        groups={groups}
        // 色付きのスーパーカテゴリーに無色のカテゴリーが加わったら、似た色を割り当てる
        onGroupsChange={(g) => setView({ ...view, groups: g, colors: colorJoinedMembers(groups, g, view.colors) })}
        onColorChange={setColor}
        onGroupColorChange={setGroupColorAndMembers}
        onRecolorMembers={(id) => setView({ ...view, colors: recolorMembers(groups, view.colors, id) })}
        categoryColorsInUse={categoryColorsInUse(view)}
        groupColorsInUse={groupColorsInUse(groups)}
        gray={theme.other}
        uid={uid}
      />
      <div className="row">
        <button onClick={() => setView({ ...view, groups: sortByTotal(groups, totals) })}>多い順に並べ替える</button>
        <button
          onClick={() => setView({ ...view, colors: {}, groups: groups.map(({ id, label, members }) => ({ id, label, members })) })}
          disabled={!categoryColorsInUse(view).length && !groupColorsInUse(groups).length}
        >
          色をすべて消す
        </button>
        <button onClick={() => confirm('表示の設定（色・並び順・スーパーカテゴリー）を初期状態に戻しますか？') && setView(initialView)}>
          表示の設定をすべて初期に戻す
        </button>
        {/* 並び順をすべて残すため、データに合わせた後のグループで書き出す */}
        <button onClick={() => downloadJson('finplan-view.json', { ...view, groups })}>表示の設定を書き出す</button>
        <label className="button">
          表示の設定を読み込む
          <input
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) importView(file)
              e.target.value = ''
            }}
          />
        </label>
      </div>
    </div>
  )
}
