/**
 * 09-nov · GO Lenovo F+E (firma de Emilio 17:05Z, regla de sistema para cualquier cliente) · CC#2 · US$ 0, sin modelo, sin red.
 *   F · si la campaña arranca tarde, empieza con su cronología COMPLETA: el día N del plan es el día N de la campaña (todo en bloque). Los feriados reales no se corren.
 *   E · `accion 'reabrir'`: misma campaña, día 1 = el día en que se reabre, origen `emilio`, la duración del plan, cierra TODAS las esperas vivas, deja un sobre nuevo
 *       en la sala; idempotente y con vuelta atrás.
 * El caso real: Náufrago, plan 4996c6c2 (06-nov → 28-ene-2027, 84 días) · campaña 28de888e en `necesita_humano` con las esperas 76 y 77 vivas.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { validarEstrategia, type Hallazgo } from '../index'
import { diaUnoDelPlan } from '../fechas-en-texto'
import { lineaDelDiaUno } from '../indicaciones'
import { abrirCampana, avanzarCampana, hoyEnZona, reabrirCampana } from '../campanas'
import { estrategiaPreparar } from '../pasos'
import { diaDeFila } from '../expandir-patron'
import { fechaDeFila } from '../fechas'
import { ponerNecesitaHumano } from '../nucleo'
import { ACCIONES } from '../acciones'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe, formatosDeLaMigracion } from '../__fixtures__/clientes'

beforeEach(() => { process.env.INTERNAL_API_KEY = 'k-interna' })
const FORMATOS = formatosDeLaMigracion()
const A = clienteA()
const CITA_1 = 'Revisión 1: semana del 20 de noviembre de 2026 (7-10 días de datos de pauta real)'
const CITA_2 = 'Revisión 2: semana del 11 de diciembre de 2026'
const CITA_3 = 'Revisión 3: semana del 8 de enero de 2027'
const PLAN = `# Plan de campaña · 90 días · Náufrago · Versión 3\n**6 de noviembre de 2026 – 28 de enero de 2027**\n\n---\n${A.planTexto}\n- ${CITA_1}\n- ${CITA_2}\n- ${CITA_3}\n`
const HITOS_DEL_PLAN = [{ dia: 15, cita: CITA_1 }, { dia: 36, cita: CITA_2 }, { dia: 64, cita: CITA_3 }]
const conHitos = (hitos: Array<{ dia: number; cita: string }>) => ({ ...A.estrategia, hitos: hitos.map((h, i) => ({ clave: `revision_${i + 1}`, dia: h.dia, tipo: 'revision' as const, cita_plan: h.cita })) })
const s04 = (hs: Hallazgo[]) => hs.filter((h) => h.chequeo === 'S04' && h.severidad === 'bloquea')
const validar = (hitos: Array<{ dia: number; cita: string }>, fechaInicio: string, planTexto = PLAN) => validarEstrategia(conHitos(hitos), { planTexto, formatos: FORMATOS, diasCampana: 84, fechaInicio })
const wf = (x: Record<string, unknown> = {}) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', ...x })
const almacen = (o: { intakeApagado?: boolean } = {}) => new AlmacenMemoria({
  contextos: { [A.clientId]: { ...contextoDe(A), planTexto: PLAN, zonaHoraria: 'America/Guayaquil' } }, planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-11-06' }] },
  config: { flujos: ['wf-cadena'], estado_cadena: 'encendida' }, journeys: [{ journeyId: 'journey-1', clientId: A.clientId }, { journeyId: 'journey-2', clientId: A.clientId }], ...o,
})

describe('F · las fechas del plan se cuentan desde el día 1 DEL PLAN', () => {
  it('el día 1 del plan es el primer día de la ventana de su cabecera; sin ventana, null', () => {
    expect(diaUnoDelPlan(PLAN)).toBe('2026-11-06')
    expect(diaUnoDelPlan(A.planTexto)).toBeNull()
  })
  it('🔴 una campaña NORMAL (día 1 = el del plan) da el mismo resultado que hoy: con o sin ventana en el plan, los mismos bloqueos', () => {
    const sinVentana = `${A.planTexto}\n- ${CITA_1}\n- ${CITA_2}\n- ${CITA_3}\n`
    for (const hitos of [HITOS_DEL_PLAN, [{ dia: 30, cita: CITA_1 }], [{ dia: 1, cita: CITA_2 }, { dia: 64, cita: CITA_3 }]]) {
      expect(s04(validar(hitos, '2026-11-06')).map((h) => h.ficha.que)).toEqual(s04(validar(hitos, '2026-11-06', sinVentana)).map((h) => h.ficha.que))
    }
    expect(s04(validar(HITOS_DEL_PLAN, '2026-11-06'))).toEqual([])
    // la tarea: sin diferencia entre el día 1 del plan y el de la campaña, la línea queda BYTE A BYTE como antes
    expect(lineaDelDiaUno('2026-11-06', '2027-01-28', 84, '2026-11-06')).toBe(lineaDelDiaUno('2026-11-06', '2027-01-28', 84))
  })
  it('🔴 una campaña que arranca 14 días TARDE se corre en bloque: los días del plan (15 · 36 · 64) pasan; los «días de calendario» desde el día 1 nuevo bloquean', () => {
    expect(s04(validar(HITOS_DEL_PLAN, '2026-11-20'))).toEqual([])
    // contados desde el 20-nov (lo que hacía B antes): el 20-nov sería el día 1 y la revisión 3 el día 50 → ahora eso es una cronología cortada y bloquea
    const cortada = s04(validar([{ dia: 1, cita: CITA_1 }, { dia: 22, cita: CITA_2 }, { dia: 50, cita: CITA_3 }], '2026-11-20'))
    expect(cortada).toHaveLength(3)
    expect(cortada.map((h) => h.ficha.propuesta)).toEqual(['usar el día 15', 'usar el día 36', 'usar el día 64'])
    expect(cortada[0].ficha.contra_que).toBe('días del plan desde su día 1 (2026-11-06)')
    // y en el calendario de la campaña: el día 15 cae 14 días después que en el plan (todo corrido, nada perdido)
    expect(fechaDeFila('2026-11-20', 3, 1)).toBe('2026-11-30')
  })
  it('🔴 la tarea de estrategia de una campaña tardía dice desde cuándo cuenta el plan y que los feriados reales no se corren', () => {
    const l = lineaDelDiaUno('2026-11-20', '2027-02-11', 84, '2026-11-06')
    expect(l).toMatch(/^El día 1 de la campaña es el viernes 2026-11-20; la campaña dura 84 días y termina el jueves 2027-02-11 \(día 84\)\./)
    expect(l).toMatch(/El plan cuenta sus fechas desde SU día 1, el viernes 2026-11-06/)
    expect(l).toMatch(/el día N del plan es el día N de la campaña/)
    expect(l).toMatch(/Las fechas especiales reales \(feriados, Navidad, fechas comerciales\) no se corren: quedan en su fecha de calendario\./)
  })
  it('🔴 un feriado queda FIJO en su fecha: en la campaña tardía, Navidad sigue el 25-dic (otro día de campaña), no se corre con el plan', () => {
    expect(diaDeFila({ fecha_inicio: '2026-11-06', fecha_fin: '2027-01-28' }, { fecha: '2026-12-25' })).toBe(50)
    expect(diaDeFila({ fecha_inicio: '2026-11-20', fecha_fin: '2027-02-11' }, { fecha: '2026-12-25' })).toBe(36)
  })
  it('🔴 por el camino real: estrategiaPreparar de una campaña reabierta tarde le pasa al agente el día 1 del plan', async () => {
    const { al, id } = await campanaDetenida()
    await reabrirCampana(al, { ...wf(), campana_id: id, fecha_inicio: '2026-11-20' }, '2026-11-20T15:00:00Z')
    const p = await estrategiaPreparar(al, { ...wf({ workflow_id: 'wf-cadena' }), campana_id: id }, '2026-11-20T15:01:00Z')
    expect(p.status).toBe(200)
    const tarea = String((p.cuerpo as { run_sdk: { task?: string; prompt?: string } }).run_sdk.task ?? JSON.stringify(p.cuerpo.run_sdk))
    expect(tarea).toContain('El plan cuenta sus fechas desde SU día 1, el viernes 2026-11-06')
    expect(tarea).toContain('El día 1 de la campaña es el viernes 2026-11-20')
  })
})

/** una campaña como la 28de888e: abierta, detenida, con su espera de fecha propuesta y la de necesita_humano vivas */
async function campanaDetenida(o: { intakeApagado?: boolean } = {}) {
  const al = almacen(o)
  // como la 28de888e: abierta por la REGLA (90 días, sin la ventana del plan), así que deja su espera de fecha propuesta
  const r = await abrirCampana(al, { ...wf(), client_id: A.clientId, plan_id: 'plan-1', seco: false, dias_de_campana: 90, sala_ref: { _journey_id: 'journey-1' } }, '2026-11-06T11:21:00Z')
  const c = (r.cuerpo as { campana: import('../almacen').Campana }).campana
  expect(c).toMatchObject({ fecha_inicio_origen: 'regla', fecha_inicio: '2026-11-09', fecha_fin: '2027-02-06' })
  await ponerNecesitaHumano(al, c, 'la estrategia sigue con 3 bloqueo(s) tras la única corrección', '2026-11-06T11:23:08Z')
  return { al, id: c.id }
}
const vivasDe = async (al: AlmacenMemoria, id: string) => (await al.esperasVivas()).filter((e) => e.campana_id === id)

describe('E · reabrir la campaña en el mismo lugar', () => {
  it('🔴 desde necesita_humano: día 1 = hoy en la zona del cliente, origen emilio, la duración del plan, cierra TODAS las esperas vivas y deja un sobre en la sala', async () => {
    const { al, id } = await campanaDetenida()
    expect((await vivasDe(al, id)).map((e) => e.objeto_tipo).sort()).toEqual(['fecha_inicio_propuesta', 'necesita_humano'])
    // 03:00Z del 10-nov es todavía el 09-nov en Guayaquil (UTC−5)
    const r = await reabrirCampana(al, { ...wf(), campana_id: id }, '2026-11-10T03:00:00Z')
    expect(r.status).toBe(200)
    const c = al.campanas.find((x) => x.id === id)!
    expect(c).toMatchObject({ estado: 'abierta', fecha_inicio: '2026-11-09', fecha_fin: '2027-01-31', fecha_inicio_origen: 'emilio', plan_id: 'plan-1' })
    expect(c.estado_motivo).toMatch(/^reabierta por Emilio: día 1 2026-11-09, 84 días \(hasta 2027-01-31\); antes necesita_humano/)
    expect(await vivasDe(al, id)).toEqual([])
    expect(al.esperas.filter((e) => e.campana_id === id).map((e) => e.estado)).toEqual(['cancelada', 'cancelada'])
    expect((r.cuerpo as { esperas_cerradas: number[] }).esperas_cerradas).toHaveLength(2)
    expect(al.sobresEmitidos).toHaveLength(1)
    expect(al.sobresEmitidos[0]).toMatchObject({ source: 'planeacion/plan-listo', intent: 'briefear', idempotency_key: `${id}:reabrir:2026-11-09`, payload: { client_id: A.clientId, plan_id: 'plan-1', dry_run: false, campana_id: id } })
    expect((r.cuerpo as { sobre: { resultado: string } }).sobre.resultado).toBe('aceptado')
    expect(al.campanas).toHaveLength(1) // la misma fila, no una campaña nueva
  })
  it('🔴 desde pausada también; la fecha de inicio pedida manda', async () => {
    const { al, id } = await campanaDetenida()
    await avanzarCampana(al, { ...wf(), campana_id: id, a: 'pausada' }, '2026-11-13T12:00:00Z')
    expect(al.campanas.find((x) => x.id === id)!.estado).toBe('pausada')
    const r = await reabrirCampana(al, { ...wf(), campana_id: id, fecha_inicio: '2026-11-20' }, '2026-11-14T12:00:00Z')
    expect(r.status).toBe(200)
    expect(al.campanas.find((x) => x.id === id)).toMatchObject({ estado: 'abierta', fecha_inicio: '2026-11-20', fecha_fin: '2027-02-11', fecha_inicio_origen: 'emilio' })
    expect(await vivasDe(al, id)).toEqual([]) // la espera de la pausa también se cierra
  })
  it('🔴 idempotente: el mismo pedido otra vez contesta ya_reabierta y no escribe ni deja otro sobre', async () => {
    const { al, id } = await campanaDetenida()
    await reabrirCampana(al, { ...wf(), campana_id: id }, '2026-11-09T15:00:00Z')
    const antes = JSON.stringify(al.campanas)
    const r = await reabrirCampana(al, { ...wf(), campana_id: id }, '2026-11-09T16:00:00Z')
    expect(r.cuerpo).toMatchObject({ ya_reabierta: true })
    expect(JSON.stringify(al.campanas)).toBe(antes)
    expect(al.sobresEmitidos).toHaveLength(1)
  })
  it('🔴 vuelve atrás si la sala no acepta el sobre: la campaña y las esperas quedan como estaban', async () => {
    const { al, id } = await campanaDetenida({ intakeApagado: true })
    const antes = structuredClone(al.campanas.find((x) => x.id === id)!)
    const vivasAntes = (await vivasDe(al, id)).map((e) => e.id).sort()
    const r = await reabrirCampana(al, { ...wf(), campana_id: id }, '2026-11-09T15:00:00Z')
    expect(r.status).toBe(502)
    const c = al.campanas.find((x) => x.id === id)!
    expect({ estado: c.estado, estado_motivo: c.estado_motivo, fecha_inicio: c.fecha_inicio, fecha_fin: c.fecha_fin, fecha_inicio_origen: c.fecha_inicio_origen })
      .toEqual({ estado: antes.estado, estado_motivo: antes.estado_motivo, fecha_inicio: antes.fecha_inicio, fecha_fin: antes.fecha_fin, fecha_inicio_origen: antes.fecha_inicio_origen })
    expect((await vivasDe(al, id)).map((e) => e.id).sort()).toEqual(vivasAntes)
  })
  it('🔴 vuelve atrás también si la escritura del sobre revienta', async () => {
    const { al, id } = await campanaDetenida()
    al.emitirSobre = async () => { throw new Error('la sala no contesta') }
    await expect(reabrirCampana(al, { ...wf(), campana_id: id }, '2026-11-09T15:00:00Z')).rejects.toThrow(/no contesta/)
    expect(al.campanas.find((x) => x.id === id)!.estado).toBe('necesita_humano')
    expect(await vivasDe(al, id)).toHaveLength(2)
  })
  it('🔴 solo desde necesita_humano o pausada: una campaña que arma, activa o cerrada no se reabre y no se escribe nada', async () => {
    for (const estado of ['abierta', 'activa', 'cerrada'] as const) {
      const { al, id } = await campanaDetenida()
      al.campanas.find((x) => x.id === id)!.estado = estado
      const r = await reabrirCampana(al, { ...wf(), campana_id: id, fecha_inicio: '2026-11-20' }, '2026-11-09T15:00:00Z')
      expect(r.status).toBe(409)
      expect(al.sobresEmitidos).toHaveLength(0)
      expect(al.campanas.find((x) => x.id === id)!.fecha_inicio_origen).not.toBe('emilio')
    }
  })
  it('🔴 riesgo 2: una campaña archivada no se reabre, aunque esté detenida', async () => {
    const { al, id } = await campanaDetenida()
    ;(al.campanas.find((x) => x.id === id) as unknown as { archivada_en: string }).archivada_en = '2026-11-08T00:00:00Z'
    const r = await reabrirCampana(al, { ...wf(), campana_id: id }, '2026-11-09T15:00:00Z')
    expect(r).toMatchObject({ status: 409, cuerpo: { code: 'E-ARCHIVADA' } })
    expect(al.sobresEmitidos).toHaveLength(0)
    expect(await vivasDe(al, id)).toHaveLength(2)
  })
  it('🔴 riesgo 4: una campaña que ya armó algo (estrategia validada, filas, brief o gran idea) no se reabre: nada se duplica, se borra ni se vuelve a publicar', async () => {
    const casos: Array<[string, (al: AlmacenMemoria, id: string) => Promise<void>]> = [
      ['estrategia', async (al, id) => al.insertarEstrategia({ campana_id: id, version: 1, estado: 'validada', contenido: A.estrategia, agente: 'x', modelo: 'x', costo_usd: 0, workflow_execution_id: 'e', seco: false } as never)],
      ['filas', async (al, id) => { al.filasGuardadas.push({ id: 'f1', campana_id: id, calendario_version: 1 } as never) }],
      ['brief', async (al, id) => { al.briefsCreativos.push({ campana_id: id, version: 1 } as never) }],
      ['gran idea', async (al, id) => { al.conceptos.push({ campana_id: id, version: 1 } as never) }],
    ]
    for (const [nombre, sembrar] of casos) {
      const { al, id } = await campanaDetenida()
      await sembrar(al, id)
      const antes = JSON.stringify({ c: al.campanas, e: al.esperas })
      const r = await reabrirCampana(al, { ...wf(), campana_id: id }, '2026-11-09T15:00:00Z')
      expect(r, nombre).toMatchObject({ status: 409, cuerpo: { code: 'E-YA-ARMADA' } })
      expect(JSON.stringify({ c: al.campanas, e: al.esperas }), nombre).toBe(antes)
      expect(al.sobresEmitidos, nombre).toHaveLength(0)
    }
  })
  it('🔴 riesgo 1: dos reaperturas a la vez (doble clic, reintento) dejan UNA campaña y UN viaje en la sala', async () => {
    const { al, id } = await campanaDetenida()
    const [a, b] = await Promise.all([
      reabrirCampana(al, { ...wf(), campana_id: id }, '2026-11-09T15:00:00Z'),
      reabrirCampana(al, { ...wf(), campana_id: id }, '2026-11-09T15:00:00Z'),
    ])
    expect([a.status, b.status]).toEqual([200, 200])
    expect(al.campanas).toHaveLength(1)
    expect(al.campanas[0]).toMatchObject({ estado: 'abierta', fecha_inicio_origen: 'emilio' })
    const resultados = [a, b].map((r) => (r.cuerpo as { sobre?: { resultado: string }; ya_reabierta?: boolean }).sobre?.resultado ?? 'ya_reabierta').sort()
    expect(resultados.filter((x) => x === 'aceptado')).toHaveLength(1) // el otro: duplicado (la llave del sobre es la misma) o ya_reabierta
    const llaves = new Set((al.sobresEmitidos as Array<{ idempotency_key: string }>).map((s) => s.idempotency_key))
    expect(llaves.size).toBe(1)
  })
  it('🔴 el ensayo (seco) dice qué haría sin escribir nada', async () => {
    const { al, id } = await campanaDetenida()
    const antes = JSON.stringify({ c: al.campanas, e: al.esperas })
    const r = await reabrirCampana(al, { ...wf(), campana_id: id, ensayo: true }, '2026-11-09T15:00:00Z')
    expect(r.status).toBe(200)
    expect(r.cuerpo).toMatchObject({ ensayo: true, escrituras: 0, campana_antes: { estado: 'necesita_humano' }, haria: { fecha_inicio: '2026-11-09', fecha_fin: '2027-01-31', dias: 84, origen: 'emilio' } })
    expect((r.cuerpo as { haria: { esperas_que_se_cierran: Array<{ tipo: string }> } }).haria.esperas_que_se_cierran.map((e) => e.tipo).sort()).toEqual(['fecha_inicio_propuesta', 'necesita_humano'])
    expect(JSON.stringify({ c: al.campanas, e: al.esperas })).toBe(antes)
    expect(al.sobresEmitidos).toHaveLength(0)
  })
  it('🔴 la puerta retoma: el sobre nuevo llega con otro viaje, `abrir` contesta ya_abierta sobre la MISMA campaña y el cable vuelve a ESE viaje', async () => {
    const { al, id } = await campanaDetenida()
    await reabrirCampana(al, { ...wf(), campana_id: id }, '2026-11-09T15:00:00Z')
    const r = await abrirCampana(al, { ...wf(), client_id: A.clientId, plan_id: 'plan-1', seco: false, sala_ref: { _journey_id: 'journey-2' } }, '2026-11-09T15:00:05Z')
    expect(r.cuerpo).toMatchObject({ ya_abierta: true, campana: { id, estado: 'abierta', sala_ref: { _journey_id: 'journey-2' } } })
    expect(al.campanas).toHaveLength(1)
    // y la estrategia se vuelve a preparar (lo anterior no estaba validado)
    const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, '2026-11-09T15:00:10Z')
    expect(p.status).toBe(200)
    expect(p.cuerpo).toHaveProperty('corrida_id')
  })
  it('la ruta conoce la acción', () => {
    expect(ACCIONES.campanas.reabrir).toBe(reabrirCampana)
  })
  it('🔴 M14 (CC7): reabrir una campaña de PRÁCTICA deja el sobre en seco (dry_run true): nunca lanza corridas reales que gastan', async () => {
    const al = almacen()
    const r = await abrirCampana(al, { ...wf(), client_id: A.clientId, plan_id: 'plan-1', seco: true, dias_de_campana: 90, sala_ref: { _journey_id: 'journey-1' } }, '2026-11-06T11:21:00Z')
    const c = (r.cuerpo as { campana: import('../almacen').Campana }).campana
    expect(c.seco).toBe(true)
    await ponerNecesitaHumano(al, c, 'prueba', '2026-11-06T11:23:08Z')
    const re = await reabrirCampana(al, { ...wf(), campana_id: c.id }, '2026-11-09T15:00:00Z')
    expect(re.status).toBe(200)
    expect(al.sobresEmitidos).toHaveLength(1)
    expect((al.sobresEmitidos[0] as { payload: { dry_run: unknown } }).payload.dry_run).toBe(true)
    // y la real, en real (la misma regla al revés)
    const real = await campanaDetenida()
    await reabrirCampana(real.al, { ...wf(), campana_id: real.id }, '2026-11-09T15:00:00Z')
    expect((real.al.sobresEmitidos[0] as { payload: { dry_run: unknown } }).payload.dry_run).toBe(false)
  })
  it('hoyEnZona: el día del cliente, no el de UTC', () => {
    expect(hoyEnZona('2026-11-10T03:00:00Z', 'America/Guayaquil')).toBe('2026-11-09')
    expect(hoyEnZona('2026-11-10T03:00:00Z', 'UTC')).toBe('2026-11-10')
    expect(hoyEnZona('2026-11-10T03:00:00Z', null)).toBe('2026-11-10')
  })
})
