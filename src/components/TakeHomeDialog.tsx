import { useEffect, useRef } from 'react'
import { annualIncomeTax, monthlyPay, NIGHT_PREMIUM, TAX_YEARS, type TaxYear } from '../domain/incomeTax'
import { useStoredState } from '../state/storage'
import { yen } from './format'

interface Input {
  hourly: number
  hours: number
  nightHours: number
  /** 空欄なら時給の1.25倍 */
  nightHourly: number | null
  /** 1年に払う社会保険料（分かれば。所得税の計算で差し引く） */
  socialInsurance: number
  year: TaxYear
}

const INITIAL: Input = { hourly: 1200, hours: 120, nightHours: 0, nightHourly: null, socialInsurance: 0, year: 'r8' }

function parseInput(raw: unknown): Input {
  const r = raw as Partial<Input> | null
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
  return {
    hourly: num(r?.hourly, INITIAL.hourly),
    hours: num(r?.hours, INITIAL.hours),
    nightHours: num(r?.nightHours, 0),
    nightHourly: typeof r?.nightHourly === 'number' ? r.nightHourly : null,
    socialInsurance: num(r?.socialInsurance, 0),
    year: TAX_YEARS.some((y) => y.key === r?.year) ? (r!.year as TaxYear) : INITIAL.year,
  }
}

interface Props {
  open: boolean
  /** 計算した手取りを、想定する手取りに入れる */
  onApply: (takeHome: number) => void
  onClose: () => void
}

/**
 * 想定する手取りを、時給と労働時間から計算する窓。所得税だけを計算し、住民税・社会保険料は引かない
 * （社会保険料は、分かれば所得控除と手取りの両方に反映する）。詳しくは docs/take-home-pay.md
 */
export function TakeHomeDialog({ open, onApply, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [input, setInput] = useStoredState<Input>('finplan.takeHome.input', INITIAL, parseInput)
  const set = (patch: Partial<Input>) => setInput({ ...input, ...patch })
  const number = (v: string) => (v === '' ? 0 : Number(v))

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const pay = monthlyPay({ ...input, nightHourly: input.nightHourly ?? undefined })
  const tax = annualIncomeTax(pay * 12, input.socialInsurance, input.year)
  const takeHome = Math.floor(pay - tax.total / 12 - input.socialInsurance / 12)
  const rows: [string, number, string?][] = [
    ['年収（月の給与 × 12）', tax.revenue],
    ['給与所得控除', -tax.salaryDeduction],
    ['基礎控除', -tax.basicDeduction],
    ['社会保険料控除', -tax.socialInsurance],
    ['課税所得', tax.taxable, '1,000円未満切り捨て'],
    ['所得税', tax.baseTax],
    ['復興特別所得税', tax.reconstruction, '所得税の2.1%'],
    ['所得税の年額', tax.total, '100円未満切り捨て'],
  ]

  return (
    <dialog ref={ref} className="json-dialog" onClose={onClose} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="json-dialog-body takehome">
        <h3>手取りの計算（所得税だけ）</h3>
        <div className="fields">
          <label className="field">
            <span>時給</span>
            <span>
              <input type="number" step={10} value={input.hourly} onChange={(e) => set({ hourly: number(e.target.value) })} />円
            </span>
          </label>
          <label className="field">
            <span>月の労働時間</span>
            <span>
              <input type="number" step={1} value={input.hours} onChange={(e) => set({ hours: number(e.target.value) })} />時間
            </span>
          </label>
          <label className="field">
            <span>うち深夜（22時〜5時）の時間</span>
            <span>
              <input type="number" step={1} value={input.nightHours} onChange={(e) => set({ nightHours: number(e.target.value) })} />時間
            </span>
          </label>
          <label className="field">
            <span>深夜の時給</span>
            <span>
              <input
                type="number"
                step={10}
                value={input.nightHourly ?? ''}
                placeholder={String(Math.round(input.hourly * (1 + NIGHT_PREMIUM)))}
                onChange={(e) => set({ nightHourly: e.target.value === '' ? null : Number(e.target.value) })}
              />
              円
            </span>
          </label>
          <label className="field">
            <span>1年に払う社会保険料（分かれば）</span>
            <span>
              <input type="number" step={10000} value={input.socialInsurance} onChange={(e) => set({ socialInsurance: number(e.target.value) })} />円
            </span>
          </label>
          <label className="field">
            <span>税のルール</span>
            <select value={input.year} onChange={(e) => set({ year: e.target.value as TaxYear })}>
              {TAX_YEARS.map((y) => (
                <option key={y.key} value={y.key}>
                  {y.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted small">深夜の時給は、空欄なら時給の1.25倍（法定の割増の最低）で数えます。社会保険料は、健康保険・年金・雇用保険などの1年分の合計です。</p>

        <table>
          <tbody>
            <tr>
              <td>月の給与（額面）</td>
              <td className="num">{yen(pay)}</td>
              <td />
            </tr>
            {rows.map(([label, value, note]) => (
              <tr key={label}>
                <td>{label}</td>
                <td className="num">{yen(value)}</td>
                <td className="muted small">{note}</td>
              </tr>
            ))}
            <tr className="takehome-result">
              <td>手取りの目安（月）</td>
              <td className="num">{yen(takeHome)}</td>
              <td className="muted small">額面 − 所得税 ÷ 12{input.socialInsurance ? ' − 社会保険料 ÷ 12' : ''}</td>
            </tr>
          </tbody>
        </table>
        <p className="muted small">
          1年働いた場合の所得税の年額（年末調整・確定申告で決まる額）です。毎月の天引きはこれと違うことがあります。
          <strong>住民税{input.socialInsurance ? '' : '・社会保険料'}は引いていない</strong>
          ので、実際の手取りはこれより少なくなります（それぞれ月に数千円〜数万円）。ほかの所得控除（扶養・生命保険料など）や、残業・賞与・手当も入れていません。詳しくは
          docs/take-home-pay.md にまとめています。
        </p>
        <div className="row">
          <button
            onClick={() => {
              onApply(takeHome)
              onClose()
            }}
          >
            この額を想定する手取りに入れる
          </button>
          <button onClick={onClose}>閉じる</button>
        </div>
      </div>
    </dialog>
  )
}
