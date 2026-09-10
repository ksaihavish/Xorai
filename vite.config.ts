import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// vite-plugin-pwa is installed but deliberately not registered yet. The
// injectManifest strategy requires src/sw.ts to exist at build time, and the
// service worker + precache budget belong to Phase 3 (Offline layer). Wiring an
// empty one now would claim the precache budget before there is anything to cache.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
})
