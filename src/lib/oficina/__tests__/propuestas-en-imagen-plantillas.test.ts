/**
 * 17-nov · propuestas también en IMAGEN · tramo 2b · las plantillas con propuestas (solo en el código: NO se siembran) y el borrador de la foto (sin dibujo). US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { abrirEncargo, recibirDecisionDelDueno } from '../orquestador'
import { CARRUSEL_MESA, KIT_MESA, POST_MESA } from '../plantillas/mesa'
import { CARRUSEL_MESA_CON_PROPUESTAS, KIT_MESA_CON_PROPUESTAS, POST_MESA_CON_PROPUESTAS, PROPUESTAS_DE_IMAGEN, TOPE_DEL_BORRADOR_DE_IMAGEN_USD } from '../plantillas/imagen-propuestas'
import { coberturaDelTope } from '../topes-por-duracion'
import { propuestasDeLaPlantilla } from '../mesa/propuestas-imagen'
import { ARTEFACTO_BORRADOR_IMAGEN, correrBorradorDeImagen, type BorradoresDeImagen } from '../mesa/borrador-imagen'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import type { Encargo } from '../puertos'
import type { Plantilla } from '../tipos'
import { CLIENTE, PARTE, crearMemoria } from './memoria'
import { crearMesaEnMemoria, DIRECTORIO } from './mesa-memoria'
import { CONDICION_PROMPTS } from '../mesa/prompts'
import { BRIEF_CARRUSEL, CITAS_COMPLETAS, LAMINAS_OK, jugar, parteCon, seccionesDeLaminas, type Turno } from './mesa-arnes'

const TRIOS: Array<[string, Plantilla, Plantilla]> = [['kit_mesa', KIT_MESA, KIT_MESA_CON_PROPUESTAS], ['carrusel_mesa', CARRUSEL_MESA, CARRUSEL_MESA_CON_PROPUESTAS], ['post_mesa', POST_MESA, POST_MESA_CON_PROPUESTAS]]

describe('las plantillas de imagen con propuestas (solo código)', () => {
  it.each(TRIOS)('%s: mesa → borrador_imagen → aprobar_propuestas (2 vueltas); el resto igual; propuestas 3; tope × 3; la de hoy NO cambia', (familia, hoy, con) => {
    const antes = JSON.stringify(hoy)
    expect(con.familia).toBe(familia)
    const claves = con.pasos.map((p) => p.clave)
    const i = claves.indexOf('mesa')
    expect(claves.slice(i, i + 3)).toEqual(['mesa', 'borrador_imagen', 'aprobar_propuestas'])
    expect(claves.filter((c) => c !== 'borrador_imagen' && c !== 'aprobar_propuestas')).toEqual(hoy.pasos.map((p) => p.clave))
    expect(con.pasos[i + 1]).toMatchObject({ funcion: 'borrador_imagen', tope_usd: TOPE_DEL_BORRADOR_DE_IMAGEN_USD })
    expect(con.pasos[i + 2].vuelve_a).toMatchObject({ paso: 'mesa', max: 2 })
    expect(propuestasDeLaPlantilla(con)).toBe(PROPUESTAS_DE_IMAGEN)
    expect(con.limites.tope_encargo_usd).toBe(Number(hoy.limites.tope_encargo_usd) * 3)
    // la de hoy queda igual (no se comparten objetos)
    expect(JSON.stringify(hoy)).toBe(antes)
    expect(propuestasDeLaPlantilla(hoy)).toBe(1)
  })

  it.each(TRIOS)('🔴 %s: su tope cubre el peor caso (3 borradores + 2 rondas + la final + la vuelta de la jefatura): el encargo SE ABRE', (_f, _hoy, con) => {
    const c = coberturaDelTope(con, Number(con.limites.tope_encargo_usd))
    expect(c.cubre).toBe(true)
  })

  it('🔴 el carrusel con propuestas de punta a punta: 3 borradores, el dueño aprueba P2, la pieza llega a la bandeja sin cortarse', async () => {
    const TITULOS = ['El plato de la mañana', 'Lo de siempre, distinto', 'Hoy se cocina aquí']
    const propuesta = (i: number) => [`# Propuesta ${i + 1} · ${TITULOS[i]}`, `Concepto: camino ${i + 1} · Por qué: porque sí ${i + 1}`, seccionesDeLaminas(LAMINAS_OK.map(([rol, t, x, img], k) => [rol, k === 0 ? TITULOS[i] : t, x, img])), '## Pie', `Pie ${i + 1}.`, '## Etiquetas', '#plato #hoy'].join('\n')
    const TRES = [propuesta(0), propuesta(1), propuesta(2), CITAS_COMPLETAS].join('\n')
    const ING = '## P1-hook\nprompt uno\n## P2-hook\nprompt dos\n## P3-hook\nprompt tres'
    const M = crearMemoria({ parte: parteCon(BRIEF_CARRUSEL), plantilla: CARRUSEL_MESA_CON_PROPUESTAS })
    M.P.mesa = crearMesaEnMemoria(DIRECTORIO.map((t) => (t.agente === 'design-image-prompt-engineer' ? { ...t, pertinente_en: [...t.pertinente_en, `carrusel:${CONDICION_PROMPTS}`] } : t)))
    const tope = Number(CARRUSEL_MESA_CON_PROPUESTAS.limites.tope_encargo_usd)
    const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0100', dry_run: true, familia: 'carrusel_mesa', tope_usd: tope }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    const id = String(a.cuerpo.encargo_id)
    const responder = (t: Turno) => (t.tipo === 'integrar' || t.tipo === 'devolver_citas' ? { texto: TRES } : t.tipo === 'redactar_prompts' ? { texto: ING } : undefined)
    const { ultima } = await jugar(M, id, a, responder)
    expect(ultima.cuerpo.accion).toBe('esperar_dueno')
    const b = M.encargos.get(id)!.estado_del_motor.artefactos[ARTEFACTO_BORRADOR_IMAGEN]?.datos as unknown as BorradoresDeImagen
    expect(b.propuestas.map((p) => p.laminas.filter((l) => l.png_url).length)).toEqual([5, 5, 5])
    const d = await recibirDecisionDelDueno(M.P, id, { decision: 'aprobar', ronda: 1, propuesta_id: 'P2' })
    const fin = await jugar(M, id, d, responder)
    // llega a la bandeja (limpia o marcada por la jefatura simulada), NUNCA cortada por el tope
    expect(['encargo_en_bandeja', 'con_desacuerdo']).toContain(fin.ultima.cuerpo.resultado_para_la_sala)
    // (en la prueba la jefatura no está: la marca es «sin revisar», nunca el tope)
    expect(fin.ultima.cuerpo).toMatchObject({ estado: 'cerrado', decision: { estado: 'aprobada', propuesta_id: 'P2', ronda: 1 } })
    expect(JSON.stringify(fin.ultima.cuerpo.desacuerdos)).not.toMatch(/tope/)
    expect(M.encargos.get(id)!.estado).not.toBe('cerrado_por_tope')
    // la pieza final es la P2 (su titular en la 1.ª lámina dibujada en la cola)
    const ultimo = (M.llamadas.renderPedidos as Array<{ subcarpeta: string; slides: Array<{ headline: string }> }>).filter((p) => !p.subcarpeta.includes('/borrador/')).pop()!
    expect(ultimo.slides[0].headline).toBe(TITULOS[1])
  })
})

describe('el borrador de la FOTO (sin dibujo: la imagen sola)', () => {
  const enc = (artefactos: Record<string, unknown>): Encargo => ({ id: 'enc-1', client_id: CLIENTE, brief_id: 'B', dry_run: true, estado_del_motor: { ultimo: -1, pasos_ejecutados: 0, gasto_usd: 0, vueltas: {}, fichas: [], artefactos: Object.fromEntries(Object.entries(artefactos).map(([k, v]) => [k, { version: 1, datos: v }])) } } as unknown as Encargo)
  const pieza = (id: string, modo: 'generada' | 'real') => ({ id, nombre: id, texto: '', laminas: [{ n: 1, rol: 'pieza' }], artefactos: { visual_direction: { imagenes: [modo === 'real' ? { ref: 'pieza', modo, foto_id: 'f-01' } : { ref: 'pieza', modo }] }, prompts_validos: { por_ref: modo === 'generada' ? { pieza: { prompts: [{ prompt: `prompt ${id}` }] } } : {} }, pieza_post: {} } })
  it('🔴 la generada: imagen en baja como imagen_url; la foto propia: su url tal cual; NO se llama al dibujo', async () => {
    const M = crearMemoria({ plantilla: POST_MESA_CON_PROPUESTAS })
    const e = enc({ encargo: { F: { fotos: [{ id: 'f-01', url: 'https://fotos.test/f-01.jpg' }] } }, propuestas_imagen: { ronda: 1, clase: 'post_img', avisos: [], citas: '', propuestas: [pieza('P1', 'generada'), pieza('P2', 'real')] } })
    const r = await correrBorradorDeImagen(M.P, e, POST_MESA_CON_PROPUESTAS, 'post')
    expect(r.artefacto.propuestas.map((p) => p.laminas)).toEqual([[{ n: 1, imagen_url: 'https://dry.test/1.png' }], [{ n: 1, imagen_url: 'https://fotos.test/f-01.jpg' }]])
    expect(M.llamadas.render).toBe(0)
    expect(r.gastos).toHaveLength(1)
    expect(r.imagen_generada).toBe(true)
  })
})
