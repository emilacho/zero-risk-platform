/**
 * EL EXTRACTOR DE LA CORRIDA REAL DEL BRIEF · pruebas a costo cero (datos sintéticos con la forma real de n8n) · CC#1 · 2026-09-30.
 * Antes de disparar una corrida que PAGA, la herramienta que lee su resultado tiene que estar probada: una corrida real no se repite por un extractor roto.
 */
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const { resumenDeLaCorrida, veredictoDeLaCorrida } = await import(pathToFileURL(join(process.cwd(), 'scripts', 'worker-staging', 'brief-parte-de-trabajo', 'resumen-corrida-brief.mjs')).href)
const nodo = (json: unknown, t: number) => [{ startTime: t, data: { main: [[{ json }]] } }]
const real = (over: Record<string, unknown> = {}) => ({
  id: '158700', status: 'success', startedAt: '2026-09-30T07:00:00.000Z', stoppedAt: '2026-09-30T07:31:02.000Z',
  data: { resultData: { lastNodeExecuted: '⑥ Cable · ¿volvió?', runData: {
    '⓪ Sobre · llave · modo seco': nodo({ dry_run: false, forzar: true, tope_usd: 3 }, 1),
    '③ Armar el cuerpo del redactor': nodo({ cuerpo: { agent: 'campaign-brief-agent', dry_run: false, max_budget_usd: 3, callback_mode: 'runner' } }, 2),
    '③ Esperar al redactor': nodo({ headers: {}, body: { success: true, delivered_by: 'runner', cost_usd: 1.9, model: 'claude-sonnet-4-6' } }, 3),
    '③ ¿Llegó la vuelta?': nodo({ llego_la_vuelta: true, caracteres: 30000, falla_del_redactor: null, vuelta_costo_usd: 1.9 }, 4),
    '④ Chequeos': nodo({ parte_legible: true, parte_valido: true, motivo_invalido: null, chequeos_ok: false, entregables: 9, pendientes_declarados: 2, titulo_parte: 'Parte de trabajo · briefs · 2026-09-30', hallazgos: [{ chequeo: 'campo_faltante', entregable: 'BRF-0003', detalle: 'falta limites' }], por_chequeo: { campo_faltante: 1 } }, 5),
    '⑤ Guardar el parte': nodo({ statusCode: 201, body: [{ id: 'fila-9' }] }, 6),
    '⑤ Parte a Drive': nodo({ body: { ok: true, file_id: 'F123', url: 'https://drive.test/F123' } }, 7),
    '⑤ ¿Guardó y salió el PDF?': nodo({ ok: true, hay_pdf: true, parte_guardado: true, parte_valido: true, problemas: [] }, 8),
    '⑥ Cable de vuelta · sala': nodo({ body: { ok: true, event_id: 'ev-1' } }, 9),
    '⑥ Cable · ¿volvió?': nodo({ vuelta_ok: true, vuelta_detalle: 'ev-1', cierre: 'parte_terminado' }, 10),
    ...over,
  } } },
})

describe('resumenDeLaCorrida', () => {
  it('una corrida real sana: extrae sobre, tope, vuelta, chequeos, guardado, Drive y cable', () => {
    const r = resumenDeLaCorrida(real())
    expect(r).toMatchObject({
      ejecucion: '158700', estado: 'success', duracion_s: 1862, modo_seco: false,
      sobre: { dry_run: false, forzar: true, tope_usd: 3 },
      cuerpo_al_redactor: { dry_run: false, max_budget_usd: 3, callback_mode: 'runner' },
      vuelta: { delivered_by: 'runner', success: true, cost_usd: 1.9 },
      chequeos: { parte_legible: true, parte_valido: true, entregables: 9, pendientes_declarados: 2 },
      guardado: { id: 'fila-9' }, drive: { ok: true, file_id: 'F123', url: 'https://drive.test/F123' },
      cierre: { ok: true, hay_pdf: true }, cable: { ok: true, event_id: 'ev-1' }, cable_volvio: { vuelta_ok: true, cierre: 'parte_terminado' },
    })
    expect(r.chequeos.hallazgos).toEqual([{ chequeo: 'campo_faltante', entregable: 'BRF-0003', detalle: 'falta limites' }])
  })
  it('una corrida que se cortó por el tope: el fallo, lo gastado y el parte inválido quedan a la vista', () => {
    const r = resumenDeLaCorrida(real({
      '③ Esperar al redactor': nodo({ body: { success: false, delivered_by: 'runner', cost_usd: 3.04, error: 'error_max_budget_usd · el empleado alcanzó el tope' } }, 3),
      '③ ¿Llegó la vuelta?': nodo({ llego_la_vuelta: false, caracteres: 0, falla_del_redactor: 'error_max_budget_usd · el empleado alcanzó el tope', vuelta_costo_usd: 3.04, motivo: 'el redactor FALLÓ' }, 4),
      '④ Chequeos': nodo({ parte_legible: false, parte_valido: false, motivo_invalido: 'el redactor FALLÓ · error_max_budget_usd', entregables: 0, titulo_parte: '⛔ PARTE NO VÁLIDO · x', hallazgos: [] }, 5),
    }))
    expect(r.vuelta).toMatchObject({ success: false, cost_usd: 3.04 })
    expect(r.llego.falla_del_redactor).toMatch(/error_max_budget_usd/)
    expect(r.chequeos).toMatchObject({ parte_valido: false, entregables: 0 })
    expect(r.chequeos.motivo_invalido).toMatch(/el redactor FALLÓ/)
  })
  it('una ejecución en seco se reconoce (modo_seco:true) y una vacía no lanza', () => {
    expect(resumenDeLaCorrida(real({ '⑤ Seco · lo que se habría escrito': nodo({ seco: true, escrituras_reales: 0 }, 11) })).modo_seco).toBe(true)
    expect(() => resumenDeLaCorrida({})).not.toThrow()
    expect(resumenDeLaCorrida({}).estado).toBeNull()
  })
})

describe('veredictoDeLaCorrida · cada punto de lo que Emilio quiere ver', () => {
  const V = (r: unknown, costo: number) => veredictoDeLaCorrida(r, { topeAutorizadoUsd: 3.5, costoRealUsd: costo })
  const ok = (v: Array<{ punto: string; ok: boolean }>, p: string) => v.find((x) => x.punto.includes(p))!.ok
  it('🟢 la corrida sana cumple TODOS los puntos', () => {
    const v = V(resumenDeLaCorrida(real()), 1.9)
    expect(v.every((x: { ok: boolean }) => x.ok), JSON.stringify(v.filter((x: { ok: boolean }) => !x.ok))).toBe(true)
  })
  it('🔴 sin PDF en Drive, sin asiento de vuelta, sin entregables o pasada del tope ⇒ el punto sale en rojo (el veredicto PUEDE fallar)', () => {
    expect(ok(V(resumenDeLaCorrida(real({ '⑤ Parte a Drive': nodo({ body: { ok: false } }, 7) })), 1.9), 'PDF')).toBe(false)
    expect(ok(V(resumenDeLaCorrida(real({ '⑥ Cable · ¿volvió?': nodo({ vuelta_ok: false }, 10) })), 1.9), 'cable')).toBe(false)
    expect(ok(V(resumenDeLaCorrida(real({ '④ Chequeos': nodo({ entregables: 0, parte_valido: false, motivo_invalido: 'entregables: 0' }, 5) })), 1.9), 'lista de entregables')).toBe(false)
    expect(ok(V(resumenDeLaCorrida(real()), 3.6), 'tope autorizado')).toBe(false)
  })
  it('🔴 un parte inválido que la corrida cerró en VERDE es un fallo del veredicto · si termina en error, el punto pasa', () => {
    const invalido = { '④ Chequeos': nodo({ entregables: 0, parte_valido: false, motivo_invalido: 'entregables: 0' }, 5) }
    expect(ok(V(resumenDeLaCorrida(real(invalido)), 1.9), 'NO cierra en verde')).toBe(false)
    expect(ok(V(resumenDeLaCorrida({ ...real(invalido), status: 'error' }), 1.9), 'NO cierra en verde')).toBe(true)
  })
})
