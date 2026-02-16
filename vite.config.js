import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id) return undefined
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor-react'
          }
          if (id.includes('node_modules/framer-motion')) {
            return 'vendor-motion'
          }
          if (id.includes('node_modules/@supabase')) {
            return 'vendor-supabase'
          }
          if (id.includes('/src/data/questionBank.js')) {
            return 'data-question-bank'
          }
          if (id.includes('/src/components/PathCoach.jsx') || id.includes('/src/scoring/pathPlanner.js')) {
            return 'feature-path-coach'
          }
          return undefined
        },
      },
    },
  },
})
