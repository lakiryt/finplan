import { useState } from 'react'
import { parseCsv } from '../domain/importers'
import type { Transaction } from '../domain/types'

interface Props {
  onLoad: (transactions: Transaction[]) => void
}

export function FileImport({ onLoad }: Props) {
  const [message, setMessage] = useState<string>()

  async function handleFile(file: File) {
    try {
      const result = parseCsv(await file.text())
      onLoad(result.transactions)
      const skipped = result.errors.length ? `（${result.errors.length}行は読み込めませんでした）` : ''
      setMessage(`${result.transactions.length}件を読み込みました${skipped}`)
      if (result.errors.length) console.warn('読み込めなかった行', result.errors)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="file-import">
      <label className="button">
        CSVを選ぶ
        <input
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
            e.target.value = ''
          }}
        />
      </label>
      <span className="muted">ファイルはこのブラウザの中だけで処理され、どこにも送信されません。</span>
      {message && <p>{message}</p>}
    </div>
  )
}
