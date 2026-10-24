import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { filterByMonths } from '../domain/aggregate'
import { rawExpenseByCategory, rawMonthlyRows, topExpenseCategories } from '../domain/raw'
import { seriesStats } from '../domain/stats'
import type { Transaction } from '../domain/types'
import { applyDisplayNames, assignColors, defaultView, parseViewConfig, type ViewConfig } from '../domain/view'
import { useStoredState } from '../state/storage'
import { ColorInput, PaletteList } from './ColorInput'
import { ExpensePie, type PieSlice } from './ExpensePie'
import { man, yen } from './format'
import { useChartTheme } from './palette'
import { StatTiles } from './StatTiles'
import { ViewSettings } from './ViewSettings'

interface Props {
  transactions: Transaction[]
  from: string
  to: string
}

const OTHER = '__other__'
const OTHER_LABEL = 'その他'
/** 色を選んでいなくても個別に表示するカテゴリーの数（残りは「その他」にまとめる） */
const TOP_N = 7

/** 加工なしの概要。CSVのカテゴリーと金額の符号だけで集計する（スーパーカテゴリーは表示上のまとめ） */
export function RawOverview({ transactions, from, to }: Props) {
  const theme = useChartTheme()
  const [view, setView] = useStoredState<ViewConfig>('finplan.view', defaultView, parseViewConfig)
  const [showTable, setShowTable] = useState(false)

  const originalCategories = useMemo(() => [...new Set(transactions.map((t) => t.category))].sort(), [transactions])
  const displayed = useMemo(() => applyDisplayNames(transactions, view), [transactions, view])
  const inPeriod = useMemo(() => filterByMonths(displayed, from, to), [displayed, from, to])
  const rows = useMemo(() => rawMonthlyRows(inPeriod, from, to), [inPeriod, from, to])
  const categories = useMemo(() => rawExpenseByCategory(inPeriod, rows), [inPeriod, rows])
  const expense = seriesStats(rows.map((r) => r.expense))
  const income = seriesStats(rows.map((r) => r.income))

  // 期間を変えても色が変わらないよう、個別に表示するものは全データで決める。色を選んだものは必ず個別に表示する
  const individually = useMemo(() => {
    const top = topExpenseCategories(displayed, TOP_N)
    const all = new Set(topExpenseCategories(displayed, Infinity))
    return [...top, ...Object.keys(view.colors).filter((k) => all.has(k) && !top.includes(k))]
  }, [displayed, view.colors])
  const colors = useMemo(() => assignColors(individually, view.colors, theme.series), [individually, view.colors, theme.series])
  const colorOf = (key: string) => colors[key] ?? theme.other
  const isIndividual = (key: string) => individually.includes(key)
  const keys = [...individually, OTHER]
  const labelOf = (key: string) => (key === OTHER ? OTHER_LABEL : key)
  const setColor = (key: string, color: string) => setView({ ...view, colors: { ...view.colors, [key]: color } })

  /** スーパーカテゴリー名 → 中身（表示用） */
  const membersOf = (key: string) =>
    view.useSuperCategories ? view.superCategories.find((s) => (s.label || s.id) === key)?.members.join('・') : undefined

  const slices: PieSlice[] = keys
    .map((key) => ({
      key,
      label: labelOf(key),
      value:
        key === OTHER
          ? categories.filter((c) => !isIndividual(c.category)).reduce((s, c) => s + c.total, 0)
          : (categories.find((c) => c.category === key)?.total ?? 0),
      color: colorOf(key),
      note: membersOf(key),
      editable: key !== OTHER,
    }))
    .filter((s) => s.value > 0)

  const barData = rows.map((r) => {
    const d: Record<string, number | string> = { month: r.month }
    for (const key of individually) d[key] = r.expenseByCategory[key] ?? 0
    d[OTHER] = r.expense - individually.reduce((s, k) => s + (r.expenseByCategory[k] ?? 0), 0)
    return d
  })

  return (
    <div>
      <PaletteList colors={theme.series} />
      <p className="muted small">
        CSVの記録をそのまま集計しています（マイナスを支出、プラスを収入として合計）。家賃・貯金・口座移動なども含まれます。
      </p>
      <div className="row">
        <label>
          <input
            type="checkbox"
            checked={view.useSuperCategories}
            onChange={(e) => setView({ ...view, useSuperCategories: e.target.checked })}
          />
          スーパーカテゴリーでまとめる
        </label>
        {view.useSuperCategories && (
          <span className="muted small">
            {view.superCategories.map((s) => s.label).join('、') || 'まだありません（下の「表示の設定」で作れます）'}
          </span>
        )}
      </div>
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
          <ExpensePie slices={slices} surface={theme.surface} ink={theme.ink} grid={theme.grid} onColorChange={setColor} />
          <p className="muted small">色見本を押すと色を変えられます。</p>
        </div>
        <div>
          <h3>月ごとの支出</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barData} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={theme.grid} />
              <XAxis dataKey="month" stroke={theme.axis} tick={{ fill: theme.muted, fontSize: 12 }} tickLine={false} />
              <YAxis tickFormatter={man} stroke={theme.axis} tick={{ fill: theme.muted, fontSize: 12 }} tickLine={false} axisLine={false} width={48} />
              <Tooltip
                formatter={(v, key) => [yen(Number(v)), labelOf(String(key))]}
                itemSorter={(item) => -Number(item.value)}
                contentStyle={{ background: theme.surface, borderColor: theme.grid, color: theme.ink }}
                cursor={{ fill: theme.grid, opacity: 0.5 }}
              />
              {keys.map((key, i) => (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId="a"
                  fill={colorOf(key)}
                  stroke={theme.surface}
                  strokeWidth={1}
                  radius={i === keys.length - 1 ? [4, 4, 0, 0] : 0}
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
          <p className="muted small">色は左の円グラフと同じです。</p>
        </div>
      </div>

      <div className="row">
        <h3>カテゴリー別の支出</h3>
        <button onClick={() => setShowTable((v) => !v)}>{showTable ? '閉じる' : '表を開く'}</button>
      </div>
      {showTable && (
        <table>
          <thead>
            <tr>
              <th>カテゴリー</th>
              <th className="num">件数</th>
              <th className="num">期間合計</th>
              <th className="num">割合</th>
              <th className="num">月平均</th>
              <th className="num">月の中央値</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.category}>
                <td>
                  <ColorInput
                    value={colorOf(isIndividual(c.category) ? c.category : OTHER)}
                    onChange={(color) => setColor(c.category, color)}
                    title={isIndividual(c.category) ? undefined : '色を選ぶと「その他」から分けて表示します'}
                  />
                  {c.category || '（空欄）'}
                  {membersOf(c.category) && <span className="muted small"> {membersOf(c.category)}</span>}
                </td>
                <td className="num">{c.count}</td>
                <td className="num">{yen(c.total)}</td>
                <td className="num">{(c.share * 100).toFixed(1)}%</td>
                <td className="num">{yen(c.monthlyMean)}</td>
                <td className="num">{yen(c.monthlyMedian)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <details>
        <summary>
          <h3>表示の設定</h3>
        </summary>
        <ViewSettings view={view} onChange={setView} onReset={() => setView(defaultView)} categories={originalCategories} />
      </details>
    </div>
  )
}
