import { describe, expect, it } from 'vitest'
import { detachCategory, mergeWithNext, moveCategory, reconcileGroups, resizeGroup, sortByTotal, ungroup, type CategoryGroup } from './groups'
import { ids } from './testData'

describe('groups', () => {
  const g = (id: string, members: string[], extra: Partial<CategoryGroup> = {}): CategoryGroup => ({ id, members, ...extra })
  const shape = (groups: CategoryGroup[]) => groups.map((x) => x.members.join('+'))

  // A B C D E がそれぞれ1件ずつ
  const singles = ['A', 'B', 'C', 'D', 'E'].map((c) => g(`c:${c}`, [c]))

  it('reconciles saved groups with the categories in the data', () => {
    const r = reconcileGroups([g('x', ['B', 'Z', 'C'], { label: 'まとめ' })], ['A', 'B', 'C', 'D'])
    expect(r).toEqual([g('x', ['B', 'C'], { label: 'まとめ' }), g('c:A', ['A']), g('c:D', ['D'])])
  })

  it('merges adjacent groups, keeping the upper name and color', () => {
    const groups = [g('x', ['A', 'B'], { label: '上', color: '#111111' }), g('y', ['C'], { label: 'C' })]
    expect(mergeWithNext(groups, 0)).toEqual([g('x', ['A', 'B', 'C'], { label: '上', color: '#111111' })])
    // 1件だけのグループの名前は引き継がない
    expect(mergeWithNext([g('a', ['A'], { label: 'A名' }), g('b', ['B'])], 0)).toEqual([g('a', ['A', 'B'])])
  })

  it('detaches a category, splitting the group around it', () => {
    const groups = [g('x', ['A', 'B', 'C'], { label: 'まとめ' }), g('y', ['D'])]
    expect(detachCategory(groups, 'B', ids())).toEqual([g('x', ['A'], { label: 'まとめ' }), g('n0', ['B']), g('n1', ['C']), g('y', ['D'])])
    // 先頭を切り離すと、名前は残りの側に残る
    expect(detachCategory(groups, 'A', ids())).toEqual([g('n0', ['A']), g('x', ['B', 'C'], { label: 'まとめ' }), g('y', ['D'])])
  })

  it('resizes a group by dragging its edge: absorbs covered rows and releases the rest', () => {
    const grown = resizeGroup(singles, 'c:B', 1, 3, ids())
    expect(shape(grown)).toEqual(['A', 'B+C+D', 'E'])
    expect(grown[1].id).toBe('c:B')
    const shrunk = resizeGroup(grown, 'c:B', 1, 1, ids())
    expect(shape(shrunk)).toEqual(['A', 'B', 'C', 'D', 'E'])
    // 他のグループの一部だけを覆った場合、そのグループの残りはそのまま
    const partial = resizeGroup([g('x', ['A']), g('y', ['B', 'C', 'D'], { label: 'Y' }), g('z', ['E'])], 'x', 0, 1, ids())
    expect(partial).toEqual([g('x', ['A', 'B']), g('y', ['C', 'D'], { label: 'Y' }), g('z', ['E'])])
  })

  it('moves a category: joins a group only when dropped inside it', () => {
    const groups = [g('x', ['A', 'B', 'C']), g('d', ['D'], { color: '#222222' }), g('e', ['E'])]
    // D を B の位置へ（下から上なので B の前）→ A と B の間に入り、x に加わる
    expect(shape(moveCategory(groups, 'D', 'B', ids()))).toEqual(['A+D+B+C', 'E'])
    // D を E の後ろへ → 1件だけのグループのまま（色も保つ）
    expect(moveCategory(groups, 'D', 'E', ids())).toEqual([g('x', ['A', 'B', 'C']), g('e', ['E']), g('d', ['D'], { color: '#222222' })])
    // A を C の位置へ（上から下なので C の後ろ）→ グループの端なので外れる
    expect(shape(moveCategory(groups, 'A', 'C', ids()))).toEqual(['B+C', 'A', 'D', 'E'])
  })

  it('ungroups and sorts by total while keeping groups together', () => {
    expect(shape(ungroup([g('x', ['A', 'B'])], 'x', ids()))).toEqual(['A', 'B'])
    const totals = new Map([['A', 1], ['B', 5], ['C', 2], ['D', 4]])
    expect(shape(sortByTotal([g('x', ['A', 'C']), g('b', ['B']), g('d', ['D'])], totals))).toEqual(['B', 'D', 'C+A'])
  })
})
