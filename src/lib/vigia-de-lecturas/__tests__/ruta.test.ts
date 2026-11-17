/** La ruta del vigía: llave interna, cuerpo validado, `dry_run` no toca la base ni Slack, y lo real pasa por la puerta de incidentes PROPIA del vigía (`incidentes.ts`). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const avisar = vi.fn(async () => ({ ok: true, accion: 'abrio', detalle: 'entregado' }))
const resolver = vi.fn(async () => ({ ok: true, accion: 'sin_incidente', detalle: 'nada' }))
const getSupabaseAdmin = vi.fn(() => ({ from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin }))
vi.mock('@/lib/vigia-de-lecturas/incidentes', () => ({ avisar: () => avisar, resolver: () => resolver, publicarEnSlack: () => vi.fn() }))

const pedir = (cuerpo: unknown, llave = 'llave-de-prueba') => new Request('http://x/api/vigia/lecturas', { method: 'POST', headers: { 'x-api-key': llave, 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })
const LLAVE_ROTA = { proveedor: 'apify', estado: 401, tipo_error: 'user-or-token-not-found', caidas_seguidas: 1 }

describe('POST /api/vigia/lecturas', () => {
  beforeEach(() => { vi.stubEnv('INTERNAL_API_KEY', 'llave-de-prueba'); avisar.mockClear(); resolver.mockClear(); getSupabaseAdmin.mockClear() })
  afterEach(() => vi.unstubAllEnvs())

  it('sin la llave interna → 401 y no decide nada', async () => {
    const { POST } = await import('@/app/api/vigia/lecturas/route')
    const r = await POST(pedir({ dry_run: false, lecturas: [LLAVE_ROTA] }, 'otra'))
    expect(r.status).toBe(401)
    expect(avisar).not.toHaveBeenCalled()
  })
  it('cuerpo inválido → 400 con el porqué', async () => {
    const { POST } = await import('@/app/api/vigia/lecturas/route')
    const r = await POST(pedir({ lecturas: [LLAVE_ROTA] }))
    expect(r.status).toBe(400)
    expect((await r.json()).detalle).toContain('dry_run')
  })
  it('dry_run → devuelve las acciones sin tocar base ni Slack', async () => {
    const { POST } = await import('@/app/api/vigia/lecturas/route')
    const r = await POST(pedir({ dry_run: true, lecturas: [LLAVE_ROTA] }))
    const j = await r.json()
    expect(r.status).toBe(200)
    expect(j.acciones[0]).toMatchObject({ tipo: 'avisar', clave: 'lectura:apify' })
    expect(getSupabaseAdmin).not.toHaveBeenCalled()
    expect(avisar).not.toHaveBeenCalled()
  })
  it('real → avisa por la puerta de incidentes con la clave del proveedor; un 200 resuelve', async () => {
    const { POST } = await import('@/app/api/vigia/lecturas/route')
    const r = await POST(pedir({ dry_run: false, lecturas: [LLAVE_ROTA, { proveedor: 'supabase', estado: 200 }] }))
    expect(r.status).toBe(200)
    expect(avisar).toHaveBeenCalledWith(expect.stringContaining('respondió 401'), 'lectura:apify')
    expect(resolver).toHaveBeenCalledWith('lectura:supabase', expect.stringContaining('volvió'))
  })
  it('si Slack no confirma, la ruta responde 502 (el flujo lo ve como falla)', async () => {
    avisar.mockResolvedValueOnce({ ok: false, accion: 'fallo', detalle: 'Slack respondió 500' })
    const { POST } = await import('@/app/api/vigia/lecturas/route')
    const r = await POST(pedir({ dry_run: false, lecturas: [LLAVE_ROTA] }))
    expect(r.status).toBe(502)
  })
})
