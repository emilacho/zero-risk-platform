/**
 * 09-nov · GO Lenovo (firma de Emilio) · CC#2 · A + B + D. US$ 0, sin modelo, sin red.
 *   A · S04 convierte las FECHAS de la cita a día de campaña (con la fecha de inicio); «semana del…» ±6 días.
 *   B · la tarea de estrategia dice cuál es el día 1, qué día de la semana es, cuánto dura y cuándo termina.
 *   D · la campaña hereda la ventana que declara el plan aprobado; sin ventana, la regla de siempre.
 * El caso real: Náufrago, plan 4996c6c2 (06-nov → 28-ene-2027, 84 días); la campaña 28de888e quedó en `necesita_humano` por 3 S04 imposibles.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { validarEstrategia, type Hallazgo } from '../index'
import { fechasDeCalendarioEn, hitoCuadraConFechas, ventanaDelPlan, CABECERA_DEL_PLAN_CARACTERES } from '../fechas-en-texto'
import { lineaDelDiaUno, tareaDeEstrategia } from '../indicaciones'
import { abrirCampana, ventanaDeLaCampana } from '../campanas'
import { estrategiaGuardar, estrategiaPreparar, validarSinEscribir } from '../pasos'
import { medidaDeCampana } from '../constantes'
import { fechaDeFila } from '../fechas'
import { ponerNecesitaHumano } from '../nucleo'
import type { Campana } from '../almacen'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe, formatosDeLaMigracion } from '../__fixtures__/clientes'

const FORMATOS = formatosDeLaMigracion()
const A = clienteA()
// las tres citas literales del plan aprobado de Náufrago (líneas 598-600)
const CITA_1 = 'Revisión 1: semana del 20 de noviembre de 2026 (7-10 días de datos de pauta real)'
const CITA_2 = 'Revisión 2: semana del 11 de diciembre de 2026'
const CITA_3 = 'Revisión 3: semana del 8 de enero de 2027'
const CABECERA_NAUFRAGO = '# Plan de campaña · 90 días · Náufrago · Versión 3\n**6 de noviembre de 2026 – 28 de enero de 2027**\n\n---\n'
const PLAN = `${CABECERA_NAUFRAGO}${A.planTexto}\n- ${CITA_1}\n- ${CITA_2}\n- ${CITA_3}\n`

const almacenCon = (planTexto: string) => new AlmacenMemoria({
  contextos: { [A.clientId]: { ...contextoDe(A), planTexto } }, planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-11-06' }] },
  config: { flujos: ['wf-cadena'] }, journeys: [{ journeyId: 'journey-1', clientId: A.clientId }],
})
const conHitos = (hitos: Array<{ dia: number; cita: string }>) => ({ ...A.estrategia, hitos: hitos.map((h, i) => ({ clave: `revision_${i + 1}`, dia: h.dia, tipo: 'revision' as const, cita_plan: h.cita })) })
const s04 = (hs: Hallazgo[]) => hs.filter((h) => h.chequeo === 'S04' && h.severidad === 'bloquea')
// 09-nov · F: con ventana en la cabecera, las fechas del plan se cuentan desde SU día 1. Las pruebas de A que miden la conversión desde el día 1 de la CAMPAÑA usan el plan SIN ventana (la regla de respaldo)
const PLAN_SIN_VENTANA = `${A.planTexto}\n- ${CITA_1}\n- ${CITA_2}\n- ${CITA_3}\n`
const validar = (hitos: Array<{ dia: number; cita: string }>, fechaInicio: string | null, dias = 84, planTexto = PLAN_SIN_VENTANA) => validarEstrategia(conHitos(hitos), { planTexto, formatos: FORMATOS, diasCampana: dias, fechaInicio })

describe('A · S04 con fechas de calendario', () => {
  it('🔴 la cita real «semana del 20 de noviembre de 2026» PASA con el día 12 si la campaña empieza el 09-nov', () => {
    expect(s04(validar([{ dia: 12, cita: CITA_1 }], '2026-11-09', 90))).toEqual([])
  })
  it('🔴 y con la ventana del plan (día 1 = 06-nov) pasan las TRES citas reales con los días que dio la estrategia (15 · 36 · 64)', () => {
    expect(s04(validar([{ dia: 15, cita: CITA_1 }, { dia: 36, cita: CITA_2 }, { dia: 64, cita: CITA_3 }], '2026-11-06', 84, PLAN))).toEqual([])
  })
  it('🔴 una fecha FUERA de su semana bloquea, y la ficha dice el día de campaña correcto', () => {
    const hs = s04(validar([{ dia: 30, cita: CITA_1 }], '2026-11-09', 90))
    expect(hs).toHaveLength(1)
    expect(hs[0].ficha.que).toMatch(/día 30/)
    expect(hs[0].ficha.que).toMatch(/día 12 de la campaña/)
    expect(hs[0].ficha.propuesta).toBe('usar el día 12')
  })
  it('🔴 el margen de la semana es ±6 días: el borde entra, uno más no', () => {
    expect(s04(validar([{ dia: 18, cita: CITA_1 }], '2026-11-09', 90))).toEqual([])
    expect(s04(validar([{ dia: 6, cita: CITA_1 }], '2026-11-09', 90))).toEqual([])
    expect(s04(validar([{ dia: 19, cita: CITA_1 }], '2026-11-09', 90))).toHaveLength(1)
    expect(s04(validar([{ dia: 5, cita: CITA_1 }], '2026-11-09', 90))).toHaveLength(1)
  })
  it('🔴 una fecha suelta (sin «semana del») exige el día exacto', () => {
    const cita = 'Revisión 1: el 20 de noviembre de 2026'
    expect(s04(validar([{ dia: 12, cita }], '2026-11-09', 90))).toEqual([])
    expect(s04(validar([{ dia: 13, cita }], '2026-11-09', 90))).toHaveLength(1)
  })
  it('🔴 una cita con «día N» se comporta como hoy (con o sin fecha de inicio)', () => {
    const cita = 'Revisión de resultados los días 21, 42, 63 y 84'
    for (const ini of [null, '2026-11-09']) {
      expect(s04(validar([{ dia: 21, cita }], ini, 90))).toEqual([])
      const hs = s04(validar([{ dia: 28, cita }], ini, 90))
      expect(hs).toHaveLength(1)
      expect(hs[0].ficha.que).toBe('el hito de revisión cae en el día 28 pero la cita del plan dice 21 / 42 / 63 / 84')
    }
  })
  it('🔴 CONTROL del mutante: sin la fecha de inicio (sin conversión) la cita real vuelve a bloquear como el 06-nov', () => {
    const hs = s04(validar([{ dia: 15, cita: CITA_1 }], null))
    expect(hs).toHaveLength(1)
    expect(hs[0].ficha.que).toBe('el hito de revisión cae en el día 15 pero la cita del plan dice 1 / 20 / 2026 / 7 / 10')
  })
  describe('🔴 borde de medianoche en Guayaquil (UTC−5): la fecha es de calendario, no un instante', () => {
    const tzAntes = process.env.TZ
    afterEach(() => { process.env.TZ = tzAntes })
    for (const tz of ['America/Guayaquil', 'UTC', 'Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
      it(`en la zona ${tz} el 9-nov es el día 1 y el 8-nov no lo es`, () => {
        process.env.TZ = tz
        expect(hitoCuadraConFechas(1, 'el 9 de noviembre de 2026', '2026-11-09')).toEqual({ cuadra: true, dias: [1], semana: false })
        expect(hitoCuadraConFechas(1, 'el 8 de noviembre de 2026', '2026-11-09')).toEqual({ cuadra: false, dias: [0], semana: false })
        expect(s04(validar([{ dia: 1, cita: 'Revisión 1: el 9 de noviembre de 2026' }], '2026-11-09', 90))).toEqual([])
      })
    }
  })
})

describe('🔴 A por el camino real (corrección 1 de CC7): guardar y validar en seco le pasan la fecha de inicio al validador', () => {
  const HITOS_REALES = [{ dia: 15, cita: CITA_1 }, { dia: 36, cita: CITA_2 }, { dia: 64, cita: CITA_3 }]
  const wf = (x: Record<string, unknown> = {}) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', ...x })
  async function campanaDelPlan() {
    const al = almacenCon(PLAN)
    const r = await abrirCampana(al, { ...wf(), client_id: A.clientId, seco: true }, '2026-11-06T11:21:00Z')
    return { al, id: (r.cuerpo as { campana: { id: string; fecha_inicio: string } }).campana.id }
  }
  it('estrategiaGuardar: la campaña del plan (día 1 = 06-nov) con los 3 hitos reales queda validada, sin S04', async () => {
    const { al, id } = await campanaDelPlan()
    const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, '2026-11-06T11:21:20Z')
    expect(p.status).toBe(200)
    const g = await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: { success: true, structured_output: conHitos(HITOS_REALES), cost_usd: 0.6 } }, '2026-11-06T11:22:27Z')
    expect(g.cuerpo).toMatchObject({ ok: true, version: 1 })
    expect(al.validaciones.flatMap((v) => v.hallazgos).filter((h) => h.chequeo === 'S04')).toEqual([])
    expect(al.campanas.find((c) => c.id === id)?.estado).not.toBe('necesita_humano')
  })
  it('validar en seco (`/api/cadena/validar`): la misma estrategia no bloquea por S04', async () => {
    const { al, id } = await campanaDelPlan()
    const r = await validarSinEscribir(al, { ...wf(), campana_id: id, tipo: 'estrategia', estrategia: conHitos(HITOS_REALES) }, '2026-11-06T11:22:00Z')
    expect(s04((r.cuerpo as { hallazgos: Hallazgo[] }).hallazgos)).toEqual([])
  })
})

describe('A · leer fechas de un texto', () => {
  it('nota 5 de CC7: si la cita trae una fecha y también «día N», manda la fecha (el «día N» no se mira)', () => {
    expect(s04(validar([{ dia: 15, cita: 'Revisión del día 20: semana del 20 de noviembre de 2026' }], '2026-11-06'))).toEqual([])
    expect(s04(validar([{ dia: 20, cita: 'Revisión del día 20: el 20 de noviembre de 2026' }], '2026-11-06'))).toHaveLength(1)
  })
  it('lee «20 de noviembre de 2026», «20 nov 2026», «Nov 20» y «semana del …»', () => {
    expect(fechasDeCalendarioEn(CITA_1, '2026-11-06')).toEqual([{ fecha: '2026-11-20', semana: true, anioInferido: false }])
    expect(fechasDeCalendarioEn('el 20 nov 2026', '2026-11-06').map((f) => f.fecha)).toEqual(['2026-11-20'])
    expect(fechasDeCalendarioEn('Nov 20', '2026-11-06').map((f) => f.fecha)).toEqual(['2026-11-20'])
  })
  it('sin año toma el más cercano a la fecha de inicio (el 8 de enero de una campaña de noviembre es del año siguiente)', () => {
    expect(fechasDeCalendarioEn('semana del 8 de enero', '2026-11-06')).toEqual([{ fecha: '2027-01-08', semana: true, anioInferido: true }])
  })
  it('lo que no es fecha se ignora (31 de febrero) y una cita sin fechas deja decidir al chequeo de siempre', () => {
    expect(fechasDeCalendarioEn('el 31 de febrero de 2027', '2026-11-06')).toEqual([])
    expect(hitoCuadraConFechas(21, 'Revisión los días 21 y 42', '2026-11-06')).toBeNull()
  })
})

describe('B · la tarea dice cuál es el día 1', () => {
  const ctx = contextoDe(A)
  it('🔴 con la ventana del plan: viernes 06-nov, 84 días, termina el jueves 28-ene-2027', () => {
    const t = tareaDeEstrategia({ ctx, formatosPermitidos: { instagram: ['foto'] }, version: 1, diasDeCampana: 84, fechaInicio: '2026-11-06', fechaFin: '2027-01-28' })
    expect(t).toContain('El día 1 de la campaña es el viernes 2026-11-06; la campaña dura 84 días y termina el jueves 2027-01-28 (día 84).')
    expect(t).toContain('si el plan da una FECHA, conviértela a su día de campaña contando desde el día 1')
  })
  it('sin fecha de inicio la tarea queda byte a byte como antes', () => {
    const base = { ctx, formatosPermitidos: { instagram: ['foto'] }, version: 1, diasDeCampana: 90 }
    expect(tareaDeEstrategia({ ...base, fechaInicio: null })).toBe(tareaDeEstrategia(base))
    expect(lineaDelDiaUno(null, null, 90)).toBe('')
    expect(lineaDelDiaUno('no-es-fecha', null, 90)).toBe('')
  })
})

describe('D · la campaña hereda la ventana del plan', () => {
  it('🔴 la cabecera de Náufrago da 06-nov → 28-ene-2027 = 84 días', () => {
    expect(ventanaDelPlan(PLAN)).toEqual({ desde: '2026-11-06', hasta: '2027-01-28', dias: 84 })
  })
  it('sin ventana en la cabecera, null; un rango más abajo (una fase) no es la ventana', () => {
    expect(ventanaDelPlan(A.planTexto)).toBeNull()
    expect(ventanaDelPlan('x'.repeat(CABECERA_DEL_PLAN_CARACTERES) + '\n6 de noviembre de 2026 – 28 de enero de 2027')).toBeNull()
    expect(ventanaDelPlan('**28 de enero de 2027 – 6 de noviembre de 2026**')).toBeNull() // al revés
    expect(ventanaDelPlan('**6 de noviembre de 2026 – 8 de noviembre de 2026**')).toBeNull() // 3 días no es una ventana
  })
  it('la regla elige: plan si declara ventana y nadie pidió otra medida; si no, primer lunes + medida', () => {
    expect(ventanaDeLaCampana(PLAN, '2026-11-09', 90, false)).toEqual({ fecha_inicio: '2026-11-06', fecha_fin: '2027-01-28', origen: 'plan', dias: 84 })
    expect(ventanaDeLaCampana(PLAN, '2026-11-09', 90, true)).toEqual({ fecha_inicio: '2026-11-09', fecha_fin: '2027-02-06', origen: 'regla', dias: 90 })
    expect(ventanaDeLaCampana(A.planTexto, '2026-11-09', 90, false)).toEqual({ fecha_inicio: '2026-11-09', fecha_fin: '2027-02-06', origen: 'regla', dias: 90 })
  })
  it('🔴 abrir con un plan que declara su ventana: la campaña nace con ella, origen «plan», y sin espera de «fecha propuesta»', async () => {
    const al = almacenCon(PLAN)
    const r = await abrirCampana(al, { workflow_id: 'wf-cadena', workflow_execution_id: '1', client_id: A.clientId, seco: true }, '2026-11-06T11:21:00Z')
    expect(r.status).toBe(201)
    const c = (r.cuerpo as { campana: { id: string; fecha_inicio: string; fecha_fin: string; fecha_inicio_origen: string } }).campana
    expect([c.fecha_inicio, c.fecha_fin, c.fecha_inicio_origen]).toEqual(['2026-11-06', '2027-01-28', 'plan'])
    expect((r.cuerpo as { ventana_origen: string }).ventana_origen).toBe('plan')
    expect(al.esperas.filter((e) => e.campana_id === c.id && e.objeto_tipo === 'fecha_inicio_propuesta')).toEqual([])
  })
  it('🔴 corrección 2 de CC7: una ventana que empieza un viernes no pierde su última semana (06-nov → 28-ene = 13 semanas desde el lunes 02-nov)', () => {
    const m = medidaDeCampana({ fecha_inicio: '2026-11-06', fecha_fin: '2027-01-28' })
    expect([m.dias, m.totalSemanas, m.totalTandas]).toEqual([84, 13, 4])
    expect(fechaDeFila('2026-11-06', 13, 4)).toBe('2027-01-28') // el último día cae en la semana 13
    // con inicio en lunes, como hoy: lunes + 90 → 13 · lunes + 84 → 12
    expect(medidaDeCampana({ fecha_inicio: '2026-11-09', fecha_fin: '2027-02-06' }).totalSemanas).toBe(13)
    expect(medidaDeCampana({ fecha_inicio: '2026-11-09', fecha_fin: '2027-01-31' }).totalSemanas).toBe(12)
    expect(medidaDeCampana({}).totalSemanas).toBe(13) // sin fechas: lo de siempre (90 días)
  })
  it('🔴 punto 4 (Lenovo · regla de sistema): la campaña reemplazada por un plan nuevo queda con 0 esperas vivas, aunque tuviera dos', async () => {
    const al = new AlmacenMemoria({
      contextos: { [A.clientId]: { ...contextoDe(A), planTexto: A.planTexto } }, planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-11-06' }, { plan_id: 'plan-2', fecha: '2026-11-07' }] },
      config: { flujos: ['wf-cadena'] }, journeys: [{ journeyId: 'journey-1', clientId: A.clientId }],
    })
    const abrir = (plan: string, ahora: string) => abrirCampana(al, { workflow_id: 'wf-cadena', workflow_execution_id: '1', client_id: A.clientId, plan_id: plan, seco: true }, ahora)
    const vieja = ((await abrir('plan-1', '2026-11-06T11:21:00Z')).cuerpo as { campana: Campana }).campana
    await ponerNecesitaHumano(al, vieja, 'la estrategia sigue con 3 bloqueo(s)', '2026-11-06T11:23:00Z')
    const vivasDe = (id: string) => al.esperas.filter((e) => e.campana_id === id && e.estado === 'viva').map((e) => e.objeto_tipo).sort()
    expect(vivasDe(vieja.id)).toEqual(['fecha_inicio_propuesta', 'necesita_humano']) // las dos de Náufrago 28de888e
    const r = await abrir('plan-2', '2026-11-09T15:00:00Z')
    expect((r.cuerpo as { reemplaza_a: string }).reemplaza_a).toBe(vieja.id)
    expect(vivasDe(vieja.id)).toEqual([])
  })
  it('abrir con un plan sin ventana: la regla de siempre y su espera', async () => {
    const al = almacenCon(A.planTexto)
    const r = await abrirCampana(al, { workflow_id: 'wf-cadena', workflow_execution_id: '1', client_id: A.clientId, seco: true }, '2026-11-06T11:21:00Z')
    const c = (r.cuerpo as { campana: { id: string; fecha_inicio_origen: string } }).campana
    expect(c.fecha_inicio_origen).toBe('regla')
    expect(al.esperas.filter((e) => e.campana_id === c.id && e.objeto_tipo === 'fecha_inicio_propuesta')).toHaveLength(1)
  })
})
