import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { MonthRow } from '../domain/aggregate'
import type { Group } from '../domain/types'
import { man, yen } from './format'
import { useChartTheme } from './palette'

interface Props {
  rows: MonthRow[]
  /** 積み上げるグループ（色はグループの並び順で固定） */
  groups: Group[]
  allGroups: Group[]
  average: number
}

export function MonthlyChart({ rows, groups, allGroups, average }: Props) {
  const theme = useChartTheme()
  const [showTable, setShowTable] = useState(false)
  const colorOf = (g: Group) => theme.series[allGroups.indexOf(g) % theme.series.length]
  const data = rows.map((r) => ({ month: r.month, ...Object.fromEntries(groups.map((g) => [g.id, r.byGroup[g.id] ?? 0])) }))

  return (
    <div>
      <div className="row">
        <button onClick={() => setShowTable((v) => !v)}>{showTable ? 'グラフで見る' : '表で見る'}</button>
      </div>
      {showTable ? (
        <table>
          <thead>
            <tr>
              <th>月</th>
              {groups.map((g) => (
                <th key={g.id} className="num">
                  {g.label}
                </th>
              ))}
              <th className="num">合計</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month}>
                <td>{r.month}</td>
                {groups.map((g) => (
                  <td key={g.id} className="num">
                    {yen(r.byGroup[g.id] ?? 0)}
                  </td>
                ))}
                <td className="num">{yen(groups.reduce((s, g) => s + (r.byGroup[g.id] ?? 0), 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={theme.grid} />
            <XAxis dataKey="month" stroke={theme.axis} tick={{ fill: theme.muted, fontSize: 12 }} tickLine={false} />
            <YAxis tickFormatter={man} stroke={theme.axis} tick={{ fill: theme.muted, fontSize: 12 }} tickLine={false} axisLine={false} width={48} />
            <Tooltip
              formatter={(v, name) => [yen(Number(v)), allGroups.find((g) => g.id === name)?.label ?? name]}
              contentStyle={{ background: theme.surface, borderColor: theme.grid, color: theme.ink }}
              cursor={{ fill: theme.grid, opacity: 0.5 }}
            />
            <Legend formatter={(id) => <span style={{ color: theme.ink }}>{allGroups.find((g) => g.id === id)?.label ?? id}</span>} />
            {groups.map((g, i) => (
              <Bar
                key={g.id}
                dataKey={g.id}
                stackId="a"
                fill={colorOf(g)}
                stroke={theme.surface}
                strokeWidth={1}
                radius={i === groups.length - 1 ? [4, 4, 0, 0] : 0}
                maxBarSize={28}
              />
            ))}
            <ReferenceLine
              y={average}
              stroke={theme.ink}
              strokeDasharray="4 4"
              label={{ value: `平均 ${yen(average)}`, position: 'insideTopRight', fill: theme.ink, fontSize: 12 }}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
