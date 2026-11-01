/**
 * T4 (31-oct) · la decisión HUMANA desde el tablero: `concepto/decidir` acepta `workflow_id = 'tablero'` (con un execution id propio que deja rastro);
 * abrir o entregar con 'tablero' sigue siendo 403 (eso invoca agentes y va por flujo). US$ 0, sin modelo.
 */
import { describe, expect, it } from 'vitest'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../__fixtures__/clientes'
import type { Campana, EstrategiaGuardada } from '../almacen'
import { WORKFLOW_DEL_TABLERO } from '../autorizar'
import { briefAbrir, conceptoAbrir, conceptoDecidir, conceptoEntregar, recibirBrief, recibirConcepto } from '../mesas'

const A = clienteA()
const CAMP = 'camp-t4'
const AHORA = '2026-10-09T12:00:00Z'
const wf = (extra: Record<string, unknown> = {}) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', campana_id: CAMP, ...extra })
const tablero = (extra: Record<string, unknown> = {}) => ({ workflow_id: WORKFLOW_DEL_TABLERO, workflow_execution_id: 'tablero:hitl-1:2026-10-09T12:00:00Z', campana_id: CAMP, ...extra })

function almacen() {
  const al = new AlmacenMemoria({
    contextos: { [A.clientId]: contextoDe(A) },
    planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
    config: { flujos: ['wf-cadena'], puerta_workflow_id: 'wf-puerta', estado_cadena: 'ensayo', clientes_ensayo: [A.clientId], nuevo_orden: { clientes: [A.clientId] } },
    journeys: [{ journeyId: 'journey-1', clientId: A.clientId }],
  })
  const campana: Campana = {
    id: CAMP, client_id: A.clientId, plan_id: 'plan-1', fecha_inicio: A.campana.fecha_inicio, fecha_inicio_origen: 'regla', fecha_fin: A.campana.fecha_fin, zona_horaria: 'America/Guayaquil', pais: 'EC', sedes: ['centro'],
    estado: 'calendario', estado_motivo: null, presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna', autoproducir: false, sala_ref: {}, reemplaza_a: null, seco: true,
  }
  const estrategia: EstrategiaGuardada = { campana_id: CAMP, version: 1, estado: 'validada', contenido: A.estrategia, agente: 'social-media-strategist', modelo: null, costo_usd: 0, workflow_execution_id: 'ex-0', seco: true }
  al.campanas.push(campana)
  al.estrategias.push(estrategia)
  return al
}
const BRIEF = [
  '## De qué parte del plan sale', 'Fase 1: «Se publican 3 posts por semana en Instagram y 1 en Facebook».',
  '## Insight', 'La gente del barrio desayuna de pie.', '## Mensaje', 'Hay mesa desde las siete.',
  '## Objetivo', 'Que entren 30 desayunos nuevos por semana.', '- instagram: que miren el pan · «ven a desayunar»', '- facebook: que guarden el horario · «guarda el horario»',
  '## Tono', 'Cercano.', '## Obligatorios', '- vocabulario: pan de masa madre', '- prohibido: barato; gratis', '- lo que no se dice: precios',
  '## Faltantes', '- público: el manual no dice edades', '## Contradicciones plan vs manual', '- ninguna',
].join('\n')
const CONCEPTO = [
  '## Gran idea  La mesa larga · Noventa días para sentarse juntos', '## Por qué funciona  El insight dice que la gente desayuna de pie.',
  '## Cómo se ve  Luz cálida.', '## Cómo suena  Voz cercana.',
  '## Capítulo f1 · Abrir la mesa', 'Qué cuenta: la mesa se abre · Objetivo de la fase (cita): «presentar» · Cómo se ve en este capítulo: planos cerrados',
  '## Banco de ideas',
  '- C1-I01 · instagram · carrusel · la primera silla · mensaje: aquí siempre hay una silla para ti · gancho: ¿quién se sentaba aquí? · protagonista: la silla · serie: ninguna · foto:ninguna',
  '- C1-I02 · facebook · foto · la silla que nadie usa · mensaje: ninguna silla sobra · gancho: esta silla lleva un mes vacía · protagonista: la silla · serie: ninguna · foto:ninguna',
  '## Caminos descartados y por qué', '- «El plato del día»: habla del producto',
].join('\n')
const entrega = (version: number, texto: string) => ({ campana_id: CAMP, version, encargo_id: `enc-${version}`, texto, costo_usd: 0.1, motivo: null })

async function conTarjeta() {
  const al = almacen()
  expect((await briefAbrir(al, wf(), AHORA)).status).toBe(200)
  expect(await recibirBrief(al, entrega(1, BRIEF), AHORA)).toMatchObject({ ok: true, estado: 'validada' })
  expect((await conceptoAbrir(al, wf(), AHORA)).status).toBe(200)
  expect(await recibirConcepto(al, entrega(1, CONCEPTO), AHORA)).toMatchObject({ ok: true, estado: 'lista' })
  return al
}

describe('T4 · el tablero decide la gran idea con workflow_id «tablero»', () => {
  it('🔴 aprobar desde el tablero: 200, la tarjeta queda approved y el libro de Emilio registra el autor', async () => {
    const al = await conTarjeta()
    const r = await conceptoDecidir(al, tablero({ decision: 'aprobar', autor: 'emilio@correo', nota: 'me gusta' }), AHORA)
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200)
    expect(r.cuerpo).toMatchObject({ decision: 'aprobar', version: 1 })
    expect(al.conceptos[0]).toMatchObject({ aprobacion: 'aprobado', nota_de_emilio: 'me gusta' })
    expect(al.tarjetas[0]).toMatchObject({ status: 'approved' })
    expect(al.eventosDeEmilio[0]).toMatchObject({ accion: 'aprobar', autor: 'emilio@correo', hitl_id: 'hitl-1' })
  })
  it('🔴 pedir cambios desde el tablero (apunta al concepto): 200, la versión 1 queda «cambios» con la nota y la respuesta trae el sobre con el que la puerta abre la vuelta siguiente', async () => {
    const al = await conTarjeta()
    const r = await conceptoDecidir(al, tablero({ decision: 'cambios', apunta_a: 'concepto', nota: 'más barrio, menos producto' }), AHORA)
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200)
    expect(r.cuerpo).toMatchObject({ decision: 'cambios', version: 1, apunta_a: 'concepto', vueltas_restantes: 1 })
    expect(al.conceptos.map((c) => [c.version, c.estado, c.aprobacion, c.apunta_a, c.nota_de_emilio])).toEqual([[1, 'lista', 'cambios', 'concepto', 'más barrio, menos producto']])
    expect(al.tarjetas[0]).toMatchObject({ status: 'rejected', decision: { accion: 'pedir_cambios', apunta_a: 'concepto' } })
    expect(al.eventosDeEmilio[0]).toMatchObject({ accion: 'pedir_cambios', comentario: 'más barrio, menos producto' })
  })
  it('🔴 sin execution id el tablero también es 400; con uno que no es «tablero» ni flujo ni viaje, 403 (la regla de siempre)', async () => {
    const al = await conTarjeta()
    expect((await conceptoDecidir(al, { campana_id: CAMP, workflow_id: WORKFLOW_DEL_TABLERO, decision: 'aprobar' }, AHORA)).status).toBe(400)
    expect((await conceptoDecidir(al, tablero({ workflow_id: 'otro-tablero', decision: 'aprobar' }), AHORA)).status).toBe(403)
  })
  it('🔴 abrir o entregar con «tablero» es 403: el tablero no invoca mesas (eso va por flujo)', async () => {
    const al = almacen()
    const b = await briefAbrir(al, tablero(), AHORA)
    expect(b.status).toBe(403)
    expect(String(b.cuerpo.detalle)).toMatch(/solo puede DECIDIR/)
    expect((await conceptoAbrir(al, tablero(), AHORA)).status).toBe(403)
    const al2 = await conTarjeta()
    expect((await conceptoEntregar(al2, tablero({ version: 1, encargo_id: 'enc-1', texto: CONCEPTO, costo_usd: 0 }), AHORA)).status).toBe(403)
  })
  it('decidir dos veces: aprobar lo aprobado dice ya_decidido; cambios sobre una versión mandada a cambios es 409 (reserva 3 de CC3)', async () => {
    const al = await conTarjeta()
    expect((await conceptoDecidir(al, tablero({ decision: 'aprobar' }), AHORA)).status).toBe(200)
    expect((await conceptoDecidir(al, tablero({ decision: 'aprobar' }), AHORA)).cuerpo).toMatchObject({ ya_decidido: true })
    expect((await conceptoDecidir(al, tablero({ decision: 'cambios', apunta_a: 'brief', nota: 'otro' }), AHORA)).status).toBe(200)
    expect((await conceptoDecidir(al, tablero({ version: 1, decision: 'cambios', apunta_a: 'brief', nota: 'otro' }), AHORA)).cuerpo.code).toBe('E-YA-DECIDIDO')
  })
})
