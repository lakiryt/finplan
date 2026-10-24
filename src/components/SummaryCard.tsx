import { histogram, type SeriesStats } from '../domain/stats'
import { yen } from './format'
import type { useChartTheme } from './palette'

interface Props {
  label: string
  /** 月ごとの金額（古い順） */
  values: number[]
  stats: SeriesStats
  selected: boolean
  onSelect: () => void
  theme: ReturnType<typeof useChartTheme>
}

/** 押すと 2. の表示を切り替えるカード。平均・中央値と、月ごとの金額の分布（ヒストグラム）を出す */
export function SummaryCard({ label, values, stats, selected, onSelect, theme }: Props) {
  return (
    <button className={`summary-card ${selected ? 'selected' : ''}`} aria-pressed={selected} onClick={onSelect}>
      <div className="summary-label">{label}</div>
      <div className="summary-values">
        <span>
          <span className="muted small">平均 </span>
          <strong>{yen(stats.mean)}</strong>
        </span>
        <span>
          <span className="muted small">中央値 </span>
          <strong>{yen(stats.median)}</strong>
        </span>
      </div>
      <MiniHistogram values={values} mean={stats.mean} median={stats.median} theme={theme} />
      <div className="muted small">
        {stats.count}か月 / 最小 {yen(stats.min)} ・ 最大 {yen(stats.max)}
      </div>
    </button>
  )
}

const W = 160
const H = 36

/** 小さなヒストグラム。破線が平均、点線が中央値。範囲の外にはみ出した月をまとめた両端の柱は薄くする */
function MiniHistogram({ values, mean, median, theme }: { values: number[]; mean: number; median: number; theme: Props['theme'] }) {
  const h = histogram(values)
  const max = Math.max(1, ...h.counts)
  const bw = W / h.counts.length
  const x = (v: number) => (h.hi === h.lo ? W / 2 : ((Math.min(h.hi, Math.max(h.lo, v)) - h.lo) / (h.hi - h.lo)) * W)
  const clipped = (i: number) => (i === 0 && h.clippedLow > 0) || (i === h.counts.length - 1 && h.clippedHigh > 0)
  const title =
    `${yen(h.lo)}〜${yen(h.hi)}を${h.counts.length}つに分けた月数` +
    (h.clippedLow || h.clippedHigh ? `（範囲外の${h.clippedLow + h.clippedHigh}か月は両端に含む）` : '')

  return (
    <svg className="mini-histogram" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={title}>
      <title>{title}</title>
      {h.lo < 0 && h.hi > 0 && <line x1={x(0)} x2={x(0)} y1={0} y2={H} stroke={theme.axis} strokeWidth={1} />}
      {h.counts.map((c, i) => {
        const bh = (c / max) * (H - 2)
        return (
          <rect
            key={i}
            x={i * bw + 0.5}
            y={H - bh}
            width={bw - 1}
            height={bh}
            rx={1}
            fill={theme.other}
            opacity={clipped(i) ? 0.45 : 1}
          />
        )
      })}
      <line x1={x(mean)} x2={x(mean)} y1={0} y2={H} stroke={theme.ink} strokeWidth={1.2} strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
      <line x1={x(median)} x2={x(median)} y1={0} y2={H} stroke={theme.ink} strokeWidth={1.2} strokeDasharray="1 2" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
