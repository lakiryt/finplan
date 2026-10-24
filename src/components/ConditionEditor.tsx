import { useState } from 'react'
import { hasCriteria, matches, opposite, UNASSIGNED_OFFSET, type Condition } from '../domain/processing'
import type { Side } from '../domain/raw'
import type { Transaction } from '../domain/types'
import { yen } from './format'
import { SIDE_LABEL, type RuleDraft } from './ruleText'

const ANY = '__any__'

interface Props {
  /** 相殺なら差し引く先も選ぶ */
  kind: 'exclude' | 'offset'
  initial: RuleDraft
  /** 側ごとのカテゴリー（金額の多い順） */
  categories: Record<Side, string[]>
  /** 当たる記録の件数と金額を見せるための、加工する前の全取引 */
  transactions: Transaction[]
  onSave: (rule: RuleDraft) => void
  onDelete?: () => void
  close: () => void
}

/** 条件の編集窓。保存するまでは設定に反映しない（当たる記録はその場で数えて見せる） */
export function ConditionEditor({ kind, initial, categories, transactions, onSave, onDelete, close }: Props) {
  const [draft, setDraft] = useState<RuleDraft>(initial)
  const c = draft.when
  const setWhen = (patch: Partial<Condition>) => setDraft({ ...draft, when: { ...c, ...patch } })
  const hit = transactions.filter((t) => matches(c, t))
  const total = hit.reduce((s, t) => s + Math.abs(t.amount), 0)
  const other = opposite(c.side)

  return (
    <div className="condition-editor">
      <div className="editor-row">
        対象
        {(['income', 'expense'] as const).map((side) => (
          <label key={side}>
            <input type="radio" checked={c.side === side} onChange={() => setDraft({ ...draft, when: { side }, target: kind === 'offset' ? '' : undefined })} />
            {SIDE_LABEL[side]}
          </label>
        ))}
      </div>
      <label className="editor-row">
        カテゴリー
        <select
          value={c.category === undefined ? ANY : c.category}
          onChange={(e) => setWhen({ category: e.target.value === ANY ? undefined : e.target.value })}
        >
          <option value={ANY}>問わない</option>
          {categories[c.side].map((cat) => (
            <option key={cat} value={cat}>
              {cat || '（空欄）'}
            </option>
          ))}
        </select>
      </label>
      <div className="editor-row">
        <label>
          メモ
          <input value={c.memo ?? ''} placeholder="含む文字" onChange={(e) => setWhen({ memo: e.target.value || undefined })} />
        </label>
        <label>
          <input type="checkbox" checked={Boolean(c.memoIsRegex)} onChange={(e) => setWhen({ memoIsRegex: e.target.checked || undefined })} />
          正規表現
        </label>
      </div>
      <div className="editor-row">
        期間
        <input type="date" value={c.from ?? ''} onChange={(e) => setWhen({ from: e.target.value || undefined })} />〜
        <input type="date" value={c.to ?? ''} onChange={(e) => setWhen({ to: e.target.value || undefined })} />
      </div>
      {kind === 'offset' && (
        <label className="editor-row">
          {SIDE_LABEL[other]}の
          <select className={draft.target ? '' : 'unset'} value={draft.target ?? ''} onChange={(e) => setDraft({ ...draft, target: e.target.value })}>
            <option value="">指定しない（{SIDE_LABEL[other]}全体）</option>
            {categories[other].map((cat) => (
              <option key={cat} value={cat}>
                {cat || '（空欄）'}
              </option>
            ))}
          </select>
          から差し引く
        </label>
      )}
      <p className="muted small">
        {hasCriteria(c)
          ? `当たる記録: 全期間で${hit.length}件・${yen(total)}`
          : 'カテゴリー・メモ・期間のどれかを指定してください（何も指定しないと全件に当たってしまうため）'}
        {kind === 'offset' && !draft.target && hasCriteria(c) ? `（${UNASSIGNED_OFFSET}として数えます）` : ''}
      </p>
      <div className="editor-row">
        <button
          disabled={!hasCriteria(c)}
          onClick={() => {
            onSave(draft)
            close()
          }}
        >
          保存
        </button>
        <button onClick={close}>やめる</button>
        {onDelete && (
          <>
            <label className="push-right">
              <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
              有効
            </label>
            <button
              onClick={() => {
                onDelete()
                close()
              }}
            >
              削除
            </button>
          </>
        )}
      </div>
    </div>
  )
}
