import defaultConfigJson from '../config/default-config.json'
import type { ClassifyConfig, GroupRole } from './types'

export const UNASSIGNED_LABEL = '未分類'

const roles: GroupRole[] = ['living', 'housing', 'income', 'ignore']

/** 保存された設定や読み込んだJSONを検証する */
export function parseConfig(raw: unknown): ClassifyConfig {
  const c = raw as { version?: number } | null
  if (!c || typeof c !== 'object') throw new Error('設定がオブジェクトではありません')
  const config = c as ClassifyConfig
  if (config.version !== 2) throw new Error(`未対応の設定バージョンです: ${c.version}`)
  if (!Array.isArray(config.groups) || !config.groups.every((g) => g.id && roles.includes(g.role))) {
    throw new Error('groups の形式が正しくありません')
  }
  if (!config.categoryGroup || typeof config.categoryGroup !== 'object') throw new Error('categoryGroup がありません')
  if (!Array.isArray(config.rules)) throw new Error('rules がありません')
  return config
}

/** 初期設定。中身は src/config/default-config.json で編集する */
export const defaultConfig: ClassifyConfig = parseConfig(defaultConfigJson)
