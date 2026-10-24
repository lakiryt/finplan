import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { filterByMonths } from '../domain/aggregate'
import { expenseRanking, rawExpenseByCategory, rawMonthlyRows } from '../domain/raw'
import { seriesStats } from '../domain/stats'
import type { Transaction } from '../domain/types'
import {
  applyDisplayNames,
  assignColors,
  assignSuper,
  createSuper,
  defaultView,
  deleteSuper,
  moveKey,
  orderKeys,
  parseViewConfig,
  renameSuper,
  superLabel,
  superOf,
  type ViewConfig,
} from '../domain/view'
import { useStoredState } from '../state/storage'
import { CategoryLegendTable, type LegendItem } from './CategoryLegendTable'
import { PaletteList } from './ColorInput'
import { ExpensePie } from './ExpensePie'
import { man, yen } from './format'
import { useChartTheme } from './palette'
import { StatTiles } from './StatTiles'

interface Props {
  transactions: Transaction[]
  from: string
  to: string
}

/** 加工なしの概要。CSVのカテゴリーと金額の符号だけで集計する（スーパーカテゴリーは表示上のまとめ） */
export function RawOverview({ transactions, from, to }: Props) {
  const theme = useChartTheme()
  const [view, setView] = useStoredState<ViewConfig>('finplan.view', defaultView, parseViewConfig)

  const displayed = useMemo(() => applyDisplayNames(transactions, view), [transactions, view])
  const inPeriod = useMemo(() => filterByMonths(displayed, from, to), [displayed, from, to])
  const rows = useMemo(() => rawMonthlyRows(inPeriod, from, to), [inPeriod, from, to])
  const stats = useMemo(() => rawExpenseByCategory(inPeriod, rows), [inPeriod, rows])
  const expense = seriesStats(rows.map((r) => r.expense))
  const income = seriesStats(rows.map((r) => r.income))

  // スーパーカテゴリーの中身の内訳用（まとめる前のカテゴリーで集計）
  const memberStats = useMemo(() => {
    const txs = filterByMonths(transactions, from, to)
    return rawExpenseByCategory(txs, rawMonthlyRows(txs, from, to))
  }, [transactions, from, to])

  // 並び順と色は全データで決める（期間を変えても変わらないように）
  const allKeys = useMemo(() => {
    const ranking = expenseRanking(displayed)
    return orderKeys(ranking, view.order, ranking)
  }, [displayed, view.order])
  const colors = useMemo(
    () => assignColors(allKeys, view.colors, theme.series, theme.other),
    [allKeys, view.colors, theme.series, theme.other],
  )

  const items: LegendItem[] = allKeys.flatMap((key) => {
    const stat = stats.find((s) => s.category === key)
    if (!stat) return []
    const sc = view.useSuperCategories ? view.superCategories.find((s) => superLabel(s) === key) : undefined
    const members = sc && memberStats.filter((m) => sc.members.includes(m.category))
    return [{ key, color: colors[key], stat, members: members?.length ? members : undefined }]
  })

  const barData = rows.map((r) => {
    // 0 の項目はツールチップに出さない
    const d: Record<string, number | string | undefined> = { month: r.month }
    for (const { key } of items) d[key] = r.expenseByCategory[key] || undefined
    return d
  })

  const setColor = (key: string, color: string) => setView({ ...view, colors: { ...view.colors, [key]: color } })

  return (
    <div>
      <PaletteList colors={theme.series} />
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

      <div className="charts">
        <div>
          <h3>支出のカテゴリー別の割合</h3>
          <ExpensePie
            slices={items.map((i) => ({ key: i.key, label: i.key, value: i.stat.total, color: i.color }))}
            surface={theme.surface}
            ink={theme.ink}
            grid={theme.grid}
          />
        </div>
        <div>
          <h3>月ごとの支出</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barData} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={theme.grid} />
              <XAxis dataKey="month" stroke={theme.axis} tick={{ fill: theme.muted, fontSize: 12 }} tickLine={false} />
              <YAxis tickFormatter={man} stroke={theme.axis} tick={{ fill: theme.muted, fontSize: 12 }} tickLine={false} axisLine={false} width={48} />
              <Tooltip
                formatter={(v, key) => [yen(Number(v)), key]}
                itemSorter={(item) => -Number(item.value)}
                contentStyle={{ background: theme.surface, borderColor: theme.grid, color: theme.ink }}
                cursor={{ fill: theme.grid, opacity: 0.5 }}
              />
              {items.map(({ key, color }, i) => (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId="a"
                  fill={color}
                  stroke={theme.surface}
                  strokeWidth={1}
                  radius={i === items.length - 1 ? [4, 4, 0, 0] : 0}
                  maxBarSize={28}
                  isAnimationActive={false}
                />
              ))}
              <ReferenceLine
                y={expense.mean}
                stroke={theme.ink}
                strokeDasharray="4 4"
                label={{ value: `平均 ${yen(expense.mean)}`, position: 'insideTopRight', fill: theme.ink, fontSize: 12 }}
              />
              <ReferenceLine
                y={expense.median}
                stroke={theme.muted}
                strokeDasharray="1 3"
                label={{ value: `中央値 ${yen(expense.median)}`, position: 'insideBottomRight', fill: theme.ink, fontSize: 12 }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="row">
        <label>
          <input
            type="checkbox"
            checked={view.useSuperCategories}
            onChange={(e) => setView({ ...view, useSuperCategories: e.target.checked })}
          />
          スーパーカテゴリーでまとめる
        </label>
        <span className="muted small">
          表の順番がグラフの順番（棒グラフは下から）です。つまみ（⋮⋮）をドラッグして並べ替え、色見本を押すと色を変えられます。
          上から{theme.series.length}件に色が付き、残りは灰色になります。
        </span>
      </div>
      <CategoryLegendTable
        items={items}
        onReorder={(moving, target) => setView({ ...view, order: moveKey(allKeys, moving, target) })}
        onColorChange={setColor}
        supers={{
          superCategories: view.superCategories,
          superIdOf: (c) => superOf(view, c)?.id ?? null,
          onSelect: (c, id) => setView(assignSuper(view, c, id)),
          onCreate: (c, label) => setView(createSuper(view, crypto.randomUUID(), label, c)),
          onRename: (id, label) => setView(renameSuper(view, id, label)),
          onDelete: (id) => setView(deleteSuper(view, id)),
        }}
      />
      <div className="row">
        <button onClick={() => setView({ ...view, order: [] })} disabled={!view.order.length}>
          並び順を初期に戻す（支出の多い順）
        </button>
        <button onClick={() => setView({ ...view, colors: {} })} disabled={!Object.keys(view.colors).length}>
          色を初期に戻す
        </button>
        <button onClick={() => confirm('表示の設定（色・並び順・スーパーカテゴリー）を初期状態に戻しますか？') && setView(defaultView)}>
          表示の設定をすべて初期に戻す
        </button>
      </div>
    </div>
  )
}
