import { describe, expect, it } from 'vitest'
import { BASIC_COLORS, harmoniousShades, hexToOklch, oklchToHex, seededRandom } from './colors'

describe('colors', () => {
  it('converts hex to OKLCH and back', () => {
    for (const hex of ['#2a78d6', '#eb6834', '#008300', '#ffffff', '#000000']) {
      expect(oklchToHex(hexToOklch(hex))).toBe(hex)
    }
  })

  it('makes shades with almost the same hue that differ in lightness', () => {
    const base = hexToOklch('#2a78d6')
    const shades = harmoniousShades('#2a78d6', 5, seededRandom(1))
    expect(new Set(shades).size).toBe(5)
    const lab = shades.map(hexToOklch)
    for (const c of lab) expect(Math.abs(((c.h - base.h + 540) % 360) - 180)).toBeLessThan(10)
    const ls = lab.map((c) => c.l).sort((a, b) => a - b)
    for (let i = 1; i < ls.length; i++) expect(ls[i] - ls[i - 1]).toBeGreaterThan(0.04)
    // 同じ種なら同じ結果
    expect(harmoniousShades('#2a78d6', 5, seededRandom(1))).toEqual(shades)
  })

  it('avoids neighbors that are only one lightness step apart', () => {
    for (let seed = 0; seed < 20; seed++) {
      const ls = harmoniousShades('#eb6834', 6, seededRandom(seed)).map((h) => hexToOklch(h).l)
      const sorted = [...ls].sort((a, b) => a - b)
      const rank = ls.map((l) => sorted.indexOf(l))
      for (let i = 1; i < rank.length; i++) expect(Math.abs(rank[i] - rank[i - 1])).toBeGreaterThan(1)
    }
  })
})

describe('basic colors', () => {
  it('has one representative per color impression, all distinct and valid', () => {
    expect(BASIC_COLORS.map((c) => c.name)).toEqual(['赤', 'オレンジ', '茶', '黄', '黄緑', '緑', '水色', '青', '紫', 'ピンク', '灰', '黒'])
    expect(new Set(BASIC_COLORS.map((c) => c.hex)).size).toBe(BASIC_COLORS.length)
    for (const c of BASIC_COLORS) expect(c.hex).toMatch(/^#[0-9a-f]{6}$/)
  })
})
