import { useMemo } from 'react'
import { initialView } from '../config/initial'
import { filterByMonths } from '../domain/aggregate'
import { flatten, reconcileGroups, sortByTotal } from '../domain/groups'
import { activeRules, applyProcessing, isProcessed, processedAmounts, UNASSIGNED_OFFSET, type ProcessingConfig } from '../domain/processing'
import { categoryTotals, emptyCategoryStat, rankByTotal, rawCategoryStats, rawMonthlyRows, type RawMonth, type Side } from '../domain/raw'
import { seriesStats } from '../domain/stats'
import type { Transaction } from '../domain/types'
import {
  categoryColorsInUse,
  changeGroups,
  clearColors,
  displaySeries,
  fromSide,
  groupColorsInUse,
  recolorMembers,
  setCategoryColor,
  setGroupColor,
  withSide,
  type ViewConfig,
} from '../domain/view'
import { useStoredState } from '../state/storage'
import { UndoSessionContext, useUndoable } from '../state/undo'
import { yen } from './format'
import { CategoryLegendTable, type LegendRow } from './legend/CategoryLegendTable'
import { useChartTheme } from './palette'
import { RawCharts, type BalanceMonth, type BarsSpec } from './RawCharts'
import { SummaryCard } from './SummaryCard'

interface Props {
  /** 加工する前の全取引 */
  transactions: Transaction[]
  /** 3. の加工。有効なカードを当てはめてから集計する */
  processing: ProcessingConfig
  from: string
  to: string
  /** 表示の設定（並び順・大分類・色）。書き出し・読み込みは 1. でまとめて行う */
  view: ViewConfig
  onViewChange: (view: ViewConfig) => void
  /** 棒グラフの詳細から、その月の記録を開く */
  onShowMonth: (side: Side, month: string) => void
}

/** 上のカードで切り替える表示。収支のときは、円グラフと表は支出を出す */
type Mode = 'expense' | 'income' | 'balance'
const MODES: Mode[] = ['expense', 'income', 'balance']

const uid = () => crypto.randomUUID()

/** 月ごとの収支と、期間の始めからの累積 */
function balanceMonths(rows: RawMonth[]): BalanceMonth[] {
  let cumulative = 0
  return rows.map((r) => {
    const balance = r.income - r.expense
    cumulative += balance
    return { month: r.month, balance, income: r.income, expense: r.expense, cumulative }
  })
}

/** 2. 支出と収入。カードで支出・収入・収支を切り替え、グラフと表（大分類）で中身を見る */
export function RawOverview({ transactions, processing, from, to, view, onViewChange, onShowMonth }: Props) {
  const theme = useChartTheme()
  // 表示の設定の変更はすべてここを通し、元に戻せるようにする
  // 窓（ポップアップ）が開いている間の変更は1手にまとめる
  const { set: setView, undo, canUndo, steps, session } = useUndoable(view, onViewChange)
  // どのカードを選んでいるかは見方の切り替えなので、元に戻すの対象にはしない
  const [mode, setMode] = useStoredState<Mode>('finplan.overviewMode', 'expense')
  const side: Side = mode === 'income' ? 'income' : 'expense'

  const processed = useMemo(() => applyProcessing(transactions, processing), [transactions, processing])
  // 3. の加工がかかっている側は「加工後」と出す（実収入・実支出は、移動だけを除いた場合の家計調査の言葉なのでとっておく）
  const labels: Record<Mode, string> = {
    expense: isProcessed(processing, 'expense') ? '支出（加工後）' : '支出',
    income: isProcessed(processing, 'income') ? '収入（加工後）' : '収入',
    balance: '収支',
  }

  const inPeriod = useMemo(() => filterByMonths(processed, from, to), [processed, from, to])
  const rows = useMemo(() => rawMonthlyRows(inPeriod, from, to), [inPeriod, from, to])
  const monthly = useMemo<Record<Mode, number[]>>(
    () => ({
      expense: rows.map((r) => r.expense),
      income: rows.map((r) => r.income),
      balance: rows.map((r) => r.income - r.expense),
    }),
    [rows],
  )
  const summaries = useMemo(
    () => Object.fromEntries(MODES.map((m) => [m, seriesStats(monthly[m])])) as Record<Mode, ReturnType<typeof seriesStats>>,
    [monthly],
  )
  const stats = useMemo(() => new Map(rawCategoryStats(inPeriod, rows, side).map((s) => [s.category, s])), [inPeriod, rows, side])

  // 表の行は、加工する前の全データで記録のあるカテゴリーすべて（期間や加工を変えても表が動かないように）。
  // 支出と収入で並び順・まとめは別に持つ
  const totals = useMemo(() => categoryTotals(transactions, side), [transactions, side])
  const sideView = useMemo(() => withSide(view, side), [view, side])
  const groups = useMemo(() => reconcileGroups(sideView.groups, rankByTotal(totals)), [sideView.groups, totals])
  // 編集はすべて、データに合わせた後の設定を元にし、結果を支出側・収入側の元の場所に戻す
  const current = useMemo(() => ({ ...sideView, groups }), [sideView, groups])
  const edit = (next: ViewConfig) => setView(fromSide(view, side, next))

  /** 3. の加工でこの行に起きていること（行を薄くして添える） */
  // 条件はカテゴリーより細かく指定できるので、この期間に実際に除外・相殺した金額を添える
  const amounts = useMemo(() => processedAmounts(filterByMonths(transactions, from, to), processing), [transactions, from, to, processing])
  const processedNote = (c: string) => {
    const a = amounts[side].get(c)
    if (!a) return undefined
    return [a.excluded && `除外 −${yen(a.excluded)}`, a.offset && `相殺 −${yen(a.offset)}`].filter(Boolean).join('・')
  }
  const legendRows: LegendRow[] = flatten(groups).map((c) => ({
    category: c,
    stat: stats.get(c) ?? emptyCategoryStat(c),
    color: view.colors[c],
    excluded: processedNote(c),
  }))

  // グラフは重いので、系列とデータは関係する値が変わったときだけ作り直す
  // 相殺で差し引いた分により期間合計がマイナスになる系列も残す（円グラフの内側の輪・棒グラフの0の下に出す）
  const unassigned = stats.get(UNASSIGNED_OFFSET)
  const series = useMemo(() => {
    const list = displaySeries(current).map((s) => ({
      ...s,
      color: s.color ?? theme.other,
      total: s.members.reduce((sum, m) => sum + (stats.get(m)?.total ?? 0), 0),
    }))
    // 差し引く先を指定しない相殺は、どのカテゴリーにも属さない系列として最後に足す
    if (unassigned?.total) list.push({ key: UNASSIGNED_OFFSET, label: UNASSIGNED_OFFSET, color: theme.other, members: [UNASSIGNED_OFFSET], total: unassigned.total })
    return list.filter((s) => s.total !== 0)
  }, [current, stats, theme, unassigned])
  const bars = useMemo<BarsSpec>(
    () =>
      mode === 'balance'
        ? { kind: 'balance', data: balanceMonths(rows) }
        : {
            kind: 'stacked',
            data: rows.map((r) => {
              // 0 の系列はツールチップに出さない
              const d: Record<string, number | string | undefined> = { month: r.month, total: r[side] }
              series.forEach((s, i) => (d[`s${i}`] = s.members.reduce((sum, m) => sum + (r.byCategory[side][m] ?? 0), 0) || undefined))
              return d
            }),
          },
    [mode, rows, series, side],
  )

  const activeLabels = [activeRules(processing, 'offset').length && '相殺', activeRules(processing, 'exclude').length && '除外'].filter(Boolean)

  return (
    <UndoSessionContext.Provider value={session}>
      <div>
        <p className="muted small">
          マイナスの記録を支出、プラスの記録を収入として合計しています。
          {activeLabels.length
            ? `3. の加工（${activeLabels.join('・')}）を反映しています。`
            : '3. の加工はまだ反映していません（貯金・口座移動なども含まれます）。'}
          カードを押すと、下のグラフと表が切り替わります（収支のときは、月ごとの収支と累積収支のグラフになります）。棒を押すと、その月の内訳と記録を見られます。
        </p>
        <div className="summary-cards">
          {MODES.map((m) => (
            <SummaryCard
              key={m}
              label={labels[m]}
              stats={summaries[m]}
              selected={mode === m}
              onSelect={() => setMode(m)}
            />
          ))}
        </div>

        <RawCharts
          pieTitle={`${labels[side]}のカテゴリー別の割合`}
          series={series}
          barTitle={mode === 'balance' ? '月ごとの収支' : `月ごとの${labels[side]}`}
          bars={bars}
          mean={summaries[mode].mean}
          median={summaries[mode].median}
          theme={theme}
          side={side}
          onShowMonth={onShowMonth}
        />

        {/* 収支のときはカテゴリーの内訳を見ないので、表とその操作を出さない */}
        {mode !== 'balance' && (
          <>
            <div className="row">
              <h3>{labels[side]}のカテゴリー</h3>
              <label>
                <input
                  type="checkbox"
                  checked={view.useSuperCategories}
                  onChange={(e) => edit({ ...current, useSuperCategories: e.target.checked })}
                />
                グラフを大分類でまとめる
              </label>
              <span className="muted small">
                表の順番がグラフの順番（棒グラフは下から）です。左のつまみ（⋮⋮）で並べ替え、右のバーの端をドラッグするか ↑↓ で大分類にまとめます。
              </span>
            </div>
            {unassigned?.total ? (
              <p className="muted small">
                {UNASSIGNED_OFFSET}: 期間合計 {yen(unassigned.total)}（どのカテゴリーにも付けずに、{labels[side]}全体から差し引いた分。グラフでは灰色）
              </p>
            ) : null}
            <CategoryLegendTable
              rows={legendRows}
              groups={groups}
              onGroupsChange={(g) => edit(changeGroups(current, g))}
              onColorChange={(category, color) => edit(setCategoryColor(current, category, color))}
              onGroupColorChange={(id, color) => edit(setGroupColor(current, id, color))}
              onRecolorMembers={(id) => edit(recolorMembers(current, id))}
              categoryColorsInUse={categoryColorsInUse(current)}
              groupColorsInUse={groupColorsInUse(current)}
              gray={theme.other}
              uid={uid}
            />
            <div className="row">
              <button onClick={undo} disabled={!canUndo} title={`Ctrl+Z / ⌘Z でも戻せます（あと${steps}手）`}>
                ↶ 元に戻す
              </button>
              <button onClick={() => edit({ ...current, groups: sortByTotal(groups, totals) })}>多い順に並べ替える</button>
              <button
                onClick={() => edit(clearColors(current))}
                disabled={!categoryColorsInUse(current).length && !groupColorsInUse(current).length}
              >
                色をすべて消す
              </button>
              {/* 元に戻せるので、確認は出さない */}
              <button onClick={() => setView(initialView)}>表示の設定をすべて初期に戻す</button>
            </div>
          </>
        )}
      </div>
    </UndoSessionContext.Provider>
  )
}
