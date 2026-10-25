import defaultProcessingJson from '../config/default-processing.json'
import { txSide, type Side } from './raw'
import type { Transaction } from './types'

/*
 * 加工の設定。条件を並べ、有効なものを 2. の集計の前に当てはめる。
 * 条件に当たる記録はその側から除き、反対側のカテゴリーを選べばそこからも同じ額を差し引く（相殺）。選ばなければ除くだけ（除外）。
 * 考え方は docs/real-income-expense.md と docs/offset-and-living-cost.md を参照。
 */

/**
 * 記録を選ぶ条件。指定した項目すべてに当てはまる記録が対象（未指定の項目は問わない）。
 * side は必須で、カテゴリー・メモ・期間・選んだ記録のどれか1つ以上がないと、全件に当たってしまうので無効扱い
 */
export interface Condition {
  /** 収入側（プラス）の記録か、支出側（マイナス）の記録か */
  side: Side
  category?: string
  memo?: string
  memoIsRegex?: boolean
  /** YYYY-MM-DD（この日を含む） */
  from?: string
  /** YYYY-MM-DD（この日を含む） */
  to?: string
  /** 一覧から選んだ記録（recordKey）。メモや期間では絞りきれない記録を、1件ずつ指定する */
  records?: string[]
}

/**
 * 相殺で差し引く反対側の先。category が null なら、どのカテゴリーにも付けずに反対側の全体から差し引く（UNASSIGNED_OFFSET）。
 * 空欄のカテゴリー（''）とは区別する
 */
export interface Target {
  category: string | null
}

/**
 * 加工の条件。条件に当たる記録を、その側から除く。
 * target があれば、反対側からも同じ額を差し引く（相殺。収支は変わらない）。null なら差し引かない（除外）
 */
export interface Rule {
  id: string
  enabled: boolean
  when: Condition
  target: Target | null
}

/** 相殺（反対側からも差し引く）か、除外（その側から除くだけ）か */
export type Kind = 'offset' | 'exclude'
export const KINDS: Kind[] = ['offset', 'exclude']
export const kindOf = (rule: { target: Target | null }): Kind => (rule.target === null ? 'exclude' : 'offset')

export interface ProcessingConfig {
  version: 3
  /** 並び順が優先順（ただし相殺は除外より優先） */
  rules: Rule[]
  /** 側 × 相殺・除外の区分ごとに、まとめて有効・無効を切り替える */
  enabled: Record<Side, Record<Kind, boolean>>
}

/** 差し引く先を指定しない相殺を数えるカテゴリー名（どのカテゴリーにも属さない差し引き） */
export const UNASSIGNED_OFFSET = '差し引き（指定なし）'

export const opposite = (side: Side): Side => (side === 'income' ? 'expense' : 'income')

// ---- 読み込み ----

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)

function parseCondition(raw: unknown): Condition {
  const c = raw as Record<string, unknown> | null
  if (!c || (c.side !== 'income' && c.side !== 'expense')) throw new Error('条件の形式が正しくありません')
  const cond: Condition = { side: c.side }
  // 空欄のカテゴリー（''）も1つのカテゴリーとして指定できる
  if (typeof c.category === 'string') cond.category = c.category
  if (str(c.memo)) cond.memo = c.memo as string
  if (c.memoIsRegex) cond.memoIsRegex = true
  if (str(c.from)) cond.from = c.from as string
  if (str(c.to)) cond.to = c.to as string
  if (Array.isArray(c.records) && c.records.length > 0) cond.records = c.records.filter((k): k is string => typeof k === 'string')
  return cond
}

function parseTarget(raw: unknown): Target | null {
  if (raw === null || raw === undefined) return null
  const t = raw as Record<string, unknown>
  if (typeof t !== 'object') throw new Error('差し引く先の形式が正しくありません')
  // 空欄のカテゴリー（''）にも差し引ける
  return { category: typeof t.category === 'string' ? t.category : null }
}

function parseRule(raw: unknown): Rule {
  const r = raw as Record<string, unknown> | null
  if (!r) throw new Error('条件の形式が正しくありません')
  return { id: String(r.id), enabled: Boolean(r.enabled), when: parseCondition(r.when), target: parseTarget(r.target) }
}

export function parseProcessingConfig(raw: unknown): ProcessingConfig {
  const c = raw as Record<string, unknown> | null
  if (!c || c.version !== 3 || !Array.isArray(c.rules)) throw new Error('加工の設定の形式が正しくありません')
  const enabled = (c.enabled ?? {}) as Partial<Record<Side, Partial<Record<Kind, unknown>>>>
  const sideEnabled = (side: Side) => ({ offset: enabled[side]?.offset !== false, exclude: enabled[side]?.exclude !== false })
  return { version: 3, rules: c.rules.map(parseRule), enabled: { income: sideEnabled('income'), expense: sideEnabled('expense') } }
}

/** 初期設定。中身は src/config/default-processing.json で編集する */
export const defaultProcessing: ProcessingConfig = parseProcessingConfig(defaultProcessingJson)

// ---- 当てはめ ----

/**
 * 記録を見分けるキー。CSVの行番号は書き出し直すとずれるので、記録の中身（日付・金額・カテゴリー・メモ）で見分ける。
 * 中身がすべて同じ記録は区別しない（扱いを分ける理由が無い）。家計簿アプリで記録を書き換えると、キーも変わる
 */
export const recordKey = (tx: Transaction) => JSON.stringify([tx.date, tx.amount, tx.category, tx.memo])

/** カテゴリー・メモ・期間・選んだ記録のどれか1つ以上を指定しているか（無ければ全件に当たるので無効扱い） */
export const hasCriteria = (c: Condition) => c.category !== undefined || Boolean(c.memo || c.from || c.to || c.records?.length)

export function matches(c: Condition, tx: Transaction): boolean {
  if (!hasCriteria(c) || txSide(tx) !== c.side) return false
  if (c.records?.length && !c.records.includes(recordKey(tx))) return false
  if (c.category !== undefined && tx.category !== c.category) return false
  if (c.from && tx.date < c.from) return false
  if (c.to && tx.date > c.to) return false
  if (c.memo) {
    if (!c.memoIsRegex) return tx.memo.includes(c.memo)
    try {
      return new RegExp(c.memo).test(tx.memo)
    } catch {
      return false
    }
  }
  return true
}

/** 当てはめる条件（条件そのものと、その区分が有効なもの）。kind を指定すると、その種類だけ */
export const activeRules = (config: ProcessingConfig, kind?: Kind) =>
  config.rules.filter((r) => r.enabled && hasCriteria(r.when) && config.enabled[r.when.side][kindOf(r)] && (!kind || kindOf(r) === kind))

/** 記録に何が起きるか。相殺は除外より優先（相殺は「除外＋反対側からも差し引く」なので）。target は差し引いた先のカテゴリー名 */
export type Outcome = { kind: 'keep' } | { kind: 'exclude'; rule: Rule } | { kind: 'offset'; rule: Rule; target: string; moved: Transaction | null }

export function outcomeOf(tx: Transaction, config: ProcessingConfig): Outcome {
  const side = txSide(tx)
  if (!side) return { kind: 'keep' }
  const offset = activeRules(config, 'offset').find((r) => matches(r.when, tx))
  if (offset) {
    const target = offset.target?.category ?? UNASSIGNED_OFFSET
    // 反対側の差し引きとして数え直す（side を反対側にし、金額の符号はそのまま）。
    // 収入側の記録（プラス）を支出側にすると支出が減り、支出側の記録（マイナス）を収入側にすると収入が減る
    const moved: Transaction = { ...tx, category: target, side: opposite(side) }
    // 差し引いた先が除外の条件に当たるなら、一緒に除く
    const dropped = activeRules(config, 'exclude').some((r) => matches(r.when, moved))
    return { kind: 'offset', rule: offset, target, moved: dropped ? null : moved }
  }
  const exclude = activeRules(config, 'exclude').find((r) => matches(r.when, tx))
  return exclude ? { kind: 'exclude', rule: exclude } : { kind: 'keep' }
}

/** 有効な条件を当てはめた取引を返す */
export function applyProcessing(txs: Transaction[], config: ProcessingConfig): Transaction[] {
  if (!activeRules(config).length) return txs
  return txs.flatMap((t) => {
    const o = outcomeOf(t, config)
    return o.kind === 'keep' ? [t] : o.kind === 'offset' && o.moved ? [o.moved] : []
  })
}

/**
 * その側で、カテゴリー全体を除外しているカテゴリー（カテゴリーだけを指定した除外の条件）。
 * ここへ差し引く相殺は、相殺した分も一緒に除かれ、その記録を除外するのと同じになるので、差し引く先に選べないようにする。
 * メモや期間で一部だけを除外しているカテゴリーは、差し引いた記録が残ることがあるので含めない
 */
export function whollyExcluded(config: ProcessingConfig, side: Side): Set<string> {
  const only = (c: Condition) => c.category !== undefined && !c.memo && !c.from && !c.to && !c.records?.length
  return new Set(activeRules(config, 'exclude').flatMap((r) => (r.when.side === side && only(r.when) ? [r.when.category!] : [])))
}

/** 2. の収入側・支出側に、何かしらの加工がかかっているか（見出しを「加工後」にするため）。相殺は両側に効く */
export function isProcessed(config: ProcessingConfig, side: Side): boolean {
  return activeRules(config).some((r) => r.when.side === side || kindOf(r) === 'offset')
}

/** 収入側・支出側のカテゴリーごとに、除外・相殺した金額（表の注記に使う。金額はプラス） */
export function processedAmounts(txs: Transaction[], config: ProcessingConfig): Record<Side, Map<string, { excluded: number; offset: number }>> {
  const result: Record<Side, Map<string, { excluded: number; offset: number }>> = { income: new Map(), expense: new Map() }
  for (const t of txs) {
    const side = txSide(t)
    if (!side) continue
    const o = outcomeOf(t, config)
    if (o.kind === 'keep') continue
    const entry = result[side].get(t.category) ?? { excluded: 0, offset: 0 }
    entry[o.kind === 'exclude' ? 'excluded' : 'offset'] += Math.abs(t.amount)
    result[side].set(t.category, entry)
  }
  return result
}
