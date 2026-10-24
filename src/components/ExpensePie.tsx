import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, type TooltipContentProps } from 'recharts'
import { yen } from './format'

export interface PieSlice {
  key: string
  label: string
  /** プラスの金額（差し引いた分も絶対値で渡す） */
  value: number
  color: string
}

interface Props {
  /** プラスの部分（外側の輪） */
  slices: PieSlice[]
  /** 差し引いた分（内側の輪）。外側と同じ縮尺の弧で描く */
  negatives: PieSlice[]
  surface: string
}

const REST = '__rest__'

/**
 * ドーナツグラフ。凡例は隣の表が兼ねる。
 * 相殺で差し引いた分（マイナス）は、内側の細い輪に外側と同じ縮尺の弧で描く。外側の合計 − 内側の弧 が実際の支出
 */
export function ExpensePie({ slices, negatives, surface }: Props) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  const negativeTotal = negatives.reduce((s, x) => s + x.value, 0)
  // 内側の輪の残り（描かない部分）。差し引いた分が外側の合計より大きければ、輪がいっぱいになる
  const inner = [...negatives, { key: REST, label: '', value: Math.max(0, total - negativeTotal), color: 'transparent' }]

  return (
    <div>
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
          {negativeTotal > 0 && (
            <Pie
              data={inner}
              dataKey="value"
              nameKey="label"
              innerRadius="42%"
              outerRadius="51%"
              startAngle={90}
              endAngle={-270}
              stroke={surface}
              strokeWidth={1}
              isAnimationActive={false}
            >
              {inner.map((s) => (
                <Cell key={s.key} fill={s.color} fillOpacity={s.key === REST ? 0 : 0.55} stroke={s.key === REST ? 'none' : surface} />
              ))}
            </Pie>
          )}
          <Tooltip content={(props) => <SliceDetail {...props} total={total} negatives={negatives} />} />
        </PieChart>
      </ResponsiveContainer>
      {negativeTotal > 0 && (
        <p className="muted small pie-note">
          内側の弧は差し引いた分（−{yen(negativeTotal)}）。外側の合計 {yen(total)} から引いた {yen(total - negativeTotal)} が支出です。
        </p>
      )}
    </div>
  )
}

/** 押した（乗せた）部分の金額と割合。差し引いた分は「−」を付ける */
function SliceDetail({ active, payload, total, negatives }: TooltipContentProps & { total: number; negatives: PieSlice[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as PieSlice
  if (d.key === REST) return null
  const negative = negatives.some((n) => n.key === d.key)
  return (
    <div className="chart-detail">
      <div className="chart-detail-head">
        <span>{d.label}</span>
        <strong className="num">
          {negative ? '−' : ''}
          {yen(d.value)}
        </strong>
      </div>
      <div className="muted small">{negative ? '差し引いた分' : `${total ? ((d.value / total) * 100).toFixed(1) : '0.0'}%`}</div>
    </div>
  )
}
