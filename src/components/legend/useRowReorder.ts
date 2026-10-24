import { useState, type DragEvent } from 'react'

/** 動かした行を目立たせておく時間 */
const HIGHLIGHT_MS = 1200

/**
 * 左のつまみで行をドラッグして並べ替える。つまみを押している間だけ行をドラッグできるようにする
 * （行全体を常にドラッグできると、行の中のボタンや入力欄が使いにくいため）。
 * 動かした行はしばらく目立たせ、どこへ行ったか分かるようにする
 */
export function useRowReorder(categories: string[], onMove: (moving: string, target: string) => void) {
  const [armed, setArmed] = useState<string>()
  const [dragging, setDragging] = useState<string>()
  const [over, setOver] = useState<string>()
  const [justMoved, setJustMoved] = useState<string>()

  const end = () => {
    setArmed(undefined)
    setDragging(undefined)
    setOver(undefined)
  }

  /** つまみのセルに付ける */
  const handleProps = (category: string) => ({
    onMouseDown: () => setArmed(category),
    onMouseUp: () => setArmed(undefined),
  })

  /** 行（tr）に付ける */
  const rowProps = (category: string) => ({
    draggable: armed === category,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', category)
      setDragging(category)
    },
    onDragEnd: end,
    onDragOver: (e: DragEvent) => {
      if (!dragging) return
      e.preventDefault()
      setOver(category)
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      if (dragging && dragging !== category) {
        onMove(dragging, category)
        const moved = dragging
        setJustMoved(moved)
        window.setTimeout(() => setJustMoved((cur) => (cur === moved ? undefined : cur)), HIGHLIGHT_MS)
      }
      end()
    },
  })

  /** 行の見た目（落とす位置の線・ドラッグ中・動かした直後） */
  const rowClass = (category: string) => {
    const classes = []
    if (dragging && over === category && dragging !== category) {
      classes.push(categories.indexOf(dragging) < categories.indexOf(category) ? 'drop-after' : 'drop-before')
    }
    if (dragging === category) classes.push('dragging')
    if (justMoved === category) classes.push('just-moved')
    return classes.join(' ')
  }

  return { handleProps, rowProps, rowClass }
}
