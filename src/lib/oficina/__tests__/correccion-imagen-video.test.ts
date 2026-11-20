/**
 * 20-nov · PUNTO 3 · tanda 2 (CC1 · certifican CC6 y CC7): la corrección de las IMÁGENES CLAVE del video, con los mismos 3 pasos de la tanda 1,
 * entre `imagenes_clave_final` y `revisar_imagenes_clave`. Diseño v3 de CC5 (a): «el mismo par de pasos entre la imagen clave de cada plano y el clip». En seco, sin red, US$ 0.
 */
import { describe, expect, it } from 'vitest'
import {
  AGENTE_QUE_CORRIGE_LA_IMAGEN, AGENTE_QUE_CORRIGE_LA_IMAGEN_CLAVE, ARTEFACTO_CORRECCIONES_DE_IMAGEN, ARTEFACTO_EDICIONES_DE_IMAGEN, ARTEFACTO_PEDIDO_DE_CORRECCION,
  INDICACION_DE_LA_CORRECCION_DEL_VIDEO, PASO_CORREGIR_IMAGEN, PASO_EDITAR_IMAGEN, PASO_MIRAR_CORRECCION, TOPE_DE_LA_CORRECCION_DEL_VIDEO_POR_SEGUNDO_USD, RESERVA_POR_VIDEO_DE_LA_CORRECCION_USD,
  TOPE_DE_LA_EDICION_DE_IMAGEN_CLAVE_POR_SEGUNDO_USD, TOPE_DE_LA_MIRADA_DE_IMAGEN_CLAVE_POR_SEGUNDO_USD, TOPE_FIJO_DE_LA_CORRECCION_DEL_VIDEO_USD, VUELTAS_DE_CORRECCION_IMAGEN,
  conCorreccionDeImagen, conCorreccionDeImagenClave, correccionesVigentes, dondeDe, editarImagenes, imagenesClaveConLaMejor, llaveDeLaEdicion, margenDeLaCorreccion, mirarCorreccion,
  loteDe, pedidoDeLaCorreccion, refDelPlano, saltoDeLaCorreccion, tareaDeLaCorreccion, turnosDeLaVueltaDelVideo, vistasDe, type Correcciones,
} from '../mesa/correccion-imagen'
import { PASO_IMAGENES_CLAVE_FINAL, PASO_REVISAR_IMAGENES_CLAVE, imagenesClaveVigentes } from '../video/imagen-clave'
import { VIDEO_MESA_POR_SEGUNDO as VIDEO_MESA_POR_SEGUNDO_CODIGO } from '../plantillas/video-mesa'
import { conVueltaPorReglaDura } from '../plantillas/vuelta-por-regla-dura'
import { aplicarTopesPorDuracion, coberturaDelTope } from '../topes-por-duracion'
import { validarPlantilla } from '../plantilla'
import type { Estado, Plantilla } from '../tipos'

const art = (datos: unknown, version = 1) => ({ version, version_consumida: 0, datos })
const FOTOS = [{ id: 'f-real', url: 'https://fotos.test/real.jpg' }, { id: 'f-2', url: 'https://fotos.test/2.jpg' }, { id: 'f-3', url: 'https://fotos.test/3.jpg' }]
const PLANOS = [
  { n: 1, url: 'https://img.test/ic-1.png', imagenes: ['https://img.test/ic-1.png'], prompt: 'Key frame for shot 1: ceviche en tazón de barro', foto_referencia_id: 'f-real', referencia_usada: true, otras_referencias_ids: ['f-real', 'f-2'], costo_usd: 0.04, generation_id: 'g1' },
  { n: 2, url: 'https://img.test/ic-2.png', imagenes: ['https://img.test/ic-2.png'], prompt: 'Key frame for shot 2: el local de noche', foto_referencia_id: null, referencia_usada: false, costo_usd: 0.04, generation_id: 'g2' },
  { n: 3, url: '', prompt: 'plano sin imagen', foto_referencia_id: null, referencia_usada: false, costo_usd: 0, generation_id: '' },
]
const IC = (planos: unknown[] = PLANOS, extra: Record<string, unknown> = {}) => ({ fase: 'final', calidad: { quality: 'max', size: '1024x1536' }, planos, hay_imagenes: true, ...extra })
function estado(o: { ic?: Record<string, unknown>; version?: number; extra?: Record<string, unknown>; gasto?: number } = {}): Estado {
  const artefactos: Record<string, unknown> = { encargo: art({ F: { fotos: FOTOS }, brief: { texto: 'un reel del ceviche' } }), [PASO_IMAGENES_CLAVE_FINAL]: art(o.ic ?? IC(), o.version ?? 4) }
  for (const [k, v] of Object.entries(o.extra ?? {})) artefactos[k] = art(v)
  return { artefactos, fichas: [], vueltas: {}, pasos_ejecutados: 9, gasto_usd: o.gasto ?? 1 } as unknown as Estado
}
const conArt = (e: Estado, k: string, v: unknown, version = 1): Estado => ({ ...e, artefactos: { ...(e.artefactos as Record<string, unknown>), [k]: art(v, version) } } as unknown as Estado)
const enc = (e: Estado, dry_run = false) => ({ id: '11111111-2222-3333-4444-555555555555', client_id: 'cli', dry_run, estado_del_motor: e }) as never
/** la fila viva: la del código con la vuelta de la jefatura a la mesa en 6 (regla dura, 202611181530) */
const VIDEO_MESA_POR_SEGUNDO = ((pl) => ({ ...pl, limites: { ...pl.limites, video: { ...(pl.limites.video as Record<string, unknown>), segundos_max: 120 } } }) as Plantilla)(conVueltaPorReglaDura(VIDEO_MESA_POR_SEGUNDO_CODIGO))
/** (la fila viva tiene la pieza más larga en 120 s: 202611190500) */
const PL = conCorreccionDeImagenClave(VIDEO_MESA_POR_SEGUNDO)
const CARGADA = aplicarTopesPorDuracion(PL).plantilla

function puertos(o: { mirada?: (n: number, urls: string[]) => string } = {}) {
  const llamadas = { imagen: [] as Array<Record<string, unknown>>, revisor: [] as Array<{ urls: string[]; dry_run: boolean }> }
  let n = 0
  const P = {
    imagen: async (p: Record<string, unknown>) => { llamadas.imagen.push(p); return { ok: true, url: `https://img.test/ed-${llamadas.imagen.length}.png`, generation_id: `ge${llamadas.imagen.length}`, costo_usd: 0.05 } },
    imagenYaPedida: async () => null,
    revisor: async (p: { imagenes_urls: string[]; dry_run: boolean }) => { llamadas.revisor.push({ urls: p.imagenes_urls, dry_run: p.dry_run }); return { ok: true, texto: (o.mirada ?? (() => '{"mejor":"B","queda_bien":true,"lectura":"bien"}'))(n++, p.imagenes_urls), costo_usd: 0.004 } },
  }
  return { P: P as never, llamadas }
}
/** una vuelta entera: pide cambios en los planos que se pasen, edita y mira */
async function unaVuelta(e: Estado, cambios: Record<string, string>, o: Parameters<typeof puertos>[0] = {}) {
  const ped = pedidoDeLaCorreccion(e, { imagenes: Object.entries(cambios).map(([ref, c]) => ({ ref, elegida: 0, cambios: c })) })
  const e1 = conArt(e, ARTEFACTO_PEDIDO_DE_CORRECCION, ped.artefacto)
  const { P, llamadas } = puertos(o)
  const ed = await editarImagenes(P, enc(e1), CARGADA)
  const e2 = conArt(e1, ARTEFACTO_EDICIONES_DE_IMAGEN, ed.res.artefacto)
  const m = await mirarCorreccion(P, enc(e2), CARGADA)
  return { e2, ed, m, llamadas }
}

describe('tanda 2 · la fuente son las imágenes clave finales', () => {
  it('dónde: el video tiene imágenes clave finales; la mesa de imagen, no', () => {
    expect(dondeDe(estado())).toBe('video')
    expect(dondeDe({ artefactos: { imagenes: art({ items: [] }) } } as never)).toBe('final')
  })
  it('🔴 un plano por imagen (`plano-n`), la tanda es la versión del artefacto, y el plano sin imagen no entra', () => {
    const c = correccionesVigentes(estado({ version: 4 }))
    expect(c.donde).toBe('video')
    expect(c.intento_imagenes).toBe(4)
    expect(Object.keys(c.imagenes)).toEqual([refDelPlano(1), refDelPlano(2)])
    expect(c.imagenes['plano-1']).toMatchObject({ prompt: PLANOS[0].prompt, foto_real_id: 'f-real', versiones: [{ vuelta: 0, url: PLANOS[0].url, generation_id: 'g1' }], cerrada: false })
  })
  it('el director ve cada imagen clave y la foto real; el pedido dice que es el primer cuadro del clip y que NO califica', () => {
    const t = tareaDeLaCorreccion(estado(), { contrato: '{}', fotos: FOTOS })
    expect(t.task).toMatch(/director de la mesa/)
    expect(t.task).toMatch(/primer cuadro del clip/)
    expect(t.task).toMatch(/No calificas/)
    expect(t.images).toEqual([PLANOS[0].url, FOTOS[0].url, PLANOS[1].url])
  })
})

describe('tanda 2 · la edición', () => {
  it('🔴 edita SOBRE la imagen clave, con la calidad y la forma de la FINAL (DATO de la plantilla) y las otras fotos que viajaron con ella (sin repetir la base)', async () => {
    const { llamadas } = await unaVuelta(estado(), { 'plano-1': 'el tazón es de barro' })
    expect(llamadas.imagen).toHaveLength(1)
    const p = llamadas.imagen[0]
    expect(p.foto).toEqual({ id: 'version-0', url: PLANOS[0].url })
    expect(p).toMatchObject({ size: '1024x1536', quality: 'max', llave: llaveDeLaEdicion('11111111-2222-3333-4444-555555555555', 4, 'plano-1', 1) })
    expect(p.otras_fotos).toEqual([FOTOS[0], FOTOS[1]])
    expect(String(p.prompt)).toMatch(/Change ONLY this.*el tazón es de barro/)
  })
  it('la calidad sale de la plantilla: si la fila dice otra, se usa esa', async () => {
    const e = conArt(estado(), ARTEFACTO_PEDIDO_DE_CORRECCION, pedidoDeLaCorreccion(estado(), { imagenes: [{ ref: 'plano-2', elegida: 0, cambios: 'más luz' }] }).artefacto)
    const { P, llamadas } = puertos()
    await editarImagenes(P, enc(e), { limites: { imagen_clave: { final: { quality: 'high', size: '1024x1792' } } } } as never)
    expect(llamadas.imagen[0]).toMatchObject({ quality: 'high', size: '1024x1792' })
  })
  it('🔴 la mesa de imagen NO manda calidad (sigue como en la tanda 1)', async () => {
    const e = { artefactos: { encargo: art({ F: { fotos: FOTOS } }), imagenes: art({ ultimo_intento: 1, items: [{ ref: 'hook', intento: 1, url: 'https://img.test/h.png', generation_id: 'g', prompt: 'p' }] }) }, fichas: [], vueltas: {}, pasos_ejecutados: 1, gasto_usd: 0 } as unknown as Estado
    const e1 = conArt(e, ARTEFACTO_PEDIDO_DE_CORRECCION, pedidoDeLaCorreccion(e, { imagenes: [{ ref: 'hook', elegida: 0, cambios: 'x' }] }).artefacto)
    const { P, llamadas } = puertos()
    await editarImagenes(P, enc(e1), CARGADA)
    expect(llamadas.imagen[0]).not.toHaveProperty('quality')
    expect(llamadas.imagen[0]).not.toHaveProperty('size')
  })
})

describe('tanda 2 · la mirada de otro proveedor devuelve la mejor a las imágenes clave', () => {
  it('🔴 al terminar, `imagenes_clave_final` apunta a la mejor (url e imagenes), con la marca de la tanda; los demás planos quedan igual', async () => {
    const { m } = await unaVuelta(estado(), { 'plano-1': 'el tazón es de barro' })
    expect(m.res.artefacto?.sigue).toBe(false)
    const nuevo = m.res.otros_artefactos?.[PASO_IMAGENES_CLAVE_FINAL] as Record<string, unknown>
    expect(m.res.otros_artefactos).not.toHaveProperty('imagenes')
    const planos = nuevo.planos as Array<Record<string, unknown>>
    expect(planos[0]).toMatchObject({ n: 1, url: 'https://img.test/ed-1.png', imagenes: ['https://img.test/ed-1.png'], generation_id: 'ge1', corregida_en_la_vuelta: 1, generada_url: PLANOS[0].url, foto_referencia_id: 'f-real' })
    expect(planos[1]).toEqual(PLANOS[1])
    expect(planos[2]).toEqual(PLANOS[2])
    expect(nuevo).toMatchObject({ fase: 'final', hay_imagenes: true, tanda_de_correccion: 4 })
  })
  it('🔴 lo que leen la revisión, el clip y la mirada del video (`imagenesClaveVigentes`) es la corregida', async () => {
    const { m } = await unaVuelta(estado(), { 'plano-1': 'el tazón es de barro' })
    const e = conArt(estado(), PASO_IMAGENES_CLAVE_FINAL, m.res.otros_artefactos![PASO_IMAGENES_CLAVE_FINAL], 5)
    expect(imagenesClaveVigentes(e)?.planos[0].url).toBe('https://img.test/ed-1.png')
  })
  it('🔴 la reescritura NO abre una tanda nueva (la marca manda sobre la versión); el paso que vuelve a correr, SÍ', async () => {
    const { m } = await unaVuelta(estado(), { 'plano-1': 'x' })
    const e = conArt(conArt(estado(), ARTEFACTO_CORRECCIONES_DE_IMAGEN, m.res.artefacto), PASO_IMAGENES_CLAVE_FINAL, m.res.otros_artefactos![PASO_IMAGENES_CLAVE_FINAL], 5)
    const c = correccionesVigentes(e)
    expect(c.intento_imagenes).toBe(4)
    expect(c.vuelta).toBe(1)
    expect(Object.values(c.imagenes).every((i) => i.cerrada)).toBe(true)
    // la jefatura devolvió la pieza: `imagenes_clave_final` vuelve a correr y deja datos nuevos, sin la marca, en otra versión
    const rehecha = conArt(e, PASO_IMAGENES_CLAVE_FINAL, IC(), 6)
    const c2 = correccionesVigentes(rehecha)
    expect(c2).toMatchObject({ intento_imagenes: 6, vuelta: 0 })
    expect(Object.values(c2.imagenes).every((i) => !i.cerrada)).toBe(true)
    expect(llaveDeLaEdicion('e', 6, 'plano-1', 1)).not.toBe(llaveDeLaEdicion('e', 4, 'plano-1', 1))
  })
  it('🔴 registro: una fila por (plano, vuelta) con «donde: video» y el director como quien pidió', async () => {
    const { m } = await unaVuelta(estado(), { 'plano-1': 'x' })
    const c = m.res.artefacto as unknown as Correcciones
    expect(c.donde).toBe('video')
    expect(c.filas.map((f) => [f.ref, f.vuelta, f.donde, f.agente, f.motivo_de_cierre])).toEqual([
      ['plano-1', 1, 'video', AGENTE_QUE_CORRIGE_LA_IMAGEN_CLAVE, 'queda_bien'],
      ['plano-2', 1, 'video', AGENTE_QUE_CORRIGE_LA_IMAGEN_CLAVE, 'sin_cambios'],
    ])
  })
  it('🔴 si la mirada prefiere la anterior, el plano queda con la generada y `imagenes_clave_final` no cambia su url', async () => {
    const { m } = await unaVuelta(estado(), { 'plano-1': 'x' }, { mirada: (_n, urls) => (urls.length === 2 ? '{"mejor":"A","queda_bien":false,"lectura":"empeoró"}' : '{"queda_bien":true,"lectura":"bien"}') })
    const planos = (m.res.otros_artefactos?.[PASO_IMAGENES_CLAVE_FINAL] as { planos: unknown[] }).planos
    expect(planos[0]).toEqual(PLANOS[0])
  })
  it('mientras haya otra vuelta no se reescribe nada', async () => {
    const { m } = await unaVuelta(estado({ gasto: 1 }), { 'plano-1': 'x' }, { mirada: () => '{"mejor":"B","queda_bien":false,"lectura":"falta"}' })
    expect(m.res.artefacto?.sigue).toBe(true)
    expect(m.res.otros_artefactos).toBeUndefined()
  })
  it('imagenesClaveConLaMejor sin ninguna editada deja los planos iguales y pone la marca', () => {
    const c = correccionesVigentes(estado())
    expect(imagenesClaveConLaMejor(estado(), c)).toEqual({ ...IC(), tanda_de_correccion: 4 })
  })
  it('en ensayo la corrección se salta (imágenes simuladas) y la mirada no reescribe nada', async () => {
    const e = estado()
    const s = saltoDeLaCorreccion(e, true)
    expect(s?.artefacto).toMatchObject({ en_ensayo: true, por_ref: {} })
    const { P, llamadas } = puertos()
    const m = await mirarCorreccion(P, enc(conArt(e, ARTEFACTO_PEDIDO_DE_CORRECCION, s!.artefacto), true), CARGADA)
    expect(llamadas.revisor).toHaveLength(0)
    expect(m.res.otros_artefactos).toBeUndefined()
  })
})

describe('tanda 2 · la vuelta se parte en turnos si no cabe en un pedido (Lenovo 16:55Z, lectura de CC5)', () => {
  /** n planos, cada uno con su foto real propia (2 imágenes por plano en el pedido) */
  const planos = (n: number, real: (k: number) => string | null = (k) => `f-${k}`) => Array.from({ length: n }, (_, k) => ({ n: k + 1, url: `https://img.test/ic-${k + 1}.png`, imagenes: [`https://img.test/ic-${k + 1}.png`], prompt: `plano ${k + 1}`, foto_referencia_id: real(k + 1), referencia_usada: !!real(k + 1), costo_usd: 0.04, generation_id: `g${k + 1}` }))
  const fotos = (n: number) => Array.from({ length: n }, (_, k) => ({ id: `f-${k + 1}`, url: `https://fotos.test/${k + 1}.jpg` }))
  const est = (n: number, real?: (k: number) => string | null, gasto = 1) => {
    const e = estado({ ic: IC(planos(n, real)), gasto })
    return conArt(e, 'encargo', { F: { fotos: fotos(n) } })
  }
  it('🔴 en el video el director ve SOLO la elegida (más su foto real), también después de una edición', () => {
    const c = correccionesVigentes(est(1))
    const i = c.imagenes['plano-1']
    i.versiones.push({ vuelta: 1, url: 'https://img.test/ed.png', generation_id: 'ge' })
    i.mejor = 0
    expect(vistasDe(i, 'video')).toEqual([0])
    expect(vistasDe(i)).toEqual([0, 1])
  })
  it('🔴 12 planos con su foto: el primer turno lleva 10 (20 imágenes), el segundo los 2 que faltan; la vuelta NO avanza hasta terminar', async () => {
    const e = est(12)
    expect(loteDe(correccionesVigentes(e)).map((i) => i.ref)).toEqual(Array.from({ length: 10 }, (_, k) => `plano-${k + 1}`))
    expect(tareaDeLaCorreccion(e, { contrato: '{}', fotos: fotos(12) }).images).toHaveLength(20)
    // turno 1: nadie pide cambios y la mirada dice que falta
    const { P } = puertos({ mirada: () => '{"queda_bien":false,"lectura":"falta"}' })
    const e1 = conArt(e, ARTEFACTO_PEDIDO_DE_CORRECCION, pedidoDeLaCorreccion(e, { imagenes: [] }).artefacto)
    const m1 = await mirarCorreccion(P, enc(e1), CARGADA)
    const c1 = m1.res.artefacto as unknown as Correcciones
    expect(c1).toMatchObject({ vuelta: 0, sigue: true })
    expect(c1.hechas_en_la_vuelta).toHaveLength(10)
    expect(m1.res.otros_artefactos).toBeUndefined()
    // turno 2: los 2 que faltan, en la MISMA vuelta (la llave lleva la vuelta 1)
    const e2 = conArt(e, ARTEFACTO_CORRECCIONES_DE_IMAGEN, c1)
    expect(loteDe(correccionesVigentes(e2)).map((i) => i.ref)).toEqual(['plano-11', 'plano-12'])
    const ped2 = pedidoDeLaCorreccion(e2, { imagenes: [{ ref: 'plano-11', elegida: 0, cambios: 'más luz' }] })
    expect(ped2.artefacto).toMatchObject({ vuelta: 1 })
    expect(Object.keys((ped2.artefacto as { por_ref: object }).por_ref)).toEqual(['plano-11', 'plano-12'])
    const e3 = conArt(e2, ARTEFACTO_PEDIDO_DE_CORRECCION, ped2.artefacto)
    const ed = await editarImagenes(P, enc(e3), CARGADA)
    expect((ed.res.artefacto as { por_ref: Record<string, { llave: string }> }).por_ref['plano-11'].llave).toBe(llaveDeLaEdicion('11111111-2222-3333-4444-555555555555', 4, 'plano-11', 1))
    const m2 = await mirarCorreccion(P, enc(conArt(e3, ARTEFACTO_EDICIONES_DE_IMAGEN, ed.res.artefacto)), CARGADA)
    const c2 = m2.res.artefacto as unknown as Correcciones
    // terminó la vuelta 1 de TODAS: ahora sí avanza, y la vuelta 2 empieza otra vez por el plano 1
    expect(c2).toMatchObject({ vuelta: 1, hechas_en_la_vuelta: [] })
    expect(c2.filas.filter((f) => f.vuelta === 1)).toHaveLength(12)
    expect(loteDe(correccionesVigentes(conArt(e, ARTEFACTO_CORRECCIONES_DE_IMAGEN, c2)))[0].ref).toBe('plano-1')
  })
  it('🔴 la misma foto real en varios planos cuenta UNA vez: 15 planos con la misma foto caben en un solo turno (16 imágenes)', () => {
    const e = est(15, () => 'f-1')
    const c = correccionesVigentes(e)
    expect(loteDe(c)).toHaveLength(15)
    const t = tareaDeLaCorreccion(e, { contrato: '{}', fotos: fotos(15) })
    expect(t.images).toHaveLength(16)
    expect(t.task).toMatch(/ya mostrada arriba/)
  })
  it('🔴 a mitad de una vuelta, si el próximo turno no cabe en el tope, TODAS las pendientes salen con su mejor y «no_cupo» (también las que no pasaron por la vuelta)', async () => {
    const e = est(12, undefined, CARGADA.limites.tope_encargo_usd - 1)
    const { P } = puertos({ mirada: () => '{"queda_bien":false,"lectura":"falta"}' })
    const m = await mirarCorreccion(P, enc(conArt(e, ARTEFACTO_PEDIDO_DE_CORRECCION, pedidoDeLaCorreccion(e, { imagenes: [] }).artefacto)), CARGADA)
    const c = m.res.artefacto as unknown as Correcciones
    expect(c.sigue).toBe(false)
    expect(Object.values(c.imagenes).map((i) => i.motivo_de_cierre)).toEqual(Array(12).fill('no_cupo'))
    expect(m.res.otros_artefactos?.[PASO_IMAGENES_CLAVE_FINAL]).toBeDefined()
  })
  it('🔴 a mitad de la vuelta 3 no se cierra por «tope_de_vueltas» lo que todavía no tuvo su tercera vuelta', async () => {
    const e0 = est(12)
    const c0 = correccionesVigentes(e0)
    const e = conArt(e0, ARTEFACTO_CORRECCIONES_DE_IMAGEN, { ...c0, vuelta: 2 })
    const { P } = puertos({ mirada: () => '{"queda_bien":false,"lectura":"falta"}' })
    const m = await mirarCorreccion(P, enc(conArt(e, ARTEFACTO_PEDIDO_DE_CORRECCION, pedidoDeLaCorreccion(e, { imagenes: [] }).artefacto)), CARGADA)
    const c = m.res.artefacto as unknown as Correcciones
    expect(c.sigue).toBe(true)
    expect(c.imagenes['plano-1'].motivo_de_cierre).toBe('tope_de_vueltas')
    expect(c.imagenes['plano-11'].cerrada).toBe(false)
  })
  it('la mesa de imagen no se parte si cabe (como en la tanda 1): un turno con todas', () => {
    const e = { artefactos: { encargo: art({ F: { fotos: FOTOS } }), imagenes: art({ ultimo_intento: 1, items: [1, 2, 3].map((k) => ({ ref: `r${k}`, intento: 1, url: `https://img.test/${k}.png`, generation_id: `g${k}`, prompt: 'p' })) }) }, fichas: [], vueltas: {}, pasos_ejecutados: 1, gasto_usd: 0 } as unknown as Estado
    expect(loteDe(correccionesVigentes(e))).toHaveLength(3)
  })
  it('los turnos por vuelta salen del largo: un plano por segundo, 2 imágenes por plano, 20 por pedido', () => {
    expect([10, 15, 30, 120].map((s) => turnosDeLaVueltaDelVideo(s))).toEqual([1, 2, 3, 12])
  })
  it('🔴 el validador abre el techo por turno: con 12 turnos el techo de seguridad es 3 × 12 × (1 + 9) = 360 (encima de la cuenta exacta, 350, como en la mesa 21 sobre 14): acepta 360 y no 361; sin el dato, vuelve a 3 por pasada (30)', () => {
    const con = (max: number) => ({ ...PL, pasos: PL.pasos.map((p) => (p.clave === PASO_MIRAR_CORRECCION ? { ...p, vuelve_a: { ...p.vuelve_a!, max } } : p)) }) as Plantilla
    const err = (pl: Plantilla) => validarPlantilla(pl).filter((x) => /mirar_correccion.*vuelve_a\.max/.test(x))
    expect(err(con(360))).toEqual([])
    expect(err(con(361))).toHaveLength(1)
    const sinTurnos = { ...con(31), limites: { ...PL.limites, turnos_de_correccion_imagen: undefined } } as unknown as Plantilla
    expect(err(sinTurnos)).toHaveLength(1)
  })
})

describe('tanda 2 · por el camino REAL del orquestador', () => {
  it('🔴 el director pide un cambio: el orquestador edita (con la calidad final), la mirada decide, `imagenes_clave_final` queda con la corregida y la revisión de siempre la ve', async () => {
    const { crearMemoria } = await import('./memoria')
    const { recibirResultado } = await import('../orquestador')
    // una calidad final PROPIA de la fila (no la de por omisión): así se ve que la edición la lee de la plantilla que le pasa el orquestador
    const pl = { ...CARGADA, limites: { ...CARGADA.limites, imagen_clave: { final: { quality: 'high', size: '1024x1792' } } }, pasos: CARGADA.pasos.map((p) => ({ ...p, condicion: p.condicion ?? { tipo: 'siempre' } })) } as Plantilla
    const M = crearMemoria({ plantilla: pl })
    M.revisorTexto = () => ({ ok: true, texto: '{"mejor":"B","queda_bien":true,"lectura":"ahora sí es de barro"}', costo_usd: 0.004, modelo: 'revisor-simulado' })
    const id = '00000000-0000-4000-8000-000000000778'
    const iFinal = pl.pasos.findIndex((p) => p.clave === PASO_IMAGENES_CLAVE_FINAL)
    const e0 = { ...estado({ extra: { guion: { planos: [{ n: 1, desde: 0, hasta: 3 }, { n: 2, desde: 3, hasta: 6 }], segundos: 6 } } }), ultimo: iFinal, pasos_ejecutados: iFinal + 1 } as unknown as Estado
    M.encargos.set(id, { id, client_id: 'cli', parte_id: 'p', brief_id: 'b', tipo_de_grupo: pl.tipo, familia: pl.familia, version_encargo: 1, estado: 'en_paso', estado_del_motor: e0, con_desacuerdo: false, imagen_generada: true, tope_usd: pl.limites.tope_encargo_usd, gasto_usd: 1, dry_run: false, sala_ref: null, salida_output_id: null, hitl_queue_id: null } as never)
    // el turno del motor sale de los pasos ejecutados (`turnoDe`): el del director es el siguiente
    const n = iFinal + 2
    M.turnos.set(id, new Map([[n, { n, paso: PASO_CORREGIR_IMAGEN, tipo: 'agente', agente: AGENTE_QUE_CORRIGE_LA_IMAGEN_CLAVE, estado: 'corriendo', dispatch_key: `${id}:${n}`, cost_usd: 0 } as never]]))
    const r = await recibirResultado(M.P, id, n, { texto: '{"imagenes":[{"ref":"plano-1","elegida":0,"cambios":"el tazón es de barro"}]}', costo_usd: 0.02 })
    const enc = M.encargos.get(id)!
    expect(enc.estado).not.toBe('fallido')
    // una edición (solo el plano 1), con la calidad de la imagen clave final
    expect(M.llamadas.imagen).toBe(1)
    expect(M.llamadas.imagenCalidades[0]).toMatchObject({ size: '1024x1792', quality: 'high' })
    expect(M.llamadas.imagenFotos[0]).toBe('version-0')
    // la mirada de otro proveedor miró las 2 imágenes pendientes (plano 1 con A/B; plano 2 la única)
    expect(M.llamadas.revisor).toBe(2)
    const ic = (enc.estado_del_motor.artefactos as unknown as Record<string, { datos: { planos: Array<{ n: number; url: string; corregida_en_la_vuelta?: number }>; tanda_de_correccion?: number } }>)[PASO_IMAGENES_CLAVE_FINAL].datos
    expect(ic.planos[0]).toMatchObject({ n: 1, corregida_en_la_vuelta: 1 })
    expect(ic.planos[0].url).not.toBe(PLANOS[0].url)
    expect(ic.planos[1].url).toBe(PLANOS[1].url)
    expect(ic.tanda_de_correccion).toBe(4)
    // la cola sigue: el siguiente turno es la revisión de siempre de las imágenes clave, y ve la corregida
    const turno = (r as unknown as { cuerpo: { accion: string; turno: { paso: string; pedido: { images?: string[] } } } }).cuerpo
    expect(turno.accion).toBe('esperar')
    expect(turno.turno.paso).toBe(PASO_REVISAR_IMAGENES_CLAVE)
    expect(JSON.stringify(turno.turno.pedido)).toContain(ic.planos[0].url)
  })
})

describe('tanda 2 · la plantilla del video', () => {
  const i = PL.pasos.findIndex((p) => p.clave === PASO_IMAGENES_CLAVE_FINAL)
  it('🔴 los tres pasos van entre `imagenes_clave_final` y `revisar_imagenes_clave`, ubicados por clave, con la condición de la revisión', () => {
    expect(PL.pasos.slice(i, i + 5).map((p) => p.clave)).toEqual([PASO_IMAGENES_CLAVE_FINAL, PASO_CORREGIR_IMAGEN, PASO_EDITAR_IMAGEN, PASO_MIRAR_CORRECCION, PASO_REVISAR_IMAGENES_CLAVE])
    const rev = PL.pasos[i + 4]
    for (const p of PL.pasos.slice(i + 1, i + 4)) expect(p.condicion).toEqual(rev.condicion)
    expect(rev.condicion).toEqual({ tipo: 'si_artefacto', artefacto: PASO_IMAGENES_CLAVE_FINAL, campo: 'hay_imagenes', igual: true })
  })
  it('🔴 corrige el director de la mesa con su indicación; la fuente es `imagenes_clave_final`', () => {
    expect(PL.pasos[i + 1]).toMatchObject({ quien: AGENTE_QUE_CORRIGE_LA_IMAGEN_CLAVE, tipo: 'agente', entrada: [PASO_IMAGENES_CLAVE_FINAL], tope_usd: 0.75 })
    expect(PL.indicaciones[AGENTE_QUE_CORRIGE_LA_IMAGEN_CLAVE]).toContainEqual(INDICACION_DE_LA_CORRECCION_DEL_VIDEO)
    expect(PL.indicaciones[AGENTE_QUE_CORRIGE_LA_IMAGEN] ?? []).toEqual([])
  })
  it('🔴 la edición y la mirada crecen por segundo (0,2/s y 0,26/s), con tope fijo 0', () => {
    expect(PL.pasos[i + 2]).toMatchObject({ tope_usd: 0, tope_usd_por_segundo: TOPE_DE_LA_EDICION_DE_IMAGEN_CLAVE_POR_SEGUNDO_USD })
    expect(PL.pasos[i + 3]).toMatchObject({ tope_usd: 0, tope_usd_por_segundo: TOPE_DE_LA_MIRADA_DE_IMAGEN_CLAVE_POR_SEGUNDO_USD })
    const at15 = CARGADA.pasos.filter((p) => [PASO_EDITAR_IMAGEN, PASO_MIRAR_CORRECCION].includes(p.clave)).map((p) => p.tope_usd)
    // a 120 s (la fila viva): 0,2 × 120 y 0,26 × 120
    expect(at15).toEqual([24, 31.2])
  })
  it('🔴 las vueltas que la envuelven (revisión 1, pedido 1, mirada del video 1, jefatura 6) y los turnos de la vuelta (12 a 120 s) dan techo (3 × 12 − 1) × (1 + 9) = 350 y margen +1052', () => {
    const vueltas = VIDEO_MESA_POR_SEGUNDO.pasos.filter((p) => p.vuelve_a?.paso === 'mesa').map((p) => [p.clave, p.vuelve_a!.max])
    expect(vueltas).toEqual(expect.arrayContaining([[PASO_REVISAR_IMAGENES_CLAVE, 1], ['pedido', 1], ['mirar_video', 1], ['jefatura', 6], ['aprobar_propuestas', 2]]))
    expect(PL.pasos[i + 3].vuelve_a).toEqual({ paso: PASO_CORREGIR_IMAGEN, max: 350, si: { tipo: 'si_artefacto', artefacto: ARTEFACTO_CORRECCIONES_DE_IMAGEN, campo: 'sigue', igual: true } })
    expect(PL.limites.margen).toBe(Number(VIDEO_MESA_POR_SEGUNDO.limites.margen) + margenDeLaCorreccion(350))
    expect(margenDeLaCorreccion(350)).toBe(1052)
    expect((PL.limites as Record<string, unknown>).turnos_de_correccion_imagen).toBe(12)
    expect(PL.limites.vueltas_de_correccion_imagen).toBe(VUELTAS_DE_CORRECCION_IMAGEN)
  })
  it('🔴 la reserva por pieza de video_mesa sube con lo esperado de la corrección (+1,6; punto 1 de CC6) y sin dato no se inventa', () => {
    expect(RESERVA_POR_VIDEO_DE_LA_CORRECCION_USD).toBe(1.6)
    expect(PL.limites.reserva_por_pieza_usd).toBe(+(Number(VIDEO_MESA_POR_SEGUNDO.limites.reserva_por_pieza_usd) + 1.6).toFixed(4))
    const sin = conCorreccionDeImagenClave({ ...VIDEO_MESA_POR_SEGUNDO, limites: { ...VIDEO_MESA_POR_SEGUNDO.limites, reserva_por_pieza_usd: undefined } } as unknown as Plantilla)
    expect(sin.limites.reserva_por_pieza_usd).toBeUndefined()
  })
  it('🔴 el tope del encargo suma una pasada: 0,75 fijo y 0,535/s en cada resolución (edición 0,2 + mirada 0,26 + el director de los turnos 0,075)', () => {
    expect(PL.limites.tope_encargo_usd).toBe(+(VIDEO_MESA_POR_SEGUNDO.limites.tope_encargo_usd + TOPE_FIJO_DE_LA_CORRECCION_DEL_VIDEO_USD).toFixed(4))
    expect(TOPE_DE_LA_CORRECCION_DEL_VIDEO_POR_SEGUNDO_USD).toBe(0.535)
    const antes = VIDEO_MESA_POR_SEGUNDO.limites.tope_encargo_usd_por_segundo as Record<string, number>
    expect(PL.limites.tope_encargo_usd_por_segundo).toEqual({ '720p': +(antes['720p'] + 0.535).toFixed(4), '1080p': +(antes['1080p'] + 0.535).toFixed(4) })
  })
  it('🔴 a 15 s cubre el peor caso con la corrección (los regresos se saltan si no caben)', () => {
    const tope = CARGADA.limites.tope_encargo_usd
    const c = coberturaDelTope(CARGADA, tope)
    expect(c.cubre).toBe(true)
  })
  it('es idempotente, no toca la de entrada y sin el par de anclas se niega', () => {
    const antes = structuredClone(VIDEO_MESA_POR_SEGUNDO)
    expect(conCorreccionDeImagenClave(PL)).toEqual(PL)
    expect(VIDEO_MESA_POR_SEGUNDO).toEqual(antes)
    const sinRev = { ...VIDEO_MESA_POR_SEGUNDO, pasos: VIDEO_MESA_POR_SEGUNDO.pasos.filter((p) => p.clave !== PASO_REVISAR_IMAGENES_CLAVE) } as Plantilla
    expect(() => conCorreccionDeImagenClave(sinRev)).toThrow(/imagenes_clave_final/)
    expect(() => conCorreccionDeImagen(VIDEO_MESA_POR_SEGUNDO)).toThrow(/imagen/)
  })
  it('🔴 la plantilla del video con la corrección no trae errores NUEVOS del validador', () => {
    const base = new Set(validarPlantilla(VIDEO_MESA_POR_SEGUNDO))
    expect(validarPlantilla(PL).filter((x) => !base.has(x))).toEqual([])
  })
})
