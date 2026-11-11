/**
 * Colaterales 2d · parte 3 · turno, entrega y barrido (diseño 2d + ADENDA 1 · líneas de CC7 y CC6).
 * Dos clientes de rubros distintos, con extractos REALES de sus documentos (los mismos fixtures del motor 2a):
 *   A · restaurante: el brief cambia el insight → la gran idea;   B · industria B2B: el plan cambia una condición → la estrategia (JSON).
 * La base falsa es la de los colaterales (columnas y permisos de update leídos de la migración real).
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import A from './__fixtures__/naufrago-2026-11-10-extractos.json'
import B from './__fixtures__/b2b-industrial-2026-11-10.json'
import { baseFalsa } from './base-falsa'
import { almacenDeColaterales, type NuevaEdicion } from '../almacen'
import { red } from '../red'
import { INSTRUCCION_DE_GRAVEDAD } from '../gravedad'
import { AGENTE_SECRETARIA, PLAZO_DEL_BARRIDO_MS, TOPE_DE_LA_LLAMADA_USD, FACTOR_DE_RESERVA, barrer, entregar, llaveDeLaSecretaria, selloDe, turno, type DocumentoLeido, type PuertosDelTurno } from '../turno'
import type { Documento } from '../../cadena/dependencias-de-documentos'
import type { ResultadoDeLaGuarda } from '../../oficina/piezas-por-publicar'

/** el tope diario de la prueba (en lo real es un dato del cliente: por omisión US$ 5) */
const TOPE_DIARIO_DEL_CLIENTE_USD = 5
const TODAS = new Set(['manual', 'plan', 'estrategia', 'brief', 'gran_idea', 'calendario', 'pieza'])
const CLI_A = 'a0000000-0000-4000-8000-00000000000a'
const CLI_B = 'b0000000-0000-4000-8000-00000000000b'
const CAMP_A = 'ca000000-0000-4000-8000-0000000000ca'

const EDIC_A: NuevaEdicion = { client_id: CLI_A, documento: 'brief', documento_ref: CAMP_A, version_base: '2', seccion: 'Insight', antes: 'sabe que el bueno viene de la costa', despues: 'sabe que el bueno viene de la playa', llave: 'llave-edicion-A-0001' }
const CONDICION_B = 'activar cuando exista perfil LinkedIn de empresa creado y validado'
const EDIC_B: NuevaEdicion = { client_id: CLI_B, documento: 'plan', documento_ref: 'plan-b-1', version_base: '1', seccion: 'canales', antes: CONDICION_B, despues: 'activar cuando exista perfil LinkedIn de empresa creado, validado y con su primera publicación', llave: 'llave-edicion-B-0001' }
const DOCS_A: Partial<Record<Documento, DocumentoLeido>> = { gran_idea: { texto: A.gran_idea_v3, ref: CAMP_A, version: '3' } }
const DOCS_B: Partial<Record<Documento, DocumentoLeido>> = { estrategia: { texto: B.estrategia, ref: 'camp-b', version: '1' } }

function armar(o: { activas?: Set<string>; guarda?: ResultadoDeLaGuarda | Error; docs?: Partial<Record<Documento, DocumentoLeido>> | Error; gasto?: number; enVuelo?: number; propia?: boolean | Error; tope?: number | null | Error } = {}) {
  const { db, tablas } = baseFalsa()
  const almacen = almacenDeColaterales(db)
  const guarda = vi.fn(async (_c: string, _camp: string | null) => { if (o.guarda instanceof Error) throw o.guarda; return o.guarda ?? { frenan: [], se_asumen_publicadas: [] } })
  const docs = vi.fn(async (e: { documento: string }) => { if (o.docs instanceof Error) throw o.docs; return o.docs ?? (e.documento === 'plan' ? DOCS_B : DOCS_A) })
  const gasto = vi.fn(async (_c: string, _sin: string) => ({ recibos: o.gasto ?? 0, en_vuelo: o.enVuelo ?? 0 }))
  const propia = vi.fn(async (_c: string, _camp: string) => { if (o.propia instanceof Error) throw o.propia; return o.propia ?? true })
  const tope = vi.fn(async (_c: string) => { if (o.tope instanceof Error) throw o.tope; return o.tope === undefined ? TOPE_DIARIO_DEL_CLIENTE_USD : o.tope })
  const P: PuertosDelTurno = { almacen, filasActivas: async () => o.activas ?? TODAS, piezasPorPublicar: guarda, documentos: docs, campanaDelCliente: propia, gastoDelDia: gasto, topeDiario: tope }
  return { P, almacen, tablas, guarda, docs, gasto, propia, tope }
}
const crear = async (al: ReturnType<typeof almacenDeColaterales>, n: NuevaEdicion) => (await al.crearEdicion(n)).edicion.id
const estado = (t: ReturnType<typeof baseFalsa>['tablas'], id: string) => t.colaterales_ediciones.find((f) => f.id === id)?.estado

/** una salida «buena» para A: la cita literal del insight se retoca; lo demás no afecta, con su razón */
function salidaBuenaA(ids: string[], o: { gravedad?: unknown } = {}) {
  const { candidatos } = red(EDIC_A, { gran_idea: A.gran_idea_v3 })
  const conCita = candidatos.filter((p) => ids.includes(p.id) && p.texto.includes(EDIC_A.antes)).map((p) => p.id)
  return {
    gravedad: o.gravedad === undefined ? { de_fondo: false, razon: `cambia «${EDIC_A.antes}» por «${EDIC_A.despues}»: el mismo origen del producto` } : o.gravedad,
    revisados: ids.map((id) => ({ id, afecta: conCita.includes(id), razon: conCita.includes(id) ? '' : 'no habla del origen' })),
    colaterales: conCita.map((id) => ({ id, documento: 'gran_idea', antes: EDIC_A.antes, despues: EDIC_A.despues, porque: 'cita literal del insight' })),
    no_aparece: [],
  }
}

describe('turno · dos clientes · el pedido sale con su llave, su tope y su sello', () => {
  it('A (brief → gran idea): pide a la secretaria con los pedazos de la gran idea; la edición queda en_curso', async () => {
    const { P, almacen, tablas, guarda } = armar()
    const id = await crear(almacen, EDIC_A)
    const r = await turno(P, { edicion_id: id, seco: false, workflow_execution_id: '901' })
    expect(r.accion).toBe('pedir')
    if (r.accion !== 'pedir') return
    expect(r.agente).toBe(AGENTE_SECRETARIA)
    expect(r.dispatch_key).toBe(llaveDeLaSecretaria(id))
    expect(r.tope_usd).toBe(TOPE_DE_LA_LLAMADA_USD)
    expect(r.candidatos.length).toBeGreaterThan(0)
    expect(r.pedido).toContain(INSTRUCCION_DE_GRAVEDAD)
    expect(r.pedido).toContain(`ANTES: «${EDIC_A.antes}»`)
    for (const c of r.candidatos) expect(r.pedido).toContain(`[${c}] (gran_idea · `)
    expect(estado(tablas, id)).toBe('en_curso')
    expect(tablas.colaterales_ediciones[0].workflow_execution_id).toBe('901')
    // el brief es de una campaña: la guarda mira SOLO esa campaña
    expect(guarda).toHaveBeenCalledWith(CLI_A, CAMP_A)
  })
  it('B (plan → estrategia JSON): pide con los pedazos por ruta; la guarda mira TODAS las campañas (el plan es del cliente)', async () => {
    const { P, almacen, guarda } = armar()
    const id = await crear(almacen, EDIC_B)
    const r = await turno(P, { edicion_id: id, seco: false, workflow_execution_id: null })
    expect(r.accion).toBe('pedir')
    if (r.accion === 'pedir') expect(r.pedido).toContain('(estrategia · ')
    expect(guarda).toHaveBeenCalledWith(CLI_B, null)
  })
  it('el sello depende de los pedazos y de las versiones: otra versión de un documento da otro sello', () => {
    const { candidatos } = red(EDIC_A, { gran_idea: A.gran_idea_v3 })
    expect(selloDe(candidatos, DOCS_A)).toBe(selloDe(candidatos, DOCS_A))
    expect(selloDe(candidatos, { gran_idea: { ...DOCS_A.gran_idea!, version: '4' } })).not.toBe(selloDe(candidatos, DOCS_A))
  })
})

describe('🔴 idempotencia · la misma edición dos veces = UNA corrida', () => {
  it('en serie: el segundo turno contesta ya_corrida y no lee nada', async () => {
    const { P, almacen, docs } = armar()
    const id = await crear(almacen, EDIC_A)
    await turno(P, { edicion_id: id, seco: false, workflow_execution_id: '1' })
    docs.mockClear()
    expect(await turno(P, { edicion_id: id, seco: false, workflow_execution_id: '2' })).toEqual({ accion: 'ya_corrida', estado: 'en_curso' })
    expect(docs).not.toHaveBeenCalled()
  })
  it('a la vez: de dos turnos simultáneos, uno pide y el otro contesta ya_corrida', async () => {
    const { P, almacen } = armar()
    const id = await crear(almacen, EDIC_A)
    const rs = await Promise.all([turno(P, { edicion_id: id, seco: false, workflow_execution_id: '1' }), turno(P, { edicion_id: id, seco: false, workflow_execution_id: '2' })])
    expect(rs.map((r) => r.accion).sort()).toEqual(['pedir', 'ya_corrida'])
  })
  it('la misma llave de edición crea una sola fila', async () => {
    const { almacen, tablas } = armar()
    await crear(almacen, EDIC_A); await crear(almacen, EDIC_A)
    expect(tablas.colaterales_ediciones).toHaveLength(1)
  })
})

describe('🔴 línea 3 de CC7 · toda salida temprana deja la edición en su estado FINAL (nunca colgada en en_curso)', () => {
  const casos: [string, Parameters<typeof armar>[0], string, string][] = [
    ['R2 sin la fila de la gran idea', { activas: new Set([...TODAS].filter((d) => d !== 'gran_idea')) }, 'sin_motor', 'sin_motor'],
    ['la guarda frena', { guarda: { frenan: [{ encargo_id: 'e1', brief_id: 'BRF-1', motivo: 'espera_al_dueno' }], se_asumen_publicadas: [] } }, 'sin_motor', 'sin_motor'],
    ['la guarda no puede leer (frena)', { guarda: new Error('statement timeout') }, 'sin_motor', 'sin_motor'],
    ['un documento no se puede leer', { docs: new Error('connection reset') }, 'sin_motor', 'sin_motor'],
    ['no hay nada para el agente', { docs: {} }, 'sin_colaterales', 'sin_colaterales'],
    ['tope diario del cliente', { gasto: TOPE_DIARIO_DEL_CLIENTE_USD - 0.1 }, 'fallida', 'fallida'],
  ]
  it.each(casos)('%s → %s', async (_n, o, accion, final) => {
    const { P, almacen, tablas } = armar(o)
    const id = await crear(almacen, EDIC_A)
    const r = await turno(P, { edicion_id: id, seco: false, workflow_execution_id: '1' })
    expect(r.accion).toBe(accion)
    expect(estado(tablas, id)).toBe(final)
    expect(tablas.colaterales_ediciones[0].nota).toBeTruthy()
  })
  it('la nota de la guarda nombra la pieza que frena', async () => {
    const { P, almacen, tablas } = armar({ guarda: { frenan: [{ encargo_id: 'e1', brief_id: 'BRF-7', motivo: 'aprobada_fecha_futura' }], se_asumen_publicadas: [] } })
    const id = await crear(almacen, EDIC_A)
    await turno(P, { edicion_id: id, seco: false, workflow_execution_id: '1' })
    expect(String(tablas.colaterales_ediciones[0].nota)).toContain('BRF-7 (aprobada_fecha_futura)')
  })
  it('la suposición de la guarda («se asume publicada») viaja en la nota del pedido', async () => {
    const { P, almacen } = armar({ guarda: { frenan: [], se_asumen_publicadas: [{ encargo_id: 'e2', brief_id: 'BRF-2', publicada_en: '2026-10-26' }] } })
    const id = await crear(almacen, EDIC_A)
    const r = await turno(P, { edicion_id: id, seco: false, workflow_execution_id: '1' })
    expect(r.accion === 'pedir' && r.nota).toContain('se asume publicada por fecha: BRF-2 (2026-10-26)')
  })
  it('un tope no se reintenta: el segundo turno contesta ya_corrida y no pide', async () => {
    const { P, almacen } = armar({ gasto: TOPE_DIARIO_DEL_CLIENTE_USD })
    const id = await crear(almacen, EDIC_A)
    expect((await turno(P, { edicion_id: id, seco: false, workflow_execution_id: '1' })).accion).toBe('fallida')
    expect((await turno(P, { edicion_id: id, seco: false, workflow_execution_id: '2' })).accion).toBe('ya_corrida')
  })
  it('el tope diario cuenta la reserva (tope × 1,3): justo por debajo pide, justo por encima no', async () => {
    const reserva = TOPE_DE_LA_LLAMADA_USD * FACTOR_DE_RESERVA
    const a = armar({ gasto: TOPE_DIARIO_DEL_CLIENTE_USD - reserva - 0.001 })
    expect((await turno(a.P, { edicion_id: await crear(a.almacen, EDIC_A), seco: false, workflow_execution_id: '1' })).accion).toBe('pedir')
    const b = armar({ gasto: TOPE_DIARIO_DEL_CLIENTE_USD - reserva + 0.001 })
    expect((await turno(b.P, { edicion_id: await crear(b.almacen, EDIC_A), seco: false, workflow_execution_id: '1' })).accion).toBe('fallida')
  })
  it('🔴 el tope diario es el DATO del cliente (RESPUESTA Lenovo 03:02Z): uno más bajo corta antes, uno más alto deja pasar; se lee para ese cliente', async () => {
    const reserva = TOPE_DE_LA_LLAMADA_USD * FACTOR_DE_RESERVA
    const bajo = armar({ gasto: 1, tope: 1.2 })
    expect(await turno(bajo.P, { edicion_id: await crear(bajo.almacen, EDIC_A), seco: false, workflow_execution_id: '1' })).toEqual({ accion: 'fallida', motivo: 'tope_diario' })
    expect(bajo.tope).toHaveBeenCalledWith(CLI_A)
    const alto = armar({ gasto: 9, tope: 9 + reserva + 0.01 })
    expect((await turno(alto.P, { edicion_id: await crear(alto.almacen, EDIC_A), seco: false, workflow_execution_id: '1' })).accion).toBe('pedir')
    const b = armar({ tope: 3 })
    await turno(b.P, { edicion_id: await crear(b.almacen, EDIC_B), seco: false, workflow_execution_id: '1' })
    expect(b.tope).toHaveBeenCalledWith(CLI_B)
  })
  it.each([['sin tope definido', null, 'no tiene tope diario'], ['tope cero', 0, 'no tiene tope diario'], ['tope que no es número', Number.NaN, 'no tiene tope diario'], ['no se puede leer', new Error('base caída'), 'no se pudo leer el tope diario']] as const)('🔴 %s → frena (sin_motor) sin gastar; en seco no escribe', async (_n, tope, nota) => {
    const a = armar({ tope: tope as number | null | Error })
    const id = await crear(a.almacen, EDIC_A)
    const r = await turno(a.P, { edicion_id: id, seco: false, workflow_execution_id: '1' })
    expect(r.accion).toBe('sin_motor')
    expect(r.accion === 'sin_motor' && r.nota).toContain(nota)
    expect(estado(a.tablas, id)).toBe('sin_motor')
    expect(a.gasto).not.toHaveBeenCalled()
    const b = armar({ tope: tope as number | null | Error })
    const idS = await crear(b.almacen, EDIC_A)
    expect((await turno(b.P, { edicion_id: idS, seco: true, workflow_execution_id: '1' })).accion).toBe('sin_motor')
    expect(estado(b.tablas, idS)).toBe('recibida')
  })
  it('🔴 el tope diario cuenta lo que está EN VUELO (línea de CC7): cada edición tomada sin recibo suma su reserva', async () => {
    const reserva = TOPE_DE_LA_LLAMADA_USD * FACTOR_DE_RESERVA
    const cabe = Math.floor((TOPE_DIARIO_DEL_CLIENTE_USD - reserva) / reserva) // cuántas en vuelo caben con esta
    const a = armar({ enVuelo: cabe })
    const idA = await crear(a.almacen, EDIC_A)
    expect((await turno(a.P, { edicion_id: idA, seco: false, workflow_execution_id: '1' })).accion).toBe('pedir')
    expect(a.gasto).toHaveBeenCalledWith(CLI_A, idA) // la edición que pregunta no se cuenta a sí misma
    const b = armar({ enVuelo: cabe + 1 })
    const idB = await crear(b.almacen, EDIC_A)
    expect(await turno(b.P, { edicion_id: idB, seco: false, workflow_execution_id: '1' })).toEqual({ accion: 'fallida', motivo: 'tope_diario' })
    expect(estado(b.tablas, idB)).toBe('fallida')
    // recibos + en vuelo se suman
    const c = armar({ gasto: reserva, enVuelo: cabe })
    expect((await turno(c.P, { edicion_id: await crear(c.almacen, EDIC_A), seco: false, workflow_execution_id: '1' })).accion).toBe('fallida')
  })
  it('🔴 la campaña del documento editado debe ser DEL CLIENTE (línea de CC6): la de otro, o una que no existe, frena sin leer nada', async () => {
    const { P, almacen, tablas, guarda, docs, propia } = armar({ propia: false })
    const id = await crear(almacen, EDIC_A)
    const r = await turno(P, { edicion_id: id, seco: false, workflow_execution_id: '1' })
    expect(r.accion).toBe('sin_motor')
    expect(r.accion === 'sin_motor' && r.nota).toContain(`la campaña ${CAMP_A} no existe o no es de este cliente`)
    expect(propia).toHaveBeenCalledWith(CLI_A, CAMP_A)
    expect(guarda).not.toHaveBeenCalled()
    expect(docs).not.toHaveBeenCalled()
    expect(estado(tablas, id)).toBe('sin_motor')
  })
  it('🔴 si no se puede comprobar de quién es la campaña, frena (sin_motor); en seco no escribe', async () => {
    const a = armar({ propia: new Error('base caída') })
    const id = await crear(a.almacen, EDIC_A)
    const r = await turno(a.P, { edicion_id: id, seco: false, workflow_execution_id: '1' })
    expect(r.accion === 'sin_motor' && r.nota).toContain('no se pudo comprobar de quién es la campaña')
    expect(estado(a.tablas, id)).toBe('sin_motor')
    const b = armar({ propia: false })
    const idS = await crear(b.almacen, EDIC_A)
    expect((await turno(b.P, { edicion_id: idS, seco: true, workflow_execution_id: '1' })).accion).toBe('sin_motor')
    expect(estado(b.tablas, idS)).toBe('recibida')
  })
  it('una edición del cliente (plan, manual) no se compara contra una campaña: su campaña es la viva del cliente', async () => {
    const { P, almacen, propia } = armar({ propia: false })
    await turno(P, { edicion_id: await crear(almacen, EDIC_B), seco: false, workflow_execution_id: '1' })
    expect(propia).not.toHaveBeenCalled()
  })
  it('una edición de un documento del que NO depende ninguna pieza no consulta la guarda (la pieza misma)', async () => {
    const { P, almacen, guarda } = armar({ docs: {} })
    const id = await crear(almacen, { ...EDIC_A, documento: 'pieza', llave: 'llave-pieza-0001' })
    await turno(P, { edicion_id: id, seco: false, workflow_execution_id: '1' })
    expect(guarda).not.toHaveBeenCalled()
  })
})

describe('R1 · lo que ya coincide lo guarda el código y nunca va al agente', () => {
  it('si la gran idea ya dice el «después», ese pedazo queda ya_coincide y no aparece en el pedido', async () => {
    const yaCambiada = A.gran_idea_v3.split(EDIC_A.antes).join(EDIC_A.despues)
    const { P, almacen, tablas } = armar({ docs: { gran_idea: { texto: yaCambiada, ref: CAMP_A, version: '3' } } })
    const id = await crear(almacen, EDIC_A)
    const r = await turno(P, { edicion_id: id, seco: false, workflow_execution_id: '1' })
    const ya = tablas.colaterales_retoques.filter((t) => t.estado === 'ya_coincide')
    expect(ya.length).toBeGreaterThan(0)
    expect(r.accion).toBe('pedir')
    if (r.accion === 'pedir') for (const t of ya) { expect(r.candidatos).not.toContain(t.pedazo_id); expect(r.pedido).not.toContain(`[${t.pedazo_id}] `) }
  })
})

describe('🔴 modo seco · calcula todo y NO escribe nada', () => {
  it.each([['pedir', {}, 'pedir', null], ['sin_motor', { activas: new Set<string>() }, 'sin_motor', 'no se revisaron colaterales'], ['sin_motor', { guarda: { frenan: [{ encargo_id: 'e', brief_id: null, motivo: 'sin_bandeja' as const }], se_asumen_publicadas: [] } }, 'sin_motor', 'pieza(s) por publicar'], ['fallida', { gasto: 99 }, 'fallida', null]])('%s · da lo MISMO que la corrida real y la base queda igual', async (_n, o, accion, nota) => {
    const { P, almacen, tablas } = armar(o as Parameters<typeof armar>[0])
    const id = await crear(almacen, EDIC_A)
    const antes = structuredClone(tablas)
    const r = await turno(P, { edicion_id: id, seco: true, workflow_execution_id: '1' })
    expect(r.accion).toBe(accion)
    if (nota) expect(r.accion === 'sin_motor' && r.nota).toContain(nota)
    if (r.accion === 'fallida') expect(r.motivo).toBe('tope_diario')
    expect(tablas).toEqual(antes)
  })
  it('en seco, una edición ya tomada contesta ya_corrida y no lee nada', async () => {
    const { P, almacen, docs } = armar()
    const id = await crear(almacen, EDIC_A)
    await turno(P, { edicion_id: id, seco: false, workflow_execution_id: '1' })
    docs.mockClear()
    expect(await turno(P, { edicion_id: id, seco: true, workflow_execution_id: '2' })).toEqual({ accion: 'ya_corrida', estado: 'en_curso' })
    expect(docs).not.toHaveBeenCalled()
  })
  it('en seco, lo que ya coincide tampoco se guarda', async () => {
    const yaCambiada = A.gran_idea_v3.split(EDIC_A.antes).join(EDIC_A.despues)
    const { P, almacen, tablas } = armar({ docs: { gran_idea: { texto: yaCambiada, ref: CAMP_A, version: '3' } } })
    await turno(P, { edicion_id: await crear(almacen, EDIC_A), seco: true, workflow_execution_id: '1' })
    expect(tablas.colaterales_retoques).toEqual([])
  })
})

describe('entregar · gravedad primero, el mismo sello, la salida entera', () => {
  async function pedida(o: Parameters<typeof armar>[0] = {}) {
    const k = armar(o)
    const id = await crear(k.almacen, EDIC_A)
    const r = await turno(k.P, { edicion_id: id, seco: false, workflow_execution_id: '1' })
    if (r.accion !== 'pedir') throw new Error('no pidió')
    return { ...k, id, r }
  }
  it('buena: los retoques verificados quedan propuesto, lo demás descartado con su razón; la edición sigue en_curso (la juzga la jefatura)', async () => {
    const { P, tablas, id, r } = await pedida()
    const e = await entregar(P, { edicion_id: id, sello: r.sello, salida: salidaBuenaA(r.candidatos) })
    expect(e.accion).toBe('propuestos')
    const prop = tablas.colaterales_retoques.filter((t) => t.estado === 'propuesto')
    expect(prop.length).toBeGreaterThan(0)
    for (const t of prop) { expect(t.antes).toBe(EDIC_A.antes); expect(t.despues).toBe(EDIC_A.despues); expect(t.version_base).toBe('3'); expect(t.documento_ref).toBe(CAMP_A) }
    const desc = tablas.colaterales_retoques.filter((t) => t.estado === 'descartado')
    expect(desc.length).toBe(r.candidatos.length - prop.length)
    expect(desc.length).toBeGreaterThan(0)
    expect(desc.every((t) => String(t.razon).trim() && t.afecta === false)).toBe(true)
    expect(estado(tablas, id)).toBe('en_curso')
  })
  it.each([
    ['de fondo según el agente', { de_fondo: true, razon: `cambia «${EDIC_A.antes}» por «${EDIC_A.despues}»` }],
    ['sin veredicto', null],
    ['razón que no cita el antes y el después', { de_fondo: false, razon: 'es menor' }],
  ])('🔴 %s → de_fondo, sin guardar ningún retoque', async (_n, gravedad) => {
    const { P, tablas, id, r } = await pedida()
    const e = await entregar(P, { edicion_id: id, sello: r.sello, salida: salidaBuenaA(r.candidatos, { gravedad }) })
    expect(e.accion).toBe('de_fondo')
    expect(estado(tablas, id)).toBe('de_fondo')
    expect(tablas.colaterales_retoques).toEqual([])
  })
  it.each([['texto suelto', 'no es json'], ['sin revisados', { colaterales: [] }], ['colaterales no es lista', { revisados: [], colaterales: 'x' }]])('salida ilegible (%s) → fallida, no se le vuelve a pedir', async (_n, salida) => {
    const { P, tablas, id, r } = await pedida()
    expect((await entregar(P, { edicion_id: id, sello: r.sello, salida })).accion).toBe('fallida')
    expect(estado(tablas, id)).toBe('fallida')
  })
  it('un documento que cambió entre el pedido y la entrega (otro sello) → fallida, nada se guarda', async () => {
    const { P, tablas, id, r, docs } = await pedida()
    docs.mockResolvedValue({ gran_idea: { ...DOCS_A.gran_idea!, version: '4' } })
    expect((await entregar(P, { edicion_id: id, sello: r.sello, salida: salidaBuenaA(r.candidatos) })).accion).toBe('fallida')
    expect(tablas.colaterales_retoques).toEqual([])
  })
  it('salida incompleta (falta un id) → fallida', async () => {
    const { P, id, r } = await pedida()
    const s = salidaBuenaA(r.candidatos)
    s.revisados = s.revisados.slice(1)
    expect((await entregar(P, { edicion_id: id, sello: r.sello, salida: s })).accion).toBe('fallida')
  })
  it('nada afecta → sin_colaterales (con todos descartados y su razón)', async () => {
    const { P, tablas, id, r } = await pedida()
    const s = salidaBuenaA(r.candidatos)
    s.revisados = s.revisados.map((x) => ({ ...x, afecta: false, razon: 'no aplica' })); s.colaterales = []
    expect((await entregar(P, { edicion_id: id, sello: r.sello, salida: s })).accion).toBe('sin_colaterales')
    expect(estado(tablas, id)).toBe('sin_colaterales')
  })
  it('entregar dos veces: la segunda contesta ya_cerrada o no duplica', async () => {
    const { P, tablas, id, r } = await pedida()
    const s = salidaBuenaA(r.candidatos, { gravedad: null })
    await entregar(P, { edicion_id: id, sello: r.sello, salida: s })
    expect((await entregar(P, { edicion_id: id, sello: r.sello, salida: s })).accion).toBe('ya_cerrada')
    expect(tablas.colaterales_retoques).toEqual([])
  })
  it('una edición que no está en_curso no acepta entregas', async () => {
    const { P, almacen } = armar()
    const id = await crear(almacen, EDIC_A)
    expect(await entregar(P, { edicion_id: id, sello: 'x', salida: {} })).toEqual({ accion: 'ya_cerrada', estado: 'recibida' })
  })
})

describe('barrido · lo colgado más de 2 h pasa a fallida; nada se aplica', () => {
  it('cierra solo las en_curso viejas; las recientes y las recibidas no se tocan', async () => {
    const ahora = new Date('2026-11-11T12:00:00Z')
    const viejo = new Date(ahora.getTime() - PLAZO_DEL_BARRIDO_MS - 1000).toISOString()
    const reciente = new Date(ahora.getTime() - 60_000).toISOString()
    const fila = (id: string, est: string, upd: string) => ({ id, client_id: CLI_A, documento: 'brief', documento_ref: CAMP_A, version_base: '1', seccion: 's', antes: 'a', despues: 'b', llave: `llave-${id}-000`, estado: est, updated_at: upd })
    const { db, tablas } = baseFalsa({ inicial: { colaterales_ediciones: [fila('v', 'en_curso', viejo), fila('r', 'en_curso', reciente), fila('x', 'recibida', viejo), fila('l', 'lista', viejo)] } })
    const al = almacenDeColaterales(db)
    const pasar = vi.spyOn(al, 'pasarEdicion')
    const r = await barrer({ almacen: al }, ahora)
    expect(r.cerradas).toEqual(['v'])
    // la lectura ya trae SOLO las en_curso viejas: no se intenta cerrar ninguna otra
    expect(pasar.mock.calls.map((c) => c[0])).toEqual(['v'])
    expect(tablas.colaterales_ediciones.map((f) => [f.id, f.estado])).toEqual([['v', 'fallida'], ['r', 'en_curso'], ['x', 'recibida'], ['l', 'lista']])
  })
})

describe('barrido · lo que esperaba juicio de una edición cerrada va a una persona (pendiente), nunca se aplica solo', () => {
  it('propuesto y aprobado → pendiente con motivo; descartado, ya_coincide, aplicado y los de otra edición no se tocan', async () => {
    const ahora = new Date('2026-11-11T12:00:00Z')
    const viejo = new Date(ahora.getTime() - PLAZO_DEL_BARRIDO_MS - 1000).toISOString()
    const fila = (id: string, upd: string) => ({ id, client_id: CLI_A, documento: 'brief', documento_ref: CAMP_A, version_base: '1', seccion: 's', antes: 'a', despues: 'b', llave: `llave-${id}-000`, estado: 'en_curso', updated_at: upd })
    const ret = (id: string, edicion_id: string, estado: string) => ({ id, edicion_id, documento: 'estrategia', documento_ref: CAMP_A, version_base: '1', pedazo_id: `p-${id}`, estado, rehechos: 0 })
    const { db, tablas } = baseFalsa({ inicial: {
      colaterales_ediciones: [fila('v', viejo), fila('r', ahora.toISOString())],
      colaterales_retoques: [ret('1', 'v', 'propuesto'), ret('2', 'v', 'aprobado'), ret('3', 'v', 'descartado'), ret('4', 'v', 'ya_coincide'), ret('5', 'v', 'aplicado'), ret('6', 'r', 'propuesto')],
    } })
    expect((await barrer({ almacen: almacenDeColaterales(db) }, ahora)).cerradas).toEqual(['v'])
    expect(tablas.colaterales_retoques.map((f) => [f.id, f.estado])).toEqual([['1', 'pendiente'], ['2', 'pendiente'], ['3', 'descartado'], ['4', 'ya_coincide'], ['5', 'aplicado'], ['6', 'propuesto']])
    expect(tablas.colaterales_retoques.filter((f) => f.estado === 'pendiente').every((f) => typeof f.motivo === 'string' && (f.motivo as string).length > 0)).toBe(true)
  })
  it('si otra corrida ya cerró la edición, el barrido no toca sus retoques', async () => {
    const { db, tablas } = baseFalsa({ inicial: { colaterales_retoques: [{ id: '1', edicion_id: 'v', documento: 'estrategia', documento_ref: CAMP_A, version_base: '1', pedazo_id: 'p', estado: 'propuesto', rehechos: 0 }] } })
    const al = almacenDeColaterales(db)
    vi.spyOn(al, 'edicionesEnCursoAntesDe').mockResolvedValue(['v'])
    vi.spyOn(al, 'pasarEdicion').mockResolvedValue(false)
    expect((await barrer({ almacen: al }, new Date('2026-11-11T12:00:00Z'))).cerradas).toEqual([])
    expect(tablas.colaterales_retoques[0].estado).toBe('propuesto')
  })
})

describe('el turno no lee el manual ni sus marcas (regla de CC1 · validacionDelManual es la única vía)', () => {
  it('turno.ts no nombra human_validated, gate_outcome ni client_brand_books', () => {
    const t = fs.readFileSync(path.join(process.cwd(), 'src/lib/colaterales/turno.ts'), 'utf8').split('\n').filter((l) => !l.trim().startsWith('*')).join('\n')
    for (const x of ['human_validated', 'gate_outcome', 'client_brand_books']) expect(t).not.toContain(x)
  })
})
