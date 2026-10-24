import type { SeriesStats } from '../domain/stats'
import { yen } from './format'

interface Props {
  living: SeriesStats
  income: SeriesStats
}

export function SummaryTiles({ living, income }: Props) {
  const tiles = [
    { label: '生活費 月平均', value: living.mean, note: `${living.count}か月` },
    { label: '生活費 中央値', value: living.median, note: '大きな出費の影響を受けにくい' },
    { label: '生活費 直近6か月平均', value: living.recent[6], note: `直近3か月 ${yen(living.recent[3])}` },
    { label: '収入 月平均', value: income.mean, note: `直近6か月 ${yen(income.recent[6])}` },
  ]
  return (
    <div className="tiles">
      {tiles.map((t) => (
        <div key={t.label} className="tile">
          <div className="muted">{t.label}</div>
          <div className="tile-value">{yen(t.value)}</div>
          <div className="muted small">{t.note}</div>
        </div>
      ))}
    </div>
  )
}
