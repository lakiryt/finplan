import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'

/** 覚えておく手数 */
const LIMIT = 30

/** 編集のまとまり（窓が開いている間など）を伝える。begin から end までの変更は元に戻すの1手になる */
export interface UndoSession {
  begin: () => void
  end: () => void
}

/** 窓の部品（Popover）が開閉を伝えるための入口。無ければ何もしない */
export const UndoSessionContext = createContext<UndoSession | null>(null)

/**
 * 値の変更を元に戻せるようにする。set で変えた値の、直前の状態を最大 LIMIT 手まで覚える。
 * begin〜end の間の変更はすぐ反映するが、履歴には始まる前の状態を1回だけ記録する。
 * Ctrl+Z / ⌘Z でも戻せる（文字の入力中はブラウザ標準の取り消しを優先する）
 */
export function useUndoable<T>(value: T, setValue: (value: T) => void) {
  const [past, setPast] = useState<T[]>([])
  /** まとまりの入れ子の深さと、このまとまりで記録済みか */
  const session = useRef({ depth: 0, recorded: false })

  const set = useCallback(
    (next: T) => {
      const s = session.current
      if (s.depth === 0 || !s.recorded) setPast((p) => [...p.slice(-(LIMIT - 1)), value])
      if (s.depth > 0) s.recorded = true
      setValue(next)
    },
    [value, setValue],
  )

  const undo = useCallback(() => {
    if (!past.length) return
    setValue(past[past.length - 1])
    setPast(past.slice(0, -1))
    // まとまりの途中で戻した場合、その後の変更は新しい1手として記録する
    session.current.recorded = false
  }, [past, setValue])

  const sessionApi = useMemo<UndoSession>(
    () => ({
      begin: () => {
        if (session.current.depth++ === 0) session.current.recorded = false
      },
      end: () => {
        session.current.depth = Math.max(0, session.current.depth - 1)
      },
    }),
    [],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'z' || !(e.ctrlKey || e.metaKey) || e.shiftKey) return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      e.preventDefault()
      undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo])

  return { set, undo, canUndo: past.length > 0, steps: past.length, session: sessionApi }
}
