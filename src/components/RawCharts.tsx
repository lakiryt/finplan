import { memo } from 'react'
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ExpensePie } from './ExpensePie'
import { man, yen } from './format'
import type { useChartTheme } from './palette'

export interface ChartSeries {
  key: string
  label: string
  color: string
  total: number
}

interface Props {
  series: ChartSeries[]
  /** 月ごとの行。系列 i の値は `s${i}` に入っている */
  barData: Record<string, number | string | undefined>[]
  mean: number
  median: number
  theme: ReturnType<typeof useChartTheme>
}

/**
 * 円グラフと月ごとの積み上げ棒グラフ。描画が重いので、データが変わったときだけ描き直す（memo）。
 * 呼ぶ側は series と barData を useMemo で作ること
 */
export const RawCharts = memo(function RawCharts({ series, barData, mean, median, theme }: Props) {
  return (
    <div className="charts">
      <div>
        <h3>支出のカテゴリー別の割合</h3>
        <ExpensePie
          slices={series.map((s) => ({ key: s.key, label: s.label, value: s.total, color: s.color }))}
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
              formatter={(v, name) => [yen(Number(v)), name]}
              itemSorter={(item) => -Number(item.value)}
              contentStyle={{ background: theme.surface, borderColor: theme.grid, color: theme.ink }}
              cursor={{ fill: theme.grid, opacity: 0.5 }}
            />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={`s${i}`}
                name={s.label}
                stackId="a"
                fill={s.color}
                stroke={theme.surface}
                strokeWidth={1}
                radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
                maxBarSize={28}
                isAnimationActive={false}
              />
            ))}
            <ReferenceLine
              y={mean}
              stroke={theme.ink}
              strokeDasharray="4 4"
              label={{ value: `平均 ${yen(mean)}`, position: 'insideTopRight', fill: theme.ink, fontSize: 12 }}
            />
            <ReferenceLine
              y={median}
              stroke={theme.muted}
              strokeDasharray="1 3"
              label={{ value: `中央値 ${yen(median)}`, position: 'insideBottomRight', fill: theme.ink, fontSize: 12 }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
})
