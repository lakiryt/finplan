import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { ColorInput } from './ColorInput'
import { yen } from './format'

export interface PieSlice {
  key: string
  label: string
  value: number
  color: string
  /** 凡例に添える補足（スーパーカテゴリーの中身など） */
  note?: string
  /** false なら色を変えられない（「その他」など） */
  editable?: boolean
}

interface Props {
  slices: PieSlice[]
  surface: string
  ink: string
  grid: string
  onColorChange?: (key: string, color: string) => void
}

/** ドーナツグラフと、金額・割合つきの凡例 */
export function ExpensePie({ slices, surface, ink, grid, onColorChange }: Props) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  return (
    <div className="pie">
      <ResponsiveContainer width="100%" height={260}>
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
            formatter={(v) => [`${yen(Number(v))}（${((Number(v) / total) * 100).toFixed(1)}%）`]}
            contentStyle={{ background: surface, borderColor: grid, color: ink }}
          />
        </PieChart>
      </ResponsiveContainer>
      <ul className="legend">
        {slices.map((s) => (
          <li key={s.key} title={s.note}>
            {onColorChange && s.editable !== false ? (
              <ColorInput value={s.color} onChange={(c) => onColorChange(s.key, c)} title={`${s.label}の色を変える`} />
            ) : (
              <span className="swatch" style={{ background: s.color }} />
            )}
            <span className="legend-label">
              {s.label}
              {s.note && <span className="muted small"> {s.note}</span>}
            </span>
            <span className="num">{yen(s.value)}</span>
            <span className="num muted">{total ? ((s.value / total) * 100).toFixed(1) : '0.0'}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
