import { Analytics } from '@vercel/analytics/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { TakeHomeCalculator } from './components/TakeHomeDialog'

// 手取りの計算だけのページ（tedori/index.html）。説明の文章は HTML に直接書き、計算の画面だけをここで描く
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TakeHomeCalculator onPage />
    <Analytics />
  </StrictMode>,
)
