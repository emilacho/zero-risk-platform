/**
 * SECO PUNTA A PUNTA (plan v3 + oficina financiera) · CC#1 · 15-oct · US$ 0 · sin red, sin Slack, sin modelo, sin Apify, `dry_run:true` explícito.
 *
 *   datos del plan v3 (piezas reales V1–V7/V10/V14, corredor del kit V11)
 *     → oficina financiera por la RUTA REAL `/api/finanzas/conversa` (proponente `campaign-brief-agent` → hilo → acuerdo de `chief-financial-officer` → bloque → firma), agentes SIMULADOS
 *     → el bloque firmado entra al flujo del plan v3 (F4: «Redactor (B4)» con el código REAL de los nodos) → plan simulado → chequeos P8/P9
 *
 * Negocios: los 4 de práctica del kit V11 (N · T · S · P) + Náufrago TAL CUAL (el oro: ficha del piloto, país «Ecuador», sin moneda declarada).
 * Casos de la oficina: firmado · sin acuerdo (sin referencia) · sin firma (el jefe no contesta) · vencido (cierre por tope) · apagada.
 * 🔴 «sin acuerdo / vencido ⇒ el plan sale con supuestos rotulados»: el bloque NO entra (solo entra el firmado), el pedido queda IDÉNTICO a hoy y el plan sale; nunca se bloquea.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CLIENTES, NEGOCIOS as NEGOCIOS_FIN, guionBase, redes, semilla } from '../scripts/ops/finanzas-seco/fixtures.mjs'
import { correrCelda as correrCeldaOficina } from '../scripts/ops/finanzas-seco/nucleo.mjs'
import { celdas as celdasDelPlan } from '../scripts/ops/plan-v3-seco/matriz.mjs'
import { correrCelda as correrCeldaDelPlan, type Celda } from '../scripts/ops/plan-v3-seco/corredor'
import { antesDeF4, enganchaFinanzas, FIN, moduloConFinanzas, NODOS } from '../scripts/worker-staging/finanzas-f4/construir-f4.mjs'
import { baseFalsa } from './_helpers/base-falsa-finanzas'

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => h.db }))
import { POST } from '../src/app/api/finanzas/conversa/route'
import { numerosDelBloque, huellaDe } from '../src/lib/finanzas/firma'
import { montosDeclarados, resumenDelBloque } from '../src/lib/finanzas/resumen'

const LLAVE = 'llave-interna-de-prueba-x1'
const IDS = [...CLIENTES.map((c: { id: string }) => c.id), 'prueba-finanzas-seco-naufrago-tal-cual']
const ENSAYO = { estado: 'ensayo', clientes_ensayo: IDS, preguntas_slack: 'apagado', conversa: 'ensayo' }

type Nodo = { name: string; type: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, unknown> }
const antes = antesDeF4() as Flujo
const despues = enganchaFinanzas(antes) as Flujo
const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<any>
const M = new Function(moduloConFinanzas() + '\nreturn { revisarPlan }')() as { revisarPlan: (t: string, c: unknown) => { ok: boolean; marcas: Array<{ codigo: string }> } }

// ───────────────────────── los 5 negocios: lo que la oficina ve de cada uno (semilla y guion) y su celda de datos del plan
const finDe = (slug: string) => NEGOCIOS_FIN.find((n: { slug: string }) => n.slug === slug)!
const NAUFRAGO = { ...finDe('local-con-entrega'), slug: 'naufrago-tal-cual', nombre: 'Náufrago (ficha tal cual · PRUEBA)', rubro: 'restaurante local con entrega', pais: 'Ecuador', moneda: 'USD' }
const NEGOCIOS = [
  { id: 'N', fin: finDe('local-con-entrega'), sinMoneda: false },
  { id: 'T', fin: finDe('tienda-en-linea'), sinMoneda: false },
  { id: 'S', fin: finDe('servicio-b2b-ciclo-largo'), sinMoneda: false },
  { id: 'P', fin: finDe('profesional-con-citas'), sinMoneda: false },
  { id: 'NAUFRAGO', fin: NAUFRAGO, sinMoneda: true },
]
const idCliente = (fin: { slug: string }) => `prueba-finanzas-seco-${fin.slug}`
const celdaDeDatos = (n: (typeof NEGOCIOS)[number]) => {
  const todas = celdasDelPlan() as Celda[]
  // Náufrago tal cual = el caso de ORO del kit (ficha del piloto sin moneda declarada); los demás, el caso base
  return n.id === 'NAUFRAGO' ? todas.find((c) => c.caso.id === 'O1')! : todas.find((c) => c.negocio.id === n.id && c.caso.id === 'B1')!
}

// ───────────────────────── la oficina por la ruta real
type CasoOficina = 'firmado' | 'sin_acuerdo' | 'sin_firma' | 'vencido'
const CASOS_OFICINA: Record<CasoOficina, { semilla?: Record<string, unknown>; guion?: (n: any) => Record<string, unknown>; costo?: number; estadoFinal: string; firma: string }> = {
  firmado: { estadoFinal: 'cerrado', firma: 'firmado' },
  sin_acuerdo: { semilla: { sin_referencia: true }, guion: (n) => ({ ...guionBase(n), redes: redes(n, { sinCosto: true }) }), estadoFinal: 'sin_acuerdo', firma: 'sin_bloque' },
  sin_firma: { guion: (n) => ({ ...guionBase(n), cierre: null }), estadoFinal: 'sin_acuerdo', firma: 'sin_firma' },
  vencido: { costo: 0.6, estadoFinal: 'cierre_por_tope', firma: 'sin_turno_de_firma' },
}
async function llamar(cuerpo: unknown) {
  const r = await POST(new Request('http://local/api/finanzas/conversa', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': LLAVE }, body: JSON.stringify(cuerpo) }))
  return { status: r.status, json: (await r.json().catch(() => null)) as any }
}
async function correrOficina(n: (typeof NEGOCIOS)[number], caso: CasoOficina) {
  const c = CASOS_OFICINA[caso]
  const sem = semilla(n.fin, 'tuteo', c.semilla)
  if (n.sinMoneda) delete (sem as Record<string, unknown>).moneda // Náufrago tal cual: sin moneda declarada
  const guion = (c.guion ?? guionBase)(n.fin)
  const celda = { id: `${n.id}-${caso}`, client_id: idCliente(n.fin), semilla: sem, simulacion: { guion, ...(c.costo ? { costo_por_llamada_usd: c.costo } : {}) }, espera: {} }
  return correrCeldaOficina(llamar, celda) as unknown as Promise<{ obs: { estado: string; gasto_usd: number; pasos: string[]; turnos: Array<{ paso: string; salida: Record<string, any> }>; llamadas: Array<{ paso: string }> }; veredicto: { ok: boolean; fallas: string[] } }>
}

// ───────────────────────── el flujo del plan: el código REAL de «Redactor (B4)» con lo que contesta «FIN · leer el bloque»
const MANUAL = { client_id: 'x-1', manual_id: 'm1', manual_aprobado: true, registro_del_manual: { registro: 'tuteo', fuente: 'declarado_en_el_manual', pruebas: [] }, identidad_del_manual: { primary_colors: ['#112233'], tone: 'cercano' } }
const entradaDe = (n: (typeof NEGOCIOS)[number]) => ({
  ficha: { id: 'x-1', name: n.fin.nombre, country: n.fin.pais, industry: n.fin.rubro, config: { spend_cap_usd: 9 } }, manual: MANUAL, material: [], descartados: [], referencia: 'DOCUMENTO', casa: {}, plata: {},
  hechos_del_dueno: ['Atiende por cita previa.'],
})
async function b4(flujo: Flujo, ent: Record<string, unknown>, nodoFin?: Record<string, unknown>, hook: Record<string, unknown> = {}) {
  const dolar = (nombre: string) => {
    if (nombre === FIN.leer && nodoFin) return { first: () => ({ json: nodoFin }) }
    if (nombre === 'Webhook · planeacion') return { first: () => ({ json: { body: hook } }) }
    throw new Error(`Node '${nombre}' hasn't been executed`)
  }
  const f = new AsyncFunction('$input', '$', String(flujo.nodes.find((x) => x.name === NODOS.b4)!.parameters.jsCode))
  return (await f({ first: () => ({ json: ent }) }, dolar))[0].json as Record<string, any>
}
/** lo que contestaría `GET tablero` si el encargo hubiera sido REAL y firmado: se construye con las funciones reales (números, huella, resumen) sobre el bloque del turno «calculo» */
function respuestaDeLaRuta(obs: { turnos: Array<{ paso: string; salida: Record<string, any> }> }, moneda: string | undefined) {
  const calculo = obs.turnos.find((t) => t.paso === 'calculo')?.salida
  const firma = obs.turnos.find((t) => t.paso === 'firma')?.salida
  if (!calculo?.hay_bloque) return { statusCode: 404, body: { error: 'tablero_inexistente' } }
  const bloque = calculo.bloque
  // en real, un bloque calculado se guarda aunque no se firme: estado «firmado» o «sin_firma» (la ruta del tablero lo lee igual)
  const estado = firma?.estado === 'firmado' ? 'firmado' : 'sin_firma'
  return { statusCode: 200, body: { finanzas_id: '3f2b8c1e-9d4a-4b7e-8a61-0c5d2e7f9a10', estado, huella: huellaDe(bloque), numeros: numerosDelBloque(bloque), semanas: 12, resumen: resumenDelBloque(bloque, { moneda }), montos_declarados: montosDeclarados(bloque) } }
}
const sinRotular = /\$\s?\d|US\$|USD/
/** un plan simulado cuya sección de presupuesto usa SOLO las cifras firmadas, rotuladas como estimación */
function planQueCita(numeros: Array<{ clave: string; valor: number | null; tipo: string }>) {
  const v = (k: string) => numeros.find((x) => x.clave === k)?.valor
  const f = (x: number | null | undefined) => (x == null ? '' : x.toFixed(2).replace('.', ','))
  return `# Plan\n\n## Presupuesto\nPauta de rendimiento: US$ ${f(v('pauta_rendimiento_mes'))} al mes (estimación, supuesto declarado). Producción de contenido: US$ ${f(v('produccion_mes'))} al mes (estimación). Total del mes: US$ ${f(v('total_mes'))} (estimación).\n\n## Cómo medimos\nSe mide por semana.\n`
}
/** ¿el monto es una cifra firmada (valor/min/max) o un monto declarado por el bloque? (con la tolerancia del chequeo) */
function permitida(ctx: { finanzas: { numeros: Array<{ valor: number | null; minimo: number | null; maximo: number | null }>; declaradas: number[] } }, v: number) {
  const todos = [...ctx.finanzas.numeros.flatMap((x) => [x.valor, x.minimo, x.maximo]), ...ctx.finanzas.declaradas].filter((y): y is number => typeof y === 'number' && y > 0)
  const tol = Math.max(v * 0.002, 0.011)
  return todos.some((y) => Math.abs(y - v) <= tol)
}
/** una cifra que NO puede ser ninguna firmada ni suma de 2–3 firmadas (P8 admite sumas): mayor que 3 veces la suma de todo lo firmado */
function planConCifraInventada(numeros: Array<{ valor: number | null; minimo: number | null; maximo: number | null }>) {
  const todo = numeros.flatMap((x) => [x.valor, x.minimo, x.maximo]).filter((v): v is number => typeof v === 'number' && v > 0)
  const inventada = Math.round(todo.reduce((a, b) => a + b, 0) * 3 + 1234.57)
  return `# Plan\n\n## Presupuesto\nPauta de rendimiento: US$ ${inventada},00 al mes.\n\n## Cómo medimos\nSe mide por semana.\n`
}

beforeEach(() => { h.db = baseFalsa(ENSAYO).db; process.env.INTERNAL_API_KEY = LLAVE; delete process.env.SALA_DISPATCH_KEY })

describe('X1 · datos del plan v3 + oficina financiera (por negocio)', () => {
  it.each(NEGOCIOS.map((n) => [n.id, n] as const))('%s · FIRMADO: la oficina cierra y el bloque entra al plan; P8/P9 sin marcas; una cifra inventada SÍ se marca', async (_id, n) => {
    // 1 · datos del plan (V11)
    const datos = correrCeldaDelPlan(celdaDeDatos(n))
    expect(datos.ok, datos.fallas.join(' | ')).toBe(true)
    // 2 · la oficina por la ruta real, agentes simulados
    const o = await correrOficina(n, 'firmado')
    expect(o.veredicto.fallas).toEqual([])
    expect(o.obs.estado).toBe('cerrado')
    expect(o.obs.turnos.find((t) => t.paso === 'firma')?.salida.estado).toBe('firmado')
    expect(o.obs.gasto_usd).toBeLessThanOrEqual(1.5)
    // orden de la conversación: proponente → … → acuerdo del jefe → bloque → firma
    const orden = o.obs.pasos
    expect(orden.indexOf('planteo')).toBeLessThan(orden.indexOf('cierre'))
    expect(orden.indexOf('cierre')).toBeLessThan(orden.indexOf('firma'))
    // 3 · el flujo del plan con el bloque firmado
    const resp = respuestaDeLaRuta(o.obs, n.sinMoneda ? undefined : (n.fin as { moneda: string }).moneda)
    expect(resp.statusCode).toBe(200)
    const hoy = await b4(antes, entradaDe(n))
    const con = await b4(despues, entradaDe(n), resp as Record<string, unknown>)
    expect(con.pedido).toContain('NÚMEROS DE LA OFICINA FINANCIERA (firmados)')
    expect(con.finanzas_id_usado).toBe((resp.body as any).finanzas_id)
    expect(con.pedido.replace(/══════ NÚMEROS DE LA OFICINA FINANCIERA[\s\S]*?\n\n/, '')).toBe(hoy.pedido) // lo demás, igual que hoy
    // 4 · el plan simulado y sus chequeos
    const numeros = (resp.body as any).numeros
    const bueno = M.revisarPlan(planQueCita(numeros), con.contexto_chequeo)
    expect(bueno.marcas.filter((m) => m.codigo === 'P8' || m.codigo === 'P9')).toEqual([])
    const malo = M.revisarPlan(planConCifraInventada(numeros), con.contexto_chequeo)
    expect(malo.marcas.some((m) => m.codigo === 'P8')).toBe(true)
    expect(malo.ok).toBe(false) // «con_pendientes»: se marca, NO se bloquea
  })

  it.each(NEGOCIOS.map((n) => [n.id, n] as const))('%s · SIN ACUERDO / SIN FIRMA / VENCIDO (v2): el plan RECIBE los rangos supuestos y el motivo, lo dice y sale; nunca bloquea', async (_id, n) => {
    for (const caso of ['sin_acuerdo', 'sin_firma', 'vencido'] as const) {
      const o = await correrOficina(n, caso)
      const c = CASOS_OFICINA[caso]
      expect(o.veredicto.fallas, `${caso}: ${o.veredicto.fallas.join(' | ')}`).toEqual([])
      expect(o.obs.estado, caso).toBe(c.estadoFinal)
      expect(o.obs.turnos.find((t) => t.paso === 'firma')?.salida.estado ?? 'sin_turno_de_firma', caso).toBe(c.firma)
      if (caso === 'vencido') {
        expect(o.obs.gasto_usd).toBeGreaterThanOrEqual(1.5)
        expect(o.obs.gasto_usd).toBeLessThanOrEqual(1.5 + 0.6 + 1e-9)
      } else expect(o.obs.gasto_usd, caso).toBeLessThanOrEqual(1.5)
      // lo que la ruta del tablero diría (con bloque, aunque sin firma; sin bloque, 404) y el motivo que el sobre trae
      const resp = respuestaDeLaRuta(o.obs, undefined)
      const hayBloque = resp.statusCode === 200
      const hook = { finanzas_motivo: caso, client_id: 'x-1', ...(hayBloque ? { finanzas_id: (resp.body as any).finanzas_id } : {}) }
      const hoy = await b4(antes, entradaDe(n))
      const con = await b4(despues, entradaDe(n), resp as Record<string, unknown>, hook)
      // el plan RECIBE algo: el bloque rotulado «sin firma» (si lo hay) o el aviso «sin números firmados» (si no)
      expect(con.pedido, caso).not.toBe(hoy.pedido)
      expect(con.pedido, caso).toContain(hayBloque ? 'SIN FIRMA' : 'SIN NÚMEROS FIRMADOS')
      expect(con.contexto_chequeo.finanzas.estado, caso).toBe(hayBloque ? 'sin_firma' : 'sin_bloque')
      expect(con.contexto_chequeo.finanzas.motivo, caso).toBe(caso)
      // sin el bloque agregado, el pedido es el de hoy
      expect(con.pedido.replace(/══════ (?:NÚMEROS DE LA OFICINA FINANCIERA|OFICINA FINANCIERA: SIN NÚMEROS)[\s\S]*?\n\n/, ''), caso).toBe(hoy.pedido)
      // el plan que NO lo dice se marca (P9) y el que lo dice y rotula sus montos sale limpio; en ningún caso se bloquea
      const callado = '# Plan\n\n## Presupuesto\nPauta de US$ 200 al mes.\n'
      const mudo = M.revisarPlan(callado, con.contexto_chequeo)
      expect(mudo.marcas.some((m) => m.codigo === 'P9'), caso).toBe(true)
      const dicho = hayBloque
        ? planQueCita((resp.body as any).numeros).replace('## Presupuesto\n', '## Presupuesto\nLos números de la oficina financiera quedaron sin firma (sin acuerdo): son una estimación.\n')
        : '# Plan\n\n## Presupuesto\nLa oficina financiera no firmó los números (sin acuerdo): pauta orientativa de US$ 200 al mes (estimación, rango supuesto).\n'
      const limpio = M.revisarPlan(dicho, con.contexto_chequeo)
      expect(limpio.marcas.filter((m) => m.codigo === 'P8' || m.codigo === 'P9'), caso).toEqual([])
    }
  })

  it.each(NEGOCIOS.map((n) => [n.id, n] as const))('%s · hallazgo 1: US$ 777,77 y mutaciones de cada firmada se marcan; las firmadas pasan', async (_id, n) => {
    const o = await correrOficina(n, 'firmado')
    const resp = respuestaDeLaRuta(o.obs, undefined)
    const con = await b4(despues, entradaDe(n), resp as Record<string, unknown>, { finanzas_id: (resp.body as any).finanzas_id, client_id: 'x-1' })
    const ctx = con.contexto_chequeo
    const p8 = (monto: string) => M.revisarPlan(`# Plan\n\n## Presupuesto\nPauta: US$ ${monto} al mes (estimación).\n`, ctx).marcas.some((m) => m.codigo === 'P8')
    const coma = (x: number) => x.toFixed(2).replace('.', ',')
    // la cifra inventada del hallazgo (antes coincidía con una suma en T y P)
    if (!permitida(ctx, 777.77)) expect(p8('777,77')).toBe(true)
    // cada cifra firmada pasa tal cual y marca al moverla +1 % y +1 unidad (mutación)
    const dineros = (resp.body as any).numeros.filter((x: any) => typeof x.valor === 'number' && x.valor >= 1)
    expect(dineros.length).toBeGreaterThan(2)
    for (const x of dineros) {
      expect(p8(coma(x.valor)), `${x.clave} exacta`).toBe(false)
      const movida = x.valor * 1.01 + 1
      if (!permitida(ctx, movida)) expect(p8(coma(movida)), `${x.clave} +1 %`).toBe(true)
    }
    // una suma de dos firmadas ya NO pasa por su cuenta, salvo que el bloque la declare
    const [a, b] = dineros
    const suma = Math.round((a.valor + b.valor) * 100) / 100
    if (!permitida(ctx, suma)) expect(p8(coma(suma)), 'suma de 2').toBe(true)
  })

  it.each(NEGOCIOS.map((n) => [n.id, n] as const))('%s · APAGADA: la oficina contesta 409 sin escribir y el plan sale idéntico a hoy', async (_id, n) => {
    h.db = baseFalsa({ ...ENSAYO, estado: 'apagada', conversa: 'apagado' }).db
    const r = await llamar({ accion: 'abrir', client_id: idCliente(n.fin), dry_run: true, semilla: semilla(n.fin, 'tuteo') })
    expect(r.status).toBe(409)
    const hoy = await b4(antes, entradaDe(n))
    const con = await b4(despues, entradaDe(n), { statusCode: 409, body: { error: 'finanzas_apagada' } })
    expect(JSON.stringify(con)).toBe(JSON.stringify(hoy))
  })
})

describe('X1 · contadores: la oficina en seco solo toca sus tablas de práctica', () => {
  it('encargos de práctica con dry_run=true, sin tablero, sin números, sin preguntas, y ningún cliente real', async () => {
    const base = baseFalsa(ENSAYO)
    h.db = base.db
    for (const n of NEGOCIOS) await correrOficina(n, 'firmado')
    expect(base.t.finanzas_encargos.length).toBe(NEGOCIOS.length)
    expect(base.t.finanzas_encargos.every((e: any) => e.dry_run === true && IDS.includes(e.client_id))).toBe(true)
    expect(Object.keys(base.t).sort()).toEqual(['finanzas_artefactos', 'finanzas_config', 'finanzas_encargos', 'finanzas_turnos'])
  })
  it('sin acuerdo no hay ninguna cifra monetaria de la oficina en el pedido (nada se inventa)', async () => {
    const n = NEGOCIOS[0]
    const o = await correrOficina(n, 'sin_acuerdo')
    const con = await b4(despues, entradaDe(n), respuestaDeLaRuta(o.obs, undefined) as Record<string, unknown>)
    expect(con.pedido).not.toContain('OFICINA FINANCIERA')
    expect(sinRotular.test('')).toBe(false)
  })
})
