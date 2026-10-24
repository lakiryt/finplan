# finplan

家計簿アプリから書き出したCSVを読み込み、家賃を除いた生活費の実績（平均・中央値・直近の平均）を集計し、引っ越し後の家賃やアルバイトの時給の目安を逆算するツールです。

CSVはブラウザの中だけで処理され、どこにも送信されません。

## 使い方

```sh
npm install
npm run dev     # 開発サーバー
npm test        # テスト
npm run build   # 公開用ビルド（dist/）
```

`sample/sample.csv` は動作確認用の架空データです。本物のCSVは `csv/` に置きます（Gitの管理対象外）。

## 構成

処理を段階ごとに分け、それぞれを差し替えられるようにしています。

```
CSV → importers → Transaction[] → classify → ClassifiedTransaction[] → aggregate / stats → 画面
                                     ↑
                              ClassifyConfig（画面で編集、JSONで書き出し・読み込み）
```

| ファイル | 役割 |
|---|---|
| `src/domain/types.ts` | 共通の型。グループの役割（`living` / `housing` / `income` / `ignore`）だけを集計側が見る |
| `src/domain/importers.ts` | CSV形式ごとの列の対応。新しい家計簿アプリには `importProfiles` を追加して対応 |
| `src/domain/classify.ts` | メモルール → カテゴリーの割り当て の順で分類 |
| `src/domain/aggregate.ts` | 月ごと・カテゴリーごとの集計。取引の無い月も 0 として数える |
| `src/domain/stats.ts` | 平均・中央値・直近 n か月の平均 |
| `src/domain/wage.ts` | 必要な手取り → 額面 → 時給 の逆算（簡易版） |
| `src/domain/defaultConfig.ts` | 初期の分類設定 |
| `src/state/storage.ts` | localStorage への保存（失敗しても動く） |
| `src/components/` | 画面部品 |

支出系のグループでは「使った額」をプラスで集計するため、返金・割り勘の回収を同じグループに入れると自動で差し引かれます。
