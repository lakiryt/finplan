import { useMemo, useState } from 'react'
import { CategoryTable } from './components/CategoryTable'
import { ClassifySettings } from './components/ClassifySettings'
import { FileImport } from './components/FileImport'
import { MonthlyChart } from './components/MonthlyChart'
import { RentBudget } from './components/RentBudget'
import { yen } from './components/format'
import { RawOverview } from './components/RawOverview'
import { StatTiles } from './components/StatTiles'
import { categorySummaries, filterByMonths, monthOf, monthRange, monthlyRows } from './domain/aggregate'
import { classify } from './domain/classify'
import { defaultConfig, parseConfig } from './domain/config'
import { seriesStats } from './domain/stats'
import type { ClassifyConfig, Transaction } from './domain/types'
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
  const [config, setConfig] = useStoredState<ClassifyConfig>('finplan.config', defaultConfig, parseConfig)
  const initial = useMemo(() => defaultPeriod(transactions), [transactions])
  const [period, setPeriod] = useState<{ from: string; to: string } | null>(null)
  const from = period?.from ?? initial?.from ?? ''
  const to = period?.to ?? initial?.to ?? ''

  const classified = useMemo(() => classify(transactions, config), [transactions, config])
  const inPeriod = useMemo(() => filterByMonths(classified, from, to), [classified, from, to])
  const rows = useMemo(() => (from && to ? monthlyRows(inPeriod, from, to) : []), [inPeriod, from, to])
  const livingStats = useMemo(() => seriesStats(rows.map((r) => r.living)), [rows])
  const incomeStats = useMemo(() => seriesStats(rows.map((r) => r.income)), [rows])
  const livingGroups = config.groups.filter((g) => g.role === 'living')
  const livingSummaries = useMemo(
    () => categorySummaries(inPeriod.filter((t) => t.role === 'living'), rows.length),
    [inPeriod, rows.length],
  )
  const unassignedCount = classified.filter((t) => !t.groupId).length

  return (
    <main>
      <header>
        <h1>finplan</h1>
        <p className="muted">家計簿のCSVから家賃を除いた生活費の実績を集計し、家賃の目安を計算します。</p>
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
            <h2>2. そのまま見る（加工なし）</h2>
            <RawOverview transactions={transactions} from={from} to={to} />
          </section>

          <section>
            <details open={unassignedCount > 0}>
              <summary>
                <h2>3. 分類の設定</h2>
                {unassignedCount > 0 && <span className="badge">未分類 {unassignedCount}件</span>}
              </summary>
              <ClassifySettings
                config={config}
                onChange={setConfig}
                onReset={() => setConfig(defaultConfig)}
                transactions={transactions}
                classified={classified}
              />
            </details>
          </section>

          <section>
            <h2>4. 生活費の実績（家賃を除く）</h2>
            <StatTiles
              tiles={[
                { label: '生活費 月平均', value: livingStats.mean, note: `${livingStats.count}か月` },
                { label: '生活費 中央値', value: livingStats.median, note: '大きな出費の影響を受けにくい' },
                { label: '生活費 直近6か月平均', value: livingStats.recent[6], note: `直近3か月 ${yen(livingStats.recent[3])}` },
                { label: '収入 月平均', value: incomeStats.mean, note: `直近6か月 ${yen(incomeStats.recent[6])}` },
              ]}
            />
            <MonthlyChart rows={rows} groups={livingGroups} allGroups={config.groups} average={livingStats.mean} />
            <details>
              <summary>
                <h3>カテゴリー別の内訳</h3>
              </summary>
              <CategoryTable summaries={livingSummaries} groups={config.groups} />
            </details>
          </section>

          <section>
            <h2>5. 家賃の目安</h2>
            <RentBudget living={livingStats} />
          </section>
        </>
      )}
    </main>
  )
}
