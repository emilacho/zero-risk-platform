/**
 * LAS RESERVAS DE CC3 SOBRE T3 Y LA REENTRADA (31-oct · certificaciones de CC3) · pruebas que atan reglas que estaban escritas sin prueba, y dos decisiones nuevas.
 *  · reserva 1: la hoja por código (`hojaEscribir`): sin brief validado, sin gran idea, sin filas, por `fila_ids`, por `semana`, estados excluidos (T38–T41);
 *  · reserva 2: T24 (decidir sobre una versión que no está lista) · T28 (cambios al brief abren la versión del BRIEF) · T30 (el calendario toma el ÚLTIMO concepto aprobado) ·
 *    T31/T35/T37 (lead mínimo 1 día + holgura de 2 en el aviso de primera semana) · T03/T04 (`ig` y `youtube` encienden las condiciones) · I02 (la tanda solo trae los capítulos de sus fases);
 *  · reserva 3 (decisión): una versión mandada a cambios queda cerrada (ni se aprueba ni se vuelve a mandar a cambios: 409) · `siguiente.version` = última + 1;
 *  · reserva 5b: la palanca que no se puede leer está APAGADA por defecto;
 *  · reentrada N04 (`plazo_mesa_min` del sobre manda) · N12–N14 (qué texto vuelve al marco cuando la puerta reentra sobre un brief abierto).
 * Sin modelo, sin red, US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe, formatosDeLaMigracion } from '../__fixtures__/clientes'
import type { Campana, EstrategiaGuardada } from '../almacen'
import { leerConcepto } from '../conceptos'
import { tareaDeCalendario } from '../indicaciones'
import {
  avisoDePrimeraSemana, briefAbrir, conceptoAbrir, conceptoDecidir, conceptoParaElCalendario, condicionesDe, HOLGURA_DE_MESA_MIN, HOLGURA_DE_PRODUCCION_DIAS, hojaEscribir,
  leadDiasDeLaPrimeraSemana, MOTIVO_CAMBIOS_DE_EMILIO, nuevoOrdenEncendido, PLAZO_DE_MESA_MIN, recibirBrief, recibirConcepto,
} from '../mesas'
import type { Fila } from '../tipos'

const A = clienteA()
const CAMP = 'camp-1'
const AHORA = '2026-10-09T12:00:00Z'
const wf = (extra: Record<string, unknown> = {}) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', campana_id: CAMP, ...extra })

function almacen(extra: { palanca?: boolean; config?: Record<string, unknown> } = {}) {
  const al = new AlmacenMemoria({
    contextos: { [A.clientId]: contextoDe(A) },
    planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
    config: { flujos: ['wf-cadena'], puerta_workflow_id: 'wf-puerta', estado_cadena: 'ensayo', clientes_ensayo: [A.clientId], nuevo_orden: { clientes: extra.palanca === false ? [] : [A.clientId] }, ...(extra.config ?? {}) },
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

const BRIEF_BUENO = [
  '## De qué parte del plan sale', 'Fase 1: «Se publican 3 posts por semana en Instagram y 1 en Facebook».',
  '## Insight', 'La gente del barrio desayuna de pie porque cree que no hay dónde sentarse antes de las ocho.',
  '## Mensaje', 'Hay mesa desde las siete.',
  '## Objetivo', 'Que entren 30 desayunos nuevos por semana.', '- instagram: que miren el pan recién salido · «ven a desayunar»', '- facebook: que guarden el horario · «guarda el horario»',
  '## Tono', 'Cercano y directo, sin exclamaciones.',
  '## Obligatorios', '- vocabulario: pan de masa madre; mesa larga', '- prohibido: barato; gratis', '- lo que no se dice: precios',
  '## Faltantes', '- público: el manual no dice edades',
  '## Contradicciones plan vs manual', '- ninguna',
].join('\n')
const BRIEF_MALO = BRIEF_BUENO.replace('«Se publican 3 posts por semana en Instagram y 1 en Facebook»', '«esta frase no está en el plan de nadie»')
const CONCEPTO_BUENO = [
  '## Gran idea  La mesa larga · Noventa días para sentarse juntos',
  '## Por qué funciona  El insight del brief dice que la gente desayuna de pie; la idea lo convierte en costumbre.',
  '## Cómo se ve  Luz cálida, madera, manos sobre la mesa.',
  '## Cómo suena  Voz cercana, frases cortas.',
  '## Capítulo f1 · Abrir la mesa', 'Qué cuenta: la mesa se abre · Objetivo de la fase (cita): «presentar» · Cómo se ve en este capítulo: planos cerrados',
  '## Banco de ideas',
  '- C1-I01 · instagram · carrusel · la primera silla · mensaje: aquí siempre hay una silla para ti · gancho: ¿quién se sentaba aquí? · protagonista: la silla · serie: ninguna · foto:ninguna',
  '- C1-I02 · instagram · foto · la mesa a las 7 · mensaje: la mesa se llena de a poco · gancho: mira lo que pasa en dos horas · protagonista: la mesa · serie: ninguna · foto:ninguna',
  '- C1-I03 · facebook · foto · la silla que nadie usa · mensaje: ninguna silla sobra · gancho: esta silla lleva un mes vacía · protagonista: la silla · serie: ninguna · foto:ninguna',
  '## Caminos descartados y por qué', '- «El plato del día»: habla del producto, no de la mesa',
].join('\n')
const CONCEPTO_V2 = CONCEPTO_BUENO.replace('La mesa larga · Noventa días para sentarse juntos', 'La silla de siempre · Noventa días con tu lugar reservado')

const entrega = (version: number, texto: string | null, extra: Record<string, unknown> = {}) => ({ campana_id: CAMP, version, encargo_id: `enc-${version}`, texto, costo_usd: 0.1, motivo: null, ...extra })
async function conBriefValidado(al: AlmacenMemoria) {
  expect((await briefAbrir(al, wf(), AHORA)).status).toBe(200)
  expect(await recibirBrief(al, entrega(1, BRIEF_BUENO), AHORA)).toMatchObject({ ok: true, estado: 'validada' })
}
async function conConceptoListo(al: AlmacenMemoria, version = 1, texto = CONCEPTO_BUENO) {
  const a = await conceptoAbrir(al, wf(version > 1 ? { nota: 'otra vuelta' } : {}), AHORA)
  expect(a.status, JSON.stringify(a.cuerpo)).toBe(200)
  expect(await recibirConcepto(al, entrega(version, texto), AHORA)).toMatchObject({ ok: true, estado: 'lista' })
}
async function conGranIdeaAprobada(al: AlmacenMemoria) {
  await conBriefValidado(al)
  await conConceptoListo(al)
  expect((await conceptoDecidir(al, wf({ decision: 'aprobar' }), AHORA)).status).toBe(200)
}
const fila = (o: Partial<Fila> & { id: string }): Fila => ({
  tanda: 1, semana: 1, dia_semana: 1, fecha: '2026-10-12', hora: '12:00', red: 'instagram', formato: 'foto', pilar: 'menu', tema: 'tema', sede: 'centro', requiere_abierto: false, depende_de: [], datos: [], pendientes: [], pieza_fija: null,
  origen: 'agente', estado: 'validada', avisos: [], fase: 'f1', idea_ref: 'C1-I01', ...o,
})

// ───────────────────────────────────────────────────────── reserva 1 · la hoja por código
describe('reserva 1 · POST /api/cadena/hojas {escribir} (hojaEscribir)', () => {
  it('🔴 T38 · sin brief validado: 409 E-SIN-BRIEF · sin gran idea aprobada: 409 E-SIN-CONCEPTO (nada se escribe)', async () => {
    const al = almacen()
    expect((await hojaEscribir(al, wf({ semana: 1 }), AHORA)).cuerpo.code).toBe('E-SIN-BRIEF')
    await conBriefValidado(al)
    expect((await hojaEscribir(al, wf({ semana: 1 }), AHORA)).cuerpo.code).toBe('E-SIN-CONCEPTO')
    await conConceptoListo(al) // lista pero NO aprobada: tampoco
    expect((await hojaEscribir(al, wf({ semana: 1 }), AHORA)).cuerpo.code).toBe('E-SIN-CONCEPTO')
  })
  it('🔴 T40 · sin fila_ids ni semana: 400 · sin filas que coincidan: 409 E-SIN-FILAS (nunca ok vacío)', async () => {
    const al = almacen()
    await conGranIdeaAprobada(al)
    expect((await hojaEscribir(al, wf(), AHORA)).status).toBe(400)
    expect((await hojaEscribir(al, wf({ semana: 1 }), AHORA)).cuerpo.code).toBe('E-SIN-FILAS')
    await al.guardarFilas(CAMP, 1, 1, [fila({ id: 'f-s2', semana: 2 })])
    expect((await hojaEscribir(al, wf({ semana: 1 }), AHORA)).cuerpo.code).toBe('E-SIN-FILAS')
    expect((await hojaEscribir(al, wf({ fila_ids: ['no-existe'] }), AHORA)).cuerpo.code).toBe('E-SIN-FILAS')
  })
  it('T41 · por `semana` toma SOLO las filas de esa semana; por `fila_ids` solo las pedidas; la hoja trae un brief por fila y las versiones de brief y concepto', async () => {
    const al = almacen()
    await conGranIdeaAprobada(al)
    await al.guardarFilas(CAMP, 1, 1, [fila({ id: 'f-s1-a', semana: 1 }), fila({ id: 'f-s1-b', semana: 1, idea_ref: 'C1-I02' }), fila({ id: 'f-s2', semana: 2, fecha: '2026-10-19' })])
    const porSemana = await hojaEscribir(al, wf({ semana: 1 }), AHORA)
    expect(porSemana.status, JSON.stringify(porSemana.cuerpo)).toBe(200)
    expect(porSemana.cuerpo).toMatchObject({ filas: ['f-s1-a', 'f-s1-b'], brief_version: 1, concepto_version: 1 })
    expect((porSemana.cuerpo.briefs as unknown[]).length).toBe(2)
    expect(porSemana.cuerpo.hoja).toContain('f-s1-a')
    expect(porSemana.cuerpo.hoja).not.toContain('f-s2')
    const porIds = await hojaEscribir(al, wf({ fila_ids: ['f-s2'] }), AHORA)
    expect(porIds.cuerpo).toMatchObject({ filas: ['f-s2'] })
  })
  it('🔴 T39 · las filas canceladas, descartadas, vencidas, en espera de video y de esquema NO van a la hoja', async () => {
    const al = almacen()
    await conGranIdeaAprobada(al)
    const fuera: Fila['estado'][] = ['esquema', 'cancelada', 'espera_video', 'vencida_sin_brazo', 'perdio_su_fecha', 'descartada_sin_fuente']
    await al.guardarFilas(CAMP, 1, 1, [fila({ id: 'f-ok' }), ...fuera.map((estado) => fila({ id: `f-${estado}`, estado }))])
    const r = await hojaEscribir(al, wf({ semana: 1 }), AHORA)
    expect(r.cuerpo.filas).toEqual(['f-ok'])
    // pedirlas por id tampoco las cuela
    expect((await hojaEscribir(al, wf({ fila_ids: ['f-cancelada'] }), AHORA)).cuerpo.code).toBe('E-SIN-FILAS')
  })
})

// ───────────────────────────────────────────────────────── reserva 2 · reglas sin prueba
describe('reserva 2 · la decisión y el calendario', () => {
  it('🔴 T24 · decidir sobre una versión que no está lista (abierta) es 409 aunque otra versión sí lo esté', async () => {
    const al = almacen()
    await conBriefValidado(al)
    await conConceptoListo(al)
    await conceptoDecidir(al, wf({ decision: 'cambios', apunta_a: 'concepto', nota: 'más cerca' }), AHORA)
    expect((await conceptoAbrir(al, wf(), AHORA)).status).toBe(200) // v2 abierta
    const r = await conceptoDecidir(al, wf({ decision: 'aprobar', version: 2 }), AHORA)
    expect(r.status).toBe(409)
    expect(r.cuerpo.code).toBe('E-SIN-TARJETA')
    expect(JSON.stringify(r.cuerpo)).toMatch(/versión 2 del concepto no está lista para decidir \(abierta\)/)
    expect(al.conceptos.find((c) => c.version === 2)?.aprobacion ?? null).toBeNull()
  })
  it('🔴 T28 · cambios que apuntan al BRIEF: el brief validado queda devuelto por Emilio (motivo cambios_de_emilio, su nota) y `siguiente` es la mesa del brief versión 2, no el concepto', async () => {
    const al = almacen()
    await conBriefValidado(al)
    await conConceptoListo(al)
    const r = await conceptoDecidir(al, wf({ decision: 'cambios', apunta_a: 'brief', nota: 'el mensaje no es ese' }), AHORA)
    expect(r.status).toBe(200)
    expect(r.cuerpo.siguiente).toMatchObject({ mesa: 'brief', version: 2 })
    const brief = al.briefsCreativos.find((b) => b.version === 1)!
    expect(brief).toMatchObject({ estado: 'devuelta', motivo: MOTIVO_CAMBIOS_DE_EMILIO, devolucion_texto: 'el mensaje no es ese' })
    // la puerta, al volver a entrar sin nota, abre el brief 2 con la nota de Emilio como CAMBIOS (no como DEVOLUCIÓN por código) y no cuenta como reapertura
    const abre = await briefAbrir(al, wf(), AHORA)
    expect(abre.status).toBe(200)
    expect(abre.cuerpo.version).toBe(2)
    const marco = (abre.cuerpo.sobre as { marco_texto: string }).marco_texto
    expect(marco).toContain('# CAMBIOS PEDIDOS POR EL CLIENTE\nel mensaje no es ese')
    expect(marco).not.toContain('# DEVOLUCIÓN')
  })
  it('🔴 T30 · el calendario toma el ÚLTIMO concepto aprobado («lo aprobado manda»); un cambio de rumbo sobre el aprobado lo retira y el calendario ESPERA la vuelta nueva (no vuelve a la idea retirada)', async () => {
    const al = almacen()
    await conGranIdeaAprobada(al)
    expect((await conceptoParaElCalendario(al, al.campanas[0])).version).toBe(1)
    // cambio de rumbo sobre la v1 aprobada: la v1 deja de mandar; falta el concepto nuevo
    expect((await conceptoDecidir(al, wf({ decision: 'cambios', apunta_a: 'concepto', nota: 'otra silla' }), AHORA)).status).toBe(200)
    expect(await conceptoParaElCalendario(al, al.campanas[0])).toMatchObject({ concepto: null, version: null, espera: { falta: 'concepto', version: 1, aprobacion: 'cambios' } })
    await conConceptoListo(al, 2, CONCEPTO_V2)
    const m = await conceptoParaElCalendario(al, al.campanas[0])
    expect(m).toMatchObject({ concepto: null, version: null, espera: { falta: 'aprobacion', version: 2, estado: 'lista' } })
    expect((await conceptoDecidir(al, wf({ decision: 'aprobar', version: 2 }), AHORA)).status).toBe(200)
    const m2 = await conceptoParaElCalendario(al, al.campanas[0])
    expect(m2.version).toBe(2)
    expect(m2.concepto?.gran_idea?.nombre).toBe('La silla de siempre')
  })
  it('T31/T35/T37 · el lead de la primera semana es el mayor lead_dias del patrón (mínimo 1) y el aviso aparece solo cuando faltan ≤ lead + 2 días de holgura', async () => {
    const al = almacen()
    const formatos = formatosDeLaMigracion()
    const lead = leadDiasDeLaPrimeraSemana(A.estrategia, formatos)
    expect(lead).toBeGreaterThanOrEqual(1)
    expect(leadDiasDeLaPrimeraSemana({ patron_semanal: [] }, formatos)).toBe(1)
    expect(leadDiasDeLaPrimeraSemana({ patron_semanal: [{ ...A.estrategia.patron_semanal[0], formato: 'formato-sin-fila' }] }, formatos)).toBe(1)
    expect(HOLGURA_DE_PRODUCCION_DIAS).toBe(2)
    const c = al.campanas[0]
    const dia = (n: number) => new Date(Date.parse(`${c.fecha_inicio}T00:00:00Z`) - n * 86_400_000).toISOString()
    expect(await avisoDePrimeraSemana(al, c, dia(lead + HOLGURA_DE_PRODUCCION_DIAS + 1))).toBeNull()
    expect(await avisoDePrimeraSemana(al, c, dia(lead + HOLGURA_DE_PRODUCCION_DIAS))).toMatch(new RegExp(`necesitan ${lead} día\\(s\\) de producción más 2 de holgura y faltan ${lead + 2} día\\(s\\)`))
    expect(await avisoDePrimeraSemana(al, c, dia(-1))).toMatch(/la campaña ya empezó/)
  })
  it('T03/T04 · `ig` enciende si_instagram y `youtube` (o `tiktok`) enciende si_video aunque el patrón no traiga video', () => {
    const sin = { patron_semanal: [] as never[] }
    expect(condicionesDe({ canales: [{ red: 'ig', rol: 'principal' }], ...sin } as never)).toEqual(['si_instagram'])
    expect(condicionesDe({ canales: [{ red: 'youtube', rol: 'replica' }], ...sin } as never)).toEqual(['si_video'])
    expect(condicionesDe({ canales: [{ red: 'tiktok', rol: 'principal' }], ...sin } as never)).toEqual(['si_video'])
    expect(condicionesDe({ canales: [{ red: 'youtube', rol: 'no' }], ...sin } as never)).toEqual([])
  })
  it('I02 · la tarea de la tanda trae SOLO los capítulos (y bancos) de las fases que caen en sus semanas', () => {
    const estrategia = { ...A.estrategia, fases: [{ clave: 'f1', dia_desde: 1, dia_hasta: 28, objetivo: 'presentar', cita_plan: 'x' }, { clave: 'f2', dia_desde: 29, dia_hasta: 90, objetivo: 'convertir', cita_plan: 'y' }] }
    const leido = leerConcepto([
      '## Gran idea  La mesa larga · Noventa días', '## Cómo se ve  Luz.',
      '## Capítulo f1 · Abrir la mesa', 'Qué cuenta: se abre', '## Banco de ideas',
      '- C1-I01 · instagram · foto · la primera silla · mensaje: m1 · gancho: g1 · protagonista: p · serie: ninguna · foto:ninguna',
      '## Capítulo f2 · Llenar la mesa', 'Qué cuenta: se llena', '## Banco de ideas',
      '- C2-I01 · instagram · foto · la mesa llena · mensaje: m2 · gancho: g2 · protagonista: p · serie: ninguna · foto:ninguna',
    ].join('\n'), { fases: [{ clave: 'f1', semanas: 4 }, { clave: 'f2', semanas: 9 }], redes: [{ red: 'instagram', huecos_por_semana: 1 }], prohibidas: [], fotos: [] })
    expect(leido.estado).toBe('ok')
    const base = { ctx: contextoDe(A), estrategia, filasPrevias: [], concepto: { leido, version: 1 } }
    const t1 = tareaDeCalendario({ ...base, tanda: 1, semanas: [1, 2, 3, 4] })
    expect(t1).toContain('# CAPÍTULO f1 · Abrir la mesa (días 1–28)')
    expect(t1).toContain('- C1-I01 ')
    expect(t1).not.toContain('# CAPÍTULO f2')
    expect(t1).not.toContain('- C2-I01 ')
    const t2 = tareaDeCalendario({ ...base, tanda: 2, semanas: [5, 6, 7, 8] })
    expect(t2).toContain('# CAPÍTULO f2 · Llenar la mesa (días 29–90)')
    expect(t2).not.toContain('# CAPÍTULO f1')
    // la semana 4 termina el día 28 y la 5 empieza el 29: una tanda que cruza la frontera trae los dos
    const cruza = tareaDeCalendario({ ...base, tanda: 1, semanas: [3, 4, 5, 6] })
    expect(cruza).toContain('# CAPÍTULO f1')
    expect(cruza).toContain('# CAPÍTULO f2')
  })
})

// ───────────────────────────────────────────────────────── reserva 3 · decisión final por versión
describe('reserva 3 · una versión mandada a cambios queda cerrada', () => {
  it('🔴 «aprobar» (o «cambios» otra vez) sobre una versión ya mandada a cambios: 409 E-YA-DECIDIDO; la tarjeta rechazada no cambia; la decisión va sobre la siguiente', async () => {
    const al = almacen()
    await conBriefValidado(al)
    await conConceptoListo(al)
    expect((await conceptoDecidir(al, wf({ decision: 'cambios', apunta_a: 'concepto', nota: 'más cerca' }), AHORA)).status).toBe(200)
    const tarjetas = al.tarjetas.map((t) => t.status)
    for (const cuerpo of [{ decision: 'aprobar', version: 1 }, { decision: 'cambios', apunta_a: 'concepto', nota: 'otra', version: 1 }]) {
      const r = await conceptoDecidir(al, wf(cuerpo), AHORA)
      expect(r.status).toBe(409)
      expect(r.cuerpo.code).toBe('E-YA-DECIDIDO')
    }
    expect(al.conceptos.find((c) => c.version === 1)).toMatchObject({ aprobacion: 'cambios', nota_de_emilio: 'más cerca' })
    expect(al.tarjetas.map((t) => t.status)).toEqual(tarjetas)
    // la siguiente sí se decide
    await conConceptoListo(al, 2, CONCEPTO_V2)
    expect((await conceptoDecidir(al, wf({ decision: 'aprobar' }), AHORA)).status).toBe(200)
  })
  it('🔴 cambios sobre una versión APROBADA que no es la última: `siguiente.version` es la última + 1 (no choca con una versión existente)', async () => {
    const al = almacen()
    await conGranIdeaAprobada(al) // v1 aprobada
    expect((await conceptoDecidir(al, wf({ decision: 'cambios', apunta_a: 'concepto', nota: 'rumbo nuevo' }), AHORA)).status).toBe(200) // v1 → cambios
    await conConceptoListo(al, 2, CONCEPTO_V2) // v2 lista
    // v1 ya está en cambios: cerrada. Pero una v2 aprobada y luego cambios sobre ella con una v3 abierta de por medio…
    expect((await conceptoDecidir(al, wf({ decision: 'aprobar', version: 2 }), AHORA)).status).toBe(200)
    // ...no: lo que puede pasar es cambios sobre la v2 aprobada cuando la mesa ya abrió la v3 por otra vía; simulamos la v3 abierta
    expect((await conceptoAbrir(al, wf({ nota: 'tercera' }), AHORA)).cuerpo.version).toBe(3)
    const r = await conceptoDecidir(al, wf({ decision: 'cambios', apunta_a: 'concepto', nota: 'cambio sobre la v2 aprobada', version: 2 }), AHORA)
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200)
    expect(r.cuerpo.siguiente).toMatchObject({ mesa: 'concepto', version: 4 })
  })
})

// ───────────────────────────────────────────────────────── reserva 5b · palanca apagada por defecto
describe('reserva 5b · la palanca que no se puede leer está apagada', () => {
  it('🔴 si `leerConfig` lanza, nuevoOrdenEncendido es false y el calendario de hoy no espera a ninguna mesa', async () => {
    const al = almacen()
    const original = al.leerConfig.bind(al)
    al.leerConfig = async (k: string) => { if (k === 'nuevo_orden') throw new Error('base caída'); return original(k) }
    expect(await nuevoOrdenEncendido(al, A.clientId)).toBe(false)
    expect(await conceptoParaElCalendario(al, al.campanas[0])).toEqual({ concepto: null, version: null, espera: null })
    expect((await briefAbrir(al, wf(), AHORA)).cuerpo.code).toBe('E-NUEVO-ORDEN-APAGADO')
  })
})

// ───────────────────────────────────────────────────────── reentrada · N04 · N12–N14
describe('reentrada · el plazo del sobre y el marco que vuelve', () => {
  it('N04 · `plazo_mesa_min` del sobre manda sobre el de omisión: plazo_en = ahora + plazo + holgura, y se devuelve el que se usó', async () => {
    const al = almacen()
    const r = await briefAbrir(al, wf({ plazo_mesa_min: 45 }), AHORA)
    expect(r.cuerpo.plazo_mesa_min).toBe(45)
    expect(al.briefsCreativos[0].plazo_en).toBe(new Date(Date.parse(AHORA) + (45 + HOLGURA_DE_MESA_MIN) * 60_000).toISOString())
    expect(PLAZO_DE_MESA_MIN.brief).not.toBe(45)
    await recibirBrief(al, entrega(1, BRIEF_BUENO), AHORA)
    const c = await conceptoAbrir(al, wf({ plazo_mesa_min: 7 }), AHORA)
    expect(c.cuerpo.plazo_mesa_min).toBe(7)
    expect(al.conceptos[0].plazo_en).toBe(new Date(Date.parse(AHORA) + (7 + HOLGURA_DE_MESA_MIN) * 60_000).toISOString())
    // un plazo inválido (0, negativo, texto) cae al de omisión
    const al2 = almacen()
    expect((await briefAbrir(al2, wf({ plazo_mesa_min: 0 }), AHORA)).cuerpo.plazo_mesa_min).toBe(PLAZO_DE_MESA_MIN.brief)
  })
  it('N12 · la puerta reentra sobre un brief v2 abierto tras una DEVOLUCIÓN por código: el marco trae la devolución de la v1 (no la de la v2 ni como cambios)', async () => {
    const al = almacen()
    expect((await briefAbrir(al, wf(), AHORA)).status).toBe(200)
    expect(await recibirBrief(al, entrega(1, BRIEF_MALO), AHORA)).toMatchObject({ ok: true, estado: 'devuelta' })
    expect((await briefAbrir(al, wf(), AHORA)).cuerpo.version).toBe(2)
    const re = await briefAbrir(al, wf(), AHORA)
    expect(re.cuerpo.ya_abierta).toBe(true)
    const marco = (re.cuerpo.sobre as { marco_texto: string }).marco_texto
    expect(marco).toContain('# DEVOLUCIÓN (la versión anterior se devolvió por esto; corrígelo, no lo discutas)\n' + al.briefsCreativos[0].devolucion_texto)
    expect(marco).not.toContain('# CAMBIOS PEDIDOS POR EL CLIENTE')
    expect(marco).toContain('(versión 2)')
  })
  it('N13 · la puerta reentra sobre un brief v2 abierto tras CAMBIOS DE EMILIO: el marco trae la nota como cambios, nunca como devolución', async () => {
    const al = almacen()
    await conBriefValidado(al)
    await conConceptoListo(al)
    await conceptoDecidir(al, wf({ decision: 'cambios', apunta_a: 'brief', nota: 'quiero el pan protagonista' }), AHORA)
    expect((await briefAbrir(al, wf(), AHORA)).cuerpo.version).toBe(2)
    const re = await briefAbrir(al, wf(), AHORA)
    expect(re.cuerpo.ya_abierta).toBe(true)
    const marco = (re.cuerpo.sobre as { marco_texto: string }).marco_texto
    expect(marco).toContain('# CAMBIOS PEDIDOS POR EL CLIENTE\nquiero el pan protagonista')
    expect(marco).not.toContain('# DEVOLUCIÓN')
  })
  it('N14 · la puerta reentra sobre un brief v1 abierto (sin versión previa): el marco no trae devolución ni cambios; y el «previo» es exactamente la versión anterior', async () => {
    const al = almacen()
    expect((await briefAbrir(al, wf(), AHORA)).status).toBe(200)
    const re = await briefAbrir(al, wf(), AHORA)
    expect(re.cuerpo.ya_abierta).toBe(true)
    const marco = (re.cuerpo.sobre as { marco_texto: string }).marco_texto
    expect(marco).not.toContain('# DEVOLUCIÓN')
    expect(marco).not.toContain('# CAMBIOS PEDIDOS POR EL CLIENTE')
    // v1 devuelta, v2 devuelta, v3 abierta con nota de Emilio: el previo es la v2 (la nota), no la v1 (devolución por código)
    const al3 = almacen()
    await briefAbrir(al3, wf(), AHORA)
    await recibirBrief(al3, entrega(1, BRIEF_MALO), AHORA)
    await briefAbrir(al3, wf(), AHORA)
    await recibirBrief(al3, entrega(2, BRIEF_BUENO), AHORA)
    await conConceptoListo(al3)
    await conceptoDecidir(al3, wf({ decision: 'cambios', apunta_a: 'brief', nota: 'nota sobre la v2' }), AHORA)
    expect((await briefAbrir(al3, wf(), AHORA)).cuerpo.version).toBe(3)
    const marco3 = ((await briefAbrir(al3, wf(), AHORA)).cuerpo.sobre as { marco_texto: string }).marco_texto
    expect(marco3).toContain('# CAMBIOS PEDIDOS POR EL CLIENTE\nnota sobre la v2')
    expect(marco3).not.toContain('# DEVOLUCIÓN')
  })
})
