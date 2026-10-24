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

/** 実収入・実支出の考え方。example はカードごとの具体例 */
export function RealIncomeExpenseInfo({ example }: { example: string }) {
  return (
    <>
      <p>
        家計簿の出入りから、管理しているお金と外（貯蓄用の口座、証券口座など）との間の移動を除いたものが、実収入・実支出です。実収入 − 実支出 は、総務省の家計調査でいう「黒字」です。
      </p>
      <p>
        迷ったら: 自分のお金の置き場所が変わっただけ（積立、引き出し、株の売却代金）なら除き、新しく受け取った・生まれたお金（給与、利息、配当）なら残します。
      </p>
      <p>{example}</p>
      <p className="muted">株の売却による損得や、投資の値動きは含まれません。</p>
      {SOURCES}
    </>
  )
}

/** 相殺の考え方 */
export function OffsetInfo() {
  return (
    <>
      <p>
        割り勘の回収、立替の戻り、ポイントでの支払いなどは、収入ではなく支出を打ち消すお金です。収入から除くだけだと立て替えた支出が残るので、選んだ支出から差し引きます。
      </p>
      <p>例: 飲み会で4,000円を立て替え、あとで1,500円を回収した → 外食の支出は2,500円になります。</p>
      <p className="muted">収支（実収入 − 実支出）は変わりませんが、実支出（生活費）が実態に近くなります。同じカテゴリーを実収入のカードで除いていても、相殺が優先されます。</p>
    </>
  )
}
