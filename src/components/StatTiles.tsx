import { yen } from './format'

export interface StatTile {
  label: string
  value: number
  note?: string
}

export function StatTiles({ tiles }: { tiles: StatTile[] }) {
  return (
    <div className="tiles">
      {tiles.map((t) => (
        <div key={t.label} className="tile">
          <div className="muted">{t.label}</div>
          <div className="tile-value">{yen(t.value)}</div>
          {t.note && <div className="muted small">{t.note}</div>}
        </div>
      ))}
    </div>
  )
}
