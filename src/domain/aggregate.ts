/** 月の扱い（YYYY-MM）と、期間での絞り込み */

export const monthOf = (date: string) => date.slice(0, 7)

/** from から to まで（両端を含む）の YYYY-MM を並べる */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = []
  let [y, m] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    if (++m > 12) {
      m = 1
      y++
    }
  }
  return out
}

export function filterByMonths<T extends { date: string }>(txs: T[], from: string, to: string): T[] {
  return txs.filter((t) => {
    const m = monthOf(t.date)
    return m >= from && m <= to
  })
}
