/**
 * Fase 0 (29-oct) · las rutas /api/dashboard/* de la plataforma ya no están abiertas: sin llave interna → 401 (antes entregaban agentes, clientes y gasto a cualquiera).
 * Recorre TODA ruta que exista bajo esa carpeta: una nueva sin guarda hace fallar la prueba. US$ 0, sin red.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = path.resolve(__dirname, '../src/app/api/dashboard')
function archivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? archivos(path.join(dir, d.name)) : d.name === 'route.ts' ? [path.join(dir, d.name)] : []))
}
const RUTAS = archivos(RAIZ)

describe('/api/dashboard/* exige la llave interna', () => {
  it('hay 8 rutas y ninguna se escapa del recorrido', () => { expect(RUTAS).toHaveLength(8) })
  it.each(RUTAS.map((r) => [path.relative(RAIZ, r), r]))('%s · sin llave y con llave equivocada → 401, antes de tocar la base', async (_n, ruta) => {
    process.env.INTERNAL_API_KEY = 'k-interna-de-prueba'
    const m = (await import(/* @vite-ignore */ ruta)) as { GET: (r: Request, c: { params: Promise<Record<string, string>> }) => Promise<Response> }
    const ctx = { params: Promise.resolve({ slug: 'x', id: 'x' }) }
    for (const h of [{} as Record<string, string>, { 'x-api-key': 'otra' }]) {
      const r = await m.GET(new Request('https://t.test/api/dashboard/x', { headers: h }), ctx)
      expect(r.status).toBe(401)
    }
  })
  it('sin INTERNAL_API_KEY en el servidor tampoco entra nadie', async () => {
    delete process.env.INTERNAL_API_KEY
    const m = (await import('../src/app/api/dashboard/metrics/route')) as { GET: (r: Request) => Promise<Response> }
    expect((await m.GET(new Request('https://t.test/api/dashboard/metrics', { headers: { 'x-api-key': 'undefined' } }))).status).toBe(401)
  })
})
