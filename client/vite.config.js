import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// Same dev topology as the source app: client on :3000, websocket server on
// :3001 reached through the /ws proxy so the browser stays same-origin.
export const viteConfig = defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split rarely-changing vendor code into its own cacheable chunks so it
        // survives app deploys and downloads in parallel. howler is left alone so
        // use-sound keeps loading it lazily (sounds aren't on the critical path).
        manualChunks(id) {
          if (!id.includes('node_modules') || id.includes('node_modules/howler')) {
            return undefined
          }

          if (/node_modules\/(react|react-dom|react-router|scheduler)\//.test(id)) {
            return 'react-vendor'
          }

          return 'vendor'
        },
      },
    },
  },
  server: {
    port: 5005,
    host: '0.0.0.0',
    proxy: {
      '/ws': {
        target: 'http://localhost:3001',
        ws: true,
      },
      // Question-media upload + serving live on the game server (kept same-origin
      // in dev so stored /uploads/* paths resolve identically in prod).
      '/uploads': {
        target: 'http://localhost:3001',
      },
    },
  },
  preview: {
    port: 5005,
    host: '0.0.0.0',
    // Security headers for the production-served SPA (E2). A real deployment
    // behind nginx should mirror these; this covers `npm start` (vite preview).
    // img/media allow external http(s) so question media URLs keep loading;
    // connect-src allows the same-origin /ws websocket.
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https: http:",
        "media-src 'self' blob: https: http:",
        "font-src 'self' data:",
        "connect-src 'self' ws: wss:",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
      ].join('; '),
    },
  },
})

export default viteConfig
