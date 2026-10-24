import { useEffect, useRef, useState } from 'react'
import { superLabel, type SuperCategory } from '../domain/view'

interface Props {
  superCategories: SuperCategory[]
  /** 今入っているスーパーカテゴリーのID */
  value: string | null
  onSelect: (superId: string | null) => void
  /** 新しく作って、このカテゴリーを入れる */
  onCreate: (label: string) => void
  onRename: (superId: string, label: string) => void
  onDelete: (superId: string) => void
}

/** スーパーカテゴリーを選ぶドロップダウン。中で作成・名前の変更・削除もできる */
export function SuperCategorySelect({ superCategories, value, onSelect, onCreate, onRename, onDelete }: Props) {
  const [newLabel, setNewLabel] = useState('')
  const [editing, setEditing] = useState<{ id: string; label: string }>()
  /** 表のスクロール枠で切れないよう、画面に固定した位置に出す */
  const [pos, setPos] = useState<{ top: number; right: number }>()
  const ref = useRef<HTMLDivElement>(null)
  const open = pos !== undefined
  const setOpen = (v: boolean) => {
    const rect = ref.current?.getBoundingClientRect()
    setPos(v && rect ? { top: rect.bottom + 4, right: window.innerWidth - rect.right } : undefined)
  }

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) setPos(undefined)
    }
    document.addEventListener('mousedown', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  const current = superCategories.find((s) => s.id === value)
  const choose = (id: string | null) => {
    onSelect(id)
    setOpen(false)
  }
  const create = () => {
    const label = newLabel.trim()
    if (!label) return
    onCreate(label)
    setNewLabel('')
    setOpen(false)
  }
  const saveRename = () => {
    if (editing?.label.trim()) onRename(editing.id, editing.label.trim())
    setEditing(undefined)
  }

  return (
    <div className="super-select" ref={ref}>
      <button className={current ? '' : 'muted'} onClick={() => setOpen(!open)}>
        {current ? superLabel(current) : '—'} ▾
      </button>
      {open && (
        <div className="popover" style={{ top: pos.top, right: Math.max(8, pos.right) }}>
          <button className={`popover-item ${value === null ? 'selected' : ''}`} onClick={() => choose(null)}>
            まとめない
          </button>
          {superCategories.map((s) =>
            editing?.id === s.id ? (
              <div key={s.id} className="popover-row">
                <input
                  autoFocus
                  value={editing.label}
                  onChange={(e) => setEditing({ id: s.id, label: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveRename()
                    if (e.key === 'Escape') setEditing(undefined)
                  }}
                />
                <button onClick={saveRename}>保存</button>
              </div>
            ) : (
              <div key={s.id} className="popover-row">
                <button className={`popover-item ${value === s.id ? 'selected' : ''}`} onClick={() => choose(s.id)}>
                  {superLabel(s)}
                  <span className="muted small"> {s.members.length}件</span>
                </button>
                <button title="名前を変える" onClick={() => setEditing({ id: s.id, label: s.label })}>
                  ✎
                </button>
                <button
                  title="削除"
                  onClick={() => confirm(`「${superLabel(s)}」を削除しますか？（中のカテゴリーはまとめない状態に戻ります）`) && onDelete(s.id)}
                >
                  ×
                </button>
              </div>
            ),
          )}
          <div className="popover-row new">
            <input
              placeholder="新しいスーパーカテゴリー"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
            />
            <button onClick={create} disabled={!newLabel.trim()}>
              作って入れる
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
