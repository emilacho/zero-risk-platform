/**
 * r79 · D2 · el despacho inmediato fallaba en 4 de 12 sobres (todos con el hilo FUERA de los primeros 50 por orden alfabético de `stream_id`):
 * `sequence_desc` ordena primero por hilo, así que la «ventana de los últimos N» no era de los últimos. US$ 0, sin base ni n8n.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { append, buildIdempotencyKey, InMemoryEventLogStorage, type EventAppendInput } from '@/lib/sala-event-log'
import { consumeIntakeTick, despacharAlEntrar } from '@/lib/sala-router-consumer'
import { DISPATCH_MARKER_PREFIX } from '@/lib/sala-router-consumer/types'

const TENANT = 'tenant-demo'
const CLIENT = '11111111-1111-4111-8111-111111111111'
let almacen: InMemoryEventLogStorage
let t0 = Date.parse('2026-10-12T20:00:00Z')
const siguiente = () => new Date((t0 += 1000)).toISOString()

async function ruido(n: number): Promise<void> {
  // hilos viejos con muchos eventos de secuencia alta, que el orden por hilo pone ANTES de cualquier hilo nuevo con id alto
  for (let h = 0; h < 4; h++) for (let i = 0; i < n; i++) {
    const op = `RUIDO.${h}.${i}`
    await append(almacen, { tenant_id: TENANT, client_id: CLIENT, stream_id: `a-hilo-viejo-${h}`, correlation_id: `c-${h}`, causation_id: null, event_type: 'step_completed', journey_type: 'ONBOARD', operation_type: op, idempotency_key: buildIdempotencyKey({ operation_type: op, client_id: CLIENT, logical_period: `p${i}` }), logical_period: `p${i}`, step_id: `paso.${i}`, step_state: 'done', payload: {}, gate_type: null, occurred_at: siguiente() } as EventAppendInput)
  }
}
async function sobre(sufijo: string): Promise<{ event_id: string; stream_id: string }> {
  const op = `PROD.intake.brief/parte-listo.producir.${sufijo}`
  const stream_id = `z-sobre-${sufijo}`
  const r = await append(almacen, {
    tenant_id: TENANT, client_id: CLIENT, stream_id, correlation_id: `corr-${sufijo}`, causation_id: null, event_type: 'step_completed', journey_type: 'ONBOARD', operation_type: op,
    idempotency_key: buildIdempotencyKey({ operation_type: op, client_id: CLIENT, logical_period: 'p' }), logical_period: 'p', step_id: 'intake.brief/parte-listo.producir', step_state: 'done',
    payload: { source: 'sala-ingress', intake_source: 'brief/parte-listo', intake_intent: 'producir', intake_tier: 'A', intake_auth_method: 'internal_key', worker_workflow_id: 'bTbWL9lUvQCfStAz', envelope_payload: {} }, gate_type: null, occurred_at: siguiente(),
  } as EventAppendInput)
  return { event_id: r.event.event_id, stream_id }
}
const ON = { inmediato: true, consumidor: true, paquete: true }
const contador = () => { let n = 0; const f = (async () => { n++; return new Response('ok', { status: 200 }) }) as unknown as typeof fetch; return { f, n: () => n } }
const inmediato = (s: { event_id: string; stream_id?: string }, f: typeof fetch) => despacharAlEntrar({ storage: almacen, tenant_id: TENANT, event_id: s.event_id, ...(s.stream_id ? { stream_id: s.stream_id } : {}), palancas: ON, enabled: true, n8n_base_url: 'https://n8n.test', fetcher: f } as never)
const despachados = async () => (await almacen.select({ tenant_id: TENANT, event_type: 'step_completed', limit: 1000, order: 'occurred_at_desc' })).filter((e) => e.step_id?.startsWith(DISPATCH_MARKER_PREFIX)).length

beforeEach(() => { almacen = new InMemoryEventLogStorage(); t0 = Date.parse('2026-10-12T20:00:00Z') })

describe('D2 · 10 sobres seguidos en un cliente con la libreta llena: salen los 10 sin esperar al reloj', () => {
  it('con el hilo conocido (lo que manda la ruta): 10 de 10, aunque haya 120 eventos de ruido por delante', async () => {
    await ruido(30)
    const { f, n } = contador()
    for (let i = 0; i < 10; i++) {
      const s = await sobre(String(i))
      const r = await inmediato(s, f)
      expect(r.tick?.outcomes[0]?.kind, `sobre ${i}`).toBe('dispatched_ok')
    }
    expect(n()).toBe(10); expect(await despachados()).toBe(10)
  })
  it('aun SIN el hilo (puerta vieja): la ventana es de los más recientes, así que también salen 10 de 10', async () => {
    await ruido(30)
    const { f, n } = contador()
    for (let i = 0; i < 10; i++) {
      const r = await inmediato(await sobre(String(i)), f)
      expect(r.tick?.outcomes[0]?.kind, `sobre ${i}`).toBe('dispatched_ok')
    }
    expect(n()).toBe(10)
  })
  it('el reloj de respaldo también ve un sobre nuevo cuando la libreta tiene más eventos que su ventana', async () => {
    await ruido(80) // 320 eventos viejos, ventana de 200
    const { f, n } = contador()
    await sobre('nuevo')
    const t = await consumeIntakeTick({ storage: almacen, tenant_id: TENANT, enabled: true, n8n_base_url: 'https://n8n.test', fetcher: f, claim_before_fire: true })
    expect(t.outcomes.map((o) => o.kind)).toEqual(['dispatched_ok'])
    expect(n()).toBe(1)
  })
  it('con el hilo conocido, la lectura es solo de ese hilo (no depende de cuánto ruido haya)', async () => {
    await ruido(300) // 1.200 eventos
    const { f } = contador()
    const s = await sobre('x')
    const r = await inmediato(s, f)
    expect(r.tick?.scanned).toBe(1)
    expect(r.tick?.outcomes[0]?.kind).toBe('dispatched_ok')
  })
})

describe('D2 · sigue sin haber doble despacho', () => {
  it('inmediato y reloj a la vez sobre el mismo sobre: un solo disparo', async () => {
    await ruido(30)
    const { f, n } = contador()
    const s = await sobre('a')
    await Promise.all([inmediato(s, f), consumeIntakeTick({ storage: almacen, tenant_id: TENANT, enabled: true, n8n_base_url: 'https://n8n.test', fetcher: f, claim_before_fire: true })])
    expect(n()).toBe(1)
  })
})
