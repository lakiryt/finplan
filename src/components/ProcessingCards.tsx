import { useMemo, type ReactNode } from 'react'
import { updateModule, type ExcludeModule, type ModulePatch, type OffsetModule, type ProcessingConfig } from '../domain/processing'
import { categoryTotals, rankByTotal } from '../domain/raw'
import type { Transaction } from '../domain/types'
import { yen } from './format'
import { InfoTip } from './InfoTip'
import { OffsetInfo, RealIncomeExpenseInfo } from './ProcessingInfo'

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

  return (
    <div className="cards">
      {config.modules.map((m) =>
        m.type === 'offset' ? (
          <OffsetCard key={m.id} module={m} totals={totals} update={(p) => update(m.id, p)} />
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

const EXCLUDE_TEXT = {
  excludeIncome: {
    title: '実収入',
    side: 'income',
    description: '収入から除くカテゴリーを選びます（貯金の引き出し・ポイント・臨時収入など、ふだんの稼ぎではないもの）。',
    example: '例: 給与20万円と、貯金からの引き出し3万円があった月 → 実収入は20万円です。',
  },
  excludeExpense: {
    title: '実支出',
    side: 'expense',
    description: '支出から除くカテゴリーを選びます（貯金・投資など、使ったのではなく置き場所を移しただけのお金）。',
    example: '例: 食費5万円と、証券口座への積立3万円があった月 → 実支出は5万円です。',
  },
} as const

/** 実収入・実支出のカード。除くカテゴリーを選ぶ */
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
      info={<RealIncomeExpenseInfo example={text.example} />}
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

/** 相殺のカード。収入側のカテゴリーごとに、差し引く支出側のカテゴリーを選ぶ */
function OffsetCard({ module: m, totals, update }: { module: OffsetModule; totals: Totals; update: (patch: ModulePatch) => void }) {
  const pairOf = new Map(m.pairs.map((p) => [p.from, p]))
  const active = m.pairs.filter((p) => p.to)
  const offsetTotal = active.reduce((s, p) => s + (totals.income.get(p.from) ?? 0), 0)
  const targets = rankByTotal(totals.expense)
  const setPair = (from: string, next: { to: string } | null) =>
    update({ pairs: next ? [...m.pairs.filter((p) => p.from !== from), { from, to: next.to }] : m.pairs.filter((p) => p.from !== from) })

  return (
    <Card
      title="相殺"
      enabled={m.enabled}
      onToggle={(enabled) => update({ enabled })}
      info={<OffsetInfo />}
      summary={`${active.length}件を支出から差し引く（全期間で${yen(offsetTotal)}）`}
    >
      <p className="muted small">支出を打ち消すお金（割り勘の回収・立替の戻り・ポイントなど）を選び、どの支出から差し引くかを選びます。</p>
      <div className="card-options">
        {optionsFor(
          totals.income,
          m.pairs.map((p) => p.from),
        ).map((c) => {
          const pair = pairOf.get(c)
          return (
            <div key={c} className="card-option offset-option">
              <input type="checkbox" checked={Boolean(pair)} onChange={(e) => setPair(c, e.target.checked ? { to: '' } : null)} aria-label={`${c}を相殺する`} />
              <span>{c || '（空欄）'}</span>
              <span className="muted small num">{amountLabel(totals.income, c)}</span>
              {pair && (
                <label className="offset-target">
                  →
                  <select value={pair.to} onChange={(e) => setPair(c, { to: e.target.value })}>
                    <option value="">差し引く支出を選ぶ</option>
                    {targets.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  から差し引く
                </label>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
