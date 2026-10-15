/**
 * EL PORTERO NO CORRIÓ (15-oct) · n8n corta cada tarea de código a los 120 s y el paso ② llamaba al Servicio 7 veces seguidas en UN nodo.
 * Se prueba ejecutando el código REAL de los nodos del flujo ARREGLADO con un reloj y un Servicio simulados (cada llamada «dura» lo que se diga):
 *   · ninguna tarea de código supera el tope aunque el plan pida más (lo que no cupo se DECLARA, no se pierde);
 *   · el tiempo de cada llamada nunca pasa de lo que queda del nodo;
 *   · una guarda estructural: todo nodo de código que llama en bucle lleva el presupuesto; el horario sigue ahí; el ANTES sí fallaba.
 */
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const DIR = path.resolve(__dirname, '../../../../scripts/worker-staging/ogfq56oIEoHufFPM')
const leer = (f: string) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))
const ANTES = leer('portero-ANTES-presupuesto-de-tiempo-2026-10-15.json')
const DESPUES = leer('portero-ARREGLADO-presupuesto-de-tiempo-2026-10-15.json')
type Nodo = { name: string; type: string; parameters: { jsCode?: string; rule?: unknown } }
type Item = { json: Record<string, unknown> }
const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<Item[]>
const nodo = (f: { nodes: Nodo[] }, n: string) => f.nodes.find((x) => x.name === n)!
const TANDAS = ['② Ampliar (tanda 1)', '② Ampliar (tanda 2)', '② Ampliar (Servicio de Apify)']

interface Llamada { url: string; timeout: number; en: number }
function mundo(duracionMs: number, falla = false) {
  let reloj = 1_000_000
  const llamadas: Llamada[] = []
  vi.spyOn(Date, 'now').mockImplementation(() => reloj)
  const httpRequest = async (o: { url: string; timeout: number }) => {
    llamadas.push({ url: o.url, timeout: o.timeout, en: reloj })
    if (/apify-service-workflow/.test(o.url)) {
      reloj += duracionMs
      if (duracionMs > o.timeout) throw new Error('timeout')
      return falla ? { statusCode: 500, body: { ok: false, error: 'x' } } : { statusCode: 200, body: { ok: true, apify_run_id: 'run' + llamadas.length } }
    }
    return { statusCode: 200, body: { data: { usageTotalUsd: 0.01 } } }
  }
  return { llamadas, httpRequest }
}
async function correr(n: Nodo, entrada: Item[], httpRequest: unknown, previos: Record<string, Item[]> = {}): Promise<Item[]> {
  const f = new AsyncFunction('$input', '$', '$env', n.parameters.jsCode!)
  const ctx = { helpers: { httpRequest } }
  const dolar = (nombre: string) => ({ all: () => previos[nombre] ?? [] })
  return f.call(ctx, { all: () => entrada }, dolar, { APIFY_API_TOKEN: 't' })
}
const acciones = (k: number) => Array.from({ length: k }, (_v, i) => ({ fuente: 'f' + i, funcion: 'fn' + i, params: {}, metadata: {}, usd_max: 0.01 }))
const cliente = (k: number, extra: Record<string, unknown> = {}): Item => ({ json: { workflow_id: 'wf', cliente: 'c1', nombre: 'N', dry_run: false, falla: null, acciones: acciones(k), ...extra } })
async function cadena(k: number, duracionMs: number, falla = false, extra: Record<string, unknown> = {}) {
  const m = mundo(duracionMs, falla)
  let items: Item[] = [cliente(k, extra)]
  const porNodo: number[] = []
  for (const t of TANDAS) {
    const antes = m.llamadas.filter((l) => /apify-service-workflow/.test(l.url)).length
    items = await correr(nodo(DESPUES, t), items, m.httpRequest)
    porNodo.push(m.llamadas.filter((l) => /apify-service-workflow/.test(l.url)).length - antes)
  }
  return { items, llamadas: m.llamadas, porNodo, amp: items[0].json.ampliacion as Record<string, unknown> }
}
afterEach(() => vi.restoreAllMocks())

describe('② Ampliar reparte el trabajo en tandas que caben en 120 s', () => {
  it('7 llamadas de 20 s (la corrida de hoy): las 7 se hacen, repartidas en las tandas, ninguna se omite', async () => {
    const r = await cadena(7, 20_000)
    expect(r.porNodo.reduce((a, b) => a + b, 0)).toBe(7)
    expect(r.porNodo[0]).toBeLessThanOrEqual(4) // una tanda sola NO hace las 7 (eso era el defecto)
    expect(Math.max(...r.porNodo)).toBeLessThan(7)
    expect((r.amp.llamadas as unknown[]).length).toBe(7)
    expect(r.amp.hecho).toBe(true)
    expect(r.amp.omitidas_por_tiempo).toEqual([])
    expect(r.amp.gasto_usd).toBeCloseTo(0.07, 6)
    expect(r.items[0].json.acciones_pendientes).toBeUndefined()
  })
  it('el ANTES hacía las 7 en UN nodo: con 20 s cada una pasaban de 120 s (el defecto, demostrado)', async () => {
    const m = mundo(20_000)
    const t0 = Date.now()
    await correr(nodo(ANTES, '② Ampliar (Servicio de Apify)'), [cliente(7)], m.httpRequest)
    expect(Date.now() - t0).toBeGreaterThan(120_000)
  })
  it('ningún nodo de tanda dura más del tope aunque el plan pida muchas más llamadas', async () => {
    for (const dur of [10_000, 20_000, 45_000]) {
      const m = mundo(dur)
      let items: Item[] = [cliente(30)]
      for (const t of TANDAS) {
        const ini = Date.now()
        items = await correr(nodo(DESPUES, t), items, m.httpRequest)
        expect(Date.now() - ini).toBeLessThan(120_000)
      }
      vi.restoreAllMocks()
    }
  })
  it('lo que no cupo en las tres tandas se DECLARA en omitidas_por_tiempo y la ampliación no se dice «hecha»', async () => {
    const r = await cadena(30, 20_000)
    const hechas = (r.amp.llamadas as unknown[]).length
    const omitidas = r.amp.omitidas_por_tiempo as string[]
    expect(hechas + omitidas.length).toBe(30)
    expect(omitidas.length).toBeGreaterThan(0)
    expect(omitidas[0]).toMatch(/^f\d+: fn\d+$/)
    expect(r.amp.hecho).toBe(false)
  })
  it('el tiempo de cada llamada es lo que queda del nodo, nunca más de 112 s, y nunca empieza una pasado el presupuesto', async () => {
    const r = await cadena(12, 25_000)
    for (const l of r.llamadas) {
      expect(l.timeout).toBeLessThanOrEqual(112_000)
      expect(l.timeout).toBeGreaterThanOrEqual(5_000)
    }
    const servicio = r.llamadas.filter((l) => /apify-service-workflow/.test(l.url))
    // dentro de un mismo nodo, ninguna empieza pasados 60 s de su arranque
    const arranques: number[] = []
    let ini = servicio[0].en
    for (const l of servicio) { if (l.en - ini > 60_000) { arranques.push(l.en); ini = l.en } }
    expect(arranques.length).toBeLessThanOrEqual(2) // solo cambios de nodo, nunca una llamada tardía dentro del mismo
  })
  it('dos fallas seguidas paran al cliente (se declara en parado) y las demás no se llaman en ninguna tanda', async () => {
    const r = await cadena(7, 5_000, true)
    expect((r.amp.llamadas as unknown[]).length).toBe(2)
    expect(r.amp.parado).toBe('dos_fallas_seguidas')
    expect(r.amp.hecho).toBe(false)
  })
  it('dry_run no llama a nadie en ninguna tanda', async () => {
    const r = await cadena(7, 20_000, false, { dry_run: true })
    expect(r.llamadas.length).toBe(0)
    expect(r.amp.nota).toMatch(/dry_run/)
  })
  it('un cliente con falla del plan pasa sin llamadas y sin perder la falla', async () => {
    const r = await cadena(7, 20_000, false, { falla: 'plan roto' })
    expect(r.llamadas.length).toBe(0)
    expect(r.items[0].json.falla).toBe('plan roto')
  })
  it('sin acciones: nada se llama y no hay pendientes', async () => {
    const r = await cadena(0, 20_000)
    expect(r.llamadas.length).toBe(0)
    expect(r.amp.omitidas_por_tiempo).toEqual([])
  })
})

describe('② bis · ② ter · puente: lo que no cabe se declara', () => {
  const lectura = (k: number): Item[] => [{ json: { acciones: Array.from({ length: k }, (_v, i) => ({ funcion: 'pagina' + i, objetivo: 'o' + i, params: {}, usd_max: 0.02 })) } }]
  const previo = (): Item[] => [{ json: { workflow_id: 'wf', cliente: 'c1', nombre: 'N', dry_run: false, falla: null, ampliacion: { gasto_usd: 0 } } }]
  it('② bis: con páginas lentas no pasa del tope y declara las omitidas', async () => {
    const m = mundo(30_000)
    const ini = Date.now()
    const s = await correr(nodo(DESPUES, '② bis Leer artículos (Servicio de Apify)'), lectura(6), m.httpRequest, { '② Ampliar (Servicio de Apify)': previo() })
    expect(Date.now() - ini).toBeLessThan(120_000)
    const a = s[0].json.articulos as { llamadas: unknown[]; omitidas_por_tiempo?: string[] }
    expect(a.llamadas.length + (a.omitidas_por_tiempo?.length ?? 0)).toBe(6)
    expect(a.omitidas_por_tiempo!.length).toBeGreaterThan(0)
    for (const l of m.llamadas) expect(l.timeout).toBeLessThanOrEqual(112_000)
  })
  it('② bis: si caben (3 páginas rápidas) se hacen todas y no hay omitidas', async () => {
    const m = mundo(10_000)
    const s = await correr(nodo(DESPUES, '② bis Leer artículos (Servicio de Apify)'), lectura(3), m.httpRequest, { '② Ampliar (Servicio de Apify)': previo() })
    const a = s[0].json.articulos as { llamadas: unknown[]; omitidas_por_tiempo?: string[]; hecho: boolean }
    expect(a.llamadas.length).toBe(3)
    expect(a.omitidas_por_tiempo).toBeUndefined()
    expect(a.hecho).toBe(true)
  })
  it('② ter: igual', async () => {
    const m = mundo(40_000)
    const s = await correr(nodo(DESPUES, '② ter Leer reseñas y videos (Servicio de Apify)'), lectura(5), m.httpRequest, { '② bis Leer artículos (Servicio de Apify)': previo() })
    const a = s[0].json.tanda2 as { llamadas: unknown[]; omitidas_por_tiempo?: string[] }
    expect(a.llamadas.length + (a.omitidas_por_tiempo?.length ?? 0)).toBe(5)
    expect(a.omitidas_por_tiempo!.length).toBeGreaterThan(0)
  })
})

describe('guardas estructurales del flujo', () => {
  const codigos = (f: { nodes: Nodo[] }) => f.nodes.filter((n) => n.type === 'n8n-nodes-base.code' && /httpRequest/.test(n.parameters.jsCode ?? ''))
  it('todo nodo de código que llama a proveedores en bucle lleva el presupuesto de tiempo', () => {
    const sinPresupuesto = codigos(DESPUES).filter((n) => /for \(/.test(n.parameters.jsCode!) && !/RESTA_MS/.test(n.parameters.jsCode!) ).map((n) => n.name)
    expect(sinPresupuesto).toEqual([])
    expect(codigos(ANTES).filter((n) => !/RESTA_MS/.test(n.parameters.jsCode!)).length).toBeGreaterThan(0) // el ANTES no lo tenía
  })
  it('el horario y la entrada manual siguen conectados; ① Plan → tanda 1 → tanda 2 → ② Ampliar → ② bis', () => {
    const h = DESPUES.nodes.find((n: Nodo) => n.type === 'n8n-nodes-base.scheduleTrigger')
    expect(JSON.stringify(h.parameters)).toContain('30 8 * * *')
    expect(DESPUES.connections[h.name].main[0][0].node).toBe('⓪ Entrada')
    const sig = (n: string) => DESPUES.connections[n].main[0].map((x: { node: string }) => x.node)
    expect(sig('① Plan unificado')).toEqual(['② Ampliar (tanda 1)'])
    expect(sig('② Ampliar (tanda 1)')).toEqual(['② Ampliar (tanda 2)'])
    expect(sig('② Ampliar (tanda 2)')).toEqual(['② Ampliar (Servicio de Apify)'])
    expect(sig('② Ampliar (Servicio de Apify)')).toEqual(['② bis Artículos (qué leer)'])
  })
  it('cambian solo los nodos previstos: 3 de código con bucle + 2 nuevos; los demás idénticos', () => {
    const A = new Map((ANTES.nodes as Nodo[]).map((n) => [n.name, JSON.stringify(n.parameters)]))
    const cambian = (DESPUES.nodes as Nodo[]).filter((n) => A.has(n.name) && A.get(n.name) !== JSON.stringify(n.parameters)).map((n) => n.name).sort()
    expect(cambian).toEqual(['② Ampliar (Servicio de Apify)', '② bis Leer artículos (Servicio de Apify)', '② ter Leer reseñas y videos (Servicio de Apify)', '④ bis Puente (repetir hasta terminar)'].sort())
    expect((DESPUES.nodes as Nodo[]).filter((n) => !A.has(n.name)).map((n) => n.name).sort()).toEqual(['② Ampliar (tanda 1)', '② Ampliar (tanda 2)'])
  })
  it('la herramienta de respaldo/restauración re-registra el horario de un flujo activo (desactivar → activar)', () => {
    const s = fs.readFileSync(path.resolve(__dirname, '../../../../scripts/ops/n8n-flujo.mjs'), 'utf8')
    expect(s).toMatch(/\/deactivate/)
    expect(s).toMatch(/\/activate/)
  })
})
