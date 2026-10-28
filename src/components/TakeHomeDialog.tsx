import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NIGHT_PREMIUM, TAX_YEARS, type TaxYear } from '../domain/incomeTax'
import {
  addJob,
  DEFAULT_TAKE_HOME,
  jobLabel,
  parseTakeHomeInput,
  takeHome,
  type ItemKey,
  type Job,
  type NhiPart,
  type TakeHomeInput,
  type TakeHomeResult,
} from '../domain/takeHome'
import { useStoredState } from '../state/storage'
import { yen } from './format'

type Tab = 'wage' | ItemKey
const ITEMS: { key: ItemKey; label: string }[] = [
  { key: 'incomeTax', label: '所得税' },
  { key: 'residentTax', label: '住民税' },
  { key: 'health', label: '健康保険' },
  { key: 'pension', label: '年金' },
  { key: 'employment', label: '雇用保険' },
]

interface Props {
  open: boolean
  /** 計算した手取りを、想定する手取りに入れる */
  onApply: (takeHome: number) => void
  onClose: () => void
}

/** 項目ごとの設定（給与・税のルール・年齢以外） */
type Section = ItemKey
type SetSection = <K extends Section>(key: K, patch: Partial<TakeHomeInput[K]>) => void

/** 空欄は0として扱う */
const num = (v: string) => (v === '' ? 0 : Number(v))

/**
 * 想定する手取りを、時給と労働時間から計算する窓。所得税・住民税・社会保険をタブに分け、
 * それぞれ手取りの計算に含めるかを選べる。詳しくは docs/take-home-pay.md
 */
export function TakeHomeDialog({ open, onApply, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [input, setInput] = useStoredState<TakeHomeInput>('finplan.takeHome.v3', DEFAULT_TAKE_HOME, parseTakeHomeInput)
  const [tab, setTab] = useState<Tab>('wage')

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const result = takeHome(input)
  const insuredNames = input.jobs.flatMap((j, i) => (j.socialInsurance ? [jobLabel(j, i)] : [])).join('・')
  const set: SetSection = (key, patch) => setInput({ ...input, [key]: { ...input[key], ...patch } })
  const include = (key: ItemKey) => (
    <label className="include">
      <input type="checkbox" checked={input[key].include} onChange={(e) => set(key, { include: e.target.checked })} />
      手取りの計算に含める
    </label>
  )

  return (
    <dialog ref={ref} className="json-dialog takehome-dialog" onClose={onClose} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="json-dialog-body takehome">
        <h3>手取りの計算</h3>
        <div className="tabs" role="tablist">
          <TabButton active={tab === 'wage'} onClick={() => setTab('wage')} label="給与" sub={yen(result.monthlyPay)} />
          {ITEMS.map((item) => {
            const it = result.items[item.key]
            return (
              <TabButton
                key={item.key}
                active={tab === item.key}
                off={!it.include}
                onClick={() => setTab(item.key)}
                label={item.label}
                sub={it.include ? `−${yen(it.annual / 12)}` : '含めない'}
              />
            )
          })}
        </div>

        <div className="tab-panel" role="tabpanel">
          {tab === 'wage' && <WagePanel input={input} setInput={setInput} result={result} />}

          {tab === 'incomeTax' && (
            <>
              {include('incomeTax')}
              <Lines
                rows={[
                  [input.jobs.length > 1 ? '年収（すべての職の合計）' : '年収', result.incomeTax.revenue],
                  ['給与所得控除', -result.incomeTax.salaryDeduction],
                  ['基礎控除', -result.incomeTax.basicDeduction],
                  ['社会保険料控除', -result.incomeTax.socialInsurance, '含めた社会保険料'],
                  ['課税所得', result.incomeTax.taxable, '1,000円未満切り捨て'],
                  ['所得税', result.incomeTax.baseTax],
                  ['復興特別所得税', result.incomeTax.reconstruction, '所得税の2.1%'],
                  ['年額', result.incomeTax.total, '100円未満切り捨て'],
                ]}
              />
              <p className="muted small">
                1年働いた場合の年額（年末調整・確定申告で決まる額）です。毎月の天引きはこれと違うことがあります。
                {input.jobs.length > 1 ? '2か所以上で働くと、主な勤務先以外では天引きが多くなり（乙欄）、確定申告で精算します。' : ''}
              </p>
            </>
          )}

          {tab === 'residentTax' && (
            <>
              {include('residentTax')}
              <div className="editor-row">
                {(
                  [
                    ['calc', '計算する'],
                    ['manual', '金額を入れる'],
                  ] as const
                ).map(([mode, label]) => (
                  <label key={mode}>
                    <input type="radio" checked={input.residentTax.mode === mode} onChange={() => set('residentTax', { mode })} />
                    {label}
                  </label>
                ))}
              </div>
              {input.residentTax.mode === 'manual' ? (
                <>
                  <NumberField label="住民税の年額" unit="円" step={1000} value={input.residentTax.manualAnnual} onChange={(v) => set('residentTax', { manualAnnual: v })} />
                  <p className="muted small">住民税は前の年の所得で決まります。収入が変わった最初の年は、前の年の所得による住民税（通知書の額など）を入れてください。</p>
                </>
              ) : (
                <>
                  <NumberField label="均等割（森林環境税を含む）" unit="円" step={100} value={input.residentTax.perCapita} onChange={(v) => set('residentTax', { perCapita: v })} />
                  <label className="field">
                    <span>級地（均等割がかからない所得の線）</span>
                    <select value={input.residentTax.grade} onChange={(e) => set('residentTax', { grade: Number(e.target.value) as 1 | 2 | 3 })}>
                      <option value={1}>1級地（大都市など。所得45万円以下）</option>
                      <option value={2}>2級地（所得41.5万円以下）</option>
                      <option value={3}>3級地（所得38万円以下）</option>
                    </select>
                  </label>
                  {result.residentTax && (
                    <Lines
                      rows={[
                        ['給与所得', result.residentTax.salaryIncome],
                        ['基礎控除', -result.residentTax.basicDeduction, '所得税より小さい'],
                        ['社会保険料控除', -result.residentTax.socialInsurance, '含めた社会保険料'],
                        ['課税所得', result.residentTax.taxable, '1,000円未満切り捨て'],
                        ['調整控除', -result.residentTax.adjustment, '基礎控除の差による'],
                        ['所得割', result.residentTax.incomeLevy, '課税所得の10% − 調整控除'],
                        ['均等割', result.residentTax.perCapitaLevy],
                        ['年額', result.residentTax.total],
                      ]}
                    />
                  )}
                  <p className="muted small">
                    単身で、同じ働き方が続いた2年目以降の額です（住民税は前の年の所得で決まり、6月から払います）。最初の年は「金額を入れる」で、前の年の所得による額を入れてください。
                  </p>
                </>
              )}
            </>
          )}

          {tab === 'health' && (
            <HealthPanel
              input={input}
              set={set}
              setAge={(age40to64) => setInput({ ...input, age40to64 })}
              include={include('health')}
              result={result.health}
              insuredNames={insuredNames}
            />
          )}

          {tab === 'pension' && (
            <>
              {include('pension')}
              <p className="scheme">{result.pension.scheme === 'employee' ? `厚生年金（${insuredNames}で加入）` : '国民年金（勤務先の厚生年金に入る職が無いため）'}</p>
              {result.pension.scheme === 'employee' ? (
                <NumberField label="厚生年金の料率（本人と勤務先の合計）" unit="%" step={0.01} value={input.pension.employeeRate} onChange={(v) => set('pension', { employeeRate: v })} />
              ) : (
                <NumberField label="国民年金の月額" unit="円" step={10} value={input.pension.nationalMonthly} onChange={(v) => set('pension', { nationalMonthly: v })} />
              )}
              <Lines rows={result.pension.lines.map((l) => [l.label, l.value, l.note])} />
              <p className="muted small">
                どちらになるかは、給与のタブの「この勤務先の健康保険・厚生年金に入る」で決まります。国民年金は 2026年度 月17,920円、2027年度 月18,290円です。
              </p>
            </>
          )}

          {tab === 'employment' && (
            <>
              {include('employment')}
              {!input.jobs.some((j) => j.employmentInsurance) && <p className="scheme">雇用保険に入る職がありません（給与のタブで選びます）。</p>}
              <NumberField label="本人の負担率" unit="%" step={0.05} value={input.employment.rate} onChange={(v) => set('employment', { rate: v })} />
              <Lines rows={result.employment.lines.map((l) => [l.label, l.value, l.note])} />
              <p className="muted small">
                週20時間以上・31日以上働く見込みなら加入します（2028年10月からは週10時間以上）。2か所以上で条件を満たしても、入るのは主な賃金を受け取る1か所だけです（65歳以上は、2か所を合わせて週20時間以上なら申し出て入れる制度があります）。2026年度の一般の事業の本人負担は0.5%です。
              </p>
            </>
          )}
        </div>

        <table className="takehome-summary">
          <tbody>
            <tr>
              <td>月の給与（額面）{result.bonusTotal ? ' ＋ 賞与の月割り' : ''}</td>
              <td className="num">{yen(result.annualPay / 12)}</td>
            </tr>
            {ITEMS.map((item) => {
              const it = result.items[item.key]
              return (
                <tr key={item.key} className={it.include ? undefined : 'off'}>
                  <td>{item.label}</td>
                  <td className="num">{it.include ? `−${yen(it.annual / 12)}` : `（含めない ${yen(it.annual / 12)}）`}</td>
                </tr>
              )
            })}
            <tr className="takehome-result">
              <td>手取りの目安（月{result.bonusTotal ? 'の平均、賞与込み' : ''}）</td>
              <td className="num">{yen(result.takeHomeMonthly)}</td>
            </tr>
          </tbody>
        </table>
        <p className="muted small">
          税・保険料は年額を12で割った月の平均です{result.bonusTotal ? '（賞与も12で割って足しています。賞与の無い月の手取りはこれより少なくなります）' : ''}。含めない社会保険料は、所得税・住民税の社会保険料控除にも入れません。扶養・生命保険料などの控除、残業・賞与・手当は入れていません。詳しくは
          docs/take-home-pay.md にまとめています。
        </p>
        <div className="row">
          <button
            onClick={() => {
              onApply(result.takeHomeMonthly)
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

function TabButton({ active, off, onClick, label, sub }: { active: boolean; off?: boolean; onClick: () => void; label: string; sub: string }) {
  return (
    <button role="tab" aria-selected={active} className={`tab ${active ? 'active' : ''} ${off ? 'off' : ''}`} onClick={onClick}>
      <span>{label}</span>
      <span className="tab-sub">{sub}</span>
    </button>
  )
}

function NumberField({ label, unit, step, value, onChange }: { label: string; unit: string; step: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <span>
        <input type="number" step={step} value={value} onChange={(e) => onChange(num(e.target.value))} />
        {unit}
      </span>
    </label>
  )
}

/** 計算の内訳の表。金額の列は円、note が「%」なら率として出す */
function Lines({ rows }: { rows: [string, number, string?][] }) {
  return (
    <table>
      <tbody>
        {rows.map(([label, value, note]) => (
          <tr key={label}>
            <td>{label}</td>
            <td className="num">{note === '%' ? `${Math.round(value * 1000) / 1000}%` : yen(value)}</td>
            <td className="muted small">{note === '%' ? '' : note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function WagePanel({ input, setInput, result }: { input: TakeHomeInput; setInput: (i: TakeHomeInput) => void; result: TakeHomeResult }) {
  const setJob = (id: string, patch: Partial<Job>) => setInput({ ...input, jobs: input.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) })
  // 雇用保険はふつう1つの勤務先だけで入るので、1つを選ぶとほかは外す
  const setEmployment = (id: string, on: boolean) =>
    setInput({ ...input, jobs: input.jobs.map((j) => ({ ...j, employmentInsurance: j.id === id ? on : on ? false : j.employmentInsurance })) })
  const several = input.jobs.length > 1
  return (
    <>
      {input.jobs.map((job, i) => (
        <JobCard
          key={job.id}
          job={job}
          label={jobLabel(job, i)}
          pay={result.jobs[i]}
          onChange={(patch) => setJob(job.id, patch)}
          onEmployment={(on) => setEmployment(job.id, on)}
          onRemove={several ? () => setInput({ ...input, jobs: input.jobs.filter((j) => j.id !== job.id) }) : undefined}
        />
      ))}
      <div className="row">
        <button onClick={() => setInput({ ...input, jobs: addJob(input.jobs) })}>＋ 職を追加</button>
        <label className="field push-right">
          <span>税のルール</span>
          <select value={input.year} onChange={(e) => setInput({ ...input, year: e.target.value as TaxYear })}>
            {TAX_YEARS.map((y) => (
              <option key={y.key} value={y.key}>
                {y.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {several && (
        <Lines
          rows={[
            ['月の給与の合計', result.monthlyPay],
            ...(result.bonusTotal ? [['賞与の年額の合計', result.bonusTotal] as [string, number]] : []),
            ['年収の合計', result.annualPay],
          ]}
        />
      )}
      <p className="muted small">
        {several
          ? '所得税・住民税はすべての職の給与を合算してかかり、給与所得控除も合算した額に1回だけ引きます。健康保険・厚生年金は、勤務先で入る職の報酬を合算して決めます。2か所以上から給与を受け取ると、確定申告が必要になることがあります。'
          : '職を追加すると、掛け持ちの場合を計算できます。'}
        通勤手当は含めないでください（一定額まで税がかからないため）。
      </p>
    </>
  )
}

function JobCard({
  job,
  label,
  pay,
  onChange,
  onEmployment,
  onRemove,
}: {
  job: Job
  label: string
  pay: TakeHomeResult['jobs'][number]
  onChange: (patch: Partial<Job>) => void
  onEmployment: (on: boolean) => void
  onRemove?: () => void
}) {
  const setWage = (patch: Partial<Job['wage']>) => onChange({ wage: { ...job.wage, ...patch } })
  const setSalary = (patch: Partial<Job['salary']>) => onChange({ salary: { ...job.salary, ...patch } })
  const w = job.wage
  const salary = job.payMode === 'salary'
  return (
    <div className="job-card">
      <div className="editor-row">
        <input className="job-name" value={job.name} placeholder={label} onChange={(e) => onChange({ name: e.target.value })} aria-label="職の名前" />
        {(
          [
            ['hourly', '時給で計算'],
            ['salary', '月給と賞与で計算'],
          ] as const
        ).map(([mode, text]) => (
          <label key={mode}>
            <input type="radio" checked={job.payMode === mode} onChange={() => onChange({ payMode: mode })} />
            {text}
          </label>
        ))}
        {onRemove && (
          <button className="push-right" onClick={onRemove}>
            削除
          </button>
        )}
      </div>
      <div className="fields">
        {salary ? (
          <>
            <NumberField label="月給（額面）" unit="円" step={10000} value={job.salary.monthly} onChange={(v) => setSalary({ monthly: v })} />
            <NumberField label="賞与（1回あたりの額面）" unit="円" step={10000} value={job.salary.bonus} onChange={(v) => setSalary({ bonus: v })} />
            <NumberField label="賞与の回数（年）" unit="回" step={1} value={job.salary.bonusTimes} onChange={(v) => setSalary({ bonusTimes: v })} />
          </>
        ) : (
          <>
            <NumberField label="時給" unit="円" step={10} value={w.hourly} onChange={(v) => setWage({ hourly: v })} />
            <NumberField label="月の労働時間" unit="時間" step={1} value={w.hours} onChange={(v) => setWage({ hours: v })} />
            <NumberField label="うち深夜（22時〜5時）の時間" unit="時間" step={1} value={w.nightHours} onChange={(v) => setWage({ nightHours: v })} />
            <label className="field">
              <span>深夜の時給（空欄なら1.25倍）</span>
              <span>
                <input
                  type="number"
                  step={10}
                  value={w.nightHourly ?? ''}
                  placeholder={String(Math.round(w.hourly * (1 + NIGHT_PREMIUM)))}
                  onChange={(e) => setWage({ nightHourly: e.target.value === '' ? undefined : Number(e.target.value) })}
                />
                円
              </span>
            </label>
          </>
        )}
      </div>
      <div className="editor-row">
        <label>
          <input type="checkbox" checked={job.socialInsurance} onChange={(e) => onChange({ socialInsurance: e.target.checked })} />
          この勤務先の健康保険・厚生年金に入る
        </label>
        <label>
          <input type="checkbox" checked={job.employmentInsurance} onChange={(e) => onEmployment(e.target.checked)} />
          この勤務先で雇用保険に入る
        </label>
      </div>
      <p className="muted small">
        月の給与 {yen(pay.monthly)}
        {pay.bonusTotal ? `・賞与 ${yen(pay.bonusTotal)}（年）` : ''}・年収 {yen(pay.annual)}
      </p>
    </div>
  )
}

function HealthPanel({
  input,
  set,
  setAge,
  include,
  result,
  insuredNames,
}: {
  input: TakeHomeInput
  set: SetSection
  setAge: (age40to64: boolean) => void
  include: ReactNode
  result: TakeHomeResult['health']
  insuredNames: string
}) {
  const h = input.health
  const setPart = (i: number | 'care', patch: Partial<NhiPart>) =>
    i === 'care' ? set('health', { nationalCare: { ...h.nationalCare, ...patch } }) : set('health', { national: h.national.map((p, j) => (j === i ? { ...p, ...patch } : p)) })
  const parts: [number | 'care', NhiPart][] = [...h.national.map((p, i) => [i, p] as [number, NhiPart]), ...(input.age40to64 ? [['care', h.nationalCare] as ['care', NhiPart]] : [])]
  return (
    <>
      {include}
      <div className="editor-row">
        {(
          [
            ['calc', '計算する'],
            ['manual', '金額を入れる'],
          ] as const
        ).map(([mode, label]) => (
          <label key={mode}>
            <input type="radio" checked={h.mode === mode} onChange={() => set('health', { mode })} />
            {label}
          </label>
        ))}
        <label className="push-right">
          <input type="checkbox" checked={input.age40to64} onChange={(e) => setAge(e.target.checked)} />
          40〜64歳（介護保険料がかかる）
        </label>
      </div>

      {result.scheme === 'employee' && (
        <>
          <p className="scheme">勤務先の健康保険（{insuredNames}で加入）</p>
          <div className="fields">
            <NumberField label="健康保険料率（本人と勤務先の合計）" unit="%" step={0.01} value={h.employeeRate} onChange={(v) => set('health', { employeeRate: v })} />
            <NumberField label="子ども・子育て支援金率" unit="%" step={0.01} value={h.childRate} onChange={(v) => set('health', { childRate: v })} />
            {input.age40to64 && <NumberField label="介護保険料率" unit="%" step={0.01} value={h.careRate} onChange={(v) => set('health', { careRate: v })} />}
          </div>
          <p className="muted small">
            協会けんぽの 2026年度の料率（全国平均9.9%、都道府県で違う）を初期値にしています。勤務先の健康保険組合なら、その料率に直してください。2か所以上で入るときは、報酬を合算して標準報酬月額を決め、本人が選んだ1つの健康保険の料率がかかります。
          </p>
        </>
      )}

      {result.scheme === 'national' && (
        <>
          <p className="scheme">国民健康保険（勤務先の健康保険に入る職が無いため）</p>
          <table className="nhi-parts">
            <thead>
              <tr>
                <th>区分</th>
                <th className="num">所得割（%）</th>
                <th className="num">均等割（円）</th>
                <th className="num">上限（円）</th>
              </tr>
            </thead>
            <tbody>
              {parts.map(([i, p]) => (
                <tr key={p.label}>
                  <td>{p.label}</td>
                  <td className="num">
                    <input type="number" step={0.01} value={p.rate} onChange={(e) => setPart(i, { rate: num(e.target.value) })} />
                  </td>
                  <td className="num">
                    <input type="number" step={100} value={p.perCapita} onChange={(e) => setPart(i, { perCapita: num(e.target.value) })} />
                  </td>
                  <td className="num">
                    <input type="number" step={10000} value={p.cap} onChange={(e) => setPart(i, { cap: num(e.target.value) })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <label className="field">
            <span>均等割の軽減（所得の低い世帯）</span>
            <select value={h.reduction} onChange={(e) => set('health', { reduction: Number(e.target.value) })}>
              <option value={0}>なし</option>
              <option value={0.2}>2割</option>
              <option value={0.5}>5割</option>
              <option value={0.7}>7割</option>
            </select>
          </label>
          <p className="muted small">
            初期値は東京都中央区の 2026年度の料率（例）です。料率は市区町村ごとに違うので、お住まいの市区町村の値に直してください。前の年の所得（すべての職の合計）で決まるので、2年目以降の額です。
          </p>
        </>
      )}

      {h.mode === 'manual' ? (
        <NumberField label="健康保険料の年額" unit="円" step={1000} value={h.manualAnnual} onChange={(v) => set('health', { manualAnnual: v })} />
      ) : (
        <Lines rows={result.lines.map((l) => [l.label, l.value, l.note])} />
      )}
      <p className="muted small">
        勤務先の健康保険に入るのは、おおむね週20時間以上・2か月を超える見込み・学生でない・勤務先が従業員51人以上の場合です（規模の条件は2027年10月から段階的に小さくなる予定）。条件は勤務先ごとに見るので、2か所の労働時間を合わせて20時間以上でも、どちらでも入らないことがあります。
      </p>
    </>
  )
}
