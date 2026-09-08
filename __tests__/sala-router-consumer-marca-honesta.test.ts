/**
 * ROJO/VERDE · "sólo se marca lo que efectivamente se despachó".
 * Regla fijada por Lenovo · 2026-09-07 · sobre la medición de CC#2.
 *
 * EL ROJO que este archivo fija: antes de este cambio, un disparo FALLIDO
 * escribía la marca `router.dispatch.*` — la misma que excluye el hilo para
 * siempre. Un fallo quedaba escrito como un éxito y el sobre se perdía.
 *
 * Estas pruebas fallan contra el código viejo y pasan contra el nuevo.
 */
import { describe, it, expect } from 'vitest'
import {
  append,
  buildIdempotencyKey,
  InMemoryEventLogStorage,
  type EventAppendInput,
} from '@/lib/sala-event-log'
import { consumeIntakeTick } from '@/lib/sala-router-consumer'
import {
  ATTEMPT_MARKER_PREFIX,
  DISPATCH_MARKER_PREFIX,
  GIVEUP_MARKER_PREFIX,
  MAX_DISPATCH_ATTEMPTS,
} from '@/lib/sala-router-consumer/types'

const TENANT = 'naufrago'
const CLIENT = 'd69100b5-8ad7-4bb0-908c-68b5544065dc'

async function sembrarSobre(storage: InMemoryEventLogStorage, sufijo: string, journey = 'ONBOARD') {
  const op = `${journey}.intake.ventas/deal-won.onboard.${sufijo}`
  const input: EventAppendInput = {
    tenant_id: TENANT,
    client_id: CLIENT,
    stream_id: `sala/v1/naufrago/${sufijo}`,
    correlation_id: `corr-${sufijo}`,
    causation_id: null,
    event_type: 'step_completed',
    journey_type: journey as EventAppendInput['journey_type'],
    operation_type: op,
    idempotency_key: buildIdempotencyKey({
      operation_type: op,
      client_id: CLIENT,
      logical_period: '2026-W36',
    }),
    logical_period: '2026-W36',
    step_id: 'intake.ventas/deal-won.onboard',
    step_state: 'done',
    payload: {
      source: 'sala-ingress',
      intake_source: 'ventas/deal-won',
      intake_intent: 'onboard',
      intake_tier: 'B',
      intake_auth_method: 'hmac',
      worker_workflow_id: 'LyVoKcrypS5uLyuu',
      envelope_payload: { client_name: 'Naufrago' },
    },
    gate_type: null,
  }
  await append(storage, input)
  return input.stream_id
}

const marcasDe = async (storage: InMemoryEventLogStorage, prefijo: string) => {
  const todos = await storage.select({ tenant_id: TENANT, event_type: 'step_completed', limit: 500 })
  return todos.filter((e) => typeof e.step_id === 'string' && e.step_id.startsWith(prefijo))
}

// un disparador que SIEMPRE falla · reproduce `dispatched_failed`
const disparoQueFalla = async () => new Response('boom', { status: 500 })
// un disparador que SIEMPRE anda
const disparoQueAnda = async () => new Response('ok', { status: 200 })

describe('🔴 la marca de despacho NO se escribe cuando el disparo falla', () => {
  it('un disparo fallido deja INTENTO, no DESPACHO', async () => {
    const storage = new InMemoryEventLogStorage()
    await sembrarSobre(storage, 'falla1')

    await consumeIntakeTick({
      tenant_id: TENANT,
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      storage,
      fetcher: disparoQueFalla,
    })

    expect((await marcasDe(storage, DISPATCH_MARKER_PREFIX)).length).toBe(0)
    expect((await marcasDe(storage, ATTEMPT_MARKER_PREFIX)).length).toBe(1)
  })

  it('el sobre VUELVE A LA FILA en el siguiente tick', async () => {
    const storage = new InMemoryEventLogStorage()
    await sembrarSobre(storage, 'vuelve1')

    const t1 = await consumeIntakeTick({
      tenant_id: TENANT, enabled: true, n8n_base_url: 'https://n8n.test',
      storage, fetcher: disparoQueFalla,
    })
    const t2 = await consumeIntakeTick({
      tenant_id: TENANT, enabled: true, n8n_base_url: 'https://n8n.test',
      storage, fetcher: disparoQueFalla,
    })

    expect(t1.processed).toBe(1)
    expect(t2.processed).toBe(1) // 🔴 con el código viejo esto era 0: el sobre moría
  })

  it('al agotar el tope se ABANDONA con motivo visible · y recién ahí deja de volver', async () => {
    const storage = new InMemoryEventLogStorage()
    await sembrarSobre(storage, 'tope1')

    for (let i = 0; i < MAX_DISPATCH_ATTEMPTS; i++) {
      await consumeIntakeTick({
        tenant_id: TENANT, enabled: true, n8n_base_url: 'https://n8n.test',
        storage, fetcher: disparoQueFalla,
      })
    }
    const abandonos = await marcasDe(storage, GIVEUP_MARKER_PREFIX)
    expect(abandonos.length).toBe(1)

    const p = abandonos[0].payload as Record<string, unknown>
    expect(p.despachado).toBe(false)
    expect(p.no_pude_despachar).toBe(true)
    expect(String(p.motivo)).toContain('NO PUDE DESPACHAR')
    expect(p.max_attempts).toBe(MAX_DISPATCH_ATTEMPTS)

    // y ahora sí deja de volver a la fila · pero declarado, no callado
    const extra = await consumeIntakeTick({
      tenant_id: TENANT, enabled: true, n8n_base_url: 'https://n8n.test',
      storage, fetcher: disparoQueFalla,
    })
    expect(extra.processed).toBe(0)
    expect((await marcasDe(storage, DISPATCH_MARKER_PREFIX)).length).toBe(0)
  })
})

describe('🔴 un viaje sin mapear se rechaza RUIDOSAMENTE, no se marca como hecho', () => {
  it('PRODUCE no está en el mapa · deja intento, no despacho, y vuelve', async () => {
    const storage = new InMemoryEventLogStorage()
    await sembrarSobre(storage, 'produce1', 'PRODUCE')

    const t1 = await consumeIntakeTick({
      tenant_id: TENANT, enabled: true, n8n_base_url: 'https://n8n.test',
      storage, fetcher: disparoQueAnda,
    })
    expect(t1.outcomes[0]?.kind).toBe('skipped_unknown_journey')
    expect((await marcasDe(storage, DISPATCH_MARKER_PREFIX)).length).toBe(0)

    // 🔴 lo importante para el sprint: el sobre SOBREVIVE hasta que el mapa exista
    const t2 = await consumeIntakeTick({
      tenant_id: TENANT, enabled: true, n8n_base_url: 'https://n8n.test',
      storage, fetcher: disparoQueAnda,
    })
    expect(t2.processed).toBe(1)
  })
})

describe('🟢 lo que SÍ se despachó se marca como siempre', () => {
  it('un disparo exitoso escribe DESPACHO y excluye el hilo', async () => {
    const storage = new InMemoryEventLogStorage()
    await sembrarSobre(storage, 'ok1')

    const t1 = await consumeIntakeTick({
      tenant_id: TENANT, enabled: true, n8n_base_url: 'https://n8n.test',
      storage, fetcher: disparoQueAnda,
    })
    expect(t1.outcomes[0]?.kind).toBe('dispatched_ok')

    const marcas = await marcasDe(storage, DISPATCH_MARKER_PREFIX)
    expect(marcas.length).toBe(1)
    expect((marcas[0].payload as Record<string, unknown>).despachado).toBe(true)
    expect((await marcasDe(storage, ATTEMPT_MARKER_PREFIX)).length).toBe(0)

    const t2 = await consumeIntakeTick({
      tenant_id: TENANT, enabled: true, n8n_base_url: 'https://n8n.test',
      storage, fetcher: disparoQueAnda,
    })
    expect(t2.processed).toBe(0) // no se despacha dos veces
  })
})
