/**
 * 🔴 E57 · EL DESTINO DE `planeación` · el repartidor tiene a quién despachar.
 *
 * Medido en E52/E55: el mapa del despachador tenía UNA entrada (ONBOARD) y los
 * otros cinco recorridos estaban «intentionally unmapped» · `planeación` no
 * existía como destino en ningún lado, y el repartidor devolvía
 * `skipped_unknown_journey`.
 *
 * 🔴 El destino vive en DOS copias —el mapa en código y `routing_rules` en la
 * base— y **manda el código**: el despachador cruza lo que trae el sobre contra
 * el mapa y, si difieren, *prefiere el mapa*. Esta prueba cubre la copia que
 * manda.
 *
 * El guarda: los recorridos que NO se tocaron siguen sin destino. Sin eso, esta
 * prueba pasaría igual si alguien mapeara los seis de un saque.
 */
import { describe, it, expect } from 'vitest'
import {
  getJourneyWorkflowTarget,
  isWorkflowJourney,
  dispatchToWorkflow,
} from '@/lib/sala-journey-dispatch'
import type { DispatchDecision } from '@/lib/sala-router'

const TENANT = '11111111-1111-1111-1111-111111111111'
const CLIENT = '22222222-2222-2222-2222-222222222222'
const STREAM = '33333333-3333-3333-3333-333333333333'
const CORR = '44444444-4444-4444-4444-444444444444'
const EVT = '55555555-5555-5555-5555-555555555555'

describe('🔴 E57 · ① el destino de `planeación` existe en la copia que manda', () => {
  it('el mapa sabe a qué flujo y a qué puerta ir', () => {
    const t = getJourneyWorkflowTarget('PRODUCE')
    expect(t, 'PRODUCE sigue sin destino · el repartidor no puede despachar planeación').toBeDefined()
    expect(t?.workflow_id).toBe('X9F0zp6LQ2xGEYVS')
    expect(t?.webhook_path).toBe('zero-risk/planeacion')
  })

  it('y el recorrido queda declarado como de obrero, no de empleado suelto', () => {
    expect(isWorkflowJourney('PRODUCE')).toBe(true)
  })
})

describe('🔴 E57 · ② el despachador arma el disparo a la puerta de `planeación`', () => {
  it('compone la dirección de la puerta y manda la firma de la sala en el cuerpo', async () => {
    let urlVista = ''
    let cuerpoVisto: Record<string, unknown> = {}
    const fetcher = (async (url: string, init: { body: string }) => {
      urlVista = String(url)
      cuerpoVisto = JSON.parse(init.body) as Record<string, unknown>
      return { ok: true, status: 200, text: async () => '{"ok":true}' } as unknown as Response
    }) as unknown as typeof fetch

    const decision: DispatchDecision = {
      kind: 'dispatch',
      stream_id: STREAM,
      correlation_id: CORR,
      tenant_id: TENANT,
      client_id: CLIENT,
      journey_type: 'PRODUCE',
      step_id: 'entry',
      agent_id: 'sala-router',
      attempt: 1,
      idempotency_key: 'idem-e57',
      idempotency_inputs: {
        operation_type: 'PRODUCE.entry',
        client_id: CLIENT,
        logical_period: '2026-W38',
      },
      libreto_version: 1,
      caused_by_event_id: EVT,
      target: 'workflow',
      business_payload: { client_id: CLIENT },
    } as DispatchDecision

    const r = await dispatchToWorkflow({
      decision,
      enabled: true,
      n8n_base_url: 'https://motor.example',
      fetcher,
    })

    expect(r.dispatched).toBe(true)
    expect(urlVista).toBe('https://motor.example/webhook/zero-risk/planeacion')
    // 🔴 la marca que SÓLO pone la sala · es la que el alta va a exigir
    expect(cuerpoVisto.trigger_source).toBe('sala-router-dispatch')
    expect(cuerpoVisto._journey_id).toBe(STREAM)
    expect(cuerpoVisto.client_id).toBe(CLIENT)
  })
})

describe('🔴 E57 · EL GUARDA · no se abrió la taxonomía de par en par', () => {
  it('los recorridos que no se tocaron SIGUEN sin destino', () => {
    for (const j of ['ACQUIRE', 'ALWAYS_ON', 'REVIEW', 'GROWTH'] as const) {
      expect(getJourneyWorkflowTarget(j), `${j} quedó mapeado sin que nadie lo pidiera`).toBeUndefined()
      expect(isWorkflowJourney(j)).toBe(false)
    }
  })

  it('y el destino del alta quedó intacto', () => {
    const t = getJourneyWorkflowTarget('ONBOARD')
    expect(t?.workflow_id).toBe('LyVoKcrypS5uLyuu')
    expect(t?.webhook_path).toBe('zero-risk/deal-won-onboarding')
  })
})
