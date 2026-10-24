import { describe, expect, it } from 'vitest'
import { hexToOklch, seededRandom } from './colors'
import type { CategoryGroup } from './groups'
import {
  categoryColorsInUse,
  changeGroups,
  clearColors,
  defaultView,
  displaySeries,
  groupColorsInUse,
  parseViewConfig,
  recolorMembers,
  setCategoryColor,
  setGroupColor,
  type ViewConfig,
} from './view'

const g = (id: string, members: string[], extra: Partial<CategoryGroup> = {}): CategoryGroup => ({ id, members, ...extra })
const view = (groups: CategoryGroup[], colors: Record<string, string> = {}, useSuperCategories = false): ViewConfig => ({
  version: 2,
  useSuperCategories,
  colors,
  groups,
})

describe('display', () => {
  it('builds chart series per category or per group', () => {
    const groups = [g('x', ['A', 'B'], { label: 'まとめ' }), g('c', ['C'])]
    const colors = { A: '#aaaaaa', C: '#cccccc' }
    expect(displaySeries(view(groups, colors)).map((s) => [s.label, s.color])).toEqual([
      ['A', '#aaaaaa'],
      ['B', undefined],
      ['C', '#cccccc'],
    ])
    expect(displaySeries(view(groups, colors, true)).map((s) => [s.label, s.color])).toEqual([
      ['まとめ', undefined],
      ['C', '#cccccc'],
    ])
  })

  it('shows colorless categories in the group color', () => {
    const series = displaySeries(view([g('x', ['A', 'B'], { color: '#eb6834' }), g('d', ['D'])], { A: '#000000' }))
    expect(series.map((s) => s.color)).toEqual(['#000000', '#eb6834', undefined])
  })

  it('lists colors in use separately for categories and groups', () => {
    expect(categoryColorsInUse({ colors: { A: '#AA0000', B: '#aa0000', C: '#00ff00' } })).toEqual(['#aa0000', '#00ff00'])
    expect(groupColorsInUse({ groups: [g('x', ['B'], { color: '#0000FF' }), g('y', ['C'])] })).toEqual(['#0000ff'])
  })

  it('parses configs (including v1)', () => {
    expect(defaultView.version).toBe(2)
    const migrated = parseViewConfig({ version: 1, colors: {}, superCategories: [{ id: 's', label: 'S', members: ['A', 'B'] }] })
    expect(migrated.groups).toEqual([{ id: 's', label: 'S', members: ['A', 'B'] }])
    expect(() => parseViewConfig({ version: 2, colors: {}, groups: [{ members: [] }] })).toThrow()
  })
})

describe('colors', () => {
  const base = view([g('x', ['A', 'B', 'C']), g('d', ['D'])])

  it('sets and clears a category color', () => {
    const v = setCategoryColor(base, 'A', '#123456')
    expect(v.colors).toEqual({ A: '#123456' })
    expect(setCategoryColor(v, 'A', undefined).colors).toEqual({})
  })

  it('assigns similar colors to colorless members when a group gets a color', () => {
    const v = setGroupColor(base, 'x', '#2a78d6', seededRandom(3))
    expect(v.groups[0].color).toBe('#2a78d6')
    expect(Object.keys(v.colors)).toEqual(['A', 'B', 'C'])
  })

  it('keeps member colors when some are already set, and skips single groups', () => {
    expect(setGroupColor({ ...base, colors: { B: '#111111' } }, 'x', '#2a78d6').colors).toEqual({ B: '#111111' })
    expect(setGroupColor(base, 'd', '#2a78d6').colors).toEqual({})
    expect(setGroupColor(base, 'x', undefined).groups[0]).toEqual({ id: 'x', members: ['A', 'B', 'C'] })
  })

  it('recolors members on request; a single-member group gets exactly the group color', () => {
    const colored = view([g('x', ['A', 'B', 'C'], { color: '#eb6834' }), g('d', ['D'], { color: '#123456' })], { A: '#000000' })
    expect(Object.keys(recolorMembers(colored, 'x', seededRandom(1)).colors)).toEqual(['A', 'B', 'C'])
    expect(recolorMembers(colored, 'd').colors.D).toBe('#123456')
  })

  it('clears all colors but keeps names', () => {
    const v = clearColors(view([g('x', ['A', 'B'], { label: 'L', color: '#111111' })], { A: '#222222' }))
    expect(v).toMatchObject({ colors: {}, groups: [{ id: 'x', label: 'L', members: ['A', 'B'] }] })
    expect(v.groups[0].color).toBeUndefined()
  })
})

describe('coloring members that join a group', () => {
  it('colors only colorless categories that newly joined a colored group', () => {
    const before = view([g('x', ['A', 'B'], { color: '#2a78d6' }), g('c', ['C']), g('d', ['D'], { color: '#eb6834' })], { A: '#1955b4' })
    const after = [g('x', ['A', 'B', 'C'], { color: '#2a78d6' }), g('d', ['D'], { color: '#eb6834' })]
    const { colors, groups } = changeGroups(before, after, seededRandom(2))
    expect(groups).toBe(after)
    expect(Object.keys(colors).sort()).toEqual(['A', 'C'])
    expect(colors.A).toBe('#1955b4')
    // 似た色（色相が近い）で、すでにいる中身の色とは違う
    const hue = (hex: string) => hexToOklch(hex).h
    expect(Math.abs(hue(colors.C) - hue('#2a78d6'))).toBeLessThan(10)
    expect(colors.C).not.toBe(colors.A)
  })

  it('does nothing for colorless groups, colored categories, or unchanged groups', () => {
    expect(changeGroups(view([g('x', ['A']), g('b', ['B'])]), [g('x', ['A', 'B'])]).colors).toEqual({})
    const colored = view([g('x', ['A'], { color: '#2a78d6' }), g('b', ['B'])], { B: '#000000' })
    expect(changeGroups(colored, [g('x', ['A', 'B'], { color: '#2a78d6' })]).colors).toEqual({ B: '#000000' })
    expect(changeGroups({ ...colored, colors: {} }, colored.groups).colors).toEqual({})
  })
})
