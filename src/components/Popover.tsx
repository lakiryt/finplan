import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'

/**
 * ボタンの下に出る小さな窓。表のスクロール枠で切れないよう、画面に固定した位置に出す。
 * 外側を押す・スクロールする・画面の大きさが変わると閉じる
 */
export function Popover({
  trigger,
  children,
  className,
}: {
  /** toggle はボタンの onClick に渡す */
  trigger: (toggle: (e: MouseEvent<HTMLElement>) => void) => ReactNode
  children: (close: () => void) => ReactNode
  className?: string
}) {
  const [pos, setPos] = useState<{ top: number; right: number }>()
  const ref = useRef<HTMLSpanElement>(null)
  const close = () => setPos(undefined)
  const toggle = (e: MouseEvent<HTMLElement>) => {
    if (pos) return close()
    const rect = e.currentTarget.getBoundingClientRect()
    setPos({ top: rect.bottom + 4, right: Math.max(8, window.innerWidth - rect.right) })
  }

  useEffect(() => {
    if (!pos) return
    const onOutside = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) setPos(undefined)
    }
    document.addEventListener('mousedown', onOutside)
    window.addEventListener('scroll', onOutside, true)
    window.addEventListener('resize', onOutside)
    return () => {
      document.removeEventListener('mousedown', onOutside)
      window.removeEventListener('scroll', onOutside, true)
      window.removeEventListener('resize', onOutside)
    }
  }, [pos])

  return (
    <span ref={ref} className={className}>
      {trigger(toggle)}
      {pos && (
        <div className="popover" style={{ top: pos.top, right: pos.right }}>
          {children(close)}
        </div>
      )}
    </span>
  )
}
