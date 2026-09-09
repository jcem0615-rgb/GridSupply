import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Emits src/sw.js as /sw.js with this build's hashed asset list injected.
 * Without it the service worker caches index.html but not the JS it loads,
 * and a cold offline launch renders an empty page.
 */
function serviceWorker(): Plugin {
  return {
    name: 'gridsupply-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle)
        .filter((f) => f.endsWith('.js') || f.endsWith('.css'))
        .map((f) => `/${f}`)
      const buildId = Date.now().toString(36)
      const source = readFileSync('src/sw.js', 'utf8')
        .replace('self.__PRECACHE__ || []', JSON.stringify(assets))
        .replace("self.__BUILD_ID__ || 'dev'", JSON.stringify(buildId))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorker()],
  server: { host: true },
})
