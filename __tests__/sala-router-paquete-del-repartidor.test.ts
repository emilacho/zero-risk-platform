/**
 * EL PAQUETE DEL REPARTIDOR · CC#1 · 2026-09-30 · pruebas en seco (cero base, cero n8n, US$ 0) · «lo aprobado» del encargo §4:
 *   1 · con el candado, dos tics NO pueden coexistir (se provoca)
 *   2 · con el tope, un tic colgado muere dentro de su ciclo (con hora)
 *   3 · ③ en los DOS sentidos: el sobre queda marcado ANTES del disparo · un disparo fallido lo deja PERDIDO y VISIBLE, nunca duplicado
 *   4 · el vigilante CAZA el sobre perdido y avisa (una sola vez)
 *   5 · con la palanca APAGADA todo se comporta como hoy
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { append, buildIdempotencyKey, InMemoryEventLogStorage, type EventAppendInput, type EventLogStorage } from '@/lib/sala-event-log'
import { consumeIntakeTick, findLostClaims, CandadoEnMemoria } from '@/lib/sala-router-consumer'
import {
  ATTEMPT_MARKER_PREFIX,
  CLAIM_MARKER_PREFIX,
  CLAIM_STALE_MS,
  DISPATCH_MARKER_PREFIX,
  GIVEUP_MARKER_PREFIX,
  LOST_ALERT_MARKER_PREFIX,
} from '@/lib/sala-router-consumer/types'

// ── la ruta: el candado real se cambia por uno en memoria compartido, y el almacén por uno con compuerta ────────────────────────────────
let almacen: InMemoryEventLogStorage
let compuertaDeLectura: Promise<void> | null = null
let lecturas = 0
const candadoCompartido = new CandadoEnMemoria()
let pidioCandadoReal = 0
vi.mock('@/lib/internal-auth', () => ({ checkInternalKey: vi.fn((r: Request) => (r.headers.get('x-api-key') === 'k' ? { ok: true as const } : { ok: false as const, reason: 'x' })) }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: vi.fn(() => ({})) }))
vi.mock('@/lib/sala-router-consumer/lock', async () => {
  const actual = await vi.importActual<typeof import('@/lib/sala-router-consumer/lock')>('@/lib/sala-router-consumer/lock')
  return { ...actual, candadoEnSupabase: () => { pidioCandadoReal++; return candadoCompartido } }
})
vi.mock('@/lib/sala-event-log', async () => {
  const actual = await vi.importActual<typeof import('@/lib/sala-event-log')>('@/lib/sala-event-log')
  return {
    ...actual,
    SupabaseEventLogStorage: class Falso implements EventLogStorage {
      insert(i: Parameters<EventLogStorage['insert']>[0]) { return almacen.insert(i) }
      async select(f: Parameters<EventLogStorage['select']>[0]) { lecturas++; if (compuertaDeLectura) await compuertaDeLectura; return almacen.select(f) }
      findByIdempotencyKey(t: string, k: string) { return almacen.findByIdempotencyKey(t, k) }
    },
  }
})
const rutaPOST = async () => (await import('../src/app/api/sala/router/consume/route')).POST
const pedido = () => new Request('https://x.test/api/sala/router/consume', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'k' }, body: JSON.stringify({ tenant_id: TENANT }) })

// ── el mundo de juguete ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
const TENANT = 'naufrago'
const CLIENT = 'd69100b5-8ad7-4bb0-908c-68b5544065dc'
async function sembrarSobre(storage: InMemoryEventLogStorage, sufijo: string) {
  const op = `ONBOARD.intake.ventas/deal-won.onboard.${sufijo}`
  const input: EventAppendInput = {
    tenant_id: TENANT, client_id: CLIENT, stream_id: `sala/v1/naufrago/${sufijo}`, correlation_id: `corr-${sufijo}`, causation_id: null,
    event_type: 'step_completed', journey_type: 'ONBOARD', operation_type: op,
    idempotency_key: buildIdempotencyKey({ operation_type: op, client_id: CLIENT, logical_period: '2026-W40' }),
    logical_period: '2026-W40', step_id: 'intake.ventas/deal-won.onboard', step_state: 'done',
    payload: { source: 'sala-ingress', intake_source: 'ventas/deal-won', intake_intent: 'onboard', intake_tier: 'B', intake_auth_method: 'hmac', worker_workflow_id: 'LyVoKcrypS5uLyuu', envelope_payload: { client_name: 'Naufrago' } },
    gate_type: null,
  }
  await append(storage, input)
  return input.stream_id
}
const marcasDe = async (s: InMemoryEventLogStorage, prefijo: string) =>
  (await s.select({ tenant_id: TENANT, event_type: 'step_completed', limit: 500 })).filter((e) => typeof e.step_id === 'string' && e.step_id.startsWith(prefijo))
const tic = (storage: InMemoryEventLogStorage, fetcher: typeof fetch, extra: Record<string, unknown> = {}) =>
  consumeIntakeTick({ tenant_id: TENANT, enabled: true, n8n_base_url: 'https://n8n.test', storage, fetcher, ...extra })
const anda = async () => new Response('ok', { status: 200 })
const falla = async () => new Response('boom', { status: 500 })

beforeEach(() => { almacen = new InMemoryEventLogStorage(); compuertaDeLectura = null; lecturas = 0; pidioCandadoReal = 0; process.env.SALA_ROUTER_CONSUMER_ENABLED = 'true' })
afterEach(() => { delete process.env.SALA_ROUTER_PAQUETE_ENABLED; delete process.env.SALA_ROUTER_CONSUMER_ENABLED; delete process.env.SALA_ROUTER_TICK_DEADLINE_MS })

describe('① el candado · dos tics no pueden coexistir', () => {
  it('🔴 con la palanca ENCENDIDA: mientras el tic A trabaja, el tic B sale al instante con «tic_en_curso» y NO lee la fila · al terminar A, el siguiente sí corre', async () => {
    process.env.SALA_ROUTER_PAQUETE_ENABLED = 'true'
    const POST = await rutaPOST()
    let abrir!: () => void
    compuertaDeLectura = new Promise<void>((r) => { abrir = r })
    const A = POST(pedido())
    await new Promise((r) => setTimeout(r, 20)) // A ya tiene el candado y espera en la lectura
    expect(lecturas).toBe(1)
    const rB = await POST(pedido())
    const jB = await rB.json()
    expect(jB).toMatchObject({ ok: true, skipped: 'tic_en_curso', tick: null })
    expect(lecturas).toBe(1) // 🔴 B no leyó nada: no hay pila
    abrir()
    expect((await (await A).json()).tick).toBeTruthy()
    compuertaDeLectura = null
    const jC = await (await POST(pedido())).json()
    expect(jC.tick).toBeTruthy() // el candado se soltó
    expect(lecturas).toBe(2)
  })
  it('el candado en memoria vence solo por TTL si su dueño muere · y sólo lo suelta su dueño', async () => {
    let t = 1_000_000
    const c = new CandadoEnMemoria(() => t)
    const a = await c.tomar(90_000)
    expect(a.ok).toBe(true)
    expect(await c.tomar(90_000)).toEqual({ ok: false, motivo: 'tic_en_curso' })
    await c.soltar('otro-holder')
    expect((await c.tomar(90_000)).ok).toBe(false) // un extraño no lo suelta
    t += 90_001
    expect((await c.tomar(90_000)).ok).toBe(true) // venció
  })
})

describe('② el tope de tiempo · el tic colgado muere dentro de su ciclo', () => {
  it('🔴 un tic que no termina (la base no responde) sale con 504 tick_timeout a la hora del tope · medido', async () => {
    process.env.SALA_ROUTER_PAQUETE_ENABLED = 'true'
    process.env.SALA_ROUTER_TICK_DEADLINE_MS = '80'
    const POST = await rutaPOST()
    compuertaDeLectura = new Promise<void>(() => { /* nunca se abre: la base colgada */ })
    const t0 = Date.now()
    const r = await POST(pedido())
    const dur = Date.now() - t0
    expect(r.status).toBe(504)
    expect((await r.json()).code).toBe('tick_timeout')
    expect(dur).toBeGreaterThanOrEqual(75)
    expect(dur).toBeLessThan(1000) // murió dentro de su ciclo, no a los minutos
  })
  it('pasado el tope, el orquestador NO toma más sobres (los deja para el próximo tic)', async () => {
    await sembrarSobre(almacen, 'tope-a')
    const fetcher = vi.fn(anda)
    const r = await tic(almacen, fetcher as never, { claim_before_fire: true, deadline_at_ms: Date.now() - 1 })
    expect(r.stopped_by_deadline).toBe(true)
    expect(r.processed).toBe(0)
    expect(fetcher).not.toHaveBeenCalled()
    expect((await tic(almacen, fetcher as never, { claim_before_fire: true })).processed).toBe(1) // el sobre seguía en la fila
  })
})

describe('③ marcar ANTES de disparar · en los dos sentidos', () => {
  it('🔴 sentido 1: cuando el disparo sale, el reclamo YA está escrito (el orden es reclamo → disparo → despacho)', async () => {
    await sembrarSobre(almacen, 'orden-a')
    let reclamosAlDisparar = -1
    const fetcher = (async () => { reclamosAlDisparar = (await marcasDe(almacen, CLAIM_MARKER_PREFIX)).length; return new Response('ok', { status: 200 }) }) as unknown as typeof fetch
    await tic(almacen, fetcher, { claim_before_fire: true })
    expect(reclamosAlDisparar).toBe(1) // 🔴 con «marcar después» esto era 0
    expect((await marcasDe(almacen, DISPATCH_MARKER_PREFIX)).length).toBe(1)
    expect((await marcasDe(almacen, GIVEUP_MARKER_PREFIX)).length).toBe(0)
  })
  it('🔴 sentido 2: un disparo FALLIDO deja el sobre PERDIDO y VISIBLE (giveup con motivo) · y el siguiente tic NO lo re-dispara', async () => {
    await sembrarSobre(almacen, 'falla-a')
    const f1 = vi.fn(falla)
    await tic(almacen, f1 as never, { claim_before_fire: true })
    const perdidos = await marcasDe(almacen, GIVEUP_MARKER_PREFIX)
    expect(perdidos).toHaveLength(1)
    expect(perdidos[0].payload).toMatchObject({ perdido_tras_reclamo: true, no_pude_despachar: true, despachado: false })
    expect(String((perdidos[0].payload as Record<string, unknown>).motivo)).toMatch(/PIERDE a propósito/)
    expect((await marcasDe(almacen, DISPATCH_MARKER_PREFIX)).length).toBe(0)
    const f2 = vi.fn(anda)
    const r2 = await tic(almacen, f2 as never, { claim_before_fire: true })
    expect(f2).not.toHaveBeenCalled() // 🔴 nunca duplicado
    expect(r2.processed).toBe(0)
  })
  it('un tic que MUERE justo tras reclamar (sin desenlace) tampoco re-dispara el sobre', async () => {
    const stream = await sembrarSobre(almacen, 'muerte-a')
    // el reclamo lo escribe el propio orquestador: se provoca la muerte con un disparador que nunca vuelve + el tope de tiempo del tic
    const colgado = (() => new Promise<Response>(() => {})) as unknown as typeof fetch
    void tic(almacen, colgado, { claim_before_fire: true }) // queda colgado tras reclamar
    await new Promise((r) => setTimeout(r, 30))
    expect((await marcasDe(almacen, CLAIM_MARKER_PREFIX)).length).toBe(1)
    const f = vi.fn(anda)
    const r = await tic(almacen, f as never, { claim_before_fire: true })
    expect(f).not.toHaveBeenCalled()
    expect(r.processed).toBe(0)
    expect(stream).toBeTruthy()
  })
  it('dos tics al MISMO sobre a la vez: el disparo sale UNA sola vez (el reclamo es atómico por clave de idempotencia)', async () => {
    await sembrarSobre(almacen, 'carrera-a')
    let llamadas = 0
    let suelta!: () => void
    const puerta = new Promise<void>((r) => { suelta = r })
    const fetcher = (async () => { llamadas++; await puerta; return new Response('ok', { status: 200 }) }) as unknown as typeof fetch
    const A = tic(almacen, fetcher, { claim_before_fire: true })
    const B = tic(almacen, fetcher, { claim_before_fire: true })
    await new Promise((r) => setTimeout(r, 30))
    suelta()
    const [ra, rb] = await Promise.all([A, B])
    expect(llamadas).toBe(1)
    expect([ra, rb].flatMap((r) => r.outcomes.map((o) => o.kind)).sort()).toEqual(['dispatched_ok', 'skipped_already_claimed'])
  })
  it('con el despachador APAGADO no se reclama (el sobre vuelve a la fila como siempre)', async () => {
    await sembrarSobre(almacen, 'apagado-a')
    const f = vi.fn(anda)
    await consumeIntakeTick({ tenant_id: TENANT, enabled: false, n8n_base_url: 'https://n8n.test', storage: almacen, fetcher: f as never, claim_before_fire: true })
    expect((await marcasDe(almacen, CLAIM_MARKER_PREFIX)).length).toBe(0)
    expect(f).not.toHaveBeenCalled()
  })
})

describe('⑤ el vigilante caza el sobre perdido y avisa UNA vez', () => {
  it('🔴 un reclamo sin desenlace de más de 5 min se avisa · el aviso queda escrito · el tic siguiente no repite', async () => {
    await sembrarSobre(almacen, 'vigia-a')
    const colgado = (() => new Promise<Response>(() => {})) as unknown as typeof fetch
    void tic(almacen, colgado, { claim_before_fire: true })
    await new Promise((r) => setTimeout(r, 30))
    const aviso = vi.fn(async () => ({ avisado: true }))
    const en6min = () => Date.now() + CLAIM_STALE_MS + 60_000
    const r1 = await tic(almacen, vi.fn(anda) as never, { claim_before_fire: true, now_ms: en6min, lost_alerter: aviso })
    expect(aviso).toHaveBeenCalledTimes(1)
    expect(r1.lost_claims).toHaveLength(1)
    expect((await marcasDe(almacen, LOST_ALERT_MARKER_PREFIX)).length).toBe(1)
    const r2 = await tic(almacen, vi.fn(anda) as never, { claim_before_fire: true, now_ms: en6min, lost_alerter: aviso })
    expect(aviso).toHaveBeenCalledTimes(1) // 🔴 una sola vez
    expect(r2.lost_claims).toHaveLength(0)
  })
  it('un reclamo FRESCO, o con despacho, o con abandono declarado, NO es un sobre perdido', async () => {
    await sembrarSobre(almacen, 'vigia-b')
    await tic(almacen, vi.fn(anda) as never, { claim_before_fire: true }) // reclamo + despacho
    await sembrarSobre(almacen, 'vigia-c')
    await tic(almacen, vi.fn(falla) as never, { claim_before_fire: true }) // reclamo + abandono declarado
    const todos = await almacen.select({ tenant_id: TENANT, event_type: 'step_completed', limit: 500 })
    expect(findLostClaims({ events: todos, now_ms: Date.now() + CLAIM_STALE_MS * 10 })).toHaveLength(0)
    await sembrarSobre(almacen, 'vigia-d')
    void tic(almacen, (() => new Promise<Response>(() => {})) as unknown as typeof fetch, { claim_before_fire: true })
    await new Promise((r) => setTimeout(r, 30))
    const todos2 = await almacen.select({ tenant_id: TENANT, event_type: 'step_completed', limit: 500 })
    expect(findLostClaims({ events: todos2, now_ms: Date.now() + 60_000 })).toHaveLength(0) // fresco
    expect(findLostClaims({ events: todos2, now_ms: Date.now() + CLAIM_STALE_MS + 60_000 })).toHaveLength(1) // viejo
  })
  it('si la campana falla, el tic NO se rompe y el próximo reintenta el aviso', async () => {
    await sembrarSobre(almacen, 'vigia-e')
    void tic(almacen, (() => new Promise<Response>(() => {})) as unknown as typeof fetch, { claim_before_fire: true })
    await new Promise((r) => setTimeout(r, 30))
    const rota = vi.fn(async () => { throw new Error('slack caído') })
    const r = await tic(almacen, vi.fn(anda) as never, { claim_before_fire: true, now_ms: () => Date.now() + CLAIM_STALE_MS + 60_000, lost_alerter: rota })
    expect(r.processed).toBe(0)
    expect((await marcasDe(almacen, LOST_ALERT_MARKER_PREFIX)).length).toBe(0) // sin aviso no hay asiento: se reintenta
  })
})

describe('5 · con la palanca APAGADA todo se comporta como hoy', () => {
  it('🔴 sin claim_before_fire: un disparo fallido deja INTENTO y el sobre VUELVE a la fila · ni reclamos ni avisos ni claves nuevas en el resultado', async () => {
    await sembrarSobre(almacen, 'off-a')
    const r1 = await tic(almacen, vi.fn(falla) as never)
    expect((await marcasDe(almacen, ATTEMPT_MARKER_PREFIX)).length).toBe(1)
    expect((await marcasDe(almacen, CLAIM_MARKER_PREFIX)).length).toBe(0)
    expect(Object.keys(r1)).toEqual(['tick_id', 'started_at', 'finished_at', 'scanned', 'processed', 'outcomes'])
    expect((await tic(almacen, vi.fn(anda) as never)).processed).toBe(1) // volvió a la fila
  })
  it('🔴 la ruta con la palanca apagada NO pide el candado ni pone tope de tiempo: camino de siempre', async () => {
    const POST = await rutaPOST()
    const r = await POST(pedido())
    const j = await r.json()
    expect(r.status).toBe(200)
    expect(j.ok).toBe(true)
    expect(pidioCandadoReal).toBe(0)
    expect('skipped' in j).toBe(false)
    expect('took_ms' in j).toBe(false)
  })
  it('sólo el valor literal «true» enciende la palanca', async () => {
    const POST = await rutaPOST()
    for (const v of ['1', 'TRUE', 'yes', '']) {
      process.env.SALA_ROUTER_PAQUETE_ENABLED = v
      await POST(pedido())
    }
    expect(pidioCandadoReal).toBe(0)
    process.env.SALA_ROUTER_PAQUETE_ENABLED = 'true'
    await POST(pedido())
    expect(pidioCandadoReal).toBe(1)
  })
})
