import { useEffect, useMemo, useRef, useState } from 'react'
import { hasCriteria, isLocked, kindOf, matches, opposite, outcomeOf, recordKey, ruleEffect, whollyExcluded, type Condition, type ProcessingConfig, type Target } from '../domain/processing'
import { txSide, type Side } from '../domain/raw'
import type { Transaction } from '../domain/types'
import { yen } from './format'
import { describeRule, KIND_LABEL, ruleLabel, SIDE_LABEL, type RecordsRequest, type RuleDraft } from './ruleText'

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
const DATE_MAX = '9999-12-31'
/** 一覧に出す件数の上限（並べ替えた後の上位） */
const RESULT_LIMIT = 200

type Mode = 'condition' | 'pick'
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
 * 条件の画面（モーダル）。「条件で指定」か「1件ずつ選ぶ」かを切り替え、当たる記録と、保存される内容をその場で見せる。
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
  // 条件で指定するか（あとから増える記録にも当たる）、1件ずつ選ぶか。保存するのは選んでいる方だけ
  const [mode, setMode] = useState<Mode>(initialRecords?.length ? 'pick' : 'condition')
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
  const picking = mode === 'pick'
  // 1件ずつ選ぶときは、入力欄は絞り込みなので、空ならその側の記録をすべて出す
  const hit = sorted(transactions.filter((t) => (hasCriteria(c) ? matches(c, t) : picking && txSide(t) === c.side)))
  const pickedSet = new Set(picked)
  const pickedRows = sorted(transactions.filter((t) => txSide(t) === c.side && pickedSet.has(recordKey(t))))
  const found = new Set(pickedRows.map(recordKey))
  const missing = picked.filter((k) => !found.has(k)).length
  const toggle = (keys: string[], on: boolean) =>
    setPicked((cur) => (on ? [...new Set([...cur, ...keys])] : cur.filter((k) => !keys.includes(k))))
  const other = opposite(c.side)
  const kind = kindOf(draft)
  const when: Condition = picking ? { side: c.side, records: picked } : c
  const effect = ruleEffect(transactions, processing, when, kind, id)
  const excluded = whollyExcluded(processing, other)
  const outcomes = useMemo(() => new Map(transactions.map((t) => [t, outcomeOf(t, processing)])), [transactions, processing])
  const locked = (t: Transaction) => isLocked(t, processing, kind, id)
  const addable = picking ? hit.filter((t) => !locked(t)).map(recordKey).filter((k) => !pickedSet.has(k)) : []
  const table = { sort, toggleSort, picking, picked: pickedSet, toggle, outcomes, locked }

  return (
    <div className="record-editor">
      {/* 名前はこの画面のタイトルなので、見出しの位置で直接書き換える。空なら条件の内容がそのまま名前の代わりになる */}
      <input
        className="rule-title"
        aria-label="条件の名前"
        value={draft.name ?? ''}
        placeholder={describeRule({ ...draft, when })}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
      />
      <Segmented
        value={c.side}
        options={[
          ['expense', SIDE_LABEL.expense],
          ['income', SIDE_LABEL.income],
        ]}
        onChange={(side) => {
          // 差し引く先は反対側のカテゴリーなので、側を変えたら選び直す
          setDraft({ ...draft, when: { ...c, side, category: undefined }, target: null })
          setPicked([])
        }}
      />
      <Segmented
        value={mode}
        options={[
          ['condition', '条件で指定'],
          ['pick', '1件ずつ選ぶ'],
        ]}
        onChange={setMode}
      />
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
        {/* 上限が無いとブラウザは年を6桁まで受け付けるので、4桁に収める */}
        <input type="date" max={DATE_MAX} value={c.from ?? ''} onChange={(e) => setWhen({ from: e.target.value || undefined })} />〜
        <input type="date" max={DATE_MAX} value={c.to ?? ''} onChange={(e) => setWhen({ to: e.target.value || undefined })} />
      </div>

      <div className="record-results">
        {picking && (
          <div className="editor-row">
            <span className="muted small">{hit.length}件</span>
            <button className="pin" disabled={!addable.length} onClick={() => toggle(addable, true)}>
              ＋ 全部（{addable.length}件）
            </button>
          </div>
        )}
        {hit.length > 0 && (
          <>
            <RecordTable rows={hit.slice(0, RESULT_LIMIT)} {...table} />
            {hit.length > RESULT_LIMIT && <p className="muted small">ほか {hit.length - RESULT_LIMIT}件</p>}
          </>
        )}
        {picking && picked.length > 0 && (
          <div className="picked">
            <div className="editor-row">
              <strong className="small">選んだ記録 {pickedRows.length}件</strong>
              <button className="pin" onClick={() => setPicked([])}>
                − 全部
              </button>
              {missing > 0 && (
                <>
                  <span className="warn-text small">見つからない記録 {missing}件</span>
                  <button className="pin" onClick={() => setPicked(picked.filter((k) => found.has(k)))}>
                    − 外す
                  </button>
                </>
              )}
            </div>
            {pickedRows.length > 0 && <RecordTable rows={pickedRows} {...table} />}
          </div>
        )}
      </div>

      <div className="record-footer">
        <div className="editor-row">
          <label>
            {SIDE_LABEL[other]}から
            <select value={targetValue(draft.target)} onChange={(e) => setDraft({ ...draft, target: parseTargetValue(e.target.value) })}>
              <option value={NO_TARGET}>差し引かない（除外）</option>
              <option value={UNASSIGNED}>カテゴリーを指定せずに差し引く（相殺）</option>
              {categories[other].map((cat) => (
                // カテゴリー全体を除外している先へ差し引くと、除外と同じになるので選べない
                <option key={cat} value={targetValue({ category: cat })} disabled={excluded.has(cat)}>
                  「{cat || '（空欄）'}」{excluded.has(cat) ? '（除外中）' : 'から差し引く（相殺）'}
                </option>
              ))}
            </select>
          </label>
        </div>
        {/* 保存される内容。文章で説明する代わりに、3. に並ぶバッジと同じものを見せる */}
        <div className="editor-row rule-preview">
          <span className="badge-rule">
            {KIND_LABEL[kind]}｜{SIDE_LABEL[c.side]}｜{ruleLabel({ ...draft, when })}
          </span>
          <span className="small">
            {effect.count}件・{yen(effect.total)}
          </span>
          {effect.changedCount < effect.count && (
            <span className="muted small">
              （変わるのは {effect.changedCount}件・{yen(effect.changedTotal)}）
            </span>
          )}
        </div>
        <div className="editor-row">
          <button
            disabled={!hasCriteria(when)}
            onClick={() => {
              onSave({ ...draft, when }, id)
              close()
            }}
          >
            保存
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

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (value: T) => void }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map(([key, label]) => (
        <button key={key} role="radio" aria-checked={value === key} className={value === key ? 'active' : undefined} onClick={() => onChange(key)}>
          {label}
        </button>
      ))}
    </div>
  )
}

interface TableProps {
  rows: Transaction[]
  sort: Sort
  toggleSort: (key: SortKey) => void
  /** 1件ずつ選ぶ画面か（＋ / − の列を出し、行を押すと選ぶ・外す） */
  picking: boolean
  picked: Set<string>
  toggle: (keys: string[], on: boolean) => void
  outcomes: Map<Transaction, ReturnType<typeof outcomeOf>>
  /** この条件を足しても変わらない記録か（薄く出す。選べないが、すでに選んでいれば外せる） */
  locked: (t: Transaction) => boolean
}

/** 記録の一覧。右端に今の加工で起きていることを出す */
function RecordTable({ rows, sort, toggleSort, picking, picked, toggle, outcomes, locked }: TableProps) {
  const processed = (t: Transaction) => {
    const o = outcomes.get(t)
    if (!o || o.kind === 'keep') return ''
    if (o.kind === 'exclude') return '除外'
    return o.moved ? `相殺 →「${o.target || '（空欄）'}」` : `除外（「${o.target || '（空欄）'}」が除外中）`
  }
  return (
    <div className="results-scroll">
      <table>
        <thead>
          <tr>
            {picking && <th />}
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
          {rows.map((t) => {
            const key = recordKey(t)
            const on = picked.has(key)
            const off = locked(t) && !(picking && on)
            const pickable = picking && !off
            return (
              <tr key={t.id} className={[picking && on ? 'picked-row' : '', off ? 'locked-row' : '', pickable ? 'pickable' : ''].join(' ')} onClick={() => pickable && toggle([key], !on)}>
                {picking && (
                  <td>
                    <button className="pick-button" disabled={off} aria-label={on ? '外す' : '選ぶ'}>
                      {on ? '−' : '＋'}
                    </button>
                  </td>
                )}
                <td className="num">{t.date}</td>
                <td className="num">{yen(t.amount)}</td>
                <td>{t.category || '（空欄）'}</td>
                <td className="results-memo">{t.memo}</td>
                <td className="muted small">{processed(t)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
