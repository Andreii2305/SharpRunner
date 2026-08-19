import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('monaco-editor')) return 'monaco'
          if (id.includes('phaser')) return 'phaser'
          if (id.includes('jspdf') || id.includes('html2canvas')) return 'documents'
          if (id.includes('/xlsx/')) return 'spreadsheets'
          if (id.includes('@mui') || id.includes('@emotion')) return 'mui'
          return 'vendor'
        },
      },
    },
  },
})
