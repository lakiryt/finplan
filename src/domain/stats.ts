export interface SeriesStats {
  count: number
  mean: number
  median: number
  min: number
  max: number
  /** 直近 n か月の平均（n はキー） */
  recent: Record<number, number>
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
}

export function median(values: number[]): number {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** values は古い順に並んでいる前提 */
export function seriesStats(values: number[], recentWindows: number[] = [3, 6, 12]): SeriesStats {
  return {
    count: values.length,
    mean: mean(values),
    median: median(values),
    min: values.length ? Math.min(...values) : 0,
    max: values.length ? Math.max(...values) : 0,
    recent: Object.fromEntries(recentWindows.map((n) => [n, mean(values.slice(-n))])),
  }
}
