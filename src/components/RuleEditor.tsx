import { useState } from 'react'
import { isActive, matchesRule } from '../domain/classify'
import type { Group, Rule, Transaction } from '../domain/types'
import { yen } from './format'

interface Props {
  rules: Rule[]
  onChange: (rules: Rule[]) => void
  groups: Group[]
  /** 元のカテゴリー（条件用） */
  originalCategories: string[]
  /** 付け替え先の候補（割り当て済みのカテゴリーも含む） */
  categoryOptions: string[]
  transactions: Transaction[]
}

const PREVIEW_LIMIT = 50

export function RuleEditor({ rules, onChange, groups, originalCategories, categoryOptions, transactions }: Props) {
  const [openId, setOpenId] = useState<string>()

  const update = (id: string, patch: (r: Rule) => Rule) => onChange(rules.map((r) => (r.id === id ? patch(r) : r)))
  const move = (i: number, d: -1 | 1) => {
    const next = [...rules]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    onChange(next)
  }
  const add = () =>
    onChange([...rules, { id: crypto.randomUUID(), label: '新しいルール', enabled: true, match: {}, effect: {} }])

  return (
    <div className="rules">
      <p className="muted small">
        上から順に、一致したルールの効果をすべて重ねます（同じ項目は下のルールが優先）。条件はCSVに書かれていた元のカテゴリーで判定します。
      </p>
      <datalist id="category-options">
        {categoryOptions.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {rules.map((rule, i) => {
        const matched = isActive(rule) ? transactions.filter((t) => matchesRule(rule.match, t)) : []
        const setMatch = (p: Partial<Rule['match']>) => update(rule.id, (r) => ({ ...r, match: { ...r.match, ...p } }))
        const setEffect = (p: Partial<Rule['effect']>) => update(rule.id, (r) => ({ ...r, effect: { ...r.effect, ...p } }))
        return (
          <div key={rule.id} className={`rule ${rule.enabled ? '' : 'disabled'}`}>
            <div className="rule-head">
              <input
                type="checkbox"
                title="有効"
                checked={rule.enabled}
                onChange={(e) => update(rule.id, (r) => ({ ...r, enabled: e.target.checked }))}
              />
              <input
                className="rule-label"
                value={rule.label}
                onChange={(e) => update(rule.id, (r) => ({ ...r, label: e.target.value }))}
              />
              <button disabled={i === 0} onClick={() => move(i, -1)} title="上へ">
                ↑
              </button>
              <button disabled={i === rules.length - 1} onClick={() => move(i, 1)} title="下へ">
                ↓
              </button>
              <button onClick={() => onChange(rules.filter((r) => r.id !== rule.id))}>削除</button>
            </div>

            <div className="rule-line">
              <span className="rule-tag">条件</span>
              <label>
                カテゴリー
                <select value={rule.match.category ?? ''} onChange={(e) => setMatch({ category: e.target.value || undefined })}>
                  <option value="">問わない</option>
                  {originalCategories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                メモ
                <input value={rule.match.memo ?? ''} onChange={(e) => setMatch({ memo: e.target.value || undefined })} />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={rule.match.memoIsRegex ?? false}
                  onChange={(e) => setMatch({ memoIsRegex: e.target.checked || undefined })}
                />
                正規表現
              </label>
              <label>
                期間
                <input type="date" value={rule.match.from ?? ''} onChange={(e) => setMatch({ from: e.target.value || undefined })} />
                〜
                <input type="date" value={rule.match.to ?? ''} onChange={(e) => setMatch({ to: e.target.value || undefined })} />
              </label>
            </div>

            <div className="rule-line">
              <span className="rule-tag">効果</span>
              <label>
                カテゴリーを
                <input
                  list="category-options"
                  placeholder="変更しない"
                  value={rule.effect.category ?? ''}
                  onChange={(e) => setEffect({ category: e.target.value || undefined })}
                />
              </label>
              <label>
                グループを
                <select value={rule.effect.groupId ?? ''} onChange={(e) => setEffect({ groupId: e.target.value || undefined })}>
                  <option value="">変更しない</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <input
                  type="number"
                  min={0}
                  className="short"
                  value={rule.effect.amortizeMonths ?? ''}
                  onChange={(e) => setEffect({ amortizeMonths: Number(e.target.value) || undefined })}
                />
                か月に按分
              </label>
            </div>

            <div className="rule-line">
              <button onClick={() => setOpenId(openId === rule.id ? undefined : rule.id)} disabled={!matched.length}>
                一致 {matched.length}件 {openId === rule.id ? '▲' : '▼'}
              </button>
              {rule.enabled && !isActive(rule) && <span className="muted small">条件を1つ以上指定してください</span>}
            </div>
            {openId === rule.id && (
              <table>
                <tbody>
                  {matched.slice(0, PREVIEW_LIMIT).map((t) => (
                    <tr key={t.id}>
                      <td>{t.date}</td>
                      <td className="num">{yen(t.amount)}</td>
                      <td>{t.category}</td>
                      <td>{t.memo}</td>
                    </tr>
                  ))}
                  {matched.length > PREVIEW_LIMIT && (
                    <tr>
                      <td colSpan={4} className="muted">
                        ほか {matched.length - PREVIEW_LIMIT}件
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        )
      })}
      <button onClick={add}>ルールを追加</button>
    </div>
  )
}
