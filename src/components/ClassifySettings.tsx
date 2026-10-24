import { useMemo } from 'react'
import { matchesRule } from '../domain/classify'
import { UNASSIGNED_LABEL } from '../domain/defaultConfig'
import type { ClassifyConfig, GroupRole, MemoRule, Transaction } from '../domain/types'
import { downloadJson } from '../state/storage'
import { yen } from './format'

interface Props {
  config: ClassifyConfig
  onChange: (config: ClassifyConfig) => void
  onReset: () => void
  transactions: Transaction[]
}

const roleLabel: Record<GroupRole, string> = {
  living: '生活費',
  housing: '住居費',
  income: '収入',
  ignore: '集計しない',
}

export function ClassifySettings({ config, onChange, onReset, transactions }: Props) {
  const categories = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>()
    for (const tx of transactions) {
      const s = map.get(tx.category) ?? { count: 0, total: 0 }
      s.count++
      s.total += tx.amount
      map.set(tx.category, s)
    }
    for (const r of config.memoRules) if (r.category && !map.has(r.category)) map.set(r.category, { count: 0, total: 0 })
    return [...map.entries()].sort((a, b) => a[1].total - b[1].total)
  }, [transactions, config.memoRules])

  const setCategoryGroup = (category: string, groupId: string) => {
    const categoryGroup = { ...config.categoryGroup }
    if (groupId) categoryGroup[category] = groupId
    else delete categoryGroup[category]
    onChange({ ...config, categoryGroup })
  }

  const updateRule = (id: string, patch: Partial<MemoRule>) =>
    onChange({ ...config, memoRules: config.memoRules.map((r) => (r.id === id ? { ...r, ...patch } : r)) })

  const addRule = () =>
    onChange({
      ...config,
      memoRules: [...config.memoRules, { id: crypto.randomUUID(), pattern: '', isRegex: false }],
    })

  const removeRule = (id: string) => onChange({ ...config, memoRules: config.memoRules.filter((r) => r.id !== id) })

  async function importConfig(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as ClassifyConfig
      if (parsed.version !== 1 || !Array.isArray(parsed.groups)) throw new Error('形式が違います')
      onChange(parsed)
    } catch (e) {
      alert(`設定を読み込めませんでした: ${e instanceof Error ? e.message : e}`)
    }
  }

  const groupSelect = (value: string | undefined, onSelect: (id: string) => void, emptyLabel: string) => (
    <select value={value ?? ''} onChange={(e) => onSelect(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {config.groups.map((g) => (
        <option key={g.id} value={g.id}>
          {g.label}（{roleLabel[g.role]}）
        </option>
      ))}
    </select>
  )

  return (
    <div className="settings">
      <h3>カテゴリーの割り当て</h3>
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
                <td>{groupSelect(assigned, (id) => setCategoryGroup(category, id), UNASSIGNED_LABEL)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <h3>メモによる上書き</h3>
      <p className="muted">上から順に、最初に一致したルールが使われます。</p>
      <table>
        <thead>
          <tr>
            <th>メモに含む文字</th>
            <th>正規表現</th>
            <th>カテゴリーを変更</th>
            <th>グループを変更</th>
            <th className="num">一致</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {config.memoRules.map((r) => (
            <tr key={r.id}>
              <td>
                <input value={r.pattern} onChange={(e) => updateRule(r.id, { pattern: e.target.value })} />
              </td>
              <td>
                <input type="checkbox" checked={r.isRegex} onChange={(e) => updateRule(r.id, { isRegex: e.target.checked })} />
              </td>
              <td>
                <select value={r.category ?? ''} onChange={(e) => updateRule(r.id, { category: e.target.value || undefined })}>
                  <option value="">変更しない</option>
                  {categories.map(([c]) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </td>
              <td>{groupSelect(r.groupId, (id) => updateRule(r.id, { groupId: id || undefined }), '変更しない')}</td>
              <td className="num">{transactions.filter((t) => matchesRule(r, t.memo)).length}</td>
              <td>
                <button onClick={() => removeRule(r.id)}>削除</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <button onClick={addRule}>ルールを追加</button>
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
