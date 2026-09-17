/**
 * 🔴 E73 · EL SOBRE DE `planeación` SALE UNA SOLA VEZ, TARDE LO QUE TARDE Y CAIGA EL DÍA QUE CAIGA.
 *
 * Medido por CC#2 (E72 · banco con el código real de la puerta): con `logical_period = $now yyyy-MM-dd`
 * el mismo recorrido reintentado OTRO día entraba como sobre nuevo (otra clave de dedup, otro stream)
 * y `planeación` se despachaba dos veces (~US$ 0,46–0,56 cada una). El camino probable: la puerta
 * tarda >15 s, el nodo marca error, alguien reintenta el alta al día siguiente.
 *
 * El arreglo (E73): `logical_period` FIJO por recorrido («alta:<_journey_id>»), no la fecha del momento.
 * Esta prueba arma el sobre EXACTAMENTE como lo arma el nodo del alta (antes y después) y pasa las dos
 * versiones por las mismas funciones de la puerta: la clave de dedup del libro y el stream_id.
 */
import { describe, it, expect } from 'vitest'
import { buildIdempotencyKey } from '@/lib/sala-event-log'
import { mintStreamId } from '@/lib/sala-ingress/stream-id'

const JOURNEY = 'sala/v1/naufrago/d69100b5/onboard/2026-W37/abc123'
const CLIENT = 'd69100b5-8ad7-4bb0-908c-68b5544065dc'
const TENANT = 'd69100b5-8ad7-4bb0-908c-68b5544065dc'
const SOURCE = 'alta/journey-completed'
const INTENT = 'planear'
const OPERATION = `PRODUCE.intake.${SOURCE}.${INTENT}`

/** El sobre como lo arma el nodo «E57 · sobre · pedir planeación a la sala». */
function sobre(logical_period: string) {
  return {
    source: SOURCE,
    intent: INTENT,
    idempotency_key: `${JOURNEY}:planear`,
    logical_period,
    tenant_id: TENANT,
    client_id: CLIENT,
  }
}

function claveYStream(s: ReturnType<typeof sobre>) {
  return {
    clave: buildIdempotencyKey({ operation_type: OPERATION, client_id: s.client_id, logical_period: s.logical_period, input_hash: s.idempotency_key }),
    stream: mintStreamId({ source: s.source, intent: s.intent, idempotency_key: s.idempotency_key, tenant_id: s.tenant_id, client_id: s.client_id, logical_period: s.logical_period }),
  }
}

const ANTES = (fecha: string) => sobre(fecha) // $now.format('yyyy-MM-dd')
const AHORA = () => sobre(`alta:${JOURNEY}`) // E73

describe('E73 · un solo despacho de planeación por recorrido', () => {
  it('el defecto (control): con la fecha del momento, otro día = otra clave y otro stream · dos despachos', () => {
    const d1 = claveYStream(ANTES('2026-09-16'))
    const d2 = claveYStream(ANTES('2026-09-17'))
    expect(d1.clave).not.toBe(d2.clave)
    expect(d1.stream).not.toBe(d2.stream)
  })

  it('el arreglo: mismo recorrido, corridas en días distintos ⇒ misma clave y mismo stream ⇒ `duplicate`, un solo despacho', () => {
    const d1 = claveYStream(AHORA())
    const d2 = claveYStream(AHORA())
    expect(d1.clave).toBe(d2.clave)
    expect(d1.stream).toBe(d2.stream)
    expect(AHORA().logical_period).not.toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('dos recorridos distintos del mismo cliente siguen siendo dos pedidos (no hay falso duplicado)', () => {
    const otro = { ...AHORA(), idempotency_key: `${JOURNEY}-otro:planear`, logical_period: `alta:${JOURNEY}-otro` }
    expect(claveYStream(AHORA()).clave).not.toBe(claveYStream(otro).clave)
    expect(claveYStream(AHORA()).stream).not.toBe(claveYStream(otro).stream)
  })

  it('el mismo día también sigue siendo un solo pedido (lo que ya funcionaba)', () => {
    expect(claveYStream(ANTES('2026-09-16')).clave).toBe(claveYStream(ANTES('2026-09-16')).clave)
  })
})
