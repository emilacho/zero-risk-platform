/**
 * POST /api/sala/intake · despacho inmediato EN LA RUTA (el sobre sale al entrar, en segundo plano) · pruebas en seco: libreta y fuentes en memoria, n8n simulado, US$ 0.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { InMemoryEventLogStorage, type EventLogStorage } from '@/lib/sala-event-log'
import { InMemoryIngressTables, type IngressTablesAdapter } from '@/lib/sala-ingress'

let tablas: InMemoryIngressTables
let almacen: InMemoryEventLogStorage
const segundoPlano: Array<Promise<unknown>> = []
let llamadasN8n: string[] = []
let alertasDeFreno = 0

vi.mock('@vercel/functions', () => ({ waitUntil: (p: Promise<unknown>) => { segundoPlano.push(p) } }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: vi.fn(() => ({})) }))
vi.mock('@/lib/sala-event-log', async () => {
  const actual = await vi.importActual<typeof import('@/lib/sala-event-log')>('@/lib/sala-event-log')
  return {
    ...actual,
    SupabaseEventLogStorage: class Falso implements EventLogStorage {
      insert(i: Parameters<EventLogStorage['insert']>[0]) { return almacen.insert(i) }
      select(f: Parameters<EventLogStorage['select']>[0]) { return almacen.select(f) }
      findByIdempotencyKey(t: string, k: string) { return almacen.findByIdempotencyKey(t, k) }
    },
  }
})
vi.mock('@/lib/sala-ingress/supabase-adapter', () => ({
  SupabaseIngressTables: class Falso implements IngressTablesAdapter {
    getSource(s: string) { return tablas.getSource(s) }
    getRoutingRule(s: string, i: string) { return tablas.getRoutingRule(s, i) }
  },
}))
vi.mock('@/lib/sala-router-consumer/cap-spend-query', () => ({
  wireCapSpendQuerySupabase: () => async () => { alertasDeFreno++; return 0 },
  wireCapUsdQuerySupabase: () => async () => null,
}))

const TENANT = 'tenant-demo'
const CLIENT = '11111111-1111-4111-8111-111111111111'
const cuerpo = (k = 'deal-1') => ({ source: 'emilio-manual', intent: 'onboard', payload: { client_name: 'Cliente X' }, idempotency_key: k, logical_period: '2026-W41', tenant_id: TENANT, client_id: CLIENT })
const pedido = (b: unknown) => new Request('https://x.test/api/sala/intake', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'k' }, body: JSON.stringify(b) })
const ruta = async () => (await import('../src/app/api/sala/intake/route')).POST
const marcas = async (p: string) => (await almacen.select({ tenant_id: TENANT, event_type: 'step_completed', limit: 500 })).filter((e) => typeof e.step_id === 'string' && e.step_id.startsWith(p))
const terminarSegundoPlano = async () => { await Promise.all(segundoPlano.splice(0)) }

beforeEach(() => {
  tablas = new InMemoryIngressTables()
    .seedSource({ source: 'emilio-manual', tier: 'A', auth_method: 'internal_key', auth_secret_env_var: null, intents_allowed: ['onboard'], description: null, active: true })
    .seedRule({ id: 'r1', source: 'emilio-manual', intent: 'onboard', journey_type: 'ONBOARD', worker_workflow_id: 'LyVoKcrypS5uLyuu', active: true, priority: 100, description: null })
  almacen = new InMemoryEventLogStorage(); segundoPlano.length = 0; llamadasN8n = []; alertasDeFreno = 0
  vi.stubGlobal('fetch', (async (u: unknown) => { llamadasN8n.push(String(u)); return new Response('ok', { status: 200 }) }) as unknown as typeof fetch)
  Object.assign(process.env, { SALA_INTAKE_ENABLED: 'true', INTERNAL_API_KEY: 'k', SALA_WORKFLOW_DISPATCH_ENABLED: 'true', N8N_BASE_URL: 'https://n8n.test' })
})
afterEach(() => { vi.unstubAllGlobals(); for (const k of ['SALA_INTAKE_ENABLED', 'INTERNAL_API_KEY', 'SALA_WORKFLOW_DISPATCH_ENABLED', 'N8N_BASE_URL', 'SALA_ROUTER_INMEDIATO_ENABLED', 'SALA_ROUTER_CONSUMER_ENABLED', 'SALA_ROUTER_PAQUETE_ENABLED']) delete process.env[k] })

describe('con la palanca APAGADA (hoy): todo igual', () => {
  it('el sobre se acepta, NO se dispara nada y la respuesta solo trae el campo nuevo «apagado»', async () => {
    const j = await (await (await ruta())(pedido(cuerpo()))).json()
    await terminarSegundoPlano()
    expect(j).toMatchObject({ ok: true, kind: 'accepted', inserted: true, despacho_inmediato: 'apagado' })
    expect(llamadasN8n).toHaveLength(0); expect(await marcas('router.')).toHaveLength(0)
  })
})

describe('con la palanca ENCENDIDA (y consumidor + paquete)', () => {
  beforeEach(() => Object.assign(process.env, { SALA_ROUTER_INMEDIATO_ENABLED: 'true', SALA_ROUTER_CONSUMER_ENABLED: 'true', SALA_ROUTER_PAQUETE_ENABLED: 'true' }))

  it('el sobre sale al entrar: la respuesta vuelve «programado» al instante y en segundo plano sale UN disparo con su reclamo y su marca', async () => {
    const t0 = Date.now()
    const j = await (await (await ruta())(pedido(cuerpo()))).json()
    expect(Date.now() - t0).toBeLessThan(2000)
    expect(j).toMatchObject({ ok: true, kind: 'accepted', despacho_inmediato: 'programado' })
    await terminarSegundoPlano()
    expect(llamadasN8n).toHaveLength(1); expect(llamadasN8n[0]).toContain('https://n8n.test/webhook/')
    expect(await marcas('router.claim.')).toHaveLength(1); expect(await marcas('router.dispatch.')).toHaveLength(1)
  })
  it('el mismo sobre enviado dos veces (reintento de quien llama): se acepta como duplicado y NO se dispara otra vez', async () => {
    const POST = await ruta()
    await POST(pedido(cuerpo())); await terminarSegundoPlano()
    const j2 = await (await POST(pedido(cuerpo()))).json()
    await terminarSegundoPlano()
    expect(j2.kind).toBe('duplicate'); expect(llamadasN8n).toHaveLength(1)
  })
  it('un duplicado NO programa despacho inmediato (solo lo hace el sobre nuevo)', async () => {
    const POST = await ruta()
    await POST(pedido(cuerpo())); await terminarSegundoPlano()
    await POST(pedido(cuerpo()))
    expect(segundoPlano).toHaveLength(0)
  })
  it('el reloj de respaldo después del inmediato: 0 disparos nuevos', async () => {
    await (await ruta())(pedido(cuerpo())); await terminarSegundoPlano()
    const { consumeIntakeTick } = await import('@/lib/sala-router-consumer')
    const t = await consumeIntakeTick({ storage: almacen, tenant_id: TENANT, enabled: true, n8n_base_url: 'https://n8n.test', claim_before_fire: true })
    expect(t.outcomes).toHaveLength(0); expect(llamadasN8n).toHaveLength(1)
  })
  it('sin el paquete (reclamo) la ruta NO dispara aunque la palanca esté encendida: el sobre queda para el reloj', async () => {
    delete process.env.SALA_ROUTER_PAQUETE_ENABLED
    const j = await (await (await ruta())(pedido(cuerpo()))).json()
    await terminarSegundoPlano()
    expect(j.ok).toBe(true); expect(llamadasN8n).toHaveLength(0); expect(await marcas('router.')).toHaveLength(0)
  })
  it('si el despacho falla en segundo plano, la respuesta de la entrada ya salió bien (no se rompe) y el fallo queda declarado', async () => {
    vi.stubGlobal('fetch', (async () => new Response('boom', { status: 500 })) as unknown as typeof fetch)
    const j = await (await (await ruta())(pedido(cuerpo()))).json()
    await terminarSegundoPlano()
    expect(j.ok).toBe(true); expect(await marcas('router.giveup.')).toHaveLength(1)
  })
})
