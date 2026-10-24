import defaultProcessingJson from '../config/default-processing.json'
import { txSide } from './raw'
import type { Transaction } from './types'

/*
 * 加工の設定。3. に並べるカード（加工の部品）の一覧で、有効なカードを 2. の集計の前に当てはめる。
 * 新しい加工は ProcessingModule に種類を足し、applyProcessing で実装する。
 */

/**
 * 収入側のカテゴリーの扱い。書いていないカテゴリーは「残す」（稼いだ・受け取ったお金）。
 * - exclude: 除く。管理の外から戻ってきた自分のお金（貯金の引き出しなど）。支出には影響しない
 * - offset: 相殺。支出の打ち消し（割り勘の回収・返金・ポイントなど）。支出カテゴリー to の値引きとして数え直す。
 *   to が空なら、まだ反映しない
 */
export type IncomeRule = { category: string; action: 'exclude' } | { category: string; action: 'offset'; to: string }

/** 「実収入」のカード。収入側のカテゴリーごとに、残す・除く・相殺を選ぶ */
export interface IncomeModule {
  id: string
  type: 'income'
  enabled: boolean
  rules: IncomeRule[]
}

/** 「実支出」のカード。支出側の「移動」（積立など）のカテゴリーを除く */
export interface ExcludeExpenseModule {
  id: string
  type: 'excludeExpense'
  enabled: boolean
  categories: string[]
}

export type ProcessingModule = IncomeModule | ExcludeExpenseModule
export type ModulePatch = Partial<Omit<IncomeModule, 'id' | 'type'>> | Partial<Omit<ExcludeExpenseModule, 'id' | 'type'>>

export interface ProcessingConfig {
  version: 1
  modules: ProcessingModule[]
}

type RawModule = { id?: string; type?: string; enabled?: boolean; categories?: unknown; rules?: unknown; pairs?: unknown }

function parseRule(raw: unknown): IncomeRule {
  const r = raw as { category?: unknown; action?: unknown; to?: unknown } | null
  if (!r || typeof r.category !== 'string') throw new Error('rules の形式が正しくありません')
  if (r.action === 'exclude') return { category: r.category, action: 'exclude' }
  if (r.action === 'offset') return { category: r.category, action: 'offset', to: typeof r.to === 'string' ? r.to : '' }
  throw new Error(`未対応の扱いです: ${String(r.action)}`)
}

/**
 * 前の形式（「実収入」で除くカードと「相殺」のカードが別々）を、1枚の「実収入」のカードにまとめる。
 * 同じカテゴリーが両方にあれば相殺を優先する。有効だったカードの設定だけを引き継ぐ（どちらも無効なら両方）
 */
function mergeLegacyIncome(modules: RawModule[]): IncomeModule | null {
  const exclude = modules.find((m) => m.type === 'excludeIncome')
  const offset = modules.find((m) => m.type === 'offset')
  if (!exclude && !offset) return null
  const anyEnabled = Boolean(exclude?.enabled || offset?.enabled)
  const take = (m: RawModule | undefined) => Boolean(m) && (!anyEnabled || Boolean(m?.enabled))
  const rules = new Map<string, IncomeRule>()
  if (take(exclude) && Array.isArray(exclude?.categories)) {
    for (const c of exclude.categories) if (typeof c === 'string') rules.set(c, { category: c, action: 'exclude' })
  }
  if (take(offset) && Array.isArray(offset?.pairs)) {
    for (const p of offset.pairs as { from?: unknown; to?: unknown }[]) {
      if (typeof p?.from === 'string') rules.set(p.from, { category: p.from, action: 'offset', to: typeof p.to === 'string' ? p.to : '' })
    }
  }
  return { id: exclude?.id ?? 'real-income', type: 'income', enabled: anyEnabled, rules: [...rules.values()] }
}

function parseModule(m: RawModule): ProcessingModule {
  if (!m || typeof m !== 'object' || !m.id) throw new Error('modules の形式が正しくありません')
  if (m.type === 'income' && Array.isArray(m.rules)) {
    return { id: m.id, type: 'income', enabled: Boolean(m.enabled), rules: m.rules.map(parseRule) }
  }
  if (m.type === 'excludeExpense' && Array.isArray(m.categories)) {
    return { id: m.id, type: 'excludeExpense', enabled: Boolean(m.enabled), categories: m.categories.filter((c): c is string => typeof c === 'string') }
  }
  throw new Error(`未対応のカードです: ${String(m.type)}`)
}

function parseModules(raw: unknown[]): ProcessingModule[] {
  const list = raw as RawModule[]
  const legacy = mergeLegacyIncome(list)
  const modules = list.filter((m) => m?.type !== 'excludeIncome' && m?.type !== 'offset').map(parseModule)
  if (legacy && !modules.some((m) => m.type === 'income')) modules.unshift(legacy)
  return modules
}

/** 初期設定のカード（src/config/default-processing.json）。保存された設定に無い種類は、これで補う */
const DEFAULT_MODULES = parseModules(defaultProcessingJson.modules as unknown[])

export function parseProcessingConfig(raw: unknown): ProcessingConfig {
  const c = raw as Partial<ProcessingConfig> | null
  if (!c || typeof c !== 'object' || c.version !== 1 || !Array.isArray(c.modules)) throw new Error('加工の設定の形式が正しくありません')
  const modules = parseModules(c.modules)
  // 後から増えたカードが、前に保存した設定にも出るようにする
  for (const d of DEFAULT_MODULES) if (!modules.some((m) => m.type === d.type)) modules.push(d)
  return { version: 1, modules }
}

/** 初期設定。中身は src/config/default-processing.json で編集する */
export const defaultProcessing: ProcessingConfig = parseProcessingConfig(defaultProcessingJson)

/** 有効な「実収入」のカードの、カテゴリーごとの扱い（書いていないカテゴリーは残す） */
export function incomeRules(config: ProcessingConfig): Map<string, IncomeRule> {
  const map = new Map<string, IncomeRule>()
  for (const m of config.modules) if (m.enabled && m.type === 'income') for (const r of m.rules) map.set(r.category, r)
  return map
}

/** 有効な「実支出」のカードが除く支出側のカテゴリー */
export function excludedExpenses(config: ProcessingConfig): Set<string> {
  const set = new Set<string>()
  for (const m of config.modules) if (m.enabled && m.type === 'excludeExpense') for (const c of m.categories) set.add(c)
  return set
}

/**
 * 有効なカードを当てはめた取引を返す。
 * - 収入側: 除くものは除き、相殺するものは差し引く先の支出の値引き（支出側・プラスの金額）にする
 * - 支出側: 実支出のカードで除くものは除く。相殺の差し引く先が除いている支出なら、相殺した分も一緒に除く
 */
export function applyProcessing(txs: Transaction[], config: ProcessingConfig): Transaction[] {
  const rules = incomeRules(config)
  const expense = excludedExpenses(config)
  if (!rules.size && !expense.size) return txs
  return txs.flatMap((t): Transaction[] => {
    const side = txSide(t)
    if (side === 'income') {
      const rule = rules.get(t.category)
      if (rule?.action === 'exclude') return []
      if (rule?.action === 'offset' && rule.to) return expense.has(rule.to) ? [] : [{ ...t, category: rule.to, side: 'expense' }]
      return [t]
    }
    return side === 'expense' && expense.has(t.category) ? [] : [t]
  })
}

/** カードの一部を変える */
export function updateModule(config: ProcessingConfig, id: string, patch: ModulePatch): ProcessingConfig {
  return { ...config, modules: config.modules.map((m) => (m.id === id ? ({ ...m, ...patch } as ProcessingModule) : m)) }
}

/** 収入側のカテゴリーの扱いを変える。null なら「残す」に戻す */
export function setIncomeRule(module: IncomeModule, category: string, rule: IncomeRule | null): IncomeRule[] {
  const others = module.rules.filter((r) => r.category !== category)
  return rule ? [...others, rule] : others
}

/** その種類の有効なカード（実際に何かを当てはめるもの）があるか */
export function hasActiveModule(config: ProcessingConfig, type: ProcessingModule['type']): boolean {
  return config.modules.some(
    (m) =>
      m.type === type &&
      m.enabled &&
      (m.type === 'income' ? m.rules.some((r) => r.action === 'exclude' || r.to) : m.categories.length > 0),
  )
}
