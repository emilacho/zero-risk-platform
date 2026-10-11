/**
 * Ronda 68 · la vuelta que se corta NO tira el trabajo ya pagado · con el CASO REAL de la repetición del tramo 1:
 * despacho 08:16:25 · la vuelta llegó con error `terminated` a las 08:18:44 (2 min 19 s) · el empleado terminó bien a las 08:26:04 (576 s · US$ 0,568224 · 26.133 caracteres).
 * Sin modelo: el reloj y el libro son falsos, las filas son las reales grabadas.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { filaConTextoEntero, filaEstaEntera, recuperarRespuestaPagada, type FilaInvocacion, type PuntoDeControl } from '@/lib/respuesta-pagada'
import { cuerpoDeVueltaRecuperada, esVueltaPerdidaPorConexion, recuperarVueltaPerdida, topeDeEsperaMs, PRESUPUESTO_DE_LA_FUNCION_MS } from '@/lib/vuelta-perdida'

const leer = (n: string) => JSON.parse(readFileSync(join(process.cwd(), '__tests__/fixtures/ronda68', n), 'utf8'))
const FILA = leer('invocacion-real-08-16-25.json') as FilaInvocacion & { ended_at: string }
const PUNTO = leer('punto-de-control-real.json') as PuntoDeControl

const T_DESPACHO = Date.parse('2026-10-11T08:16:25Z')
const T_CORTE = Date.parse('2026-10-11T08:18:44Z')
const T_FILA = Date.parse('2026-10-11T08:26:04.874Z')
const ERROR_REAL = { success: false, error: 'terminated', error_kind: 'unhandled' }

/** reloj falso: cada espera avanza el reloj; el libro muestra la fila sólo desde T_FILA · la fila trae lo que el libro real trae (2.000 caracteres) */
function mundo(opts: { filaDesde?: number; punto?: PuntoDeControl | null; fila?: FilaInvocacion } = {}) {
  let t = T_CORTE
  const llamadas = { buscar: 0, esperas: 0 }
  const fila = opts.fila ?? FILA
  const punto = opts.punto === undefined ? PUNTO : opts.punto
  return {
    llamadas,
    ahora: () => t,
    esperar: async (ms: number) => { llamadas.esperas++; t += ms },
    buscarFila: async () => {
      llamadas.buscar++
      if (t < (opts.filaDesde ?? T_FILA)) return null
      return filaConTextoEntero(fila, punto, '173257')
    },
  }
}
const entrada = { cuerpoDelError: ERROR_REAL, agente: 'campaign-brief-agent', paso: null, executionId: '173257', dispatchKey: 'dispatch:X9F0zp6LQ2xGEYVS:campaign-brief-agent:173257', empezoEnMs: T_DESPACHO }

describe('el caso real: 08:16:25 → corte 08:18:44 → el empleado termina 08:26:04', () => {
  it('rojo (lo de antes): con el tope de 120 s la recuperación dice «no sé» y el plan pagado se pierde', async () => {
    const m = mundo()
    const r = await recuperarRespuestaPagada({ agent: 'campaign-brief-agent', executionId: '173257', topeMs: 120_000 }, { buscarFila: m.buscarFila, ahora: m.ahora, esperar: m.esperar })
    expect(r).toBeNull()
  })
  it('rojo (lo de antes): aun esperando, la fila SOLA (2.000 caracteres) no prueba que el plan de 26.133 esté entero', () => {
    expect(String(FILA.output_summary).length).toBe(2001)
    expect(filaEstaEntera(FILA).entera).toBe(false)
  })
  it('verde: se espera hasta que el empleado termina y la vuelta lleva el plan ENTERO (26.133 caracteres), el costo real y la marca de recuperado', async () => {
    const m = mundo()
    const r = await recuperarVueltaPerdida(entrada, { buscarFila: m.buscarFila, ahora: m.ahora, esperar: m.esperar })
    expect(r).not.toBeNull()
    expect(r).toMatchObject({ success: true, agent: 'campaign-brief-agent', recovered_after_connection_lost: true, delivered_by: 'recovery', cost_usd: 0.568224, model: 'claude-sonnet-4-6' })
    expect(String(r!.response).length).toBe(26133)
    expect(String(r!.response)).toBe((PUNTO.output_ref as { response: string }).response)
    expect(String(r!.response)).toMatch(/^# PLAN DE CAMPAÑA 90 DÍAS/)
    expect(m.llamadas.esperas).toBeGreaterThan(30) // esperó ~7 min sondeando cada 10 s (no se rindió a los 120 s)
  })
  it('la espera cabe en el presupuesto de la función: al corte quedaban más de 9 min', () => {
    expect(topeDeEsperaMs(T_DESPACHO, T_CORTE)).toBeGreaterThan(T_FILA - T_CORTE)
  })
})

describe('sin prueba o sin trabajo ya pagado: sale el error de siempre (null), nunca un valor inventado', () => {
  it('el punto de control es de OTRA corrida del mismo cliente → no se usa, la fila queda recortada → null', async () => {
    const m = mundo({ punto: { ...PUNTO, workflow_execution_id: '173000' } })
    expect(await recuperarVueltaPerdida(entrada, { buscarFila: m.buscarFila, ahora: m.ahora, esperar: m.esperar })).toBeNull()
  })
  it('el texto del punto de control mide distinto de lo declarado → null', async () => {
    const m = mundo({ punto: { ...PUNTO, output_ref: { response: 'plan a medias', response_truncated: false } } })
    expect(await recuperarVueltaPerdida(entrada, { buscarFila: m.buscarFila, ahora: m.ahora, esperar: m.esperar })).toBeNull()
  })
  it('el punto de control declara texto recortado → null', async () => {
    const m = mundo({ punto: { ...PUNTO, output_ref: { ...(PUNTO.output_ref as object), response_truncated: true } } })
    expect(await recuperarVueltaPerdida(entrada, { buscarFila: m.buscarFila, ahora: m.ahora, esperar: m.esperar })).toBeNull()
  })
  it('el empleado falló (fila failed) → null, sin esperar más', async () => {
    const m = mundo({ fila: { ...FILA, status: 'failed' } })
    expect(await recuperarVueltaPerdida(entrada, { buscarFila: m.buscarFila, ahora: m.ahora, esperar: m.esperar })).toBeNull()
  })
  it('el empleado nunca termina → se rinde al agotar el presupuesto (no espera para siempre)', async () => {
    const m = mundo({ filaDesde: Number.MAX_SAFE_INTEGER })
    expect(await recuperarVueltaPerdida(entrada, { buscarFila: m.buscarFila, ahora: m.ahora, esperar: m.esperar })).toBeNull()
    expect(m.ahora()).toBeLessThanOrEqual(T_DESPACHO + PRESUPUESTO_DE_LA_FUNCION_MS)
  })
  it('sin número de corrida no se busca (podría traer la de otro) · sin margen no se espera', async () => {
    const m = mundo()
    expect(await recuperarVueltaPerdida({ ...entrada, executionId: null }, { buscarFila: m.buscarFila, ahora: m.ahora, esperar: m.esperar })).toBeNull()
    expect(m.llamadas.buscar).toBe(0)
    expect(await recuperarVueltaPerdida({ ...entrada, empezoEnMs: T_CORTE - PRESUPUESTO_DE_LA_FUNCION_MS + 5_000 }, { buscarFila: m.buscarFila, ahora: m.ahora, esperar: m.esperar })).toBeNull()
    expect(m.llamadas.buscar).toBe(0)
  })
})

describe('qué errores son de conexión (y cuáles NO se tocan)', () => {
  it('conexión perdida: terminated · fetch failed · inner_run_threw · upstream 0/502/503/504', () => {
    for (const b of [ERROR_REAL, { success: false, error: 'fetch failed' }, { success: false, error: 'x', error_kind: 'inner_run_threw' }, { error: 'agent-runner upstream failed', upstream_status: 502 }, { error: 'x', upstream_status: 0 }, { error: 'Error: other side closed' }]) {
      expect(esVueltaPerdidaPorConexion(b), JSON.stringify(b)).toBe(true)
    }
  })
  it('NO es conexión: el empleado falló, validación 400, éxito, basura', () => {
    for (const b of [{ success: false, error: 'terminated', error_kind: 'runner_run_failed' }, { success: false, error: 'invalid_input', code: 'E-BAD' }, { success: true, response: 'ok' }, { error: 'cost_cap_exceeded' }, null, 'terminated', [], { upstream_status: 400 }]) {
      expect(esVueltaPerdidaPorConexion(b), JSON.stringify(b)).toBe(false)
    }
  })
  it('el cuerpo recuperado trae los mismos campos que la vuelta cruda del corredor', () => {
    const c = cuerpoDeVueltaRecuperada({ success: true, response: 'x', sessionId: 's', inputTokens: 1, outputTokens: 2, costUsd: 0.5, durationMs: 9, model: 'm' }, { agente: 'a', dispatchKey: 'k' })
    expect(Object.keys(c)).toEqual(expect.arrayContaining(['success', 'agent', 'response', 'session_id', 'model', 'input_tokens', 'output_tokens', 'cost_usd', 'duration_ms', 'dispatch_key']))
  })
})
