import { useMemo, useState, type ReactNode } from 'react'
import { hasCriteria, type ExcludeRule, type OffsetRule, type ProcessingConfig, type Step } from '../domain/processing'
import { categoryTotals, rankByTotal, type Side } from '../domain/raw'
import type { Transaction } from '../domain/types'
import { ConditionDialog } from './ConditionDialog'
import { describeRule, type RuleDraft } from './ruleText'
import { InfoTip } from './InfoTip'
import { ExcludeInfo, OffsetInfo } from './ProcessingInfo'

interface Props {
  config: ProcessingConfig
  onChange: (config: ProcessingConfig) => void
  /** 加工する前の全取引（選べるカテゴリーと、条件に当たる記録を出すため） */
  transactions: Transaction[]
}

const uid = () => crypto.randomUUID()

/**
 * 3. の加工。工程ごとのカードに、条件をバッジとして並べる。
 * 相殺が原則なので先に置き、相手方が家計簿の外にあるもの（積立など）だけを除外で除く
 */
export function ProcessingCards({ config, onChange, transactions }: Props) {
  const categories = useMemo<Record<Side, string[]>>(
    () => ({ income: rankByTotal(categoryTotals(transactions, 'income')), expense: rankByTotal(categoryTotals(transactions, 'expense')) }),
    [transactions],
  )

  return (
    <div className="steps">
      <StepCard
        kind="offset"
        title="相殺"
        info={<OffsetInfo />}
        description="条件に当たる記録をその側から除き、反対側からも同じ額を差し引きます（収支は変わりません）。まずこちらで打ち消せるものを打ち消します。"
        step={config.offset}
        onChange={(offset) => onChange({ ...config, offset })}
        categories={categories}
        transactions={transactions}
        toRule={(d, id): OffsetRule => ({ id, enabled: d.enabled, when: d.when, target: d.target ?? '' })}
      />
      <StepCard
        kind="exclude"
        title="除外"
        info={<ExcludeInfo />}
        description="相手方が家計簿の外にあるもの（積立・貯金の引き出しなど）を、その側から除きます。"
        step={config.exclude}
        onChange={(exclude) => onChange({ ...config, exclude })}
        categories={categories}
        transactions={transactions}
        toRule={(d, id): ExcludeRule => ({ id, enabled: d.enabled, when: d.when })}
      />
    </div>
  )
}

interface StepProps<R extends ExcludeRule | OffsetRule> {
  kind: 'exclude' | 'offset'
  title: string
  info: ReactNode
  description: string
  step: Step<R>
  onChange: (step: Step<R>) => void
  categories: Record<Side, string[]>
  transactions: Transaction[]
  toRule: (draft: RuleDraft, id: string) => R
}

/** 工程のカード。見出しのチェックで工程ごと有効・無効を切り替え、無効のときは見出し以外を薄くする */
function StepCard<R extends ExcludeRule | OffsetRule>(props: StepProps<R>) {
  const { kind, title, info, description, step, onChange, categories, transactions, toRule } = props
  // 編集中の条件（id が無ければ新しく足す条件）。条件の編集はモーダルで行う
  const [editing, setEditing] = useState<{ draft: RuleDraft; id?: string } | null>(null)
  const draftOf = (r: R): RuleDraft => ({ enabled: r.enabled, when: r.when, target: 'target' in r ? r.target : undefined })
  const fresh: RuleDraft = { enabled: true, when: { side: 'expense' }, target: kind === 'offset' ? '' : undefined }
  const active = step.rules.filter((r) => r.enabled && hasCriteria(r.when)).length

  const save = (d: RuleDraft) => {
    const id = editing?.id
    onChange({ ...step, rules: id ? step.rules.map((x) => (x.id === id ? toRule(d, id) : x)) : [...step.rules, toRule(d, uid())] })
  }

  return (
    <div className={`card step ${step.enabled ? '' : 'off'}`}>
      <div className="card-head">
        <label>
          <input type="checkbox" checked={step.enabled} onChange={(e) => onChange({ ...step, enabled: e.target.checked })} />
          <strong>{title}</strong>
        </label>
        <InfoTip label={title}>{info}</InfoTip>
        <span className="muted small">
          {active}件の条件{active < step.rules.length ? `（無効${step.rules.length - active}件）` : ''}
        </span>
      </div>
      <fieldset className="card-body" disabled={!step.enabled}>
        <p className="muted small">{description}</p>
        <div className="badges">
          {step.rules.map((r) => (
            <button
              key={r.id}
              className={`badge-rule ${r.enabled && hasCriteria(r.when) ? '' : 'off'}`}
              onClick={() => setEditing({ draft: draftOf(r), id: r.id })}
              title={r.enabled ? '押すと編集できます' : '無効の条件（押すと編集できます）'}
            >
              {describeRule(draftOf(r))}
            </button>
          ))}
          <button className="badge-add" onClick={() => setEditing({ draft: fresh })}>
            ＋ 条件を追加
          </button>
        </div>
      </fieldset>
      <ConditionDialog
        kind={kind}
        initial={editing?.draft ?? null}
        editing={Boolean(editing?.id)}
        categories={categories}
        transactions={transactions}
        onSave={save}
        onDelete={() => editing?.id && onChange({ ...step, rules: step.rules.filter((x) => x.id !== editing.id) })}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}
