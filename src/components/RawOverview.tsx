import { useMemo, useState } from 'react'
import { initialView } from '../config/initial'
import { filterByMonths } from '../domain/aggregate'
import { emptyCategoryStat, expenseRanking, expenseTotals, rawExpenseByCategory, rawMonthlyRows } from '../domain/raw'
import { seriesStats } from '../domain/stats'
import type { Transaction } from '../domain/types'
import { flatten, reconcileGroups, sortByTotal } from '../domain/groups'
import { applyProcessing, excludedCategories, hasActiveModule, type ProcessingConfig } from '../domain/processing'
import {
  categoryColorsInUse,
  changeGroups,
  clearColors,
  displaySeries,
  groupColorsInUse,
  parseViewConfig,
  recolorMembers,
  setCategoryColor,
  setGroupColor,
  type ViewConfig,
} from '../domain/view'
import { useStoredState } from '../state/storage'
import { UndoSessionContext, useUndoable } from '../state/undo'
import { CategoryLegendTable, type LegendRow } from './legend/CategoryLegendTable'
import { yen } from './format'
import { JsonExportDialog } from './JsonExportDialog'
import { useChartTheme } from './palette'
import { RawCharts } from './RawCharts'
import { StatTiles } from './StatTiles'

interface Props {
  /** 加工する前の全取引 */
  transactions: Transaction[]
  /** 3. の加工。有効なカードを当てはめてから集計する */
  processing: ProcessingConfig
  from: string
  to: string
}

const uid = () => crypto.randomUUID()

/** 加工なしの概要。CSVのカテゴリーと金額の符号だけで集計する（スーパーカテゴリーは表示上のまとめ） */
export function RawOverview({ transactions, processing, from, to }: Props) {
  const theme = useChartTheme()
  const [view, saveView] = useStoredState<ViewConfig>('finplan.view', initialView, parseViewConfig)
  // 表示の設定の変更はすべてここを通し、元に戻せるようにする
  // 窓（ポップアップ）が開いている間の変更は1手にまとめる
  const { set: setView, undo, canUndo, steps, session } = useUndoable(view, saveView)
  /** 書き出す画面に出している設定（開いた時点のもの） */
  const [exporting, setExporting] = useState<ViewConfig | null>(null)

  const processed = useMemo(() => applyProcessing(transactions, processing), [transactions, processing])
  const excluded = useMemo(() => excludedCategories(processing), [processing])
  const realIncome = hasActiveModule(processing, 'excludeIncome')
  const realExpense = hasActiveModule(processing, 'excludeExpense')
  const inPeriod = useMemo(() => filterByMonths(processed, from, to), [processed, from, to])
  const rows = useMemo(() => rawMonthlyRows(inPeriod, from, to), [inPeriod, from, to])
  const stats = useMemo(() => new Map(rawExpenseByCategory(inPeriod, rows).map((s) => [s.category, s])), [inPeriod, rows])
  const expense = seriesStats(rows.map((r) => r.expense))
  const income = seriesStats(rows.map((r) => r.income))

  // 表の行は、加工する前の全データで支出のあるカテゴリーすべて（期間や加工を変えても表が動かないように）
  const totals = useMemo(() => expenseTotals(transactions), [transactions])
  const groups = useMemo(() => reconcileGroups(view.groups, expenseRanking(totals)), [view.groups, totals])
  // 編集はすべて、データに合わせた後の設定を元にする
  const current = useMemo(() => ({ ...view, groups }), [view, groups])
  const legendRows: LegendRow[] = flatten(groups).map((c) => ({
    category: c,
    stat: stats.get(c) ?? emptyCategoryStat(c),
    color: view.colors[c],
    excluded: excluded.expense.has(c) ? '実支出から除外中' : undefined,
  }))

  // グラフは重いので、系列とデータは関係する値が変わったときだけ作り直す
  const series = useMemo(
    () =>
      displaySeries(current)
        .map((s) => ({ ...s, color: s.color ?? theme.other, total: s.members.reduce((sum, m) => sum + (stats.get(m)?.total ?? 0), 0) }))
        .filter((s) => s.total > 0),
    [current, stats, theme],
  )
  const barData = useMemo(
    () =>
      rows.map((r) => {
        // 0 の系列はツールチップに出さない
        const d: Record<string, number | string | undefined> = { month: r.month, total: r.expense }
        series.forEach((s, i) => (d[`s${i}`] = s.members.reduce((sum, m) => sum + (r.expenseByCategory[m] ?? 0), 0) || undefined))
        return d
      }),
    [rows, series],
  )

  async function importView(file: File) {
    try {
      setView(parseViewConfig(JSON.parse(await file.text())))
    } catch (e) {
      alert(`表示の設定を読み込めませんでした: ${e instanceof Error ? e.message : e}`)
    }
  }

  return (
    <UndoSessionContext.Provider value={session}>
      <div>
        <p className="muted small">
          マイナスの記録を支出、プラスの記録を収入として合計しています。
          {realIncome || realExpense
            ? `3. の加工（${[realIncome && '実収入', realExpense && '実支出'].filter(Boolean).join('・')}）を反映しています。`
            : '3. の加工はまだ反映していません（貯金・口座移動なども含まれます）。'}
        </p>
        <StatTiles
          tiles={[
            { label: `${realExpense ? '実支出' : '支出'} 月平均`, value: expense.mean, note: `${expense.count}か月` },
            { label: `${realExpense ? '実支出' : '支出'} 中央値`, value: expense.median, note: `最小 ${yen(expense.min)} / 最大 ${yen(expense.max)}` },
            { label: `${realIncome ? '実収入' : '収入'} 月平均`, value: income.mean },
            { label: `${realIncome ? '実収入' : '収入'} 中央値`, value: income.median },
          ]}
        />

        <RawCharts series={series} barData={barData} mean={expense.mean} median={expense.median} theme={theme} />

        <div className="row">
          <label>
            <input
              type="checkbox"
              checked={view.useSuperCategories}
              onChange={(e) => setView({ ...current, useSuperCategories: e.target.checked })}
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
          onGroupsChange={(g) => setView(changeGroups(current, g))}
          onColorChange={(category, color) => setView(setCategoryColor(current, category, color))}
          onGroupColorChange={(id, color) => setView(setGroupColor(current, id, color))}
          onRecolorMembers={(id) => setView(recolorMembers(current, id))}
          categoryColorsInUse={categoryColorsInUse(current)}
          groupColorsInUse={groupColorsInUse(current)}
          gray={theme.other}
          uid={uid}
        />
        <div className="row">
          <button onClick={undo} disabled={!canUndo} title={`Ctrl+Z / ⌘Z でも戻せます（あと${steps}手）`}>
            ↶ 元に戻す
          </button>
          <button onClick={() => setView({ ...current, groups: sortByTotal(groups, totals) })}>多い順に並べ替える</button>
          <button
            onClick={() => setView(clearColors(current))}
            disabled={!categoryColorsInUse(current).length && !groupColorsInUse(current).length}
          >
            色をすべて消す
          </button>
          {/* 元に戻せるので、確認は出さない */}
          <button onClick={() => setView(initialView)}>
            表示の設定をすべて初期に戻す
          </button>
          {/* 並び順をすべて残すため、データに合わせた後の設定を書き出す */}
          <button onClick={() => setExporting(current)}>表示の設定を書き出す</button>
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
      <JsonExportDialog data={exporting} filename="finplan-view.json" title="表示の設定" onClose={() => setExporting(null)} />
    </UndoSessionContext.Provider>
  )
}
