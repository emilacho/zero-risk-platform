/**
 * Vitest config — Wave 12 (CC#1)
 *
 * Establecido para soportar:
 *  - Path alias `@/*` → `src/*` (alineado con tsconfig.json)
 *  - Tests .ts importando .mjs (cleanup/rollback scripts)
 *
 * Antes de Wave 12: NO había vitest.config.ts en main · vitest usaba
 * defaults · no resolvía aliases · fallaba con "SyntaxError" críptico
 * al importar .mjs scripts. Wave 12 quick win #1 + #2 lo resuelve.
 */
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
