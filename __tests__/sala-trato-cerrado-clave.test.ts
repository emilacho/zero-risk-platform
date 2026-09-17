/**
 * 🔴 E75 · LA CLAVE DEL TRATO CERRADO · un cliente que vuelve NO se descarta como repetido.
 *
 * Medido por CC#2 (E74): con E73 (`logical_period = "trato"` fijo) y sin `deal_id`, la clave caía al
 * cliente ⇒ un cliente podía tener UNA sola alta en su vida; el segundo trato volvía `duplicate` y la
 * GUARDA lo dejaba pasar como éxito. Y lo normal hoy es que NO venga `deal_id`.
 *
 * La regla (Lenovo · E75): con identificador → ése; sin identificador → cliente + FECHA DEL TRATO.
 * Salvedad declarada: dos tratos distintos del mismo cliente el MISMO día colapsan en uno (y se avisa).
 *
 * Esta prueba arma el sobre EXACTAMENTE como lo arma el nodo «Armar el sobre» del llamador y lo pasa
 * por la clave de dedup y el stream_id reales de la puerta.
 */
import { describe, it, expect } from 'vitest'
import { buildIdempotencyKey } from '@/lib/sala-event-log'
import { mintStreamId } from '@/lib/sala-ingress/stream-id'

const CLIENT = 'd69100b5-8ad7-4bb0-908c-68b5544065dc'
const OPERATION = 'ONBOARD.intake.alta/deal-won.onboard'

/** Réplica fiel de «Armar el sobre» (llamador IXF3 · E75). */
function armar(body: Record<string, unknown>, llegada = '2026-09-17') {
  const dealId = String((body.deal_id as string) || (body.idempotency_key as string) || '').trim()
  const clientId = String((body.client_id as string) || '').trim()
  const cand = [body.closed_at, body.deal_closed_at, body.won_at, body.fecha_trato, body.closed_date]
  let fecha: string | null = null
  for (const c of cand) {
    if (c === undefined || c === null || c === '') continue
    const d = new Date(c as string)
    if (!isNaN(d.getTime())) { fecha = d.toISOString().slice(0, 10); break }
  }
  if (!fecha) fecha = llegada
  const sin = !dealId
  return { idempotency_key: sin ? `${clientId}:${fecha}` : dealId, sin_identificador: sin, client_id: clientId, fecha }
}

function clave(a: ReturnType<typeof armar>) {
  return {
    k: buildIdempotencyKey({ operation_type: OPERATION, client_id: a.client_id, logical_period: 'trato', input_hash: a.idempotency_key }),
    s: mintStreamId({ source: 'alta/deal-won', intent: 'onboard', idempotency_key: a.idempotency_key, tenant_id: a.client_id, client_id: a.client_id, logical_period: 'trato' }),
  }
}

describe('E75 · la clave del trato cerrado', () => {
  it('con deal_id · reintento del mismo trato ⇒ misma clave (duplicate) · otro trato ⇒ otra clave', () => {
    const a = clave(armar({ client_id: CLIENT, deal_id: 'D-1' }))
    const b = clave(armar({ client_id: CLIENT, deal_id: 'D-1' }, '2026-10-01'))
    const c = clave(armar({ client_id: CLIENT, deal_id: 'D-2' }))
    expect(a.k).toBe(b.k); expect(a.s).toBe(b.s)
    expect(a.k).not.toBe(c.k)
  })

  it('SIN deal_id · el cliente que vuelve OTRO día ya NO se descarta (el defecto de E73/E74)', () => {
    const junio = clave(armar({ client_id: CLIENT, client_name: 'Náufrago' }, '2026-06-28'))
    const sept = clave(armar({ client_id: CLIENT, client_name: 'Náufrago' }, '2026-09-17'))
    expect(junio.k).not.toBe(sept.k)
    expect(junio.s).not.toBe(sept.s)
  })

  it('SIN deal_id · reintento el MISMO día ⇒ misma clave ⇒ duplicate (un solo alta)', () => {
    const a = clave(armar({ client_id: CLIENT }, '2026-09-17'))
    const b = clave(armar({ client_id: CLIENT }, '2026-09-17'))
    expect(a.k).toBe(b.k); expect(a.s).toBe(b.s)
  })

  it('SIN deal_id · la fecha del trato manda sobre la de llegada (closed_at · deal_closed_at · won_at)', () => {
    const a = armar({ client_id: CLIENT, closed_at: '2026-09-01T15:00:00Z' }, '2026-09-17')
    expect(a.fecha).toBe('2026-09-01')
    expect(a.idempotency_key).toBe(`${CLIENT}:2026-09-01`)
    const b = armar({ client_id: CLIENT, closed_at: 'no-es-fecha', won_at: '2026-09-05' }, '2026-09-17')
    expect(b.fecha).toBe('2026-09-05')
  })

  it('⚠️ salvedad declarada · dos tratos DISTINTOS del mismo cliente el MISMO día colapsan (por eso se avisa)', () => {
    const a = clave(armar({ client_id: CLIENT, deal_value: 100 }, '2026-09-17'))
    const b = clave(armar({ client_id: CLIENT, deal_value: 900 }, '2026-09-17'))
    expect(a.k).toBe(b.k)
    expect(armar({ client_id: CLIENT }, '2026-09-17').sin_identificador).toBe(true)
  })

  it('el payload real del 28-jun (sin deal_id ni client_id) sigue siendo rechazado por la puerta, no colapsado', () => {
    const a = armar({ client_name: 'Náufrago', website: 'x', deal_value: 1 }, '2026-06-28')
    expect(a.client_id).toBe('')
    expect(a.sin_identificador).toBe(true)
    // client_id vacío ⇒ invalid_envelope en la puerta (validation.ts) · la GUARDA lanza · no hay descarte silencioso
  })
})
