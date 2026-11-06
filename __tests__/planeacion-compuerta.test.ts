/**
 * 06-nov · la compuerta del plan antes del redactor · tramo 1 (la regla y su lectura). Casos tomados de las filas REALES de `cerebro_dueno_preguntas`
 * de Náufrago: las 2 de la corrida r4 (ejecución 220399, respondidas desde Tu oficina) y 2 de la 217045 que el sistema archivó al pasar de Slack a Tu oficina.
 */
import { describe, expect, it } from 'vitest'
import { cierreDe, compuerta, evaluarCompuerta, validarEntrada, type PreguntaDelPlan } from '../src/lib/planeacion/compuerta'
import { compuertaDeSupabase } from '../src/lib/planeacion/compuerta-supabase'

const C = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const fila = (x: Partial<PreguntaDelPlan> = {}): PreguntaDelPlan => ({ id: 'ce6ad7cf-33df-4a77-9fec-ab85a88aa982', tema: 'costos fijos mensuales', pregunta: '¿cuánto pagas al mes en sueldos, luz y arriendo?', estado: 'respondida', oficina: 'financiera', motivo_descarte: null, supuesto: null, asumida_en: null, ...x })
const R4 = [fila(), fila({ id: '5405751f-964c-4a42-9112-7f0054c875f2', tema: 'fecha apertura guayaquil', pregunta: '¿Tienes ya una fecha aproximada para Guayaquil?' })]
const ARCHIVADA = fila({ id: '62dca652-6bb6-44ec-99b1-1389078fe661', tema: 'ventas temporada baja', estado: 'obsoleta', motivo_descarte: 'las preguntas dejaron Slack y se contestan en Tu oficina (firma de Emilio, 04-nov)' })
const ENTRADA = { client_id: C, workflow_id: 'X9F0zp6LQ2xGEYVS', workflow_execution_ids: ['220399'] }

describe('cómo se cierra cada pregunta', () => {
  it('contestar, asumir (con supuesto), descartar por el dueño y reemplazo del sistema cierran', () => {
    expect(cierreDe(fila())).toBe('contestada')
    expect(cierreDe(fila({ estado: 'asumida', supuesto: 'unos US$ 3.000 al mes' }))).toBe('asumida')
    expect(cierreDe(fila({ estado: 'obsoleta', motivo_descarte: 'Emilio la descartó en Decisiones' }))).toBe('descartada')
    expect(cierreDe(ARCHIVADA)).toBe('reemplazada')
  })
  it('pendiente, vencida, asumida sin supuesto y un estado desconocido quedan ABIERTAS', () => {
    expect(cierreDe(fila({ estado: 'pendiente' }))).toBe('sin_contestar')
    expect(cierreDe(fila({ estado: 'vencida' }))).toBe('vencida')
    expect(cierreDe(fila({ estado: 'asumida', supuesto: '   ' }))).toBe('asumida_sin_supuesto')
    expect(cierreDe(fila({ estado: 'asumida' }))).toBe('asumida_sin_supuesto')
    expect(cierreDe(fila({ estado: 'aceptada' }))).toBe('estado_desconocido')
  })
  it('un motivo que solo MENCIONA a Emilio no es un descarte suyo: es un reemplazo del sistema', () => {
    expect(cierreDe(ARCHIVADA)).not.toBe('descartada')
  })
})

describe('la decisión', () => {
  it('la r4 real: las 2 respondidas ⇒ sigue', () => {
    expect(evaluarCompuerta(R4)).toEqual({ decision: 'sigue', abiertas: [], cerradas: { contestada: 2, asumida: 0, descartada: 0, reemplazada: 0 }, supuestos_del_dueno: [] })
  })
  it('sin preguntas ⇒ sigue', () => {
    expect(evaluarCompuerta([]).decision).toBe('sigue')
  })
  it('UNA abierta entre varias cerradas ⇒ espera, y dice cuál y por qué', () => {
    const d = evaluarCompuerta([...R4, ARCHIVADA, fila({ id: 'p', tema: 'clientes turistas vs locales', estado: 'pendiente', oficina: 'estrategia' })])
    expect(d.decision).toBe('espera')
    expect(d.abiertas).toEqual([{ id: 'p', tema: 'clientes turistas vs locales', pregunta: fila().pregunta, oficina: 'estrategia', motivo: 'sin_contestar' }])
    expect(d.cerradas).toEqual({ contestada: 2, asumida: 0, descartada: 0, reemplazada: 1 })
  })
  it('lo asumido pasa al redactor con su texto exacto, aparte, y nunca como contestado', () => {
    const d = evaluarCompuerta([fila({ id: 'a', estado: 'asumida', supuesto: '  unos US$ 3.000 al mes  ', asumida_en: '2026-11-06T02:00:00Z' }), fila({ id: 'b' })])
    expect(d.decision).toBe('sigue')
    expect(d.supuestos_del_dueno).toEqual([{ pregunta_id: 'a', tema: 'costos fijos mensuales', pregunta: fila().pregunta, supuesto: 'unos US$ 3.000 al mes', asumida_en: '2026-11-06T02:00:00Z' }])
    expect(d.cerradas.asumida).toBe(1)
    expect(d.cerradas.contestada).toBe(1)
  })
  it('asumida sin supuesto ⇒ espera y no inventa un supuesto', () => {
    const d = evaluarCompuerta([fila({ estado: 'asumida', supuesto: null })])
    expect(d.decision).toBe('espera')
    expect(d.supuestos_del_dueno).toEqual([])
  })
})

describe('la entrada y la lectura', () => {
  it('pide cliente uuid, flujo y de 1 a 20 ejecuciones numéricas; quita repetidas', () => {
    expect(validarEntrada({ ...ENTRADA, workflow_execution_ids: ['220399', 220399] })).toEqual({ ok: true, e: ENTRADA })
    expect(validarEntrada({ ...ENTRADA, client_id: 'naufrago' }).ok).toBe(false)
    expect(validarEntrada({ ...ENTRADA, workflow_id: '' }).ok).toBe(false)
    expect(validarEntrada({ ...ENTRADA, workflow_execution_ids: [] }).ok).toBe(false)
    expect(validarEntrada({ ...ENTRADA, workflow_execution_ids: ['220399 or 1=1'] }).ok).toBe(false)
    expect(validarEntrada({ ...ENTRADA, workflow_execution_ids: Array.from({ length: 21 }, (_, i) => String(i)) }).ok).toBe(false)
  })
  it('una lectura fallida NO suelta al redactor: 502 con decisión «espera»', async () => {
    const r = await compuerta(ENTRADA, { preguntasDeLaCorrida: async () => { throw new Error('se cayó la base') } })
    expect(r).toEqual({ status: 502, cuerpo: { error: 'lectura_fallida', decision: 'espera', detalle: 'se cayó la base' } })
  })
  it('entrada inválida ⇒ 400 y no lee', async () => {
    let leyo = false
    const r = await compuerta({}, { preguntasDeLaCorrida: async () => { leyo = true; return [] } })
    expect(r.status).toBe(400)
    expect(leyo).toBe(false)
  })
  it('la lectura de Supabase filtra por cliente, flujo y ejecuciones, y mapea la fila real', async () => {
    const llamadas: Array<[string, ...unknown[]]> = []
    const real = { id: '5405751f-964c-4a42-9112-7f0054c875f2', client_id: C, tema: 'fecha apertura guayaquil', pregunta: '¿fecha?', estado: 'respondida', preguntado_por_oficina: 'financiera', motivo_descarte: null, workflow_id: 'X9F0zp6LQ2xGEYVS', workflow_execution_id: '220399' }
    const q: any = new Proxy({}, { get: (_t, m: string) => m === 'then' ? (ok: (v: unknown) => void) => ok({ data: [real, { ...real, id: 'x', estado: 'asumida', supuesto_asumido: 'en marzo' }], error: null }) : (...a: unknown[]) => { llamadas.push([m, ...a]); return q } })
    const db = { from: (t: string) => { llamadas.push(['from', t]); return q } }
    const ps = await compuertaDeSupabase(db).preguntasDeLaCorrida(ENTRADA)
    expect(llamadas).toEqual([['from', 'cerebro_dueno_preguntas'], ['select', '*'], ['eq', 'client_id', C], ['eq', 'workflow_id', 'X9F0zp6LQ2xGEYVS'], ['in', 'workflow_execution_id', ['220399']], ['limit', 500]])
    expect(ps[0]).toEqual({ id: real.id, tema: real.tema, pregunta: '¿fecha?', estado: 'respondida', oficina: 'financiera', motivo_descarte: null, supuesto: null, asumida_en: null })
    expect(ps[1].supuesto).toBe('en marzo')
  })
  it('la lectura de Supabase LANZA con error de la base (no lo lee como «sin preguntas»)', async () => {
    const q: any = new Proxy({}, { get: (_t, m: string) => m === 'then' ? (ok: (v: unknown) => void) => ok({ data: null, error: { message: 'permission denied' } }) : () => q })
    await expect(compuertaDeSupabase({ from: () => q }).preguntasDeLaCorrida(ENTRADA)).rejects.toThrow(/permission denied/)
  })
})
