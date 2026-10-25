import { APP_NAME } from '../config/app'
import type { Transaction } from '../domain/types'
import { FileImport } from './FileImport'

interface Props {
  onLoad: (transactions: Transaction[]) => void
  onSample: () => void
}

const FEATURES = [
  {
    title: '月ごとの支出と収入',
    body: 'カテゴリーごとの金額と割合をグラフと表で出し、月平均・中央値・直近の平均を計算します。',
  },
  {
    title: '相殺と除外',
    body: '割り勘の回収は立て替えた支出から差し引き、積立や口座の間の移動は集計から外せます。',
  },
  {
    title: '手取りと予算',
    body: '時給や月給から所得税・住民税・社会保険料を引いた手取りを計算し、生活費と貯金を引いた残りを出します。',
  },
]

/** データが無いときの最初の画面。何をするページかと、どう始めるかを書く */
export function Landing({ onLoad, onSample }: Props) {
  return (
    <div className="landing">
      <header className="landing-hero">
        <h1 className="app-title">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
          {APP_NAME}
        </h1>
        <p className="lead">家計簿アプリから書き出したCSVを読み込んで、月ごとの支出と収入を集計します。</p>
        <div className="landing-actions">
          <FileImport onLoad={onLoad} label="CSVを読み込む" primary />
          <button onClick={onSample}>サンプルのデータで試す</button>
        </div>
        <p className="privacy">
          <LockIcon /> CSVはこのブラウザの中だけで処理します。サーバーには送信しません（アクセス数の集計に Vercel Analytics を使っています）。
        </p>
      </header>

      <section className="landing-section">
        <h2>できること</h2>
        <div className="feature-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="feature">
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <h2>使い方</h2>
        <ol className="steps-list">
          <li>家計簿アプリからCSVを書き出します。今は、iPhoneアプリ「家計簿」の形式に対応しています。</li>
          <li>「CSVを読み込む」でファイルを選びます。</li>
        </ol>
        <details className="format">
          <summary>対応しているCSVの形式</summary>
          <p className="small">
            1行目が見出しで、「金額」「日付」「メモ」「カテゴリー名」の列があるCSVです。支出はマイナス、収入はプラスの金額で、日付は 2025/01/31 のような形です。ほかのアプリのCSVでも、この形に直せば読み込めます。
          </p>
          <pre className="small">{'金額,日付,メモ,カテゴリー名\n-1200,2025/01/05,スーパー,食料品\n235000,2025/01/25,給与,給与'}</pre>
        </details>
      </section>

      <p className="landing-note muted small">税・社会保険料の計算は目安です。</p>
    </div>
  )
}

function LockIcon() {
  return (
    <svg className="lock-icon" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" />
    </svg>
  )
}
