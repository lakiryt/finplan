import type { ReactNode } from 'react'
import { hasCriteria, KINDS, kindOf, type Kind, type ProcessingConfig, type Rule } from '../domain/processing'
import type { Side } from '../domain/raw'
import { InfoTip } from './InfoTip'
import { ExcludeInfo, OffsetInfo } from './ProcessingInfo'
import { describeRule, KIND_LABEL, SIDE_LABEL, type RecordsRequest, type RuleDraft } from './ruleText'

interface Props {
  config: ProcessingConfig
  onChange: (config: ProcessingConfig) => void
  /** 記録の画面を開く（条件の追加・編集） */
  onOpen: (request: RecordsRequest) => void
}

const SIDES: Side[] = ['expense', 'income']
const INFO: Record<Kind, ReactNode> = { offset: <OffsetInfo />, exclude: <ExcludeInfo /> }
/** 区分ごとの一般的な例 */
const EXAMPLES: Record<Side, Record<Kind, string>> = {
  expense: { offset: '例: 家賃など、生活費の範囲から外すものを収入から差し引く', exclude: '例: 積立・投資・貯金への移動' },
  income: { offset: '例: 割り勘の回収・返金を、立て替えた支出から差し引く', exclude: '例: 貯金・証券口座からの引き出し' },
}

const draftOf = (r: Rule): RuleDraft => ({ enabled: r.enabled, when: r.when, target: r.target })

/**
 * 3. の加工。条件は1種類で、反対側から差し引く先を選べば相殺、選ばなければ除外になる。
 * 表示は「どちらの側から・相殺か除外か」の4つに分けて、条件をバッジとして並べる（相殺が原則なので左に置く）
 */
export function ProcessingCards({ config, onChange, onOpen }: Props) {
  return (
    <>
      <div className="row">
        <button onClick={() => onOpen({ draft: { enabled: true, when: { side: 'expense' }, target: null } })}>＋ 条件を追加</button>
        <span className="muted small">条件に当たる記録をその側から除きます。反対側のカテゴリーを選ぶと、そこからも同じ額を差し引きます（相殺。収支は変わりません）。選ばなければ除くだけです（除外）。</span>
      </div>
      <div className="steps">
        {SIDES.map((side) =>
          KINDS.map((kind) => {
            const rules = config.rules.filter((r) => r.when.side === side && kindOf(r) === kind)
            const enabled = config.enabled[side][kind]
            const active = rules.filter((r) => r.enabled && hasCriteria(r.when)).length
            const title = `${SIDE_LABEL[side]}側からの${KIND_LABEL[kind]}`
            return (
              <div key={`${side}-${kind}`} className={`card step ${enabled ? '' : 'off'}`}>
                <div className="card-head">
                  <label>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => onChange({ ...config, enabled: { ...config.enabled, [side]: { ...config.enabled[side], [kind]: e.target.checked } } })}
                    />
                    <strong>{title}</strong>
                  </label>
                  <InfoTip label={KIND_LABEL[kind]}>{INFO[kind]}</InfoTip>
                  <span className="muted small">
                    {active}件{active < rules.length ? `（無効${rules.length - active}件）` : ''}
                  </span>
                </div>
                <fieldset className="card-body" disabled={!enabled}>
                  <p className="muted small">{EXAMPLES[side][kind]}</p>
                  <div className="badges">
                    {rules.map((r) => (
                      <button
                        key={r.id}
                        className={`badge-rule ${r.enabled && hasCriteria(r.when) ? '' : 'off'}`}
                        onClick={() => onOpen({ draft: draftOf(r), id: r.id })}
                        title={r.enabled ? '押すと編集できます' : '無効の条件（押すと編集できます）'}
                      >
                        {describeRule(draftOf(r))}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
            )
          }),
        )}
      </div>
    </>
  )
}
