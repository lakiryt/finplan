---
name: inspect-data
description: 利用者の実際の家計簿CSV（csv/）を、画面を開かずに集計・確認する手順。生活費の数字を確かめたい、加工の条件を作る前に対象の記録を見たい、平均が不自然な月の原因を探したい、といったときに使う。
---

# 実データを確認する

本物のCSVは `csv/` にある（Gitの管理対象外）。中身は個人情報なので、確認結果を公開されるファイルに書き写さない。

## 使うコマンド

```sh
# 全体の集計（3. の加工を当てはめた支出・収入・累積収支、月別、支出のカテゴリー別の月平均、条件ごとの当たる件数と金額）
npm run inspect -- csv/<file>.csv --from 2023-10 --to 2026-09

# 特定のカテゴリー・メモの記録と、それぞれに加工で何が起きるか（残す・除外・相殺 → どこへ）の一覧（条件を作る前の確認）
npm run inspect -- csv/<file>.csv --category 家賃
npm run inspect -- csv/<file>.csv --memo ホテル --from 2025-01

# 別の加工の設定ファイルで集計する（既定は src/config/local/default-processing.json、無ければ一般的な初期設定）
npm run inspect -- csv/<file>.csv --config path/to/processing.json
```

## 確認の進め方

1. 全体の集計で、支出が突出している月を探す。
2. その月の大きな記録を探す（例: `grep "YYYY/MM/" csv/<file>.csv | sort -t, -k1,1n | head`）。
3. どう扱うか（除外・相殺・按分など）は利用者が決める。工程や条件の項目が足りなければ `add-analysis-feature` スキルに進む。
4. 条件を足したら、もう一度 `npm run inspect` で当たる件数と数字の変化を確かめ、利用者に報告する。

## 注意

- Windows のコンソールでは Python の出力が文字化けすることがある。Node（`npm run inspect`）は問題ない。Python を使うときはファイルに書き出してから読む。
- 利用者固有の事情は `CLAUDE.local.md` にある。数字を解釈する前に読む。
- データの最初と最後の月は、途中から（途中まで）しか記録されていないことがある。
