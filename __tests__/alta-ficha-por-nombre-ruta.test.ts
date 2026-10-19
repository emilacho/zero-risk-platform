/**
 * LA RUTA /api/alta/ficha-por-nombre (CC#1 · 19-oct): la llave interna manda (sin ella, 401 y no se toca la base), y con ella el pedido llega a la lógica.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ db: null as any, llamadas: 0 }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => { h.llamadas++; if (!h.db) throw new Error('base caida'); return h.db.db } }))
import { POST } from '../src/app/api/alta/ficha-por-nombre/route'

const LLAVE = 'llave-interna-de-prueba-de-la-puerta'
function base() {
  const clients: Array<Record<string, any>> = []
  const from = () => {
    const f: Array<(x: any) => boolean> = []
    let fila: any
    const api: any = {
      select: () => api, insert: (x: any) => { fila = x; return api }, delete: () => api,
      eq: (k: string, v: unknown) => { f.push((x) => x[k] === v); return api },
      filter: (k: string, _o: string, v: unknown) => { f.push((x) => (k === 'config->>creado_por' ? x.config?.creado_por : x[k]) === v); return api },
      gte: (k: string, v: string) => { f.push((x) => String(x[k]) >= v); return api },
      order: () => api,
      maybeSingle: async () => ({ data: clients.find((x) => f.every((p) => p(x))) ?? null, error: null }),
      single: async () => { const n = { id: 'n-' + (clients.length + 1), created_at: new Date().toISOString(), ...fila }; clients.push(n); return { data: n, error: null } },
      then: (res: any) => Promise.resolve({ data: clients.filter((c) => f.every((p) => p(c))), error: null }).then(res),
    }
    return api
  }
  return { db: { from }, clients }
}
const llamar = (cuerpo: unknown, llave: string | null = LLAVE) =>
  POST(new Request('http://local/api/alta/ficha-por-nombre', { method: 'POST', headers: { 'content-type': 'application/json', ...(llave ? { 'x-api-key': llave } : {}) }, body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) }))

beforeEach(() => { process.env.INTERNAL_API_KEY = LLAVE; h.llamadas = 0; h.db = base() })

describe('POST /api/alta/ficha-por-nombre', () => {
  it('sin llave, con llave equivocada o sin llave configurada en el servidor: 401 y la base NO se toca', async () => {
    const mundo = h.db
    for (const llave of [null, 'otra-llave-que-no-es', LLAVE.slice(0, -1)]) {
      const r = await llamar({ client_name: 'Uno' }, llave)
      expect(r.status).toBe(401)
    }
    delete process.env.INTERNAL_API_KEY
    expect((await llamar({ client_name: 'Uno' })).status).toBe(401)
    expect(h.llamadas).toBe(0)
    expect(mundo.clients).toHaveLength(0)
  })
  it('con la llave: crea la ficha (201), devuelve el id y la deja marcada con su origen', async () => {
    const r = await llamar({ client_name: 'Café Olón', industry: 'cafetería' })
    expect(r.status).toBe(201)
    const j = await r.json()
    expect(j).toMatchObject({ ok: true, creado: true, slug: 'cafe-olon' })
    expect(h.db.clients[0]).toMatchObject({ name: 'Café Olón', status: 'onboarding', config: { creado_por: 'puerta_trato_cerrado' } })
    expect(j.client_id).toBe(h.db.clients[0].id)
  })
  it('el mismo nombre otra vez: 200 y la misma ficha', async () => {
    await llamar({ client_name: 'Café Olón' })
    const r = await llamar({ client_name: 'cafe olon' })
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ creado: false })
    expect(h.db.clients).toHaveLength(1)
  })
  it('pedido inválido: 400 con la lista; JSON roto también', async () => {
    const r = await llamar({ client_name: '' })
    expect(r.status).toBe(400)
    expect((await r.json()).errores.length).toBeGreaterThan(0)
    expect((await llamar('{no es json')).status).toBe(400)
  })
  it('la cuarta ficha del día: 429', async () => {
    for (const n of ['Uno', 'Dos', 'Tres']) expect((await llamar({ client_name: n })).status).toBe(201)
    const r = await llamar({ client_name: 'Cuatro' })
    expect(r.status).toBe(429)
    expect(h.db.clients).toHaveLength(3)
  })
  it('si la base no responde: 503 y se dice (no un éxito falso)', async () => {
    h.db = null
    const r = await llamar({ client_name: 'Uno' })
    expect(r.status).toBe(503)
    expect((await r.json()).error).toBe('base_no_disponible')
  })
})
