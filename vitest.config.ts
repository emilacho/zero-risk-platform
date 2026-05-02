import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['__tests__/**/*.test.ts', 'src/**/*.test.ts'],
    testTimeout: 10000,
    reporters: ['default'],
    server: {
      deps: {
        // Let Node handle .mjs scripts natively — vitest's vm.Script-based
        // evaluator chokes on shebang lines that Node strips automatically.
        external: [/\.mjs$/, /\/scripts\//],
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
