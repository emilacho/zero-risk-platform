/**
 * EL ECO DEL MODO SECO (CC#1 · 19-oct): no toca nada, exige la llave y contesta una forma conocida. US$ 0.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ llamadas: 0 }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => { h.llamadas++; throw new Error('el eco NO debe tocar la base') } }))
import { POST } from '../src/app/api/dry-run/eco/route'
import { CAMPOS_DE_ECO, respuestaDeEco } from '../src/lib/dry-run/eco'

const LLAVE = 'llave-interna-del-eco'
const llamar = (cuerpo: unknown, llave: string | null = LLAVE) =>
  POST(new Request('http://local/api/dry-run/eco', { method: 'POST', headers: { 'content-type': 'application/json', ...(llave ? { 'x-api-key': llave } : {}) }, body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) }))

beforeEach(() => { process.env.INTERNAL_API_KEY = LLAVE; h.llamadas = 0 })

describe('el eco', () => {
  it('sin llave o con llave equivocada: 401 y nada más', async () => {
    for (const llave of [null, 'otra', LLAVE + 'x']) expect((await llamar({ a: 1 }, llave)).status).toBe(401)
    delete process.env.INTERNAL_API_KEY
    expect((await llamar({ a: 1 })).status).toBe(401)
  })
  it('con llave contesta 200 con la forma de «hecho, sin datos» y no toca la base', async () => {
    const r = await llamar({ client_id: 'c1', apify_function: 'x', secreto: 'no-debe-volver' })
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j).toMatchObject({ ok: true, dry_run: true, simulado: true, competitors: [] })
    for (const c of CAMPOS_DE_ECO) expect(j[c]).toBe('dry-run')
    expect(j.eco.claves_recibidas).toEqual(['client_id', 'apify_function', 'secreto'])
    expect(JSON.stringify(j)).not.toContain('no-debe-volver') // devuelve las CLAVES recibidas, nunca los valores
    expect(h.llamadas).toBe(0)
  })
  it('cualquier cuerpo vale: vacío, no-JSON, lista', async () => {
    for (const c of ['', '{no es json', '[1,2]', 'null']) {
      const r = await llamar(c)
      expect(r.status).toBe(200)
      expect((await r.json()).ok).toBe(true)
    }
    expect(respuestaDeEco([1, 2]).eco).toMatchObject({ claves_recibidas: [] })
  })
  it('acota las claves que devuelve (40) y no explota con cuerpos enormes', () => {
    const grande = Object.fromEntries(Array.from({ length: 200 }, (_, i) => ['k' + i, i]))
    expect((respuestaDeEco(grande).eco as { claves_recibidas: string[] }).claves_recibidas).toHaveLength(40)
  })
})
