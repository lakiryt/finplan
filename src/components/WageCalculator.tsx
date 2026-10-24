import { requiredWage, type WageInput } from '../domain/wage'
import type { SeriesStats } from '../domain/stats'
import { useStoredState } from '../state/storage'
import { yen } from './format'

type LivingBasis = 'mean' | 'median' | 'recent6' | 'manual'

interface Props {
  living: SeriesStats
}

const basisLabel: Record<LivingBasis, string> = {
  mean: '月平均',
  median: '中央値',
  recent6: '直近6か月平均',
  manual: '手入力',
}

export function WageCalculator({ living }: Props) {
  const [basis, setBasis] = useStoredState<LivingBasis>('finplan.wage.basis', 'mean')
  const [input, setInput] = useStoredState<WageInput>('finplan.wage.input', {
    living: 0,
    rent: 70000,
    extraFixed: 0,
    savings: 0,
    takeHomeRate: 0.8,
    hoursPerMonth: 120,
  })

  const livingValue =
    basis === 'mean' ? living.mean : basis === 'median' ? living.median : basis === 'recent6' ? living.recent[6] : input.living
  const result = requiredWage({ ...input, living: livingValue })

  const field = (key: keyof WageInput, label: string, opts: { step?: number; suffix?: string; scale?: number } = {}) => {
    const scale = opts.scale ?? 1
    return (
      <label className="field">
        <span>{label}</span>
        <span>
          <input
            type="number"
            step={opts.step ?? 1000}
            value={Math.round(input[key] * scale * 100) / 100}
            onChange={(e) => setInput({ ...input, [key]: Number(e.target.value) / scale })}
          />
          {opts.suffix ?? '円'}
        </span>
      </label>
    )
  }

  return (
    <div className="wage">
      <div className="fields">
        <label className="field">
          <span>生活費の基準</span>
          <select value={basis} onChange={(e) => setBasis(e.target.value as LivingBasis)}>
            {Object.entries(basisLabel).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        {basis === 'manual' ? field('living', '生活費（家賃を除く）') : (
          <div className="field">
            <span>生活費（家賃を除く）</span>
            <span>{yen(livingValue)}</span>
          </div>
        )}
        {field('rent', '家賃（全額）')}
        {field('extraFixed', '社会保険・住民税など（別に見積もる場合）')}
        {field('savings', '毎月の貯金目標')}
        {field('takeHomeRate', '手取り率', { step: 1, suffix: '%', scale: 100 })}
        {field('hoursPerMonth', '月の労働時間', { step: 1, suffix: '時間' })}
      </div>
      <div className="tiles">
        <div className="tile">
          <div className="muted">必要な手取り（月）</div>
          <div className="tile-value">{yen(result.requiredTakeHome)}</div>
        </div>
        <div className="tile">
          <div className="muted">必要な額面（月）</div>
          <div className="tile-value">{yen(result.requiredGross)}</div>
        </div>
        <div className="tile">
          <div className="muted">必要な時給</div>
          <div className="tile-value">{yen(result.hourlyWage)}</div>
        </div>
      </div>
      <p className="muted small">
        手取り率は大まかな仮定です。アルバイトでは国民健康保険・国民年金を自分で払う場合があり、住民税は前年の所得で決まります。
        これらを手取り率に含めず個別に見積もる場合は「社会保険・住民税など」に入れてください。
      </p>
    </div>
  )
}
