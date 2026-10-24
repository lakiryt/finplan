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

/** 除外の考え方 */
export function ExcludeInfo() {
  return (
    <>
      <p>
        使ったのでも稼いだのでもない、置き場所を移しただけのお金（積立、貯金の引き出しなど）を除きます。これだけを除いたものが、総務省の家計調査でいう「実収入」「実支出」です。臨時収入など、ふだんの稼ぎではないものを除くこともできます。
      </p>
      <p>例: 給与20万円と、貯金からの引き出し3万円があった月 → 引き出しを除くと収入は20万円です。</p>
      <p className="muted">家賃など本当に使ったお金を除くと、収支が実際より良く見えます。生活費の範囲から外したいときは、相殺を使います。</p>
      {SOURCES}
    </>
  )
}

/** 相殺の考え方（両方向） */
export function OffsetInfo() {
  return (
    <>
      <p>条件に当たる記録をその側から除き、反対側からも同じ額だけ差し引きます。収支は変わらず、収入と支出の見え方だけが変わります。</p>
      <ul>
        <li>
          収入 → 支出: 割り勘の回収・返金・ポイントなど、支出の打ち消し。例: 4,000円を立て替えて1,500円を回収 → 外食は2,500円（除くだけだと4,000円のまま）
        </li>
        <li>
          支出 → 収入: 家賃など、生活費の範囲から外したいもの。例: 家賃を給与から差し引く → 支出は家賃以外の生活費、収入は家賃を払った後に使えるお金
        </li>
      </ul>
      <p className="muted">差し引く先は、全体の金額だけ正しければよいなら「指定しない」で構いません。</p>
    </>
  )
}
