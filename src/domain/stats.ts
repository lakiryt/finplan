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

/** 並べ替え済みの値の分位点（線形補間） */
export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0
  const pos = (sorted.length - 1) * q
  const i = Math.floor(pos)
  return sorted[i] + (sorted[Math.min(i + 1, sorted.length - 1)] - sorted[i]) * (pos - i)
}

export interface Histogram {
  /** 柱の範囲の下端と上端 */
  lo: number
  hi: number
  counts: number[]
  /** 範囲の外にはみ出して、両端の柱に入れた数 */
  clippedLow: number
  clippedHigh: number
}

/**
 * 月ごとの金額の分布。一度だけの極端な月に範囲を引っ張られないよう、
 * 四分位範囲（IQR）の3倍より外は両端の柱にまとめる
 */
export function histogram(values: number[], bins = 8): Histogram {
  const counts = Array<number>(bins).fill(0)
  if (!values.length) return { lo: 0, hi: 0, counts, clippedLow: 0, clippedHigh: 0 }
  const s = [...values].sort((a, b) => a - b)
  const q1 = quantile(s, 0.25)
  const q3 = quantile(s, 0.75)
  const iqr = q3 - q1
  let lo = Math.max(s[0], q1 - 3 * iqr)
  let hi = Math.min(s[s.length - 1], q3 + 3 * iqr)
  if (hi <= lo) {
    lo = s[0]
    hi = s[s.length - 1] > lo ? s[s.length - 1] : lo + 1
  }
  const width = (hi - lo) / bins
  let clippedLow = 0
  let clippedHigh = 0
  for (const v of values) {
    if (v < lo) clippedLow++
    if (v > hi) clippedHigh++
    const clamped = Math.min(hi, Math.max(lo, v))
    counts[Math.min(bins - 1, Math.floor((clamped - lo) / width))]++
  }
  return { lo, hi, counts, clippedLow, clippedHigh }
}
