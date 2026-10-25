import { useState } from 'react'
import type { SeriesStats } from '../domain/stats'
import { useStoredState } from '../state/storage'
import { yen } from './format'
import { TakeHomeDialog } from './TakeHomeDialog'

interface Props {
  living: SeriesStats
}

/** 手取り − 生活費 − 毎月の貯金 = これから決める支出（家賃・ローンなど）に回せる額 */
export function Budget({ living }: Props) {
  // 保存先の名前は、入力した値を残すため以前のまま
  const [takeHome, setTakeHome] = useStoredState('finplan.rent.takeHome', 200000)
  const [savings, setSavings] = useStoredState('finplan.rent.savings', 0)
  const [calculating, setCalculating] = useState(false)

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
            <button className="inline-button" onClick={() => setCalculating(true)}>
              計算する
            </button>
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
            <th className="num">ほかに回せる額</th>
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
      <TakeHomeDialog open={calculating} onApply={setTakeHome} onClose={() => setCalculating(false)} />
    </div>
  )
}
