import { useMemo, type ReactNode } from 'react'
import { updateModule, type ExcludeModule, type ModulePatch, type OffsetModule, type ProcessingConfig } from '../domain/processing'
import { categoryTotals, rankByTotal } from '../domain/raw'
import type { Transaction } from '../domain/types'
import { yen } from './format'
import { InfoTip } from './InfoTip'
import { OffsetInfo, RealExpenseInfo, RealIncomeInfo } from './ProcessingInfo'

interface Props {
  config: ProcessingConfig
  onChange: (config: ProcessingConfig) => void
  /** 加工する前の全取引（選べるカテゴリーと金額の目安を出すため） */
  transactions: Transaction[]
}

type Totals = Record<'income' | 'expense', Map<string, number>>

/** 3. の加工のカード。見出しのチェックで有効・無効を切り替え、有効なカードが 2. に反映される */
export function ProcessingCards({ config, onChange, transactions }: Props) {
  // カテゴリーごとの収入・支出の合計（全データ）
  const totals = useMemo<Totals>(
    () => ({ income: categoryTotals(transactions, 'income'), expense: categoryTotals(transactions, 'expense') }),
    [transactions],
  )
  const update = (id: string, patch: ModulePatch) => onChange(updateModule(config, id, patch))
  // 相殺のカードに並べるのは、実収入のカードで除いたカテゴリー
  const incomeCard = config.modules.find((m): m is ExcludeModule => m.type === 'excludeIncome')

  return (
    <div className="cards">
      {config.modules.map((m) =>
        m.type === 'offset' ? (
          <OffsetCard key={m.id} module={m} incomeCard={incomeCard} totals={totals} update={(p) => update(m.id, p)} />
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

/** 実収入と実支出は同じ形のカードにする（除くカテゴリーにチェックを入れる） */
const EXCLUDE_TEXT = {
  excludeIncome: {
    title: '実収入',
    side: 'income',
    description: '収入から除くカテゴリーを選びます（貯金の引き出し・臨時収入・割り勘の回収など、ふだんの稼ぎではないもの）。',
    info: <RealIncomeInfo />,
  },
  excludeExpense: {
    title: '実支出',
    side: 'expense',
    description: '支出から除くカテゴリーを選びます（貯金・投資など、使ったのではなく置き場所を移しただけのお金）。',
    info: <RealExpenseInfo />,
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
      title={text.title}
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

/** 相殺のカード。実収入のカードで除いたカテゴリーごとに、支出からも差し引くか（どの支出から）を選ぶ */
function OffsetCard({
  module: m,
  incomeCard,
  totals,
  update,
}: {
  module: OffsetModule
  incomeCard: ExcludeModule | undefined
  totals: Totals
  update: (patch: ModulePatch) => void
}) {
  const candidates = incomeCard?.categories ?? []
  const pairOf = new Map(m.pairs.map((p) => [p.from, p]))
  const active = candidates.filter((c) => pairOf.get(c)?.enabled && pairOf.get(c)?.to)
  const offsetTotal = active.reduce((s, c) => s + (totals.income.get(c) ?? 0), 0)
  const targets = rankByTotal(totals.expense)
  // チェックを外しても差し引く先は覚えておく（もう一度チェックしたときに戻る）
  const setPair = (from: string, patch: { enabled?: boolean; to?: string }) => {
    const current = pairOf.get(from) ?? { from, enabled: false, to: '' }
    update({ pairs: [...m.pairs.filter((p) => p.from !== from), { ...current, ...patch }] })
  }

  return (
    <Card
      title="相殺"
      enabled={m.enabled}
      onToggle={(enabled) => update({ enabled })}
      info={<OffsetInfo />}
      summary={`${active.length}件を支出から差し引く（全期間で${yen(offsetTotal)}）`}
    >
      <p className="muted small">実収入から除いたもののうち、支出の打ち消しにあたるもの（割り勘の回収・返金・ポイントなど）にチェックを入れ、どの支出から差し引くかを選びます。</p>
      {!incomeCard?.enabled && <p className="small warn-text">実収入のカードが無効なので、相殺も反映されません。</p>}
      {candidates.length === 0 ? (
        <p className="muted small">実収入のカードで除くカテゴリーを選ぶと、ここに並びます。</p>
      ) : (
        <div className="card-options">
          {candidates.map((c) => {
            const pair = pairOf.get(c)
            const on = Boolean(pair?.enabled)
            return (
              <div key={c} className="card-option offset-option">
                <input type="checkbox" checked={on} onChange={(e) => setPair(c, { enabled: e.target.checked })} aria-label={`${c}を支出から差し引く`} />
                <span>{c || '（空欄）'}</span>
                <span className="muted small num">{amountLabel(totals.income, c)}</span>
                <select value={pair?.to ?? ''} disabled={!on} onChange={(e) => setPair(c, { to: e.target.value })} aria-label={`${c}を差し引く支出`}>
                  <option value="">差し引く支出を選ぶ</option>
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
    </Card>
  )
}
