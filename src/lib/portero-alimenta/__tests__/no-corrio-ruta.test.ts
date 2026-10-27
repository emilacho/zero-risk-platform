/** La ruta de la alarma «no corrió» con sus puertas: secreto del cron, llave interna, GET actúa / POST por omisión ensaya. US$ 0 · sin red (base y Slack simulados). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { crearBaseFalsa } from './base-falsa'

const C = '99999999-9999-4999-8999-999999999999'
const mensajes: string[] = []
let base: ReturnType<typeof crearBaseFalsa>

vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => base.db }))
vi.mock('@/lib/portero-alimenta/avisos', () => ({
  avisarAAlertas: () => async (t: string) => { mensajes.push(t); return { ok: true, detalle: 'entregado' } },
  estadoDelFlujoDelPortero: () => async () => ({ ok: true, activo: true }),
}))

import { GET, POST } from '../../../app/api/brain/alimentar/no-corrio/route'

const URL_ = 'http://x/api/brain/alimentar/no-corrio'
const SECRETO = 'secreto-del-cron-123'
const LLAVE = 'llave-interna-456'

beforeEach(() => {
  mensajes.length = 0
  base = crearBaseFalsa({
    clients: [{ id: C, name: 'Cliente Zeta', status: 'active', archived_at: null, config: {} }],
    client_brand_books: [{ id: 'mb', client_id: C }],
    client_historical_outputs: [{ id: 'pl', client_id: C, output_type: 'campaign_plan_90d', provenance_tag: {} }],
    cerebro_portero_corridas: [], // nunca corrió ⇒ habría aviso
  } as never)
  vi.stubEnv('CRON_SECRET', SECRETO)
  vi.stubEnv('INTERNAL_API_KEY', LLAVE)
  vi.stubEnv('PORTERO_ALIMENTAR', 'on')
  vi.stubEnv('N8N_BASE_URL', 'http://n8n.prueba')
  vi.stubGlobal('fetch', async () => new Response('ok', { status: 200 })) // n8n contesta: esta prueba no mide ese chequeo
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('puertas', () => {
  it('el secreto del cron correcto entra; uno equivocado del mismo largo no; sin nada, no', async () => {
    expect((await GET(new Request(URL_, { headers: { authorization: `Bearer ${SECRETO}` } }))).status).toBe(200)
    expect((await GET(new Request(URL_, { headers: { authorization: `Bearer ${'x'.repeat(SECRETO.length)}` } }))).status).toBe(401)
    expect((await GET(new Request(URL_, { headers: { authorization: 'Bearer corto' } }))).status).toBe(401)
    expect((await GET(new Request(URL_))).status).toBe(401)
  })
  it('la llave interna también entra (x-api-key); una equivocada no', async () => {
    expect((await GET(new Request(URL_, { headers: { 'x-api-key': LLAVE } }))).status).toBe(200)
    expect((await GET(new Request(URL_, { headers: { 'x-api-key': 'otra' } }))).status).toBe(401)
  })
})

describe('GET actúa; POST ensaya salvo dry_run:false', () => {
  it('GET (el cron de Vercel) AVISA de verdad', async () => {
    const r = await GET(new Request(URL_, { headers: { authorization: `Bearer ${SECRETO}` } }))
    const j = await r.json()
    expect(j.dry_run).toBe(false)
    expect(mensajes).toHaveLength(1)
    expect(mensajes[0]).toContain('ogfq56oIEoHufFPM') // el flujo del portero por omisión
  })
  it('PORTERO_WORKFLOW_ID cambia el flujo nombrado en la línea', async () => {
    vi.stubEnv('PORTERO_WORKFLOW_ID', 'otroFlujo12345')
    await GET(new Request(URL_, { headers: { authorization: `Bearer ${SECRETO}` } }))
    expect(mensajes[0]).toContain('otroFlujo12345')
  })
  it('POST sin cuerpo o con {} ensaya: evalúa y NO avisa', async () => {
    for (const body of [undefined, '{}', '{"dry_run":true}', '{"dry_run":"no"}']) {
      const r = await POST(new Request(URL_, { method: 'POST', headers: { 'x-api-key': LLAVE }, body }))
      expect((await r.json()).dry_run).toBe(true)
    }
    expect(mensajes).toEqual([])
  })
  it('POST con dry_run:false avisa de verdad', async () => {
    const r = await POST(new Request(URL_, { method: 'POST', headers: { 'x-api-key': LLAVE }, body: '{"dry_run":false}' }))
    expect((await r.json()).dry_run).toBe(false)
    expect(mensajes).toHaveLength(1)
  })
})
