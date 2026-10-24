/**
 * 色の計算。人の目の感じ方に近い OKLCH（明るさ L・鮮やかさ C・色相 H）で扱う。
 * 変換式は Björn Ottosson による OKLab の定義（https://bottosson.github.io/posts/oklab/）に従う。
 */

export interface Oklch {
  l: number
  c: number
  /** 度 */
  h: number
}

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const toGamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)

export function hexToOklch(hex: string): Oklch {
  const n = parseInt(hex.replace('#', ''), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => toLinear(v / 255))
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
  return { l: L, c: Math.hypot(a, bb), h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 }
}

/** sRGB の範囲に収まらなければ null */
function oklchToRgb({ l, c, h }: Oklch): [number, number, number] | null {
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const l3 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m3 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const rgb = [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ]
  const eps = 1e-4
  if (rgb.some((v) => v < -eps || v > 1 + eps)) return null
  return rgb.map((v) => toGamma(Math.min(1, Math.max(0, v)))) as [number, number, number]
}

/** 表示できない色は、色相と明るさを保ったまま鮮やかさを下げて表示できる色にする */
export function oklchToHex(color: Oklch): string {
  let c = color.c
  let rgb = oklchToRgb({ ...color, c })
  while (!rgb && c > 0) {
    c = Math.max(0, c - 0.005)
    rgb = oklchToRgb({ ...color, c })
  }
  const [r, g, b] = (rgb ?? [color.l, color.l, color.l]).map((v) => Math.round(v * 255))
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}

/** 0〜1 の乱数を返す関数（テストでは決まった値を返すものを渡す） */
export type Random = () => number

/** 決まった種から同じ乱数列を作る（mulberry32） */
export function seededRandom(seed: number): Random {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const L_MIN = 0.4
const L_MAX = 0.86

/**
 * 基準の色と色相がほぼ同じで、明るさで見分けられる n 色を作る。
 * - 明るさは基準の色を中心に等間隔に振る（数値的なランダムだと似た色が固まりやすいため）
 * - 色相は ±5° だけ揺らし、鮮やかさは明るい色ほど少し控えめにする
 * - 並びはランダムだが、4色以上なら隣り合う色の明るさが1段しか違わない並びは避ける
 */
export function harmoniousShades(baseHex: string, n: number, random: Random = Math.random): string[] {
  if (n <= 0) return []
  const base = hexToOklch(baseHex)
  const span = Math.min(L_MAX - L_MIN, 0.07 * (n - 1))
  let lo = base.l - span / 2
  lo = Math.min(Math.max(lo, L_MIN), L_MAX - span)
  const steps = Array.from({ length: n }, (_, i) => (n === 1 ? base.l : lo + (span * i) / (n - 1)))

  let order = steps.map((_, i) => i)
  for (let attempt = 0; attempt < 30; attempt++) {
    order = shuffle(order, random)
    if (n < 4 || order.every((v, i) => i === 0 || Math.abs(v - order[i - 1]) > 1)) break
  }

  return order.map((i) => {
    const l = steps[i]
    const c = base.c * (1 - 0.35 * Math.max(0, l - base.l) / (L_MAX - L_MIN))
    const h = (base.h + (random() - 0.5) * 10 + 360) % 360
    return oklchToHex({ l, c, h })
  })
}

function shuffle<T>(items: T[], random: Random): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
