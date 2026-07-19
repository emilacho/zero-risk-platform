import { defineConfig } from 'vitest/config'

// Config local · autocontenida. Sin esto, vitest sube al `vitest.config.ts` del
// repo root (que importa plugins ausentes en el node_modules de este paquete
// standalone). Corre solo los tests de este paquete.
export default defineConfig({
  // postcss inline vacío · evita que vite suba a `postcss.config.js` del repo root
  // (que requiere tailwindcss · ausente en este paquete). No hay CSS acá.
  css: { postcss: { plugins: [] } },
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
  },
})
