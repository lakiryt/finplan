/**
 * 実データを画面を開かずに確認するためのスクリプト。3. の加工（除外・相殺）を当てはめて集計する。
 *   npm run inspect -- <csv> [--config <json>] [--from YYYY-MM] [--to YYYY-MM] [--category <名前>] [--memo <文字>]
 * --config を省くと src/config/local/default-processing.json（無ければ一般的な初期設定）を使う。
 * --category / --memo を付けると、当てはまる記録と、それぞれに加工で何が起きるかの一覧を出す（条件を作る前の確認用）
 */
import { existsSync, readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { filterByMonths, monthOf } from '../src/domain/aggregate'
import { parseCsv } from '../src/domain/importers'
import { applyProcessing, defaultProcessing, hasCriteria, matches, outcomeOf, parseProcessingConfig } from '../src/domain/processing'
import { rawCategoryStats, rawMonthlyRows } from '../src/domain/raw'
import { seriesStats } from '../src/domain/stats'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    config: { type: 'string' },
    from: { type: 'string' },
    to: { type: 'string' },
    category: { type: 'string' },
    memo: { type: 'string' },
  },
})

const file = positionals[0]
if (!file) {
  console.error('使い方: npm run inspect -- <csv> [--config <json>] [--from YYYY-MM] [--to YYYY-MM] [--category 名前] [--memo 文字]')
  process.exit(1)
}

const LOCAL_CONFIG = 'src/config/local/default-processing.json'
const configPath = values.config ?? (existsSync(LOCAL_CONFIG) ? LOCAL_CONFIG : undefined)
const config = configPath ? parseProcessingConfig(JSON.parse(readFileSync(configPath, 'utf8'))) : defaultProcessing

const { transactions, errors } = parseCsv(readFileSync(file, 'utf8'))
const months = [...new Set(transactions.map((t) => monthOf(t.date)))].sort()
const from = values.from ?? months[0]
const to = values.to ?? months[months.length - 1]
const inPeriod = filterByMonths(transactions, from, to)
const fmt = (n: number) => Math.round(n).toLocaleString('ja-JP')

if (values.category || values.memo) {
  const hits = inPeriod.filter((t) => (!values.category || t.category === values.category) && (!values.memo || t.memo.includes(values.memo)))
  console.log(`# 一致 ${hits.length}件（${from}〜${to}）`)
  for (const t of hits) {
    const o = outcomeOf(t, config)
    const what = o.kind === 'keep' ? '残す' : o.kind === 'exclude' ? '除外' : o.moved ? `相殺 → ${o.moved.side === 'income' ? '収入' : '支出'}「${o.moved.category}」` : '相殺（差し引く先が除外中なので除く）'
    console.log([t.date, fmt(t.amount), t.category, what, t.memo].join('\t'))
  }
  process.exit(0)
}

const processed = applyProcessing(inPeriod, config)
const rows = rawMonthlyRows(processed, from, to)
const expense = seriesStats(rows.map((r) => r.expense))
const income = seriesStats(rows.map((r) => r.income))

console.log(`# ${file}: ${transactions.length}件（読み込めなかった行 ${errors.length}） 期間 ${from}〜${to} 設定 ${configPath ?? '一般的な初期設定'}`)
console.log(`支出 平均 ${fmt(expense.mean)} / 中央値 ${fmt(expense.median)} / 直近3・6・12か月 ${[3, 6, 12].map((n) => fmt(expense.recent[n])).join(' / ')}`)
console.log(`収入 平均 ${fmt(income.mean)} / 中央値 ${fmt(income.median)}`)
console.log(`累積収支 ${fmt(rows.reduce((s, r) => s + r.income - r.expense, 0))}`)

console.log('\n## 月別（支出 / 収入 / 収支）')
for (const r of rows) console.log([r.month, fmt(r.expense), fmt(r.income), fmt(r.income - r.expense)].join('\t'))

console.log('\n## 支出のカテゴリー別 月平均')
for (const s of rawCategoryStats(processed, rows, 'expense')) console.log([s.category, fmt(s.monthlyMean), `${s.count}件`].join('\t'))

console.log('\n## 条件ごとの当たる件数（期間内）')
for (const [step, rules] of [
  ['除外', config.exclude.rules],
  ['相殺', config.offset.rules],
] as const) {
  for (const r of rules) {
    const hit = hasCriteria(r.when) ? inPeriod.filter((t) => matches(r.when, t)) : []
    const total = hit.reduce((s, t) => s + Math.abs(t.amount), 0)
    console.log([step, r.enabled ? 'on ' : 'off', `${hit.length}件`, fmt(total), JSON.stringify(r.when), 'target' in r ? `→ ${r.target || '指定なし'}` : ''].join('\t'))
  }
}
