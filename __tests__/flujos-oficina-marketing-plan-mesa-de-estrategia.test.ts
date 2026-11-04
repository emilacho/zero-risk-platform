/**
 * 04-nov · el lazo n8n de la mesa de estrategia (plan `X9F0zp6LQ2xGEYVS`). Todo en seco (US$ 0): corre el código real de los nodos con respuestas que hablan el contrato de la #903.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { construirMesaDeEstrategia, N_ABRE_SI, N_SEMILLA, N_ABRIR, N_DECIDIR, N_SIGUE, N_AVANZAR, N_CERRAR } from '../scripts/ops/oficina-marketing/plan-mesa-de-estrategia.mjs'

type Nodo = { name: string; type: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, { main: Array<Array<{ node: string }>> }> }
const J = JSON.parse(readFileSync(join(process.cwd(), 'scripts/ops/oficina-marketing/aplicado/X9F0zp6LQ2xGEYVS-calendario-2026-11-04.json'), 'utf8'))
const base = () => (J.workflow || J) as Flujo
const nuevo = () => { const f = structuredClone(base()); construirMesaDeEstrategia(f); return f }
const nod = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n) as Nodo
const cod = (f: Flujo, n: string) => nod(f, n).parameters.jsCode as string
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

const ACTA = { esquema: 'acta.v1', numero: { meta: 40, por_que: 'p' }, servicio: 's', audiencia: 'a', oferta: 'o', camino: 'c', prueba: 'pr', canales: [{ canal: 'Meta', peso: 0.6, razon: 'r1' }, { canal: 'Google', peso: 0.4, razon: 'r2', activo: true }], no_se_hace: [{ que: 'TikTok', por_que: 'no hay video' }], no_se: ['x'] }

/** corre un nodo Code con un `$` que contesta lo que se le dé por nombre de nodo */
async function corre(f: Flujo, nombre: string, datos: Record<string, any>, entrada: any = {}, runIndex = 0) {
  const $ = (n: string) => ({ first: () => { if (!(n in datos)) throw new Error('no corrió ' + n); return { json: datos[n] } }, all: () => [{ json: datos[n] }] })
  const fn = new AsyncFunction('$', '$input', '$runIndex', '$json', cod(f, nombre))
  return (await fn($, { first: () => ({ json: entrada }) }, runIndex, entrada))[0].json
}
const WEB = { 'Webhook · planeacion': { body: { client_id: 'c1', plan_v3: true, dry_run: false } } }

describe('plan · la mesa de estrategia (lazo n8n)', () => {
  it('«V9 · decidir» deja pasar `mesa` solo si es true; el resto no cambia', async () => {
    const dec = async (ff: Flujo, body: Record<string, unknown>) => corre(ff, 'V9 · decidir', {}, { statusCode: 200, body })
    expect((await dec(nuevo(), { decision: 'correr', mesa: true })).mesa).toBe(true)
    for (const raro of [undefined, false, 'true', 1, null]) expect((await dec(nuevo(), { decision: 'correr', mesa: raro })).mesa).toBe(false)
    expect((await dec(base(), { decision: 'correr', mesa: true })).mesa).toBeUndefined()
  })

  it('el cableado: lo que entregaba a la oficina financiera pasa por la puerta de la mesa; apagada, sale directo a la oficina', () => {
    const f = nuevo(), a = base()
    const quienes = (g: Flujo, a2: string) => Object.entries(g.connections).filter(([, v]) => v.main.some((s) => (s || []).some((x) => x.node === a2))).map(([k]) => k).sort()
    expect(quienes(a, 'FIN · ¿abre la oficina?')).toEqual(['PV3 · paquete', 'PV3 · ¿pide el dato v1?'].sort())
    expect(quienes(f, N_ABRE_SI)).toEqual(['PV3 · paquete', 'PV3 · ¿pide el dato v1?'].sort())
    expect(f.connections[N_ABRE_SI].main.map((s) => s.map((x) => x.node))).toEqual([[N_SEMILLA], ['FIN · ¿abre la oficina?']])
    expect(f.connections[N_SEMILLA].main[0].map((x) => x.node)).toEqual([N_ABRIR])
    expect(f.connections[N_ABRIR].main[0].map((x) => x.node)).toEqual([N_DECIDIR])
    expect(f.connections[N_DECIDIR].main[0].map((x) => x.node)).toEqual([N_SIGUE])
    expect(f.connections[N_CERRAR].main[0].map((x) => x.node)).toEqual(['FIN · ¿abre la oficina?'])
    expect(f.connections[N_AVANZAR].main[0].map((x) => x.node)).toEqual([N_DECIDIR])
    expect(f.connections[N_SIGUE].main.map((s) => s.map((x) => x.node))).toEqual([[N_AVANZAR], [N_CERRAR]])
    expect(f.nodes.length).toBe(a.nodes.length + 7)
  })

  it('la puerta: abre solo con plan v3, cliente, sin finanzas resueltas Y pre-vuelo con mesa:true (si no, el plan es el de hoy)', () => {
    const expr = nod(nuevo(), N_ABRE_SI).parameters.conditions.conditions[0].leftValue.replace(/^=\{\{|\}\}\s*$/g, '')
    const dec = (body: any, v9: any) => new Function('$', 'return ' + expr)((n: string) => ({ first: () => { if (n === 'V9 · decidir') { if (v9 === 'no_corrio') throw new Error('x'); return { json: v9 } } return { json: { body } } } }))
    const ok = { plan_v3: true, client_id: 'c1' }
    expect(dec(ok, { mesa: true })).toBe(true)
    expect(dec(ok, { mesa: false })).toBe(false); expect(dec(ok, {})).toBe(false); expect(dec(ok, 'no_corrio')).toBe(false)
    expect(dec({ ...ok, plan_v3: false }, { mesa: true })).toBe(false); expect(dec({ ...ok, client_id: '' }, { mesa: true })).toBe(false)
    expect(dec({ ...ok, finanzas_id: 'f1' }, { mesa: true })).toBe(false); expect(dec({ ...ok, finanzas_motivo: 'sin_firma' }, { mesa: true })).toBe(false)
  })

  it('los dos llamados van a /api/planeacion/mesa con el cuerpo del contrato y la llave interna', () => {
    const f = nuevo()
    for (const [n, acc] of [[N_ABRIR, 'abrir'], [N_AVANZAR, 'avanzar']] as const) {
      const p = nod(f, n).parameters
      expect(p.url).toContain('/api/planeacion/mesa'); expect(p.url).not.toContain('finanzas')
      expect(p.jsonBody).toContain("accion: '" + acc + "'"); expect(p.jsonBody).toContain('workflow_id'); expect(p.jsonBody).toContain('workflow_execution_id')
      expect(JSON.stringify(p.headerParameters)).toContain('INTERNAL_API_KEY')
    }
    expect(nod(f, N_ABRIR).parameters.jsonBody).toContain('semilla: $json.semilla')
    expect(nod(f, N_AVANZAR).parameters.jsonBody).toContain('encargo_id')
  })

  it('CADA nodo MESA · … solo nombra nodos que ya corrieron antes de él (lección de CC3: «avanzar» leía el encargo de FIN · decidir, que aún no existía)', () => {
    const f = nuevo()
    const previos = (nombre: string) => { // todos los nodos desde los que se llega a `nombre` (incluye los del propio lazo de la mesa)
      const vistos = new Set<string>(), pila = [nombre]
      while (pila.length) { const x = pila.pop() as string; for (const [de, v] of Object.entries(f.connections)) if (v.main.some((s) => (s || []).some((c) => c.node === x)) && !vistos.has(de)) { vistos.add(de); pila.push(de) } }
      return vistos
    }
    const hojas = (v: unknown): string[] => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v as object).flatMap(hojas) : [])
    const nombres = (n: Nodo) => hojas(n.parameters).flatMap((t) => [...t.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]))
    const mesa = f.nodes.filter((n) => n.name.startsWith('MESA · '))
    expect(mesa.length).toBe(7)
    for (const n of mesa) {
      const ok = previos(n.name), citados = nombres(n)
      for (const c of citados) expect(ok.has(c) || c === n.name, `«${n.name}» nombra «${c}», que no corre antes de él`).toBe(true)
    }
    expect(JSON.stringify(nod(f, N_AVANZAR).parameters)).not.toContain('FIN ·')
    expect(nod(f, N_AVANZAR).parameters.jsonBody).toContain("$('" + N_DECIDIR + "').first().json.encargo_id")
  })

  it('la semilla lleva el manual completo, la ficha, el material y lo del dueño, y respeta dry_run', async () => {
    const p = { ficha: { industry: 'bar', country: 'EC', config: { moneda: 'USD' } }, manual: { contenido_del_manual: { voz: 'x' } }, referencia: 'ref', icp: [1], material: [1, 2], hechos_del_dueno: [3], texto_libre_del_dueno: [4], descartados: [] }
    const s = await corre(nuevo(), N_SEMILLA, { ...WEB, 'Unir el texto libre del dueño al paquete': p, 'PV3 · paquete': { plan_version: 'v3', semilla: { datos: [{ d: 1 }], datos_omitidos: 2 }, dry_run: true } })
    expect(s).toMatchObject({ accion: 'abrir', client_id: 'c1', dry_run: false })
    expect(s.semilla).toMatchObject({ rubro: 'bar', pais: 'EC', moneda: 'USD', referencia_del_producto: 'ref', manual_completo: { voz: 'x' }, material: [1, 2], hechos_del_dueno: [3], datos: [{ d: 1 }], datos_omitidos: 2, corrida_es_de_ensayo: true })
    expect(s.semilla.ficha.industry).toBe('bar')
    const sinNada = await corre(nuevo(), N_SEMILLA, WEB) // ni el paquete llegó: no lanza
    expect(sinNada.semilla.material).toEqual([])
  })

  it('decidir: abrir, avanzar hasta terminar, apagada, errores y plazo', async () => {
    const f = nuevo(), D = (extra = {}) => ({ [N_SEMILLA]: { t0: Date.now() }, [N_DECIDIR]: { encargo_id: 'e1' }, ...extra })
    expect(await corre(f, N_DECIDIR, D(), { statusCode: 200, body: { encargo_id: 'e1', estado: 'abierto', terminado: false } }, 0)).toEqual({ fin: false, encargo_id: 'e1' })
    expect(await corre(f, N_DECIDIR, D(), { statusCode: 409, body: { error: 'mesa_apagada' } }, 0)).toEqual({ fin: true, resultado: 'apagada' })
    expect(await corre(f, N_DECIDIR, D(), { statusCode: 500, body: {} }, 0)).toMatchObject({ fin: true, motivo: 'sin_abrir' })
    expect(await corre(f, N_DECIDIR, D(), {}, 0)).toMatchObject({ fin: true, motivo: 'sin_abrir' })
    // «abrir» de una mesa que ya estaba cerrada (reanudación tras la pausa): trae el acta, no hay que avanzar
    expect(await corre(f, N_DECIDIR, D(), { statusCode: 200, body: { encargo_id: 'e1', estado: 'cerrado', terminado: true, acta: ACTA } }, 0)).toMatchObject({ fin: true, estado: 'cerrado', acta: ACTA })
    // vueltas de «avanzar»
    expect(await corre(f, N_DECIDIR, D(), { statusCode: 200, body: { encargo_id: 'e1', estado: 'en_curso', terminado: false } }, 3)).toEqual({ fin: false, encargo_id: 'e1' })
    expect(await corre(f, N_DECIDIR, D(), { statusCode: 200, body: { estado: 'cerrado', terminado: true, acta: ACTA } }, 5)).toMatchObject({ fin: true, estado: 'cerrado', acta: ACTA })
    expect(await corre(f, N_DECIDIR, D(), { statusCode: 200, body: { estado: 'cierre_por_tope', terminado: true, razon: 'tope' } }, 5)).toMatchObject({ fin: true, estado: 'cierre_por_tope', razon: 'tope' })
    expect(await corre(f, N_DECIDIR, D(), { statusCode: 502, body: {} }, 2)).toMatchObject({ fin: true, motivo: 'sin_contestar' })
    expect(await corre(f, N_DECIDIR, D(), { statusCode: 409, body: { error: 'mesa_apagada' } }, 2)).toEqual({ fin: true, resultado: 'apagada' })
    // plazo y tope de pasos: se declara «vencido»
    expect(await corre(f, N_DECIDIR, D({ [N_SEMILLA]: { t0: Date.now() - 31 * 60000 } }), { statusCode: 200, body: { terminado: false } }, 2)).toMatchObject({ fin: true, motivo: 'vencido' })
    expect(await corre(f, N_DECIDIR, D(), { statusCode: 200, body: { terminado: false } }, 24)).toMatchObject({ fin: true, motivo: 'vencido' })
  })

  it('cerrar: solo un acta cerrada y bien formada pasa; todo lo demás falla EN ROJO; apagada pasa de largo', async () => {
    const f = nuevo(), C = (d: any) => corre(f, N_CERRAR, { [N_DECIDIR]: d })
    expect(await C({ fin: true, encargo_id: 'e1', estado: 'cerrado', acta: ACTA })).toMatchObject({ mesa: true, acta: ACTA, encargo_id: 'e1' })
    expect(await C({ fin: true, resultado: 'apagada' })).toEqual({ mesa: false })
    const malos = [{ estado: 'sin_acuerdo', acta: null }, { estado: 'cierre_por_tope', acta: ACTA }, { estado: 'fallido', acta: ACTA }, { estado: 'cerrado', acta: null }, { estado: 'cerrado', acta: { ...ACTA, esquema: 'otro' } }, { estado: 'cerrado', acta: { ...ACTA, canales: [] } }, { estado: 'cerrado', acta: { ...ACTA, numero: { meta: 0 } } }, { motivo: 'vencido', encargo_id: 'e1' }, { motivo: 'sin_abrir' }, {}]
    for (const m of malos) await expect(C({ fin: true, ...m })).rejects.toThrow(/PLAN_MESA_SIN_ACTA/)
  })

  it('finanzas recibe el acta en su semilla; sin mesa, la semilla es la de hoy', async () => {
    const f = nuevo()
    const datos = { ...WEB, 'Unir lo del dueño al paquete': { ficha: { industry: 'bar' }, material: [], descartados: [], manual: {} } }
    expect((await corre(f, 'FIN · armar la semilla', { ...datos, [N_CERRAR]: { mesa: true, acta: ACTA } })).semilla.acta).toEqual(ACTA)
    expect((await corre(f, 'FIN · armar la semilla', { ...datos, [N_CERRAR]: { mesa: false } })).semilla.acta).toBeUndefined()
    const hoy = await corre(f, 'FIN · armar la semilla', datos) // la mesa nunca corrió
    const antes = await corre(base(), 'FIN · armar la semilla', datos)
    expect({ ...hoy, t0: 0 }).toEqual({ ...antes, t0: 0 })
  })

  it('«Redactor (B4)»: el acta entra antes del calendario, se declara en acta_usada y compila; sin acta no escribe nada', () => {
    const f = nuevo(), b4 = cod(f, 'Redactor (B4)')
    expect(() => new Function('$', '$input', '$json', b4)).not.toThrow()
    expect(b4.indexOf('...bloqueActa,')).toBeGreaterThan(b4.indexOf('bloquePlata,'))
    expect(b4.indexOf('...bloqueActa,')).toBeLessThan(b4.indexOf('...bloqueCalendario,'))
    expect(b4.indexOf('const ACT = ')).toBeLessThan(b4.indexOf('const pedido = ['))
    expect(b4).toContain('...(ACT ? { acta_usada: { canales: ACT.canales.length, meta: ACT.numero.meta } } : {}),')
    // opción A del 60 % (Emilio 18:42Z): con acta el reparto entre canales es el de la mesa; sin acta, la regla 7 es la de hoy, palabra por palabra
    const R7 = "'7. El reparto del presupuesto entre renglones lo propones tú, desde la meta y las fuentes de ESTE cliente (ver «EL PLAN A PRIMER NIVEL»).',"
    expect(cod(base(), 'Redactor (B4)')).toContain(R7)
    expect(b4).toContain("ACT ? '7. El reparto del presupuesto ENTRE CANALES ya lo acordó la mesa de estrategia")
    expect(b4).toContain(": " + R7.slice(0, -1) + ",") // la rama sin acta es la regla de hoy
    expect(b4).toContain('Esto MANDA sobre cualquier otra línea de este pedido que diga que tú propones el reparto entre canales')
    const i = b4.indexOf('const ACT = '), j = b4.indexOf('] : [];', b4.indexOf('const bloqueActa')) + 7
    const modulo = b4.slice(i, j)
    const bloque = (m: any) => new Function('$', modulo + '\nreturn { ACT, bloqueActa }')((n: string) => ({ first: () => { if (n !== N_CERRAR || m === 'no') throw new Error('no corrió'); return { json: m } } }))
    const ok = bloque({ mesa: true, acta: ACTA })
    const t = ok.bloqueActa.join('\n')
    expect(t).toContain('LO QUE ACORDÓ LA MESA DE ESTRATEGIA'); expect(t).toContain('- Meta: 60 % · r1'); expect(t).toContain('- TikTok · no hay video'); expect(t).toContain('no vuelvas a decidir canales')
    for (const malo of ['no', { mesa: false }, { mesa: true }, { mesa: true, acta: { ...ACTA, canales: [{ canal: 'x', peso: 'mucho', razon: 'r' }] } }, { mesa: true, acta: { ...ACTA, esquema: 'x' } }]) { const r = bloque(malo); expect(r.ACT).toBeNull(); expect(r.bloqueActa).toEqual([]) }
  })

  it('compila CADA nodo de código del plan y solo cambian/aparecen los esperados', () => {
    const f = nuevo(), a = base()
    for (const n of f.nodes) if (typeof n.parameters.jsCode === 'string') expect(() => new AsyncFunction('$', '$input', '$json', '$runIndex', '$workflow', '$execution', n.parameters.jsCode), n.name).not.toThrow()
    const cambian = f.nodes.filter((n) => { const o = a.nodes.find((y) => y.name === n.name); return o && JSON.stringify(n) !== JSON.stringify(o) }).map((n) => n.name).sort()
    expect(cambian).toEqual(['FIN · armar la semilla', 'Redactor (B4)', 'V9 · decidir'].sort())
    expect(f.nodes.filter((n) => !a.nodes.some((y) => y.name === n.name)).map((n) => n.name).sort()).toEqual([N_ABRE_SI, N_ABRIR, N_AVANZAR, N_CERRAR, N_DECIDIR, N_SEMILLA, N_SIGUE].sort())
  })

  it('se detiene si el plan cambió de forma', () => {
    const f = structuredClone(base()); const n = nod(f, 'Redactor (B4)'); n.parameters.jsCode = String(n.parameters.jsCode).replace('...bloqueCalendario,', '...bloqueCal2,')
    expect(() => construirMesaDeEstrategia(f)).toThrow()
  })
})
