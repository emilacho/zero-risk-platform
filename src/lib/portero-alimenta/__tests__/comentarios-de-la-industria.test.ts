/** Comentarios de la industria (encargo 6): con dobles, US$ 0. Se publica apagado. */
import { describe, expect, it } from 'vitest'
import type { RespuestaDeCredito } from '../../apify/credito'
import {
  ACTORES_DE_LA_INDUSTRIA, COMENTARIOS_POR_PUBLICACION, TOPE_POR_LLAMADA_USD, TOPE_POR_PASO_USD, comentarioDeLaIndustria, comentariosDeLaIndustriaEncendidos, fichasDeLaIndustria,
  leerComentariosDeLaIndustria, pedidoDeComentarios, publicacionesDeLasTendencias, publicacionesDeYoutube, type DependenciasDeLaIndustria, type FilaDeTendencia, type FilaGuardada,
} from '../comentarios-de-la-industria'
import { pasosDelDia } from '../pasos-diarios'
import { listarComentariosDeLaCompetencia } from '../../cerebro/portero/comentarios-competencia-lectura'

const AHORA = new Date('2026-11-26T12:00:00Z')
const ON = { PORTERO_COMENTARIOS_INDUSTRIA: 'on' }
const CREDITO: RespuestaDeCredito = { hay_credito: true, leido: true, usado_usd: 5, credito_usd: 29, hasta: '2026-12-25', mensaje: null }
const tend = (red: string, ref: string, o: Partial<FilaDeTendencia> = {}): FilaDeTendencia => ({ red, nivel: 'pais', consulta: '#mariscos', post_ref: ref, url: `https://www.${red}.com/x/${ref}`, autor: 'creador', me_gusta: 100, observado_en: '2026-11-20T10:00:00Z', ...o })
const muchos = (n: number, pre: string) => Array.from({ length: n }, (_, i) => ({ cid: `${pre}${i}`, id: `${pre}${i}`, text: `opinión ${i} muy buena`, comment: `opinión ${i} muy buena`, diggCount: i, likesCount: i, voteCount: i, createTimeISO: '2026-11-20T10:00:00Z', timestamp: '2026-11-20T10:00:00Z', publishedAt: '2026-11-20T10:00:00Z', ownerUsername: 'persona.privada', uniqueId: 'persona_privada', author: '@persona' }))

function deps(o: Partial<DependenciasDeLaIndustria> & { tendencias?: FilaDeTendencia[]; costo?: number; falla?: string } = {}) {
  const llamadas: Array<{ actor: string; input: Record<string, unknown>; max: number }> = []
  const guardadas: FilaGuardada[] = []
  const d: DependenciasDeLaIndustria = {
    clientId: 'c1', ahora: AHORA, env: ON, termino: 'mariscos', pais: 'Ecuador', propias: new Set(['mipropia']),
    leerTendencias: async () => o.tendencias ?? [tend('tiktok', 't1', { me_gusta: 900 }), tend('instagram', 'i1')],
    leerLoYaLeido: async () => ({ publicaciones: new Set(), ultima_por_red: {} }),
    guardar: async (f) => { guardadas.push(...f); return { guardados: f.length } },
    ejecutar: async (actor, input, max) => {
      llamadas.push({ actor, input, max })
      if (o.falla && actor === o.falla) throw new Error('el actor falló')
      if (actor === ACTORES_DE_LA_INDUSTRIA.youtube.busqueda) return { items: [{ id: 'y1', url: 'https://www.youtube.com/watch?v=y1', viewCount: 10 }], costo_usd: o.costo ?? 0.01 }
      return { items: muchos(60, actor.slice(0, 3)), costo_usd: o.costo ?? 0.01 }
    },
    credito: async () => CREDITO,
    ...o,
  }
  return { d, llamadas, guardadas }
}

describe('industria · interruptor y puerta de crédito', () => {
  it('apagado por omisión: no llama a Apify ni lee nada; solo «on» enciende', async () => {
    expect(comentariosDeLaIndustriaEncendidos({})).toBe(false)
    expect(comentariosDeLaIndustriaEncendidos({ PORTERO_COMENTARIOS_INDUSTRIA: 'si' })).toBe(false)
    expect(comentariosDeLaIndustriaEncendidos({ PORTERO_COMENTARIOS_INDUSTRIA: ' ON ' })).toBe(true)
    const { d, llamadas, guardadas } = deps({ env: {} })
    const r = await leerComentariosDeLaIndustria(d)
    expect(r.estado).toBe('apagado')
    expect(llamadas).toEqual([]); expect(guardadas).toEqual([])
  })
  it('sin puerta de crédito no raspa', async () => {
    const { d, llamadas } = deps({ credito: undefined })
    expect((await leerComentariosDeLaIndustria(d)).estado).toBe('sin_credito')
    expect(llamadas).toEqual([])
  })
  it('sin crédito, o con menos crédito que el tope del paso, no raspa y lo dice', async () => {
    const sin = deps({ credito: async () => ({ ...CREDITO, hay_credito: false, usado_usd: 29, mensaje: 'datos sin actualizar: crédito de Apify agotado' }) })
    const r1 = await leerComentariosDeLaIndustria(sin.d)
    expect(r1).toMatchObject({ estado: 'sin_credito', mensaje: expect.stringContaining('agotado') })
    expect(sin.llamadas).toEqual([])
    const poco = deps({ credito: async () => ({ ...CREDITO, usado_usd: 29 - TOPE_POR_PASO_USD + 0.01 }) })
    const r2 = await leerComentariosDeLaIndustria(poco.d)
    expect(r2.estado).toBe('sin_credito'); expect(r2.mensaje).toContain('reserva')
    expect(poco.llamadas).toEqual([])
    const justo = deps({ credito: async () => ({ ...CREDITO, usado_usd: 29 - TOPE_POR_PASO_USD }) })
    expect((await leerComentariosDeLaIndustria(justo.d)).estado).toBe('corrida')
  })
  it('crédito sin leer: corre con su tope y lo declara', async () => {
    const { d } = deps({ credito: async () => ({ hay_credito: true, leido: false, usado_usd: null, credito_usd: null, hasta: null, mensaje: null, detalle: 'Apify respondió 500' }) })
    const r = await leerComentariosDeLaIndustria(d)
    expect(r.estado).toBe('corrida')
    expect(r.errores.join(' ')).toContain('no se pudo leer')
  })
})

describe('industria · qué publicaciones se leen', () => {
  it('TikTok 5 e Instagram 6: primero la capa más cercana (país), dentro la que más gusta; sin propias, viejas, leídas ni repetidas', () => {
    const fs = [
      tend('tiktok', 'g1', { nivel: 'global', me_gusta: 9_000_000 }), tend('tiktok', 'p1', { me_gusta: 10 }), tend('tiktok', 'p2', { me_gusta: 50 }),
      tend('tiktok', 'c1', { nivel: 'competencia', me_gusta: 1000 }), tend('tiktok', 'p3', { autor: '@MiPropia', me_gusta: 99999 }),
      tend('tiktok', 'p4', { observado_en: '2026-10-01T00:00:00Z', me_gusta: 99999 }), tend('tiktok', 'p5', { me_gusta: 70 }), tend('tiktok', 'p2', { me_gusta: 50 }),
      tend('tiktok', 'p6', { url: 'no-es-url' }), tend('tiktok', 'x1', { nivel: 'directa' }), tend('tiktok', 'm1', { nivel: 'mundo', me_gusta: 5 }), tend('tiktok', 'g2', { nivel: 'global', me_gusta: 1 }),
    ]
    const r = publicacionesDeLasTendencias(fs, 'tiktok', { ahora: AHORA, yaLeidas: new Set(['tiktok|p5']), propias: new Set(['mipropia']) })
    expect(r.map((p) => p.ref)).toEqual(['p2', 'p1', 'c1', 'g1', 'g2'])
    const ig = Array.from({ length: 9 }, (_, i) => tend('instagram', `i${i}`, { me_gusta: i }))
    expect(publicacionesDeLasTendencias([...ig, tend('instagram', 'cuenta', { consulta: 'rivaluno', me_gusta: 999 })], 'instagram', { ahora: AHORA, yaLeidas: new Set(), propias: new Set() }).map((p) => p.ref)).toEqual(['i8', 'i7', 'i6', 'i5', 'i4', 'i3'])
  })
  it('YouTube: los 3 más vistos de la búsqueda, solo urls de YouTube, sin leídos ni la cuenta propia', () => {
    const items = [{ id: 'a', url: 'https://www.youtube.com/watch?v=a', viewCount: 1 }, { id: 'b', url: 'https://www.youtube.com/watch?v=b', viewCount: 50 }, { id: 'c', url: 'https://youtu.be/c', viewCount: 40 },
      { id: 'd', url: 'https://www.youtube.com/watch?v=d', viewCount: 99, channelName: 'MiPropia' }, { id: 'e', url: 'https://otro.com/e', viewCount: 999 }, { id: 'f', url: 'https://www.youtube.com/watch?v=f', viewCount: 30 }, { id: 'b', url: 'https://www.youtube.com/watch?v=b', viewCount: 50 }]
    expect(publicacionesDeYoutube(items, { yaLeidas: new Set(['youtube|f']), propias: new Set(['mipropia']), termino: 't' }).map((p) => p.ref)).toEqual(['b', 'c', 'a'])
  })
  it('cada pedido de comentarios pide ≤ 50', () => {
    const p = { ref: 'x', url: 'https://u', capa: 'pais', consulta: null, me_gusta: null }
    expect(pedidoDeComentarios({ ...p, red: 'tiktok' })).toMatchObject({ commentsPerPost: 50, postURLs: ['https://u'] })
    expect(pedidoDeComentarios({ ...p, red: 'instagram' })).toMatchObject({ resultsLimit: 50, directUrls: ['https://u'] })
    expect(pedidoDeComentarios({ ...p, red: 'youtube' })).toMatchObject({ maxComments: 50, startUrls: [{ url: 'https://u' }] })
  })
})

describe('industria · la corrida', () => {
  it('lee las tres redes, guarda ≤ 50 por publicación con nivel, capa, vía y vigencia, y nunca a quien comenta', async () => {
    const { d, llamadas, guardadas } = deps()
    const r = await leerComentariosDeLaIndustria(d)
    expect(r.estado).toBe('corrida')
    expect(r.redes.map((x) => `${x.red}:${x.estado}:${x.publicaciones}`)).toEqual(['tiktok:leida:1', 'instagram:leida:1', 'youtube:leida:1'])
    expect(llamadas.map((l) => l.actor)).toEqual([ACTORES_DE_LA_INDUSTRIA.tiktok.comentarios, ACTORES_DE_LA_INDUSTRIA.instagram.comentarios, ACTORES_DE_LA_INDUSTRIA.youtube.busqueda, ACTORES_DE_LA_INDUSTRIA.youtube.comentarios])
    for (const red of ['tiktok', 'instagram', 'youtube']) expect(guardadas.filter((g) => g.red === red)).toHaveLength(COMENTARIOS_POR_PUBLICACION)
    expect(guardadas.every((g) => g.nivel === 'industria' && g.vigente_hasta === '2027-03-26T12:00:00.000Z' && g.cuenta.startsWith('industria:'))).toBe(true)
    expect(guardadas.find((g) => g.red === 'tiktok')).toMatchObject({ capa: 'pais', via: 'tendencia_tiktok', comentario_ref: 'tiktok:clo0' })
    expect(guardadas.find((g) => g.red === 'youtube')).toMatchObject({ capa: 'mundo', via: 'busqueda_youtube' })
    expect(JSON.stringify(guardadas)).not.toMatch(/persona/)
    expect(r.guardados).toBe(150)
    expect(r.costo_usd).toBe(0.04)
    expect(llamadas.every((l) => l.max <= TOPE_POR_LLAMADA_USD)).toBe(true)
  })
  it('una vez por semana por red: la red leída hace < 7 días queda al día y no gasta', async () => {
    const { d, llamadas } = deps({ leerLoYaLeido: async () => ({ publicaciones: new Set(), ultima_por_red: { tiktok: '2026-11-20T12:00:01Z', instagram: '2026-11-19T11:00:00Z' } }) })
    const r = await leerComentariosDeLaIndustria(d)
    expect(r.redes.map((x) => x.estado)).toEqual(['al_dia', 'leida', 'leida'])
    expect(llamadas.map((l) => l.actor)).not.toContain(ACTORES_DE_LA_INDUSTRIA.tiktok.comentarios)
  })
  it('el tope del paso corta a mitad y lo dice; ninguna llamada reserva más que lo que queda', async () => {
    const { d, llamadas } = deps({ costo: 0.2, tendencias: [tend('tiktok', 't1'), tend('tiktok', 't2'), tend('tiktok', 't3'), tend('instagram', 'i1')] })
    const r = await leerComentariosDeLaIndustria(d)
    expect(r.costo_usd).toBeLessThanOrEqual(TOPE_POR_PASO_USD + 0.2)
    expect(r.redes.some((x) => x.estado === 'tope')).toBe(true)
    expect(llamadas.every((l) => l.max <= TOPE_POR_LLAMADA_USD && l.max >= 0.01)).toBe(true)
    expect(llamadas.length).toBe(3)
  })
  it('con menos de un centavo de saldo en el paso no sale otra llamada, ni dentro de la misma red', async () => {
    // 3 llamadas de 0,165 dejan 0,005 de los 0,50: la 4.ª publicación de TikTok ya no se pide
    const { d, llamadas } = deps({ costo: 0.165, tendencias: [tend('tiktok', 't1'), tend('tiktok', 't2'), tend('tiktok', 't3'), tend('tiktok', 't4')] })
    const r = await leerComentariosDeLaIndustria(d)
    expect(llamadas).toHaveLength(3)
    expect(r.redes[0]).toMatchObject({ red: 'tiktok', estado: 'tope', publicaciones: 3 })
  })
  it('un actor que falla se dice en errores y la red queda con_errores; las otras siguen', async () => {
    const { d } = deps({ falla: ACTORES_DE_LA_INDUSTRIA.instagram.comentarios })
    const r = await leerComentariosDeLaIndustria(d)
    expect(r.redes.map((x) => x.estado)).toEqual(['leida', 'con_errores', 'leida'])
    expect(r.errores.join(' ')).toContain('instagram-comment-scraper')
  })
  it('sin rubro no busca en YouTube; sin tendencias declara que no hay publicaciones', async () => {
    const { d, llamadas } = deps({ termino: null, tendencias: [] })
    const r = await leerComentariosDeLaIndustria(d)
    expect(r.redes.map((x) => x.estado)).toEqual(['sin_publicaciones', 'sin_publicaciones', 'sin_rubro'])
    expect(llamadas).toEqual([])
  })
  it('un error al guardar se dice', async () => {
    const { d } = deps({ guardar: async () => ({ guardados: 0, error: 'HTTP 500' }) })
    expect((await leerComentariosDeLaIndustria(d)).errores).toContain('HTTP 500')
  })
})

describe('industria · privacidad y fichas', () => {
  it('el comentario pierde @usuarios, correos y teléfonos; sin texto o sin id no entra', () => {
    const p = { red: 'youtube' as const, ref: 'v', url: 'https://u', capa: 'mundo', consulta: null, me_gusta: null }
    expect(comentarioDeLaIndustria(p, { cid: 'k', comment: 'hola @juan escribe a ana@x.com o al 0991234567', author: 'Juan' })?.texto).toBe('hola [usuario omitido] escribe a [correo omitido] o al [teléfono omitido]')
    expect(comentarioDeLaIndustria(p, { cid: 'k', comment: '   ' })).toBeNull()
    expect(comentarioDeLaIndustria(p, { comment: 'sin id' })).toBeNull()
    expect(Object.keys(comentarioDeLaIndustria(p, { cid: 'k', comment: 'x', author: 'Juan' }) ?? {})).not.toContain('autor')
  })
  it('una ficha por publicación, clase comentarios_de_la_industria, alcance mercado, con red, capa, vía y su vigencia', () => {
    const filas = [
      { red: 'tiktok', post_ref: 'a', post_url: 'https://t/a', texto: 'uno', me_gusta: 1, fecha_comentario: '2026-11-01T00:00:00Z', capa: 'pais', via: 'tendencia_tiktok', vigente_hasta: '2027-03-01T00:00:00Z' },
      { red: 'tiktok', post_ref: 'a', post_url: 'https://t/a', texto: 'dos @pepe', me_gusta: 5, fecha_comentario: '2026-11-03T00:00:00Z', capa: 'pais', via: 'tendencia_tiktok', vigente_hasta: '2027-03-02T00:00:00Z' },
      { red: 'youtube', post_ref: 'b', post_url: 'https://y/b', texto: 'tres', me_gusta: null, fecha_comentario: null, capa: 'mundo', via: 'busqueda_youtube', vigente_hasta: null },
      { red: 'youtube', post_ref: '', texto: 'sin publicación' },
    ]
    const f = fichasDeLaIndustria(filas, 'c1', AHORA)
    expect(f).toHaveLength(2)
    expect(f[0]).toMatchObject({ clase: 'comentarios_de_la_industria', alcance: 'mercado', brazo: 'comentarios', origen: 'tercero', fuente_url: 'https://t/a', fecha_fuente: '2026-11-03T00:00:00.000Z', vigente_hasta: '2027-03-02T00:00:00.000Z', datos: { red: 'tiktok', nivel: 'industria', capa: 'pais', via: 'tendencia_tiktok', comentarios: 2 } })
    expect(f[0].contenido).toMatch(/^Lo que comenta el público del rubro en TikTok[\s\S]*«dos \[usuario omitido\]»[\s\S]*«uno»/)
    expect(f[0].contenido).not.toContain('pepe')
    expect(f[1].contenido).toContain('sin fecha')
    expect(f[1].vigente_hasta).toBe('2027-03-26T12:00:00.000Z')
    expect(f[0].ref).not.toBe(f[1].ref)
  })
})

describe('industria · el paso diario y la lectura de la competencia', () => {
  it('apagada, el paso no entra al día (ni deja renglón); encendida, sí', () => {
    const dia = new Date('2026-11-27T12:00:00Z')
    const base = { PORTERO_DIAS_DE_CORRIDA: 'todos' }
    const sin = pasosDelDia(dia, base), con = pasosDelDia(dia, { ...base, ...ON })
    expect(sin.length).toBeGreaterThan(4) // control: es un día con corrida y las fuentes nuevas están encendidas
    expect(sin).not.toContain('comentarios_industria')
    expect(con).toContain('comentarios_industria')
    expect(con.filter((p) => p !== 'comentarios_industria')).toEqual(sin)
    expect(pasosDelDia(dia, { ...base, ...ON, PORTERO_FUENTES_NUEVAS: 'off' })).not.toContain('comentarios_industria')
  })
  it('la lectura de comentarios de la COMPETENCIA pide solo nivel competencia', async () => {
    let donde: Record<string, unknown> = {}
    await listarComentariosDeLaCompetencia((async (q: { donde: Record<string, unknown> }) => { donde = q.donde; return { filas: [], error: null } }) as never, { cliente: 'c1' })
    expect(donde).toEqual({ client_id: 'c1', nivel: 'competencia' })
  })
})
