import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const qboGatewayBaseUrl = env.QBO_GATEWAY_BASE_URL || 'http://127.0.0.1:8000'
  const qboGatewayApiKey = env.QBO_GATEWAY_API_KEY

  return {
    base: '/automations/',
    plugins: [react()],
    server: {
      proxy: {
        '/qbo-api': {
          target: qboGatewayBaseUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/qbo-api/, ''),
          headers: {
            ...(qboGatewayApiKey ? { 'X-API-Key': qboGatewayApiKey } : {}),
            Accept: 'application/json',
          },
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/setupTests.ts',
    },
  }
})
