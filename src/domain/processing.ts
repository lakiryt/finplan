import defaultProcessingJson from '../config/default-processing.json'
import { txSide } from './raw'
import type { Transaction } from './types'

/*
 * 加工の設定。3. に並べるカード（加工の部品）の一覧で、有効なカードを 2. の集計の前に当てはめる。
 * 新しい加工は ProcessingModule に種類を足し、applyProcessing で実装する。
 */

/**
 * 指定したカテゴリーの取引を除く。実収入と実支出は同じ形のカードにする。
 * - excludeIncome: 収入（プラスの取引）だけから除く。「実収入」を出すため
 * - excludeExpense: 支出（マイナスの取引）だけから除く。「実支出」を出すため
 */
export interface ExcludeModule {
  id: string
  type: 'excludeIncome' | 'excludeExpense'
  enabled: boolean
  categories: string[]
}

/**
 * 収入側のカテゴリー from の記録を、支出側のカテゴリー to から差し引く。
 * enabled が false なら差し引かない（除くだけ）。to は覚えておき、もう一度有効にしたときに使う
 */
export interface OffsetPair {
  from: string
  enabled: boolean
  to: string
}

/**
 * 相殺。実収入のカードで除いたカテゴリーのうち、支出の打ち消しにあたるもの（割り勘の回収・返金・ポイントなど）を、
 * 支出の値引き（支出側のマイナス）として数え直す。「除く」に「支出からも差し引く」を足したもの
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

type RawModule = { id?: string; type?: string; enabled?: boolean; categories?: unknown; pairs?: unknown }

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((c): c is string => typeof c === 'string') : [])

function parseModule(m: RawModule): ProcessingModule {
  if (!m || typeof m !== 'object' || !m.id) throw new Error('modules の形式が正しくありません')
  if ((m.type === 'excludeIncome' || m.type === 'excludeExpense') && Array.isArray(m.categories)) {
    return { id: m.id, type: m.type, enabled: Boolean(m.enabled), categories: strings(m.categories) }
  }
  if (m.type === 'offset' && Array.isArray(m.pairs)) {
    const pairs = (m.pairs as { from?: unknown; enabled?: unknown; to?: unknown }[])
      .filter((p) => typeof p?.from === 'string')
      .map((p) => ({ from: p.from as string, enabled: Boolean(p.enabled), to: typeof p.to === 'string' ? p.to : '' }))
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

/**
 * 有効な相殺（収入側のカテゴリー → 差し引く支出側のカテゴリー）。
 * 実収入のカードで除いているカテゴリーで、差し引く先を選んだものだけ
 */
export function offsetTargets(config: ProcessingConfig): Map<string, string> {
  const { income } = excludedCategories(config)
  const map = new Map<string, string>()
  for (const m of config.modules) {
    if (m.enabled && m.type === 'offset') for (const p of m.pairs) if (p.enabled && p.to && income.has(p.from)) map.set(p.from, p.to)
  }
  return map
}

/**
 * 有効なカードを当てはめた取引を返す。
 * - 収入側: 実収入のカードで除くものは除く。そのうち相殺するものは、差し引く先の支出の値引き（支出側・プラスの金額）にする
 * - 支出側: 実支出のカードで除くものは除く。相殺の差し引く先が除いている支出なら、相殺した分も一緒に除く
 */
export function applyProcessing(txs: Transaction[], config: ProcessingConfig): Transaction[] {
  const { income, expense } = excludedCategories(config)
  const offsets = offsetTargets(config)
  if (!income.size && !expense.size) return txs
  return txs.flatMap((t): Transaction[] => {
    const side = txSide(t)
    if (side === 'income') {
      if (!income.has(t.category)) return [t]
      const target = offsets.get(t.category)
      return target && !expense.has(target) ? [{ ...t, category: target, side: 'expense' }] : []
    }
    return side === 'expense' && expense.has(t.category) ? [] : [t]
  })
}

/** カードの一部を変える */
export function updateModule(config: ProcessingConfig, id: string, patch: ModulePatch): ProcessingConfig {
  return { ...config, modules: config.modules.map((m) => (m.id === id ? ({ ...m, ...patch } as ProcessingModule) : m)) }
}

/** その種類の有効なカード（実際に何かを当てはめるもの）があるか */
export function hasActiveModule(config: ProcessingConfig, type: ProcessingModule['type']): boolean {
  if (type === 'offset') return offsetTargets(config).size > 0
  return config.modules.some((m) => m.type === type && m.enabled && m.categories.length > 0)
}
