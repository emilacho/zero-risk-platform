/**
 * 17-nov · propuestas también en IMAGEN · tramo 2a (CC1 · contrato CC5 v1 · decisiones de Lenovo: N=3, 2 vueltas, la parada es ÚNICA) · US$ 0 (todo en memoria, ensayo).
 * El motor de punta a punta con el carrusel de la mesa: la plantilla pide N (`limites.propuestas`) → la mesa presenta N → se guardan en `propuestas_imagen`, cada una con
 * SUS artefactos de la cola → el encargo espera al dueño (turno `dueno`) → aprobar pasa la elegida TAL CUAL; pedir cambios vuelve a la mesa con la ronda siguiente.
 * Sin el dato, la mesa trabaja exactamente como hoy (una pieza, sin parada). El borrador por propuesta y la plantilla nueva son el tramo 2b.
 */
import { describe, expect, it } from 'vitest'
import { abrirEncargo, recibirDecisionDelDueno } from '../orquestador'
import { CARRUSEL_MESA, VUELTA_DE_LA_JEFATURA_A_LA_MESA } from '../plantillas/mesa'
import type { SalidaDeRevision } from '../../jefatura/revision/contrato'
import { PASO_APROBAR_PROPUESTAS } from '../plantillas/video-mesa'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { decidir, propuestaDeImagenAprobada, TURNO_DEL_DUENO } from '../video/aprobacion'
import { faseDeLaProduccion } from '../video/propuestas'
import { ARTEFACTO_PROPUESTAS_IMAGEN, avisoDeLaParadaUnicaDeImagen, propuestasDeLaPlantilla, refDelIngeniero, type PropuestasDeImagen } from '../mesa/propuestas-imagen'
import { imagenesAGenerarDe } from '../mesa/orquestador'
import type { EstadoMesa } from '../mesa/tipos'
import { propuestasDeLaDecision } from '../../direccion/decisiones-propuestas'
import type { Plantilla } from '../tipos'
import { CLIENTE, PARTE, crearMemoria } from './memoria'
import { crearMesaEnMemoria, DIRECTORIO } from './mesa-memoria'
import { CONDICION_PROMPTS } from '../mesa/prompts'
import { BRIEF_CARRUSEL, CITAS_COMPLETAS, LAMINAS_OK, jugar, parteCon, seccionesDeLaminas, type Turno } from './mesa-arnes'

/** el carrusel de la mesa con N propuestas y la parada del dueño justo después de la mesa (la plantilla real con su borrador es el tramo 2b) */
const conPropuestas = (n: number): Plantilla => {
  const pasos = [...CARRUSEL_MESA.pasos]
  pasos.splice(pasos.findIndex((p) => p.clave === 'mesa') + 1, 0, PASO_APROBAR_PROPUESTAS)
  return { ...CARRUSEL_MESA, limites: { ...CARRUSEL_MESA.limites, propuestas: { n } } as Plantilla['limites'], pasos }
}

const TITULOS = ['El plato de la mañana', 'Lo de siempre, distinto', 'Hoy se cocina aquí']
/** una propuesta de carrusel: la cabecera de la propuesta + las 5 láminas (con su titular propio) */
const propuesta = (i: number) => {
  const laminas = LAMINAS_OK.map(([rol, t, x, img], k) => [rol, k === 0 ? `${TITULOS[i]}` : `${t}`, x, img])
  return [`# Propuesta ${i + 1} · ${TITULOS[i]}`, `Concepto: camino ${i + 1} · Por qué: porque sí ${i + 1}`, seccionesDeLaminas(laminas), '## Pie', `Pie ${i + 1}.`, '## Etiquetas', '#plato #hoy'].join('\n')
}
const TRES = [propuesta(0), propuesta(1), propuesta(2), CITAS_COMPLETAS].join('\n')
/** el ingeniero escribe una sección por imagen con el ref que recibió (con propuestas, «P2-hook») */
const INGENIERO_POR_PROPUESTA = '## P1-hook\nprompt de la uno: plate on wood, morning light\n## P2-hook\nprompt de la dos: steam over the pot\n## P3-hook\nprompt de la tres: the cook at the stove'

/** el directorio con el ingeniero de prompts en su turno propio (después de integrar), como en producción */
const CON_INGENIERO = DIRECTORIO.map((t) => (t.agente === 'design-image-prompt-engineer' ? { ...t, pertinente_en: [...t.pertinente_en, `carrusel:${CONDICION_PROMPTS}`] } : t))

async function montar(pl: Plantilla) {
  const M = crearMemoria({ parte: parteCon(BRIEF_CARRUSEL), plantilla: pl })
  M.P.mesa = crearMesaEnMemoria(CON_INGENIERO)
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0100', dry_run: true, familia: 'carrusel_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  return { M, a, id: String(a.cuerpo.encargo_id) }
}
const responder = (integracion: string, ingeniero = INGENIERO_POR_PROPUESTA) => (t: Turno) =>
  t.tipo === 'integrar' || t.tipo === 'devolver_citas' ? { texto: integracion } : t.tipo === 'redactar_prompts' ? { texto: ingeniero } : undefined
const estado = (M: Awaited<ReturnType<typeof montar>>['M'], id: string) => M.encargos.get(id)!.estado_del_motor
const pi = (e: ReturnType<typeof estado>) => e.artefactos[ARTEFACTO_PROPUESTAS_IMAGEN]?.datos as unknown as PropuestasDeImagen

describe('propuestas en imagen · el motor (tramo 2a)', () => {
  it('el dato se lee: { n } o un número; sin dato, 1', () => {
    expect(propuestasDeLaPlantilla(conPropuestas(3))).toBe(3)
    expect(propuestasDeLaPlantilla({ limites: { propuestas: 2 } } as unknown as Plantilla)).toBe(2)
    expect(propuestasDeLaPlantilla(CARRUSEL_MESA)).toBe(1)
    expect(propuestasDeLaPlantilla({ limites: { propuestas: { n: 1.5 } } } as unknown as Plantilla)).toBe(1)
  })

  it('🔴 sin el dato, nada cambia: una pieza, sin propuestas ni parada', async () => {
    const { M, a, id } = await montar(CARRUSEL_MESA)
    await jugar(M, id, a, responder(TRES))
    const e = estado(M, id)
    expect((e.artefactos.mesa?.datos as { imagen?: unknown }).imagen).toBeUndefined()
    expect(e.artefactos[ARTEFACTO_PROPUESTAS_IMAGEN]).toBeUndefined()
    expect([...(M.turnos.get(id)?.values() ?? [])].some((t) => t.tipo === TURNO_DEL_DUENO)).toBe(false)
  })

  it('🔴 con N=3: la mesa presenta 3, se guardan con SUS artefactos, nada de la cola se escribe todavía y el encargo ESPERA AL DUEÑO', async () => {
    const { M, a, id } = await montar(conPropuestas(3))
    const { ultima } = await jugar(M, id, a, responder(TRES))
    expect(ultima.cuerpo).toMatchObject({ accion: 'esperar_dueno', ronda: 1 })
    const e = estado(M, id)
    expect((e.artefactos.mesa?.datos as { imagen?: unknown }).imagen).toEqual({ propuestas: 3 })
    const p = pi(e)
    expect(p).toMatchObject({ ronda: 1, clase: 'carrusel' })
    expect(p.propuestas.map((x) => [x.id, x.nombre, x.concepto])).toEqual([['P1', TITULOS[0], 'camino 1'], ['P2', TITULOS[1], 'camino 2'], ['P3', TITULOS[2], 'camino 3']])
    for (const x of p.propuestas) expect(Object.keys(x.artefactos ?? {}).sort()).toEqual(['copy_carrusel', 'laminas', 'prompts_validos', 'visual_direction'])
    // lo que aún NO existe: la cola no recibe nada hasta que el dueño elija
    for (const k of ['copy_carrusel', 'laminas', 'visual_direction', 'prompts_validos']) expect(e.artefactos[k]).toBeUndefined()
    expect(faseDeLaProduccion(e)).toBe('propuesta')
    // la tarjeta lo lee (contrato §2)
    expect(propuestasDeLaDecision({ id, brief_id: 'BRF-0100' }, e as unknown as Record<string, unknown>, conPropuestas(3).pasos as unknown as Record<string, unknown>[])).toMatchObject({ familia: 'imagen', clase: 'carrusel', quedan_vueltas: 2 })
  })

  it('🔴 cada propuesta lleva las instrucciones del ingeniero de SU imagen (nunca las de otra); sin la suya, la descripción de la dirección y el aviso con su ref', async () => {
    const { M, a, id } = await montar(conPropuestas(3))
    await jugar(M, id, a, responder(TRES))
    const prompts = pi(estado(M, id)).propuestas.map((x) => (x.artefactos!.prompts_validos.por_ref as Record<string, { prompts: Array<{ prompt: string }>; origen: string }>).hook)
    expect(prompts.map((h) => [h.prompts[0].prompt, h.origen])).toEqual([['prompt de la uno: plate on wood, morning light', 'ingeniero_de_prompts'], ['prompt de la dos: steam over the pot', 'ingeniero_de_prompts'], ['prompt de la tres: the cook at the stove', 'ingeniero_de_prompts']])
    // el ingeniero escribió solo «hook» (sin propuesta): ninguna toma instrucciones que no son suyas
    const x = await montar(conPropuestas(3))
    await jugar(x.M, x.id, x.a, responder(TRES, '## hook\nun solo prompt sin propuesta'))
    const p = pi(estado(x.M, x.id))
    for (const q of p.propuestas) expect((q.artefactos!.prompts_validos.por_ref as Record<string, { origen: string }>).hook.origen).toBe('direccion')
    expect(p.avisos.filter((v) => /el ingeniero de prompts no dejó una instrucción legible para «P\d-hook»/.test(v)).map((v) => /«(P\d)-hook»/.exec(v)![1])).toEqual(['P1', 'P2', 'P3'])
  })

  it('🔴 solo la ÚLTIMA propuesta pide una imagen generada: el ingeniero igual tiene su turno, y recibe solo esa', async () => {
    const sinGenerar = (i: number) => propuesta(i).replace(/Imagen: generar:[^\n]*/g, 'Imagen: ninguna')
    const md = [sinGenerar(0), sinGenerar(1), propuesta(2), CITAS_COMPLETAS].join('\n')
    const { M, a, id } = await montar(conPropuestas(3))
    const { turnos } = await jugar(M, id, a, responder(md, '## P3-hook\nprompt de la tres: the cook at the stove'))
    const ing = turnos.filter((x) => x.tipo === 'redactar_prompts')
    expect(ing).toHaveLength(1)
    expect(ing[0].task).toContain('**P3-hook**')
    expect(ing[0].task).not.toContain('**P1-hook**')
    const p3 = pi(estado(M, id)).propuestas[2].artefactos!.prompts_validos.por_ref as Record<string, { prompts: Array<{ prompt: string }>; origen: string }>
    expect([p3.hook.prompts[0].prompt, p3.hook.origen]).toEqual(['prompt de la tres: the cook at the stove', 'ingeniero_de_prompts'])
  })

  it('🔴 aprobar P2: la cola recibe los artefactos de P2 TAL CUAL, la fase pasa a final y el encargo sigue solo', async () => {
    const { M, a, id } = await montar(conPropuestas(3))
    await jugar(M, id, a, responder(TRES))
    const antes = pi(estado(M, id)).propuestas[1].artefactos!
    const r = await recibirDecisionDelDueno(M.P, id, { decision: 'aprobar', ronda: 1, propuesta_id: 'P2' })
    expect(r.status).toBe(200)
    const e = estado(M, id)
    expect(e.artefactos.copy_carrusel.datos).toEqual(antes.copy_carrusel)
    expect(e.artefactos.laminas.datos).toEqual(antes.laminas)
    expect(e.artefactos.visual_direction.datos).toEqual(antes.visual_direction)
    expect(e.artefactos.prompts_validos.datos).toEqual(antes.prompts_validos)
    expect((e.artefactos.laminas.datos as { laminas: Array<{ headline: string }> }).laminas[0].headline).toBe(TITULOS[1])
    expect(faseDeLaProduccion(e)).toBe('final')
    expect(propuestaDeImagenAprobada(e)?.id).toBe('P2')
    expect(e.artefactos.aprobacion_propuestas.datos).toMatchObject({ estado: 'aprobada', propuesta_id: 'P2', ronda: 1 })
    // el encargo siguió solo: ya no espera al dueño
    expect(r.cuerpo.accion).not.toBe('esperar_dueno')
  })

  it('🔴 pedir cambios: vuelve a la mesa con las observaciones y presenta la ronda 2; agotadas las 2 vueltas, solo queda aprobar', async () => {
    const { M, a, id } = await montar(conPropuestas(3))
    await jugar(M, id, a, responder(TRES))
    const r1 = await recibirDecisionDelDueno(M.P, id, { decision: 'cambios', ronda: 1, observaciones: 'más cálidas' })
    const { ultima } = await jugar(M, id, r1, responder(TRES))
    expect(ultima.cuerpo).toMatchObject({ accion: 'esperar_dueno', ronda: 2 })
    expect(pi(estado(M, id)).ronda).toBe(2)
    const r2 = await recibirDecisionDelDueno(M.P, id, { decision: 'cambios', ronda: 2, observaciones: 'otra vez' })
    const u2 = await jugar(M, id, r2, responder(TRES))
    expect(u2.ultima.cuerpo).toMatchObject({ accion: 'esperar_dueno', ronda: 3 })
    const r3 = await recibirDecisionDelDueno(M.P, id, { decision: 'cambios', ronda: 3, observaciones: 'una más' })
    expect(r3.cuerpo).toMatchObject({ error: 'sin_vueltas' })
  })

  it('🔴 una propuesta de imagen sin sus artefactos NO se aprueba (se dice y no se toca nada)', () => {
    const e = { artefactos: { [ARTEFACTO_PROPUESTAS_IMAGEN]: { version: 1, datos: { ronda: 1, clase: 'kit', avisos: [], citas: '', propuestas: [{ id: 'P1', nombre: 'A', laminas: [{ n: 1, rol: 'e01' }], texto: '# Propuesta 1' }] } } }, vueltas: {} }
    const d = decidir(e as never, PASO_APROBAR_PROPUESTAS, { decision: 'aprobar', ronda: 1, propuesta_id: 'P1' })
    expect(d).toMatchObject({ ok: false, status: 409, error: 'propuesta_incompleta' })
  })

  it('el video manda si están las dos (hoy nunca pasa): aprobar usa las del video', () => {
    const e = { artefactos: {
      propuestas_video: { version: 1, datos: { ronda: 1, avisos: [], propuestas: [{ id: 'P1', nombre: 'V', texto: 't', guion: { pie_de_foto: 'p', hashtags: [] } }] } },
      [ARTEFACTO_PROPUESTAS_IMAGEN]: { version: 1, datos: { ronda: 4, propuestas: [{ id: 'P1', artefactos: { copy_kit: {} } }] } },
    }, vueltas: {} }
    const d = decidir(e as never, PASO_APROBAR_PROPUESTAS, { decision: 'aprobar', ronda: 1, propuesta_id: 'P1' })
    if (!d.ok) throw new Error(d.detalle)
    expect(Object.keys(d.res.otros_artefactos ?? {})).toContain('guion')
  })

  it('🔴 el ingeniero recibe las imágenes de TODAS las propuestas, cada una con el id de la suya y su nombre; sin propuestas, la lista de siempre', async () => {
    const { M, a, id } = await montar(conPropuestas(3))
    const { turnos } = await jugar(M, id, a, responder(TRES))
    const enc = M.encargos.get(id)!
    const est = enc.estado_del_motor.artefactos.mesa.datos as unknown as EstadoMesa
    const lista = imagenesAGenerarDe(enc, est)
    expect(lista.map((x) => x.ref)).toEqual(['P1-hook', 'P2-hook', 'P3-hook'])
    expect(lista[1].descripcion).toMatch(/^\(P2 · «Lo de siempre, distinto»\) un plato servido/)
    // el ingeniero tuvo su turno, y su pedido nombra las tres
    const ing = turnos.find((t) => t.tipo === 'redactar_prompts')!
    for (const r of ['P1-hook', 'P2-hook', 'P3-hook']) expect(ing.task).toContain(`**${r}**`)
    // sin propuestas, los refs de siempre
    const y = await montar(CARRUSEL_MESA)
    await jugar(y.M, y.id, y.a, responder(TRES.split('# Propuesta 2')[0].replace(/^# Propuesta 1 · .*\n.*\n/, '') + CITAS_COMPLETAS))
    const e2 = y.M.encargos.get(y.id)!
    expect(imagenesAGenerarDe(e2, { ...(e2.estado_del_motor.artefactos.mesa.datos as unknown as EstadoMesa) }).map((x) => x.ref)).toEqual(['hook'])
    expect(refDelIngeniero('P2', 'e01-c2')).toBe('P2-e01-c2')
  })

  it('🔴 la parada es ÚNICA: aprobada P2, si la jefatura devuelve el trabajo a la mesa, la mesa corrige SOLO la elegida (una pieza) y el encargo NO vuelve a esperar al dueño', async () => {
    // la plantilla de prueba con la vuelta de la jefatura a la mesa (el dato que ya tiene la historia)
    const pl = conPropuestas(3)
    const conVuelta: Plantilla = { ...pl, pasos: pl.pasos.map((p) => (p.clave === 'jefatura' ? { ...p, vuelve_a: structuredClone(VUELTA_DE_LA_JEFATURA_A_LA_MESA) } : p)) }
    const { M, a, id } = await montar(conVuelta)
    const revisiones: string[] = []
    const salida = (desacuerdos: string[]): SalidaDeRevision => ({ revision_id: `rev-${revisiones.length}`, artifact_type: 'pieza', artifact_id: 'x', resultado: desacuerdos.length ? 'con_desacuerdo' : 'limpia', marcas: { con_desacuerdo: desacuerdos.length > 0, sin_segunda_mirada: false }, artefacto_final: {}, versiones: [], respuestas: [], opinion_externa: null, imagen_por_rehacer: false, desacuerdos, costo_usd: 0, pasos: 1, trace_id: 't', devolver_a: null, simulado: true })
    M.P.jefatura = async (sobre) => { revisiones.push(String(sobre.payload.texto ?? '')); return { estado: 'cerrada', salida: salida(revisiones.length === 1 ? ['texto: el titular de la primera lámina no dice dónde'] : []) } }
    await jugar(M, id, a, responder(TRES))
    // tras aprobar, la dirección escribe UNA pieza (la elegida corregida); la mesa ya no pide propuestas
    const UNA = [seccionesDeLaminas(LAMINAS_OK.map(([rol, tt, x, img], k) => [rol, k === 0 ? 'Lo de siempre, distinto · en Olón' : tt, x, img])), '## Pie', 'Pie corregido.', '## Etiquetas', '#plato', CITAS_COMPLETAS].join('\n')
    const d = await recibirDecisionDelDueno(M.P, id, { decision: 'aprobar', ronda: 1, propuesta_id: 'P2' })
    const { ultima } = await jugar(M, id, d, responder(UNA))
    const e = estado(M, id)
    // la jefatura revisó dos veces: la segunda, la pieza corregida
    expect(revisiones).toHaveLength(2)
    // la dirección recibió la propuesta aprobada UNA vez, antes de corregir
    const avisos = (M.P.mesa as ReturnType<typeof crearMesaEnMemoria>).filas.filter((x) => x.encargo_id === id && x.tipo === 'devuelve' && x.de === 'oficina-creativa' && /YA APROBÓ la propuesta P2/.test(x.texto))
    expect(avisos).toHaveLength(1)
    expect(avisos[0].texto).toMatch(/«Lo de siempre, distinto»/)
    // la mesa quedó en UNA pieza, marcada con la elegida; la cola tiene la corregida
    expect((e.artefactos.mesa.datos as unknown as EstadoMesa).imagen).toEqual({ propuestas: 1 })
    expect((e.artefactos.mesa.datos as unknown as EstadoMesa).marcas.parada_unica).toBe('P2')
    expect((e.artefactos.laminas.datos as { laminas: Array<{ headline: string }> }).laminas[0].headline).toBe('Lo de siempre, distinto · en Olón')
    // NO hubo otra parada: un solo turno del dueño en todo el encargo, y la aprobación sigue siendo P2 de la ronda 1
    expect([...(M.turnos.get(id)?.values() ?? [])].filter((x) => x.tipo === TURNO_DEL_DUENO)).toHaveLength(1)
    expect(ultima.cuerpo.accion).not.toBe('esperar_dueno')
    expect(e.artefactos.aprobacion_propuestas.datos).toMatchObject({ estado: 'aprobada', propuesta_id: 'P2', ronda: 1 })
    expect(pi(e).ronda).toBe(1)
  })

  it('el aviso de la parada única en imagen', () => {
    const av = avisoDeLaParadaUnicaDeImagen({ id: 'P2', nombre: 'La olla', concepto: 'el vapor', texto: '# Propuesta 2 · La olla\n## Lámina 1' }, 'Aviso de concepto:')
    expect(av).toMatch(/YA APROBÓ la propuesta P2 · «La olla» \(concepto: el vapor\)/)
    expect(av).toMatch(/Escribe UNA pieza/)
    expect(av).toMatch(/No escribas «# Propuesta N»/)
    expect(av).toMatch(/«Aviso de concepto:»/)
    expect(av.endsWith('# Propuesta 2 · La olla\n## Lámina 1')).toBe(true)
  })
})
