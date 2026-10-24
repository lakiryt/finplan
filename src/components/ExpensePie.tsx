import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { yen } from './format'

export interface PieSlice {
  key: string
  label: string
  value: number
  color: string
}

interface Props {
  slices: PieSlice[]
  surface: string
  ink: string
  grid: string
}

/** ドーナツグラフ。凡例は隣の表が兼ねる */
export function ExpensePie({ slices, surface, ink, grid }: Props) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={slices}
          dataKey="value"
          nameKey="label"
          innerRadius="55%"
          outerRadius="90%"
          startAngle={90}
          endAngle={-270}
          stroke={surface}
          strokeWidth={2}
          isAnimationActive={false}
        >
          {slices.map((s) => (
            <Cell key={s.key} fill={s.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v, name) => [`${yen(Number(v))}（${((Number(v) / total) * 100).toFixed(1)}%）`, name]}
          contentStyle={{ background: surface, borderColor: grid, color: ink }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
