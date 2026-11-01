/**
 * «CERRAR HUECOS DE TENDENCIAS Y VOZ» (01-nov · CC-CEREBRO) · US$ 0, sin red: los actores, la base y los archivos son falsos.
 * (1) videos de tendencias y de la bodega bajados como video · (2) el embudo en todo lo de afuera · (3) comentarios (latestComments, TikTok/Facebook/X, Zero Risk) ·
 * (4) las cuentas de TikTok y X con la regla única · (5) la consulta viral de X de la bodega.
 */
import { describe, it, expect } from 'vitest'
import { crearBaseFalsa } from '../src/lib/portero-alimenta/__tests__/base-falsa'
import { DIEZ_CLIENTES } from '../src/lib/portero-alimenta/__tests__/diez-clientes.fixtures'
import { tablasDe } from '../src/lib/portero-alimenta/__tests__/diez-clientes.tablas'
import { AHORA } from '../src/lib/portero-alimenta/__tests__/fixtures-despertar'
import { unidadesDeRaspados } from '../src/lib/portero-alimenta/unidades'
import { publicacionesConComentarios } from '../src/lib/portero-alimenta/plan'
import { piezaDe, planDeLaBodega, videosDeTendencias, CONSULTA_VIRAL_DE_X, type Pieza } from '../src/lib/portero-alimenta/tendencias'
import { bajarVideosDeTendencias } from '../src/lib/portero-alimenta/tendencias-del-cliente'
import { guardarVideos, type VideoCandidato } from '../src/lib/portero-alimenta/videos-del-cerebro'
import { gustoDe, nivelDeFicha, nivelDeOrigen, ordenarPorEmbudo } from '../src/lib/portero-alimenta/embudo'
import { listarVideos } from '../src/lib/cerebro/portero/videos-lectura'
import { listarFotos } from '../src/lib/cerebro/portero/fotos-pendientes'
import { listarComentariosDeLaCompetencia } from '../src/lib/cerebro/portero/comentarios-competencia-lectura'
import type { Consulta } from '../src/lib/cerebro/consulta'
import { rutaConsultar } from '../src/lib/portero-alimenta/consultar'
import { comentarioDe, comentariosDeRedes, comentariosDeVideosDeLaCompetencia, cuentasDeLaFicha, guardarComentariosDeLaCompetencia, leerComentariosDeUnaCuenta, limpiarComentario, publicacionDe, publicacionesParaComentarios, type EjecutarComentarios } from '../src/lib/portero-alimenta/comentarios-de-redes'
import { buscarCuenta, decidirCuenta, descubrirCuentas, dominioDelSitio, perfilDe, type EjecutarCuentas, type Perfil } from '../src/lib/portero-alimenta/cuentas-de-redes'

type Fila = Record<string, unknown>
const c = DIEZ_CLIENTES[0]
const CID = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const ahora = new Date('2026-11-01T15:00:00Z')

// ───────────────────────────────────────── 3a · latestComments y 3c · publicaciones con comentarios
describe('3a · los comentarios que ya traen los videos de Instagram', () => {
  const base = { propios: { sitio: 'https://naufrago.ec', handles: ['naufrago.ec'] }, fichaDeMapas: (xs: Array<Fila>) => xs[0] ?? null }
  const fila = (fn: string, respuesta: unknown[]) => ({ id: fn, apify_function: fn, ensayo: false, created_at: '2026-11-01T10:00:00Z', respuesta })
  const video = (dueno: string, comentarios: unknown[]) => ({ id: `v-${dueno}`, shortCode: `SC${dueno}`, ownerUsername: dueno, caption: 'ceviche de camarón en la playa del domingo', url: 'https://www.instagram.com/p/X/', latestComments: comentarios })
  it('los de un video de la cuenta del cliente son opiniones sobre el negocio: con su fecha real, de un tercero y de la ficha propia', () => {
    const us = unidadesDeRaspados([fila('videos_instagram', [video('naufrago.ec', [{ id: 'k1', text: 'Qué rico se ve el ceviche, voy el sábado', timestamp: '2026-10-12T09:00:00.000Z' }])])], base as never).filter((u) => u.fuente === 'comentarios')
    expect(us).toHaveLength(1)
    expect(us[0]).toMatchObject({ autoria: 'tercero', de_ficha_propia: true, fecha_fuente: '2026-10-12T09:00:00.000Z', unidad_ref: 'k1', clase_dato: 'acumula' })
  })
  it('🔴 los de un video de un COMPETIDOR no son opiniones sobre el cliente: no entran como unidades', () => {
    const us = unidadesDeRaspados([fila('videos_instagram', [video('rival.ec', [{ id: 'k9', text: 'Muy bueno el lugar del rival, lo recomiendo', timestamp: '2026-10-12T09:00:00.000Z' }])])], base as never)
    expect(us.filter((u) => u.fuente === 'comentarios')).toHaveLength(0)
  })
  it('un comentario muy corto no entra; sin fecha en el origen la fecha queda vacía; sin id se usa la huella del texto', () => {
    const us = unidadesDeRaspados([fila('videos_instagram', [video('naufrago.ec', [{ id: 'a', text: '👍' }, { text: 'Excelente atención y buen sabor' }])])], base as never).filter((u) => u.fuente === 'comentarios')
    expect(us).toHaveLength(1)
    expect(us[0].fecha_fuente).toBeNull()
    expect(us[0].unidad_ref.length).toBeGreaterThan(8)
  })
  it('los comentarios propios de TikTok, X y Facebook (que pidió el portero) entran con su fecha real', () => {
    const us = unidadesDeRaspados([
      fila('comentarios_tiktok', [{ id: 't1', text: 'Probé el cebiche y estaba espectacular', timestamp: '2026-10-20T10:00:00.000Z', postUrl: 'https://www.tiktok.com/@n/video/1' }]),
      fila('comentarios_x', [{ id: 'x1', text: 'Buenísimo el servicio de anoche', timestamp: '2026-10-21T10:00:00.000Z' }]),
      fila('comentarios_facebook', [{ id: 'f1', text: 'Los mejores mariscos de Olón', timestamp: '2026-10-22T10:00:00.000Z' }]),
    ], base as never).filter((u) => u.fuente === 'comentarios')
    expect(us.map((u) => u.fecha_fuente?.slice(0, 10)).sort()).toEqual(['2026-10-20', '2026-10-21', '2026-10-22'])
    for (const u of us) expect(u).toMatchObject({ autoria: 'tercero', de_ficha_propia: true })
  })
})

describe('3c · Zero Risk: solo se piden comentarios de las publicaciones que los tienen', () => {
  it('descarta las de 0 comentarios (el actor devolvía error «no_items» por cada una) y pone primero la más comentada', () => {
    expect(publicacionesConComentarios([{ shortCode: 'A', commentsCount: 0 }, { shortCode: 'B', commentsCount: 1 }, { shortCode: 'C', commentsCount: 7 }, { shortCode: 'D', commentsCount: 0 }])).toEqual(['C', 'B'])
  })
  it('sin el conteo en el dato crudo se conserva (no se descarta lo que no se sabe), sin repetir y en su orden', () => {
    expect(publicacionesConComentarios([{ shortCode: 'A' }, { id: 'B' }, { shortCode: 'A' }, { shortCode: 'C', commentsCount: 'x' }])).toEqual(['A', 'B', 'C'])
  })
  it('si ninguna tiene comentarios no hay nada que pedir', () => {
    expect(publicacionesConComentarios([{ shortCode: 'A', commentsCount: 0 }])).toEqual([])
  })
})

// ───────────────────────────────────────── 5 · bodega X
describe('5 · la consulta viral de X de la bodega', () => {
  it('ya no usa min_faves:20000 (devolvía 0) y pide lo viral que no sea una respuesta', () => {
    const plan = planDeLaBodega({ paises: ['EC'] })
    const x = plan.filter((q) => q.red === 'x')
    expect(x.some((q) => q.etiqueta.includes('20000'))).toBe(false)
    expect(x[0].input.searchTerms).toEqual([CONSULTA_VIRAL_DE_X])
    expect(CONSULTA_VIRAL_DE_X).toBe('min_faves:10000 -filter:replies')
    expect(x.every((q) => (q.input.searchTerms as string[])[0].includes('-filter:replies'))).toBe(true)
    expect(x.some((q) => (q.input.searchTerms as string[])[0].includes('lang:es'))).toBe(true)
    expect(x.some((q) => (q.input.searchTerms as string[])[0].includes('place_country:EC'))).toBe(true)
  })
})

// ───────────────────────────────────────── 1 · videos de tendencias
const pieza = (o: Partial<Pieza>): Pieza => ({ nivel: 'global', red: 'tiktok', origen: 'referencia', consulta: '#x', post_ref: 'p', url: 'https://t/p', autor: 'Chef Ana', texto: 'receta', tipo: 'video', media_url: 'https://c/p.jpg', video_url: 'https://v/p.mp4', duracion_s: 30, vistas: 100, me_gusta: 10, compartidos: 1, comentarios: 2, publicado_en: '2026-10-30T10:00:00.000Z', pais: null, ...o })

describe('1 · de dónde sale el archivo del video de una tendencia', () => {
  it('TikTok: la dirección y la duración del video; Instagram: videoUrl y videoDuration; X y LinkedIn: ninguna (no son video bajable)', () => {
    const ctx = { nivel: 'global' as const, origen: 'referencia' as const, consulta: '#x', pais: null }
    expect(piezaDe('tiktok', { id: '1', video: { url: 'https://v/1.mp4', cover: 'https://c/1.jpg', duration: 41.5 } }, ctx)).toMatchObject({ video_url: 'https://v/1.mp4', duracion_s: 42, media_url: 'https://c/1.jpg' })
    expect(piezaDe('instagram', { shortCode: 'S', type: 'Video', videoUrl: 'https://v/s.mp4', videoDuration: 12 }, ctx)).toMatchObject({ video_url: 'https://v/s.mp4', duracion_s: 12, tipo: 'video' })
    expect(piezaDe('instagram', { shortCode: 'S', type: 'Image', displayUrl: 'https://i/s.jpg' }, ctx)).toMatchObject({ video_url: null })
    expect(piezaDe('x', { id: '5', text: 'hola' }, ctx)).toMatchObject({ video_url: null, duracion_s: null })
  })
})

describe('1 · cuáles videos se bajan', () => {
  it('primero el MEJOR de cada nivel (en orden de embudo) y luego los más gustados; nunca más del tope; sin dirección no hay video', () => {
    const ps = [
      pieza({ post_ref: 'g1', nivel: 'global', me_gusta: 900 }), pieza({ post_ref: 'g2', nivel: 'global', me_gusta: 800 }), pieza({ post_ref: 'g3', nivel: 'global', me_gusta: 700 }),
      pieza({ post_ref: 'p1', nivel: 'pais', me_gusta: 50 }), pieza({ post_ref: 'd1', nivel: 'directa', origen: 'competidor', me_gusta: 5 }),
      pieza({ post_ref: 'sin', nivel: 'competencia', video_url: null }), pieza({ post_ref: 'img', nivel: 'competencia', tipo: 'imagen' }),
    ]
    const r = videosDeTendencias(ps, 4)
    expect(r.map((v) => v.post_ref)).toEqual(['g1', 'p1', 'd1', 'g2'])
    expect(videosDeTendencias(ps, 2).map((v) => v.post_ref)).toEqual(['g1', 'p1'])
  })
  it('lo directo entra como «competidor», lo demás como «referencia», jamás «propio»; la cuenta se vuelve ruta segura; las cifras vienen con el video', () => {
    const r = videosDeTendencias([pieza({ post_ref: 'd', nivel: 'directa', origen: 'competidor', autor: 'Mar & Sol Olón!', vistas: 5000, me_gusta: 300, compartidos: null }), pieza({ post_ref: 'g', nivel: 'global', autor: null })])
    const d = r.find((v) => v.post_ref === 'd')!.candidato
    expect(d).toMatchObject({ rol: 'competidor', handle: 'mar-sol-olon', post_id: 'd', tipo: 'video_feed', fuente: 'tendencias', duracion_s: 30 })
    expect(d.metricas).toEqual({ views: 5000, likes: 300, comments: 2 })
    expect(r.find((v) => v.post_ref === 'g')!.candidato).toMatchObject({ rol: 'referencia', handle: 'cuenta' })
    expect(r.every((v) => v.candidato.rol !== ('propio' as never))).toBe(true)
  })
  it('sin videos que bajar devuelve vacío', () => { expect(videosDeTendencias([pieza({ video_url: null })])).toEqual([]) })
})

/** una base y un almacén falsos: registran cada llamada */
function mundoDeVideos(o: { previas?: Fila[]; descarga?: (url: string) => { status: number; cuerpo: Buffer } } = {}) {
  const llamadas: Array<{ url: string; method: string; body?: string; prefer?: string }> = []
  const mp4De = (u: string) => Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.from(u)])
  const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? 'GET'
    const prefer = String((init?.headers as Record<string, string> | undefined)?.Prefer ?? '')
    llamadas.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined, prefer })
    if (url.includes('/rest/v1/client_videos') && method === 'GET') return new Response(JSON.stringify(o.previas ?? []), { status: 200 })
    if (url.includes('/rest/v1/client_videos') && method === 'POST') return new Response(JSON.stringify([{ id: `vid-${JSON.parse(String(init?.body)).post_id}` }]), { status: 201 })
    if (url.includes('/storage/v1/object/')) return new Response('{}', { status: 200 })
    if (url.includes('/rest/v1/cerebro_tendencias') && method === 'PATCH') return new Response(null, { status: 204 })
    if (url.startsWith('https://v/')) { const d = o.descarga?.(url) ?? { status: 200, cuerpo: mp4De(url) }; return new Response(new Uint8Array(d.cuerpo), { status: d.status }) }
    return new Response('[]', { status: 200 })
  }
  return { fetchImpl: fetchImpl as never, llamadas }
}
const cand = (o: Partial<VideoCandidato> = {}): VideoCandidato => ({ rol: 'referencia', handle: 'chef-ana', post_id: 'p1', tipo: 'video_feed', url: 'https://v/p1.mp4', fuente: 'tendencias', caption: 'receta', posted_at: null, post_url: null, duracion_s: 30, transcripcion: null, metricas: { likes: 9 }, ...o })

describe('1 · guardar videos de un cliente y de la BODEGA (espacio común)', () => {
  it('de un cliente: ruta con su id y se escribe con «merge» sobre la clave del cliente', async () => {
    const m = mundoDeVideos()
    const r = await guardarVideos({ clientId: CID, candidatos: [cand()], urlDeLaBase: 'https://db', llave: 'k', fetchImpl: m.fetchImpl, ffmpeg: null })
    expect(r.guardados).toBe(1)
    expect(m.llamadas.some((l) => l.url.includes(`/client-videos/${CID}/referencia/chef-ana/p1.mp4`))).toBe(true)
    const w = m.llamadas.find((l) => l.method === 'POST' && l.url.includes('/rest/v1/client_videos'))!
    expect(w.url).toContain('on_conflict=client_id,owner_role,handle,post_id')
    expect(w.prefer).toContain('merge-duplicates')
    expect(JSON.parse(w.body!)).toMatchObject({ client_id: CID, estado: 'ok' })
    expect(r.ids).toEqual({ 'referencia|chef-ana|p1': 'vid-p1' })
  })
  it('🔴 de la bodega: sin cliente (client_id nulo), ruta «bodega/…», lee lo previo con client_id=is.null y NO usa on_conflict', async () => {
    const m = mundoDeVideos()
    const r = await guardarVideos({ clientId: null, candidatos: [cand()], urlDeLaBase: 'https://db', llave: 'k', fetchImpl: m.fetchImpl, ffmpeg: null })
    expect(r.guardados).toBe(1)
    expect(m.llamadas.find((l) => l.method === 'GET' && l.url.includes('/rest/v1/client_videos'))!.url).toContain('client_id=is.null')
    expect(m.llamadas.some((l) => l.url.includes('/client-videos/bodega/referencia/chef-ana/p1.mp4'))).toBe(true)
    const w = m.llamadas.find((l) => l.method === 'POST' && l.url.includes('/rest/v1/client_videos'))!
    expect(w.url).not.toContain('on_conflict')
    expect(w.prefer).not.toContain('merge-duplicates')
    expect(JSON.parse(w.body!).client_id).toBeNull()
  })
  it('un video que ya estaba no se baja otra vez, pero su id sirve para enlazarlo', async () => {
    const m = mundoDeVideos({ previas: [{ id: 'viejo', owner_role: 'referencia', handle: 'chef-ana', post_id: 'p1', estado: 'ok', hash_archivo: 'h', fuente_url: 'https://v/p1.mp4' }] })
    const r = await guardarVideos({ clientId: CID, candidatos: [cand()], urlDeLaBase: 'https://db', llave: 'k', fetchImpl: m.fetchImpl, ffmpeg: null })
    expect(r).toMatchObject({ guardados: 0, ya_estaban: 1, ids: { 'referencia|chef-ana|p1': 'viejo' } })
    expect(m.llamadas.some((l) => l.url.startsWith('https://v/'))).toBe(false)
  })
  it('lo que no es un video se declara «no_bajo» con su causa y no se guarda como video', async () => {
    const m = mundoDeVideos({ descarga: () => ({ status: 200, cuerpo: Buffer.from('<html>caducó</html>-----------') }) })
    const r = await guardarVideos({ clientId: CID, candidatos: [cand()], urlDeLaBase: 'https://db', llave: 'k', fetchImpl: m.fetchImpl, ffmpeg: null })
    expect(r.guardados).toBe(0)
    expect(r.fallidos[0].causa).toMatch(/no es un video/)
    expect(JSON.parse(m.llamadas.find((l) => l.method === 'POST' && l.url.includes('/rest/v1/client_videos'))!.body!)).toMatchObject({ estado: 'no_bajo' })
  })
})

describe('1 · bajar los videos de una tendencia y enlazarlos', () => {
  const piezas = [pieza({ post_ref: 'g1', nivel: 'global', me_gusta: 900, video_url: 'https://v/g1.mp4' }), pieza({ post_ref: 'd1', nivel: 'directa', origen: 'competidor', me_gusta: 5, red: 'instagram', autor: 'rival', video_url: 'https://v/d1.mp4' })]
  it('de un cliente: guarda los videos y enlaza cada fila de tendencia de HOY con su video', async () => {
    const m = mundoDeVideos()
    const r = await bajarVideosDeTendencias({ clientId: CID, piezas, urlDeLaBase: 'https://db', llave: 'k', ahora, fetchImpl: m.fetchImpl, ffmpeg: null })
    expect(r?.guardados).toBe(2)
    expect(r?.enlazados).toBe(2)
    const parches = m.llamadas.filter((l) => l.method === 'PATCH')
    expect(parches).toHaveLength(2)
    expect(parches[0].url).toContain(`client_id=eq.${CID}`)
    expect(parches[0].url).toContain('observado_dia=eq.2026-11-01')
    expect(parches.map((l) => `${decodeURIComponent(l.url).match(/post_ref=eq.([^&]+)/)![1]}=${JSON.parse(l.body!).video_id}`).sort()).toEqual(['d1=vid-d1', 'g1=vid-g1'])
  })
  it('🔴 de la bodega: el enlace busca la fila sin cliente (client_id=is.null)', async () => {
    const m = mundoDeVideos()
    await bajarVideosDeTendencias({ clientId: null, piezas, urlDeLaBase: 'https://db', llave: 'k', ahora, fetchImpl: m.fetchImpl, ffmpeg: null })
    expect(m.llamadas.filter((l) => l.method === 'PATCH').every((l) => l.url.includes('client_id=is.null'))).toBe(true)
  })
  it('sin piezas de video no hace nada; un fallo no lanza', async () => {
    expect(await bajarVideosDeTendencias({ clientId: CID, piezas: [pieza({ video_url: null })], urlDeLaBase: 'https://db', llave: 'k', ahora })).toBeUndefined()
    const roto = (async () => { throw new Error('red caída') }) as never
    await expect(bajarVideosDeTendencias({ clientId: CID, piezas, urlDeLaBase: 'https://db', llave: 'k', ahora, fetchImpl: roto })).resolves.toBeUndefined()
  })
})

// ───────────────────────────────────────── 2 · el embudo en todo
describe('2 · el embudo', () => {
  it('nivel por quién lo publicó; la tendencia que lo trajo manda; lo propio no tiene nivel de afuera', () => {
    expect(nivelDeOrigen('propia')).toBe('propio')
    expect(nivelDeOrigen('competencia')).toBe('directa')
    expect(nivelDeOrigen('competidor')).toBe('directa')
    expect(nivelDeOrigen('referencia')).toBe('competencia')
    expect(nivelDeOrigen('referencia', 'global')).toBe('global')
    expect(nivelDeOrigen('competencia', 'pais')).toBe('pais')
    expect(nivelDeOrigen('propia', 'global')).toBe('propio')
    expect(nivelDeOrigen('referencia', 'inventado')).toBe('competencia')
  })
  it('fichas por alcance: cliente → propio · competidor → directa · mercado → competencia', () => {
    expect(nivelDeFicha('cliente')).toBe('propio')
    expect(nivelDeFicha('competidor')).toBe('directa')
    expect(nivelDeFicha('mercado')).toBe('competencia')
    expect(nivelDeFicha(undefined)).toBe('propio')
  })
  it('gusto: me gusta, si no vistas; sin cifras = null', () => {
    expect(gustoDe({ me_gusta: 5, vistas: 99 })).toBe(5)
    expect(gustoDe({ likesCount: 7 })).toBe(7)
    expect(gustoDe({ videoPlayCount: 40 })).toBe(40)
    expect(gustoDe({ x: 1 })).toBeNull()
    expect(gustoDe(null)).toBeNull()
  })
  it('orden: lo propio, global, país, competencia, directa; dentro de cada nivel de más a menos gustado; el empate y lo sin cifra conservan su orden', () => {
    const xs = [
      { id: 'd', nivel: 'directa', gusto: 90 }, { id: 'c1', nivel: 'competencia', gusto: null }, { id: 'p', nivel: 'pais', gusto: 1 }, { id: 'g1', nivel: 'global', gusto: 10 },
      { id: 'g2', nivel: 'global', gusto: 50 }, { id: 'own', nivel: 'propio', gusto: null }, { id: 'c2', nivel: 'competencia', gusto: 3 }, { id: 'c3', nivel: 'competencia', gusto: null },
    ]
    expect(ordenarPorEmbudo(xs, (x) => x).map((x) => x.id)).toEqual(['own', 'g2', 'g1', 'p', 'c2', 'c1', 'c3', 'd'])
  })
})

describe('2 · videos, fotos y consulta salen en el orden del embudo con su nivel', () => {
  const consultaCon = (tablas: Record<string, Fila[]>): Consulta => async (p) => ({ filas: (tablas[p.tabla] ?? []).filter((x) => Object.entries(p.donde).every(([k, v]) => (v === null ? x[k] == null : x[k] === v))), error: null })
  const video = (id: string, rol: string, o: Fila = {}): Fila => ({ id, client_id: CID, owner_role: rol, handle: 'h', post_id: id, tipo: 'reel', estado: 'ok', path: null, created_at: '2026-10-31T10:00:00Z', metricas: {}, ...o })
  const tablas: Record<string, Fila[]> = {
    client_videos: [
      video('v-dir', 'competidor', { metricas: { likesCount: 900 } }), video('v-own', 'propio', { metricas: { likesCount: 5 } }), video('v-glo', 'referencia'), video('v-ref', 'referencia', { metricas: { likesCount: 40 } }),
      video('v-glo2', 'referencia'),
    ],
    client_social_images: [],
    cerebro_tendencias: [{ client_id: CID, video_id: 'v-glo', nivel: 'global', me_gusta: 2000, vistas: 1 }, { client_id: CID, video_id: 'v-glo2', nivel: 'global', me_gusta: 3000, vistas: 1 }],
  }
  it('videos: propio → global (el más gustado primero) → competencia → directa; cada uno con su nivel y su cifra de gusto', async () => {
    const r = await listarVideos(consultaCon(tablas), { cliente: CID })
    if (!r.ok) throw new Error('debía leer')
    expect(r.videos.map((v) => `${v.video_id}:${v.nivel}`)).toEqual(['v-own:propio', 'v-glo2:global', 'v-glo:global', 'v-ref:competencia', 'v-dir:directa'])
    expect(r.videos.find((v) => v.video_id === 'v-glo2')!.gusto).toBe(3000)
    expect(r.videos.find((v) => v.video_id === 'v-dir')!.gusto).toBe(900)
    expect(r.alcance).toBe('cliente')
  })
  it('🔴 la bodega: videos sin cliente, nivel «mundo», y sin `client_id` ni `bodega` se pide una cosa o la otra', async () => {
    const t = { ...tablas, client_videos: [{ ...video('b1', 'referencia'), client_id: null, metricas: { views: 10 } }, video('de-cliente', 'referencia')], cerebro_tendencias: [] }
    const r = await listarVideos(consultaCon(t), { cliente: '', bodega: true })
    if (!r.ok) throw new Error('debía leer')
    expect(r.videos.map((v) => v.video_id)).toEqual(['b1'])
    expect(r.videos[0].nivel).toBe('mundo')
    expect(r.alcance).toBe('bodega')
    expect(r.cliente).toBeNull()
    const sin = await listarVideos(consultaCon(t), { cliente: '' })
    expect(sin.ok).toBe(false)
  })
  it('un fallo al leer las tendencias se dice (no se ordena a ciegas)', async () => {
    const roto: Consulta = async (p) => (p.tabla === 'cerebro_tendencias' ? { filas: [], error: 'caída' } : { filas: [], error: null })
    expect((await listarVideos(roto, { cliente: CID })).ok).toBe(false)
    expect((await listarFotos(roto, { cliente: CID })).ok).toBe(false)
  })
  it('fotos: lo propio primero; la captura de un video de tendencia hereda su nivel y su gusto', async () => {
    const foto = (id: string, rol: string, o: Fila = {}): Fila => ({ id, client_id: CID, owner_role: rol, estado: 'ok', handle: 'h', tipo: 'post_image', url: `https://x/${id}.jpg`, created_at: '2026-10-31T10:00:00Z', ...o })
    const t: Record<string, Fila[]> = {
      client_social_images: [foto('f-dir', 'competidor'), foto('f-glo', 'referencia', { video_id: 'v-glo2', tipo: 'video_captura' }), foto('f-own', 'propio'), foto('f-ref', 'referencia')],
      cerebro_tendencias: tablas.cerebro_tendencias,
    }
    const r = await listarFotos(consultaCon(t), { cliente: CID })
    if (!r.ok) throw new Error('debía leer')
    expect(r.fotos.map((f) => `${f.foto_id}:${f.nivel}`)).toEqual(['f-own:propio', 'f-glo:global', 'f-ref:competencia', 'f-dir:directa'])
    expect(r.fotos.find((f) => f.foto_id === 'f-glo')!.gusto).toBe(3000)
  })
  it('la consulta: cada resultado trae su nivel y salen lo propio primero y luego mercado y competidores; dentro del nivel se conserva la relevancia', async () => {
    const f = (id: string, alcance: string | null, contenido: string): Fila => ({ id, ref: id, client_id: c.id, clase: 'dato', atributo: null, titulo: 't', que_es: 'q', contenido, observado_en: '2026-10-30T10:00:00Z', fecha_fuente: null, creado_en: '2026-10-30T10:00:00Z', alcance, sede: null, descartada: false, retirada_en: null, vigente_hasta: null, provenance_tag: {} })
    const t = tablasDe(c) as Record<string, Fila[]>
    t.cerebro_fichas = [f('rival', 'competidor', 'ceviche del rival muy famoso'), f('zona', 'mercado', 'ceviche mixto lo más gustado de la zona'), f('mio', 'cliente', 'nuestro ceviche de camarón'), f('suelta', null, 'ceviche especial')]
    t.cerebro_ingresos = []; t.cerebro_consultas = []
    const r = await rutaConsultar({ db: crearBaseFalsa(t as never).db as never, ahora: AHORA }, { client_id: c.id, oficina: 'o', agente: 'a', que: 'ceviche' })
    const res = (r.body.resultados as Array<{ ficha_id: string; nivel: string }>)
    expect(res.map((x) => `${x.ficha_id}:${x.nivel}`)).toEqual(expect.arrayContaining(['rival:directa', 'zona:competencia', 'mio:propio', 'suelta:propio']))
    const orden = ['propio', 'competencia', 'directa']
    const posiciones = res.map((x) => orden.indexOf(x.nivel))
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones)
  })
})

// ───────────────────────────────────────── 3b · comentarios de TikTok, Facebook y X
describe('3b · limpiar y leer cada red', () => {
  it('sin datos personales: fuera @usuarios, correos y teléfonos', () => {
    expect(limpiarComentario('@marta_22 escríbeme a marta@mail.com o al +593 99 123 4567 que el ceviche está rico')).toBe('escríbeme a o al que el ceviche está rico')
    expect(limpiarComentario('   Muy   rico \n todo  ')).toBe('Muy rico todo')
  })
  const post = { ref: '7001', url: 'https://www.tiktok.com/@a/video/7001', comentarios: 9 }
  it('TikTok: id, texto, me gusta y la fecha real en ISO', () => {
    expect(comentarioDe('tiktok', { cid: 'c1', text: 'Qué rico se ve esto', diggCount: 12, createTimeISO: '2026-10-20T10:00:00.000Z', uniqueId: 'alguien' }, { cuenta: 'a', rol: 'propia', post })).toMatchObject({ red: 'tiktok', comentario_ref: 'c1', me_gusta: 12, fecha: '2026-10-20T10:00:00.000Z', post_ref: '7001' })
  })
  it('X: la fecha viene en el formato de X; lo que escribe la propia cuenta (su hilo) no cuenta; «sin resultados» tampoco', () => {
    expect(comentarioDe('x', { id: '9', fullText: 'Buenísimo todo lo de anoche', likeCount: 3, createdAt: 'Sat Oct 31 17:23:53 +0000 2026', author: { userName: 'otro' } }, { cuenta: 'a', rol: 'competidor', post })?.fecha).toBe('2026-10-31T17:23:53.000Z')
    expect(comentarioDe('x', { id: '9', fullText: 'sigo el hilo del dueño aquí', author: { userName: 'a' } }, { cuenta: 'a', rol: 'competidor', post })).toBeNull()
    expect(comentarioDe('x', { noResults: true }, { cuenta: 'a', rol: 'competidor', post })).toBeNull()
  })
  it('Facebook: texto, me gusta y fecha; un comentario sin identificador o muy corto se descarta; sin fecha en el origen la fecha queda vacía', () => {
    expect(comentarioDe('facebook', { id: 'f1', text: 'Los mejores mariscos que he probado', likesCount: 4, date: '2026-10-18T12:00:00.000Z' }, { cuenta: 'p', rol: 'propia', post })).toMatchObject({ fecha: '2026-10-18T12:00:00.000Z', me_gusta: 4 })
    expect(comentarioDe('facebook', { id: 'f2', text: 'Los mejores mariscos que he probado' }, { cuenta: 'p', rol: 'propia', post })?.fecha).toBeNull()
    expect(comentarioDe('facebook', { text: 'sin identificador pero largo' }, { cuenta: 'p', rol: 'propia', post })).toBeNull()
    expect(comentarioDe('facebook', { id: 'f3', text: 'ok' }, { cuenta: 'p', rol: 'propia', post })).toBeNull()
  })
  it('las publicaciones: se eligen las que más comentarios tienen y al menos 1; cada red lee sus campos', () => {
    expect(publicacionDe('tiktok', { id: '1', postPage: 'https://t/1', comments: 4 })).toEqual({ ref: '1', url: 'https://t/1', comentarios: 4 })
    expect(publicacionDe('x', { id: '2', url: 'https://x.com/a/status/2', replyCount: 6 })).toEqual({ ref: '2', url: 'https://x.com/a/status/2', comentarios: 6 })
    expect(publicacionDe('facebook', { url: 'https://fb/p/3', commentsCount: 2 })).toMatchObject({ comentarios: 2 })
    expect(publicacionDe('tiktok', { id: '1' })).toBeNull()
    const ps = [{ ref: 'a', url: 'u', comentarios: 0 }, { ref: 'b', url: 'u', comentarios: 3 }, { ref: 'c', url: 'u', comentarios: 8 }, { ref: 'd', url: 'u', comentarios: 5 }, { ref: 'e', url: 'u', comentarios: null }]
    expect(publicacionesParaComentarios(ps).map((p) => p.ref)).toEqual(['c', 'd'])
    expect(publicacionesParaComentarios(ps, 5).map((p) => p.ref)).toEqual(['c', 'd', 'b'])
  })
  it('las cuentas de la ficha: propias y de cada competidor, por red, sin repetir', () => {
    const cs = cuentasDeLaFicha({ own_social_handles: { instagram: 'n' }, apify: { own_handles: { tiktok: '@naufrago.ec', x: 'naufrago' }, competitor_list: [{ name: 'Rival', handles: { tiktok: 'https://www.tiktok.com/@rival', twitter: '@rival_x', facebook: 'rival.fb', instagram: '@ig' } }, { name: 'Dup', handles: { tiktok: '@rival' } }, { name: 'Sin' }] } })
    expect(cs.map((x) => `${x.rol}:${x.red}:${x.cuenta}`)).toEqual(['propia:tiktok:naufrago.ec', 'propia:x:naufrago', 'competidor:tiktok:rival', 'competidor:x:rival_x', 'competidor:facebook:rival.fb'])
  })
})

/** un ejecutor falso por actor: devuelve lo que se le da y anota cada llamada */
function ejecutorFalso(respuestas: Record<string, unknown[] | ((i: Fila) => unknown[])>, costo = 0.004) {
  const llamadas: Array<{ actor: string; input: Fila; tope: number }> = []
  const ejecutar: EjecutarComentarios = async (actor, input, tope) => {
    llamadas.push({ actor, input, tope })
    const r = respuestas[actor]
    if (r === undefined) throw new Error(`actor sin respuesta: ${actor}`)
    return { items: typeof r === 'function' ? r(input) : r, costo_usd: costo }
  }
  return { ejecutar, llamadas }
}

describe('3b · leer una cuenta', () => {
  it('TikTok: pide publicaciones, elige las 2 más comentadas, lee sus comentarios en UNA corrida y le pone a cada uno la dirección de su video', async () => {
    const e = ejecutorFalso({
      'apidojo~tiktok-scraper': [{ id: '1', postPage: 'https://t/1', comments: 0 }, { id: '2', postPage: 'https://t/2', comments: 5 }, { id: '3', postPage: 'https://t/3', comments: 9 }],
      'clockworks~tiktok-comments-scraper': [{ cid: 'a', text: 'Comentario del video tres', submittedVideoUrl: 'https://t/3', createTimeISO: '2026-10-01T00:00:00.000Z' }, { cid: 'b', text: 'Comentario del video dos', videoWebUrl: 'https://t/2', createTimeISO: '2026-10-02T00:00:00.000Z' }],
    })
    const r = await leerComentariosDeUnaCuenta({ red: 'tiktok', cuenta: 'rival', rol: 'competidor' }, e.ejecutar, 0.3)
    expect(r.r).toMatchObject({ publicaciones: 3, con_comentarios: 2, comentarios: 2 })
    expect(r.comentarios.map((k) => `${k.comentario_ref}:${k.post_ref}`).sort()).toEqual(['a:3', 'b:2'])
    expect(e.llamadas.filter((l) => l.actor === 'clockworks~tiktok-comments-scraper')).toHaveLength(1)
    expect(e.llamadas[1].input.postURLs).toEqual(['https://t/3', 'https://t/2'])
    expect(e.llamadas.every((l) => l.tope <= 0.08)).toBe(true)
  })
  it('X: una consulta de conversación por publicación elegida', async () => {
    const e = ejecutorFalso({ 'apidojo~tweet-scraper': (i) => ((i.searchTerms as string[])[0].startsWith('from:') ? [{ id: '10', url: 'https://x.com/r/status/10', replyCount: 4 }, { id: '11', url: 'https://x.com/r/status/11', replyCount: 0 }] : [{ id: '90', fullText: 'Respuesta de otra persona al tuit', createdAt: 'Sat Oct 31 17:23:53 +0000 2026', author: { userName: 'z' } }]) })
    const r = await leerComentariosDeUnaCuenta({ red: 'x', cuenta: 'r', rol: 'propia' }, e.ejecutar, 0.3)
    expect(e.llamadas.map((l) => (l.input.searchTerms as string[])[0])).toEqual(['from:r', 'conversation_id:10'])
    expect(r.comentarios).toHaveLength(1)
    expect(r.comentarios[0]).toMatchObject({ post_ref: '10', fecha: '2026-10-31T17:23:53.000Z' })
  })
  it('Facebook: una corrida de comentarios por publicación elegida', async () => {
    const e = ejecutorFalso({ 'apify~facebook-posts-scraper': [{ url: 'https://fb/p/1', comments: 3 }], 'apify~facebook-comments-scraper': [{ id: 'k', text: 'Excelente servicio siempre', date: '2026-09-01T00:00:00.000Z' }] })
    const r = await leerComentariosDeUnaCuenta({ red: 'facebook', cuenta: 'pagina', rol: 'propia' }, e.ejecutar, 0.3)
    expect(r.comentarios).toHaveLength(1)
    expect(e.llamadas[1].input).toMatchObject({ startUrls: [{ url: 'https://fb/p/1' }] })
  })
  it('🔴 una cuenta que no existe o sin publicaciones con comentarios se DICE (no se inventa) y cuenta como intento válido; un fallo del actor NO', async () => {
    const vacia = await leerComentariosDeUnaCuenta({ red: 'tiktok', cuenta: 'nadie', rol: 'propia' }, ejecutorFalso({ 'apidojo~tiktok-scraper': [{ noResults: true, error: true }] }).ejecutar, 0.3)
    expect(vacia.r.causa).toMatch(/no devolvió publicaciones/)
    expect(vacia.intento_valido).toBe(true)
    const sin = await leerComentariosDeUnaCuenta({ red: 'tiktok', cuenta: 'a', rol: 'propia' }, ejecutorFalso({ 'apidojo~tiktok-scraper': [{ id: '1', postPage: 'https://t/1', comments: 0 }] }).ejecutar, 0.3)
    expect(sin.r.causa).toMatch(/ninguna de sus publicaciones/)
    const roto = await leerComentariosDeUnaCuenta({ red: 'tiktok', cuenta: 'a', rol: 'propia' }, ejecutorFalso({}).ejecutar, 0.3)
    expect(roto.intento_valido).toBe(false)
    expect(roto.r.causa).toMatch(/sin respuesta/)
  })
})

/** una base falsa de REST para la corrida de comentarios */
function baseDeComentarios(previas: Fila[] = [], fallaTabla = false) {
  const llamadas: Array<{ url: string; method: string; body?: string }> = []
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    llamadas.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined })
    if (url.includes('/rest/v1/apify_raw') && method === 'GET') return new Response(JSON.stringify(previas), { status: 200 })
    if (url.includes('/rest/v1/cerebro_comentarios_competencia')) return new Response(null, { status: fallaTabla ? 500 : 201 })
    return new Response(null, { status: 201 })
  }) as never
  return { fetchImpl, llamadas }
}
describe('3b · la corrida de un cliente', () => {
  const cliente = { name: 'Náufrago', config: { apify: { own_handles: { tiktok: 'naufrago.ec' }, competitor_list: [{ name: 'Rival', handles: { tiktok: '@rival' } }] } } }
  const actores = () => ejecutorFalso({
    'apidojo~tiktok-scraper': (i) => [{ id: String((i.startUrls as string[])[0].length), postPage: `${(i.startUrls as string[])[0]}/video/1`, comments: 4 }],
    'clockworks~tiktok-comments-scraper': (i) => [{ cid: `c-${String((i.postURLs as string[])[0].length)}`, text: 'Comentario real de una persona', submittedVideoUrl: (i.postURLs as string[])[0], createTimeISO: '2026-10-15T10:00:00.000Z' }],
  })
  it('lo PROPIO se guarda como una fila de raspado (entra por el portero); lo de la COMPETENCIA va a su tabla y deja su intento; todo con la fecha real', async () => {
    const b = baseDeComentarios()
    const a = actores()
    const r = await comentariosDeRedes({ cliente, clientId: CID, urlDeLaBase: 'https://db', llave: 'k', token: 't', ahora, ejecutar: a.ejecutar, fetchImpl: b.fetchImpl })
    expect(r).toMatchObject({ estado: 'corrida', cuentas_conocidas: 2, leidas: 2, propios: 1, competencia: 1, comentarios: 2 })
    expect(r.cuentas.map((x) => `${x.rol}:${x.cuenta}`)).toEqual(['propia:naufrago.ec', 'competidor:rival'])
    const crudos = b.llamadas.filter((l) => l.method === 'POST' && l.url.endsWith('/rest/v1/apify_raw')).map((l) => JSON.parse(l.body!))
    expect(crudos.map((x) => x.apify_function).sort()).toEqual(['comentarios_competencia_tiktok', 'comentarios_tiktok'])
    const propia = crudos.find((x) => x.apify_function === 'comentarios_tiktok')
    expect(propia).toMatchObject({ client_id: CID, ensayo: false, metadata: { cuenta: 'naufrago.ec', rol: 'propia' } })
    expect(propia.respuesta[0]).toMatchObject({ text: 'Comentario real de una persona', timestamp: '2026-10-15T10:00:00.000Z' })
    expect(crudos.find((x) => x.apify_function === 'comentarios_competencia_tiktok').respuesta).toEqual([])
    const tabla = b.llamadas.find((l) => l.url.includes('cerebro_comentarios_competencia'))!
    expect(tabla.url).toContain('on_conflict=client_id,red,comentario_ref')
    expect(JSON.parse(tabla.body!)[0]).toMatchObject({ client_id: CID, red: 'tiktok', cuenta: 'rival', fecha_comentario: '2026-10-15T10:00:00.000Z' })
  })
  it('una cuenta mirada en los últimos 7 días no se vuelve a pedir; lo propio va primero; si todo está al día no gasta nada', async () => {
    const a = actores()
    const b = baseDeComentarios([{ apify_function: 'comentarios_tiktok', metadata: { cuenta: 'Naufrago.EC' } }])
    const r = await comentariosDeRedes({ cliente, clientId: CID, urlDeLaBase: 'https://db', llave: 'k', token: 't', ahora, ejecutar: a.ejecutar, fetchImpl: b.fetchImpl })
    expect(r.cuentas.map((x) => x.cuenta)).toEqual(['rival'])
    const al = await comentariosDeRedes({ cliente, clientId: CID, urlDeLaBase: 'https://db', llave: 'k', token: 't', ahora, ejecutar: a.ejecutar, fetchImpl: baseDeComentarios([{ apify_function: 'comentarios_tiktok', metadata: { cuenta: 'naufrago.ec' } }, { apify_function: 'comentarios_competencia_tiktok', metadata: { cuenta: 'rival' } }]).fetchImpl })
    expect(al.estado).toBe('todo_al_dia')
    expect(al.costo_usd).toBe(0)
  })
  it('la consulta de lo ya mirado pide solo los últimos 7 días de las funciones de comentarios de ESTE cliente', async () => {
    const b = baseDeComentarios()
    await comentariosDeRedes({ cliente, clientId: CID, urlDeLaBase: 'https://db', llave: 'k', token: 't', ahora, ejecutar: actores().ejecutar, fetchImpl: b.fetchImpl })
    const q = decodeURIComponent(b.llamadas[0].url)
    expect(q).toContain(`client_id=eq.${CID}`)
    expect(q).toContain('created_at=gte.2026-10-25T15:00:00.000Z')
    expect(q).toContain('comentarios_competencia_facebook')
    expect(q).toContain('ensayo=eq.false')
  })
  it('sin cuentas, sin llave o sin base: lo dice y no gasta; en modo lectura no escribe', async () => {
    expect((await comentariosDeRedes({ cliente: { config: {} }, clientId: CID, urlDeLaBase: 'https://db', llave: 'k', token: 't', ahora, ejecutar: actores().ejecutar })).estado).toBe('sin_cuentas')
    expect((await comentariosDeRedes({ cliente, clientId: CID, urlDeLaBase: 'https://db', llave: 'k', token: '', ahora, ejecutar: actores().ejecutar })).estado).toBe('sin_token')
    expect((await comentariosDeRedes({ cliente, clientId: CID, urlDeLaBase: '', llave: '', token: 't', ahora, ejecutar: actores().ejecutar })).estado).toBe('sin_base')
    const b = baseDeComentarios()
    await comentariosDeRedes({ cliente, clientId: CID, urlDeLaBase: 'https://db', llave: 'k', token: 't', ahora, ejecutar: actores().ejecutar, fetchImpl: b.fetchImpl, soloLeer: true })
    expect(b.llamadas.filter((l) => l.method === 'POST')).toHaveLength(0)
  })
  it('🔴 un fallo del actor NO deja el intento anotado (se reintenta); un fallo de la tabla de la competencia se dice en la cuenta', async () => {
    const b = baseDeComentarios()
    const r = await comentariosDeRedes({ cliente, clientId: CID, urlDeLaBase: 'https://db', llave: 'k', token: 't', ahora, ejecutar: ejecutorFalso({}).ejecutar, fetchImpl: b.fetchImpl })
    expect(r.cuentas.every((x) => !!x.causa)).toBe(true)
    expect(b.llamadas.filter((l) => l.method === 'POST')).toHaveLength(0)
    const t = baseDeComentarios([], true)
    const r2 = await comentariosDeRedes({ cliente, clientId: CID, urlDeLaBase: 'https://db', llave: 'k', token: 't', ahora, ejecutar: actores().ejecutar, fetchImpl: t.fetchImpl })
    expect(r2.cuentas.find((x) => x.cuenta === 'rival')!.causa).toMatch(/HTTP 500/)
    expect(r2.competencia).toBe(0)
  })
  it('🔴 el tope de gasto del día corta: cuando lo gastado alcanza, las cuentas que faltan se declaran y no se piden', async () => {
    const caro = ejecutorFalso({
      'apidojo~tiktok-scraper': [{ id: '1', postPage: 'https://t/1', comments: 4 }],
      'clockworks~tiktok-comments-scraper': [{ cid: 'c', text: 'Comentario real de una persona', submittedVideoUrl: 'https://t/1' }],
    }, 0.1)
    const muchas = { config: { apify: { competitor_list: Array.from({ length: 6 }, (_, i) => ({ name: `R${i}`, handles: { tiktok: `@r${i}` } })) } } }
    const r = await comentariosDeRedes({ cliente: muchas, clientId: CID, urlDeLaBase: 'https://db', llave: 'k', token: 't', ahora, ejecutar: caro.ejecutar, fetchImpl: baseDeComentarios().fetchImpl })
    expect(r.leidas).toBe(3)
    expect(r.omitidas_por_tope).toBe(3)
    expect(r.costo_usd).toBeGreaterThan(0.5)
  })
  it('el tope de cuentas por corrida se respeta y lo que sobra se declara', async () => {
    const muchas = { config: { apify: { competitor_list: Array.from({ length: 5 }, (_, i) => ({ name: `R${i}`, handles: { tiktok: `@r${i}` } })) } } }
    const r = await comentariosDeRedes({ cliente: muchas, clientId: CID, urlDeLaBase: 'https://db', llave: 'k', token: 't', ahora, ejecutar: actores().ejecutar, fetchImpl: baseDeComentarios().fetchImpl, maxCuentas: 3 })
    expect(r.leidas).toBe(3)
    expect(r.omitidas_por_tope).toBe(2)
  })
})

describe('3a · los comentarios de los videos de la COMPETENCIA van a su tabla', () => {
  const vid = (dueno: string, cs: unknown[]) => ({ ownerUsername: dueno, shortCode: `S-${dueno}`, url: 'https://ig/p/1', latestComments: cs })
  it('solo los videos de cuentas que NO son del cliente, con la fecha real, sin repetir y sin datos personales', () => {
    const filas = [{ apify_function: 'videos_instagram', ensayo: false, respuesta: [vid('rival.ec', [{ id: 'a', text: '@juan escríbeme al 0991234567 que el lugar es bonito', timestamp: '2026-10-05T10:00:00.000Z', likesCount: 3 }, { id: 'a', text: 'repetido igual de largo' }, { id: 'b', text: 'ok' }]), vid('naufrago.ec', [{ id: 'z', text: 'comentario del propio cliente aquí' }])] }, { apify_function: 'videos_instagram', ensayo: true, respuesta: [vid('rival.ec', [{ id: 'q', text: 'ensayo no cuenta nunca' }])] }, { apify_function: 'otra', respuesta: [vid('rival.ec', [{ id: 'w', text: 'otra función no cuenta' }])] }]
    const r = comentariosDeVideosDeLaCompetencia(filas, new Set(['naufrago.ec']))
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ red: 'instagram', cuenta: 'rival.ec', comentario_ref: 'a', fecha: '2026-10-05T10:00:00.000Z', me_gusta: 3, post_ref: 'S-rival.ec' })
    expect(r[0].texto).toBe('escríbeme al que el lugar es bonito')
  })
  it('guardar: sin repetidos (ignora duplicados por cliente+red+comentario), con la fecha real; un fallo se dice', async () => {
    const b = baseDeComentarios()
    const k = comentariosDeVideosDeLaCompetencia([{ apify_function: 'videos_instagram', respuesta: [vid('rival.ec', [{ id: 'a', text: 'Un comentario suficientemente largo', timestamp: '2026-10-05T10:00:00.000Z' }])] }], new Set())
    const g = await guardarComentariosDeLaCompetencia({ clientId: CID, comentarios: k, urlDeLaBase: 'https://db', llave: 'k', ahora, fetchImpl: b.fetchImpl })
    expect(g.guardados).toBe(1)
    expect(b.llamadas[0].url).toContain('on_conflict=client_id,red,comentario_ref')
    expect(JSON.parse(b.llamadas[0].body!)[0]).toMatchObject({ client_id: CID, red: 'instagram', fecha_comentario: '2026-10-05T10:00:00.000Z' })
    expect((await guardarComentariosDeLaCompetencia({ clientId: CID, comentarios: k, urlDeLaBase: 'https://db', llave: 'k', ahora, fetchImpl: baseDeComentarios([], true).fetchImpl })).error).toMatch(/HTTP 500/)
    expect((await guardarComentariosDeLaCompetencia({ clientId: CID, comentarios: [], urlDeLaBase: '', llave: '', ahora })).guardados).toBe(0)
    expect((await guardarComentariosDeLaCompetencia({ clientId: CID, comentarios: k, urlDeLaBase: '', llave: '', ahora })).error).toMatch(/base/)
  })
})

// ───────────────────────────────────────── 4 · las cuentas de TikTok y X
describe('4 · la regla única de las cuentas', () => {
  const p = (o: Partial<Perfil>): Perfil => ({ red: 'tiktok', handle: 'x', nombre: '', bio: '', enlaces: '', lugar: '', seguidores: null, ...o })
  const quien = { nombre: 'Náufrago', dominio: 'naufrago.ec', cuentasConocidas: ['naufrago.ec'], lugares: ['Olón', 'Ecuador'] }
  it('el dominio del sitio se saca de la dirección completa', () => {
    expect(dominioDelSitio('https://www.Naufrago.ec/menu')).toBe('naufrago.ec')
    expect(dominioDelSitio('naufrago.ec')).toBe('naufrago.ec')
    expect(dominioDelSitio(null)).toBeNull()
  })
  it('✅ por «cuenta»: su enlace nombra el sitio del negocio, o su biografía nombra una cuenta suya ya conocida', () => {
    expect(decidirCuenta([p({ handle: 'naufrago_olon', nombre: 'Restaurante del mar', enlaces: 'https://naufrago.ec/reservas' })], { ...quien, cuentasConocidas: [] })).toMatchObject({ estado: 'hallada', razon: 'cuenta' })
    expect(decidirCuenta([p({ handle: 'naufragomar', nombre: 'Mar', bio: 'Síguenos también en @naufrago.ec' })], quien)).toMatchObject({ estado: 'hallada', razon: 'cuenta' })
  })
  it('✅ por «nombre y lugar»: el nombre EXACTO del negocio y su ciudad o país en la biografía o la ubicación (con tildes o sin ellas)', () => {
    expect(decidirCuenta([p({ handle: 'naufrago', nombre: 'NÁUFRAGO', bio: 'Mariscos frente al mar en OLON' })], quien)).toMatchObject({ estado: 'hallada', razon: 'nombre_y_lugar' })
    expect(decidirCuenta([p({ handle: 'naufrago.x', nombre: 'Naufrago', lugar: 'Ecuador' })], quien)).toMatchObject({ estado: 'hallada', razon: 'nombre_y_lugar' })
  })
  it('🔴 un HOMÓNIMO nunca es el propio: mismo nombre sin lugar ni enlace, otro país, o un nombre solo parecido', () => {
    const r = decidirCuenta([p({ handle: 'NaufragoBlog', nombre: 'Náufrago', bio: 'Un consejo para quienes buscan la felicidad', lugar: 'México' }), p({ handle: 'elnaufrago', nombre: 'El Náufrago', bio: 'Olón', lugar: 'Ecuador' }), p({ handle: 'catmips8', nombre: 'Cat' })], quien)
    expect(r.estado).toBe('no_hallada')
    if (r.estado !== 'no_hallada') return
    expect(r.rechazados.map((x) => x.handle)).toEqual(['NaufragoBlog', 'elnaufrago', 'catmips8'])
    expect(r.rechazados[0].motivo).toMatch(/homónimo/)
    expect(r.rechazados[2].motivo).toMatch(/ni su nombre exacto/)
  })
  it('🔴 la palabra suelta dentro de otra no cuenta como lugar («solon» no es «Olón») ni un nombre de 2 letras como nombre', () => {
    expect(decidirCuenta([p({ handle: 'naufrago', nombre: 'Naufrago', bio: 'visita solon plaza' })], quien).estado).toBe('no_hallada')
    expect(decidirCuenta([p({ handle: 'ab', nombre: 'Ab', bio: 'Ecuador' })], { ...quien, nombre: 'Ab' }).estado).toBe('no_hallada')
  })
  it('dos perfiles que cumplen = ambigua: no se elige ninguno', () => {
    const r = decidirCuenta([p({ handle: 'a', enlaces: 'naufrago.ec' }), p({ handle: 'b', nombre: 'Naufrago', bio: 'Olón' })], quien)
    expect(r).toMatchObject({ estado: 'ambigua', candidatos: ['a', 'b'] })
  })
  it('sin dominio ni cuentas conocidas solo sirve el nombre exacto con lugar; una cuenta conocida de menos de 4 letras no cuenta', () => {
    const sin = { nombre: 'Rival', dominio: null, cuentasConocidas: ['ab'], lugares: ['Olón'] }
    expect(decidirCuenta([p({ handle: 'q', nombre: 'Otro', bio: 'ab ab ab' })], sin).estado).toBe('no_hallada')
    expect(decidirCuenta([p({ handle: 'rival', nombre: 'Rival', bio: 'en Olón' })], sin).estado).toBe('hallada')
  })
  it('cada actor se lee con su forma', () => {
    expect(perfilDe('tiktok', { name: 'n.ec', nickName: 'Náufrago', signature: 'bio', bioLink: { link: 'https://naufrago.ec' }, fans: 120, region: 'EC' })).toMatchObject({ handle: 'n.ec', nombre: 'Náufrago', bio: 'bio', seguidores: 120, lugar: 'EC' })
    expect(perfilDe('tiktok', { profileUrl: 'https://www.tiktok.com/@solo.url' })?.handle).toBe('solo.url')
    expect(perfilDe('x', { userName: 'naufrago', name: 'Náufrago', description: 'bio', location: 'Olón', followers: 9, entities: { url: { urls: [{ expanded_url: 'https://naufrago.ec' }] } } })).toMatchObject({ handle: 'naufrago', lugar: 'Olón', seguidores: 9 })
    expect(perfilDe('x', { userName: 'a', entities: { url: { urls: [{ expanded_url: 'https://naufrago.ec' }] } } })?.enlaces).toContain('naufrago.ec')
    expect(perfilDe('x', { noResults: true })).toBeNull()
    expect(perfilDe('tiktok', {})).toBeNull()
  })
  it('buscar una cuenta: pide solo 5 perfiles con un tope de gasto y un error de la búsqueda no lanza', async () => {
    const llamadas: Array<{ actor: string; input: Fila; tope: number }> = []
    const ok: EjecutarCuentas = async (actor, input, tope) => { llamadas.push({ actor, input, tope }); return { items: [{ name: 'naufrago.ec_mar', nickName: 'Mar', signature: 'ver naufrago.ec' }], costo_usd: 0.002 } }
    const r = await buscarCuenta({ red: 'tiktok', quien, ejecutar: ok })
    expect(r.r).toMatchObject({ decision: 'hallada', handle: 'naufrago.ec_mar', razon: 'cuenta' })
    expect(llamadas[0]).toMatchObject({ actor: 'clockworks~tiktok-user-search-scraper', input: { keywords: ['Náufrago'], maxProfilesPerQuery: 5 }, tope: 0.03 })
    await buscarCuenta({ red: 'x', quien, ejecutar: ok })
    expect(llamadas[1]).toMatchObject({ actor: 'apidojo~twitter-user-scraper', input: { searchTerms: ['Náufrago'], maxItems: 5 } })
    const caido = await buscarCuenta({ red: 'x', quien, ejecutar: async () => { throw new Error('HTTP 500') } })
    expect(caido.r).toMatchObject({ decision: 'error', causa: 'HTTP 500' })
    const vacio = await buscarCuenta({ red: 'x', quien, ejecutar: async () => ({ items: [], costo_usd: 0 }) })
    expect(vacio.r.causa).toMatch(/no devolvió perfiles/)
  })
})

describe('4 · descubrir y dejar las cuentas en la ficha', () => {
  const cliente = { name: 'Náufrago', country: 'Ecuador', website_url: 'https://www.naufrago.ec', config: { own_social_handles: { instagram: 'naufrago.ec' }, apify: { own_handles: { instagram: 'naufrago.ec' }, competitor_list: [{ name: 'Rival', handles: { facebook: 'rival.fb' } }, { name: 'Con ambas', handles: { tiktok: '@ya', x: '@ya_x' } }] } } }
  const fichaFresca = { config: { otra_cosa: 1, own_social_handles: { instagram: 'naufrago.ec' }, apify: { url_reparto: ['https://r'], own_handles: { instagram: 'naufrago.ec' }, competitor_list: [{ name: 'Rival', handles: { facebook: 'rival.fb' } }, { name: 'Con ambas', handles: { tiktok: '@ya', x: '@ya_x' } }] } } }
  function mundo(opts: { lectura?: number; escritura?: number } = {}) {
    const llamadas: Array<{ url: string; method: string; body?: string }> = []
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      llamadas.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined })
      if (method === 'GET') return new Response(JSON.stringify([fichaFresca]), { status: opts.lectura ?? 200 })
      return new Response(null, { status: opts.escritura ?? 204 })
    }) as never
    return { fetchImpl, llamadas }
  }
  const buscador = (porRed: Record<string, Fila[]>, costo = 0.002): EjecutarCuentas => async (actor, input) => {
    const nombre = String(((input.keywords ?? input.searchTerms) as string[])[0])
    const red = actor.includes('tiktok') ? 'tiktok' : 'x'
    return { items: (porRed[`${red}:${nombre}`] ?? []) as unknown[], costo_usd: costo }
  }
  const hallazgos: Record<string, Fila[]> = {
    'tiktok:Náufrago': [{ name: 'naufrago.olon', nickName: 'Náufrago', signature: 'Mariscos en Olón', region: 'EC' }],
    'x:Náufrago': [{ userName: 'NaufragoBlog', name: 'El Náufrago', description: 'consejos', location: 'México' }],
    'tiktok:Rival': [{ name: 'rival.mar', nickName: 'Rival', signature: 'Comida en Olón' }],
  }
  it('guarda lo hallado SOLO donde estaba vacío, sin tocar el resto de la ficha, y anota cada búsqueda para no repetirla', async () => {
    const m = mundo()
    const r = await descubrirCuentas({ cliente, clientId: CID, ciudades: ['Olón'], urlDeLaBase: 'https://db', llave: 'k', token: 't', ahora, ejecutar: buscador(hallazgos), fetchImpl: m.fetchImpl })
    expect(r).toMatchObject({ estado: 'corrida', halladas: 2, no_halladas: 2, guardadas: 2 })
    expect(r.busquedas).toBe(4)
    const w = m.llamadas.find((l) => l.method === 'PATCH')!
    expect(w.url).toContain(`clients?id=eq.${CID}`)
    const cfg = JSON.parse(w.body!).config
    expect(cfg.otra_cosa).toBe(1)
    expect(cfg.apify.url_reparto).toEqual(['https://r'])
    expect(cfg.apify.own_handles).toEqual({ instagram: 'naufrago.ec', tiktok: 'naufrago.olon' })
    expect(cfg.apify.own_handles.x).toBeUndefined()
    expect(cfg.apify.competitor_list[0].handles).toEqual({ facebook: 'rival.fb', tiktok: '@rival.mar' })
    expect(cfg.apify.competitor_list[1].handles).toEqual({ tiktok: '@ya', x: '@ya_x' })
    expect(cfg.apify.busqueda_de_cuentas['propia:naufrago:x']).toMatchObject({ resultado: 'no_hallada', buscado_en: '2026-11-01T15:00:00.000Z' })
    expect(cfg.apify.busqueda_de_cuentas['propia:naufrago:x'].descartados[0].handle).toBe('NaufragoBlog')
    expect(cfg.apify.busqueda_de_cuentas['propia:naufrago:tiktok']).toMatchObject({ resultado: 'hallada', handle: 'naufrago.olon', razon: 'nombre_y_lugar' })
    expect(r.config_nueva).toEqual(cfg)
  })
  it('🔴 lo que ya está en la ficha no se busca ni se pisa; una búsqueda de menos de 30 días no se repite; pasados los 30 días sí', async () => {
    const a = await descubrirCuentas({ cliente, clientId: CID, ciudades: ['Olón'], urlDeLaBase: 'https://db', llave: 'k', token: 't', ahora, ejecutar: buscador(hallazgos), fetchImpl: mundo().fetchImpl, soloLeer: true })
    expect(a.detalle!.map((d) => `${d.quien}:${d.red}`).sort()).toEqual(['Náufrago:tiktok', 'Náufrago:x', 'Rival:tiktok', 'Rival:x'])
    const reciente = { ...cliente, config: { ...cliente.config, apify: { ...cliente.config.apify, busqueda_de_cuentas: { 'propia:naufrago:x': { buscado_en: '2026-10-20T00:00:00.000Z', resultado: 'no_hallada' } } } } }
    const b = await descubrirCuentas({ cliente: reciente, clientId: CID, ciudades: ['Olón'], urlDeLaBase: 'https://db', llave: 'k', token: 't', ahora, ejecutar: buscador(hallazgos), fetchImpl: mundo().fetchImpl, soloLeer: true })
    expect(b.detalle!.map((d) => `${d.quien}:${d.red}`)).not.toContain('Náufrago:x')
    const vieja = { ...cliente, config: { ...cliente.config, apify: { ...cliente.config.apify, busqueda_de_cuentas: { 'propia:naufrago:x': { buscado_en: '2026-09-20T00:00:00.000Z', resultado: 'no_hallada' } } } } }
    const c2 = await descubrirCuentas({ cliente: vieja, clientId: CID, ciudades: ['Olón'], urlDeLaBase: 'https://db', llave: 'k', token: 't', ahora, ejecutar: buscador(hallazgos), fetchImpl: mundo().fetchImpl, soloLeer: true })
    expect(c2.detalle!.map((d) => `${d.quien}:${d.red}`)).toContain('Náufrago:x')
    const completo = { ...cliente, config: { apify: { own_handles: { tiktok: 'a', x: 'b' } } } }
    expect((await descubrirCuentas({ cliente: completo, clientId: CID, ciudades: [], urlDeLaBase: 'https://db', llave: 'k', token: 't', ahora, ejecutar: buscador({}), fetchImpl: mundo().fetchImpl })).estado).toBe('nada_que_buscar')
  })
  it('🔴 un error de la búsqueda no se anota (se reintenta mañana) y si no se puede releer o escribir la ficha se dice que NO se guardó', async () => {
    const roto: EjecutarCuentas = async () => { throw new Error('HTTP 429') }
    const m1 = mundo()
    const r1 = await descubrirCuentas({ cliente, clientId: CID, ciudades: ['Olón'], urlDeLaBase: 'https://db', llave: 'k', token: 't', ahora, ejecutar: roto, fetchImpl: m1.fetchImpl })
    expect(r1.errores).toBe(4)
    expect(JSON.parse(m1.llamadas.find((l) => l.method === 'PATCH')!.body!).config.apify.busqueda_de_cuentas).toEqual({})
    const r2 = await descubrirCuentas({ cliente, clientId: CID, ciudades: ['Olón'], urlDeLaBase: 'https://db', llave: 'k', token: 't', ahora, ejecutar: buscador(hallazgos), fetchImpl: mundo({ lectura: 500 }).fetchImpl })
    expect(r2.mensaje).toMatch(/no se guardó/)
    const r3 = await descubrirCuentas({ cliente, clientId: CID, ciudades: ['Olón'], urlDeLaBase: 'https://db', llave: 'k', token: 't', ahora, ejecutar: buscador(hallazgos), fetchImpl: mundo({ escritura: 500 }).fetchImpl })
    expect(r3.guardadas).toBe(0)
    expect(r3.config_nueva).toBeUndefined()
    expect(r3.mensaje).toMatch(/no se guardó/)
  })
  it('el tope de búsquedas por corrida se respeta y lo que sobra se declara; sin llave o sin base no busca', async () => {
    const muchos = { ...cliente, config: { apify: { competitor_list: Array.from({ length: 10 }, (_, i) => ({ name: `Comp ${i}`, handles: {} })) } } }
    const r = await descubrirCuentas({ cliente: muchos, clientId: CID, ciudades: [], urlDeLaBase: 'https://db', llave: 'k', token: 't', ahora, ejecutar: buscador({}), fetchImpl: mundo().fetchImpl, soloLeer: true })
    expect(r.busquedas).toBe(12)
    expect(r.omitidas_por_tope).toBe(10)
    expect((await descubrirCuentas({ cliente, clientId: CID, ciudades: [], urlDeLaBase: 'https://db', llave: 'k', token: '', ahora, ejecutar: buscador({}) })).estado).toBe('sin_token')
    expect((await descubrirCuentas({ cliente, clientId: CID, ciudades: [], urlDeLaBase: '', llave: '', token: 't', ahora, ejecutar: buscador({}) })).estado).toBe('sin_base')
  })
  it('🔴 si mientras tanto la ficha ya trae esa cuenta (alguien la puso), lo hallado NO la pisa', async () => {
    const llamadas: Array<{ method: string; body?: string }> = []
    const fresca = { config: { apify: { own_handles: { tiktok: 'puesta_a_mano' }, competitor_list: [{ name: 'Rival', handles: { tiktok: '@a_mano' } }] } } }
    const fetchImpl = (async (_u: string, init?: RequestInit) => { llamadas.push({ method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? init.body : undefined }); return (init?.method ?? 'GET') === 'GET' ? new Response(JSON.stringify([fresca]), { status: 200 }) : new Response(null, { status: 204 }) }) as never
    const r = await descubrirCuentas({ cliente, clientId: CID, ciudades: ['Olón'], urlDeLaBase: 'https://db', llave: 'k', token: 't', ahora, ejecutar: buscador(hallazgos), fetchImpl })
    const cfg = JSON.parse(llamadas.find((l) => l.method === 'PATCH')!.body!).config
    expect(cfg.apify.own_handles.tiktok).toBe('puesta_a_mano')
    expect(cfg.apify.competitor_list[0].handles.tiktok).toBe('@a_mano')
    expect(r.guardadas).toBe(0)
  })
  it('en modo lectura no escribe nada', async () => {
    const m = mundo()
    await descubrirCuentas({ cliente, clientId: CID, ciudades: ['Olón'], urlDeLaBase: 'https://db', llave: 'k', token: 't', ahora, ejecutar: buscador(hallazgos), fetchImpl: m.fetchImpl, soloLeer: true })
    expect(m.llamadas).toHaveLength(0)
  })
})

// ───────────────────────────────────────── 3b · leer los comentarios de la competencia
describe('3b · lectura de los comentarios de la competencia', () => {
  const k = (id: string, o: Fila = {}): Fila => ({ id, client_id: CID, red: 'tiktok', cuenta: 'rival', texto: `comentario ${id}`, me_gusta: 1, fecha_comentario: '2026-10-10T10:00:00Z', post_url: 'https://t/1', observado_en: '2026-11-01T10:00:00Z', ...o })
  const consulta = (filas: Fila[], error: string | null = null): Consulta => async (p) => (error ? { filas: [], error } : { filas: filas.filter((x) => Object.entries(p.donde).every(([c, v]) => x[c] === v)), error: null })
  it('lo más nuevo primero con su fecha real; sin fecha va al final; cuenta por red y por cuenta; filtra por red y por cuenta (con o sin @)', async () => {
    const filas = [k('a', { fecha_comentario: '2026-09-01T00:00:00Z' }), k('b', { fecha_comentario: '2026-10-30T00:00:00Z', red: 'x', cuenta: 'Rival_X' }), k('c', { fecha_comentario: null }), k('d', { fecha_comentario: '2026-10-20T00:00:00Z' }), k('z', { client_id: 'otro' })]
    const r = await listarComentariosDeLaCompetencia(consulta(filas), { cliente: CID })
    if (!r.ok) throw new Error('debía leer')
    expect(r.comentarios.map((x) => x.comentario_id)).toEqual(['b', 'd', 'a', 'c'])
    expect(r.comentarios[0]).toMatchObject({ red: 'x', fecha_del_comentario: '2026-10-30T00:00:00Z', publicacion_url: 'https://t/1' })
    expect(r.comentarios[3].fecha_del_comentario).toBeNull()
    expect(r.por_red).toEqual({ tiktok: 3, x: 1 })
    expect(r.total).toBe(4)
    const x = await listarComentariosDeLaCompetencia(consulta(filas), { cliente: CID, red: 'x', cuenta: '@rival_x' })
    expect(x.ok && x.comentarios.map((y) => y.comentario_id)).toEqual(['b'])
    const lim = await listarComentariosDeLaCompetencia(consulta(filas), { cliente: CID, limite: 2 })
    expect(lim.ok && lim.devueltos).toBe(2)
    expect(lim.ok && lim.total).toBe(4)
  })
  it('🔴 no trae quién comentó; falta client_id o red inválida = 400; un error de lectura se dice (no se lee como vacío)', async () => {
    const r = await listarComentariosDeLaCompetencia(consulta([k('a', { usuario: 'juanperez', autor: 'anamaria' })]), { cliente: CID })
    expect(JSON.stringify(r)).not.toMatch(/juanperez|anamaria/)
    expect(await listarComentariosDeLaCompetencia(consulta([]), { cliente: '' })).toMatchObject({ ok: false, error: 'entrada_invalida' })
    expect(await listarComentariosDeLaCompetencia(consulta([]), { cliente: CID, red: 'myspace' })).toMatchObject({ ok: false, error: 'entrada_invalida' })
    expect(await listarComentariosDeLaCompetencia(consulta([], 'caída'), { cliente: CID })).toMatchObject({ ok: false, error: 'error_de_lectura' })
  })
})
