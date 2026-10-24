import { useEffect, useRef, useState } from 'react'
import { hasCriteria, matches, opposite, UNASSIGNED_OFFSET, type Condition } from '../domain/processing'
import { txSide, type Side } from '../domain/raw'
import type { Transaction } from '../domain/types'
import { yen } from './format'
import { SIDE_LABEL, type RuleDraft } from './ruleText'

const ANY = '__any__'
/** 一覧に出す件数の上限（並べ替えた後の上位） */
const RESULT_LIMIT = 200

type SortKey = 'date' | 'amount' | 'category' | 'memo'
interface Sort {
  key: SortKey
  desc: boolean
}

/** 一覧の列。金額は大きさで比べる（支出のマイナスも、金額の大きい順に並ぶように） */
const COLUMNS: { key: SortKey; label: string; num?: boolean; compare: (a: Transaction, b: Transaction) => number }[] = [
  { key: 'date', label: '日付', num: true, compare: (a, b) => a.date.localeCompare(b.date) },
  { key: 'amount', label: '金額', num: true, compare: (a, b) => Math.abs(a.amount) - Math.abs(b.amount) },
  { key: 'category', label: 'カテゴリー', compare: (a, b) => a.category.localeCompare(b.category, 'ja') },
  { key: 'memo', label: 'メモ', compare: (a, b) => a.memo.localeCompare(b.memo, 'ja') },
]

interface Props {
  /** 相殺なら差し引く先も選ぶ */
  kind: 'exclude' | 'offset'
  /** 編集する条件。null なら閉じている */
  initial: RuleDraft | null
  /** 既存の条件の編集なら削除・有効の切り替えも出す */
  editing: boolean
  /** 側ごとのカテゴリー（金額の多い順） */
  categories: Record<Side, string[]>
  /** 条件に当たる記録を探すための、加工する前の全取引 */
  transactions: Transaction[]
  onSave: (rule: RuleDraft) => void
  onDelete: () => void
  onClose: () => void
}

/**
 * 条件の編集画面（モーダル）。条件の下に、当たる記録をその場で一覧にして、確かめながら絞り込めるようにする。
 * ブラウザ標準の <dialog> を使う（Esc や背景のクリックで閉じる。保存するまでは設定に反映しない）
 */
export function ConditionDialog({ initial, onClose, ...rest }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const open = initial !== null

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog ref={ref} className="condition-dialog" onClose={onClose} onClick={(e) => e.target === e.currentTarget && onClose()}>
      {/* 開くたびに入力欄を初期化するため、開いている間だけ中身を描く */}
      {initial && <ConditionEditor initial={initial} close={onClose} {...rest} />}
    </dialog>
  )
}

function ConditionEditor({
  kind,
  initial,
  editing,
  categories,
  transactions,
  onSave,
  onDelete,
  close,
}: Omit<Props, 'initial' | 'onClose'> & { initial: RuleDraft; close: () => void }) {
  const [draft, setDraft] = useState<RuleDraft>(initial)
  // 一覧の並び順。見出しを押すとその列で並べ替え、同じ見出しをもう一度押すと昇順・降順を入れ替える
  const [sort, setSort] = useState<Sort>({ key: 'date', desc: true })
  const c = draft.when
  const setWhen = (patch: Partial<Condition>) => setDraft({ ...draft, when: { ...c, ...patch } })
  const column = COLUMNS.find((col) => col.key === sort.key)!
  const hit = hasCriteria(c)
    ? transactions.filter((t) => matches(c, t)).sort((a, b) => (sort.desc ? -1 : 1) * column.compare(a, b) || b.date.localeCompare(a.date))
    : []
  const toggleSort = (key: SortKey) =>
    // 日付・金額は新しい順・大きい順から、文字の列は五十音順から始める
    setSort((cur) => (cur.key === key ? { key, desc: !cur.desc } : { key, desc: key === 'date' || key === 'amount' }))
  const total = hit.reduce((s, t) => s + Math.abs(t.amount), 0)
  const other = opposite(c.side)

  /**
   * その記録だけに当たるよう条件を置き換える。日付とカテゴリーで足りるなら、それだけにする
   * （同じ日・同じカテゴリーに同じ側の記録がほかにあるときだけ、メモも足す）
   */
  const pinTo = (t: Transaction) => {
    const sameDay = transactions.filter((x) => txSide(x) === c.side && x.date === t.date && x.category === t.category).length
    setWhen({ category: t.category, from: t.date, to: t.date, memo: sameDay > 1 && t.memo ? t.memo : undefined, memoIsRegex: undefined })
  }

  return (
    <div className="condition-editor">
      <h3>{kind === 'offset' ? '相殺' : '除外'}の条件</h3>
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
        {editing && (
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

      <div className="condition-results">
        <p className="muted small">
          {hasCriteria(c)
            ? `当たる記録: 全期間で${hit.length}件・${yen(total)}`
            : 'カテゴリー・メモ・期間のどれかを指定すると、当たる記録がここに並びます（何も指定しないと全件に当たってしまうため）'}
          {kind === 'offset' && !draft.target && hasCriteria(c) ? `（${UNASSIGNED_OFFSET}として数えます）` : ''}
        </p>
        {hit.length > 0 && (
          <div className="results-scroll">
            <table>
              <thead>
                <tr>
                  {COLUMNS.map((col) => (
                    <th key={col.key} className={col.num ? 'num' : undefined} aria-sort={sort.key === col.key ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
                      <button className="sort-button" onClick={() => toggleSort(col.key)}>
                        {col.label}
                        <span className="sort-mark">{sort.key === col.key ? (sort.desc ? '▼' : '▲') : ''}</span>
                      </button>
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {hit.slice(0, RESULT_LIMIT).map((t) => (
                  <tr key={t.id}>
                    <td className="num">{t.date}</td>
                    <td className="num">{yen(t.amount)}</td>
                    <td>{t.category || '（空欄）'}</td>
                    <td className="results-memo">{t.memo}</td>
                    <td>
                      <button className="pin" onClick={() => pinTo(t)} title="条件を、この記録の日付とカテゴリー（必要ならメモも）に置き換えます">
                        この記録に絞る
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hit.length > RESULT_LIMIT && <p className="muted small">ほか {hit.length - RESULT_LIMIT}件（条件を絞ると表示されます）</p>}
          </div>
        )}
      </div>
    </div>
  )
}
