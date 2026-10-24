import { useLayoutEffect, useRef, useState } from 'react'
import { ROW_EASING, ROW_MS, type BlobLayout } from './SuperBlobs'

/** 右端のセルの左端から、バー（滴）の中心までの距離 */
const BLOB_CENTER = 28

/**
 * 表の行の位置を扱う。
 * - 並びが変わったら、各行を元の位置から新しい位置へ滑らせる（FLIP）
 * - 表の上に重ねるバーのために、各行の中心の位置を測る（変わったときだけ更新する）
 */
export function useRowLayout(rows: { category: string; opacity: number }[]) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const rowEls = useRef(new Map<string, HTMLTableRowElement>())
  const lastTops = useRef(new Map<string, number>())
  const lastOrder = useRef('')
  const [layout, setLayout] = useState<BlobLayout | null>(null)

  const measure = () => {
    const wrap = wrapRef.current
    const table = tableRef.current
    const td = table?.querySelector<HTMLElement>('td.super-cell')
    if (!wrap || !table || !td) return
    const x = td.getBoundingClientRect().left - wrap.getBoundingClientRect().left + wrap.scrollLeft + BLOB_CENTER
    // 行の位置は offsetTop で測る（移動のアニメーション中の transform に影響されないように）
    const measured = rows.flatMap(({ category, opacity }) => {
      const el = rowEls.current.get(category)
      return el ? [{ category, y: table.offsetTop + el.offsetTop + el.offsetHeight / 2, opacity }] : []
    })
    const next = { x, rows: measured }
    setLayout((cur) => (JSON.stringify(cur) === JSON.stringify(next) ? cur : next))
  }

  const orderKey = rows.map((r) => r.category).join('\n')
  useLayoutEffect(() => {
    const tops = new Map<string, number>()
    rowEls.current.forEach((el, c) => tops.set(c, el.offsetTop))
    if (lastOrder.current && lastOrder.current !== orderKey) {
      rowEls.current.forEach((el, c) => {
        const before = lastTops.current.get(c)
        const after = tops.get(c)
        if (before === undefined || after === undefined || before === after) return
        el.animate([{ transform: `translateY(${before - after}px)` }, { transform: 'none' }], { duration: ROW_MS, easing: ROW_EASING })
      })
    }
    lastOrder.current = orderKey
    lastTops.current = tops
    measure()
  })

  // 表の大きさが変わったとき（画面幅・文字の読み込みなど）も測り直す。見張りは1回だけ作り、測るのは最新の measure で
  const measureRef = useRef(measure)
  useLayoutEffect(() => {
    measureRef.current = measure
  })
  useLayoutEffect(() => {
    const table = tableRef.current
    if (!table) return
    const observer = new ResizeObserver(() => measureRef.current())
    observer.observe(table)
    return () => observer.disconnect()
  }, [])

  /** 行（tr）の ref に渡す */
  const rowRef = (category: string) => (el: HTMLTableRowElement | null) => {
    if (el) rowEls.current.set(category, el)
    else rowEls.current.delete(category)
  }

  return { wrapRef, tableRef, rowRef, layout }
}
