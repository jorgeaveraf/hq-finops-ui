import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(() => {
  return {
    base: '/automations/',
    plugins: [react()],
    server: {
      proxy: {
        '/automations/api': {
          target: process.env.FINOPS_API_PROXY_TARGET || 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/setupTests.ts',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
  }
})
