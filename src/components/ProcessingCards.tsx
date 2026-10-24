import { useMemo } from 'react'
import { updateModule, type ProcessingConfig, type ProcessingModule } from '../domain/processing'
import { categoryTotals } from '../domain/raw'
import type { Transaction } from '../domain/types'
import { yen } from './format'

interface Props {
  config: ProcessingConfig
  onChange: (config: ProcessingConfig) => void
  /** 加工する前の全取引（選べるカテゴリーと金額の目安を出すため） */
  transactions: Transaction[]
}

/** カードの種類ごとの見出しと説明 */
const INFO: Record<ProcessingModule['type'], { title: string; description: string; sign: 'income' | 'expense' }> = {
  excludeIncome: {
    title: '実収入',
    description: '収入から除くカテゴリーを選びます（口座からの引き出し・割り勘の回収・ポイントなど、実際の収入ではないもの）。',
    sign: 'income',
  },
  excludeExpense: {
    title: '実支出',
    description: '支出から除くカテゴリーを選びます（貯金・投資・口座間の移動など、使ったお金ではないもの）。',
    sign: 'expense',
  },
}

/** 3. の加工のカード。見出しのチェックで有効・無効を切り替え、有効なカードが 2. に反映される */
export function ProcessingCards({ config, onChange, transactions }: Props) {
  // カテゴリーごとの収入・支出の合計（全データ）
  const totals = useMemo(() => ({ income: categoryTotals(transactions, 'income'), expense: categoryTotals(transactions, 'expense') }), [transactions])

  return (
    <div className="cards">
      {config.modules.map((m) => {
        const info = INFO[m.type]
        const amounts = totals[info.sign]
        // データにあるカテゴリーを金額の多い順に。設定にだけあるもの（今のデータに無い）も後ろに出す
        const options = [...amounts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c)
        for (const c of m.categories) if (!amounts.has(c)) options.push(c)
        const excludedTotal = m.categories.reduce((s, c) => s + (amounts.get(c) ?? 0), 0)
        const toggle = (category: string, on: boolean) =>
          onChange(updateModule(config, m.id, { categories: on ? [...m.categories, category] : m.categories.filter((c) => c !== category) }))

        return (
          <div key={m.id} className={`card ${m.enabled ? '' : 'off'}`}>
            <label className="card-head">
              <input type="checkbox" checked={m.enabled} onChange={(e) => onChange(updateModule(config, m.id, { enabled: e.target.checked }))} />
              <strong>{info.title}</strong>
              <span className="muted small">
                {m.categories.length}件を除く（全期間で{yen(excludedTotal)}）
              </span>
            </label>
            <fieldset className="card-body" disabled={!m.enabled}>
              <p className="muted small">{info.description}</p>
              <div className="card-options">
                {options.map((c) => (
                  <label key={c} className="card-option">
                    <input type="checkbox" checked={m.categories.includes(c)} onChange={(e) => toggle(c, e.target.checked)} />
                    <span>{c || '（空欄）'}</span>
                    <span className="muted small num">{amounts.has(c) ? yen(amounts.get(c)!) : 'データに無し'}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        )
      })}
    </div>
  )
}
