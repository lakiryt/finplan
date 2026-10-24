import { useSyncExternalStore } from 'react'

/** 系列の色。順番に割り当て、使い回さない（9番目以降は「その他」にまとめる） */
const series = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
}

const chrome = {
  light: { surface: '#fcfcfb', grid: '#e1e0d9', axis: '#c3c2b7', muted: '#898781', ink: '#0b0b0b' },
  dark: { surface: '#1a1a19', grid: '#2c2c2a', axis: '#383835', muted: '#898781', ink: '#f0efec' },
}

const query = '(prefers-color-scheme: dark)'
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(query)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

export function useChartTheme() {
  const dark = useSyncExternalStore(subscribe, () => window.matchMedia(query).matches)
  const mode = dark ? 'dark' : 'light'
  return { series: series[mode], ...chrome[mode] }
}
