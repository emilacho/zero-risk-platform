/**
 * T3 (31-oct) · lo que las mesas le hacen al CALENDARIO y al RELOJ, y lo que NO le hacen a la cadena de hoy.
 *  · palanca apagada = la cadena de hoy (v1, sin secciones nuevas, filas sin fase/idea_ref, ninguna espera nueva);
 *  · palanca encendida: la tanda espera la gran idea aprobada (`esperar_concepto` con qué falta); con ella la tarea trae GRAN IDEA · CAPÍTULO · BANCO · FECHAS y la salida es v2;
 *    las filas llevan `fase` e `idea_ref` (una idea que no está en el banco se declara);
 *  · el reloj: la aprobación NO vence (se rearma cada 72 h y la decisión nunca es del tiempo); UN aviso «perderá su primera semana»; la mesa de concepto vencida queda sin_mesa.
 */
import { describe, expect, it } from 'vitest'
import { abrirCampana, calendarioGuardar, calendarioPreparar, estrategiaGuardar, estrategiaPreparar, relojDeLaCadena } from '../index'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe, tandaBuena } from '../__fixtures__/clientes'
import { HORAS_DE_REARME } from '../esperas'
import { tareaDeCalendario } from '../indicaciones'
import { briefAbrir, conceptoAbrir, conceptoDecidir, recibirBrief, recibirConcepto, TIPO_DE_ESPERA_DE_CONCEPTO } from '../mesas'

const A = clienteA()
const AHORA = '2026-10-09T12:00:00Z'
const wf = (extra: Record<string, unknown> = {}) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', ...extra })
const VIG = { workflow_id: 'wf-vigia', workflow_execution_id: 'v1' }
const horas = (iso: string, h: number) => new Date(Date.parse(iso) + h * 3_600_000).toISOString()

function almacen(palanca: boolean, config: Record<string, unknown> = {}) {
  return new AlmacenMemoria({
    contextos: { [A.clientId]: contextoDe(A) },
    planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
    config: { flujos: ['wf-cadena', 'wf-vigia'], puerta_workflow_id: 'wf-puerta', estado_cadena: 'ensayo', clientes_ensayo: [A.clientId], nuevo_orden: { clientes: palanca ? [A.clientId] : [] }, ...config },
    journeys: [{ journeyId: 'journey-1', clientId: A.clientId }],
  })
}
const ok = (o: unknown, costo = 0.3) => ({ success: true, structured_output: o, cost_usd: costo })
async function conEstrategia(al: AlmacenMemoria) {
  const c = await abrirCampana(al, { ...wf(), client_id: A.clientId, seco: true }, AHORA)
  const id = (c.cuerpo.campana as { id: string }).id
  const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
  const g = await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: ok(A.estrategia) }, AHORA)
  expect(g.status, JSON.stringify(g.cuerpo)).toBe(200)
  return id
}
const BRIEF = [
  '## De qué parte del plan sale', 'Fase 1: «Se publican 3 posts por semana en Instagram y 1 en Facebook».',
  '## Insight', 'La gente del barrio desayuna de pie porque cree que no hay dónde sentarse antes de las ocho.',
  '## Mensaje', 'Hay mesa desde las siete.',
  '## Objetivo', 'Que entren 30 desayunos nuevos por semana.', '- instagram: que miren el pan · «ven a desayunar»', '- facebook: que guarden el horario · «guarda el horario»',
  '## Tono', 'Cercano y directo.',
  '## Obligatorios', '- vocabulario: pan de masa madre; mesa larga', '- prohibido: barato; gratis', '- lo que no se dice: precios',
  '## Faltantes', '- público: el manual no dice edades',
  '## Contradicciones plan vs manual', '- ninguna',
].join('\n')
const CONCEPTO = [
  '## Gran idea  La mesa larga · Noventa días para sentarse juntos',
  '## Por qué funciona  La gente desayuna de pie; la idea lo convierte en costumbre.',
  '## Cómo se ve  Luz cálida, madera.',
  '## Cómo suena  Voz cercana.',
  '## Capítulo f1 · Abrir la mesa', 'Qué cuenta: la mesa se abre · Objetivo de la fase (cita): «presentar» · Cómo se ve en este capítulo: planos cerrados',
  '## Banco de ideas',
  '- C1-I01 · instagram · foto · la primera silla · mensaje: aquí siempre hay una silla para ti · gancho: ¿quién se sentaba aquí? · protagonista: la silla · serie: ninguna · foto:ninguna',
  '- C1-I02 · facebook · foto · la silla que nadie usa · mensaje: ninguna silla sobra · gancho: esta silla lleva un mes vacía · protagonista: la silla · serie: ninguna · foto:ninguna',
].join('\n')
const entrega = (campana_id: string, version: number, texto: string) => ({ campana_id, version, encargo_id: `enc-${version}`, texto, costo_usd: 0.1, motivo: null })
async function conGranIdeaAprobada(al: AlmacenMemoria, id: string) {
  expect((await briefAbrir(al, wf({ campana_id: id }), AHORA)).status).toBe(200)
  expect(await recibirBrief(al, entrega(id, 1, BRIEF), AHORA)).toEqual({ ok: true, estado: 'validada' })
  expect((await conceptoAbrir(al, wf({ campana_id: id }), AHORA)).status).toBe(200)
  expect(await recibirConcepto(al, entrega(id, 1, CONCEPTO), AHORA)).toEqual({ ok: true, estado: 'lista' })
  expect((await conceptoDecidir(al, wf({ campana_id: id, decision: 'aprobar' }), AHORA)).status).toBe(200)
}

describe('palanca apagada = la cadena de hoy', () => {
  it('🔴 el calendario no espera a ninguna mesa, la salida es calendario_tanda.v1, la tarea no trae las secciones nuevas y las filas no llevan fase ni idea_ref', async () => {
    const al = almacen(false)
    const id = await conEstrategia(al)
    const p = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1 }, AHORA)
    expect(p.status).toBe(200)
    expect(p.cuerpo.accion).toBeUndefined()
    expect(p.cuerpo.concepto_version).toBeUndefined()
    const rs = p.cuerpo.run_sdk as { task: string; metadata?: Record<string, unknown> } & Record<string, unknown>
    expect(JSON.stringify(rs)).toContain('calendario_tanda.v1')
    expect(rs.task).not.toMatch(/GRAN IDEA|CAPÍTULO|BANCO DE IDEAS|FECHAS ESPECIALES|Idioma de todo/)
    expect(JSON.stringify(p.cuerpo)).not.toContain('idea_de_mesa')
    const g = await calendarioGuardar(al, { ...wf(), campana_id: id, tanda: 1, corrida_id: p.cuerpo.corrida_id, resultado: ok({ ...tandaBuena(A), piezas: tandaBuena(A).piezas.map((x) => ({ ...x, idea_de_mesa: 'C1-I01' })) }) }, AHORA)
    expect(g.status).toBe(200)
    expect(al.filasGuardadas.length).toBeGreaterThan(0)
    for (const f of al.filasGuardadas) { expect('fase' in f).toBe(false); expect('idea_ref' in f).toBe(false) }
    expect(al.esperas.some((e) => e.objeto_tipo === TIPO_DE_ESPERA_DE_CONCEPTO)).toBe(false)
    expect(al.conceptos).toHaveLength(0)
  })
  it('la tarea del calendario sin concepto no cambia de forma; con idioma en la ficha solo agrega la regla de idioma', () => {
    const base = { ctx: contextoDe(A), estrategia: A.estrategia, tanda: 1, semanas: [1, 2, 3, 4], filasPrevias: [] }
    const t = tareaDeCalendario(base)
    expect(t).toBe(tareaDeCalendario({ ...base, concepto: undefined, fechasEspeciales: undefined }))
    expect(t).not.toMatch(/Idioma de todo|GRAN IDEA/)
    const conIdioma = tareaDeCalendario({ ...base, ctx: { ...base.ctx, idioma: 'english' } })
    expect(conIdioma).toContain('- Idioma de todo lo que escribas: english.')
    expect(conIdioma.replace('\n- Idioma de todo lo que escribas: english. Si el manual del cliente fija otro idioma, manda el manual. Respeta el trato (tú, vos, usted u otro) que fije el manual; nunca lo cambies.', '')).toBe(t)
  })
})

describe('palanca encendida: el calendario espera la gran idea', () => {
  it('sin brief: esperar_concepto (falta brief) · con brief sin concepto: falta concepto · con concepto sin decidir: falta aprobacion · aprobada: v2 con GRAN IDEA, CAPÍTULO, BANCO y FECHAS', async () => {
    const al = almacen(true)
    const id = await conEstrategia(al)
    const paso = async () => calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1 }, AHORA)
    expect((await paso()).cuerpo).toMatchObject({ accion: 'esperar_concepto', tanda: 1, falta: 'brief', version: null })
    expect(al.corridas.filter((c) => c.paso === 'calendario')).toHaveLength(0)
    await briefAbrir(al, wf({ campana_id: id }), AHORA)
    await recibirBrief(al, entrega(id, 1, BRIEF), AHORA)
    expect((await paso()).cuerpo).toMatchObject({ accion: 'esperar_concepto', falta: 'concepto' })
    await conceptoAbrir(al, wf({ campana_id: id }), AHORA)
    expect((await paso()).cuerpo).toMatchObject({ accion: 'esperar_concepto', falta: 'entrega', version: 1, estado: 'abierta' })
    await recibirConcepto(al, entrega(id, 1, CONCEPTO), AHORA)
    expect((await paso()).cuerpo).toMatchObject({ accion: 'esperar_concepto', falta: 'aprobacion', version: 1, estado: 'lista', aprobacion: 'pendiente' })
    await conceptoDecidir(al, wf({ campana_id: id, decision: 'aprobar' }), AHORA)
    const p = await paso()
    expect(p.status).toBe(200)
    expect(p.cuerpo.accion).toBeUndefined()
    expect(p.cuerpo.concepto_version).toBe(1)
    const rs = p.cuerpo.run_sdk as { task: string }
    expect(JSON.stringify(rs)).toContain('calendario_tanda.v2')
    expect(JSON.stringify(rs)).toContain('idea_de_mesa')
    expect(rs.task).toContain('# GRAN IDEA (concepto aprobado · versión 1)\nLa mesa larga · Noventa días para sentarse juntos')
    expect(rs.task).toContain('# CAPÍTULO f1 · Abrir la mesa (días 1–30)')
    expect(rs.task).toContain('# BANCO DE IDEAS DEL CAPÍTULO f1\n- C1-I01 · instagram · foto · la primera silla · mensaje: aquí siempre hay una silla para ti · gancho: ¿quién se sentaba aquí?')
    expect(rs.task).toContain('# FECHAS ESPECIALES (verificadas por el código)\n(ninguna declarada para esta campaña)')
    // las filas: fase por el día de campaña, idea_ref si la idea está en el banco; la que no está se declara y queda sin idea
    const piezas = tandaBuena(A).piezas.map((x, i) => ({ ...x, idea_de_mesa: i === 0 ? 'C1-I01' : i === 1 ? 'C9-I99' : '' }))
    const g = await calendarioGuardar(al, { ...wf(), campana_id: id, tanda: 1, corrida_id: p.cuerpo.corrida_id, resultado: ok({ piezas, ajustes_al_patron: [] }) }, AHORA)
    expect(g.status, JSON.stringify(g.cuerpo)).toBe(200)
    const tanda1 = al.filasGuardadas.filter((f) => f.tanda === 1 && f.estado !== 'esquema')
    expect(tanda1.length).toBeGreaterThan(2)
    expect(tanda1.every((f) => f.fase === 'f1')).toBe(true)
    const conIdea = tanda1.filter((f) => f.idea_ref === 'C1-I01')
    expect(conIdea).toHaveLength(1)
    const declarada = tanda1.find((f) => f.avisos.some((a) => a.includes('«C9-I99» no está en el banco')))
    expect(declarada?.idea_ref).toBeNull()
  })
})

describe('el reloj y la gran idea', () => {
  it('🔴 la aprobación NO vence: a las 72 h el reloj se REARMA (otra espera igual), re-avisa, y el concepto sigue pendiente; la decisión nunca es del tiempo', async () => {
    const al = almacen(true)
    const id = await conEstrategia(al)
    await briefAbrir(al, wf({ campana_id: id }), AHORA)
    await recibirBrief(al, entrega(id, 1, BRIEF), AHORA)
    await conceptoAbrir(al, wf({ campana_id: id }), AHORA)
    await recibirConcepto(al, entrega(id, 1, CONCEPTO), AHORA)
    const vivas = () => al.esperas.filter((e) => e.objeto_tipo === TIPO_DE_ESPERA_DE_CONCEPTO && e.estado === 'viva')
    expect(vivas()).toHaveLength(1)
    const t1 = horas(AHORA, HORAS_DE_REARME + 1)
    const r1 = await relojDeLaCadena(al, VIG, t1)
    expect(r1.cuerpo.aplicado).toContain('aprobacion_concepto concepto:v1: reloj rearmado')
    expect(vivas()).toHaveLength(1)
    expect(vivas()[0].vence_en).toBe(new Date(Date.parse(t1) + HORAS_DE_REARME * 3_600_000).toISOString())
    expect(al.esperas.filter((e) => e.objeto_tipo === TIPO_DE_ESPERA_DE_CONCEPTO)).toHaveLength(2)
    expect(al.conceptos[0]).toMatchObject({ estado: 'lista', aprobacion: 'pendiente' })
    expect(al.campanas[0].estado).toBe('calendario')
    const lineas = (r1.cuerpo.alertas as { campana_id: string; lineas: string[] }[]).find((a) => a.campana_id === id)?.lineas ?? []
    expect(lineas.some((l) => l.includes('sigue esperando la decisión de Emilio'))).toBe(true)
    // una pasada más dentro de la ventana: nada que rearmar; a las 146 h, otra vez
    expect((await relojDeLaCadena(al, VIG, horas(AHORA, HORAS_DE_REARME + 2))).cuerpo.aplicado).not.toContain('aprobacion_concepto concepto:v1: reloj rearmado')
    const r3 = await relojDeLaCadena(al, VIG, horas(AHORA, 2 * HORAS_DE_REARME + 2))
    expect(r3.cuerpo.aplicado).toContain('aprobacion_concepto concepto:v1: reloj rearmado')
    expect(vivas()).toHaveLength(1)
    // aprobar resuelve la espera viva
    await conceptoDecidir(al, wf({ campana_id: id, decision: 'aprobar' }), horas(AHORA, 200))
    expect(vivas()).toHaveLength(0)
  })
  it('UN aviso de estado «perderá su primera semana» cuando ya no alcanza el lead de producción; con las alertas enviadas no se repite mientras diga lo mismo', async () => {
    const al = almacen(true, { alertas_en_ensayo: 'enviar' })
    const id = await conEstrategia(al)
    await briefAbrir(al, wf({ campana_id: id }), AHORA)
    await recibirBrief(al, entrega(id, 1, BRIEF), AHORA)
    await conceptoAbrir(al, wf({ campana_id: id }), AHORA)
    await recibirConcepto(al, entrega(id, 1, CONCEPTO), AHORA)
    // la campaña arranca el 2026-10-12 y «hoy» es el 9: faltan 3 días → en riesgo
    const r1 = await relojDeLaCadena(al, VIG, horas(AHORA, 1))
    const l1 = (r1.cuerpo.alertas as { campana_id: string; lineas: string[] }[]).find((a) => a.campana_id === id)?.lineas ?? []
    expect(l1.some((l) => l.includes('perderá su primera semana') && l.includes('2026-10-12'))).toBe(true)
    const r2 = await relojDeLaCadena(al, VIG, horas(AHORA, 2))
    const l2 = (r2.cuerpo.alertas as { campana_id: string; lineas: string[] }[]).find((a) => a.campana_id === id)?.lineas ?? []
    expect(l2.some((l) => l.includes('perderá su primera semana'))).toBe(false)
    // con mucho tiempo por delante no hay aviso
    al.campanas[0].fecha_inicio = '2026-12-01'
    const r3 = await relojDeLaCadena(al, VIG, horas(AHORA, 3))
    expect(JSON.stringify(r3.cuerpo.alertas)).not.toContain('perderá su primera semana')
  })
  it('la mesa de concepto que pasa su red de seguridad sin entregar queda sin_mesa (la campaña sigue); dos veces ⇒ necesita_humano', async () => {
    const al = almacen(true)
    const id = await conEstrategia(al)
    await briefAbrir(al, wf({ campana_id: id }), AHORA)
    await recibirBrief(al, entrega(id, 1, BRIEF), AHORA)
    const a1 = await conceptoAbrir(al, wf({ campana_id: id }), AHORA)
    expect(a1.status).toBe(200)
    expect((await relojDeLaCadena(al, VIG, horas(AHORA, 1))).cuerpo.aplicado).not.toContain(`mesa de concepto vencida en ${id}`)
    const r = await relojDeLaCadena(al, VIG, horas(AHORA, 3))
    expect(r.cuerpo.aplicado).toContain(`mesa de concepto vencida en ${id}`)
    expect(al.conceptos[0]).toMatchObject({ estado: 'sin_mesa' })
    expect(al.conceptos[0].motivo).toMatch(/no entregó antes de su plazo/)
    expect(al.campanas[0].estado).toBe('calendario')
    expect((await conceptoAbrir(al, wf({ campana_id: id }), horas(AHORA, 3))).cuerpo.version).toBe(2)
    await relojDeLaCadena(al, VIG, horas(AHORA, 6))
    expect(al.conceptos[1].estado).toBe('sin_mesa')
    expect(al.campanas[0].estado).toBe('necesita_humano')
  })
})
