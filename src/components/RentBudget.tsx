import type { SeriesStats } from '../domain/stats'
import { useStoredState } from '../state/storage'
import { yen } from './format'

interface Props {
  living: SeriesStats
}

/** 手取り − 生活費（家賃を除く） − 貯金目標 = 家賃に回せる額 */
export function RentBudget({ living }: Props) {
  const [takeHome, setTakeHome] = useStoredState('finplan.rent.takeHome', 200000)
  const [savings, setSavings] = useStoredState('finplan.rent.savings', 0)

  const bases = [
    { label: '月平均', value: living.mean },
    { label: '中央値', value: living.median },
    { label: '直近6か月平均', value: living.recent[6] },
  ]

  return (
    <div>
      <div className="fields">
        <label className="field">
          <span>想定する手取り（月）</span>
          <span>
            <input type="number" step={10000} value={takeHome} onChange={(e) => setTakeHome(Number(e.target.value))} />円
          </span>
        </label>
        <label className="field">
          <span>毎月の貯金目標</span>
          <span>
            <input type="number" step={10000} value={savings} onChange={(e) => setSavings(Number(e.target.value))} />円
          </span>
        </label>
      </div>
      <table>
        <thead>
          <tr>
            <th>生活費の基準</th>
            <th className="num">生活費</th>
            <th className="num">家賃に回せる額</th>
          </tr>
        </thead>
        <tbody>
          {bases.map((b) => (
            <tr key={b.label}>
              <td>{b.label}</td>
              <td className="num">{yen(b.value)}</td>
              <td className="num">{yen(takeHome - b.value - savings)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
