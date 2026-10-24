import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'

const MARGIN = 8

/**
 * ボタンの下に出る小さな窓。表のスクロール枠で切れないよう、画面に固定した位置に出す。
 * 開いた後に窓の大きさを測り、画面からはみ出さない位置に置き直す。
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
  const [anchor, setAnchor] = useState<DOMRect>()
  const [pos, setPos] = useState<{ top: number; left: number }>()
  const ref = useRef<HTMLSpanElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const close = () => {
    setAnchor(undefined)
    setPos(undefined)
  }
  const toggle = (e: MouseEvent<HTMLElement>) => {
    if (anchor) return close()
    setAnchor(e.currentTarget.getBoundingClientRect())
  }

  // 描画した窓の大きさから位置を決める（ボタンの左端に揃え、はみ出すなら画面内にずらす。下が足りなければ上に出す）
  useLayoutEffect(() => {
    if (!anchor || !popRef.current) return
    const { width, height } = popRef.current.getBoundingClientRect()
    const left = Math.min(Math.max(MARGIN, anchor.left), window.innerWidth - width - MARGIN)
    const below = anchor.bottom + 4
    const top = below + height > window.innerHeight - MARGIN ? Math.max(MARGIN, anchor.top - 4 - height) : below
    setPos({ top, left: Math.max(MARGIN, left) })
  }, [anchor])

  useEffect(() => {
    if (!anchor) return
    const onOutside = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', onOutside)
    window.addEventListener('scroll', onOutside, true)
    window.addEventListener('resize', onOutside)
    return () => {
      document.removeEventListener('mousedown', onOutside)
      window.removeEventListener('scroll', onOutside, true)
      window.removeEventListener('resize', onOutside)
    }
  }, [anchor])

  return (
    <span ref={ref} className={className}>
      {trigger(toggle)}
      {anchor && (
        <div
          ref={popRef}
          className="popover"
          // 位置が決まるまでは見えないところで大きさだけ測る
          style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }}
        >
          {children(close)}
        </div>
      )}
    </span>
  )
}
