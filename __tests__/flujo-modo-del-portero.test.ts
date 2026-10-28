/**
 * EL MODO DEL PORTERO EN EL FLUJO DIARIO (28-oct · CC-CEREBRO · firma de Emilio) · US$ 0, sin red.
 * Corre el CÓDIGO REAL de «⓪ Entrada», «① Repartir» y «④ Alimentar» del flujo (ogfq56oIEoHufFPM) con un /modo simulado:
 * construcción = las 3 corridas del día (cada una con forzar); campaña = solo la de las 12:30; sin respuesta del modo no se pierde la diaria.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const W = join(process.cwd(), 'scripts', 'worker-staging', 'ogfq56oIEoHufFPM')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const modo: any = await import(pathToFileURL(join(W, 'construir-modo.mjs')).href)
const ANTES = JSON.parse(readFileSync(join(W, 'ogfq56oIEoHufFPM-ANTES-modo-2026-10-28.json'), 'utf8'))
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Nodo = any
const ARREGLADO = modo.aplicarModo(ANTES)
const nodo = (w: Nodo, n: string): Nodo => w.nodes.find((x: Nodo) => x.name === n)

/** ejecuta el código de «⓪ Entrada» por el HORARIO (sin webhooks) con la respuesta de /modo simulada y la hora dada */
async function entradaPorHorario(w: Nodo, modoRespuesta: unknown | Error, horaUtc: string) {
  const codigo: string = nodo(w, '⓪ Entrada').parameters.jsCode
  const fecha = new Date(`2026-10-28T${horaUtc}:00Z`)
  const llamadas: string[] = []
  const RealDate = Date
  class Fake extends RealDate { constructor(...a: unknown[]) { super(...((a.length ? a : [fecha.toISOString()]) as [string])) } static now() { return fecha.getTime() } }
  const sinNodo = () => { throw new Error('no hay ese nodo en esta ejecución') }
  const ctx = {
    helpers: { httpRequest: async (o: { url: string }) => { llamadas.push(o.url); if (modoRespuesta instanceof Error) throw modoRespuesta; return modoRespuesta } },
  }
  const f = new AsyncFunction('$', '$workflow', '$execution', '$env', 'Date', codigo)
  const r = await f.call(ctx, sinNodo, { id: 'ogfq56oIEoHufFPM' }, { id: '777' }, { INTERNAL_API_KEY: 'k' }, Fake)
  return { salida: r as Array<{ json: Record<string, unknown> }>, llamadas }
}

describe('el flujo con el modo aplicado', () => {
  it('cambia SOLO el horario, ⓪ Entrada, ① Repartir y ④ Alimentar; ni un nodo nuevo ni una conexión nueva; zona UTC', () => {
    expect(ARREGLADO.nodes.length).toBe(ANTES.nodes.length)
    const cambian = ARREGLADO.nodes.filter((n: Nodo) => JSON.stringify(n) !== JSON.stringify(nodo(ANTES, n.name === modo.NOMBRE_NUEVO_DEL_HORARIO ? modo.NOMBRE_VIEJO_DEL_HORARIO : n.name))).map((n: Nodo) => n.name)
    expect(cambian.sort()).toEqual([modo.NOMBRE_NUEVO_DEL_HORARIO, '① Repartir (una ejecución por cliente)', '④ Alimentar (filtrar · razonar · archivar)', '⓪ Entrada'].sort())
    expect(nodo(ARREGLADO, modo.NOMBRE_NUEVO_DEL_HORARIO).parameters.rule.interval[0].expression).toBe('30 0,12,18 * * *')
    expect(ARREGLADO.settings.timezone).toBe('UTC')
    // la conexión del horario sigue yendo a ⓪ Entrada
    expect(ARREGLADO.connections[modo.NOMBRE_NUEVO_DEL_HORARIO].main[0][0].node).toBe('⓪ Entrada')
    expect(ARREGLADO.connections[modo.NOMBRE_VIEJO_DEL_HORARIO]).toBeUndefined()
    expect(Object.keys(ARREGLADO.connections).length).toBe(Object.keys(ANTES.connections).length)
  })
  it('aplicarlo dos veces falla (no se duplica)', () => { expect(() => modo.aplicarModo(ARREGLADO)).toThrow() })

  it('construcción: las 3 horas corren y van con forzar_corrida', async () => {
    const m = { modo: 'construccion', corre_ahora: true, forzar: true }
    for (const h of ['12:30', '18:30', '00:30']) {
      const r = await entradaPorHorario(ARREGLADO, m, h)
      expect(r.salida).toHaveLength(1)
      expect(r.salida[0].json).toMatchObject({ via: 'horario', dry_run: false, modo: 'construccion', forzar_corrida: true })
      expect(r.llamadas).toEqual(['https://zero-risk-platform.vercel.app/api/brain/alimentar/modo'])
    }
  })
  it('campaña: la de las 12:30 corre SIN forzar; las de 18:30 y 00:30 no corren (el flujo se detiene en ⓪)', async () => {
    const r = await entradaPorHorario(ARREGLADO, { modo: 'campana', corre_ahora: true, forzar: false }, '12:30')
    expect(r.salida[0].json).toMatchObject({ via: 'horario', modo: 'campana', forzar_corrida: false })
    expect((await entradaPorHorario(ARREGLADO, { modo: 'campana', corre_ahora: false, forzar: false }, '18:30')).salida).toEqual([])
    expect((await entradaPorHorario(ARREGLADO, { modo: 'campana', corre_ahora: false, forzar: false }, '00:30')).salida).toEqual([])
  })
  it('sin respuesta del modo NO se pierde la diaria: corre la de las 12:30; las otras dos esperan', async () => {
    const caido = new Error('503')
    const a = await entradaPorHorario(ARREGLADO, caido, '12:31')
    expect(a.salida).toHaveLength(1); expect(a.salida[0].json).toMatchObject({ via: 'horario', modo: 'sin_respuesta', forzar_corrida: false })
    expect((await entradaPorHorario(ARREGLADO, caido, '18:30')).salida).toEqual([])
    expect((await entradaPorHorario(ARREGLADO, caido, '00:30')).salida).toEqual([])
    // una respuesta rara (sin corre_ahora booleano) se trata igual que sin respuesta
    expect((await entradaPorHorario(ARREGLADO, { error: 'x' }, '18:30')).salida).toEqual([])
  })

  it('① Repartir pasa forzar_corrida a cada cliente y ④ Alimentar lo convierte en forzar', () => {
    const rep: string = nodo(ARREGLADO, '① Repartir (una ejecución por cliente)').parameters.jsCode
    expect(rep).toContain('forzar_corrida: entrada.forzar_corrida === true')
    const cuerpo: string = nodo(ARREGLADO, '④ Alimentar (filtrar · razonar · archivar)').parameters.jsonBody
    expect(cuerpo).toContain("reintento === true || $('⓪ Entrada').first().json.forzar_corrida === true ? { forzar: true } : {}")
    // lo demás del cuerpo no cambia
    expect(cuerpo.replace(/\s+/g, ' ')).toContain('workflow_execution_id: $json.workflow_execution_id')
  })
  it('la entrada «un cliente» conserva forzar_corrida (si no, la segunda corrida moriría en ya_corrio_hoy)', async () => {
    const codigo: string = nodo(ARREGLADO, '⓪ Entrada').parameters.jsCode
    const f = new AsyncFunction('$', '$workflow', '$execution', '$env', codigo)
    const U = '11111111-1111-4111-8111-111111111111'
    const r = await f(((n: string) => { if (n === 'Webhook · un cliente (llave interna)') return { first: () => ({ json: { headers: { 'x-api-key': 'k' }, body: { client_id: U, forzar_corrida: true } } }) }; throw new Error('no') }), { id: 'w' }, { id: '9' }, { INTERNAL_API_KEY: 'k' })
    expect(r[0].json).toMatchObject({ via: 'cliente', client_id: U, forzar_corrida: true, reintento: false })
  })
})
