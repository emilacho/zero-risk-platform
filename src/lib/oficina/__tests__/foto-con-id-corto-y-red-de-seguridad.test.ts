/**
 * 26-nov · GO Lenovo 15:23Z (imágenes, puntos 1 a 4) · LA FOTO QUE EL EQUIPO NOMBRA ACORTADA, LA RED DE SEGURIDAD Y EL ORIGEN EN LA TARJETA. En seco, US$ 0.
 * Lo medido el 26-nov: la dirección escribió `foto:bf597cd8` y `foto:febd9334` (el comienzo del uuid); el borrador buscaba el id exacto y escribía «no tiene url»;
 * la historia llegó «sin dibujar» y la foto llegó a la aprobación sin imagen.
 */
import { describe, expect, it } from 'vitest'
import { abrirEncargo } from '../orquestador'
import { CARRUSEL_MESA } from '../plantillas/mesa'
import { PASO_APROBAR_PROPUESTAS } from '../plantillas/video-mesa'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { ARTEFACTO_BORRADOR_IMAGEN, FUNCION_BORRADOR_IMAGEN, type BorradoresDeImagen } from '../mesa/borrador-imagen'
import { ARTEFACTO_PROPUESTAS_IMAGEN, type PropuestasDeImagen } from '../mesa/propuestas-imagen'
import { fotosResueltas, laminasConLaFotoResuelta } from '../mesa/orquestador'
import { traducirPieza } from '../mesa/traductor'
import { avisoDeFotoQueNoSirve, fotoPorId, fuenteDeLaFoto, idEnteroDeFoto, resolverIdDeFoto, ROTULO_DE_FUENTE } from '../id-de-foto'
import { buscarFotoPropia } from '../video/pedido'
import { fotosPorImagen, otrasFotosDeLaImagen } from '../foto-de-referencia'
import { propuestasDeLaDecision } from '../../direccion/decisiones-propuestas'
import type { Plantilla } from '../tipos'
import { CLIENTE, PARTE, crearMemoria } from './memoria'
import { crearMesaEnMemoria, DIRECTORIO } from './mesa-memoria'
import { CONDICION_PROMPTS } from '../mesa/prompts'
import { BRIEF_CARRUSEL, CITAS_COMPLETAS, LAMINAS_OK, jugar, parteCon, seccionesDeLaminas, type Turno } from './mesa-arnes'

const UUID_A = 'bf597cd8-1111-4000-8000-000000000001'
const UUID_B = 'febd9334-2222-4000-8000-000000000002'
const UUID_C = 'febd0000-3333-4000-8000-000000000003'
const IDS = [UUID_A, UUID_B, UUID_C]

describe('la regla del id de foto (una sola, para toda la oficina)', () => {
  it('exacto (sin importar mayúsculas ni espacios), comienzo de UNA sola foto, ambiguo o desconocido', () => {
    expect(resolverIdDeFoto(UUID_A, IDS)).toEqual({ ok: true, id: UUID_A })
    expect(resolverIdDeFoto(` ${UUID_A.toUpperCase()} `, IDS)).toEqual({ ok: true, id: UUID_A })
    expect(resolverIdDeFoto('bf597cd8', IDS)).toEqual({ ok: true, id: UUID_A })
    expect(resolverIdDeFoto('febd9334', IDS)).toEqual({ ok: true, id: UUID_B })
    expect(resolverIdDeFoto('febd', IDS)).toEqual({ ok: false, motivo: 'ambigua', cuantas: 2 })
    expect(resolverIdDeFoto('zzzz9999', IDS)).toEqual({ ok: false, motivo: 'desconocida' })
    expect(resolverIdDeFoto('', IDS)).toEqual({ ok: false, motivo: 'desconocida' })
    expect(resolverIdDeFoto(null, IDS)).toEqual({ ok: false, motivo: 'desconocida' })
    expect(resolverIdDeFoto('bf597cd8', [])).toEqual({ ok: false, motivo: 'desconocida' })
  })
  it('el id entero o el mismo si no se resuelve; la foto de la lista', () => {
    expect(idEnteroDeFoto('bf597cd8', IDS)).toBe(UUID_A)
    expect(idEnteroDeFoto('febd', IDS)).toBe('febd')
    const fotos = IDS.map((id) => ({ id, url: `https://f.test/${id}.jpg` }))
    expect(fotoPorId(fotos, 'febd9334')).toEqual(fotos[1])
    expect(fotoPorId(fotos, 'febd')).toBeUndefined()
    expect(fotoPorId(null, 'febd9334')).toBeUndefined()
  })
  it('el video usa la misma regla (sin cambio de conducta)', () => {
    const propias = IDS.map((id) => ({ id, url: `https://f.test/${id}.jpg` }))
    expect(buscarFotoPropia('bf597cd8', propias)).toEqual({ url: `https://f.test/${UUID_A}.jpg` })
    expect(buscarFotoPropia('febd', propias)).toEqual({ ambigua: 2 })
    expect(buscarFotoPropia('zzzz', propias)).toBeNull()
  })
  it('🔴 el aviso dice la causa real: «no tiene url» SOLO si la foto existe sin dirección', () => {
    const fotos = [{ id: UUID_A, url: null }, { id: UUID_B, url: 'https://f.test/b.jpg' }, { id: UUID_C, url: 'https://f.test/c.jpg' }]
    expect(avisoDeFotoQueNoSirve('bf597cd8', 'e01', fotos)).toBe('la foto «bf597cd8» de «e01» no tiene url')
    expect(avisoDeFotoQueNoSirve('febd', 'pieza', fotos)).toBe('la foto «febd» de «pieza» es ambigua: 2 fotos del cliente empiezan así')
    expect(avisoDeFotoQueNoSirve('zzzz9999', 'pieza', fotos)).toBe('la foto «zzzz9999» de «pieza» no está entre las fotos propias del cliente')
  })
  it('las fotos de referencia del ingeniero también valen acortadas (base y otras)', () => {
    const fotos = IDS.map((id) => ({ id, url: `https://f.test/${id}.jpg` }))
    expect(fotosPorImagen(fotos, ['febd9334']).fotos[0]).toEqual(fotos[1])
    expect(fotosPorImagen(fotos, ['febd']).no_aptas).toEqual([{ i: 0, id: 'febd' }])
    expect(otrasFotosDeLaImagen(fotos, fotos[1], ['bf597cd8', 'febd9334'], [])).toEqual({ otras: [fotos[0]], no_aptas: [] })
    expect(otrasFotosDeLaImagen(fotos, null, ['febd'], []).no_aptas).toEqual(['febd'])
  })
})

describe('de dónde salió la foto propia (punto 4)', () => {
  it('imagen de tu web · cuadro de tu video · foto propia', () => {
    expect(fuenteDeLaFoto('web_imagen')).toBe(ROTULO_DE_FUENTE.web)
    expect(fuenteDeLaFoto('VIDEO_CAPTURA')).toBe(ROTULO_DE_FUENTE.video)
    expect(fuenteDeLaFoto('post_video')).toBe(ROTULO_DE_FUENTE.video)
    expect(fuenteDeLaFoto('post_image')).toBe(ROTULO_DE_FUENTE.propia)
    expect(fuenteDeLaFoto('maps_foto')).toBe(ROTULO_DE_FUENTE.propia)
    expect(fuenteDeLaFoto(null)).toBe(ROTULO_DE_FUENTE.propia)
    expect(ROTULO_DE_FUENTE).toEqual({ web: 'imagen de tu web', video: 'cuadro de tu video', propia: 'foto propia' })
  })
  it('la lámina de la tarjeta lleva la foto resuelta y su fuente; la que pasó a generada lo dice', () => {
    const otros = { visual_direction: { imagenes: [{ ref: 'hook', modo: 'real', foto_id: UUID_A }, { ref: 'problem', modo: 'generada' }, { ref: 'cta', modo: 'ninguna' }] } }
    const fotos = [{ id: UUID_A, tipo: 'web_imagen' }]
    const laminas = [{ rol: 'hook', foto: { origen: 'real' as const, foto_id: 'bf597cd8' } }, { rol: 'problem', foto: { origen: 'real' as const, foto_id: 'zzzz9999' } }, { rol: 'cta' }]
    expect(laminasConLaFotoResuelta(laminas, otros, fotos)).toEqual([
      { rol: 'hook', foto: { origen: 'real', foto_id: UUID_A, fuente: 'imagen de tu web' } },
      { rol: 'problem', foto: { origen: 'generada' } },
      { rol: 'cta' },
    ])
  })
})

describe('🔴 al traducir la mesa: id entero o RED DE SEGURIDAD (puntos 1 y 3)', () => {
  const pieza = (imagen: string) => ['## Pieza', 'Titular: El plato de hoy', 'Bajada: Hoy en la casa', `Qué se ve: el plato sobre la mesa de madera`, `Imagen: ${imagen}`, '## Pie', 'Pie.', '## Etiquetas', '#hoy'].join('\n')
  const fotos = [{ id: UUID_A, url: 'https://f.test/a.jpg' }, { id: UUID_B, url: null }, { id: UUID_C, url: 'https://f.test/c.jpg' }]
  it('el comienzo único se guarda entero, sin aviso', () => {
    const r = fotosResueltas(traducirPieza(pieza('foto:bf597cd8'), 'post'), fotos)
    expect(r.tr.imagenes[0]).toMatchObject({ ref: 'pieza', modo: 'real', foto_id: UUID_A })
    expect(r.avisos).toEqual([])
  })
  it('inexistente, ambigua o sin dirección: la lámina se GENERA con su escena y el aviso dice la causa', () => {
    for (const [id, causa] of [['zzzz9999', 'no está entre las fotos propias del cliente'], ['febd', 'es ambigua: 2 fotos del cliente empiezan así'], ['febd9334', 'no tiene url']]) {
      const r = fotosResueltas(traducirPieza(pieza(`foto:${id}`), 'post'), fotos)
      expect(r.tr.imagenes[0]).toMatchObject({ ref: 'pieza', modo: 'generada', descripcion: 'el plato sobre la mesa de madera' })
      expect(r.avisos).toEqual([`la foto «${id}» de «pieza» ${causa}: la lámina se genera con su escena`])
    }
  })
  it('🟡 CC6 a #1287 (m14) · una dirección que no empieza con http(s):// no sirve: la red dispara; http y https valen (la regla del borrador)', () => {
    for (const url of ['/storage/a.jpg', 'ftp://f.test/a.jpg', 'fotos.test/a.jpg']) {
      const r = fotosResueltas(traducirPieza(pieza(`foto:${UUID_A}`), 'post'), [{ id: UUID_A, url }])
      expect(r.tr.imagenes[0]).toMatchObject({ modo: 'generada' })
      expect(r.avisos).toEqual([`la foto «${UUID_A}» de «pieza» no tiene url: la lámina se genera con su escena`])
    }
    for (const url of ['http://f.test/a.jpg', 'HTTPS://f.test/a.jpg']) {
      expect(fotosResueltas(traducirPieza(pieza('foto:bf597cd8'), 'post'), [{ id: UUID_A, url }]).tr.imagenes[0]).toMatchObject({ modo: 'real', foto_id: UUID_A })
    }
  })
  it('sin la lista de fotos queda como lo escribió el equipo (compatibilidad)', () => {
    const tr = traducirPieza(pieza('foto:zzzz9999'), 'post')
    expect(fotosResueltas(tr, null).tr).toBe(tr)
  })
})

// ── de punta a punta en memoria (en seco): la mesa con 3 propuestas, el borrador y la tarjeta
const PASO_BORRADOR: Plantilla['pasos'][number] = { clave: 'borrador_imagen', tipo: 'codigo', quien: 'sala', funcion: FUNCION_BORRADOR_IMAGEN, condicion: { tipo: 'siempre' }, entrada: ['mesa'], salida_artefacto: ARTEFACTO_BORRADOR_IMAGEN, tope_usd: 0.3 } as Plantilla['pasos'][number]
const conBorrador = (): Plantilla => {
  const pasos = [...CARRUSEL_MESA.pasos]
  pasos.splice(pasos.findIndex((p) => p.clave === 'mesa') + 1, 0, PASO_BORRADOR, PASO_APROBAR_PROPUESTAS)
  return { ...CARRUSEL_MESA, limites: { ...CARRUSEL_MESA.limites, propuestas: { n: 3 } } as Plantilla['limites'], pasos }
}
/** la lámina 2 de cada propuesta con la imagen dada (la 1 sigue generada, como en el arnés) */
const propuesta = (i: number, imagenDeLaDos: string) => {
  const laminas = LAMINAS_OK.map(([rol, t, x, img], k) => [rol, k === 0 ? `Título ${i + 1}` : t, x, k === 1 ? imagenDeLaDos : img])
  return [`# Propuesta ${i + 1} · Camino ${i + 1}`, `Concepto: camino ${i + 1} · Por qué: porque sí ${i + 1}`, seccionesDeLaminas(laminas), '## Pie', `Pie ${i + 1}.`, '## Etiquetas', '#plato #hoy'].join('\n')
}
const INGENIERO = '## P1-hook\nPrompt: prompt uno: plate on wood\nReferencia: foto:062e foto:1e20\n## P2-hook\nprompt dos: steam\n## P3-hook\nprompt tres: the cook'
const CON_INGENIERO = DIRECTORIO.map((t) => (t.agente === 'design-image-prompt-engineer' ? { ...t, pertinente_en: [...t.pertinente_en, `carrusel:${CONDICION_PROMPTS}`] } : t))

describe('🔴 de punta a punta: el id acortado ya no deja la lámina sin imagen, y la que no existe se genera', () => {
  it('P1 nombra una foto propia por su comienzo (`foto:062e`), P2 por su id entero, P3 una que no existe: ninguna queda sin dibujar; la tarjeta dice el origen', async () => {
    const M = crearMemoria({ parte: parteCon(BRIEF_CARRUSEL), plantilla: conBorrador() })
    M.P.mesa = crearMesaEnMemoria(CON_INGENIERO)
    const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0100', dry_run: true, familia: 'carrusel_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    const id = String(a.cuerpo.encargo_id)
    const texto = [propuesta(0, 'foto:062e'), propuesta(1, 'foto:062ec4fa'), propuesta(2, 'foto:zzzz9999'), CITAS_COMPLETAS].join('\n')
    const responder = (t: Turno) => (t.tipo === 'integrar' || t.tipo === 'devolver_citas' ? { texto } : t.tipo === 'redactar_prompts' ? { texto: INGENIERO } : undefined)
    const { ultima } = await jugar(M, id, a, responder)
    expect(ultima.cuerpo.accion).toBe('esperar_dueno')
    const e = M.encargos.get(id)!.estado_del_motor
    const pi = e.artefactos[ARTEFACTO_PROPUESTAS_IMAGEN]?.datos as unknown as PropuestasDeImagen
    // la dirección visual guarda el id ENTERO; la que no existe pasó a generada, con aviso
    const real = (k: number) => (pi.propuestas[k].artefactos!.visual_direction.imagenes as Array<{ ref: string; modo: string; foto_id?: string }>).find((x) => x.ref === 'problem')
    expect(real(0)).toMatchObject({ modo: 'real', foto_id: '062ec4fa' })
    expect(real(1)).toMatchObject({ modo: 'real', foto_id: '062ec4fa' })
    expect(real(2)).toMatchObject({ modo: 'generada' })
    // 🟡 CC6 a #1287 (m7, m8) · las fotos de referencia que el ingeniero nombró acortadas quedan con su id entero
    const pv = pi.propuestas[0].artefactos!.prompts_validos as { por_ref: Record<string, { prompts: Array<{ prompt: string; foto_de_referencia?: string; otras_fotos_de_referencia?: string[] }> }> }
    expect(pv.por_ref.hook.prompts[0]).toMatchObject({ prompt: 'prompt uno: plate on wood', foto_de_referencia: '062ec4fa', otras_fotos_de_referencia: ['1e201f00'] })
    expect(pi.avisos.some((x) => x.includes('la foto «zzzz9999» de «problem» no está entre las fotos propias del cliente: la lámina se genera con su escena'))).toBe(true)
    // el borrador: la lámina 2 de P1 y P2 lleva la foto propia; la de P3, una generada; ninguna «no tiene url»
    const b = e.artefactos[ARTEFACTO_BORRADOR_IMAGEN]?.datos as unknown as BorradoresDeImagen
    expect(b.propuestas.map((p) => p.laminas[1].imagen_url)).toEqual(['https://fotos.test/062ec4fa.jpg', 'https://fotos.test/062ec4fa.jpg', expect.stringMatching(/^https:\/\/dry\.test\//)])
    expect(JSON.stringify(b)).not.toMatch(/no tiene url/)
    // la tarjeta: «foto propia» (la ficha de prueba no trae tipo) en P1 y P2; «imagen generada» en P3
    const d = propuestasDeLaDecision({ id, brief_id: 'BRF-0100' }, { artefactos: e.artefactos } as never, null)!
    expect(d.lista.map((p) => p.planos[1].origen_de_la_foto)).toEqual(['foto propia', 'foto propia', 'imagen generada'])
  })
})
