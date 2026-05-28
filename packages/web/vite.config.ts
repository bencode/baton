import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Dev: proxy /api → server, stripping the /api prefix (server routes live at root).
const BACKEND = process.env.BATON_BACKEND ?? 'http://localhost:3280'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5280,
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true, rewrite: p => p.replace(/^\/api/, '') },
    },
  },
  test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'] },
})
