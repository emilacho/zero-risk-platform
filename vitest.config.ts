import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Sprint 8C D8 · strip `#!/usr/bin/env node` shebangs from `.mjs` scripts
 * before Vite's parser sees them. Node strips shebangs natively at runtime
 * but Vite/esbuild does not · vitest 3 fails with `SyntaxError: Invalid or
 * unexpected token` when a test imports a `.mjs` script that begins with
 * a shebang line. Plugin · regex out the first-line shebang in source.
 *
 * Predecessor `server.deps.external: [/\.mjs$/]` was vitest 4 syntax · the
 * vitest 3 downgrade (D8 fix · rolldown binding blocker) made it inert.
 */
const stripShebangPlugin = {
  name: 'strip-shebang',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    if (id.endsWith('.mjs') && code.startsWith('#!')) {
      const newline = code.indexOf('\n')
      return {
        code: newline === -1 ? '' : code.slice(newline + 1),
        map: null,
      }
    }
    return null
  },
}

export default defineConfig({
  plugins: [stripShebangPlugin],
  test: {
    globals: false,
    environment: 'node',
    include: [
      '__tests__/**/*.test.ts',
      'src/**/*.test.ts',
      'services/agent-runner/src/**/*.test.ts',
      // RedAquario (tools/redaquario · §144) · JS puro · entra al gate `pnpm test` existente
      // (cero infra CI nueva). @slack/bolt sólo se importa en el camino vivo · los tests no lo tocan.
      'tools/**/*.test.js',
    ],
    testTimeout: 10000,
    reporters: ['default'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
