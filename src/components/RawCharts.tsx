import { memo, useEffect, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import { ExpensePie } from './ExpensePie'
import { man, yen } from './format'
import type { useChartTheme } from './palette'

export interface ChartSeries {
  key: string
  label: string
  color: string
  total: number
}

// Recharts のデータとして渡すので interface ではなく type にする（インデックスシグネチャとして扱えるように）
export type BalanceMonth = {
  month: string
  balance: number
  income: number
  expense: number
}

/** 棒グラフの中身。カテゴリー別の積み上げか、月ごとの収支か */
export type BarsSpec =
  | {
      kind: 'stacked'
      /** 月ごとの行。系列 i の値は `s${i}`、その月の合計は total に入っている */
      data: Record<string, number | string | undefined>[]
    }
  | { kind: 'balance'; data: BalanceMonth[] }

interface Props {
  pieTitle: string
  /** 円グラフと積み上げ棒の系列（表の順） */
  series: ChartSeries[]
  barTitle: string
  bars: BarsSpec
  mean: number
  median: number
  theme: ReturnType<typeof useChartTheme>
}

/**
 * 円グラフと月ごとの棒グラフ。描画が重いので、データが変わったときだけ描き直す（memo）。
 * 呼ぶ側は series と bars を useMemo で作ること
 */
export const RawCharts = memo(function RawCharts({ pieTitle, series, barTitle, bars, mean, median, theme }: Props) {
  // 詳細を出している月。同じ棒をもう一度押す・グラフの外を押す・Esc で閉じる
  const [selected, setSelected] = useState<string | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (selected === null) return
    const onDown = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setSelected(null)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(null)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [selected])

  // 収支は、黒字を青・赤字を赤にする（2色＋0の線で、プラスとマイナスが逆の意味だと分かるように）
  const positive = theme.series[0]
  const negative = theme.series[7]

  return (
    <div className="charts">
      <div>
        <h3>{pieTitle}</h3>
        <ExpensePie
          slices={series.map((s) => ({ key: s.key, label: s.label, value: s.total, color: s.color }))}
          surface={theme.surface}
          ink={theme.ink}
          grid={theme.grid}
        />
      </div>
      <div ref={barRef}>
        <h3>{barTitle}</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={bars.data}
            margin={{ top: 16, right: 8, bottom: 0, left: 0 }}
            onClick={({ activeTooltipIndex }) => {
              const key = activeTooltipIndex === undefined || activeTooltipIndex === null ? null : String(activeTooltipIndex)
              setSelected((cur) => (key === null || cur === key ? null : key))
            }}
          >
            <CartesianGrid vertical={false} stroke={theme.grid} />
            <XAxis dataKey="month" stroke={theme.axis} tick={{ fill: theme.muted, fontSize: 12 }} tickLine={false} />
            <YAxis tickFormatter={man} stroke={theme.axis} tick={{ fill: theme.muted, fontSize: 12 }} tickLine={false} axisLine={false} width={48} />
            {/* 棒を押すと詳細が出て、閉じるまで残る */}
            <Tooltip
              trigger="click"
              active={selected !== null}
              content={bars.kind === 'stacked' ? MonthDetail : BalanceDetail}
              cursor={{ fill: theme.grid, opacity: 0.5 }}
            />
            {bars.kind === 'stacked' ? (
              series.map((s, i) => (
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
              ))
            ) : (
              <Bar dataKey="balance" name="収支" maxBarSize={28} isAnimationActive={false}>
                {bars.data.map((d) => (
                  <Cell key={d.month} fill={d.balance >= 0 ? positive : negative} />
                ))}
              </Bar>
            )}
            {bars.kind === 'balance' && <ReferenceLine y={0} stroke={theme.axis} />}
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

/**
 * 積み上げ棒を押したときの詳細。月と合計を上に出し、内訳は表と同じ順（表の上の行が先）に並べる。
 * 棒は表の順に下から積んでいるので、Recharts から渡る順（描いた順）がそのまま表の順になる
 */
function MonthDetail({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  const total = Number(payload[0].payload.total ?? 0)
  return (
    <div className="chart-detail">
      <div className="chart-detail-head">
        <span>{label}</span>
        <strong className="num">{yen(total)}</strong>
      </div>
      {payload
        .filter((p) => Number(p.value) > 0)
        .map((p) => (
          <div key={String(p.dataKey)} className="chart-detail-row">
            <span className="chart-detail-swatch" style={{ background: p.color }} />
            <span className="chart-detail-name">{p.name}</span>
            <span className="num">{yen(Number(p.value))}</span>
          </div>
        ))}
    </div>
  )
}

/** 収支の棒を押したときの詳細。収支と、その元の収入・支出 */
function BalanceDetail({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as BalanceMonth
  return (
    <div className="chart-detail">
      <div className="chart-detail-head">
        <span>{label}</span>
        <strong className="num">{yen(d.balance)}</strong>
      </div>
      <div className="chart-detail-row">
        <span />
        <span className="chart-detail-name">収入</span>
        <span className="num">{yen(d.income)}</span>
      </div>
      <div className="chart-detail-row">
        <span />
        <span className="chart-detail-name">支出</span>
        <span className="num">{yen(d.expense)}</span>
      </div>
    </div>
  )
}
