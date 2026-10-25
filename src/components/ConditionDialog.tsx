import { useEffect, useRef, useState } from 'react'
import { hasCriteria, matches, opposite, recordKey, UNASSIGNED_OFFSET, type Condition } from '../domain/processing'
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
 * 一覧でチェックを付けると、その記録だけを選んだ条件になる（入力欄は記録を探すための検索として使う）。
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
  const { records: initialRecords, ...initialSearch } = initial.when
  const [draft, setDraft] = useState<RuleDraft>({ ...initial, when: initialSearch })
  // 一覧で選んだ記録（recordKey）。検索を変えても残る。1件でもあれば、保存する条件は選んだ記録だけになる
  const [picked, setPicked] = useState<string[]>(initialRecords ?? [])
  // 一覧の並び順。見出しを押すとその列で並べ替え、同じ見出しをもう一度押すと昇順・降順を入れ替える
  const [sort, setSort] = useState<Sort>({ key: 'date', desc: true })
  const c = draft.when
  const setWhen = (patch: Partial<Condition>) => setDraft({ ...draft, when: { ...c, ...patch } })
  const column = COLUMNS.find((col) => col.key === sort.key)!
  const sorted = (list: Transaction[]) => list.sort((a, b) => (sort.desc ? -1 : 1) * column.compare(a, b) || b.date.localeCompare(a.date))
  const toggleSort = (key: SortKey) =>
    // 日付・金額は新しい順・大きい順から、文字の列は五十音順から始める
    setSort((cur) => (cur.key === key ? { key, desc: !cur.desc } : { key, desc: key === 'date' || key === 'amount' }))
  const hit = hasCriteria(c) ? sorted(transactions.filter((t) => matches(c, t))) : []
  const pickedSet = new Set(picked)
  const pickedRows = sorted(transactions.filter((t) => txSide(t) === c.side && pickedSet.has(recordKey(t))))
  const found = new Set(pickedRows.map(recordKey))
  const missing = picked.filter((k) => !found.has(k)).length
  const toggle = (keys: string[], on: boolean) =>
    setPicked((cur) => (on ? [...new Set([...cur, ...keys])] : cur.filter((k) => !keys.includes(k))))
  const sum = (list: Transaction[]) => yen(list.reduce((s, t) => s + Math.abs(t.amount), 0))
  const other = opposite(c.side)
  // 保存する条件。記録を選んでいれば、検索の条件は使わず選んだ記録だけにする
  const result: Condition = picked.length > 0 ? { side: c.side, records: picked } : c
  const table = { sort, toggleSort, picked: pickedSet, toggle }

  return (
    <div className="condition-editor">
      <h3>{kind === 'offset' ? '相殺' : '除外'}の条件</h3>
      <div className="editor-row">
        対象
        {(['income', 'expense'] as const).map((side) => (
          <label key={side}>
            <input
              type="radio"
              checked={c.side === side}
              onChange={() => {
                setDraft({ ...draft, when: { side }, target: kind === 'offset' ? '' : undefined })
                setPicked([])
              }}
            />
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
          disabled={!hasCriteria(result)}
          onClick={() => {
            onSave({ ...draft, when: result })
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
        {picked.length > 0 && (
          <div className="picked">
            <p className="small">
              <strong>
                選んだ記録: {pickedRows.length}件・{sum(pickedRows)}
              </strong>
              <span className="muted">（保存すると、この記録だけが対象になります）</span>
              <button className="pin" onClick={() => setPicked([])}>
                選択を解除
              </button>
            </p>
            {missing > 0 && (
              <p className="small">
                <span className="warn-text">見つからない記録が{missing}件あります（家計簿で書き換えたか、読み込んだCSVに無い記録）</span>
                <button className="pin" onClick={() => setPicked(picked.filter((k) => found.has(k)))}>
                  外す
                </button>
              </p>
            )}
            {pickedRows.length > 0 && <RecordTable rows={pickedRows} {...table} />}
          </div>
        )}
        <p className="muted small">
          {hasCriteria(c)
            ? `${picked.length > 0 ? '検索に' : ''}当たる記録: 全期間で${hit.length}件・${sum(hit)}（チェックを付けると、その記録だけを選べます）`
            : picked.length > 0
              ? 'カテゴリー・メモ・期間で検索すると、ほかの記録も選べます'
              : 'カテゴリー・メモ・期間のどれかを指定すると、当たる記録がここに並びます（何も指定しないと全件に当たってしまうため）'}
          {kind === 'offset' && !draft.target && hasCriteria(result) ? `（${UNASSIGNED_OFFSET}として数えます）` : ''}
        </p>
        {hit.length > 0 && (
          <>
            <RecordTable rows={hit.slice(0, RESULT_LIMIT)} {...table} />
            {hit.length > RESULT_LIMIT && <p className="muted small">ほか {hit.length - RESULT_LIMIT}件（条件を絞ると表示されます）</p>}
          </>
        )}
      </div>
    </div>
  )
}

interface TableProps {
  rows: Transaction[]
  sort: Sort
  toggleSort: (key: SortKey) => void
  picked: Set<string>
  toggle: (keys: string[], on: boolean) => void
}

/** 記録の一覧。行を押すと選ぶ・外す（見出しのチェックは、一覧にある記録をまとめて選ぶ・外す） */
function RecordTable({ rows, sort, toggleSort, picked, toggle }: TableProps) {
  const keys = rows.map(recordKey)
  const all = keys.every((k) => picked.has(k))
  return (
    <div className="results-scroll">
      <table>
        <thead>
          <tr>
            <th>
              <input type="checkbox" checked={all} onChange={() => toggle(keys, !all)} title={all ? '一覧の記録をすべて外す' : '一覧の記録をすべて選ぶ'} />
            </th>
            {COLUMNS.map((col) => (
              <th key={col.key} className={col.num ? 'num' : undefined} aria-sort={sort.key === col.key ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
                <button className="sort-button" onClick={() => toggleSort(col.key)}>
                  {col.label}
                  <span className="sort-mark">{sort.key === col.key ? (sort.desc ? '▼' : '▲') : ''}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((t, i) => (
            <tr key={t.id} className={picked.has(keys[i]) ? 'picked-row' : undefined} onClick={() => toggle([keys[i]], !picked.has(keys[i]))}>
              <td>
                <input type="checkbox" checked={picked.has(keys[i])} readOnly />
              </td>
              <td className="num">{t.date}</td>
              <td className="num">{yen(t.amount)}</td>
              <td>{t.category || '（空欄）'}</td>
              <td className="results-memo">{t.memo}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
