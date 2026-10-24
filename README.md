# finplan

家計簿アプリから書き出したCSVを読み込み、家賃を除いた生活費の実績（平均・中央値・直近の平均）を集計し、家賃に回せる額の目安を出すツールです。

CSVはブラウザの中だけで処理され、どこにも送信されません。

## 使い方

```sh
npm install
npm run dev     # 開発サーバー
npm test        # テスト
npm run build   # 公開用ビルド（dist/）
npm run inspect -- <csv>   # 画面を開かずに集計を確認
```

`sample/sample.csv` は動作確認用の架空データです。本物のCSVは `csv/` に置きます（Gitの管理対象外）。

## 加工の考え方

カテゴリーはコードに書かず、条件で指定します。「3. 加工」の工程ごとに、条件（収入側か支出側か・カテゴリー・メモ・期間）を足していきます。

- **除外**: 条件に当たる記録を除きます（積立や貯金の引き出しなど、置き場所を移しただけのお金）。
- **相殺**: 条件に当たる記録を除き、反対側からも同じ額を差し引きます（割り勘の回収を支出から、家賃を収入から、など）。収支は変わりません。

一般的な初期設定は `src/config/default-processing.json` と `default-view.json` にあります。自分用の初期設定は、同じ名前のファイルを `src/config/local/` に置くと開発サーバーで使われます（Gitの管理対象外で、公開用のビルドにも入りません）。

実収入・実支出の考え方は [docs/real-income-expense.md](docs/real-income-expense.md)、相殺と生活費の定義の考え方は [docs/offset-and-living-cost.md](docs/offset-and-living-cost.md) にまとめています。

構成や開発の方針は [CLAUDE.md](CLAUDE.md) を参照してください。
