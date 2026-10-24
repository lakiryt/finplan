import Papa from 'papaparse'
import type { Transaction } from './types'

/**
 * 家計簿アプリごとのCSV形式の定義。
 * 新しいアプリに対応するときは、ここにプロファイルを1つ追加する。
 */
export interface ImportProfile {
  id: string
  label: string
  columns: { amount: string; date: string; memo: string; category: string }
  /** CSV上で支出がマイナスで記録されているか */
  expenseIsNegative: boolean
}

export const importProfiles: ImportProfile[] = [
  {
    id: 'default-ja',
    label: '金額・日付・メモ・カテゴリー名',
    columns: { amount: '金額', date: '日付', memo: 'メモ', category: 'カテゴリー名' },
    expenseIsNegative: true,
  },
]

export interface ImportResult {
  profile: ImportProfile
  transactions: Transaction[]
  /** 読み込めなかった行（行番号は見出しを1行目として数える） */
  errors: { line: number; reason: string }[]
}

export function detectProfile(headers: string[]): ImportProfile | undefined {
  return importProfiles.find((p) => Object.values(p.columns).every((c) => headers.includes(c)))
}

export function parseCsv(text: string): ImportResult {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: true,
  })
  const headers = parsed.meta.fields ?? []
  const profile = detectProfile(headers)
  if (!profile) {
    throw new Error(`対応していないCSV形式です（列: ${headers.join(', ')}）`)
  }

  const { columns, expenseIsNegative } = profile
  const transactions: Transaction[] = []
  const errors: ImportResult['errors'] = []

  parsed.data.forEach((row, i) => {
    const line = i + 2
    const amount = parseAmount(row[columns.amount])
    const date = parseDate(row[columns.date])
    if (amount === null) return errors.push({ line, reason: `金額を読めません: ${row[columns.amount]}` })
    if (date === null) return errors.push({ line, reason: `日付を読めません: ${row[columns.date]}` })
    transactions.push({
      id: String(i),
      date,
      amount: expenseIsNegative ? amount : -amount,
      memo: (row[columns.memo] ?? '').trim(),
      category: (row[columns.category] ?? '').trim(),
    })
  })

  return { profile, transactions, errors }
}

export function parseAmount(raw: string | undefined): number | null {
  if (raw == null) return null
  const n = Number(raw.replace(/[,¥￥円\s]/g, ''))
  return Number.isFinite(n) ? n : null
}

/** 2026/10/24, 2026-10-24, 2026/1/5 などを YYYY-MM-DD にする */
export function parseDate(raw: string | undefined): string | null {
  const m = raw?.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
  if (!m) return null
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}
