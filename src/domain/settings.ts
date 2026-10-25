import { reconcileGroups } from './groups'
import { parseProcessingConfig, type ProcessingConfig } from './processing'
import { categoryTotals, rankByTotal } from './raw'
import type { Transaction } from './types'
import { parseViewConfig, type ViewConfig } from './view'

/**
 * 設定のファイル。2. の表示と 3. の加工の、どちらか一方か両方。
 * 両方なら { view, processing } の形。片方だけなら、その設定そのもの（src/config/local/default-*.json と同じ形式）
 */
export interface SettingsFile {
  view?: ViewConfig
  processing?: ProcessingConfig
}

/**
 * 書き出す表示の設定。データにあるカテゴリーをすべて並べた形にする（読み込んだ先で並び順が崩れないように）。
 * データが無ければそのまま
 */
export function viewForExport(view: ViewConfig, txs: Transaction[]): ViewConfig {
  if (!txs.length) return view
  return {
    ...view,
    groups: reconcileGroups(view.groups, rankByTotal(categoryTotals(txs, 'expense'))),
    incomeGroups: reconcileGroups(view.incomeGroups, rankByTotal(categoryTotals(txs, 'income'))),
  }
}

/** 読み込んだファイルを、表示・加工の設定に分ける。どちらとしても読めなければエラー */
export function parseSettingsFile(raw: unknown): SettingsFile {
  const c = raw as Record<string, unknown> | null
  if (c && typeof c === 'object' && ('view' in c || 'processing' in c)) {
    return {
      ...(c.view !== undefined && { view: parseViewConfig(c.view) }),
      ...(c.processing !== undefined && { processing: parseProcessingConfig(c.processing) }),
    }
  }
  // 片方だけのファイル
  for (const parse of [(r: unknown) => ({ view: parseViewConfig(r) }), (r: unknown) => ({ processing: parseProcessingConfig(r) })]) {
    try {
      return parse(raw)
    } catch {
      // 次の形式として読んでみる
    }
  }
  throw new Error('表示の設定としても加工の設定としても読めませんでした')
}
