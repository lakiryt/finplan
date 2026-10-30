import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import type { Side } from '../domain/raw'
import { ExpensePie } from './ExpensePie'
import { man, yen } from './format'
import type { useChartTheme } from './palette'

type Theme = ReturnType<typeof useChartTheme>

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
  /** 期間の始めからその月までの収支の合計 */
  cumulative: number
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
  theme: Theme
  /** 支出・収入のどちらの棒か（詳細から記録を開くときに使う） */
  side: Side
  /** 棒の詳細から、その月の記録を開く */
  onShowMonth: (side: Side, month: string) => void
}

/**
 * 2. のグラフ。描画が重いので、データが変わったときだけ描き直す（memo）。呼ぶ側は series と bars を useMemo で作ること。
 * - 支出・収入: カテゴリー別の円グラフと、月ごとの積み上げ棒グラフ
 * - 収支: 月ごとの収支と、累積収支の棒グラフ（黒字は青、赤字は赤）
 */
export const RawCharts = memo(function RawCharts({ pieTitle, series, barTitle, bars, mean, median, theme, side, onShowMonth }: Props) {
  const averages = <AverageLines mean={mean} median={median} theme={theme} />

  if (bars.kind === 'balance') {
    // 2色＋0の線で、プラスとマイナスが逆の意味だと分かるようにする
    const signColor = (v: number) => (v >= 0 ? theme.series[0] : theme.series[7])
    const last = bars.data[bars.data.length - 1]
    return (
      <div className="charts balance">
        <MonthBarChart title={barTitle} data={bars.data} detail={(p) => <BalanceDetail {...p} onShow={onShowMonth} />} theme={theme}>
          <Bar dataKey="balance" name="収支" maxBarSize={28} isAnimationActive={false}>
            {bars.data.map((d) => (
              <Cell key={d.month} fill={signColor(d.balance)} />
            ))}
          </Bar>
          <ReferenceLine y={0} stroke={theme.axis} />
          {averages}
        </MonthBarChart>
        <MonthBarChart title={`累積収支（期間末 ${yen(last?.cumulative ?? 0)}）`} data={bars.data} detail={CumulativeDetail} theme={theme}>
          <Bar dataKey="cumulative" name="累積収支" maxBarSize={28} isAnimationActive={false}>
            {bars.data.map((d) => (
              <Cell key={d.month} fill={signColor(d.cumulative)} />
            ))}
          </Bar>
          <ReferenceLine y={0} stroke={theme.axis} />
        </MonthBarChart>
      </div>
    )
  }

  // 相殺で差し引いた分は、期間合計がマイナスの系列として来る。円グラフでは内側の輪、棒グラフでは0の線より下に出す
  const toSlice = (s: ChartSeries) => ({ key: s.key, label: s.label, value: Math.abs(s.total), color: s.color })
  const lastPositive = series.map((s) => s.total > 0).lastIndexOf(true)
  const hasNegative = bars.data.some((d) => Object.entries(d).some(([k, v]) => k.startsWith('s') && typeof v === 'number' && v < 0))

  return (
    <div className="charts">
      <div>
        <h3>{pieTitle}</h3>
        <ExpensePie
          slices={series.filter((s) => s.total > 0).map(toSlice)}
          negatives={series.filter((s) => s.total < 0).map(toSlice)}
          surface={theme.surface}
        />
      </div>
      <MonthBarChart title={barTitle} data={bars.data} detail={(p) => <MonthDetail {...p} onShow={(month) => onShowMonth(side, month)} />} theme={theme}>
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={`s${i}`}
            name={s.label}
            stackId="a"
            fill={s.color}
            stroke={theme.surface}
            strokeWidth={1}
            radius={i === lastPositive ? [4, 4, 0, 0] : 0}
            maxBarSize={28}
            isAnimationActive={false}
          />
        ))}
        {hasNegative && <ReferenceLine y={0} stroke={theme.axis} />}
        {averages}
      </MonthBarChart>
    </div>
  )
})

/**
 * 月ごとの棒グラフの枠。棒を押すと詳細が出て、同じ棒をもう一度押す・グラフの外を押す・Esc で閉じる
 */
function MonthBarChart({
  title,
  data,
  detail,
  theme,
  children,
}: {
  title: string
  data: Record<string, unknown>[]
  detail: (props: TooltipContentProps) => ReactNode
  theme: Theme
  children: ReactNode
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (selected === null) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setSelected(null)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(null)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [selected])

  return (
    <div ref={ref}>
      <h3>{title}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={data}
          // 積み上げでは、プラスは0から上へ、マイナスは0から下へ分けて積む（相殺で差し引いた分がほかの棒に重ならないように）
          stackOffset="sign"
          margin={{ top: 16, right: 8, bottom: 0, left: 0 }}
          onClick={({ activeTooltipIndex }) => {
            const key = activeTooltipIndex === undefined || activeTooltipIndex === null ? null : String(activeTooltipIndex)
            setSelected((cur) => (key === null || cur === key ? null : key))
          }}
        >
          <CartesianGrid vertical={false} stroke={theme.grid} />
          <XAxis dataKey="month" stroke={theme.axis} tick={{ fill: theme.muted, fontSize: 12 }} tickLine={false} />
          <YAxis tickFormatter={man} stroke={theme.axis} tick={{ fill: theme.muted, fontSize: 12 }} tickLine={false} axisLine={false} width={48} />
          {/* 詳細の中のボタンを押せるように、ツールチップでもマウスの操作を受け取る */}
          <Tooltip trigger="click" active={selected !== null} content={detail} cursor={{ fill: theme.grid, opacity: 0.5 }} wrapperStyle={{ pointerEvents: 'auto' }} />
          {children}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** 平均（破線）と中央値（点線）の線 */
function AverageLines({ mean, median, theme }: { mean: number; median: number; theme: Theme }) {
  return (
    <>
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
    </>
  )
}

/**
 * 積み上げ棒を押したときの詳細。月と合計を上に出し、内訳は表と同じ順（表の上の行が先）に並べる。
 * 相殺で差し引いた分（マイナス）も出すので、内訳の合計と月の合計が一致する。
 * 棒は表の順に下から積んでいるので、Recharts から渡る順（描いた順）がそのまま表の順になる
 */
function MonthDetail({ active, payload, label, onShow }: TooltipContentProps & { onShow: (month: string) => void }) {
  if (!active || !payload?.length) return null
  const total = Number(payload[0].payload.total ?? 0)
  return (
    <div className="chart-detail">
      {/* 内訳が長いと小窓の中でスクロールするので、ボタンは上に固定して隠れないようにする */}
      <div className="chart-detail-top">
        <DetailHead label={label} value={total} />
        <ShowRecords onClick={() => onShow(String(label))}>この月の記録を見る</ShowRecords>
      </div>
      {payload
        .filter((p) => Number(p.value) !== 0)
        .map((p) => (
          <DetailRow key={String(p.dataKey)} color={p.color} name={String(p.name)} value={Number(p.value)} />
        ))}
    </div>
  )
}

/** 収支の棒を押したときの詳細。収支と、その元の収入・支出 */
function BalanceDetail({ active, payload, label, onShow }: TooltipContentProps & { onShow: (side: Side, month: string) => void }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as BalanceMonth
  return (
    <div className="chart-detail">
      <DetailHead label={label} value={d.balance} />
      <DetailRow name="収入" value={d.income} />
      <DetailRow name="支出" value={d.expense} />
      <div className="chart-detail-actions">
        <ShowRecords onClick={() => onShow('income', String(label))}>収入の記録</ShowRecords>
        <ShowRecords onClick={() => onShow('expense', String(label))}>支出の記録</ShowRecords>
      </div>
    </div>
  )
}

/** 詳細から記録の画面を開くボタン。押してもグラフの選択（詳細の開閉）は変えない */
function ShowRecords({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      className="chart-detail-link"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      {children}
    </button>
  )
}

/** 累積収支の棒を押したときの詳細。累積と、その月の収支 */
function CumulativeDetail({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as BalanceMonth
  return (
    <div className="chart-detail">
      <DetailHead label={`${label}までの累積`} value={d.cumulative} />
      <DetailRow name="この月の収支" value={d.balance} />
    </div>
  )
}

function DetailHead({ label, value }: { label: ReactNode; value: number }) {
  return (
    <div className="chart-detail-head">
      <span>{label}</span>
      <strong className="num">{yen(value)}</strong>
    </div>
  )
}

function DetailRow({ name, value, color }: { name: string; value: number; color?: string }) {
  return (
    <div className="chart-detail-row">
      {color ? <span className="chart-detail-swatch" style={{ background: color }} /> : <span />}
      <span className="chart-detail-name">{name}</span>
      <span className="num">{yen(value)}</span>
    </div>
  )
}
