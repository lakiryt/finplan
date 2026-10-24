---
name: inspect-data
description: 利用者の実際の家計簿CSV（csv/）を、画面を開かずに集計・確認する手順。生活費の数字を確かめたい、ルールを作る前に対象の取引を見たい、平均が不自然な月の原因を探したい、といったときに使う。
---

# 実データを確認する

本物のCSVは `csv/` にある（Gitの管理対象外）。中身は個人情報なので、確認結果を公開されるファイルに書き写さない。

## 使うコマンド

```sh
# 全体の集計（月別の生活費・住居費・収入、カテゴリー別の月平均、ルールごとの一致件数）
npm run inspect -- csv/<file>.csv --from 2023-10 --to 2026-09

# ルールを適用した後の、特定のカテゴリー・メモの取引一覧（ルールを作る前の確認）
npm run inspect -- csv/<file>.csv --category 家賃
npm run inspect -- csv/<file>.csv --memo ホテル --from 2025-01

# 書き出した設定ファイルで集計する（既定は src/config/local/default-config.json、無ければ src/config/default-config.json）
npm run inspect -- csv/<file>.csv --config path/to/finplan-config.json
```

`--category` は、元のカテゴリーと付け替え後のカテゴリーのどちらに一致しても表示する。

## 確認の進め方

1. 全体の集計で、生活費が突出している月を探す。
2. その月の大きな取引を探す（例: `grep "YYYY/MM/" csv/<file>.csv | sort -t, -k1,1n | head`）。
3. どう扱うか（除外・按分・付け替え）は利用者が決める。機能が足りなければ `add-analysis-feature` スキルに進む。
4. ルールを足したら、もう一度 `npm run inspect` で一致件数と数字の変化を確かめ、利用者に報告する。

## 注意

- Windows のコンソールでは Python の出力が文字化けすることがある。Node（`npm run inspect`）は問題ない。Python を使うときはファイルに書き出してから読む。
- 利用者固有の事情は `CLAUDE.local.md` にある。数字を解釈する前に読む。
- データの最初と最後の月は、途中から（途中まで）しか記録されていないことがある。
