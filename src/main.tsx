import { Analytics } from '@vercel/analytics/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {/* アクセス数の集計（ページの表示だけ。記録の中身は送らない） */}
    <Analytics />
  </StrictMode>,
)
