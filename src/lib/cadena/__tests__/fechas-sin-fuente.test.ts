/**
 * Fechas especiales «sin fuente» · 10-nov · GO Lenovo (A + B + C + D) · CC3 construye, CC7 certifica · US$ 0 (sin base, sin red, sin modelo).
 * Dos clientes de países y rubros distintos: una cafetería en Ecuador (cliente A) y una clínica en Colombia (cliente B).
 *  · A · fuentes oficiales por país (`tipo|país` primero, después `*|país`), el mismo código para los dos países.
 *  · B · sin fuentes cargadas: `sin_configurar`, no cuenta intento, UNA alarma por país y tipo (condición de CC7: no una por corrida).
 *  · C · la temporada del negocio la da el cliente con una cita del plan; sin cita, pendiente y una pregunta en Decisiones. Nunca una fecha inventada.
 *  · D · la clase la decide el agente; el código guarda la llave estable (condición de CC7: probada con las dos grafías que ya están en la base).
 */
import { describe, it, expect } from 'vitest'
import { abrirCampana, estrategiaGuardar, estrategiaPreparar, fechasCobertura, type Estrategia } from '../index'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, clienteB, contextoDe } from '../__fixtures__/clientes'
import { dominiosDe, llaveConocida, temporadaRespaldada } from '../fechas-del-cliente'
import { fechasPedidasDe } from '../revision-jefatura'
import { chequearCandidatas, type InsumosCalendario } from '../validador-calendario'
import { validarEstrategia, type InsumosEstrategia } from '../validador-estrategia'
import type { FechaQueImporta } from '../tipos'

const A = clienteA() // cafetería · Ecuador
const B = clienteB() // clínica · Colombia
const AHORA = '2026-10-09T12:00:00Z'
const wf = { workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1' }
/** aquí solo se miran S10 y S11: los pares red-formato no importan */
const SIN_FORMATOS = {} as InsumosEstrategia['formatos']
const TEMPORADA_B = 'La temporada alta de consultas va del 1 de diciembre al 15 de enero.'
const PLAN_B = `${B.planTexto}\n${TEMPORADA_B}`

function mundo(config: Record<string, unknown> = {}) {
  return new AlmacenMemoria({
    contextos: { [A.clientId]: { ...contextoDe(A), pais: 'Ecuador' }, [B.clientId]: { ...contextoDe(B), pais: 'Colombia', planTexto: PLAN_B } },
    planes: { [A.clientId]: [{ plan_id: 'plan-a', fecha: '2026-10-08' }], [B.clientId]: [{ plan_id: 'plan-b', fecha: '2026-10-08' }] },
    config: { flujos: ['wf-cadena'], puerta_workflow_id: 'wf-puerta', estado_cadena: 'encendida', ...config },
    journeys: [{ journeyId: 'j-a', clientId: A.clientId }, { journeyId: 'j-b', clientId: B.clientId }],
  })
}
async function campanaDe(al: AlmacenMemoria, clientId: string, seco = false): Promise<string> {
  const r = await abrirCampana(al, { ...wf, client_id: clientId, seco }, AHORA)
  expect([200, 201]).toContain(r.status)
  return (r.cuerpo.campana as { id: string }).id
}
const pedir = (campana_id: string, pais: string, tipo: string, ambito: string, anio = 2026) => ({ ...wf, campana_id, pais, tipo, ambito, anio })

/** una fecha del contrato nuevo (v2), como la escribiría el agente */
const fecha = (x: Partial<FechaQueImporta> & Pick<FechaQueImporta, 'tipo'>): FechaQueImporta => ({ ambito: 'nacional', origen: 'estrategia', cita_plan: '', motivo: 'le cambia las ventas de esa semana', clase: 'feriado_publico', llave: x.tipo.replace(/ /g, '_'), llave_nueva: true, desde: '', hasta: '', ...x })
const conFechas = (e: Estrategia, fechas: FechaQueImporta[]): Estrategia => ({ ...e, fechas_que_importan: fechas })

async function guardarEstrategia(al: AlmacenMemoria, id: string, e: Estrategia) {
  const p = await estrategiaPreparar(al, { ...wf, campana_id: id }, AHORA)
  expect(p.status).toBe(200)
  return estrategiaGuardar(al, { ...wf, campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: { success: true, structured_output: e, cost_usd: 0.3 } }, AHORA)
}

// ─────────────────────────────────────────────────────────────── A
describe('A · fuentes oficiales por país (el mismo código para cualquier país)', () => {
  it('la excepción del tipo gana; si no hay, las del país para todo tipo; sin nada, vacía; una configuración ilegible no inventa fuentes', () => {
    const cfg = { '*|ecuador': ['https://estado.ec/feriados'], 'navidad|ecuador': ['https://estado.ec/navidad'], '*|colombia': ['https://estado.co/festivos'] }
    expect(dominiosDe(cfg, 'navidad', 'ecuador')).toEqual(['https://estado.ec/navidad'])
    expect(dominiosDe(cfg, 'ano_nuevo', 'ecuador')).toEqual(['https://estado.ec/feriados'])
    expect(dominiosDe(cfg, 'navidad', 'colombia')).toEqual(['https://estado.co/festivos'])
    expect(dominiosDe(cfg, 'navidad', 'peru')).toEqual([])
    expect(dominiosDe({ 'navidad|ecuador': [] , '*|ecuador': ['https://estado.ec/feriados'] }, 'navidad', 'ecuador')).toEqual(['https://estado.ec/feriados'])
    expect(dominiosDe(null, 'navidad', 'ecuador')).toEqual([])
    expect(dominiosDe(['x'], 'navidad', 'ecuador')).toEqual([])
    expect(dominiosDe({ '*|ecuador': 'https://no-es-lista' }, 'navidad', 'ecuador')).toEqual([])
    expect(dominiosDe({ '*|ecuador': [3, '', 'https://estado.ec/feriados'] }, 'navidad', 'ecuador')).toEqual(['https://estado.ec/feriados'])
  })
  it('cada cliente investiga con las fuentes de SU país (Ecuador y Colombia), y con la excepción de un tipo', async () => {
    const al = mundo({ dominios_fechas: { '*|ecuador': ['https://estado.ec/feriados'], 'navidad|ecuador': ['https://estado.ec/navidad'], '*|colombia': ['https://estado.co/festivos'] } })
    const a = await campanaDe(al, A.clientId), b = await campanaDe(al, B.clientId)
    expect((await fechasCobertura(al, pedir(a, 'Ecuador', 'año nuevo', 'nacional'))).cuerpo).toMatchObject({ estado: 'investigar', intento: 1, dominios: ['https://estado.ec/feriados'] })
    expect((await fechasCobertura(al, pedir(a, 'Ecuador', 'navidad', 'nacional'))).cuerpo).toMatchObject({ estado: 'investigar', dominios: ['https://estado.ec/navidad'] })
    expect((await fechasCobertura(al, pedir(b, 'Colombia', 'navidad', 'nacional'))).cuerpo).toMatchObject({ estado: 'investigar', dominios: ['https://estado.co/festivos'] })
    expect(al.alarmasEnviadas).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────── B
describe('B · sin fuentes cargadas: sin configurar, sin intento y UNA alarma por país y tipo', () => {
  it('🔴 condición de CC7: dos años, dos ámbitos y corridas repetidas del mismo país y tipo dan UNA sola alarma; otro tipo u otro país, la suya', async () => {
    const al = mundo()
    const a = await campanaDe(al, A.clientId), b = await campanaDe(al, B.clientId)
    for (let vuelta = 0; vuelta < 3; vuelta++) {
      for (const anio of [2026, 2027]) for (const ambito of ['nacional', 'Olón']) {
        const r = await fechasCobertura(al, pedir(a, 'Ecuador', 'Navidad', ambito, anio))
        expect(r.cuerpo).toMatchObject({ estado: 'sin_fuente', cobertura: 'sin_configurar' })
      }
    }
    expect(al.alarmasEnviadas).toHaveLength(1)
    expect(al.alarmasEnviadas[0]).toMatch(/«ecuador»[\s\S]*«navidad»/)
    await fechasCobertura(al, pedir(a, 'Ecuador', 'Año Nuevo', 'nacional'))
    await fechasCobertura(al, pedir(b, 'Colombia', 'Navidad', 'nacional'))
    await fechasCobertura(al, pedir(b, 'Colombia', 'Navidad', 'nacional', 2027))
    expect(al.alarmasEnviadas).toHaveLength(3)
    expect([...al.alarmasDeFecha].sort()).toEqual(['colombia|navidad', 'ecuador|ano_nuevo', 'ecuador|navidad'])
    // no cuenta intento: ninguna cobertura pasa de 0
    expect(al.coberturas.every((c) => c.estado === 'sin_configurar' && c.intentos === 0)).toBe(true)
  })
  it('🔴 a la vez (cinco corridas juntas del mismo país y tipo): una sola alarma', async () => {
    const al = mundo()
    const a = await campanaDe(al, A.clientId)
    const rs = await Promise.all([2026, 2027, 2026, 2027, 2026].map((anio) => fechasCobertura(al, pedir(a, 'Ecuador', 'Navidad', 'nacional', anio))))
    expect(rs.map((r) => r.cuerpo.alarma).filter((x) => x === 'enviada')).toHaveLength(1)
    expect(al.alarmasEnviadas).toHaveLength(1)
  })
  it('un ensayo en seco no manda ni marca: la corrida real después SÍ avisa (el ensayo no le quita la alarma)', async () => {
    const al = mundo()
    const seca = await campanaDe(al, A.clientId, true)
    expect((await fechasCobertura(al, pedir(seca, 'Ecuador', 'Navidad', 'nacional'))).cuerpo.alarma).toBe('no_enviada_en_ensayo')
    expect(al.alarmasEnviadas).toHaveLength(0)
    expect(al.alarmasDeFecha.size).toBe(0)
    const real = await campanaDe(al, B.clientId)
    expect((await fechasCobertura(al, pedir(real, 'Ecuador', 'Navidad', 'nacional'))).cuerpo.alarma).toBe('enviada')
    expect(al.alarmasEnviadas).toHaveLength(1)
  })
  it('con la cadena en ensayo y «registrar», no se manda; con «enviar», sí', async () => {
    const reg = mundo({ estado_cadena: 'ensayo', alertas_en_ensayo: 'registrar', clientes_ensayo: [A.clientId] })
    await fechasCobertura(reg, pedir(await campanaDe(reg, A.clientId), 'Ecuador', 'Navidad', 'nacional'))
    expect(reg.alarmasEnviadas).toHaveLength(0)
    const env = mundo({ estado_cadena: 'ensayo', alertas_en_ensayo: 'enviar', clientes_ensayo: [A.clientId] })
    await fechasCobertura(env, pedir(await campanaDe(env, A.clientId), 'Ecuador', 'Navidad', 'nacional'))
    expect(env.alarmasEnviadas).toHaveLength(1)
  })
  it('🔴 sin_configurar no es final: al cargar las fuentes se investiga (intento 1), la marca se borra y, si se vuelven a vaciar, sale otra alarma', async () => {
    const al = mundo()
    const a = await campanaDe(al, A.clientId)
    await fechasCobertura(al, pedir(a, 'Ecuador', 'Navidad', 'nacional'))
    expect(al.alarmasEnviadas).toHaveLength(1)
    al.config.set('dominios_fechas', { '*|ecuador': ['https://estado.ec/feriados'] })
    expect((await fechasCobertura(al, pedir(a, 'Ecuador', 'Navidad', 'nacional'))).cuerpo).toMatchObject({ estado: 'investigar', intento: 1 })
    expect(al.alarmasDeFecha.size).toBe(0)
    al.config.set('dominios_fechas', {})
    await fechasCobertura(al, pedir(a, 'Ecuador', 'Navidad', 'nacional', 2027))
    expect(al.alarmasEnviadas).toHaveLength(2)
  })
  it('🔴 las filas viejas «sin fuente con 0 intentos» (nacieron de «sin dominios») no son finales y no se reescriben', async () => {
    const al = mundo()
    const a = await campanaDe(al, A.clientId)
    al.coberturas.push({ pais: 'ecuador', tipo: 'navidad', ambito_clave: 'ecuador', anio: 2026, estado: 'sin_fuente', intentos: 0 })
    const r = await fechasCobertura(al, pedir(a, 'Ecuador', 'Navidad', 'Ecuador'))
    expect(r.cuerpo).toMatchObject({ estado: 'sin_fuente', cobertura: 'sin_configurar' })
    expect(al.coberturas[0]).toEqual({ pais: 'ecuador', tipo: 'navidad', ambito_clave: 'ecuador', anio: 2026, estado: 'sin_fuente', intentos: 0 })
    al.config.set('dominios_fechas', { '*|ecuador': ['https://estado.ec/feriados'] })
    expect((await fechasCobertura(al, pedir(a, 'Ecuador', 'Navidad', 'Ecuador'))).cuerpo).toMatchObject({ estado: 'investigar', intento: 1 })
  })
  it('lo de siempre no cambia: «sin fuente» tras 3 intentos reales sigue siendo final, y una fecha verificada no se repite', async () => {
    const al = mundo({ dominios_fechas: { '*|ecuador': ['https://estado.ec/feriados'] } })
    const a = await campanaDe(al, A.clientId)
    for (const n of [1, 2, 3]) expect((await fechasCobertura(al, pedir(a, 'Ecuador', 'Navidad', 'nacional'))).cuerpo).toMatchObject({ estado: 'investigar', intento: n })
    const r = await fechasCobertura(al, pedir(a, 'Ecuador', 'Navidad', 'nacional'))
    expect(r.cuerpo.estado).toBe('sin_fuente')
    expect(r.cuerpo.cobertura).toBeUndefined()
    al.coberturas.push({ pais: 'ecuador', tipo: 'ano_nuevo', ambito_clave: 'nacional', anio: 2026, estado: 'verificada', intentos: 1 })
    expect((await fechasCobertura(al, pedir(a, 'Ecuador', 'Año Nuevo', 'nacional'))).cuerpo.estado).toBe('ya_verificada')
    expect(al.alarmasEnviadas).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────── C
describe('C · la temporada del negocio la da el cliente (cita del plan); sin cita, pendiente y pregunta', () => {
  it('la cita respalda el tramo: literal en el plan, con los meses y los días que no son el primero o el último del mes', () => {
    const plan = 'La temporada alta va de diciembre a abril. La cosecha va del 10 de marzo al 20 de mayo.'
    expect(temporadaRespaldada({ desde: '2026-12-01', hasta: '2027-04-30', cita_plan: 'La temporada alta va de diciembre a abril' }, plan).ok).toBe(true)
    expect(temporadaRespaldada({ desde: '2026-12-15', hasta: '2027-04-30', cita_plan: 'La temporada alta va de diciembre a abril' }, plan)).toMatchObject({ ok: false, motivo: expect.stringMatching(/día 15/) })
    expect(temporadaRespaldada({ desde: '2026-12-01', hasta: '2027-04-20', cita_plan: 'La temporada alta va de diciembre a abril' }, plan)).toMatchObject({ ok: false, motivo: expect.stringMatching(/día 20/) })
    expect(temporadaRespaldada({ desde: '2027-03-10', hasta: '2027-05-20', cita_plan: 'La cosecha va del 10 de marzo al 20 de mayo' }, plan).ok).toBe(true)
    expect(temporadaRespaldada({ desde: '2027-02-01', hasta: '2027-05-20', cita_plan: 'La cosecha va del 10 de marzo al 20 de mayo' }, plan)).toMatchObject({ ok: false, motivo: expect.stringMatching(/meses/) })
    expect(temporadaRespaldada({ desde: '2026-12-01', hasta: '2027-04-30', cita_plan: 'La temporada alta va de diciembre a abril y mayo' }, plan)).toMatchObject({ ok: false, motivo: expect.stringMatching(/literal/) })
    expect(temporadaRespaldada({ desde: '2027-04-30', hasta: '2026-12-01', cita_plan: 'La temporada alta va de diciembre a abril' }, plan).ok).toBe(false)
    expect(temporadaRespaldada({ desde: '', hasta: '', cita_plan: '' }, plan)).toMatchObject({ ok: false, motivo: 'el plan no dice cuándo es' })
    expect(temporadaRespaldada({ desde: '2026-12-01', hasta: '', cita_plan: 'La temporada alta va de diciembre a abril' }, plan).ok).toBe(false)
  })
  it('🔴 con cita: se guarda SOLO para ese cliente (la clínica de Colombia), no se investiga en fuentes públicas y el otro cliente no la ve', async () => {
    const al = mundo()
    const b = await campanaDe(al, B.clientId)
    const e = conFechas(B.estrategia, [fecha({ tipo: 'temporada alta de consultas', clase: 'temporada_del_negocio', ambito: 'unica', origen: 'plan', desde: '2026-12-01', hasta: '2027-01-15', cita_plan: TEMPORADA_B.replace(/\.$/, '') })])
    const g = await guardarEstrategia(al, b, e)
    expect(g.status).toBe(200)
    expect(g.cuerpo.fechas_pedidas).toEqual([]) // una temporada no va a las fuentes oficiales
    expect((g.cuerpo.temporadas as { guardadas: string[] }).guardadas).toEqual(['temporada_alta_de_consultas'])
    expect(al.fechas).toEqual([expect.objectContaining({ pais: 'colombia', tipo: 'temporada_alta_de_consultas', ambito: 'unica', fecha: '2026-12-01', hasta: '2027-01-15', estado: 'verificada', origen: 'cliente', client_id: B.clientId })])
    expect(await al.fechasEspeciales('colombia', ['temporada_alta_de_consultas'], '2026-10-01', '2027-02-01', B.clientId)).toHaveLength(1)
    expect(await al.fechasEspeciales('colombia', ['temporada_alta_de_consultas'], '2026-10-01', '2027-02-01', A.clientId)).toHaveLength(0)
    expect(await al.fechasEspeciales('colombia', [], '2026-10-01', '2027-02-01')).toHaveLength(0) // la búsqueda de feriados nacionales (abrir campaña) tampoco la ve
    expect(await al.llavesDeFechas('colombia', A.clientId)).toEqual([])
    expect(al.preguntasAlDueno).toEqual([])
  })
  it('🔴 sin cita: no bloquea la estrategia, queda pendiente, NO se guarda ninguna fecha y se deja UNA pregunta en Decisiones (repetir no la duplica)', async () => {
    const al = mundo()
    const a = await campanaDe(al, A.clientId)
    const e = conFechas(A.estrategia, [fecha({ tipo: 'temporada de lluvias', clase: 'temporada_del_negocio', ambito: 'centro' })])
    const g = await guardarEstrategia(al, a, e)
    expect(g.status).toBe(200)
    expect(g.cuerpo.ok).toBe(true)
    expect((g.cuerpo.temporadas as { pendientes: string[] }).pendientes).toEqual(['temporada_de_lluvias: el plan no dice cuándo es'])
    expect((g.cuerpo.avisos as string[]).some((x) => /temporada queda pendiente/.test(x))).toBe(true)
    expect(al.fechas).toEqual([])
    expect(al.preguntasAlDueno).toHaveLength(1)
    expect(al.preguntasAlDueno[0]).toMatchObject({ client_id: A.clientId, tema: 'temporada temporada de lluvias', workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1' })
    expect(al.preguntasAlDueno[0]!.pregunta).toMatch(/desde qué día y hasta qué día/)
    const otra = await campanaDe(al, A.clientId)
    await guardarEstrategia(al, otra, e)
    expect(al.preguntasAlDueno).toHaveLength(1)
  })
  it('una fecha que el plan no respalda (día inventado) tampoco se guarda: queda pendiente con su motivo', async () => {
    const al = mundo()
    const b = await campanaDe(al, B.clientId)
    const e = conFechas(B.estrategia, [fecha({ tipo: 'temporada alta de consultas', clase: 'temporada_del_negocio', ambito: 'unica', origen: 'plan', desde: '2026-12-08', hasta: '2027-01-15', cita_plan: TEMPORADA_B.replace(/\.$/, '') })])
    const g = await guardarEstrategia(al, b, e)
    expect(g.status).toBe(200)
    expect((g.cuerpo.temporadas as { pendientes: string[] }).pendientes[0]).toMatch(/día 8/)
    expect(al.fechas).toEqual([])
  })
  it('en seco no se escribe la temporada ni se pregunta: solo se dice qué se haría', async () => {
    const al = mundo()
    const b = await campanaDe(al, B.clientId, true)
    const e = conFechas(B.estrategia, [
      fecha({ tipo: 'temporada alta de consultas', clase: 'temporada_del_negocio', ambito: 'unica', origen: 'plan', desde: '2026-12-01', hasta: '2027-01-15', cita_plan: TEMPORADA_B.replace(/\.$/, '') }),
      fecha({ tipo: 'temporada baja', clase: 'temporada_del_negocio', ambito: 'unica' }),
    ])
    const g = await guardarEstrategia(al, b, e)
    expect((g.cuerpo.temporadas as { guardadas: string[] }).guardadas).toEqual(['temporada_alta_de_consultas (ensayo: no se escribe)'])
    expect(al.fechas).toEqual([])
    expect(al.preguntasAlDueno).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────── D
describe('D · la clase la decide el agente y el código guarda la llave estable', () => {
  /** las dos grafías que HOY están en la base (cobertura de producción, 10-nov) */
  const sembrarLasDosGrafias = (al: AlmacenMemoria) => al.coberturas.push(
    { pais: 'ecuador', tipo: 'temporada_alta_playa', ambito_clave: 'costa_ecuatoriana_(olon)', anio: 2026, estado: 'sin_fuente', intentos: 0 },
    { pais: 'ecuador', tipo: 'temporada_alta_de_playa', ambito_clave: 'olon', anio: 2026, estado: 'sin_fuente', intentos: 0 },
  )
  it('🔴 condición de CC7: las dos grafías llegan al agente; la que devuelve se acepta y se guarda TAL CUAL; una tercera sin marcar nueva, se rechaza', async () => {
    const al = mundo()
    sembrarLasDosGrafias(al)
    const a = await campanaDe(al, A.clientId)
    const p = await estrategiaPreparar(al, { ...wf, campana_id: a }, AHORA)
    const tarea = (p.cuerpo.run_sdk as { task: string }).task
    expect(tarea).toMatch(/- temporada_alta_de_playa · ámbito olon/)
    expect(tarea).toMatch(/- temporada_alta_playa · ámbito costa_ecuatoriana_\(olon\)/)
    const llaves = await al.llavesDeFechas('ecuador', A.clientId)
    for (const [llave, ambito] of [['temporada_alta_de_playa', 'olon'], ['temporada_alta_playa', 'costa_ecuatoriana_(olon)']] as const) {
      expect(llaveConocida({ tipo: 'Temporada alta en la playa', llave, ambito, llave_nueva: false }, llaves)).toEqual({ ok: true, existe: true })
    }
    expect(llaveConocida({ tipo: 'x', llave: 'temporada_de_playa_alta', ambito: 'olon', llave_nueva: false }, llaves).ok).toBe(false)
    expect(llaveConocida({ tipo: 'x', llave: 'temporada_alta_de_playa', ambito: 'costa_ecuatoriana_(olon)', llave_nueva: false }, llaves).ok).toBe(false) // la llave con el ámbito de la OTRA grafía no es la misma
    expect(llaveConocida({ tipo: 'x', llave: 'temporada_de_playa_alta', ambito: 'olon', llave_nueva: true }, llaves)).toEqual({ ok: true, existe: false })
    // el validador: la tercera grafía sin marcar nueva bloquea (S10); la existente pasa
    const ins = { planTexto: A.planTexto, formatos: SIN_FORMATOS, llavesDeFechas: llaves }
    const s10 = (f: FechaQueImporta) => validarEstrategia(conFechas(A.estrategia, [f]), ins).filter((h) => h.chequeo === 'S10')
    expect(s10(fecha({ tipo: 'temporada alta en la playa', llave: 'temporada_alta_de_playa', ambito: 'olon', llave_nueva: false }))).toEqual([])
    expect(s10(fecha({ tipo: 'temporada alta en la playa', llave: 'temporada_de_playa_alta', ambito: 'olon', llave_nueva: false }))).toEqual([expect.objectContaining({ severidad: 'bloquea' })])
    expect(s10(fecha({ tipo: 'temporada alta en la playa', llave: '', ambito: 'olon', llave_nueva: true }))).toEqual([expect.objectContaining({ severidad: 'bloquea' })])
  })
  it('🔴 la llave que devuelve el agente es la que se investiga (no la grafía del tipo), y las dos grafías quedan como están', async () => {
    const al = mundo()
    sembrarLasDosGrafias(al)
    const a = await campanaDe(al, A.clientId)
    const g = await guardarEstrategia(al, a, conFechas(A.estrategia, [fecha({ tipo: 'Temporada alta en la playa', llave: 'temporada_alta_de_playa', ambito: 'olon', llave_nueva: false })]))
    expect(g.status).toBe(200)
    expect(g.cuerpo.fechas_pedidas).toEqual([{ pais: 'Ecuador', tipo: 'temporada_alta_de_playa', ambito: 'olon', anio: 2026 }, { pais: 'Ecuador', tipo: 'temporada_alta_de_playa', ambito: 'olon', anio: 2027 }])
    for (const f of g.cuerpo.fechas_pedidas as { pais: string; tipo: string; ambito: string; anio: number }[]) await fechasCobertura(al, { ...wf, campana_id: a, ...f })
    expect(al.coberturas.map((c) => `${c.tipo}|${c.ambito_clave}|${c.anio}`).sort()).toEqual(['temporada_alta_de_playa|olon|2026', 'temporada_alta_de_playa|olon|2027', 'temporada_alta_playa|costa_ecuatoriana_(olon)|2026'])
  })
  it('una llave inventada sin marcar nueva lleva la estrategia a su única corrección (no pasa en silencio)', async () => {
    const al = mundo()
    sembrarLasDosGrafias(al)
    const a = await campanaDe(al, A.clientId)
    const g = await guardarEstrategia(al, a, conFechas(A.estrategia, [fecha({ tipo: 'Temporada alta en la playa', llave: 'temporada_de_playa_alta', ambito: 'olon', llave_nueva: false })]))
    expect(g.cuerpo.correccion).toBe(true)
    expect(JSON.stringify(g.cuerpo.fichas)).toMatch(/temporada_de_playa_alta/)
  })
  it('🔴 sin lista de palabras: la clase manda. Un «feriado» que es temporada del negocio no dispara las candidatas; «Navidad» como feriado público sí', () => {
    const base = (fechas: FechaQueImporta[]): InsumosCalendario => ({
      campana: { fecha_inicio: '2026-12-01', fecha_fin: '2026-12-31', tanda: 1, semanas: [1] }, estrategia: conFechas(A.estrategia, fechas), planTexto: A.planTexto, formatos: {}, sedes: [], referencias: [], clientId: A.clientId, ahora: '2026-11-10',
      filas: [{ id: 'f-1', fecha: '2026-12-24', estado: 'validada', requiere_abierto: true, sede: 'centro' } as never], filasPrevias: [], ajustes: [],
      fechasEspeciales: [{ id: '1', fecha: '2026-12-24', nombre: 'Fiesta de otro cantón', tipo: 'fiesta', ambito: 'otro', alcance: 'local', estado: 'verificada' }],
    } as unknown as InsumosCalendario)
    expect(chequearCandidatas(base([fecha({ tipo: 'feriados de fin de año', clase: 'temporada_del_negocio' })]))).toEqual([])
    expect(chequearCandidatas(base([fecha({ tipo: 'Navidad', clase: 'feriado_publico' })]))).toHaveLength(1)
    // una temporada del cliente guardada no es un feriado de otro ámbito
    const conTemporada = base([fecha({ tipo: 'Navidad', clase: 'feriado_publico' })])
    conTemporada.fechasEspeciales = [{ id: '2', fecha: '2026-12-24', nombre: 'Temporada alta', tipo: 'temporada_alta', ambito: 'otro', alcance: 'local', estado: 'verificada', origen: 'cliente', hasta: '2027-01-10' }]
    expect(chequearCandidatas(conTemporada)).toEqual([])
  })
  it('una estrategia guardada antes del 10-nov (sin clase ni llave) se lee como siempre: todo a las fuentes oficiales, con su tipo', () => {
    const vieja = conFechas(A.estrategia, [{ tipo: 'feriados locales', ambito: 'ciudad', origen: 'estrategia', motivo: 'la cafetería vende menos en feriados largos' }])
    expect(fechasPedidasDe({ fecha_inicio: '2026-10-12', fecha_fin: '2027-01-09' }, 'Ecuador', vieja)).toEqual([
      { pais: 'Ecuador', tipo: 'feriados locales', ambito: 'ciudad', anio: 2026 }, { pais: 'Ecuador', tipo: 'feriados locales', ambito: 'ciudad', anio: 2027 },
    ])
    expect(validarEstrategia(vieja, { planTexto: A.planTexto, formatos: SIN_FORMATOS }).filter((h) => ['S10', 'S11'].includes(h.chequeo))).toEqual([])
  })
})
