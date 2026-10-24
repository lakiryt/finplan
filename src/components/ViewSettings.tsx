import type { SuperCategory, ViewConfig } from '../domain/view'

interface Props {
  view: ViewConfig
  onChange: (view: ViewConfig) => void
  onReset: () => void
  /** CSVにあるカテゴリー名 */
  categories: string[]
}

export function ViewSettings({ view, onChange, onReset, categories }: Props) {
  const assigned = new Set(view.superCategories.flatMap((s) => s.members))
  const unassigned = categories.filter((c) => !assigned.has(c))

  const updateSuper = (id: string, patch: Partial<SuperCategory>) =>
    onChange({ ...view, superCategories: view.superCategories.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
  const addSuper = () =>
    onChange({
      ...view,
      useSuperCategories: true,
      superCategories: [...view.superCategories, { id: crypto.randomUUID(), label: '新しいまとめ', members: [] }],
    })
  const removeSuper = (id: string) => onChange({ ...view, superCategories: view.superCategories.filter((s) => s.id !== id) })

  const customColors = Object.keys(view.colors)
  const resetColor = (key: string) => {
    const colors = { ...view.colors }
    delete colors[key]
    onChange({ ...view, colors })
  }

  return (
    <div className="settings">
      <h3>スーパーカテゴリー</h3>
      <p className="muted small">複数のカテゴリーを、グラフと表の上だけで1つにまとめます。集計の加工（分類の設定）には影響しません。</p>
      <div className="rules">
        {view.superCategories.map((s) => (
          <div key={s.id} className="rule">
            <div className="rule-head">
              <input className="rule-label" value={s.label} onChange={(e) => updateSuper(s.id, { label: e.target.value })} />
              <button onClick={() => removeSuper(s.id)}>削除</button>
            </div>
            <div className="rule-line">
              {s.members.map((m) => (
                <span key={m} className="chip">
                  {m}
                  {!categories.includes(m) && <span className="muted">（データに無し）</span>}
                  <button title="外す" onClick={() => updateSuper(s.id, { members: s.members.filter((x) => x !== m) })}>
                    ×
                  </button>
                </span>
              ))}
              <select
                value=""
                onChange={(e) => e.target.value && updateSuper(s.id, { members: [...s.members, e.target.value] })}
              >
                <option value="">カテゴリーを追加…</option>
                {unassigned.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>
      <div className="row">
        <button onClick={addSuper}>スーパーカテゴリーを追加</button>
      </div>

      <h3>選んだ色</h3>
      {customColors.length === 0 ? (
        <p className="muted small">凡例や表の色見本を押すと、色を選べます。</p>
      ) : (
        <div className="row">
          {customColors.map((key) => (
            <span key={key} className="chip">
              <span className="swatch" style={{ background: view.colors[key] }} />
              {key}
              <button title="初期の色に戻す" onClick={() => resetColor(key)}>
                ×
              </button>
            </span>
          ))}
          <button onClick={() => onChange({ ...view, colors: {} })}>すべての色を初期に戻す</button>
        </div>
      )}

      <div className="row">
        <button onClick={() => confirm('表示の設定を初期状態に戻しますか？') && onReset()}>表示の設定を初期に戻す</button>
      </div>
    </div>
  )
}
