import { useCallback, useMemo, useState } from 'react'
import { Budget } from './components/Budget'
import { FileImport } from './components/FileImport'
import { Landing } from './components/Landing'
import { ProcessingCards } from './components/ProcessingCards'
import { RecordDialog } from './components/RecordDialog'
import { RawOverview } from './components/RawOverview'
import { SettingsIO } from './components/SettingsIO'
import type { RecordsRequest, RuleDraft } from './components/ruleText'
import { APP_NAME } from './config/app'
import { initialProcessing, initialView } from './config/initial'
import { filterByMonths, monthOf, monthRange } from './domain/aggregate'
import { applyProcessing, parseProcessingConfig, type ProcessingConfig } from './domain/processing'
import { categoryTotals, rankByTotal, rawMonthlyRows, type Side } from './domain/raw'
import { sampleTransactions } from './domain/sample'
import { seriesStats } from './domain/stats'
import type { Transaction } from './domain/types'
import { parseViewConfig, type ViewConfig } from './domain/view'
import { removeStored, useStoredState } from './state/storage'

const TX_KEY = 'finplan.transactions'
const SAMPLE_KEY = 'finplan.isSample'

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

/** その月の初日と末日（YYYY-MM-DD） */
function monthDays(month: string) {
  const [y, m] = month.split('-').map(Number)
  return { from: `${month}-01`, to: `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}` }
}

export default function App() {
  const [transactions, setTransactions] = useStoredState<Transaction[]>(TX_KEY, [])
  // 読み込んでいるのがサンプルのデータか（画面に、架空のデータであることを出す）
  const [isSample, setIsSample] = useStoredState(SAMPLE_KEY, false)
  const [processing, setProcessing] = useStoredState<ProcessingConfig>('finplan.processing', initialProcessing, parseProcessingConfig)
  const [view, setView] = useStoredState<ViewConfig>('finplan.view', initialView, parseViewConfig)
  const initial = useMemo(() => defaultPeriod(transactions), [transactions])
  const [period, setPeriod] = useState<{ from: string; to: string } | null>(null)
  const from = period?.from ?? initial?.from ?? ''
  const to = period?.to ?? initial?.to ?? ''
  // 記録の画面（2. の棒グラフや 3. の条件から開く）
  const [records, setRecords] = useState<RecordsRequest | null>(null)
  const categories = useMemo<Record<Side, string[]>>(
    () => ({ income: rankByTotal(categoryTotals(transactions, 'income')), expense: rankByTotal(categoryTotals(transactions, 'expense')) }),
    [transactions],
  )
  // グラフは描き直しが重いので、渡す関数は作り直さない
  const showMonth = useCallback(
    (side: Side, month: string) => setRecords({ draft: { enabled: true, when: { side, ...monthDays(month) }, target: null } }),
    [],
  )
  const saveRule = (d: RuleDraft, id?: string) => {
    const name = d.name?.trim()
    const rule = { id: id ?? crypto.randomUUID(), ...(name && { name }), enabled: d.enabled, when: d.when, target: d.target }
    setProcessing({ ...processing, rules: id ? processing.rules.map((r) => (r.id === id ? rule : r)) : [...processing.rules, rule] })
  }

  const load = (txs: Transaction[], sample = false) => {
    setTransactions(txs)
    setIsSample(sample)
    setPeriod(null)
  }

  // 4. の生活費は、2. と同じ加工後の支出
  const livingStats = useMemo(() => {
    if (!from || !to) return seriesStats([])
    const rows = rawMonthlyRows(filterByMonths(applyProcessing(transactions, processing), from, to), from, to)
    return seriesStats(rows.map((r) => r.expense))
  }, [transactions, processing, from, to])

  // データが無ければ、何をするページかを伝える最初の画面を出す
  if (!transactions.length || !initial) {
    return (
      <main>
        <Landing onLoad={(txs) => load(txs)} onSample={() => load(sampleTransactions(), true)} />
      </main>
    )
  }

  return (
    <main>
      <header className="app-header">
        <h1 className="app-title">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
          {APP_NAME}
        </h1>
      </header>

      <section>
        <h2>1. データ</h2>
        {isSample && (
          <p className="sample-banner small">
            <strong>サンプルのデータ（架空の1年分）を表示しています。</strong>
            3. で「積立」と「出金」を除外し、「回収」を「外食」から差し引く（相殺）と、整えた生活費の違いを確かめられます。
          </p>
        )}
        <div className="row">
          <FileImport onLoad={(txs) => load(txs)} label={isSample ? '自分のCSVを読み込む' : 'CSVを読み込み直す'} />
          <span className="muted small">
            {isSample ? 'サンプル' : '保存中'}: {transactions.length}件（このブラウザの中だけに保存しています）
          </span>
          <button
            onClick={() => {
              removeStored(TX_KEY)
              setTransactions([])
              setIsSample(false)
            }}
          >
            データを消去
          </button>
        </div>
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
      </section>

      <section>
        <h2>2. 支出と収入</h2>
        <RawOverview
          transactions={transactions}
          processing={processing}
          from={from}
          to={to}
          view={view}
          onViewChange={setView}
          onShowMonth={showMonth}
        />
      </section>

      <section>
        <h2>3. 加工</h2>
        <div className="row">
          <span className="muted small">条件を足していくと、2. と 4. に反映されます。2. の棒グラフを押して、その月の記録から条件を作ることもできます。</span>
          <button onClick={() => confirm('加工の設定を初期状態に戻しますか？') && setProcessing(initialProcessing)}>加工の設定を初期に戻す</button>
        </div>
        <ProcessingCards config={processing} onChange={setProcessing} onOpen={setRecords} />
      </section>

      <section>
        <h2>4. これからの予算</h2>
        <p className="muted small">
          想定する手取りから、生活費（2. の支出、3. の加工後）と毎月の貯金を引いた残りです。家賃・ローン・新しく始めたいことなど、これから決める支出に回せる額の目安になります。
          これから決め直す支出が今の記録に入っているなら（引っ越し前の家賃など）、3. の相殺でその支出を収入から差し引くと、それを除いた生活費で計算できます。
        </p>
        <Budget living={livingStats} />
      </section>

      <section>
        <h2>設定の保存と読み込み</h2>
        <p className="muted small">
          グラフの並び順・大分類・色（2.）と、相殺・除外の条件（3.）を、ファイルに書き出して残したり、別のブラウザで読み込んだりできます。設定はこのブラウザにも自動で保存されています。
        </p>
        <div className="row">
          <SettingsIO view={view} processing={processing} transactions={transactions} onViewChange={setView} onProcessingChange={setProcessing} />
        </div>
      </section>

      <RecordDialog
        request={records}
        categories={categories}
        transactions={transactions}
        processing={processing}
        onSave={saveRule}
        onDelete={(id) => setProcessing({ ...processing, rules: processing.rules.filter((r) => r.id !== id) })}
        onClose={() => setRecords(null)}
      />
    </main>
  )
}
