import { useEffect, useRef, useState, type ReactNode } from 'react'
import { downloadJson } from '../state/storage'

interface Props {
  /** 書き出す内容。null なら閉じている */
  data: unknown | null
  filename: string
  title: string
  onClose: () => void
  /** 内容の上に出すもの（書き出す内容を選ぶ欄など） */
  children?: ReactNode
}

/** 書き出す JSON を見せて、コピーかダウンロードかを選ぶ画面。ブラウザ標準の <dialog> を使う（Esc でも閉じる） */
export function JsonExportDialog({ data, filename, title, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  // コピーした内容。書き出す内容が変われば「コピーしました」を消す
  const [copiedText, setCopiedText] = useState<string | null>(null)
  const open = data !== null
  const text = open ? JSON.stringify(data, null, 2) : ''
  const copied = copiedText === text

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // クリップボードが使えない環境では、選択してブラウザのコピーに任せる
      textRef.current?.select()
      document.execCommand('copy')
    }
    setCopiedText(text)
  }

  return (
    <dialog
      ref={ref}
      className="json-dialog"
      onClose={onClose}
      // 外側（背景）を押したら閉じる
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="json-dialog-body">
        <h3>{title}</h3>
        {children}
        <textarea ref={textRef} readOnly value={text} spellCheck={false} onFocus={(e) => e.target.select()} />
        <div className="row">
          <button onClick={copy}>{copied ? 'コピーしました' : 'コピー'}</button>
          <button onClick={() => downloadJson(filename, data)}>ダウンロード</button>
          <button onClick={onClose}>閉じる</button>
        </div>
      </div>
    </dialog>
  )
}
