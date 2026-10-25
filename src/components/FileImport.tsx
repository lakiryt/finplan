import { useState } from 'react'
import { parseCsv } from '../domain/importers'
import type { Transaction } from '../domain/types'

interface Props {
  onLoad: (transactions: Transaction[]) => void
  /** ボタンの文言 */
  label?: string
  /** 目立たせるボタンにするか（最初の画面用） */
  primary?: boolean
}

/** CSVを選んで読み込むボタン。読み込めなかったときは、その理由をボタンの横に出す */
export function FileImport({ onLoad, label = 'CSVを読み込む', primary }: Props) {
  const [message, setMessage] = useState<string>()

  async function handleFile(file: File) {
    try {
      const result = parseCsv(await file.text())
      if (!result.transactions.length) throw new Error('記録を1件も読み込めませんでした。対応している形式のCSVか確かめてください。')
      onLoad(result.transactions)
      const skipped = result.errors.length ? `（${result.errors.length}行は読み込めませんでした）` : ''
      setMessage(`${result.transactions.length}件を読み込みました${skipped}`)
      if (result.errors.length) console.warn('読み込めなかった行', result.errors)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <span className="file-import">
      <label className={`button ${primary ? 'primary' : ''}`}>
        {label}
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
      {message && <span className="small">{message}</span>}
    </span>
  )
}
