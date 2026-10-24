import type { ClassifyConfig } from './types'

export const UNASSIGNED_LABEL = '未分類'

/** 初期設定。カテゴリーの割り当ては一般的な例で、画面から変更できる */
export const defaultConfig: ClassifyConfig = {
  version: 1,
  groups: [
    { id: 'fixed', label: '固定生活費', role: 'living' },
    { id: 'variable', label: '変動生活費', role: 'living' },
    { id: 'housing', label: '住居費', role: 'housing' },
    { id: 'income', label: '収入', role: 'income' },
    { id: 'transfer', label: '貯蓄・口座移動', role: 'ignore' },
    { id: 'adjust', label: '調整・除外', role: 'ignore' },
  ],
  categoryGroup: {
    通信費: 'fixed',
    水道光熱費: 'fixed',
    保険: 'fixed',
    税金: 'fixed',

    食料品: 'variable',
    外食: 'variable',
    日用品: 'variable',
    交通費: 'variable',
    医療費: 'variable',
    '趣味・娯楽': 'variable',
    '衣服・美容': 'variable',
    交際費: 'variable',
    '教育・教養': 'variable',

    家賃: 'housing',

    給与: 'income',
    副収入: 'income',

    '貯金・投資': 'transfer',
    口座移動: 'transfer',
  },
  memoRules: [{ id: 'adjust', pattern: '残高調整', isRegex: false, groupId: 'adjust' }],
}
