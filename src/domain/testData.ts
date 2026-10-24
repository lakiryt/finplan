/** テスト用の架空のデータ（複数のテストで共通に使う） */
import type { ClassifyConfig, Rule } from './types'

export const csv = `金額,日付,メモ,カテゴリー名
-1000,2026/01/05,スーパー,食費
-5000,2026/01/10,携帯1月,食費
200000,2026/01/25,給与,給与
-50000,2026/02/01,証券,貯蓄
500,2026/03/02,割り勘 半額,回収
-800,2026/03/03,スーパー,食費
-60000,2026/01/20,家賃,家賃
-8000,2026/02/10,ホテル2泊,家賃
`

export const rule = (id: string, match: Rule['match'], effect: Rule['effect']): Rule => ({ id, label: id, enabled: true, match, effect })

export const config: ClassifyConfig = {
  version: 2,
  groups: [
    { id: 'var', label: '変動', role: 'living' },
    { id: 'fix', label: '固定', role: 'living' },
    { id: 'house', label: '住居', role: 'housing' },
    { id: 'inc', label: '収入', role: 'income' },
    { id: 'skip', label: '除外', role: 'ignore' },
  ],
  categoryGroup: { 食費: 'var', 通信: 'fix', 宿泊: 'var', 家賃: 'house', 給与: 'inc', 貯蓄: 'skip' },
  rules: [
    rule('phone', { memo: '携帯' }, { category: '通信' }),
    rule('refund', { memo: '半額$', memoIsRegex: true }, { groupId: 'var' }),
    rule('lodging', { category: '家賃', memo: '泊' }, { category: '宿泊' }),
  ],
}

/** 決まった順でIDを作る（グループの編集のテスト用） */
export const ids = () => {
  let n = 0
  return () => `n${n++}`
}
