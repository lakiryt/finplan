import { useMemo, type ReactNode } from 'react'
import {
  setIncomeRule,
  updateModule,
  type ExcludeExpenseModule,
  type IncomeModule,
  type IncomeRule,
  type ModulePatch,
  type ProcessingConfig,
} from '../domain/processing'
import { categoryTotals, rankByTotal } from '../domain/raw'
import type { Transaction } from '../domain/types'
import { yen } from './format'
import { InfoTip } from './InfoTip'
import { RealExpenseInfo, RealIncomeInfo } from './ProcessingInfo'

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
        m.type === 'income' ? (
          <IncomeCard key={m.id} module={m} totals={totals} update={(p) => update(m.id, p)} />
        ) : (
          <ExcludeExpenseCard key={m.id} module={m} totals={totals} update={(p) => update(m.id, p)} />
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

/** 「実収入」のカード。収入側のカテゴリーごとに、残す・除く・相殺を選ぶ */
function IncomeCard({ module: m, totals, update }: { module: IncomeModule; totals: Totals; update: (patch: ModulePatch) => void }) {
  const ruleOf = new Map(m.rules.map((r) => [r.category, r]))
  const excluded = m.rules.filter((r) => r.action === 'exclude')
  const offset = m.rules.filter((r) => r.action === 'offset' && r.to)
  const targets = rankByTotal(totals.expense)
  const setRule = (category: string, rule: IncomeRule | null) => update({ rules: setIncomeRule(m, category, rule) })
  const sum = (rules: IncomeRule[]) => rules.reduce((s, r) => s + (totals.income.get(r.category) ?? 0), 0)

  return (
    <Card
      title="実収入"
      enabled={m.enabled}
      onToggle={(enabled) => update({ enabled })}
      info={<RealIncomeInfo />}
      summary={`除く${excluded.length}件（${yen(sum(excluded))}）・相殺${offset.length}件（${yen(sum(offset))}）`}
    >
      <p className="muted small">
        収入側のカテゴリーごとに、残す（稼いだお金）・除く（管理の外から戻った自分のお金）・相殺（支出の打ち消し）を選びます。
      </p>
      <div className="card-options">
        {optionsFor(
          totals.income,
          m.rules.map((r) => r.category),
        ).map((c) => {
          const rule = ruleOf.get(c)
          const action = rule?.action ?? 'keep'
          return (
            <div key={c} className="card-option income-option">
              <span>{c || '（空欄）'}</span>
              <span className="muted small num">{amountLabel(totals.income, c)}</span>
              <select
                value={action}
                aria-label={`${c}の扱い`}
                onChange={(e) => {
                  const next = e.target.value
                  setRule(c, next === 'exclude' ? { category: c, action: 'exclude' } : next === 'offset' ? { category: c, action: 'offset', to: '' } : null)
                }}
              >
                <option value="keep">残す</option>
                <option value="exclude">除く</option>
                <option value="offset">相殺</option>
              </select>
              {rule?.action === 'offset' && (
                <label className="offset-target">
                  →
                  <select value={rule.to} onChange={(e) => setRule(c, { category: c, action: 'offset', to: e.target.value })}>
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

/** 「実支出」のカード。支出側の「移動」（積立など）のカテゴリーを除く */
function ExcludeExpenseCard({ module: m, totals, update }: { module: ExcludeExpenseModule; totals: Totals; update: (patch: ModulePatch) => void }) {
  const excludedTotal = m.categories.reduce((s, c) => s + (totals.expense.get(c) ?? 0), 0)
  const toggle = (category: string, on: boolean) =>
    update({ categories: on ? [...m.categories, category] : m.categories.filter((c) => c !== category) })

  return (
    <Card
      title="実支出"
      enabled={m.enabled}
      onToggle={(enabled) => update({ enabled })}
      info={<RealExpenseInfo />}
      summary={`${m.categories.length}件を除く（全期間で${yen(excludedTotal)}）`}
    >
      <p className="muted small">支出から除くカテゴリーを選びます（貯金・投資など、使ったのではなく置き場所を移しただけのお金）。</p>
      <div className="card-options">
        {optionsFor(totals.expense, m.categories).map((c) => (
          <label key={c} className="card-option">
            <input type="checkbox" checked={m.categories.includes(c)} onChange={(e) => toggle(c, e.target.checked)} />
            <span>{c || '（空欄）'}</span>
            <span className="muted small num">{amountLabel(totals.expense, c)}</span>
          </label>
        ))}
      </div>
    </Card>
  )
}
