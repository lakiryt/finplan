import { useEffect, useState } from 'react'

/** ブラウザ内だけに保存する。プライベートウィンドウなどで使えない場合は保存せずに動く */
export function useStoredState<T>(key: string, initial: T | (() => T)) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw != null) return JSON.parse(raw) as T
    } catch {
      /* 読めない場合は初期値を使う */
    }
    return typeof initial === 'function' ? (initial as () => T)() : initial
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* 保存できなくても動作は続ける */
    }
  }, [key, value])

  return [value, setValue] as const
}

export function removeStored(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* 無視 */
  }
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}
