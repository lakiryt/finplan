import { useEffect, useMemo, useRef, useState } from 'react'
import { hasCriteria, matches, opposite, outcomeOf, recordKey, UNASSIGNED_OFFSET, whollyExcluded, type Condition, type ProcessingConfig, type Target } from '../domain/processing'
import { txSide, type Side } from '../domain/raw'
import type { Transaction } from '../domain/types'
import { yen } from './format'
import { SIDE_LABEL, type RecordsRequest, type RuleDraft } from './ruleText'

const ANY = '__any__'
/**
 * 差し引く先の選択肢の値。「差し引かない（除外）」「指定せずに差し引く」とカテゴリーを区別する
 * （カテゴリーは空欄もあり得るので、カテゴリーの値には接頭辞を付ける）
 */
const NO_TARGET = '__none__'
const UNASSIGNED = '__unassigned__'
const targetValue = (target: Target | null) => (target === null ? NO_TARGET : target.category === null ? UNASSIGNED : `cat:${target.category}`)
const parseTargetValue = (value: string): Target | null =>
  value === NO_TARGET ? null : value === UNASSIGNED ? { category: null } : { category: value.slice('cat:'.length) }
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
  /** 開く内容。null なら閉じている */
  request: RecordsRequest | null
  /** 側ごとのカテゴリー（金額の多い順） */
  categories: Record<Side, string[]>
  /** 加工する前の全取引 */
  transactions: Transaction[]
  /** 今の加工の設定（一覧に、それぞれの記録に起きていることを出す） */
  processing: ProcessingConfig
  onSave: (rule: RuleDraft, id?: string) => void
  onDelete: (id: string) => void
  onClose: () => void
}

/**
 * 記録の画面（モーダル）。検索した記録を一覧にし、その検索か、一覧で選んだ記録を、3. の加工の条件にできる。
 * 2. の棒グラフ（その月で絞った検索）や、3. の条件の追加・編集から開く。
 * ブラウザ標準の <dialog> を使う（Esc や背景のクリックで閉じる。保存するまでは設定に反映しない）
 */
export function RecordDialog({ request, onClose, ...rest }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const open = request !== null

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog ref={ref} className="record-dialog" onClose={onClose} onClick={(e) => e.target === e.currentTarget && onClose()}>
      {/* 開くたびに入力欄を初期化するため、開いている間だけ中身を描く */}
      {request && <RecordEditor request={request} close={onClose} {...rest} />}
    </dialog>
  )
}

function RecordEditor({
  request,
  categories,
  transactions,
  processing,
  onSave,
  onDelete,
  close,
}: Omit<Props, 'request' | 'onClose'> & { request: RecordsRequest; close: () => void }) {
  const { id } = request
  const { records: initialRecords, ...initialSearch } = request.draft.when
  const [draft, setDraft] = useState<RuleDraft>({ ...request.draft, when: initialSearch })
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
  // 見るだけなら、検索の項目が無くても、その側の記録をすべて出す（条件にするときだけ項目が要る）
  const hit = sorted(transactions.filter((t) => (hasCriteria(c) ? matches(c, t) : txSide(t) === c.side)))
  const pickedSet = new Set(picked)
  const pickedRows = sorted(transactions.filter((t) => txSide(t) === c.side && pickedSet.has(recordKey(t))))
  const found = new Set(pickedRows.map(recordKey))
  const missing = picked.filter((k) => !found.has(k)).length
  const toggle = (keys: string[], on: boolean) =>
    setPicked((cur) => (on ? [...new Set([...cur, ...keys])] : cur.filter((k) => !keys.includes(k))))
  const sum = (list: Transaction[]) => yen(list.reduce((s, t) => s + Math.abs(t.amount), 0))
  const other = opposite(c.side)
  // 保存する条件。記録を選んでいれば、検索の項目は使わず選んだ記録だけにする
  const result: Condition = picked.length > 0 ? { side: c.side, records: picked } : c
  const excluded = whollyExcluded(processing, other)
  const outcomes = useMemo(() => new Map(transactions.map((t) => [t, outcomeOf(t, processing)])), [transactions, processing])
  const table = { sort, toggleSort, picked: pickedSet, toggle, outcomes }

  return (
    <div className="record-editor">
      <h3>{id ? '条件の編集' : '記録の一覧'}</h3>
      <p className="muted small">検索して記録を確かめ、行を押すと記録を選べます。下で、その検索か選んだ記録を 3. の加工の条件にできます。</p>
      <div className="editor-row">
        対象
        {(['expense', 'income'] as const).map((side) => (
          <label key={side}>
            <input
              type="radio"
              checked={c.side === side}
              onChange={() => {
                // 差し引く先は反対側のカテゴリーなので、側を変えたら選び直す
                setDraft({ ...draft, when: { ...c, side, category: undefined }, target: null })
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

      <div className="record-results">
        <p className="muted small">
          {hasCriteria(c) ? '検索に当たる記録' : `${SIDE_LABEL[c.side]}の記録すべて`}: 全期間で{hit.length}件・{sum(hit)}
        </p>
        {hit.length > 0 && (
          <>
            <RecordTable rows={hit.slice(0, RESULT_LIMIT)} {...table} />
            {hit.length > RESULT_LIMIT && <p className="muted small">ほか {hit.length - RESULT_LIMIT}件（検索で絞ると表示されます）</p>}
          </>
        )}
        {/* 選ぶたびに上の検索結果の行が動かないように、選んだ記録は下に出す */}
        {picked.length > 0 && (
          <div className="picked">
            <p className="small">
              <strong>
                選んだ記録: {pickedRows.length}件・{sum(pickedRows)}
              </strong>
              <span className="muted">（条件にすると、この記録だけが対象になります）</span>
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
      </div>

      <div className="record-footer">
        <div className="editor-row">
          <strong>{picked.length > 0 ? `選んだ記録${picked.length}件` : 'この検索に当たる記録'}</strong>を{SIDE_LABEL[c.side]}から除き、{SIDE_LABEL[other]}側では
          <select
            value={targetValue(draft.target)}
            onChange={(e) => setDraft({ ...draft, target: parseTargetValue(e.target.value) })}
          >
            <option value={NO_TARGET}>差し引かない（除外）</option>
            <option value={UNASSIGNED}>カテゴリーを指定せずに差し引く（相殺）</option>
            {categories[other].map((cat) => (
              // カテゴリー全体を除外している先へ差し引くと、除外と同じになるので選べない
              <option key={cat} value={targetValue({ category: cat })} disabled={excluded.has(cat)}>
                「{cat || '（空欄）'}」{excluded.has(cat) ? '（除外しているので選べません）' : 'から差し引く（相殺）'}
              </option>
            ))}
          </select>
        </div>
        {draft.target?.category === null && (
          <p className="muted small">内訳を気にしないとき向けです。{SIDE_LABEL[other]}のどのカテゴリーにも付けずに全体から差し引き、2. では「{UNASSIGNED_OFFSET}」として灰色で出します。</p>
        )}
        {!hasCriteria(result) && <p className="muted small">条件にするには、カテゴリー・メモ・期間のどれかで検索するか、記録を選んでください（何も指定しないと全件に当たってしまうため）。</p>}
        <div className="editor-row">
          <button
            disabled={!hasCriteria(result)}
            onClick={() => {
              onSave({ ...draft, when: result }, id)
              close()
            }}
          >
            {id ? '保存' : '条件として保存'}
          </button>
          <button onClick={close}>閉じる</button>
          {id && (
            <>
              <label className="push-right">
                <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
                有効
              </label>
              <button
                onClick={() => {
                  onDelete(id)
                  close()
                }}
              >
                削除
              </button>
            </>
          )}
        </div>
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
  outcomes: Map<Transaction, ReturnType<typeof outcomeOf>>
}

/** 記録の一覧。行を押すと選ぶ・外す（見出しのチェックは、一覧にある記録をまとめて選ぶ・外す）。右端に今の加工で起きていることを出す */
function RecordTable({ rows, sort, toggleSort, picked, toggle, outcomes }: TableProps) {
  const keys = rows.map(recordKey)
  const all = keys.every((k) => picked.has(k))
  const processed = (t: Transaction) => {
    const o = outcomes.get(t)
    if (!o || o.kind === 'keep') return ''
    return o.kind === 'exclude' ? '除外' : `相殺 →「${o.target || '（空欄）'}」`
  }
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
            <th>今の加工</th>
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
              <td className="muted small">{processed(t)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
