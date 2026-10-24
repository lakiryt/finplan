/**
 * 実データを画面を開かずに確認するためのスクリプト。
 *   npm run inspect -- <csv> [--config <json>] [--from YYYY-MM] [--to YYYY-MM] [--category <名前>] [--memo <文字>]
 * --category / --memo を付けると、ルール適用後のその取引の一覧を出す（ルールを作る前の確認用）
 */
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { categorySummaries, filterByMonths, monthOf, monthlyRows } from '../src/domain/aggregate'
import { classify, isActive, matchesRule } from '../src/domain/classify'
import { defaultConfig, parseConfig } from '../src/domain/config'
import { parseCsv } from '../src/domain/importers'
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

const { transactions, errors } = parseCsv(readFileSync(file, 'utf8'))
const config = values.config ? parseConfig(JSON.parse(readFileSync(values.config, 'utf8'))) : defaultConfig
const classified = classify(transactions, config)
const months = [...new Set(transactions.map((t) => monthOf(t.date)))].sort()
const from = values.from ?? months[0]
const to = values.to ?? months[months.length - 1]
const inPeriod = filterByMonths(classified, from, to)
const fmt = (n: number) => Math.round(n).toLocaleString('ja-JP')

if (values.category || values.memo) {
  const hits = inPeriod.filter(
    (t) => (!values.category || t.category === values.category || t.originalCategory === values.category) && (!values.memo || t.memo.includes(values.memo)),
  )
  console.log(`# 一致 ${hits.length}件（${from}〜${to}）`)
  for (const t of hits) console.log([t.date, fmt(t.amount), t.originalCategory, '→', t.category, t.groupId ?? '未分類', t.memo].join('\t'))
  process.exit(0)
}

const rows = monthlyRows(inPeriod, from, to)
const living = seriesStats(rows.map((r) => r.living))

console.log(`# ${file}: ${transactions.length}件（読み込めなかった行 ${errors.length}） 期間 ${from}〜${to}`)
console.log(`未分類: ${classified.filter((t) => !t.groupId).length}件`)
console.log(`生活費 平均 ${fmt(living.mean)} / 中央値 ${fmt(living.median)} / 直近3・6・12か月 ${[3, 6, 12].map((n) => fmt(living.recent[n])).join(' / ')}`)

console.log('\n## 月別（生活費 / 住居費 / 収入）')
for (const r of rows) console.log([r.month, fmt(r.living), fmt(r.housing), fmt(r.income)].join('\t'))

console.log('\n## 生活費のカテゴリー別 月平均')
for (const s of categorySummaries(inPeriod.filter((t) => t.role === 'living'), rows.length)) {
  console.log([s.category, s.groupId, fmt(s.monthlyMean), `${s.count}件`].join('\t'))
}

console.log('\n## ルールの一致件数（全期間）')
for (const r of config.rules) {
  const n = isActive(r) ? transactions.filter((t) => matchesRule(r.match, t)).length : 0
  console.log([r.enabled ? 'on ' : 'off', `${n}件`, r.id, r.label].join('\t'))
}
