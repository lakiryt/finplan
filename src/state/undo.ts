import { useCallback, useEffect, useRef, useState } from 'react'

/** 覚えておく手数 */
const LIMIT = 30
/** この時間内に続いた変更は1手にまとめる（名前の入力など） */
const MERGE_MS = 600

/**
 * 値の変更を元に戻せるようにする。set で変えた値の、直前の状態を最大 LIMIT 手まで覚える。
 * Ctrl+Z / ⌘Z でも戻せる（文字の入力中はブラウザ標準の取り消しを優先する）
 */
export function useUndoable<T>(value: T, setValue: (value: T) => void) {
  const [past, setPast] = useState<T[]>([])
  const lastPush = useRef(0)

  const set = useCallback(
    (next: T) => {
      const now = Date.now()
      if (now - lastPush.current > MERGE_MS) setPast((p) => [...p.slice(-(LIMIT - 1)), value])
      lastPush.current = now
      setValue(next)
    },
    [value, setValue],
  )

  const undo = useCallback(() => {
    if (!past.length) return
    setValue(past[past.length - 1])
    setPast(past.slice(0, -1))
    lastPush.current = 0
  }, [past, setValue])

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

  return { set, undo, canUndo: past.length > 0, steps: past.length }
}
