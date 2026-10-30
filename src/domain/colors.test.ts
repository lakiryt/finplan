import { describe, expect, it } from 'vitest'
import { harmoniousShades, hexToOklch, oklchToHex, seededRandom } from './colors'

describe('colors', () => {
  it('converts hex to OKLCH and back', () => {
    for (const hex of ['#2a78d6', '#eb6834', '#008300', '#ffffff', '#000000']) {
      expect(oklchToHex(hexToOklch(hex))).toBe(hex)
    }
  })

  it('makes the requested number of distinct shades, the same for the same seed', () => {
    const shades = harmoniousShades('#2a78d6', 5, seededRandom(1))
    expect(new Set(shades).size).toBe(5)
    expect(harmoniousShades('#2a78d6', 5, seededRandom(1))).toEqual(shades)
  })
})
