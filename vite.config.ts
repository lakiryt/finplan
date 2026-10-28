import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // 手取りの計算だけのページ（/tedori/）を、検索から見つけやすいよう別の HTML として出す
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        tedori: resolve(import.meta.dirname, 'tedori/index.html'),
      },
    },
  },
})
