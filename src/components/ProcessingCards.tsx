import { useMemo, type ReactNode } from 'react'
import { hasCriteria, type ExcludeRule, type OffsetRule, type ProcessingConfig, type Step } from '../domain/processing'
import { categoryTotals, rankByTotal, type Side } from '../domain/raw'
import type { Transaction } from '../domain/types'
import { ConditionEditor } from './ConditionEditor'
import { describeRule, type RuleDraft } from './ruleText'
import { InfoTip } from './InfoTip'
import { Popover } from './Popover'
import { ExcludeInfo, OffsetInfo } from './ProcessingInfo'

interface Props {
  config: ProcessingConfig
  onChange: (config: ProcessingConfig) => void
  /** 加工する前の全取引（選べるカテゴリーと、条件に当たる記録を出すため） */
  transactions: Transaction[]
}

const uid = () => crypto.randomUUID()

/** 3. の加工。工程（除外・相殺）ごとのカードに、条件をバッジとして並べる */
export function ProcessingCards({ config, onChange, transactions }: Props) {
  const categories = useMemo<Record<Side, string[]>>(
    () => ({ income: rankByTotal(categoryTotals(transactions, 'income')), expense: rankByTotal(categoryTotals(transactions, 'expense')) }),
    [transactions],
  )

  return (
    <div className="steps">
      <StepCard
        kind="exclude"
        title="除外"
        info={<ExcludeInfo />}
        description="条件に当たる記録を、その側（収入か支出）から除きます。"
        step={config.exclude}
        onChange={(exclude) => onChange({ ...config, exclude })}
        categories={categories}
        transactions={transactions}
        toRule={(d, id): ExcludeRule => ({ id, enabled: d.enabled, when: d.when })}
      />
      <StepCard
        kind="offset"
        title="相殺"
        info={<OffsetInfo />}
        description="条件に当たる記録をその側から除き、反対側からも同じ額を差し引きます（収支は変わりません）。"
        step={config.offset}
        onChange={(offset) => onChange({ ...config, offset })}
        categories={categories}
        transactions={transactions}
        toRule={(d, id): OffsetRule => ({ id, enabled: d.enabled, when: d.when, target: d.target ?? '' })}
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
  const draftOf = (r: R): RuleDraft => ({ enabled: r.enabled, when: r.when, target: 'target' in r ? r.target : undefined })
  const fresh: RuleDraft = { enabled: true, when: { side: 'expense' }, target: kind === 'offset' ? '' : undefined }
  const active = step.rules.filter((r) => r.enabled && hasCriteria(r.when)).length
  const editor = (initial: RuleDraft, save: (d: RuleDraft) => void, close: () => void, onDelete?: () => void) => (
    <ConditionEditor kind={kind} initial={initial} categories={categories} transactions={transactions} onSave={save} onDelete={onDelete} close={close} />
  )

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
            <Popover
              key={r.id}
              trigger={(toggle) => (
                <button
                  className={`badge-rule ${r.enabled && hasCriteria(r.when) ? '' : 'off'}`}
                  onClick={toggle}
                  title={r.enabled ? '押すと編集できます' : '無効の条件（押すと編集できます）'}
                >
                  {describeRule(draftOf(r))}
                </button>
              )}
            >
              {(close) =>
                editor(
                  draftOf(r),
                  (d) => onChange({ ...step, rules: step.rules.map((x) => (x.id === r.id ? toRule(d, r.id) : x)) }),
                  close,
                  () => onChange({ ...step, rules: step.rules.filter((x) => x.id !== r.id) }),
                )
              }
            </Popover>
          ))}
          <Popover
            trigger={(toggle) => (
              <button className="badge-add" onClick={toggle}>
                ＋ 条件を追加
              </button>
            )}
          >
            {(close) => editor(fresh, (d) => onChange({ ...step, rules: [...step.rules, toRule(d, uid())] }), close)}
          </Popover>
        </div>
      </fieldset>
    </div>
  )
}
