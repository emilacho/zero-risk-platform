/**
 * LAS MESAS DE LA CADENA (T3 · 31-oct) · abrir · recibir · decidir, contra el almacén en memoria. Sin modelo, sin red, US$ 0.
 * Lo que fija: la palanca apagada no tiene mesas; el sobre que va a la oficina; «la primera entrega que cierra gana»; reapertura UNA vez;
 * la gran idea abre tarjeta + espera que no vence; aprobar/cambios con cap de 2 vueltas; el puerto en proceso nunca lanza.
 */
import { describe, expect, it } from 'vitest'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../__fixtures__/clientes'
import { ACCIONES } from '../acciones'
import type { Campana, EstrategiaGuardada } from '../almacen'
import { HORAS_DE_REARME } from '../esperas'
import { briefAbrir, CAP_DE_VUELTAS_DE_CAMBIOS, conceptoAbrir, conceptoDecidir, condicionesDe, HOLGURA_DE_MESA_MIN, PLAZO_DE_MESA_MIN, puertoDeLaCadena, recibirBrief, recibirConcepto, TIPO_DE_ESPERA_DE_CONCEPTO } from '../mesas'

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

// cita LITERAL del plan del cliente A · redes de la estrategia (instagram principal · facebook réplica) · prohibidas del manual (barato · gratis)
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
const SIN_GRAN_IDEA = '## Cómo se ve  Luz cálida.\n## Banco de ideas\n- C1-I01 · instagram · foto · algo · mensaje: m · gancho: g · protagonista: p · serie: ninguna · foto:ninguna'

const entrega = (version: number, texto: string | null, extra: Record<string, unknown> = {}) => ({ campana_id: CAMP, version, encargo_id: `enc-${version}`, texto, costo_usd: 0.1, motivo: null, ...extra })

async function conBriefValidado(al: AlmacenMemoria) {
  expect((await briefAbrir(al, wf(), AHORA)).status).toBe(200)
  expect(await recibirBrief(al, entrega(1, BRIEF_BUENO), AHORA)).toMatchObject({ ok: true, estado: 'validada' })
}
async function conConceptoListo(al: AlmacenMemoria, version = 1) {
  const a = await conceptoAbrir(al, wf(version > 1 ? { nota: 'otra vuelta' } : {}), AHORA)
  expect(a.status, JSON.stringify(a.cuerpo)).toBe(200)
  expect(await recibirConcepto(al, entrega(version, CONCEPTO_BUENO), AHORA)).toMatchObject({ ok: true, estado: 'lista' })
}

describe('la palanca y la autorización', () => {
  it('🔴 con nuevo_orden apagado para el cliente no hay mesas (409) · la cadena de hoy no cambia', async () => {
    const al = almacen({ palanca: false })
    const r = await briefAbrir(al, wf(), AHORA)
    expect(r.status).toBe(409)
    expect(r.cuerpo.code).toBe('E-NUEVO-ORDEN-APAGADO')
    expect(al.briefsCreativos).toHaveLength(0)
    expect((await conceptoAbrir(al, wf(), AHORA)).cuerpo.code).toBe('E-NUEVO-ORDEN-APAGADO')
  })
  it('sin workflow_id/workflow_execution_id: 400 · campaña inexistente: 404 · sin estrategia validada: 409', async () => {
    const al = almacen()
    expect((await briefAbrir(al, { campana_id: CAMP }, AHORA)).status).toBe(400)
    expect((await briefAbrir(al, wf({ campana_id: 'no-existe' }), AHORA)).status).toBe(404)
    al.estrategias[0].estado = 'borrador'
    expect((await briefAbrir(al, wf(), AHORA)).cuerpo.code).toBe('E-SIN-ESTRATEGIA')
  })
  it('las condiciones salen del plan de canales: instagram enciende si_instagram · un canal con rol «no» no enciende nada · video solo si el patrón lo trae', () => {
    expect(condicionesDe(A.estrategia)).toEqual(['si_instagram'])
    const conReel = { ...A.estrategia, patron_semanal: [...A.estrategia.patron_semanal, { ...A.estrategia.patron_semanal[0], slot: 'z', formato: 'reel' }] }
    expect(condicionesDe(conReel)).toEqual(['si_instagram', 'si_video'])
    expect(condicionesDe({ canales: [{ red: 'facebook', rol: 'principal' }, { red: 'tiktok', rol: 'no' }], patron_semanal: [] } as never)).toEqual([])
  })
})

describe('la mesa del brief', () => {
  it('abrir crea la versión 1 en borrador y devuelve el SOBRE para la oficina (tipo brief · dry_run de la campaña · marco con plan y prohibidas · condiciones)', async () => {
    const al = almacen()
    const r = await briefAbrir(al, wf(), AHORA)
    expect(r.status).toBe(200)
    expect(r.cuerpo).toMatchObject({ version: 1, brief_id: expect.stringMatching(/^brf-/), plazo_mesa_min: PLAZO_DE_MESA_MIN.brief })
    const sobre = r.cuerpo.sobre as Record<string, unknown>
    expect(sobre).toMatchObject({ tipo_de_mesa: 'brief', client_id: A.clientId, campana_id: CAMP, version: 1, dry_run: true, condiciones: ['si_instagram'] })
    expect(sobre.marco_texto).toContain('# PLAN')
    expect(sobre.marco_texto).toContain(A.planTexto)
    expect(sobre.marco_texto).toContain('- barato')
    expect(sobre.marco_texto).not.toContain('DEVOLUCIÓN')
    expect(al.briefsCreativos).toEqual([expect.objectContaining({ campana_id: CAMP, version: 1, estado: 'borrador', seco: true })])
    // abrir otra vez con la mesa abierta: no duplica
    expect((await briefAbrir(al, wf(), AHORA)).cuerpo).toMatchObject({ ya_abierta: true, version: 1 })
    expect(al.briefsCreativos).toHaveLength(1)
  })
  it('la entrega buena queda validada con lo leído · la segunda entrega sobre la misma versión contesta ya_cerrada · abrir después dice ya_hecha', async () => {
    const al = almacen()
    await conBriefValidado(al)
    expect(al.briefsCreativos[0]).toMatchObject({ estado: 'validada', texto_md: BRIEF_BUENO, costo_usd: 0.1, encargo_id: 'enc-1', devolucion_texto: null })
    expect((al.briefsCreativos[0].leido as { mensaje: string }).mensaje).toBe('Hay mesa desde las siete.')
    expect(await recibirBrief(al, entrega(1, BRIEF_MALO), AHORA)).toEqual({ ok: true, ya_cerrada: true, estado: 'validada' })
    expect(al.briefsCreativos[0].texto_md).toBe(BRIEF_BUENO)
    expect((await briefAbrir(al, wf(), AHORA)).cuerpo).toMatchObject({ ya_hecha: true, version: 1 })
  })
  it('🔴 una versión que la cadena no tiene abierta no se recibe (ok:false, sin escribir)', async () => {
    const al = almacen()
    await briefAbrir(al, wf(), AHORA)
    const r = await recibirBrief(al, entrega(2, BRIEF_BUENO), AHORA)
    expect(r.ok).toBe(false)
    expect(al.briefsCreativos[0].estado).toBe('borrador')
    expect((await recibirBrief(al, entrega(1, BRIEF_BUENO, { campana_id: 'otra' }), AHORA)).ok).toBe(false)
  })
  it('la entrega que no pasa el lector se DEVUELVE con los puntos; reabrir lleva la DEVOLUCIÓN al marco (v2); una segunda devolución = necesita_humano; una tercera apertura = brief_agotado', async () => {
    const al = almacen()
    await briefAbrir(al, wf(), AHORA)
    expect(await recibirBrief(al, entrega(1, BRIEF_MALO), AHORA)).toMatchObject({ ok: true, estado: 'devuelta' })
    expect(al.briefsCreativos[0].devolucion_texto).toMatch(/no se encuentra literal en el plan/)
    expect(al.campanas[0].estado).toBe('calendario')
    const r2 = await briefAbrir(al, wf(), AHORA)
    expect(r2.cuerpo.version).toBe(2)
    expect((r2.cuerpo.sobre as { marco_texto: string }).marco_texto).toContain('# DEVOLUCIÓN')
    expect((r2.cuerpo.sobre as { marco_texto: string }).marco_texto).toContain('no se encuentra literal en el plan')
    expect(await recibirBrief(al, entrega(2, BRIEF_MALO), AHORA)).toMatchObject({ ok: true, estado: 'devuelta' })
    expect(al.campanas[0].estado).toBe('necesita_humano')
    expect(al.campanas[0].estado_motivo).toMatch(/dos veces/)
    const r3 = await briefAbrir(al, wf(), AHORA)
    expect(r3.status).toBe(409)
    expect(r3.cuerpo.error).toBe('brief_agotado')
    expect(al.briefsCreativos).toHaveLength(2)
  })
  it('sin texto (la mesa falló o venció) la versión queda descartada con el motivo; dos descartes = necesita_humano', async () => {
    const al = almacen()
    await briefAbrir(al, wf(), AHORA)
    expect(await recibirBrief(al, entrega(1, null, { motivo: 'tope de la mesa' }), AHORA)).toMatchObject({ ok: true, estado: 'descartada' })
    expect(al.briefsCreativos[0]).toMatchObject({ estado: 'descartada', motivo: 'tope de la mesa', texto_md: null })
    expect(al.campanas[0].estado).toBe('calendario')
    await briefAbrir(al, wf(), AHORA)
    expect(await recibirBrief(al, entrega(2, '   '), AHORA)).toMatchObject({ ok: true, estado: 'descartada' })
    expect(al.campanas[0].estado).toBe('necesita_humano')
  })
  it('con nota de Emilio (cambios) se abre una versión nueva aunque la última esté validada, y la nota va al marco', async () => {
    const al = almacen()
    await conBriefValidado(al)
    const r = await briefAbrir(al, wf({ nota: 'menos pan, más mesa' }), AHORA)
    expect(r.cuerpo.version).toBe(2)
    expect((r.cuerpo.sobre as { marco_texto: string }).marco_texto).toContain('# CAMBIOS PEDIDOS POR EL CLIENTE\nmenos pan, más mesa')
  })
  it('el informe de mercado, si el flujo lo trae, va al marco rotulado como PROPUESTA (no dato del cliente)', async () => {
    const al = almacen()
    const r = await briefAbrir(al, wf({ informe_de_mercado: 'Señal 1: los vecinos desayunan antes de las 7.' }), AHORA)
    expect((r.cuerpo.sobre as { marco_texto: string }).marco_texto).toMatch(/# INFORME DE MERCADO \(PROPUESTA · no es dato del cliente[^\n]*\nSeñal 1/)
  })
})

describe('la mesa de concepto', () => {
  it('🔴 sin brief validado no se abre (409 E-SIN-BRIEF)', async () => {
    const al = almacen()
    expect((await conceptoAbrir(al, wf(), AHORA)).cuerpo.code).toBe('E-SIN-BRIEF')
    await briefAbrir(al, wf(), AHORA)
    expect((await conceptoAbrir(al, wf(), AHORA)).cuerpo.code).toBe('E-SIN-BRIEF')
  })
  it('abrir crea la versión 1 abierta con red de seguridad (plazo + holgura) y devuelve el sobre con el brief validado en el marco', async () => {
    const al = almacen()
    await conBriefValidado(al)
    const r = await conceptoAbrir(al, wf(), AHORA)
    expect(r.status).toBe(200)
    expect(r.cuerpo).toMatchObject({ version: 1, concepto_id: expect.stringMatching(/^con-/), brief_version: 1, plazo_mesa_min: PLAZO_DE_MESA_MIN.concepto })
    const sobre = r.cuerpo.sobre as Record<string, unknown>
    expect(sobre).toMatchObject({ tipo_de_mesa: 'concepto', version: 1, dry_run: true, condiciones: ['si_instagram'] })
    expect(sobre.marco_texto).toContain('# BRIEF CREATIVO DE LA CAMPAÑA (validado)\n' + BRIEF_BUENO)
    expect(sobre.marco_texto).toContain('- f1: días 1–30')
    expect(al.conceptos[0]).toMatchObject({ version: 1, estado: 'abierta', aprobacion: null, plazo_en: new Date(Date.parse(AHORA) + (PLAZO_DE_MESA_MIN.concepto + HOLGURA_DE_MESA_MIN) * 60_000).toISOString() })
    expect((await conceptoAbrir(al, wf(), AHORA)).cuerpo).toMatchObject({ ya_abierta: true, version: 1 })
    expect(al.conceptos).toHaveLength(1)
  })
  it('la gran idea entregada queda LISTA con aprobación pendiente · abre la espera que no vence y la tarjeta en la bandeja (origen cadena · tipo concepto)', async () => {
    const al = almacen()
    await conBriefValidado(al)
    await conConceptoListo(al)
    const c = al.conceptos[0]
    expect(c).toMatchObject({ estado: 'lista', aprobacion: 'pendiente', texto_md: CONCEPTO_BUENO, costo_usd: 0.1, hitl_id: 'hitl-1' })
    expect((c.leido as { gran_idea: { nombre: string } }).gran_idea.nombre).toBe('La mesa larga')
    const espera = al.esperas.find((e) => e.objeto_tipo === TIPO_DE_ESPERA_DE_CONCEPTO)
    // la espera NO vence sola: su «vence_en» es el REARME a 72 h (regla seguir_esperando · el reloj re-avisa, nunca decide)
    expect(espera).toMatchObject({ campana_id: CAMP, objeto_id: 'concepto:v1', estado: 'viva', vence_en: new Date(Date.parse(AHORA) + HORAS_DE_REARME * 3_600_000).toISOString() })
    expect(al.tarjetas).toHaveLength(1)
    expect(al.tarjetas[0]).toMatchObject({ client_id: A.clientId, campana_id: CAMP, version: 1, status: 'pending', seco: true })
    expect(al.tarjetas[0].titulo).toMatch(/^Gran idea · La mesa larga/)
    expect(al.tarjetas[0].metadata).toMatchObject({ origen: 'cadena', tipo: 'concepto', campana_id: CAMP, version: 1, concepto_id: expect.stringMatching(/^con-/), brief_version: 1, vueltas_restantes: CAP_DE_VUELTAS_DE_CAMBIOS })
    // la segunda entrega sobre la misma versión no pisa nada
    expect(await recibirConcepto(al, entrega(1, SIN_GRAN_IDEA), AHORA)).toEqual({ ok: true, ya_cerrada: true, estado: 'lista' })
    expect(al.conceptos[0].texto_md).toBe(CONCEPTO_BUENO)
    expect(al.tarjetas).toHaveLength(1)
    expect((await conceptoAbrir(al, wf(), AHORA)).cuerpo).toMatchObject({ ya_hecha: true, version: 1, aprobacion: 'pendiente' })
  })
  it('sin gran idea o sin texto: sin_mesa (se reabre UNA vez); la segunda vez necesita_humano y la tercera apertura dice concepto_agotado', async () => {
    const al = almacen()
    await conBriefValidado(al)
    await conceptoAbrir(al, wf(), AHORA)
    expect(await recibirConcepto(al, entrega(1, SIN_GRAN_IDEA), AHORA)).toMatchObject({ ok: true, estado: 'sin_mesa' })
    expect(al.conceptos[0].motivo).toMatch(/sin_concepto/)
    expect(al.tarjetas).toHaveLength(0)
    expect(al.campanas[0].estado).toBe('calendario')
    expect((await conceptoAbrir(al, wf(), AHORA)).cuerpo.version).toBe(2)
    expect(await recibirConcepto(al, entrega(2, null, { motivo: 'venció la mesa' }), AHORA)).toMatchObject({ ok: true, estado: 'sin_mesa' })
    expect(al.campanas[0].estado).toBe('necesita_humano')
    const r = await conceptoAbrir(al, wf(), AHORA)
    expect(r.status).toBe(409)
    expect(r.cuerpo.error).toBe('concepto_agotado')
  })
  it('«Devolución del brief» desde la dirección: el concepto queda brief_devuelto y el brief vuelve a devuelta con ese texto', async () => {
    const al = almacen()
    await conBriefValidado(al)
    await conceptoAbrir(al, wf(), AHORA)
    expect(await recibirConcepto(al, entrega(1, '## Devolución del brief\n- el insight no se sostiene', { brief_devuelto: '- el insight no se sostiene' }), AHORA)).toMatchObject({ ok: true, estado: 'brief_devuelto' })
    expect(al.conceptos[0]).toMatchObject({ estado: 'brief_devuelto', brief_devuelto: '- el insight no se sostiene' })
    expect(al.briefsCreativos[0]).toMatchObject({ estado: 'devuelta', devolucion_texto: '- el insight no se sostiene' })
    expect(al.campanas[0].estado).toBe('calendario')
    // el brief v2 lleva la devolución; el concepto se vuelve a abrir solo cuando haya brief validado
    expect((await conceptoAbrir(al, wf(), AHORA)).cuerpo.code).toBe('E-SIN-BRIEF')
    const b2 = await briefAbrir(al, wf(), AHORA)
    expect(b2.cuerpo.version).toBe(2)
    expect((b2.cuerpo.sobre as { marco_texto: string }).marco_texto).toContain('el insight no se sostiene')
  })
})

describe('la decisión de Emilio sobre la gran idea', () => {
  it('aprobar: aprobación aprobada · espera resuelta · tarjeta approved · evento registrado · repetir dice ya_decidido', async () => {
    const al = almacen()
    await conBriefValidado(al)
    await conConceptoListo(al)
    const r = await conceptoDecidir(al, wf({ decision: 'aprobar', autor: 'emilio' }), AHORA)
    expect(r.status).toBe(200)
    expect(r.cuerpo).toMatchObject({ decision: 'aprobar', version: 1 })
    expect(al.conceptos[0]).toMatchObject({ aprobacion: 'aprobado', decidido_en: AHORA, apunta_a: null })
    expect(al.esperas.find((e) => e.objeto_tipo === TIPO_DE_ESPERA_DE_CONCEPTO)?.estado).toBe('resuelta')
    expect(al.tarjetas[0]).toMatchObject({ status: 'approved', decision: { accion: 'aprobar', version: 1 } })
    expect(al.eventosDeEmilio).toEqual([expect.objectContaining({ hitl_id: 'hitl-1', accion: 'aprobar', autor: 'emilio', comentario: null })])
    expect((await conceptoDecidir(al, wf({ decision: 'aprobar' }), AHORA)).cuerpo).toMatchObject({ ya_decidido: true })
    expect(al.eventosDeEmilio).toHaveLength(1)
  })
  it('🔴 decidir exige decision válida, una versión lista y, para cambios, apunta_a + nota', async () => {
    const al = almacen()
    await conBriefValidado(al)
    expect((await conceptoDecidir(al, wf({ decision: 'aprobar' }), AHORA)).cuerpo.code).toBe('E-SIN-TARJETA')
    await conConceptoListo(al)
    expect((await conceptoDecidir(al, wf({ decision: 'rechazar' }), AHORA)).cuerpo.code).toBe('E-DECISION')
    expect((await conceptoDecidir(al, wf({ decision: 'cambios', nota: 'x' }), AHORA)).cuerpo.code).toBe('E-APUNTA-A')
    expect((await conceptoDecidir(al, wf({ decision: 'cambios', apunta_a: 'concepto' }), AHORA)).cuerpo.code).toBe('E-NOTA')
    expect((await conceptoDecidir(al, { campana_id: CAMP, decision: 'aprobar' }, AHORA)).status).toBe(400)
    expect(al.conceptos[0].aprobacion).toBe('pendiente')
  })
  it('cambios al concepto: versión n+1 con la nota en el marco · tarjeta rejected · cap de 2 vueltas y a la tercera necesita_humano', async () => {
    const al = almacen()
    await conBriefValidado(al)
    await conConceptoListo(al)
    const r1 = await conceptoDecidir(al, wf({ decision: 'cambios', apunta_a: 'concepto', nota: 'más barrio, menos mesa' }), AHORA)
    expect(r1.status).toBe(200)
    expect(r1.cuerpo).toMatchObject({ decision: 'cambios', version: 1, apunta_a: 'concepto', siguiente: { mesa: 'concepto', version: 2 }, vueltas_restantes: 1 })
    expect(al.conceptos[0]).toMatchObject({ aprobacion: 'cambios', apunta_a: 'concepto', nota_de_emilio: 'más barrio, menos mesa' })
    expect(al.tarjetas[0]).toMatchObject({ status: 'rejected', decision: { accion: 'pedir_cambios', apunta_a: 'concepto' } })
    expect(al.eventosDeEmilio[0]).toMatchObject({ accion: 'pedir_cambios', comentario: 'más barrio, menos mesa' })
    const a2 = await conceptoAbrir(al, wf({ nota: 'más barrio, menos mesa' }), AHORA)
    expect(a2.cuerpo.version).toBe(2)
    expect((a2.cuerpo.sobre as { marco_texto: string }).marco_texto).toContain('# CAMBIOS PEDIDOS POR EL CLIENTE (sobre la versión anterior)\nmás barrio, menos mesa')
    expect(await recibirConcepto(al, entrega(2, CONCEPTO_BUENO), AHORA)).toMatchObject({ ok: true, estado: 'lista' })
    expect(al.tarjetas[1].metadata).toMatchObject({ version: 2, vueltas_restantes: 1 })
    const r2 = await conceptoDecidir(al, wf({ decision: 'cambios', apunta_a: 'concepto', nota: 'otra vez' }), AHORA)
    expect(r2.cuerpo).toMatchObject({ siguiente: { mesa: 'concepto', version: 3 }, vueltas_restantes: 0 })
    await conConceptoListo(al, 3)
    const r3 = await conceptoDecidir(al, wf({ decision: 'cambios', apunta_a: 'concepto', nota: 'y otra' }), AHORA)
    expect(r3.status).toBe(409)
    expect(r3.cuerpo.error).toBe('vueltas_agotadas')
    expect(al.campanas[0].estado).toBe('necesita_humano')
    expect(al.conceptos[2].aprobacion).toBe('pendiente')
    // la aprobación a mano sigue valiendo
    expect((await conceptoDecidir(al, wf({ decision: 'aprobar' }), AHORA)).status).toBe(200)
  })
  it('cambios al brief: el siguiente paso es la mesa del brief (versión 2) y el concepto nuevo vendrá sobre ese brief', async () => {
    const al = almacen()
    await conBriefValidado(al)
    await conConceptoListo(al)
    const r = await conceptoDecidir(al, wf({ decision: 'cambios', apunta_a: 'brief', nota: 'el mensaje no es ese' }), AHORA)
    expect(r.cuerpo).toMatchObject({ siguiente: { mesa: 'brief', version: 2 } })
    const b2 = await briefAbrir(al, wf({ nota: 'el mensaje no es ese' }), AHORA)
    expect(b2.cuerpo.version).toBe(2)
  })
  it('cambios sobre un concepto YA aprobado se aceptan (cambio de rumbo): versión n+1, la aprobada queda en el historial', async () => {
    const al = almacen()
    await conBriefValidado(al)
    await conConceptoListo(al)
    await conceptoDecidir(al, wf({ decision: 'aprobar' }), AHORA)
    const r = await conceptoDecidir(al, wf({ decision: 'cambios', apunta_a: 'concepto', nota: 'cambió el rumbo' }), AHORA)
    expect(r.status).toBe(200)
    expect(al.conceptos[0].aprobacion).toBe('cambios')
    expect((await conceptoAbrir(al, wf({ nota: 'cambió el rumbo' }), AHORA)).cuerpo.version).toBe(2)
  })
})

describe('el puerto en proceso y las entregas por HTTP', () => {
  it('el puerto que recibe la oficina nunca lanza: campaña inexistente ⇒ ok:false con error; un fallo del almacén ⇒ ok:false', async () => {
    const al = almacen()
    const P = puertoDeLaCadena(al, () => AHORA)
    expect(await P.entregarBrief(entrega(1, BRIEF_BUENO, { campana_id: 'nadie' }))).toEqual({ ok: false, error: 'campaña inexistente' })
    al.campana = async () => { throw new Error('la base se cayó') }
    expect(await P.entregarConcepto(entrega(1, CONCEPTO_BUENO))).toEqual({ ok: false, error: 'la base se cayó' })
  })
  it('el puerto entrega igual que la función: brief validada y concepto lista', async () => {
    const al = almacen()
    await briefAbrir(al, wf(), AHORA)
    const P = puertoDeLaCadena(al, () => AHORA)
    expect(await P.entregarBrief(entrega(1, BRIEF_BUENO))).toMatchObject({ ok: true, estado: 'validada' })
    await conceptoAbrir(al, wf(), AHORA)
    expect(await P.entregarConcepto(entrega(1, CONCEPTO_BUENO))).toMatchObject({ ok: true, estado: 'lista' })
    expect(al.tarjetas).toHaveLength(1)
  })
  it('por HTTP (acciones brief/entregar · concepto/entregar) se exige el contexto de flujo y se lee el cuerpo', async () => {
    const al = almacen()
    await briefAbrir(al, wf(), AHORA)
    expect((await ACCIONES.brief.entregar(al, { campana_id: CAMP, version: 1, texto: BRIEF_BUENO }, AHORA)).status).toBe(400)
    expect((await ACCIONES.brief.entregar(al, wf({ version: 0, texto: BRIEF_BUENO }), AHORA)).status).toBe(400)
    const r = await ACCIONES.brief.entregar(al, wf({ version: 1, encargo_id: 'enc-http', texto: BRIEF_BUENO, costo_usd: 0.2 }), AHORA)
    expect(r.status).toBe(200)
    expect(r.cuerpo).toMatchObject({ ok: true, estado: 'validada' })
    expect(al.briefsCreativos[0]).toMatchObject({ encargo_id: 'enc-http', costo_usd: 0.2 })
    await conceptoAbrir(al, wf(), AHORA)
    expect((await ACCIONES.concepto.entregar(al, wf({ version: 1, texto: CONCEPTO_BUENO }), AHORA)).cuerpo).toMatchObject({ ok: true, estado: 'lista' })
    expect((await ACCIONES.concepto.entregar(al, wf({ version: 1, texto: CONCEPTO_BUENO }), AHORA)).cuerpo).toMatchObject({ ya_cerrada: true })
    expect(Object.keys(ACCIONES.concepto)).toEqual(['abrir', 'entregar', 'decidir'])
  })
})
