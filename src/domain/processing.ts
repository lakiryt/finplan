import defaultProcessingJson from '../config/default-processing.json'
import { txSide } from './raw'
import type { Transaction } from './types'

/*
 * 加工の設定。3. に並べるカード（加工の部品）の一覧で、有効なカードを 2. の集計の前に当てはめる。
 * 新しい加工は ProcessingModule に種類を足し、applyProcessing で実装する。
 */

/**
 * 指定したカテゴリーの取引を除く。
 * - excludeIncome: 収入（プラスの取引）だけから除く。「実収入」を出すため
 * - excludeExpense: 支出（マイナスの取引）だけから除く。「実支出」を出すため
 */
export interface ExcludeModule {
  id: string
  type: 'excludeIncome' | 'excludeExpense'
  enabled: boolean
  categories: string[]
}

/** 収入側のカテゴリー from の記録を、支出側のカテゴリー to から差し引く。to が空なら、まだ反映しない */
export interface OffsetPair {
  from: string
  to: string
}

/**
 * 相殺。割り勘の回収・立替の戻り・ポイントでの支払いなど、支出を打ち消すお金を、
 * 収入ではなく支出の値引き（支出側のマイナス）として数え直す
 */
export interface OffsetModule {
  id: string
  type: 'offset'
  enabled: boolean
  pairs: OffsetPair[]
}

export type ProcessingModule = ExcludeModule | OffsetModule
export type ModulePatch = Partial<Omit<ExcludeModule, 'id' | 'type'>> | Partial<Omit<OffsetModule, 'id' | 'type'>>

export interface ProcessingConfig {
  version: 1
  modules: ProcessingModule[]
}

function parseModule(raw: unknown): ProcessingModule {
  const m = raw as Partial<ExcludeModule> & Partial<OffsetModule> & { type?: string }
  if (!m || typeof m !== 'object' || !m.id) throw new Error('modules の形式が正しくありません')
  if ((m.type === 'excludeIncome' || m.type === 'excludeExpense') && Array.isArray(m.categories)) {
    return { id: m.id, type: m.type, enabled: Boolean(m.enabled), categories: m.categories }
  }
  if (m.type === 'offset' && Array.isArray(m.pairs) && m.pairs.every((p) => p && typeof p.from === 'string')) {
    return { id: m.id, type: 'offset', enabled: Boolean(m.enabled), pairs: m.pairs.map((p) => ({ from: p.from, to: p.to ?? '' })) }
  }
  throw new Error(`未対応のカードです: ${String(m.type)}`)
}

/** 初期設定のカード（src/config/default-processing.json）。保存された設定に無い種類は、これで補う */
const DEFAULT_MODULES = (defaultProcessingJson.modules as unknown[]).map(parseModule)

export function parseProcessingConfig(raw: unknown): ProcessingConfig {
  const c = raw as Partial<ProcessingConfig> | null
  if (!c || typeof c !== 'object' || c.version !== 1 || !Array.isArray(c.modules)) throw new Error('加工の設定の形式が正しくありません')
  const modules = c.modules.map(parseModule)
  // 後から増えたカード（相殺など）が、前に保存した設定にも出るようにする
  for (const d of DEFAULT_MODULES) if (!modules.some((m) => m.type === d.type)) modules.push(d)
  return { version: 1, modules }
}

/** 初期設定。中身は src/config/default-processing.json で編集する */
export const defaultProcessing: ProcessingConfig = parseProcessingConfig(defaultProcessingJson)

/** 有効なカードが除くカテゴリー（収入側・支出側） */
export function excludedCategories(config: ProcessingConfig): { income: Set<string>; expense: Set<string> } {
  const income = new Set<string>()
  const expense = new Set<string>()
  for (const m of config.modules) {
    if (!m.enabled || m.type === 'offset') continue
    for (const c of m.categories) (m.type === 'excludeIncome' ? income : expense).add(c)
  }
  return { income, expense }
}

/** 有効な相殺（収入側のカテゴリー → 差し引く支出側のカテゴリー）。差し引く先を選んでいないものは含めない */
export function offsetTargets(config: ProcessingConfig): Map<string, string> {
  const map = new Map<string, string>()
  for (const m of config.modules) {
    if (m.enabled && m.type === 'offset') for (const p of m.pairs) if (p.to) map.set(p.from, p.to)
  }
  return map
}

/**
 * 有効なカードを当てはめた取引を返す。
 * 相殺を先に当てはめるので、同じカテゴリーを実収入のカードで除いていても、相殺が優先される
 */
export function applyProcessing(txs: Transaction[], config: ProcessingConfig): Transaction[] {
  const { income, expense } = excludedCategories(config)
  const offsets = offsetTargets(config)
  if (!income.size && !expense.size && !offsets.size) return txs
  return txs.flatMap((t): Transaction[] => {
    const side = txSide(t)
    const target = side === 'income' ? offsets.get(t.category) : undefined
    if (target) return [{ ...t, category: target, side: 'expense' }]
    if (side && (side === 'expense' ? expense : income).has(t.category)) return []
    return [t]
  })
}

/** カードの一部を変える */
export function updateModule(config: ProcessingConfig, id: string, patch: ModulePatch): ProcessingConfig {
  return { ...config, modules: config.modules.map((m) => (m.id === id ? ({ ...m, ...patch } as ProcessingModule) : m)) }
}

/** その種類の有効なカード（実際に何かを当てはめるもの）があるか */
export function hasActiveModule(config: ProcessingConfig, type: ProcessingModule['type']): boolean {
  return config.modules.some(
    (m) => m.type === type && m.enabled && (m.type === 'offset' ? m.pairs.some((p) => p.to) : m.categories.length > 0),
  )
}
