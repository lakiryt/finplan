import type { SeriesStats } from '../domain/stats'
import { yen } from './format'

interface Props {
  label: string
  stats: SeriesStats
  selected: boolean
  onSelect: () => void
}

/** 押すと 2. の表示を切り替えるカード。平均と中央値を出す */
export function SummaryCard({ label, stats, selected, onSelect }: Props) {
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
      <div className="muted small">
        {stats.count}か月 / 最小 {yen(stats.min)} ・ 最大 {yen(stats.max)}
      </div>
    </button>
  )
}
