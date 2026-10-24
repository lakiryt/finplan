import { useMemo, type ReactNode } from 'react'
import { updateModule, type ExcludeModule, type ModulePatch, type OffsetModule, type OffsetPair, type ProcessingConfig } from '../domain/processing'
import { categoryTotals, rankByTotal, type Side } from '../domain/raw'
import type { Transaction } from '../domain/types'
import { yen } from './format'
import { InfoTip } from './InfoTip'
import { ExcludeExpenseInfo, ExcludeIncomeInfo, OffsetInfo } from './ProcessingInfo'

interface Props {
  config: ProcessingConfig
  onChange: (config: ProcessingConfig) => void
  /** 加工する前の全取引（選べるカテゴリーと金額の目安を出すため） */
  transactions: Transaction[]
}

type Totals = Record<Side, Map<string, number>>

const SIDE_LABEL: Record<Side, string> = { income: '収入', expense: '支出' }

/** 3. の加工のカード。見出しのチェックで有効・無効を切り替え、有効なカードが 2. に反映される */
export function ProcessingCards({ config, onChange, transactions }: Props) {
  // カテゴリーごとの収入・支出の合計（全データ）
  const totals = useMemo<Totals>(
    () => ({ income: categoryTotals(transactions, 'income'), expense: categoryTotals(transactions, 'expense') }),
    [transactions],
  )
  const update = (id: string, patch: ModulePatch) => onChange(updateModule(config, id, patch))
  // 相殺のカードに並べるのは、両方の「除く」カードで除いたカテゴリー
  const excludeCards: Record<Side, ExcludeModule | undefined> = {
    income: config.modules.find((m): m is ExcludeModule => m.type === 'excludeIncome'),
    expense: config.modules.find((m): m is ExcludeModule => m.type === 'excludeExpense'),
  }

  return (
    <div className="cards">
      {config.modules.map((m) =>
        m.type === 'offset' ? (
          <OffsetCard key={m.id} module={m} excludeCards={excludeCards} totals={totals} update={(p) => update(m.id, p)} />
        ) : (
          <ExcludeCard key={m.id} module={m} totals={totals} update={(p) => update(m.id, p)} />
        ),
      )}
    </div>
  )
}

/** カードの枠。見出しのチェック以外は、無効のとき薄くして操作できなくする */
function Card(props: { title: string; enabled: boolean; onToggle: (on: boolean) => void; info: ReactNode; summary: string; children: ReactNode }) {
  return (
    <div className={`card ${props.enabled ? '' : 'off'}`}>
      <div className="card-head">
        <label>
          <input type="checkbox" checked={props.enabled} onChange={(e) => props.onToggle(e.target.checked)} />
          <strong>{props.title}</strong>
        </label>
        <InfoTip label={props.title}>{props.info}</InfoTip>
        <span className="muted small">{props.summary}</span>
      </div>
      <fieldset className="card-body" disabled={!props.enabled}>
        {props.children}
      </fieldset>
    </div>
  )
}

/** データにあるカテゴリーを金額の多い順に。設定にだけあるもの（今のデータに無い）も後ろに出す */
function optionsFor(amounts: Map<string, number>, selected: string[]): string[] {
  const options = rankByTotal(amounts)
  for (const c of selected) if (!amounts.has(c)) options.push(c)
  return options
}

const amountLabel = (amounts: Map<string, number>, c: string) => (amounts.has(c) ? yen(amounts.get(c)!) : 'データに無し')

/** 収入から除く・支出から除くは同じ形のカードにする（除くカテゴリーにチェックを入れる） */
const EXCLUDE_TEXT = {
  excludeIncome: {
    side: 'income',
    description: '除くカテゴリーを選びます（貯金の引き出し・臨時収入・割り勘の回収など、ふだんの稼ぎではないもの）。',
    info: <ExcludeIncomeInfo />,
  },
  excludeExpense: {
    side: 'expense',
    description: '除くカテゴリーを選びます（貯金・投資など置き場所を移しただけのお金や、生活費の範囲から外したいもの）。',
    info: <ExcludeExpenseInfo />,
  },
} as const

function ExcludeCard({ module: m, totals, update }: { module: ExcludeModule; totals: Totals; update: (patch: ModulePatch) => void }) {
  const text = EXCLUDE_TEXT[m.type]
  const amounts = totals[text.side]
  const excludedTotal = m.categories.reduce((s, c) => s + (amounts.get(c) ?? 0), 0)
  const toggle = (category: string, on: boolean) =>
    update({ categories: on ? [...m.categories, category] : m.categories.filter((c) => c !== category) })

  return (
    <Card
      title={`${SIDE_LABEL[text.side]}から除く`}
      enabled={m.enabled}
      onToggle={(enabled) => update({ enabled })}
      info={text.info}
      summary={`${m.categories.length}件を除く（全期間で${yen(excludedTotal)}）`}
    >
      <p className="muted small">{text.description}</p>
      <div className="card-options">
        {optionsFor(amounts, m.categories).map((c) => (
          <label key={c} className="card-option">
            <input type="checkbox" checked={m.categories.includes(c)} onChange={(e) => toggle(c, e.target.checked)} />
            <span>{c || '（空欄）'}</span>
            <span className="muted small num">{amountLabel(amounts, c)}</span>
          </label>
        ))}
      </div>
    </Card>
  )
}

/** 相殺のカード。両方の「除く」カードで除いたカテゴリーごとに、反対側からも差し引くか（どこから）を選ぶ */
function OffsetCard({
  module: m,
  excludeCards,
  totals,
  update,
}: {
  module: OffsetModule
  excludeCards: Record<Side, ExcludeModule | undefined>
  totals: Totals
  update: (patch: ModulePatch) => void
}) {
  const find = (side: Side, from: string) => m.pairs.find((p) => p.side === side && p.from === from)
  const activeIn = (side: Side) => (excludeCards[side]?.categories ?? []).filter((c) => find(side, c)?.enabled)
  const count = activeIn('income').length + activeIn('expense').length
  // チェックを外しても差し引く先は覚えておく（もう一度チェックしたときに戻る）
  const setPair = (side: Side, from: string, patch: Partial<Pick<OffsetPair, 'enabled' | 'to'>>) => {
    const current = find(side, from) ?? { side, from, enabled: false, to: '' }
    update({ pairs: [...m.pairs.filter((p) => !(p.side === side && p.from === from)), { ...current, ...patch }] })
  }

  return (
    <Card title="相殺" enabled={m.enabled} onToggle={(enabled) => update({ enabled })} info={<OffsetInfo />} summary={`${count}件を反対側から差し引く`}>
      <p className="muted small">
        除いたもののうち、反対側からも差し引くものにチェックを入れます（収支は変わりません）。差し引く先を指定しなければ、反対側の全体から差し引きます。
      </p>
      {(['income', 'expense'] as const).map((side) => (
        <OffsetSection key={side} side={side} card={excludeCards[side]} find={find} setPair={setPair} totals={totals} />
      ))}
    </Card>
  )
}

/** 相殺のカードの片側（収入から除いたもの → 支出から差し引く、または その逆） */
function OffsetSection({
  side,
  card,
  find,
  setPair,
  totals,
}: {
  side: Side
  card: ExcludeModule | undefined
  find: (side: Side, from: string) => OffsetPair | undefined
  setPair: (side: Side, from: string, patch: Partial<Pick<OffsetPair, 'enabled' | 'to'>>) => void
  totals: Totals
}) {
  const other: Side = side === 'income' ? 'expense' : 'income'
  const candidates = card?.categories ?? []
  const targets = rankByTotal(totals[other])

  return (
    <div className="offset-section">
      <div className="offset-section-title">
        {SIDE_LABEL[side]}から除いたもの → {SIDE_LABEL[other]}から差し引く
      </div>
      {candidates.length > 0 && !card?.enabled && <p className="small warn-text">「{SIDE_LABEL[side]}から除く」のカードが無効なので、反映されません。</p>}
      {candidates.length === 0 ? (
        <p className="muted small">「{SIDE_LABEL[side]}から除く」のカードで除くカテゴリーを選ぶと、ここに並びます。</p>
      ) : (
        <div className="card-options">
          {candidates.map((c) => {
            const pair = find(side, c)
            const on = Boolean(pair?.enabled)
            return (
              <div key={c} className="card-option offset-option">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => setPair(side, c, { enabled: e.target.checked })}
                  aria-label={`${c}を${SIDE_LABEL[other]}から差し引く`}
                />
                <span>{c || '（空欄）'}</span>
                <span className="muted small num">{amountLabel(totals[side], c)}</span>
                <select
                  className={pair?.to ? '' : 'unset'}
                  value={pair?.to ?? ''}
                  disabled={!on}
                  onChange={(e) => setPair(side, c, { to: e.target.value })}
                  aria-label={`${c}を差し引く${SIDE_LABEL[other]}`}
                  title={on ? `指定しないと、どのカテゴリーにも付けずに${SIDE_LABEL[other]}全体から差し引きます` : 'チェックを入れると選べます'}
                >
                  {/* 指定しないのも正しい選択肢（反対側の全体から差し引く）なので、警告の色にはせず灰色の文字にする */}
                  <option value="">指定しない</option>
                  {targets.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
