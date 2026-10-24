import { useMemo, useState } from 'react'
import { FileImport } from './components/FileImport'
import { ProcessingCards } from './components/ProcessingCards'
import { RentBudget } from './components/RentBudget'
import { RawOverview } from './components/RawOverview'
import { initialProcessing } from './config/initial'
import { filterByMonths, monthOf, monthRange } from './domain/aggregate'
import { applyProcessing, parseProcessingConfig, type ProcessingConfig } from './domain/processing'
import { rawMonthlyRows } from './domain/raw'
import { seriesStats } from './domain/stats'
import type { Transaction } from './domain/types'
import { removeStored, useStoredState } from './state/storage'

const TX_KEY = 'finplan.transactions'

/** 最初・最後の月が途中から（途中まで）しか記録されていなければ、その月を除いた期間を初期値にする */
function defaultPeriod(txs: Transaction[]) {
  if (!txs.length) return null
  const dates = txs.map((t) => t.date).sort()
  const firstDate = dates[0]
  const lastDate = dates[dates.length - 1]
  const [y, m, d] = lastDate.split('-').map(Number)
  const startsOnFirst = firstDate.endsWith('-01')
  const endsOnLast = d === new Date(y, m, 0).getDate()
  const months = monthRange(monthOf(firstDate), monthOf(lastDate))
  const full = months.slice(startsOnFirst ? 0 : 1, endsOnLast ? undefined : -1)
  const range = full.length ? full : months
  return { from: range[0], to: range[range.length - 1], available: months }
}

export default function App() {
  const [transactions, setTransactions] = useStoredState<Transaction[]>(TX_KEY, [])
  const [processing, setProcessing] = useStoredState<ProcessingConfig>('finplan.processing', initialProcessing, parseProcessingConfig)
  const initial = useMemo(() => defaultPeriod(transactions), [transactions])
  const [period, setPeriod] = useState<{ from: string; to: string } | null>(null)
  const from = period?.from ?? initial?.from ?? ''
  const to = period?.to ?? initial?.to ?? ''

  // 家賃の目安に使う生活費は、2. と同じ加工後の支出
  const livingStats = useMemo(() => {
    if (!from || !to) return seriesStats([])
    const rows = rawMonthlyRows(filterByMonths(applyProcessing(transactions, processing), from, to), from, to)
    return seriesStats(rows.map((r) => r.expense))
  }, [transactions, processing, from, to])

  return (
    <main>
      <header>
        <h1>finplan</h1>
        <p className="muted">家計簿のCSVから、目的に合わせて加工した収入・支出（生活費）の実績を見ます。家賃などの計画の材料にできます。</p>
      </header>

      <section>
        <h2>1. データ</h2>
        <FileImport
          onLoad={(txs) => {
            setTransactions(txs)
            setPeriod(null)
          }}
        />
        {transactions.length > 0 && (
          <div className="row">
            <span className="muted">保存中: {transactions.length}件</span>
            <button
              onClick={() => {
                removeStored(TX_KEY)
                setTransactions([])
              }}
            >
              データを消去
            </button>
          </div>
        )}
        {initial && (
          <div className="row">
            <label>
              期間
              <select value={from} onChange={(e) => setPeriod({ from: e.target.value, to })}>
                {initial.available.filter((m) => m <= to).map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            〜
            <select value={to} onChange={(e) => setPeriod({ from, to: e.target.value })}>
              {initial.available.filter((m) => m >= from).map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <button onClick={() => setPeriod(null)}>初期の期間に戻す</button>
            <span className="muted small">以下のすべての集計に使われます</span>
          </div>
        )}
      </section>

      {transactions.length > 0 && initial && (
        <>
          <section>
            <h2>2. 支出と収入</h2>
            <RawOverview transactions={transactions} processing={processing} from={from} to={to} />
          </section>

          <section>
            <h2>3. 加工</h2>
            <div className="row">
              <span className="muted small">工程ごとに条件を足していくと、2. と 4. に反映されます。</span>
              <button onClick={() => confirm('加工の設定を初期状態に戻しますか？') && setProcessing(initialProcessing)}>加工の設定を初期に戻す</button>
            </div>
            <ProcessingCards config={processing} onChange={setProcessing} transactions={transactions} />
          </section>

          <section>
            <h2>4. 家賃の目安</h2>
            <p className="muted small">生活費は、2. の支出（3. の加工後）です。家賃を除いた生活費にするには、3. の相殺で家賃を収入から差し引きます。</p>
            <RentBudget living={livingStats} />
          </section>
        </>
      )}
    </main>
  )
}
