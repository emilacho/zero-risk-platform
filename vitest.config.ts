/**
 * Vitest config — Sprint #3 Wave 10
 *
 * Resuelve el alias `@/*` para que los tests puedan importar desde
 * `@/lib/journey-orchestrator`, etc. (mismo contrato que tsconfig.json paths).
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
