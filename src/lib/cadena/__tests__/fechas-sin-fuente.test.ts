/**
 * Fechas especiales «sin fuente» · 10-nov · GO Lenovo (A + B + C + D) · CC3 construye, CC7 certifica · US$ 0 (sin base, sin red, sin modelo).
 * Dos clientes de países y rubros distintos: una cafetería en Ecuador (cliente A) y una clínica en Colombia (cliente B).
 *  · A · fuentes oficiales por país (`tipo|país` primero, después `*|país`), el mismo código para los dos países.
 *  · B · sin fuentes cargadas: `sin_configurar`, no cuenta intento, UNA alarma por país y tipo (condición de CC7: no una por corrida).
 *  · C · la temporada del negocio la da el cliente con una cita del plan; sin cita, pendiente y una pregunta en Decisiones. Nunca una fecha inventada.
 *  · D · la clase la decide el agente; el código guarda la llave estable (condición de CC7: probada con las dos grafías que ya están en la base).
 */
import { describe, it, expect } from 'vitest'
import { abrirCampana, estrategiaGuardar, estrategiaPreparar, fechasCobertura, fechasPreparar, type Estrategia } from '../index'
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
    planes: { [A.clientId]: [{ plan_id: 'plan-a2', fecha: '2026-10-08' }, { plan_id: 'plan-a', fecha: '2026-10-08' }], [B.clientId]: [{ plan_id: 'plan-b', fecha: '2026-10-08' }] },
    config: { flujos: ['wf-cadena'], puerta_workflow_id: 'wf-puerta', estado_cadena: 'encendida', ...config },
    journeys: [{ journeyId: 'j-a', clientId: A.clientId }, { journeyId: 'j-b', clientId: B.clientId }],
  })
}
/** sin `plan_id`, el plan más reciente; uno distinto abre OTRA campaña (el mismo plan dos veces devuelve la misma, y su estrategia ya estaría hecha) */
async function campanaDe(al: AlmacenMemoria, clientId: string, seco = false, plan_id?: string): Promise<string> {
  const r = await abrirCampana(al, { ...wf, client_id: clientId, seco, ...(plan_id ? { plan_id } : {}) }, AHORA)
  expect([200, 201]).toContain(r.status)
  expect(r.cuerpo.ya_abierta).toBeUndefined()
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
  it('🔴 🟡 CC7: si el envío falla, la marca NO queda abierta y la corrida siguiente vuelve a intentar; cuando sale, recién ahí queda «ya avisada»', async () => {
    const al = mundo()
    const a = await campanaDe(al, A.clientId)
    al.falloDeAviso = 'Slack respondió 200 invalid_auth'
    expect((await fechasCobertura(al, pedir(a, 'Ecuador', 'Navidad', 'nacional'))).cuerpo.alarma).toBe('no_enviada')
    expect(al.alarmasDeFecha.size).toBe(0) // la marca se cerró: no calla la próxima
    expect((await fechasCobertura(al, pedir(a, 'Ecuador', 'Navidad', 'nacional', 2027))).cuerpo.alarma).toBe('no_enviada')
    expect(al.intentosDeAviso).toBe(2) // la segunda corrida SÍ volvió a intentar
    al.falloDeAviso = null
    expect((await fechasCobertura(al, pedir(a, 'Ecuador', 'Navidad', 'nacional'))).cuerpo.alarma).toBe('enviada')
    expect((await fechasCobertura(al, pedir(a, 'Ecuador', 'Navidad', 'nacional'))).cuerpo.alarma).toBe('ya_avisada')
    expect(al.alarmasEnviadas).toHaveLength(1)
    expect(al.intentosDeAviso).toBe(3)
    expect(al.marcasDeAlarma.filter((m) => m.cerrada)).toHaveLength(2) // las dos fallidas quedan en el historial, cerradas
  })
  it('🟡 CC7 en la base: el almacén usa el envío que confirma `ok` de Slack y devuelve su resultado (no el que se lo traga)', async () => {
    const alm = await leerRepo('../almacen-supabase.ts')
    expect(alm).toContain("import { avisarAAlertas } from '@/lib/portero-alimenta/avisos'")
    expect(alm).toContain('async avisarAlarma(texto) { return avisarAAlertas(')
    expect(alm).not.toContain("'@/lib/buzon-dueno/alertas'")
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
    // nota de CC7: el mes es palabra entera («mayo» no está dentro de «mayoría»)
    const planMayoria = 'La mayoría de clientes llega de diciembre a abril.'
    expect(temporadaRespaldada({ desde: '2026-12-01', hasta: '2027-05-31', cita_plan: 'La mayoría de clientes llega de diciembre a abril' }, planMayoria)).toMatchObject({ ok: false, motivo: expect.stringMatching(/meses/) })
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
    const otra = await campanaDe(al, A.clientId, false, 'plan-a2')
    const g2 = await guardarEstrategia(al, otra, e)
    expect((g2.cuerpo.temporadas as { preguntadas: string[] }).preguntadas).toEqual(['temporada_de_lluvias: tu misma pregunta sigue pendiente'])
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

// ─────────────────────────────────────────────────────────────── los 4 puntos de CC7 al diseño y lo que los sabotajes dejaron vivo
const leerRepo = async (rel: string) => { const { readFileSync } = await import('node:fs'); const { join } = await import('node:path'); return readFileSync(join(__dirname, rel), 'utf8') }
const MIGRACION = '../../../../supabase/migrations/202611102030_fechas_especiales_sin_configurar_y_temporadas.sql'

describe('puntos de CC7 al diseño (20:00Z)', () => {
  it('🔴 punto 1: el mismo feriado público guardado dos veces deja UNA fila; la misma temporada en dos clientes deja DOS', async () => {
    const al = mundo()
    const publica = { pais: 'ecuador', tipo: 'navidad', ambito: 'nacional', anio: 2026, fecha: '2026-12-25', nombre: 'Navidad', alcance: 'nacional', fuente_url: 'https://estado.ec/feriados', cita_literal: '25 de diciembre', pagina_hash: 'h', doble_fuente: false, estado: 'verificada' as const }
    await al.guardarFechaEspecial(publica)
    await al.guardarFechaEspecial({ ...publica, doble_fuente: true })
    expect(al.fechas).toHaveLength(1)
    const temporada = { ...publica, tipo: 'temporada_alta', fecha: '2026-12-01', hasta: '2027-01-15', origen: 'cliente' as const }
    await al.guardarFechaEspecial({ ...temporada, client_id: A.clientId })
    await al.guardarFechaEspecial({ ...temporada, client_id: B.clientId })
    await al.guardarFechaEspecial({ ...temporada, client_id: B.clientId })
    expect(al.fechas.filter((f) => f.tipo === 'temporada_alta').map((f) => f.client_id).sort()).toEqual([A.clientId, B.clientId].sort())
  })
  it('punto 1 en la base: la llave única va sobre `client_key` (cliente vacío = texto vacío) y el almacén guarda contra esa misma llave', async () => {
    const mig = await leerRepo(MIGRACION)
    expect(mig).toContain("client_key text GENERATED ALWAYS AS (coalesce(client_id, '')) STORED")
    expect(mig).toContain('CREATE UNIQUE INDEX cadena_fechas_unica ON public.cadena_fechas_especiales (pais, tipo, ambito, fecha, client_key)')
    const alm = await leerRepo('../almacen-supabase.ts')
    expect(alm).toContain("onConflict: 'pais,tipo,ambito,fecha,client_key'")
    expect(alm).not.toContain("onConflict: 'pais,tipo,ambito,fecha' ")
  })
  it('🔴 punto 2: las dos grafías van en orden de uso; la que se usó queda PRIMERA la vez siguiente, así dos corridas seguidas dan la MISMA llave', async () => {
    const al = mundo()
    al.coberturas.push(
      { pais: 'ecuador', tipo: 'temporada_alta_playa', ambito_clave: 'costa_ecuatoriana_(olon)', anio: 2026, estado: 'sin_fuente', intentos: 0, investigado_en: '2026-11-09T18:15:04Z' },
      { pais: 'ecuador', tipo: 'temporada_alta_de_playa', ambito_clave: 'olon', anio: 2026, estado: 'sin_fuente', intentos: 0, investigado_en: '2026-10-30T23:40:39Z' },
    )
    // la más reciente primero (como en la base de hoy: la del 09-nov)
    expect((await al.llavesDeFechas('Ecuador', A.clientId)).map((x) => x.llave)).toEqual(['temporada_alta_playa', 'temporada_alta_de_playa'])
    /** un agente que sigue la regla del pedido: si hay dos grafías de la misma fecha, la PRIMERA de la lista */
    const agenteQueSigueLaRegla = (tarea: string) => {
      const bloque = tarea.split('# LLAVES DE FECHAS QUE YA EXISTEN')[1]!.split('\n')[1]!
      const [llave, resto] = bloque.replace(/^- /, '').split(' · ámbito ')
      return { llave: llave!, ambito: resto!.split(' · ')[0]! }
    }
    const elegidas: string[] = []
    for (const plan of ['plan-a', 'plan-a2']) {
      const a = await campanaDe(al, A.clientId, false, plan)
      const p = await estrategiaPreparar(al, { ...wf, campana_id: a }, AHORA)
      const tarea = (p.cuerpo.run_sdk as { task: string }).task
      expect(tarea).toContain('usa la PRIMERA que aparece (la lista va de la usada más recientemente a la menos)')
      const { llave, ambito } = agenteQueSigueLaRegla(tarea)
      const g = await estrategiaGuardar(al, { ...wf, campana_id: a, corrida_id: p.cuerpo.corrida_id, resultado: { success: true, structured_output: conFechas(A.estrategia, [fecha({ tipo: 'temporada alta en la playa', llave, ambito, llave_nueva: false })]), cost_usd: 0.3 } }, AHORA)
      for (const f of g.cuerpo.fechas_pedidas as { pais: string; tipo: string; ambito: string; anio: number }[]) await fechasCobertura(al, { ...wf, campana_id: a, ...f })
      elegidas.push(llave)
    }
    expect(elegidas).toEqual(['temporada_alta_playa', 'temporada_alta_playa'])
    expect((await al.llavesDeFechas('Ecuador', A.clientId))[0]!.llave).toBe('temporada_alta_playa')
  })
  it('punto 2: el orden es estable (mismo insumo, misma lista) y lo que no tiene fecha va al final', async () => {
    const { ordenarLlaves } = await import('../fechas-del-cliente')
    const filas = [{ llave: 'b', ambito: 'x', cuando: null }, { llave: 'a', ambito: 'x', cuando: '2026-11-01' }, { llave: 'c', ambito: 'x', cuando: '2026-11-05' }, { llave: 'a', ambito: 'x', cuando: '2026-11-09' }, { llave: 'd', ambito: 'x', cuando: null }]
    expect(ordenarLlaves(filas).map((x) => x.llave)).toEqual(['a', 'c', 'b', 'd'])
    expect(ordenarLlaves([...filas].reverse()).map((x) => x.llave)).toEqual(['a', 'c', 'b', 'd'])
    expect(ordenarLlaves([{ llave: 'a', ambito: 'x', cuando: null }, { llave: 'a', ambito: 'x', clase: 'temporada_del_negocio', cuando: null }])).toEqual([{ llave: 'a', ambito: 'x', clase: 'temporada_del_negocio' }])
  })
  it('🔴 punto 3: «nueva» pero idéntica a una que existe (mayúsculas, espacios, tildes) → se toma como la existente y se investiga ESA', async () => {
    const al = mundo()
    al.coberturas.push({ pais: 'ecuador', tipo: 'temporada_alta_playa', ambito_clave: 'costa_ecuatoriana_(olon)', anio: 2026, estado: 'sin_fuente', intentos: 0 })
    const llaves = await al.llavesDeFechas('Ecuador', A.clientId)
    expect(llaveConocida({ tipo: 'x', llave: 'Temporada Alta  Playa', ambito: 'Costa Ecuatoriana (Olón)', llave_nueva: true }, llaves)).toEqual({ ok: true, existe: true })
    const a = await campanaDe(al, A.clientId)
    const g = await guardarEstrategia(al, a, conFechas(A.estrategia, [fecha({ tipo: 'Temporada alta en la playa', llave: 'Temporada Alta Playa', ambito: 'Costa Ecuatoriana (Olón)', llave_nueva: true })]))
    for (const f of g.cuerpo.fechas_pedidas as { pais: string; tipo: string; ambito: string; anio: number }[]) await fechasCobertura(al, { ...wf, campana_id: a, ...f })
    expect(al.coberturas.filter((c) => c.anio === 2026).map((c) => `${c.tipo}|${c.ambito_clave}`)).toEqual(['temporada_alta_playa|costa_ecuatoriana_(olon)'])
  })
  it('🔴 punto 4: la marca se CIERRA (queda el historial) y una alarma nueva abre otra; la base no necesita borrar', async () => {
    const al = mundo()
    const a = await campanaDe(al, A.clientId)
    await fechasCobertura(al, pedir(a, 'Ecuador', 'Navidad', 'nacional'))
    al.config.set('dominios_fechas', { '*|ecuador': ['https://estado.ec/feriados'] })
    await fechasCobertura(al, pedir(a, 'Ecuador', 'Navidad', 'nacional'))
    al.config.set('dominios_fechas', {})
    await fechasCobertura(al, pedir(a, 'Ecuador', 'Navidad', 'nacional', 2027))
    expect(al.marcasDeAlarma).toEqual([{ pais: 'ecuador', tipo: 'navidad', cerrada: true }, { pais: 'ecuador', tipo: 'navidad', cerrada: false }])
    const mig = await leerRepo(MIGRACION)
    expect(mig).toContain('GRANT SELECT, INSERT, UPDATE ON public.cadena_fechas_alarmas TO service_role;')
    expect(mig).not.toContain('DELETE ON public.cadena_fechas_alarmas')
    expect(mig).toContain('CREATE UNIQUE INDEX cadena_fechas_alarmas_una_abierta ON public.cadena_fechas_alarmas (pais, tipo) WHERE cerrada_en IS NULL')
    const alm = await leerRepo('../almacen-supabase.ts')
    expect(alm).not.toContain("from('cadena_fechas_alarmas').delete(")
  })
})

describe('lo que los sabotajes dejaron vivo', () => {
  it('un tramo al revés no pasa aunque la cita nombre los meses y los días', () => {
    const plan = 'La cosecha va del 10 de marzo al 20 de mayo.'
    expect(temporadaRespaldada({ desde: '2027-05-20', hasta: '2027-03-10', cita_plan: 'La cosecha va del 10 de marzo al 20 de mayo' }, plan)).toMatchObject({ ok: false, motivo: expect.stringMatching(/posterior/) })
  })
  it('una temporada con origen «plan» y sin cita NO lleva la estrategia a corrección (S02 no la exige): queda pendiente', async () => {
    const al = mundo()
    const a = await campanaDe(al, A.clientId)
    const g = await guardarEstrategia(al, a, conFechas(A.estrategia, [fecha({ tipo: 'temporada de lluvias', clase: 'temporada_del_negocio', ambito: 'centro', origen: 'plan', cita_plan: '' })]))
    expect(g.cuerpo.correccion).toBeUndefined()
    expect(g.cuerpo.ok).toBe(true)
    expect((g.cuerpo.temporadas as { pendientes: string[] }).pendientes).toHaveLength(1)
  })
  it('una clase que no es ninguna de las dos bloquea la forma (S01)', () => {
    const hs = validarEstrategia(conFechas(A.estrategia, [fecha({ tipo: 'black friday', clase: 'fecha_comercial' as never })]), { planTexto: A.planTexto, formatos: SIN_FORMATOS, llavesDeFechas: [] })
    expect(hs.some((h) => h.chequeo === 'S01' && h.severidad === 'bloquea' && /clase «fecha_comercial»/.test(h.ficha.que))).toBe(true)
  })
  it('🔴 la temporada guardada llega al calendario del MISMO cliente: una pieza que la menciona con su respaldo no se frena (V07); sin respaldo, sí', async () => {
    const al = mundo()
    const b = await campanaDe(al, B.clientId)
    const g = await guardarEstrategia(al, b, conFechas(B.estrategia, [fecha({ tipo: 'temporada alta de consultas', clase: 'temporada_del_negocio', ambito: 'unica', origen: 'plan', desde: '2026-12-01', hasta: '2027-01-15', cita_plan: TEMPORADA_B.replace(/\.$/, '') })]))
    expect(g.status).toBe(200)
    const id = al.fechas[0]!.id
    const { tandaBuena } = await import('../__fixtures__/clientes')
    const { validarSinEscribir } = await import('../index')
    const t = tandaBuena(B)
    t.piezas[0] = { ...t.piezas[0]!, tema: 'Llega la temporada alta de consultas', datos: [{ dato: 'fecha_especial', valor: 'temporada alta de consultas', clase: 'alto', ref: `fecha:${id}`, nivel: 'F0', opcional: false }] }
    // 11-nov (reglas rígidas #5): sin gran idea (palanca apagada) la tarea del calendario TAMBIÉN lista la fecha verificada con su `fecha:<id>` (si no, el agente no podría declararla)
    const { calendarioPreparar } = await import('../index')
    const pc = await calendarioPreparar(al, { ...wf, campana_id: b, tanda: 1 }, AHORA)
    expect(pc.status).toBe(200)
    expect((pc.cuerpo.run_sdk as { task: string }).task).toContain(`- fecha:${id} · 2026-12-01 → 2027-01-15 · `)
    const v07 = (r: { cuerpo: Record<string, unknown> }) => (r.cuerpo.hallazgos as { chequeo: string; severidad: string }[]).filter((h) => h.chequeo === 'V07' && h.severidad === 'bloquea')
    const r = await validarSinEscribir(al, { ...wf, campana_id: b, tipo: 'calendario', tanda: 1, tanda_agente: t }, AHORA)
    expect(r.status).toBe(200)
    expect(v07(r)).toEqual([])
    // 11-nov (reglas rígidas #5): «sin respaldo» = la fila declara una fecha que no está verificada; sin declarar, el código ya no adivina por palabras
    t.piezas[0] = { ...t.piezas[0]!, datos: [{ dato: 'fecha_especial', valor: 'temporada alta de consultas', clase: 'alto', ref: 'fecha:no-existe', nivel: 'F0', opcional: false }] }
    expect(v07(await validarSinEscribir(al, { ...wf, campana_id: b, tipo: 'calendario', tanda: 1, tanda_agente: t }, AHORA))).toHaveLength(1)
    t.piezas[0] = { ...t.piezas[0]!, datos: [] }
    expect(v07(await validarSinEscribir(al, { ...wf, campana_id: b, tipo: 'calendario', tanda: 1, tanda_agente: t }, AHORA))).toEqual([])
  })
})

describe('11-nov · arreglo genérico de CC7 · «sin fuente» dice qué páginas se descartaron y por qué', () => {
  it.each([['A · Ecuador', 'A'], ['B · Colombia', 'B']])('🔴 %s · sin páginas con texto: sin fuente, sin agente, y el motivo nombra cada descartada con su razón', async (_n, k) => {
    const al = mundo()
    const c = k === 'A' ? A : B
    const id = await campanaDe(al, c.clientId, true)
    const descartadas = [{ url: 'https://pdf.test/f.pdf', razon: 'no es texto (application/pdf)' }, { url: 'https://vacia.test/', razon: 'sin texto legible (0 caracteres)' }]
    const r = await fechasPreparar(al, { ...wf, campana_id: id, seco: true, pais: k === 'A' ? 'Ecuador' : 'Colombia', tipo: 'feriados nacionales', ambito: 'pais', anio: 2026, paginas: [], paginas_descartadas: descartadas }, AHORA)
    expect(r.status).toBe(200)
    expect(r.cuerpo).toMatchObject({ estado: 'sin_fuente', descartadas: ['https://pdf.test/f.pdf: no es texto (application/pdf)', 'https://vacia.test/: sin texto legible (0 caracteres)'] })
    expect(String(r.cuerpo.motivo)).toMatch(/^ninguna página descargada traía texto legible \(https:\/\/pdf\.test\/f\.pdf: no es texto \(application\/pdf\) · https:\/\/vacia\.test\/: sin texto legible \(0 caracteres\)\): no hay nada que extraer/)
    expect(al.corridas).toHaveLength(0) // no se abrió ninguna corrida: nadie llama al agente
  })
  it('sin descartadas (ninguna página bajó) el motivo es el de siempre y no trae la lista', async () => {
    const al = mundo()
    const id = await campanaDe(al, A.clientId, true)
    const r = await fechasPreparar(al, { ...wf, campana_id: id, seco: true, pais: 'Ecuador', tipo: 'feriados nacionales', ambito: 'pais', anio: 2026, paginas: [] }, AHORA)
    expect(r.cuerpo.motivo).toBe('no se pudo descargar ninguna página: no hay nada que extraer (el tipo queda sin fuente; la campaña sigue)')
    expect(r.cuerpo.descartadas).toBeUndefined()
  })
})
