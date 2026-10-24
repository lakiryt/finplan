/**
 * 実収入・実支出の考え方（カードの ⓘ で開く説明）。要点だけを短く書き、詳しい説明は docs/real-income-expense.md に置く。
 * 公開を前提に、特定の人のカテゴリー名ではなく一般的な例で書く
 */
export function RealIncomeExpenseInfo() {
  return (
    <>
      <p>
        家計簿の出入りから、管理しているお金と外（貯蓄用の口座、証券口座など）との間の移動を除いたものが、実収入・実支出です。実収入 − 実支出 は、総務省の家計調査でいう「黒字」です。
      </p>
      <p>
        迷ったら: 自分のお金の置き場所が変わっただけ（積立、引き出し、株の売却代金）なら除き、新しく受け取った・生まれたお金（給与、利息、配当）なら残します。
      </p>
      <p className="muted">株の売却による損得や、投資の値動きは含まれません。</p>
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
    </>
  )
}
