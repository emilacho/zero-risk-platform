/**
 * 04-nov · el cable de la devolución de finanzas a la mesa (plan `X9F0zp6LQ2xGEYVS`). Todo en seco (US$ 0): corre el código real de los nodos con respuestas que hablan el contrato de la #908 / #903.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { construirDevolucionALaMesa, dos, FIN_CLONADOS, N_DEV_SI, N_DEV_PREP, N_DEV_HTTP, N_DEV_DECIDIR, N_DEV_SIGUE, N_DEV_AVANZAR, N_DEV_CERRAR, N_DEV_NUEVA } from '../scripts/ops/oficina-marketing/plan-devolucion-a-la-mesa.mjs'

type Nodo = { name: string; type: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, { main: Array<Array<{ node: string }>> }> }
const J = JSON.parse(readFileSync(join(process.cwd(), 'scripts/ops/oficina-marketing/aplicado/X9F0zp6LQ2xGEYVS-mesa-y-acta-2026-11-04.json'), 'utf8'))
const base = () => (J.workflow || J) as Flujo
const nuevo = () => { const f = structuredClone(base()); construirDevolucionALaMesa(f); return f }
const nod = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n) as Nodo
const cod = (f: Flujo, n: string) => nod(f, n).parameters.jsCode as string
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const destinos = (f: Flujo, n: string) => (f.connections[n]?.main || []).map((s) => (s || []).map((x) => x.node))

const ACTA = { esquema: 'acta.v1', numero: { meta: 40, por_que: 'p' }, servicio: 's', audiencia: 'a', oferta: 'o', camino: 'c', prueba: 'pr', canales: [{ canal: 'Meta', peso: 0.6, razon: 'r1' }, { canal: 'WhatsApp', peso: 0.4, razon: 'r2' }], no_se_hace: [], no_se: [] }
const ACTA2 = { ...ACTA, numero: { meta: 30, por_que: 'ajustada' } }
const VIA = { no_viable: true, motivo: 'la meta no cubre el equilibrio', cifra: 1234 }

async function corre(f: Flujo, nombre: string, datos: Record<string, any>, entrada: any = {}, runIndex = 0) {
  const $ = (n: string) => ({ first: () => { if (!(n in datos)) throw new Error('no corrió ' + n); return { json: datos[n] } }, all: () => [{ json: datos[n] }] })
  const fn = new AsyncFunction('$', '$input', '$runIndex', '$json', cod(f, nombre))
  return (await fn($, { first: () => ({ json: entrada }) }, runIndex, entrada))[0].json
}
const evalExpr = (f: Flujo, nombre: string, datos: Record<string, any>, json: any = {}) => {
  const expr = (nod(f, nombre).parameters.conditions.conditions[0].leftValue as string).replace(/^=\{\{|\}\}\s*$/g, '')
  const $ = (n: string) => ({ first: () => { if (!(n in datos)) throw new Error('no corrió ' + n); return { json: datos[n] } } })
  return new Function('$', '$json', 'return ' + expr)($, json)
}

describe('plan · la devolución de finanzas a la mesa', () => {
  it('el cableado: cerrar → puerta de la devolución → (sí) devolver ↔ avanzar → ¿acta nueva? → 2ª pasada de finanzas → sobre; (no) → sobre', () => {
    const f = nuevo(), a = base()
    expect(f.nodes.length).toBe(a.nodes.length + 8 + FIN_CLONADOS.length)
    expect(destinos(f, 'FIN · cerrar la oficina')).toEqual([['FIN · preguntar al dueño', N_DEV_SI]])
    expect(destinos(f, N_DEV_SI)).toEqual([[N_DEV_PREP], ['FIN · sobre']])
    expect(destinos(f, N_DEV_PREP)).toEqual([[N_DEV_HTTP]]); expect(destinos(f, N_DEV_HTTP)).toEqual([[N_DEV_DECIDIR]]); expect(destinos(f, N_DEV_DECIDIR)).toEqual([[N_DEV_SIGUE]])
    expect(destinos(f, N_DEV_SIGUE)).toEqual([[N_DEV_AVANZAR], [N_DEV_CERRAR]]); expect(destinos(f, N_DEV_AVANZAR)).toEqual([[N_DEV_DECIDIR]])
    expect(destinos(f, N_DEV_CERRAR)).toEqual([[N_DEV_NUEVA]]); expect(destinos(f, N_DEV_NUEVA)).toEqual([[dos('FIN · armar la semilla')], ['FIN · sobre']])
    // la segunda pasada es gemela de la primera, sin la pausa, y termina en el sobre
    expect(destinos(f, dos('FIN · armar la semilla'))).toEqual([[dos('FIN · abrir la conversación')]])
    expect(destinos(f, dos('FIN · decidir'))).toEqual([[dos('FIN · ¿sigue la conversación?')]])
    expect(destinos(f, dos('FIN · ¿sigue la conversación?'))).toEqual([[dos('FIN · avanzar un paso')], [dos('FIN · ¿leer la firma?')]])
    expect(destinos(f, dos('FIN · cerrar la oficina'))).toEqual([[dos('FIN · preguntar al dueño'), 'FIN · sobre']])
    expect(f.nodes.some((n) => /FIN2 · .*pausa|FIN2 · .*pausar/.test(n.name))).toBe(false)
  })

  it('CADA nodo nuevo solo nombra nodos que corren antes de él (la lección de CC3), y la 2ª pasada no nombra nada de la 1ª', () => {
    const f = nuevo()
    const previos = (nombre: string) => {
      const vistos = new Set<string>(), pila = [nombre]
      while (pila.length) { const x = pila.pop() as string; for (const [de, v] of Object.entries(f.connections)) if (v.main.some((s) => (s || []).some((c) => c.node === x)) && !vistos.has(de)) { vistos.add(de); pila.push(de) } }
      return vistos
    }
    const hojas = (v: unknown): string[] => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v as object).flatMap(hojas) : [])
    const nombres = (n: Nodo) => hojas(n.parameters).flatMap((t) => [...t.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]))
    const nuevos = f.nodes.filter((n) => !base().nodes.some((y) => y.name === n.name))
    expect(nuevos.length).toBe(8 + FIN_CLONADOS.length)
    for (const n of nuevos) {
      const ok = previos(n.name)
      for (const c of nombres(n)) {
        // lo que está dentro de un try/catch de «semilla» (PV3, la Junta…) existe río arriba; lo único prohibido es nombrar un nodo que NO precede
        expect(ok.has(c) || c === n.name, `«${n.name}» nombra «${c}», que no corre antes de él`).toBe(true)
      }
      if (n.name.startsWith('FIN2 · ')) for (const c of nombres(n)) expect(FIN_CLONADOS.map((x) => 'FIN · ' + x), `«${n.name}» nombra «${c}» de la 1ª pasada`).not.toContain(c)
    }
  })

  it('la puerta: devuelve solo si la mesa corrió Y finanzas dijo no_viable (una sola vez: la 2ª pasada nunca vuelve a esta puerta)', () => {
    const f = nuevo(), M = { mesa: true, encargo_id: 'e1' }
    const si = (cerrar: any, mesa: any = M) => evalExpr(f, N_DEV_SI, { 'MESA · cerrar el acta': mesa, 'FIN · cerrar la oficina': cerrar })
    expect(si({ finanzas_id: 'f1', viabilidad: VIA })).toBe(true)
    for (const c of [{ finanzas_id: 'f1', viabilidad: { ...VIA, no_viable: false } }, { finanzas_id: 'f1', viabilidad: null }, { finanzas_id: 'f1' }, { finanzas_motivo: 'sin_firma' }, null]) expect(si(c)).toBe(false)
    expect(si({ viabilidad: VIA }, { mesa: false })).toBe(false); expect(si({ viabilidad: VIA }, { mesa: true })).toBe(false) // sin encargo
    expect(evalExpr(f, N_DEV_SI, { 'FIN · cerrar la oficina': { viabilidad: VIA } })).toBe(false) // la mesa nunca corrió
    expect(evalExpr(f, N_DEV_SI, { 'MESA · cerrar el acta': M })).toBe(false)
    expect(destinos(f, dos('FIN · cerrar la oficina')).flat()).not.toContain(N_DEV_SI)
  })

  it('«FIN · cerrar la oficina» deja pasar la viabilidad de la firma (y solo la firma)', async () => {
    const f = nuevo()
    const datos = (salida: any) => ({ 'FIN · decidir': { fin: true }, 'Webhook · planeacion': { body: {} }, 'FIN · leer el encargo': { statusCode: 200, body: { estado: 'cerrado', turnos: [{ paso: 'firma', salida }] } } })
    expect(await corre(f, 'FIN · cerrar la oficina', datos({ estado: 'firmado', finanzas_id: 'f1', viabilidad: VIA }))).toEqual({ finanzas_id: 'f1', finanzas_motivo: null, viabilidad: VIA })
    expect((await corre(f, 'FIN · cerrar la oficina', datos({ estado: 'firmado', finanzas_id: 'f1' }))).viabilidad).toBeNull()
    expect((await corre(f, 'FIN · cerrar la oficina', datos({ estado: 'otro', finanzas_id: 'f1', viabilidad: VIA }))).viabilidad).toEqual(VIA)
    expect(await corre(base(), 'FIN · cerrar la oficina', datos({ estado: 'firmado', finanzas_id: 'f1', viabilidad: VIA }))).toEqual({ finanzas_id: 'f1', finanzas_motivo: null }) // hoy no la pasa
  })

  it('preparar: lleva el motivo y la cifra de la firma (con motivo por omisión) y el reloj propio', async () => {
    const f = nuevo(), M = { mesa: true, encargo_id: 'e1' }
    const p = await corre(f, N_DEV_PREP, { 'MESA · cerrar el acta': M, 'FIN · cerrar la oficina': { viabilidad: VIA } })
    expect(p).toMatchObject({ encargo_id: 'e1', motivo: VIA.motivo, cifra: 1234 }); expect(Math.abs(p.t0 - Date.now())).toBeLessThan(5000)
    expect(await corre(f, N_DEV_PREP, { 'MESA · cerrar el acta': M, 'FIN · cerrar la oficina': { viabilidad: { no_viable: true } } })).toMatchObject({ cifra: null, motivo: expect.stringContaining('no es viable') })
    const h = nod(f, N_DEV_HTTP).parameters
    expect(h.url).toContain('/api/planeacion/mesa'); expect(h.jsonBody).toContain("accion: 'devolver'"); expect(h.jsonBody).toContain('encargo_id: $json.encargo_id'); expect(h.jsonBody).toContain('motivo: $json.motivo'); expect(h.jsonBody).toContain('cifra')
    expect(nod(f, N_DEV_AVANZAR).parameters.jsonBody).toContain("$('" + N_DEV_PREP + "').first().json.encargo_id")
  })

  it('decidir la devolución: acepta, avanza hasta cerrar y NUNCA tumba el plan (si falla, sigue la 1ª pasada)', async () => {
    const f = nuevo(), D = (extra = {}) => ({ [N_DEV_PREP]: { encargo_id: 'e1', t0: Date.now() }, ...extra })
    expect(await corre(f, N_DEV_DECIDIR, D(), { statusCode: 200, body: { encargo_id: 'e1', estado: 'en_curso', terminado: false, devuelta: true } }, 0)).toEqual({ fin: false, encargo_id: 'e1' })
    for (const r of [{ statusCode: 409, body: { error: 'ya_se_devolvio' } }, { statusCode: 409, body: { error: 'mesa_sin_cerrar' } }, { statusCode: 409, body: { error: 'mesa_apagada' } }, { statusCode: 200, body: { devuelta: false } }, { statusCode: 500, body: {} }, {}]) expect(await corre(f, N_DEV_DECIDIR, D(), r, 0)).toMatchObject({ fin: true, motivo: 'sin_devolver' })
    expect(await corre(f, N_DEV_DECIDIR, D(), { statusCode: 200, body: { terminado: false } }, 2)).toEqual({ fin: false, encargo_id: 'e1' })
    expect(await corre(f, N_DEV_DECIDIR, D(), { statusCode: 200, body: { estado: 'cerrado', terminado: true, acta: ACTA2 } }, 4)).toMatchObject({ fin: true, estado: 'cerrado', acta: ACTA2 })
    expect(await corre(f, N_DEV_DECIDIR, D(), { statusCode: 502, body: {} }, 2)).toMatchObject({ fin: true, motivo: 'sin_contestar' })
    expect(await corre(f, N_DEV_DECIDIR, D({ [N_DEV_PREP]: { encargo_id: 'e1', t0: Date.now() - 31 * 60000 } }), { statusCode: 200, body: { terminado: false } }, 2)).toMatchObject({ fin: true, motivo: 'vencido' })
    expect(await corre(f, N_DEV_DECIDIR, D(), { statusCode: 200, body: { terminado: false } }, 24)).toMatchObject({ fin: true, motivo: 'vencido' })
  })

  it('cerrar la devolución y ¿hay acta nueva?: solo un acta NUEVA y válida abre la 2ª pasada; lo demás sigue con la 1ª sin lanzar', async () => {
    const f = nuevo(), C = (d: any) => corre(f, N_DEV_CERRAR, { [N_DEV_DECIDIR]: d })
    const ok = await C({ fin: true, encargo_id: 'e1', estado: 'cerrado', acta: ACTA2, faltan: ['x'] })
    expect(ok).toMatchObject({ mesa: true, devuelta: true, acta: ACTA2, aportes_que_faltan: ['x'] })
    expect(evalExpr(f, N_DEV_NUEVA, {}, ok)).toBe(true)
    for (const mal of [{ estado: 'sin_acuerdo', acta: null }, { estado: 'cierre_por_tope', acta: ACTA2 }, { estado: 'cerrado', acta: null }, { estado: 'cerrado', acta: { ...ACTA2, canales: [] } }, { estado: 'cerrado', acta: { ...ACTA2, esquema: 'x' } }, { motivo: 'sin_devolver', detalle: 'x' }, {}]) {
      const r = await C({ fin: true, ...mal })
      expect(r).toMatchObject({ devuelta: false, sin_acta_nueva: true }); expect(r.acta).toBeUndefined(); expect(evalExpr(f, N_DEV_NUEVA, {}, r)).toBe(false)
    }
  })

  it('la 2ª pasada de finanzas abre con el acta NUEVA y lleva su propio reloj; «sobre» prefiere la 2ª solo si trae tablero', async () => {
    const f = nuevo()
    const datos = { 'Webhook · planeacion': { body: { client_id: 'c1', plan_v3: true, dry_run: false } }, 'Unir lo del dueño al paquete': { ficha: { industry: 'bar' }, material: [], descartados: [], manual: {} }, 'MESA · cerrar el acta': { mesa: true, acta: ACTA }, [N_DEV_CERRAR]: { mesa: true, devuelta: true, acta: ACTA2 } }
    expect((await corre(f, dos('FIN · armar la semilla'), datos)).semilla.acta).toEqual(ACTA2)
    expect((await corre(f, 'FIN · armar la semilla', datos)).semilla.acta).toEqual(ACTA)
    expect(cod(f, dos('FIN · decidir'))).toContain("$('" + dos('FIN · armar la semilla') + "')")
    const paquete = [{ json: { a: 1 } }]
    const sobre = (c1: any, c2: any) => corre(f, 'FIN · sobre', { 'Unir el texto libre del dueño al paquete': paquete[0].json, 'FIN · cerrar la oficina': c1, ...(c2 === undefined ? {} : { [dos('FIN · cerrar la oficina')]: c2 }) }).catch((e) => e)
    // «sobre» devuelve el paquete con `finanzas_efectivo`; se lee con `.all()` simulado
    const corre2 = async (c1: any, c2: any) => { const $ = (n: string) => ({ first: () => { const d: any = { 'FIN · cerrar la oficina': c1, [dos('FIN · cerrar la oficina')]: c2 }; if (!(n in d) || d[n] === undefined) throw new Error('no corrió'); return { json: d[n] } }, all: () => [{ json: { a: 1 }, pairedItem: 0 }] }); return (await new AsyncFunction('$', cod(f, 'FIN · sobre'))($))[0].json.finanzas_efectivo }
    void sobre
    expect(await corre2({ finanzas_id: 'f1', finanzas_motivo: null }, { finanzas_id: 'f2', finanzas_motivo: null })).toEqual({ finanzas_id: 'f2', finanzas_motivo: null })
    expect(await corre2({ finanzas_id: 'f1', finanzas_motivo: null }, { finanzas_id: null, finanzas_motivo: 'sin_bloque' })).toEqual({ finanzas_id: 'f1', finanzas_motivo: null }) // la 2ª falló: vale la 1ª
    expect(await corre2({ finanzas_id: 'f1', finanzas_motivo: null }, undefined)).toEqual({ finanzas_id: 'f1', finanzas_motivo: null }) // no hubo 2ª
  })

  it('«Redactor (B4)» escribe sobre el acta MÁS NUEVA (la de la devolución si existe) y compila', () => {
    const f = nuevo(), b4 = cod(f, 'Redactor (B4)')
    expect(() => new Function('$', '$input', '$json', b4)).not.toThrow()
    const i = b4.indexOf('const ACT = '), j = b4.indexOf('] : [];', b4.indexOf('const bloqueActa')) + 7
    const modulo = b4.slice(i, j)
    const ejecutar = (d: any, m: any) => new Function('$', modulo + '\nreturn { ACT }')((n: string) => ({ first: () => { const t: any = { [N_DEV_CERRAR]: d, 'MESA · cerrar el acta': m }; if (!(n in t) || t[n] === undefined) throw new Error('no corrió'); return { json: t[n] } } })).ACT
    expect(ejecutar({ mesa: true, devuelta: true, acta: ACTA2 }, { mesa: true, acta: ACTA })).toEqual(ACTA2)
    expect(ejecutar({ mesa: true, devuelta: false, sin_acta_nueva: true }, { mesa: true, acta: ACTA })).toEqual(ACTA)
    expect(ejecutar(undefined, { mesa: true, acta: ACTA })).toEqual(ACTA)
    expect(ejecutar(undefined, undefined)).toBeNull()
  })

  it('compila CADA nodo del plan y solo cambian los esperados', () => {
    const f = nuevo(), a = base()
    for (const n of f.nodes) if (typeof n.parameters.jsCode === 'string') expect(() => new AsyncFunction('$', '$input', '$json', '$runIndex', '$workflow', '$execution', n.parameters.jsCode), n.name).not.toThrow()
    const cambian = f.nodes.filter((n) => { const o = a.nodes.find((y) => y.name === n.name); return o && JSON.stringify(n) !== JSON.stringify(o) }).map((n) => n.name).sort()
    expect(cambian).toEqual(['FIN · cerrar la oficina', 'FIN · sobre', 'Redactor (B4)'].sort())
  })

  it('se detiene si el plan cambió de forma', () => {
    const f = structuredClone(base()); const n = nod(f, 'FIN · sobre'); n.parameters.jsCode = String(n.parameters.jsCode).replace("const c = $('FIN · cerrar la oficina').first().json;", 'const c = null;')
    expect(() => construirDevolucionALaMesa(f)).toThrow()
  })
})
