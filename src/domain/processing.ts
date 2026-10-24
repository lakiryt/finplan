import defaultProcessingJson from '../config/default-processing.json'
import { txSide, type Side } from './raw'
import type { Transaction } from './types'

/*
 * 加工の設定。3. の工程（除外・相殺）ごとに条件を並べ、有効なものを 2. の集計の前に当てはめる。
 * 考え方は docs/real-income-expense.md と docs/offset-and-living-cost.md を参照。
 */

/**
 * 記録を選ぶ条件。指定した項目すべてに当てはまる記録が対象（未指定の項目は問わない）。
 * side は必須で、カテゴリー・メモ・期間のどれか1つ以上がないと、全件に当たってしまうので無効扱い
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
}

/** 除外: 条件に当たる記録を、その側から除く */
export interface ExcludeRule {
  id: string
  enabled: boolean
  when: Condition
}

/**
 * 相殺: 条件に当たる記録をその側から除き、反対側からも同じ額を差し引く（収支は変わらない）。
 * target は差し引く反対側のカテゴリー。空なら、どのカテゴリーにも付けずに全体から差し引く（UNASSIGNED_OFFSET）
 */
export interface OffsetRule {
  id: string
  enabled: boolean
  when: Condition
  target: string
}

export interface Step<R> {
  enabled: boolean
  rules: R[]
}

export interface ProcessingConfig {
  version: 2
  exclude: Step<ExcludeRule>
  offset: Step<OffsetRule>
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
  return cond
}

function parseStep<R>(raw: unknown, parseRule: (r: Record<string, unknown>) => R): Step<R> {
  const s = raw as { enabled?: unknown; rules?: unknown } | null
  if (!s || !Array.isArray(s.rules)) throw new Error('工程の形式が正しくありません')
  return { enabled: Boolean(s.enabled), rules: (s.rules as Record<string, unknown>[]).map(parseRule) }
}

export function parseProcessingConfig(raw: unknown): ProcessingConfig {
  const c = raw as Record<string, unknown> | null
  if (!c || c.version !== 2) throw new Error('加工の設定の形式が正しくありません')
  return {
    version: 2,
    exclude: parseStep(c.exclude, (r) => ({ id: String(r.id), enabled: Boolean(r.enabled), when: parseCondition(r.when) })),
    offset: parseStep(c.offset, (r) => ({
      id: String(r.id),
      enabled: Boolean(r.enabled),
      when: parseCondition(r.when),
      target: typeof r.target === 'string' ? r.target : '',
    })),
  }
}

/** 初期設定。中身は src/config/default-processing.json で編集する */
export const defaultProcessing: ProcessingConfig = parseProcessingConfig(defaultProcessingJson)

// ---- 当てはめ ----

/** カテゴリー・メモ・期間のどれか1つ以上を指定しているか（無ければ全件に当たるので無効扱い） */
export const hasCriteria = (c: Condition) => c.category !== undefined || Boolean(c.memo || c.from || c.to)

export function matches(c: Condition, tx: Transaction): boolean {
  if (!hasCriteria(c) || txSide(tx) !== c.side) return false
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

const activeRules = <R extends { enabled: boolean; when: Condition }>(step: Step<R>) =>
  step.enabled ? step.rules.filter((r) => r.enabled && hasCriteria(r.when)) : []

/** 記録に何が起きるか。相殺は除外より優先（相殺は「除外＋反対側からも差し引く」なので） */
export type Outcome = { kind: 'keep' } | { kind: 'exclude'; rule: ExcludeRule } | { kind: 'offset'; rule: OffsetRule; moved: Transaction | null }

export function outcomeOf(tx: Transaction, config: ProcessingConfig): Outcome {
  const side = txSide(tx)
  if (!side) return { kind: 'keep' }
  const offset = activeRules(config.offset).find((r) => matches(r.when, tx))
  if (offset) {
    // 反対側の差し引きとして数え直す（side を反対側にし、金額の符号はそのまま）。
    // 収入側の記録（プラス）を支出側にすると支出が減り、支出側の記録（マイナス）を収入側にすると収入が減る
    const moved: Transaction = { ...tx, category: offset.target || UNASSIGNED_OFFSET, side: opposite(side) }
    // 差し引いた先が除外の条件に当たるなら、一緒に除く
    const dropped = activeRules(config.exclude).some((r) => matches(r.when, moved))
    return { kind: 'offset', rule: offset, moved: dropped ? null : moved }
  }
  const exclude = activeRules(config.exclude).find((r) => matches(r.when, tx))
  return exclude ? { kind: 'exclude', rule: exclude } : { kind: 'keep' }
}

/** 有効な条件を当てはめた取引を返す */
export function applyProcessing(txs: Transaction[], config: ProcessingConfig): Transaction[] {
  if (!activeRules(config.exclude).length && !activeRules(config.offset).length) return txs
  return txs.flatMap((t) => {
    const o = outcomeOf(t, config)
    return o.kind === 'keep' ? [t] : o.kind === 'offset' && o.moved ? [o.moved] : []
  })
}

/** 工程に有効な条件があるか */
export const isStepActive = (step: Step<{ enabled: boolean; when: Condition }>) => activeRules(step).length > 0

/** 2. の収入側・支出側に、何かしらの加工がかかっているか（見出しを「加工後」にするため）。相殺は両側に効く */
export function isProcessed(config: ProcessingConfig, side: Side): boolean {
  return activeRules(config.exclude).some((r) => r.when.side === side) || activeRules(config.offset).length > 0
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
