/**
 * Configuración para las pruebas que tocan la BASE REAL.
 *
 * Viven en `scripts/` y NO en `__tests__/` a propósito: así la suite normal (y la
 * revisión automática del repositorio) no las levanta, porque allá no hay credenciales
 * ni debe escribirse en la base.
 *
 * Se corren a mano, y SIEMPRE contra un cliente descartable:
 *   npx vitest run -c vitest.base-real.config.ts
 */
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['scripts/**/*.test.ts'],
    testTimeout: 60_000,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
