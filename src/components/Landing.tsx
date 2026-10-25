import { APP_NAME, APP_TAGLINE } from '../config/app'
import type { Transaction } from '../domain/types'
import { FileImport } from './FileImport'

interface Props {
  onLoad: (transactions: Transaction[]) => void
  onSample: () => void
}

const FEATURES = [
  {
    title: '支出と収入を見る',
    body: '月ごとの推移とカテゴリーの割合をグラフにし、平均・中央値・直近の平均を出します。カテゴリーは大分類にまとめたり、色を付けたりできます。',
  },
  {
    title: '数字を整える',
    body: '割り勘の回収や返金は、立て替えた支出と打ち消し（相殺）、積立や口座の間の移動は除きます（除外）。どの記録をどう扱うかは、条件か一覧から選びます。',
  },
  {
    title: '計画に使う',
    body: '時給や月給から、所得税・住民税・社会保険料を引いた手取りを見積もり、生活費と貯金を引いた残りを出します。家賃や新しい支出を決める材料になります。',
  },
]

const STEPS = [
  { title: '家計簿アプリからCSVを書き出す', body: '今は、iPhoneアプリ「家計簿」が書き出す形式に対応しています。' },
  { title: 'このページで読み込む', body: 'ファイルはブラウザの中だけで読み込みます。' },
  { title: '見る・整える・計画する', body: '整えた数字は、グラフと計画の両方にそのまま反映されます。' },
]

/** データが無いときの最初の画面。何をするページかと、どう始めるかを伝える */
export function Landing({ onLoad, onSample }: Props) {
  return (
    <div className="landing">
      <header className="landing-hero">
        <p className="brand">{APP_NAME}</p>
        <h1>{APP_TAGLINE}</h1>
        <p className="lead">
          家計簿アプリのCSVを読み込むと、毎月の生活費と収入の実績を、計画に使える数字にまとめます。割り勘や貯金への移動のような「本当の支出ではない記録」を整理して、実際にいくらで暮らしているかを確かめられます。
        </p>
        <div className="landing-actions">
          <FileImport onLoad={onLoad} label="CSVを読み込む" primary />
          <button onClick={onSample}>サンプルのデータで試す</button>
        </div>
        <p className="privacy">
          <LockIcon /> 読み込んだCSVは、このブラウザの中だけで処理します。サーバーには送信せず、保存先もこのブラウザだけです。
        </p>
        <MiniChart />
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
          {STEPS.map((s) => (
            <li key={s.title}>
              <strong>{s.title}</strong>
              <span className="muted">{s.body}</span>
            </li>
          ))}
        </ol>
        <details className="format">
          <summary>対応しているCSVの形式</summary>
          <p className="small">
            1行目が見出しで、「金額」「日付」「メモ」「カテゴリー名」の列があるCSVです。支出はマイナス、収入はプラスの金額で、日付は 2025/01/31 のような形です。ほかのアプリのCSVでも、この形に直せば読み込めます。
          </p>
          <pre className="small">{'金額,日付,メモ,カテゴリー名\n-1200,2025/01/05,スーパー,食料品\n235000,2025/01/25,給与,給与'}</pre>
        </details>
      </section>

      <p className="landing-note muted small">計算の結果は目安です。税・社会保険料の計算の考え方と限界は、プロジェクトの docs/take-home-pay.md にまとめています。</p>
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

/** 画面のイメージ（装飾）。月ごとの積み上げ棒と平均の線 */
function MiniChart() {
  const months = [62, 70, 58, 66, 74, 60, 68, 96, 64, 61, 69, 72]
  return (
    <svg className="mini-chart" viewBox="0 0 240 90" role="img" aria-label="月ごとの支出の積み上げ棒グラフのイメージ">
      {months.map((h, i) => {
        const x = 8 + i * 19
        const a = h * 0.45
        const b = h * 0.3
        const c = h - a - b
        return (
          <g key={i}>
            <rect x={x} y={86 - a} width={12} height={a} rx={1} className="mc-a" />
            <rect x={x} y={86 - a - b} width={12} height={b} className="mc-b" />
            <rect x={x} y={86 - h} width={12} height={c} rx={2} className="mc-c" />
          </g>
        )
      })}
      <line x1={4} x2={236} y1={86 - 68} y2={86 - 68} className="mc-mean" />
    </svg>
  )
}
