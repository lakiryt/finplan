import type { ClassifiedTransaction, ClassifyConfig, Rule, RuleEffect, RuleMatch, Transaction } from './types'

export function matchesRule(match: RuleMatch, tx: Transaction): boolean {
  if (match.category && tx.category !== match.category) return false
  if (match.from && tx.date < match.from) return false
  if (match.to && tx.date > match.to) return false
  if (match.memo) {
    if (!match.memoIsRegex) return tx.memo.includes(match.memo)
    try {
      return new RegExp(match.memo).test(tx.memo)
    } catch {
      return false
    }
  }
  return true
}

/** 条件が1つも無いルールは全件に当たってしまうので無効扱いにする */
export function isActive(rule: Rule): boolean {
  const m = rule.match
  return rule.enabled && Boolean(m.category || m.memo || m.from || m.to)
}

/** 一致したルールの効果を上から順に重ねる（後のルールが上書き） */
export function effectFor(tx: Transaction, rules: Rule[]): RuleEffect {
  const effect: RuleEffect = {}
  for (const rule of rules) {
    if (!isActive(rule) || !matchesRule(rule.match, tx)) continue
    for (const [k, v] of Object.entries(rule.effect)) {
      if (v !== undefined && v !== '' && v !== 0) Object.assign(effect, { [k]: v })
    }
  }
  return effect
}

export function addMonths(date: string, n: number): string {
  const [y, m] = date.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`
}

/** 金額を n 個に整数で割る。端数は最初の月に寄せる */
export function splitAmount(amount: number, n: number): number[] {
  const base = Math.trunc(amount / n)
  return Array.from({ length: n }, (_, i) => (i === 0 ? amount - base * (n - 1) : base))
}

/** ルール → カテゴリーの割り当て、の順で分類する。按分された取引は月ごとの取引に展開する */
export function classify(transactions: Transaction[], config: ClassifyConfig): ClassifiedTransaction[] {
  const groupById = new Map(config.groups.map((g) => [g.id, g]))

  return transactions.flatMap((tx) => {
    const effect = effectFor(tx, config.rules)
    const category = effect.category || tx.category
    const group = groupById.get(effect.groupId || config.categoryGroup[category] || '')
    const base: ClassifiedTransaction = {
      ...tx,
      category,
      originalCategory: tx.category,
      groupId: group?.id ?? null,
      role: group?.role ?? null,
    }

    const n = Math.floor(effect.amortizeMonths ?? 1)
    if (n <= 1) return [base]
    return splitAmount(tx.amount, n).map((amount, i) => ({
      ...base,
      id: `${tx.id}#${i}`,
      date: i === 0 ? tx.date : addMonths(tx.date, i),
      amount,
      amortizedFrom: tx.id,
    }))
  })
}
