import { useMemo } from 'react'
import { UNASSIGNED_LABEL, parseConfig } from '../domain/config'
import type { ClassifiedTransaction, ClassifyConfig, GroupRole, Transaction } from '../domain/types'
import { downloadJson } from '../state/storage'
import { yen } from './format'
import { RuleEditor } from './RuleEditor'

interface Props {
  config: ClassifyConfig
  onChange: (config: ClassifyConfig) => void
  onReset: () => void
  transactions: Transaction[]
  classified: ClassifiedTransaction[]
}

const roleLabel: Record<GroupRole, string> = {
  living: '生活費',
  housing: '住居費',
  income: '収入',
  ignore: '集計しない',
}

export function ClassifySettings({ config, onChange, onReset, transactions, classified }: Props) {
  /** ルール適用後のカテゴリーごとの件数・合計（ルールで新しく作ったカテゴリーも含む） */
  const categories = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>()
    for (const tx of classified) {
      const s = map.get(tx.category) ?? { count: 0, total: 0 }
      if (!tx.amortizedFrom || tx.id.endsWith('#0')) s.count++
      s.total += tx.amount
      map.set(tx.category, s)
    }
    return [...map.entries()].sort((a, b) => a[1].total - b[1].total)
  }, [classified])

  const originalCategories = useMemo(() => [...new Set(transactions.map((t) => t.category))].sort(), [transactions])
  const categoryOptions = useMemo(
    () => [...new Set([...originalCategories, ...Object.keys(config.categoryGroup)])].sort(),
    [originalCategories, config.categoryGroup],
  )

  const setCategoryGroup = (category: string, groupId: string) => {
    const categoryGroup = { ...config.categoryGroup }
    if (groupId) categoryGroup[category] = groupId
    else delete categoryGroup[category]
    onChange({ ...config, categoryGroup })
  }

  async function importConfig(file: File) {
    try {
      onChange(parseConfig(JSON.parse(await file.text())))
    } catch (e) {
      alert(`設定を読み込めませんでした: ${e instanceof Error ? e.message : e}`)
    }
  }

  return (
    <div className="settings">
      <h3>カテゴリーの割り当て</h3>
      <p className="muted small">ルールを適用した後のカテゴリーです。</p>
      <table>
        <thead>
          <tr>
            <th>カテゴリー</th>
            <th className="num">件数</th>
            <th className="num">合計</th>
            <th>グループ</th>
          </tr>
        </thead>
        <tbody>
          {categories.map(([category, s]) => {
            const assigned = config.categoryGroup[category]
            return (
              <tr key={category} className={assigned ? undefined : 'warn'}>
                <td>{category || '（空欄）'}</td>
                <td className="num">{s.count}</td>
                <td className="num">{yen(s.total)}</td>
                <td>
                  <select value={assigned ?? ''} onChange={(e) => setCategoryGroup(category, e.target.value)}>
                    <option value="">{UNASSIGNED_LABEL}</option>
                    {config.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.label}（{roleLabel[g.role]}）
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <h3>ルール</h3>
      <RuleEditor
        rules={config.rules}
        onChange={(rules) => onChange({ ...config, rules })}
        groups={config.groups}
        originalCategories={originalCategories}
        categoryOptions={categoryOptions}
        transactions={transactions}
      />

      <div className="row">
        <button onClick={() => downloadJson('finplan-config.json', config)}>設定を書き出す</button>
        <label className="button">
          設定を読み込む
          <input
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) importConfig(file)
              e.target.value = ''
            }}
          />
        </label>
        <button onClick={() => confirm('分類設定を初期状態に戻しますか？') && onReset()}>初期設定に戻す</button>
      </div>
    </div>
  )
}
