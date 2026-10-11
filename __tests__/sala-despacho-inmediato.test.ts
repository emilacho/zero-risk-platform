/**
 * DESPACHO INMEDIATO del repartidor · pruebas en seco (cero base, cero n8n, US$ 0).
 *   El sobre sale en cuanto entra a la sala (segundos, no hasta 15 min); el reloj queda de respaldo; NUNCA doble despacho; respeta los frenos; apagado por omisión.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { append, buildIdempotencyKey, InMemoryEventLogStorage, type EventAppendInput, type EventLogStorage } from '@/lib/sala-event-log'
import { consumeIntakeTick, despacharAlEntrar } from '@/lib/sala-router-consumer'
import { CLAIM_MARKER_PREFIX, DISPATCH_MARKER_PREFIX, GIVEUP_MARKER_PREFIX } from '@/lib/sala-router-consumer/types'

const TENANT = 'tenant-demo'
const CLIENT = '11111111-1111-4111-8111-111111111111'
let almacen: InMemoryEventLogStorage

async function sembrarSobre(sufijo: string): Promise<{ event_id: string; stream_id: string }> {
  const op = `ONBOARD.intake.ventas/deal-won.onboard.${sufijo}`
  const input: EventAppendInput = {
    tenant_id: TENANT, client_id: CLIENT, stream_id: `sala/v1/demo/${sufijo}`, correlation_id: `corr-${sufijo}`, causation_id: null,
    event_type: 'step_completed', journey_type: 'ONBOARD', operation_type: op,
    idempotency_key: buildIdempotencyKey({ operation_type: op, client_id: CLIENT, logical_period: '2026-W41' }),
    logical_period: '2026-W41', step_id: 'intake.ventas/deal-won.onboard', step_state: 'done',
    payload: { source: 'sala-ingress', intake_source: 'ventas/deal-won', intake_intent: 'onboard', intake_tier: 'B', intake_auth_method: 'hmac', worker_workflow_id: 'LyVoKcrypS5uLyuu', envelope_payload: { client_name: 'Cliente X' } },
    gate_type: null,
  }
  const r = await append(almacen, input)
  return { event_id: r.event.event_id, stream_id: input.stream_id }
}
const marcas = async (prefijo: string, stream?: string) =>
  (await almacen.select({ tenant_id: TENANT, event_type: 'step_completed', limit: 500 })).filter((e) => typeof e.step_id === 'string' && e.step_id.startsWith(prefijo) && (!stream || e.stream_id === stream))
const ON = { inmediato: true, consumidor: true, paquete: true }
const respuestas = { ok: async () => new Response('ok', { status: 200 }), mal: async () => new Response('boom', { status: 500 }) }
const contador = (resp: () => Promise<Response>) => { const llamadas: string[] = []; const f = (async (u: unknown) => { llamadas.push(String(u)); return resp() }) as unknown as typeof fetch; return { f, llamadas } }
const inmediato = (event_id: string, f: typeof fetch, extra: Record<string, unknown> = {}) =>
  despacharAlEntrar({ storage: almacen, tenant_id: TENANT, event_id, palancas: ON, enabled: true, n8n_base_url: 'https://n8n.test', fetcher: f, ...extra } as never)
const reloj = (f: typeof fetch, extra: Record<string, unknown> = {}) =>
  consumeIntakeTick({ storage: almacen, tenant_id: TENANT, enabled: true, n8n_base_url: 'https://n8n.test', fetcher: f, claim_before_fire: true, ...extra })

beforeEach(() => { almacen = new InMemoryEventLogStorage() })
afterEach(() => { for (const k of ['SALA_ROUTER_INMEDIATO_ENABLED', 'SALA_ROUTER_CONSUMER_ENABLED', 'SALA_ROUTER_PAQUETE_ENABLED']) delete process.env[k] })

describe('rojo de hoy: sin despacho inmediato el sobre espera al reloj', () => {
  it('un sobre que entra NO se dispara solo: queda pendiente hasta que corre un tic', async () => {
    const { f, llamadas } = contador(respuestas.ok)
    await sembrarSobre('a')
    expect(llamadas).toHaveLength(0); expect(await marcas(DISPATCH_MARKER_PREFIX)).toHaveLength(0)
    await reloj(f)
    expect(llamadas).toHaveLength(1)
  })
})

describe('verde: el sobre sale al entrar', () => {
  it('con las tres palancas: UN disparo, en milisegundos, y su marca de despacho', async () => {
    const { f, llamadas } = contador(respuestas.ok)
    const s = await sembrarSobre('a')
    const r = await inmediato(s.event_id, f)
    expect(r.intentado).toBe(true); expect(r.ms).toBeLessThan(2000)
    expect(r.tick!.outcomes).toHaveLength(1); expect(r.tick!.outcomes[0].kind).toBe('dispatched_ok')
    expect(llamadas).toHaveLength(1); expect(llamadas[0]).toContain('https://n8n.test/webhook/')
    expect(await marcas(CLAIM_MARKER_PREFIX, s.stream_id)).toHaveLength(1); expect(await marcas(DISPATCH_MARKER_PREFIX, s.stream_id)).toHaveLength(1)
  })
  it('SOLO ese sobre: otro pendiente en la libreta no sale (lo recoge el reloj)', async () => {
    const { f, llamadas } = contador(respuestas.ok)
    const a = await sembrarSobre('a'); const b = await sembrarSobre('b')
    await inmediato(b.event_id, f)
    expect(llamadas).toHaveLength(1)
    expect(await marcas(DISPATCH_MARKER_PREFIX, b.stream_id)).toHaveLength(1); expect(await marcas(DISPATCH_MARKER_PREFIX, a.stream_id)).toHaveLength(0)
    await reloj(f)
    expect(llamadas).toHaveLength(2) // el reloj despacha a y NO repite b
    expect(await marcas(DISPATCH_MARKER_PREFIX, a.stream_id)).toHaveLength(1)
  })
})

describe('NUNCA doble despacho', () => {
  it('el reloj corre DESPUÉS del inmediato: 0 disparos nuevos, contadores iguales', async () => {
    const { f, llamadas } = contador(respuestas.ok)
    const s = await sembrarSobre('a')
    await inmediato(s.event_id, f)
    const t = await reloj(f)
    expect(llamadas).toHaveLength(1); expect(t.outcomes).toHaveLength(0)
    expect(await marcas(DISPATCH_MARKER_PREFIX, s.stream_id)).toHaveLength(1); expect(await marcas(CLAIM_MARKER_PREFIX, s.stream_id)).toHaveLength(1)
  })
  it('el reloj corre ANTES: el inmediato no dispara nada', async () => {
    const { f, llamadas } = contador(respuestas.ok)
    const s = await sembrarSobre('a')
    await reloj(f)
    const r = await inmediato(s.event_id, f)
    expect(llamadas).toHaveLength(1); expect(r.tick!.outcomes).toHaveLength(0)
  })
  it('🔴 a la VEZ (inmediato y reloj corriendo juntos, 20 repeticiones con distintos retrasos): exactamente 1 disparo cada vez', async () => {
    for (let i = 0; i < 20; i++) {
      almacen = new InMemoryEventLogStorage()
      let n = 0
      const lento = (async () => { n++; await new Promise((r) => setTimeout(r, i % 5)); return new Response('ok', { status: 200 }) }) as unknown as typeof fetch
      const s = await sembrarSobre(`c${i}`)
      await Promise.all([inmediato(s.event_id, lento), reloj(lento), inmediato(s.event_id, lento), reloj(lento)])
      expect(n, `vuelta ${i}`).toBe(1)
      expect(await marcas(DISPATCH_MARKER_PREFIX, s.stream_id)).toHaveLength(1)
    }
  })
  it('dos entradas del MISMO sobre (duplicado) y dos inmediatos: sale una sola vez', async () => {
    const { f, llamadas } = contador(respuestas.ok)
    const a = await sembrarSobre('a'); const dup = await sembrarSobre('a') // misma clave de idempotencia ⇒ el mismo evento
    expect(dup.event_id).toBe(a.event_id)
    await Promise.all([inmediato(a.event_id, f), inmediato(dup.event_id, f)])
    expect(llamadas).toHaveLength(1)
  })
  it('un disparo que FALLA tras el reclamo queda PERDIDO y visible (giveup), y ni el reloj ni otro inmediato lo repiten', async () => {
    const mal = contador(respuestas.mal)
    const s = await sembrarSobre('a')
    const r = await inmediato(s.event_id, mal.f)
    expect(r.tick!.outcomes[0].kind).toBe('dispatched_failed')
    expect(await marcas(GIVEUP_MARKER_PREFIX, s.stream_id)).toHaveLength(1)
    const bien = contador(respuestas.ok)
    await reloj(bien.f); await inmediato(s.event_id, bien.f)
    expect(bien.llamadas).toHaveLength(0)
  })
})

describe('respeta frenos y palancas', () => {
  it('palanca propia apagada (por omisión), consumidor apagado o SIN el reclamo del paquete ⇒ no dispara (sin reclamo, inmediato + reloj podrían duplicar)', async () => {
    const { f, llamadas } = contador(respuestas.ok)
    const s = await sembrarSobre('a')
    expect((await inmediato(s.event_id, f, { palancas: { ...ON, inmediato: false } })).motivo).toBe('palanca_apagada')
    expect((await inmediato(s.event_id, f, { palancas: { ...ON, consumidor: false } })).motivo).toBe('consumidor_apagado')
    const sin = await inmediato(s.event_id, f, { palancas: { ...ON, paquete: false } })
    expect(sin).toMatchObject({ intentado: false, motivo: 'sin_reclamo_no_es_seguro' })
    expect(llamadas).toHaveLength(0)
    delete process.env.SALA_ROUTER_INMEDIATO_ENABLED
    expect((await despacharAlEntrar({ storage: almacen, tenant_id: TENANT, event_id: s.event_id })).motivo).toBe('palanca_apagada') // las palancas de entorno nacen apagadas
  })
  it('el tope de gasto sigue mandando: con el cliente por encima de su techo el sobre NO sale (skipped_cap_blocked) y no queda reclamado como si hubiera salido', async () => {
    const { f, llamadas } = contador(respuestas.ok)
    const s = await sembrarSobre('a')
    const r = await inmediato(s.event_id, f, { cap_enforce_override: true, cap_spend_query: async () => 999, cap_usd_query: async () => 1, cap_alerter: async () => undefined })
    expect(r.tick!.outcomes[0].kind).toBe('skipped_cap_blocked'); expect(llamadas).toHaveLength(0)
  })
  it('el dispatcher apagado se respeta: el sobre no sale', async () => {
    const { f, llamadas } = contador(respuestas.ok)
    const s = await sembrarSobre('a')
    const r = await inmediato(s.event_id, f, { enabled: false })
    expect(llamadas).toHaveLength(0); expect(r.tick!.outcomes[0].kind).toBe('skipped_dispatcher_off')
  })
  it('nunca lanza: un almacén que falla devuelve motivo «error» y no rompe a quien llama', async () => {
    const roto: EventLogStorage = { insert: async () => { throw new Error('base caída') }, select: async () => { throw new Error('base caída') }, findByIdempotencyKey: async () => { throw new Error('base caída') } } as never
    const r = await despacharAlEntrar({ storage: roto, tenant_id: TENANT, event_id: 'x', palancas: ON })
    expect(r).toMatchObject({ intentado: false, motivo: 'error' }); expect(r.detalle).toMatch(/base caída/)
  })
  it('el inmediato no corre el vigilante de reclamos (lo hace el reloj, una vez por tic)', async () => {
    const s = await sembrarSobre('a')
    const r = await inmediato(s.event_id, contador(respuestas.ok).f)
    expect((r.tick as { lost_claims?: unknown }).lost_claims).toBeUndefined()
  })
})
