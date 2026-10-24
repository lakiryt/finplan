import defaultProcessingJson from '../config/default-processing.json'
import { txSide, type Side } from './raw'
import type { Transaction } from './types'

/*
 * 加工の設定。3. に並べるカード（加工の部品）の一覧で、有効なカードを 2. の集計の前に当てはめる。
 * 新しい加工は ProcessingModule に種類を足し、applyProcessing で実装する。
 * 考え方は docs/real-income-expense.md と docs/offset-and-living-cost.md を参照。
 */

/**
 * 指定したカテゴリーの取引を除く。収入側と支出側は同じ形のカードにする。
 * - excludeIncome: 収入（プラスの取引）だけから除く
 * - excludeExpense: 支出（マイナスの取引）だけから除く
 * 管理の外との移動だけを除いた場合が、家計調査でいう実収入・実支出にあたる
 */
export interface ExcludeModule {
  id: string
  type: 'excludeIncome' | 'excludeExpense'
  enabled: boolean
  categories: string[]
}

/**
 * 除いたカテゴリーの記録を、反対側からも差し引く。
 * - side: from がどちら側で除いたカテゴリーか（収入側なら支出から、支出側なら収入から差し引く）
 * - to: 差し引く反対側のカテゴリー。空なら、どのカテゴリーにも付けずに全体から差し引く（UNASSIGNED_OFFSET として数える）
 * - enabled: false なら差し引かない（除くだけ）。to は覚えておき、もう一度有効にしたときに使う
 */
export interface OffsetPair {
  side: Side
  from: string
  enabled: boolean
  to: string
}

/**
 * 相殺。除いたもののうち、反対側の打ち消しにあたるものを、反対側からも差し引く（収支は変わらない）。
 * - 収入 → 支出: 割り勘の回収・返金・ポイントなど、支出の値引きにあたるもの
 * - 支出 → 収入: 家賃など、生活費の範囲から外したいもの（それらを払った後に使える収入になる）
 */
export interface OffsetModule {
  id: string
  type: 'offset'
  enabled: boolean
  pairs: OffsetPair[]
}

/** 差し引く先を指定しない相殺を数えるカテゴリー名（どのカテゴリーにも属さない差し引き） */
export const UNASSIGNED_OFFSET = '差し引き（指定なし）'

export type ProcessingModule = ExcludeModule | OffsetModule
export type ModulePatch = Partial<Omit<ExcludeModule, 'id' | 'type'>> | Partial<Omit<OffsetModule, 'id' | 'type'>>

export interface ProcessingConfig {
  version: 1
  modules: ProcessingModule[]
}

type RawModule = { id?: string; type?: string; enabled?: boolean; categories?: unknown; pairs?: unknown }

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((c): c is string => typeof c === 'string') : [])

function parseModule(m: RawModule): ProcessingModule {
  if (!m || typeof m !== 'object' || !m.id) throw new Error('modules の形式が正しくありません')
  if ((m.type === 'excludeIncome' || m.type === 'excludeExpense') && Array.isArray(m.categories)) {
    return { id: m.id, type: m.type, enabled: Boolean(m.enabled), categories: strings(m.categories) }
  }
  if (m.type === 'offset' && Array.isArray(m.pairs)) {
    const pairs = (m.pairs as { side?: unknown; from?: unknown; enabled?: unknown; to?: unknown }[])
      .filter((p) => typeof p?.from === 'string' && (p.side === 'income' || p.side === 'expense'))
      .map((p) => ({ side: p.side as Side, from: p.from as string, enabled: Boolean(p.enabled), to: typeof p.to === 'string' ? p.to : '' }))
    return { id: m.id, type: 'offset', enabled: Boolean(m.enabled), pairs }
  }
  throw new Error(`未対応のカードです: ${String(m.type)}`)
}

export function parseProcessingConfig(raw: unknown): ProcessingConfig {
  const c = raw as Partial<ProcessingConfig> | null
  if (!c || typeof c !== 'object' || c.version !== 1 || !Array.isArray(c.modules)) throw new Error('加工の設定の形式が正しくありません')
  return { version: 1, modules: (c.modules as RawModule[]).map(parseModule) }
}

/** 初期設定。中身は src/config/default-processing.json で編集する */
export const defaultProcessing: ProcessingConfig = parseProcessingConfig(defaultProcessingJson)

export const opposite = (side: Side): Side => (side === 'income' ? 'expense' : 'income')

/** 有効なカードが除くカテゴリー（収入側・支出側） */
export function excludedCategories(config: ProcessingConfig): Record<Side, Set<string>> {
  const result: Record<Side, Set<string>> = { income: new Set(), expense: new Set() }
  for (const m of config.modules) {
    if (!m.enabled || m.type === 'offset') continue
    for (const c of m.categories) result[m.type === 'excludeIncome' ? 'income' : 'expense'].add(c)
  }
  return result
}

/**
 * 有効な相殺（除いたカテゴリー → 差し引く反対側のカテゴリー）を、除いた側ごとに返す。
 * その側の「除く」カードで除いているカテゴリーで、チェックを入れたものだけ。差し引く先が空なら UNASSIGNED_OFFSET
 */
export function offsetTargets(config: ProcessingConfig): Record<Side, Map<string, string>> {
  const excluded = excludedCategories(config)
  const result: Record<Side, Map<string, string>> = { income: new Map(), expense: new Map() }
  for (const m of config.modules) {
    if (!m.enabled || m.type !== 'offset') continue
    for (const p of m.pairs) if (p.enabled && excluded[p.side].has(p.from)) result[p.side].set(p.from, p.to || UNASSIGNED_OFFSET)
  }
  return result
}

/**
 * 有効なカードを当てはめた取引を返す。
 * - 除くカードで除くものは除く
 * - そのうち相殺するものは、反対側のカテゴリーの差し引きとして数え直す（side を反対側にし、金額の符号はそのまま）。
 *   収入側の記録（プラス）を支出側にすると支出が減り、支出側の記録（マイナス）を収入側にすると収入が減る
 * - 差し引く先が反対側で除いているカテゴリーなら、相殺した分も一緒に除く
 */
export function applyProcessing(txs: Transaction[], config: ProcessingConfig): Transaction[] {
  const excluded = excludedCategories(config)
  const offsets = offsetTargets(config)
  if (!excluded.income.size && !excluded.expense.size) return txs
  return txs.flatMap((t): Transaction[] => {
    const side = txSide(t)
    if (!side || !excluded[side].has(t.category)) return [t]
    const target = offsets[side].get(t.category)
    const other = opposite(side)
    return target && !excluded[other].has(target) ? [{ ...t, category: target, side: other }] : []
  })
}

/** カードの一部を変える */
export function updateModule(config: ProcessingConfig, id: string, patch: ModulePatch): ProcessingConfig {
  return { ...config, modules: config.modules.map((m) => (m.id === id ? ({ ...m, ...patch } as ProcessingModule) : m)) }
}

/** その種類の有効なカード（実際に何かを当てはめるもの）があるか */
export function hasActiveModule(config: ProcessingConfig, type: ProcessingModule['type']): boolean {
  if (type === 'offset') {
    const o = offsetTargets(config)
    return o.income.size + o.expense.size > 0
  }
  return config.modules.some((m) => m.type === type && m.enabled && m.categories.length > 0)
}

/** 2. の収入側・支出側に、何かしらの加工がかかっているか（見出しを「加工後」にするため） */
export function isProcessed(config: ProcessingConfig, side: Side): boolean {
  return excludedCategories(config)[side].size > 0 || offsetTargets(config)[opposite(side)].size > 0
}
