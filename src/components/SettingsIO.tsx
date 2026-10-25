import { useState } from 'react'
import type { ProcessingConfig } from '../domain/processing'
import { parseSettingsFile, viewForExport } from '../domain/settings'
import type { Transaction } from '../domain/types'
import type { ViewConfig } from '../domain/view'
import { JsonExportDialog } from './JsonExportDialog'

type Part = 'both' | 'view' | 'processing'
const PARTS: { key: Part; label: string; filename: string }[] = [
  { key: 'both', label: '表示と加工', filename: 'finplan-settings.json' },
  { key: 'view', label: '表示だけ（2.）', filename: 'finplan-view.json' },
  { key: 'processing', label: '加工だけ（3.）', filename: 'finplan-processing.json' },
]

interface Props {
  view: ViewConfig
  processing: ProcessingConfig
  /** 加工する前の全取引（表示の設定を、データにあるカテゴリーをすべて並べた形で書き出すため） */
  transactions: Transaction[]
  onViewChange: (view: ViewConfig) => void
  onProcessingChange: (processing: ProcessingConfig) => void
}

/**
 * 2. の表示と 3. の加工の設定を、まとめて（または片方だけ）書き出す・読み込む。
 * 読み込みは、まとめたファイルでも片方だけのファイルでもよい（入っている方だけを置き換える）
 */
export function SettingsIO({ view, processing, transactions, onViewChange, onProcessingChange }: Props) {
  const [exporting, setExporting] = useState(false)
  const [part, setPart] = useState<Part>('both')
  const [message, setMessage] = useState('')

  const exportView = () => viewForExport(view, transactions)
  const data = part === 'both' ? { view: exportView(), processing } : part === 'view' ? exportView() : processing
  const current = PARTS.find((p) => p.key === part)!

  async function importFile(file: File) {
    try {
      const settings = parseSettingsFile(JSON.parse(await file.text()))
      const names = [settings.view && '表示', settings.processing && '加工'].filter(Boolean).join('と')
      // 加工の設定は元に戻せないので、置き換える前に確かめる
      if (settings.processing && !confirm(`${names}の設定を、読み込んだファイルの内容に置き換えますか？`)) return
      if (settings.view) onViewChange(settings.view)
      if (settings.processing) onProcessingChange(settings.processing)
      setMessage(`${names}の設定を読み込みました`)
    } catch (e) {
      alert(`設定を読み込めませんでした: ${e instanceof Error ? e.message : e}`)
    }
  }

  return (
    <>
      <button onClick={() => setExporting(true)}>設定を書き出す</button>
      <label className="button">
        設定を読み込む
        <input
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) importFile(file)
            e.target.value = ''
          }}
        />
      </label>
      {message && <span className="muted small">{message}</span>}
      <JsonExportDialog data={exporting ? data : null} filename={current.filename} title="設定の書き出し" onClose={() => setExporting(false)}>
        <div className="row">
          {PARTS.map((p) => (
            <label key={p.key}>
              <input type="radio" checked={part === p.key} onChange={() => setPart(p.key)} />
              {p.label}
            </label>
          ))}
        </div>
        <p className="muted small">どれも「設定を読み込む」で読み込めます。片方だけの形式は、開発用の初期設定ファイル（src/config/local/default-view.json・default-processing.json）と同じです。</p>
      </JsonExportDialog>
    </>
  )
}
