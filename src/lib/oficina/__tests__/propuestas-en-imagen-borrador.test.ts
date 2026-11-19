/**
 * 17-nov · propuestas también en IMAGEN · tramo 2b · EL BORRADOR DE CADA PROPUESTA (contrato CC5 v1 §1b). De punta a punta en memoria, en seco (US$ 0).
 * La plantilla de prueba: el carrusel de la mesa con N propuestas, el paso del borrador después de la mesa y la parada del dueño después del borrador.
 */
import { describe, expect, it } from 'vitest'
import { abrirEncargo, recibirDecisionDelDueno } from '../orquestador'
import { CARRUSEL_MESA, VUELTA_DE_LA_JEFATURA_A_LA_MESA } from '../plantillas/mesa'
import { PASO_APROBAR_PROPUESTAS } from '../plantillas/video-mesa'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { TURNO_DEL_DUENO } from '../video/aprobacion'
import { ARTEFACTO_BORRADOR_IMAGEN, avisoDeBorradorDeImagenIncompleto, calidadDelBorradorDeImagen, FUNCION_BORRADOR_IMAGEN, type BorradoresDeImagen } from '../mesa/borrador-imagen'
import { FUNCIONES_CON_GASTO, FUNCIONES_REGISTRADAS } from '../plantilla'
import { propuestasDeLaDecision } from '../../direccion/decisiones-propuestas'
import type { Plantilla } from '../tipos'
import { coberturaDelTope, loQueSigueDeLaMesa } from '../topes-por-duracion'
import { reservaDeLaMesa } from '../mesa/orquestador'
import type { SalidaDeRevision } from '../../jefatura/revision/contrato'
import { CLIENTE, PARTE, crearMemoria } from './memoria'
import { crearMesaEnMemoria, DIRECTORIO } from './mesa-memoria'
import { CONDICION_PROMPTS } from '../mesa/prompts'
import { BRIEF_CARRUSEL, CITAS_COMPLETAS, LAMINAS_OK, jugar, parteCon, seccionesDeLaminas, type Turno } from './mesa-arnes'

const PASO_BORRADOR: Plantilla['pasos'][number] = { clave: 'borrador_imagen', tipo: 'codigo', quien: 'sala', funcion: FUNCION_BORRADOR_IMAGEN, condicion: { tipo: 'siempre' }, entrada: ['mesa'], salida_artefacto: ARTEFACTO_BORRADOR_IMAGEN, tope_usd: 0.3 }
/** el carrusel de la mesa: mesa → borrador → aprobar (n=0: sin el dato de propuestas) */
const conBorrador = (n: number, extra: Record<string, unknown> = {}): Plantilla => {
  const pasos = [...CARRUSEL_MESA.pasos]
  pasos.splice(pasos.findIndex((p) => p.clave === 'mesa') + 1, 0, PASO_BORRADOR, PASO_APROBAR_PROPUESTAS)
  return { ...CARRUSEL_MESA, limites: { ...CARRUSEL_MESA.limites, ...(n ? { propuestas: { n } } : {}), ...extra } as Plantilla['limites'], pasos }
}
const TITULOS = ['El plato de la mañana', 'Lo de siempre, distinto', 'Hoy se cocina aquí']
const propuesta = (i: number) => {
  const laminas = LAMINAS_OK.map(([rol, t, x, img], k) => [rol, k === 0 ? TITULOS[i] : t, x, img])
  return [`# Propuesta ${i + 1} · ${TITULOS[i]}`, `Concepto: camino ${i + 1} · Por qué: porque sí ${i + 1}`, seccionesDeLaminas(laminas), '## Pie', `Pie ${i + 1}.`, '## Etiquetas', '#plato #hoy'].join('\n')
}
const TRES = [propuesta(0), propuesta(1), propuesta(2), CITAS_COMPLETAS].join('\n')
const INGENIERO = '## P1-hook\nprompt de la uno: plate on wood\n## P2-hook\nprompt de la dos: steam over the pot\n## P3-hook\nprompt de la tres: the cook at the stove'
const CON_INGENIERO = DIRECTORIO.map((t) => (t.agente === 'design-image-prompt-engineer' ? { ...t, pertinente_en: [...t.pertinente_en, `carrusel:${CONDICION_PROMPTS}`] } : t))

async function montar(pl: Plantilla, tope?: number) {
  const M = crearMemoria({ parte: parteCon(BRIEF_CARRUSEL), plantilla: pl })
  M.P.mesa = crearMesaEnMemoria(CON_INGENIERO)
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0100', dry_run: true, familia: 'carrusel_mesa', ...(tope ? { tope_usd: tope } : {}) }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  return { M, a, id: String(a.cuerpo.encargo_id) }
}
const responder = (integracion: string) => (t: Turno) =>
  t.tipo === 'integrar' || t.tipo === 'devolver_citas' ? { texto: integracion } : t.tipo === 'redactar_prompts' ? { texto: INGENIERO } : undefined
const borrador = (M: Awaited<ReturnType<typeof montar>>['M'], id: string) => M.encargos.get(id)!.estado_del_motor.artefactos[ARTEFACTO_BORRADOR_IMAGEN]?.datos as unknown as BorradoresDeImagen | undefined
const enBaja = (M: Awaited<ReturnType<typeof montar>>['M']) => (M.llamadas.imagenCalidades as Array<{ quality?: string; prompt: string }>).filter((x) => x.quality === 'low')
const turnosDelDueno = (M: Awaited<ReturnType<typeof montar>>['M'], id: string) => [...(M.turnos.get(id)?.values() ?? [])].filter((x) => x.tipo === TURNO_DEL_DUENO)

describe('propuestas en imagen · el borrador de cada propuesta (tramo 2b)', () => {
  it('la función está registrada y gasta (su tope puede ser > 0)', () => {
    expect(FUNCIONES_REGISTRADAS).toContain('borrador_imagen')
    expect(FUNCIONES_CON_GASTO).toContain('borrador_imagen')
  })

  it('🔴 N=3: cada propuesta trae SU imagen en baja (su propio prompt) y sus 5 láminas dibujadas en SU carpeta; la tarjeta las muestra; espera al dueño sin aviso', async () => {
    const { M, a, id } = await montar(conBorrador(3))
    const { ultima } = await jugar(M, id, a, responder(TRES))
    expect(ultima.cuerpo.accion).toBe('esperar_dueno')
    const b = borrador(M, id)!
    expect(b).toMatchObject({ fase: 'borrador', ronda: 1, calidad: 'low' })
    expect(b.omitido).toBeUndefined()
    // una imagen en baja por propuesta, cada una con el prompt de SU propuesta
    expect(enBaja(M).map((x) => x.prompt)).toEqual(['prompt de la uno: plate on wood', 'prompt de la dos: steam over the pot', 'prompt de la tres: the cook at the stove'])
    expect(b.propuestas.map((p) => p.id)).toEqual(['P1', 'P2', 'P3'])
    for (const p of b.propuestas) {
      expect(p.laminas.map((l) => l.n)).toEqual([1, 2, 3, 4, 5])
      expect(p.laminas.every((l) => /^https:\/\//.test(l.png_url ?? ''))).toBe(true)
      expect(p.errores).toBeUndefined()
    }
    // la imagen de la lámina 1 (la generada) es la de SU propuesta; las «ninguna» no inventan imagen
    expect(b.propuestas.map((p) => p.laminas[0].imagen_url)).toEqual(['https://dry.test/1.png', 'https://dry.test/2.png', 'https://dry.test/3.png'])
    expect(b.propuestas[0].laminas[1].imagen_url).toBeUndefined()
    // el dibujo: una carpeta por propuesta y ronda, con la imagen de su propuesta de fondo en la primera lámina
    const pedidos = (M.llamadas.renderPedidos as Array<{ subcarpeta: string; slides: Array<{ background_image_url?: string | null; headline: string }> }>)
    expect(pedidos.map((p) => p.subcarpeta)).toEqual([`oficina/${id}/borrador/P1-r1`, `oficina/${id}/borrador/P2-r1`, `oficina/${id}/borrador/P3-r1`])
    expect(pedidos[1].slides[0]).toMatchObject({ headline: TITULOS[1], background_image_url: 'https://dry.test/2.png' })
    // la tarjeta (CC5) lee el png de cada lámina por n
    const e = M.encargos.get(id)!
    const d = propuestasDeLaDecision(e, e.estado_del_motor as never, conBorrador(3).pasos as never)!
    expect(d.lista[1].planos.map((p) => p.imagen_url)).toEqual(b.propuestas[1].laminas.map((l) => l.png_url))
    expect(M.llamadas.avisos.filter((x) => x.canal === 'alertas')).toEqual([])
    // cada imagen del borrador queda en el gasto del encargo (una fila por imagen, con su generación), aunque en seco cueste 0
    expect((M.gastos as Array<{ concepto: string; ref_tabla?: string; ref_id?: string }>).filter((g) => g.concepto === 'imagen').map((g) => [g.ref_tabla, g.ref_id])).toEqual([['agent_image_generations', 'dry-1'], ['agent_image_generations', 'dry-2'], ['agent_image_generations', 'dry-3']])
  })

  it('🔴 sin el dato de propuestas, el paso pasa de largo SIN GASTAR (ni imagen en baja ni dibujo de borrador)', async () => {
    const { M, a, id } = await montar(conBorrador(0))
    await jugar(M, id, a, responder(TRES))
    expect(borrador(M, id)).toMatchObject({ omitido: 'sin propuestas de imagen', propuestas: [], costo_usd: 0 })
    expect(enBaja(M)).toEqual([])
    expect((M.llamadas.renderPedidos as Array<{ subcarpeta: string }>).some((p) => p.subcarpeta.includes('/borrador/'))).toBe(false)
  })

  it('🔴 parada única: aprobada P2, si la jefatura devuelve el trabajo a la mesa, el borrador pasa de largo SIN GASTAR y no hay otra parada', async () => {
    // con la vuelta de la jefatura el peor caso sube (US$ 5,9): con el tope de 5 el encargo NO se abre (ver la prueba del tope); aquí, 7: la mesa gasta en sus turnos antes de integrar y su freno cuenta ese gasto
    const pl = conBorrador(3, { tope_encargo_usd: 7 })
    const conVuelta: Plantilla = { ...pl, pasos: pl.pasos.map((p) => (p.clave === 'jefatura' ? { ...p, vuelve_a: structuredClone(VUELTA_DE_LA_JEFATURA_A_LA_MESA) } : p)) }
    const { M, a, id } = await montar(conVuelta, 7)
    let revisiones = 0
    const salida = (desacuerdos: string[]): SalidaDeRevision => ({ revision_id: `rev-${revisiones}`, artifact_type: 'pieza', artifact_id: 'x', resultado: desacuerdos.length ? 'con_desacuerdo' : 'limpia', marcas: { con_desacuerdo: desacuerdos.length > 0, sin_segunda_mirada: false }, artefacto_final: {}, versiones: [], respuestas: [], opinion_externa: null, imagen_por_rehacer: false, desacuerdos, costo_usd: 0, pasos: 1, trace_id: 't', devolver_a: null, simulado: true })
    M.P.jefatura = async () => { revisiones++; return { estado: 'cerrada', salida: salida(revisiones === 1 ? ['texto: el titular no dice dónde'] : []) } }
    await jugar(M, id, a, responder(TRES))
    const antes = enBaja(M).length
    const pedidosAntes = (M.llamadas.renderPedidos as unknown[]).length
    const UNA = [seccionesDeLaminas(LAMINAS_OK.map(([rol, t, x, img], k) => [rol, k === 0 ? 'Lo de siempre, distinto · en Olón' : t, x, img])), '## Pie', 'Pie corregido.', '## Etiquetas', '#plato', CITAS_COMPLETAS].join('\n')
    const d = await recibirDecisionDelDueno(M.P, id, { decision: 'aprobar', ronda: 1, propuesta_id: 'P2' })
    await jugar(M, id, d, responder(UNA))
    expect(revisiones).toBe(2)
    expect(enBaja(M)).toHaveLength(antes)
    expect((M.llamadas.renderPedidos as Array<{ subcarpeta: string }>).slice(pedidosAntes).some((p) => p.subcarpeta.includes('/borrador/'))).toBe(false)
    expect(borrador(M, id)).toMatchObject({ omitido: 'la propuesta ya está aprobada (parada única)', costo_usd: 0 })
    expect(turnosDelDueno(M, id)).toHaveLength(1)
  })

  it('🔴 pedir cambios: la mesa vuelve y el borrador se rehace con la ronda 2 (otra carpeta)', async () => {
    const { M, a, id } = await montar(conBorrador(3))
    await jugar(M, id, a, responder(TRES))
    const d = await recibirDecisionDelDueno(M.P, id, { decision: 'cambios', ronda: 1, observaciones: 'más cerca del plato' })
    await jugar(M, id, d, responder(TRES))
    expect(borrador(M, id)).toMatchObject({ ronda: 2 })
    expect((M.llamadas.renderPedidos as Array<{ subcarpeta: string }>).map((p) => p.subcarpeta)).toContain(`oficina/${id}/borrador/P2-r2`)
    expect(enBaja(M)).toHaveLength(6)
  })

  it('🔴 el generador falla en P2: P2 queda sin imagen (no se inventa), con su error; las láminas se dibujan igual; UN aviso en #alertas; el encargo espera al dueño', async () => {
    const { M, a, id } = await montar(conBorrador(3))
    M.imagenFalla = (n) => n === 2
    const { ultima } = await jugar(M, id, a, responder(TRES))
    expect(ultima.cuerpo.accion).toBe('esperar_dueno')
    const b = borrador(M, id)!
    expect(b.propuestas[1].laminas[0].imagen_url).toBeUndefined()
    expect(b.propuestas[1].laminas[0].png_url).toMatch(/^https:/)
    expect(b.propuestas[1].errores).toEqual(['el generador no devolvió la imagen de «hook»: proveedor caído'])
    expect(b.propuestas[0].errores).toBeUndefined()
    const avisos = M.llamadas.avisos.filter((x) => x.canal === 'alertas')
    expect(avisos).toHaveLength(1)
    expect(avisos[0].texto).toMatch(/Borrador de imagen incompleto · BRF-0100: P2: el generador no devolvió la imagen de «hook»: proveedor caído/)
    expect(avisos[0].texto).not.toMatch(/P1:|P3:/)
  })

  it('🔴 el dibujo falla en P3: sus láminas quedan sin png (con la imagen sola), error y aviso; nada se presenta como listo', async () => {
    const { M, a, id } = await montar(conBorrador(3))
    M.renderFalla = (n) => n === 3
    await jugar(M, id, a, responder(TRES))
    const p3 = borrador(M, id)!.propuestas[2]
    expect(p3.laminas.every((l) => l.png_url === undefined)).toBe(true)
    expect(p3.laminas[0].imagen_url).toBe('https://dry.test/3.png')
    expect(p3.errores).toEqual(['no se pudieron dibujar las láminas del borrador: el brazo no respondió'])
    expect(M.llamadas.avisos.filter((x) => x.canal === 'alertas')).toHaveLength(1)
  })

  it('la calidad es DATO de la plantilla: `limites.imagen_borrador`', async () => {
    const { M, a, id } = await montar(conBorrador(3, { imagen_borrador: { quality: 'medium', size: '1024x1536' } }))
    await jugar(M, id, a, responder(TRES))
    expect(borrador(M, id)!.calidad).toBe('medium')
    const pedidas = (M.llamadas.imagenCalidades as Array<{ quality?: string; size?: string }>).filter((x) => x.quality === 'medium' && x.size === '1024x1536')
    expect(pedidas).toHaveLength(3)
  })

  it('🔴 el tope (punto 4 de CC6): con propuestas, la mesa de imagen guarda lo que sigue (borrador + 2 rondas + final) y un tope que no cubre el peor caso NO abre el encargo', async () => {
    const pl = conBorrador(3)
    // lo que sigue de la mesa: borrador 0,3 + imagen 0,2 + observar 0,1 + la jefatura (1,7) + 2 rondas × (borrador 0,3 + un turno de la mesa 0,6) = 4,1
    expect(loQueSigueDeLaMesa(pl, { vueltas: {} })).toBe(4.1)
    expect(reservaDeLaMesa(pl, 'carrusel', { vueltas: {} } as never)).toEqual({ reserva_posterior_usd: 4.1, techo_es_el_tope: true })
    // con una ronda ya hecha, se guarda una menos
    expect(loQueSigueDeLaMesa(pl, { vueltas: { aprobar_propuestas: 1 } })).toBe(3.2)
    // una plantilla de otra familia con el tipo cambiado no guarda nada nuevo (manda la familia de la plantilla)
    expect(reservaDeLaMesa(pl, 'kit', { vueltas: {} } as never)).toEqual({})
    // sin propuestas, la mesa de imagen sigue con la cifra fija de su tipo (como hoy)
    expect(reservaDeLaMesa(conBorrador(0), 'carrusel', { vueltas: {} } as never)).toEqual({})
    // lo requerido al abrir nunca es menos que lo que guarda la mesa antes de su primer turno
    // antes de su primer turno: un turno de la mesa 0,6 + lo que sigue 4,1 = 4,7
    const c = coberturaDelTope(pl, 4)
    expect(c).toMatchObject({ requerido: 4.7, cubre: false })
    expect(c.detalle).toContain('la mesa con propuestas guarda 4.7')
    const conVuelta: Plantilla = { ...pl, pasos: pl.pasos.map((p) => (p.clave === 'jefatura' ? { ...p, vuelve_a: structuredClone(VUELTA_DE_LA_JEFATURA_A_LA_MESA) } : p)) }
    // 18-nov · GO Lenovo 13:52Z · la vuelta de la JEFATURA ya no se reserva al abrir: se salta si no cabe (se mide entera antes de devolver; nunca corta a medias).
    //   Con la vuelta por regla dura (hasta 6) reservarla dejaría sin abrir al post y al carrusel con mesa de hoy (12,04 + 3,58 y 13,04 + 3,98 contra 15)
    expect(coberturaDelTope(conVuelta, 4)).toMatchObject({ requerido: 4.7, cubre: false })
    const { a } = await montar(conVuelta)
    expect(a.cuerpo).not.toHaveProperty('error')
  })

  it('calidadDelBorradorDeImagen: sin dato o mal escrito → low; size solo si es AxB', () => {
    expect(calidadDelBorradorDeImagen(undefined)).toEqual({ quality: 'low' })
    expect(calidadDelBorradorDeImagen({ imagen_borrador: { quality: '  ', size: 'grande' } })).toEqual({ quality: 'low' })
    expect(calidadDelBorradorDeImagen({ imagen_borrador: { quality: 'high', size: '1536x1024' } })).toEqual({ quality: 'high', size: '1536x1024' })
  })

  it('avisoDeBorradorDeImagenIncompleto: omitido o completo → null; en foto, una propuesta sin png NO falta (no se dibuja)', () => {
    expect(avisoDeBorradorDeImagenIncompleto('B', { omitido: 'x', propuestas: [{ id: 'P1', costo_usd: 0, laminas: [{ n: 1 }] }] }, 'carrusel')).toBeNull()
    expect(avisoDeBorradorDeImagenIncompleto('B', { propuestas: [{ id: 'P1', costo_usd: 0, laminas: [{ n: 1, png_url: 'https://x' }] }] }, 'carrusel')).toBeNull()
    expect(avisoDeBorradorDeImagenIncompleto('B', { propuestas: [{ id: 'P1', costo_usd: 0, laminas: [{ n: 1, imagen_url: 'https://x' }] }] }, 'post')).toBeNull()
    expect(avisoDeBorradorDeImagenIncompleto('B', { propuestas: [{ id: 'P1', costo_usd: 0, laminas: [{ n: 1 }] }] }, 'kit')).toMatch(/P1: láminas sin dibujo/)
  })
})
