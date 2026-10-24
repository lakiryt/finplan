import type { ClassifiedTransaction, ClassifyConfig, MemoRule, Transaction } from './types'

export function matchesRule(rule: MemoRule, memo: string): boolean {
  if (!rule.pattern) return false
  if (!rule.isRegex) return memo.includes(rule.pattern)
  try {
    return new RegExp(rule.pattern).test(memo)
  } catch {
    return false
  }
}

/** メモルール（上から順に最初に一致したもの）→ カテゴリーの割り当て、の順で分類する */
export function classify(transactions: Transaction[], config: ClassifyConfig): ClassifiedTransaction[] {
  const groupById = new Map(config.groups.map((g) => [g.id, g]))

  return transactions.map((tx) => {
    const rule = config.memoRules.find((r) => matchesRule(r, tx.memo))
    const category = rule?.category || tx.category
    const groupId = rule?.groupId || config.categoryGroup[category] || null
    const group = groupId ? groupById.get(groupId) : undefined
    return {
      ...tx,
      category,
      originalCategory: tx.category,
      groupId: group ? group.id : null,
      role: group ? group.role : null,
    }
  })
}
