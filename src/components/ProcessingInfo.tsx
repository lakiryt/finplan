/*
 * 3. の加工のカードの ⓘ で開く説明。要点だけを短く書き、詳しい説明は docs/real-income-expense.md に置く。
 * 公開を前提に、特定の人のカテゴリー名ではなく一般的な例で書く
 */

const SOURCES = (
  <ul className="sources">
    <li>
      <a href="https://www.stat.go.jp/data/kakei/kaisetsu.html" target="_blank" rel="noreferrer">
        総務省統計局「家計調査 用語の解説」
      </a>
    </li>
    <li>
      <a href="https://www.e-stat.go.jp/koumoku/koumoku_teigi/L" target="_blank" rel="noreferrer">
        e-Stat「家計調査 項目の定義」
      </a>
    </li>
  </ul>
)

/** 実収入の考え方（収入側のカテゴリーの3つの扱い） */
export function RealIncomeInfo() {
  return (
    <>
      <p>収入側の各カテゴリーを、次のどれかにします。</p>
      <ul>
        <li>残す: 稼いだ・受け取ったお金（給与、利息、配当）</li>
        <li>除く: 管理の外から戻ってきた自分のお金（貯金の引き出し、株の売却代金）</li>
        <li>相殺: 支出の打ち消し（割り勘の回収、返金、ポイント）。選んだ支出から差し引きます</li>
      </ul>
      <p>例: 飲み会で4,000円を立て替え、あとで1,500円を回収した → 相殺にすると外食の支出は2,500円です（除くだけだと4,000円のまま残ります）。</p>
      <p className="muted">実収入 − 実支出 は、総務省の家計調査でいう「黒字」です。株の売却による損得は含まれません。</p>
      {SOURCES}
    </>
  )
}

/** 実支出の考え方 */
export function RealExpenseInfo() {
  return (
    <>
      <p>支出から、管理しているお金と外（貯蓄用の口座、証券口座など）との間の移動を除いたものが、実支出です。</p>
      <p>例: 食費5万円と、証券口座への積立3万円があった月 → 実支出は5万円です。</p>
      {SOURCES}
    </>
  )
}
