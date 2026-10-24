import defaultProcessingJson from '../config/default-processing.json'
import { sideOf } from './raw'
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

export type ProcessingModule = ExcludeModule

export interface ProcessingConfig {
  version: 1
  modules: ProcessingModule[]
}

const moduleTypes: ProcessingModule['type'][] = ['excludeIncome', 'excludeExpense']

export function parseProcessingConfig(raw: unknown): ProcessingConfig {
  const c = raw as Partial<ProcessingConfig> | null
  if (!c || typeof c !== 'object' || c.version !== 1) throw new Error('加工の設定の形式が正しくありません')
  if (!Array.isArray(c.modules) || !c.modules.every((m) => m && m.id && moduleTypes.includes(m.type) && Array.isArray(m.categories))) {
    throw new Error('modules の形式が正しくありません')
  }
  return { version: 1, modules: c.modules.map((m) => ({ ...m, enabled: Boolean(m.enabled) })) }
}

/** 初期設定。中身は src/config/default-processing.json で編集する */
export const defaultProcessing: ProcessingConfig = parseProcessingConfig(defaultProcessingJson)

/** 有効なカードが除くカテゴリー（収入側・支出側） */
export function excludedCategories(config: ProcessingConfig): { income: Set<string>; expense: Set<string> } {
  const income = new Set<string>()
  const expense = new Set<string>()
  for (const m of config.modules) {
    if (!m.enabled) continue
    for (const c of m.categories) (m.type === 'excludeIncome' ? income : expense).add(c)
  }
  return { income, expense }
}

/** 有効なカードを当てはめた取引を返す */
export function applyProcessing(txs: Transaction[], config: ProcessingConfig): Transaction[] {
  const { income, expense } = excludedCategories(config)
  if (!income.size && !expense.size) return txs
  return txs.filter((t) => {
    const side = sideOf(t.amount)
    return !side || !(side === 'expense' ? expense : income).has(t.category)
  })
}

/** モジュールの一部を変える */
export function updateModule(config: ProcessingConfig, id: string, patch: Partial<Omit<ProcessingModule, 'id' | 'type'>>): ProcessingConfig {
  return { ...config, modules: config.modules.map((m) => (m.id === id ? { ...m, ...patch } : m)) }
}

/** その種類の有効なカード（除くカテゴリーが1つ以上）があるか */
export function hasActiveModule(config: ProcessingConfig, type: ProcessingModule['type']): boolean {
  return config.modules.some((m) => m.type === type && m.enabled && m.categories.length > 0)
}
