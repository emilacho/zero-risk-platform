/**
 * 02-nov · las seis fuentes nuevas, INTEGRADAS de punta a punta con los diez clientes de práctica (US$ 0 · base falsa · actores falsos · sin modelo):
 * paso del portero → fichas del cerebro (clase, alcance, nivel) → consulta/pedido (todo=1) → material de cada analista de la mesa → resumen vivo.
 * La tabla «fuente → clase → quién la recibe → cuántas llegaron» sale de aquí, no de una promesa.
 */
import { describe, expect, it } from 'vitest'
import { ANALISTAS, armarMaterial, type TipoDeAnalisis } from '../../planeacion/mesa-de-analisis'
import { REDES_DE_IG_Y_FB, REDES_DEL_PASO_DE_SIEMPRE, comentarioDe, cuentasDeLaFicha, leerComentariosDeUnaCuenta, publicacionDe, type EjecutarComentarios } from '../comentarios-de-redes'
import { rutaConsultar } from '../consultar'
import { CLASES_NUEVAS, correrFuenteNueva, FUENTES_NUEVAS, type Ejecutar, type FuenteNueva } from '../fuentes-nuevas'
import { armarResumen, type FichaParaResumen } from '../resumen-vivo'
import { crearBaseFalsa } from './base-falsa'
import { DIEZ_CLIENTES, type ClienteSintetico } from './diez-clientes.fixtures'
import { tablasDe, type T } from './diez-clientes.tablas'

const AHORA = new Date('2026-11-04T12:30:00Z')
const ciudadDe = (c: ClienteSintetico): string => c.sedes[0]?.ciudad ?? c.pais
const HIST = { Fr: [{ hour: 13, occupancyPercent: 95 }, { hour: 14, occupancyPercent: 80 }], Sa: [{ hour: 20, occupancyPercent: 100 }] }
const clienteDe = (c: ClienteSintetico) => ({
  id: c.id, name: c.nombre, industry: c.rubro, country: c.iso.toUpperCase(), market: `${ciudadDe(c)}, ${c.pais}`,
  config: { apify: { competitor_list: [{ name: 'Rival Uno', website: 'https://rivaluno.example', competitor_type: 'direct', handles: { instagram: 'rivaluno', facebook: 'rivaluno.fb' } }] } },
})
/** actores falsos con la forma de lo que devolvieron las llamadas reales del 02-nov */
const actorFalso = (c: ClienteSintetico): Ejecutar => async (actor, input) => {
  if (actor.includes('ads-transparency')) return { items: [{ creativeId: 'CRX1', advertiserName: 'RIVAL UNO', domain: 'rivaluno.example', format: 'VIDEO', firstShown: '2026-09-01T00:00:00Z', lastShown: '2026-11-02T00:00:00Z', adHeadline: 'Oferta de temporada', region: c.iso.toUpperCase(), adUrl: 'https://adstransparency.google.com/x' }], costo_usd: 0.004 }
  if (actor.includes('google-trends')) return { items: [{ interestOverTime_timelineData: Array.from({ length: 93 }, (_, i) => ({ time: String(Date.parse('2026-08-02T00:00:00Z') / 1000 + i * 86400), value: [10 + (i % 7)], hasData: [true] })), interestBySubregion: [{ geoName: ciudadDe(c), value: [100], hasData: [true] }], relatedQueries_top: [{ query: 'precio', value: 100 }], relatedQueries_rising: [] }], costo_usd: 0.003 }
  if (actor.includes('google-events')) return { items: [{ title: `Feria de ${ciudadDe(c)}`, startDate: '2026-11-20T18:00:00', venue: 'Centro de convenciones', address: `${String(input.location).split(',')[0]}, ${c.pais}`, eventType: 'feria' }], costo_usd: 0.005 }
  if (actor.includes('reddit')) return { items: [{ parsedId: 'h1', title: `${c.rubro.split(/ y |\(/)[0].split(' ').slice(0, 2).join(' ')} en ${c.pais}: ¿qué recomiendan?`, body: `Busco opciones en ${ciudadDe(c)}`, communityName: 'consultas', postUrl: 'https://www.reddit.com/r/consultas/comments/h1/', createdAt: '2026-10-30T12:00:00Z', score: 4, commentsCount: 1 }, { dataType: 'comment', parsedPostId: 'h1', body: 'A mí me fue bien con uno que atiende rápido', commentCreatedAt: '2026-10-31T12:00:00Z' }], costo_usd: 0.002 }
  return { items: [], costo_usd: 0 }
}
const mundo = (c: ClienteSintetico): T => ({
  ...tablasDe(c), cerebro_fichas: [], cerebro_ingresos: [], cerebro_consultas: [], cerebro_pedidos: [], agents: [],
  apify_raw: [
    { client_id: c.id, ensayo: false, apify_function: 'own_google_maps_profile', created_at: '2026-11-03T10:00:00Z', respuesta: [{ title: c.nombre, city: ciudadDe(c), popularTimesHistogram: HIST }] },
    { client_id: c.id, ensayo: false, apify_function: 'google_maps_scraper', created_at: '2026-11-03T11:00:00Z', respuesta: [{ title: 'Rival Uno', city: ciudadDe(c), popularTimesHistogram: HIST }] },
  ],
  cerebro_comentarios_competencia: [{ client_id: c.id, red: 'instagram', cuenta: 'rivaluno', post_ref: 'P1', post_url: 'https://www.instagram.com/p/P1/', comentario_ref: 'k1', texto: 'Me atendieron bien pero tardaron mucho en responder', me_gusta: 2, fecha_comentario: '2026-10-28T10:00:00Z' }],
})
const ANALISTAS_QUE_RECIBEN: Record<FuenteNueva, { clase: string; analistas: TipoDeAnalisis[] }[]> = {
  anuncios_google: [{ clase: CLASES_NUEVAS.anuncios, analistas: ['competencia'] }],
  busquedas_google: [{ clase: CLASES_NUEVAS.busqueda, analistas: ['mercado'] }],
  horas_de_mas_gente: [{ clase: CLASES_NUEVAS.horas_propias, analistas: ['retencion'] }, { clase: CLASES_NUEVAS.horas_competencia, analistas: ['competencia'] }],
  eventos_locales: [{ clase: CLASES_NUEVAS.evento, analistas: ['mercado'] }],
  comentarios_ig_fb: [{ clase: CLASES_NUEVAS.comentarios, analistas: ['competencia', 'voz_del_publico'] }],
  foros: [{ clase: CLASES_NUEVAS.foro, analistas: ['mercado', 'voz_del_publico'] }],
}

describe('las seis fuentes integradas · diez clientes', () => {
  for (const c of DIEZ_CLIENTES) {
    it(`${c.nombre} (${c.pais}): cada fuente deja su clase, cada analista la recibe con su nivel, y el resumen vivo la cita`, async () => {
      const t = mundo(c)
      const base = crearBaseFalsa(t as never)
      const cli = clienteDe(c)
      for (const fuente of FUENTES_NUEVAS) {
        const r = await correrFuenteNueva({ db: base.db, fuente, cliente: cli, clientId: c.id, ciudadesDeSedes: c.sedes.map((s) => s.ciudad), ahora: AHORA, ejecutar: actorFalso(c), leerComentarios: async () => ({ costo_usd: 0 }) })
        expect(r.errores, fuente).toEqual([])
        expect(Number((r.resumen.fichas_armadas as number | undefined) ?? 0), `${fuente} sin fichas`).toBeGreaterThan(0)
      }
      const fichas = t.cerebro_fichas as Array<Record<string, unknown>>
      // cada clase nueva existe con su alcance y sin dato personal
      const porClase = (k: string) => fichas.filter((f) => f.clase === k)
      for (const k of Object.values(CLASES_NUEVAS)) expect(porClase(k).length, k).toBeGreaterThan(0)
      expect(porClase(CLASES_NUEVAS.busqueda)[0]).toMatchObject({ alcance: 'pais', propiedad: 'ajena' })
      expect(porClase(CLASES_NUEVAS.horas_propias)[0]).toMatchObject({ alcance: 'cliente', propiedad: 'propia' })

      // cada analista RECIBE lo suyo por la consulta con todo=1 (el pedido de la mesa)
      const recibido: Record<string, Record<string, number>> = {}
      for (const a of Object.values(ANALISTAS)) {
        const r = (await rutaConsultar({ db: base.db as never, ahora: AHORA }, { client_id: c.id, oficina: 'mesa', agente: a.agente, que: a.que, ...(a.clases ? { clase: a.clases } : {}), todo: true, contenido_completo: true })).body as { resultados: Array<{ ficha_id: string; clase: string; nivel: string; fecha_de_la_fuente?: string; contenido: string }>; total_encontradas: number; entregadas: number }
        expect(r.entregadas).toBe(r.total_encontradas)
        recibido[a.tipo] = {}
        for (const x of r.resultados) recibido[a.tipo][x.clase] = (recibido[a.tipo][x.clase] ?? 0) + 1
        const m = armarMaterial({ resumen_vivo: null, fichas: r.resultados.map((x) => ({ ficha_id: x.ficha_id, clase: x.clase, fecha: x.fecha_de_la_fuente ?? null, contenido: x.contenido })), encontradas: r.total_encontradas })
        expect(m.texto).not.toMatch(/faltan/)
      }
      for (const fuente of FUENTES_NUEVAS) for (const { clase, analistas } of ANALISTAS_QUE_RECIBEN[fuente]) for (const an of analistas) expect(recibido[an][clase], `${fuente} → ${clase} → ${an}`).toBeGreaterThan(0)

      // los niveles del embudo: búsquedas y eventos = país, foros = competencia, anuncios/comentarios/horas de rivales = directa
      const niv = async (clase: string) => ((await rutaConsultar({ db: base.db as never, ahora: AHORA }, { client_id: c.id, oficina: 'mesa', agente: 'x', clase, todo: true })).body as { resultados: Array<{ nivel: string }> }).resultados[0].nivel
      expect(await niv(CLASES_NUEVAS.busqueda)).toBe('pais'); expect(await niv(CLASES_NUEVAS.evento)).toBe('pais'); expect(await niv(CLASES_NUEVAS.foro)).toBe('competencia')
      expect(await niv(CLASES_NUEVAS.anuncios)).toBe('directa'); expect(await niv(CLASES_NUEVAS.comentarios)).toBe('directa'); expect(await niv(CLASES_NUEVAS.horas_competencia)).toBe('directa'); expect(await niv(CLASES_NUEVAS.horas_propias)).toBe('propio')

      // el resumen vivo las recoge con su cita y su fecha, sin inventar
      const paraResumen: FichaParaResumen[] = fichas.map((f) => ({ id: String(f.id), clase: String(f.clase), titulo: String(f.titulo), contenido: String(f.contenido), atributo: (f.atributo as string) ?? null, observado_en: (f.observado_en as string) ?? null, fecha_fuente: (f.fecha_fuente as string) ?? null, vigente_hasta: (f.vigente_hasta as string) ?? null, retirada_en: null, provenance_tag: f.provenance_tag, descartada: false, creado_en: null } as never))
      const res = armarResumen({ client_id: c.id, nombre: c.nombre, rubro: c.rubro, ahora: AHORA, fichas: paraResumen, zona: [], sedes: [] })
      expect(res.secciones.competencia_afuera).toBeGreaterThan(0); expect(res.secciones.mercado_afuera).toBeGreaterThan(0)
      expect(res.texto).toMatch(/## Lo que se ve de la competencia[\s\S]*\[ficha:[0-9a-f-]{8} · \d{4}-\d{2}-\d{2}\]/)
      expect(res.texto).toMatch(/## Contexto de su mercado[\s\S]*Interés de búsqueda[\s\S]*Evento en/)
    })
  }
  it('sin material nuevo, el resumen vivo no agrega secciones ni huecos (no cambia lo de hoy)', () => {
    const r = armarResumen({ client_id: 'x', nombre: 'X', rubro: null, ahora: AHORA, fichas: [], zona: [], sedes: [] })
    expect(r.secciones.competencia_afuera).toBeUndefined(); expect(r.secciones.mercado_afuera).toBeUndefined()
    expect(r.texto).not.toMatch(/Lo que se ve de la competencia|Contexto de su mercado/)
  })
  it('la mesa pide por nombre las clases nuevas a cada analista (competencia · mercado · voz del público · retención)', () => {
    expect(ANALISTAS.competencia.clases).toEqual(expect.stringContaining('competidor_anuncios_google'))
    expect(ANALISTAS.competencia.clases).toEqual(expect.stringContaining('competidor_comentarios'))
    expect(ANALISTAS.competencia.clases).toEqual(expect.stringContaining('competidor_horas_de_mas_gente'))
    for (const k of ['tendencia_busqueda', 'evento_local', 'foro']) expect(ANALISTAS.mercado.clases).toEqual(expect.stringContaining(k))
    for (const k of ['comentarios', 'resenas', 'mencion', 'foro', 'competidor_comentarios']) expect(ANALISTAS.voz_del_publico.clases).toEqual(expect.stringContaining(k))
    for (const k of ['horas_de_mas_gente', 'metrica', 'resenas']) expect(ANALISTAS.retencion.clases).toEqual(expect.stringContaining(k))
  })
})

describe('comentarios de Instagram y Facebook de la competencia · una vez por publicación', () => {
  const config = { apify: { own_handles: { instagram: 'miempresa', tiktok: 'miempresa' }, competitor_list: [{ name: 'Veseind', instagram: '@veseind.sa', handles: { tiktok: '@veseind.sa', facebook: 'veseind', x: '@veseind' } }] } }
  it('cada cuenta se lee en UN solo paso: el de siempre TikTok y X; el nuevo Instagram y Facebook (de la competencia)', () => {
    const siempre = cuentasDeLaFicha(config, REDES_DEL_PASO_DE_SIEMPRE).map((c) => `${c.rol}:${c.red}`).sort()
    const nuevo = cuentasDeLaFicha(config, REDES_DE_IG_Y_FB).map((c) => `${c.rol}:${c.red}:${c.cuenta}`).sort()
    expect(siempre).toEqual(['competidor:tiktok', 'competidor:x', 'propia:tiktok'])
    expect(nuevo).toEqual(['competidor:facebook:veseind', 'competidor:instagram:veseind.sa'])
    expect(nuevo.some((x) => x.startsWith('propia'))).toBe(false)
  })
  it('lee publicaciones y comentarios de Instagram con su fecha real', () => {
    expect(publicacionDe('instagram', { shortCode: 'C1', url: 'https://www.instagram.com/p/C1/', commentsCount: 7 })).toEqual({ ref: 'C1', url: 'https://www.instagram.com/p/C1/', comentarios: 7 })
    const k = comentarioDe('instagram', { id: '99', text: 'Muy buena atención del equipo, gracias', likesCount: 3, timestamp: '2026-10-30T10:00:00.000Z' }, { cuenta: 'veseind.sa', rol: 'competidor', post: { ref: 'C1', url: 'u', comentarios: 7 } })
    expect(k).toMatchObject({ red: 'instagram', comentario_ref: '99', me_gusta: 3, fecha: '2026-10-30T10:00:00.000Z' })
  })
  it('una publicación ya leída NO se pide otra vez: solo se piden los comentarios de la que falta', async () => {
    const pedidos: Array<{ actor: string; input: Record<string, unknown> }> = []
    const ejecutar: EjecutarComentarios = async (actor, input) => {
      pedidos.push({ actor, input })
      if (actor.includes('instagram-scraper')) return { items: [{ shortCode: 'A', url: 'https://www.instagram.com/p/A/', commentsCount: 9 }, { shortCode: 'B', url: 'https://www.instagram.com/p/B/', commentsCount: 5 }], costo_usd: 0.01 }
      return { items: [{ id: 'c1', text: 'Comentario nuevo de la publicación B', timestamp: '2026-11-01T10:00:00Z' }], costo_usd: 0.02 }
    }
    const r = await leerComentariosDeUnaCuenta({ red: 'instagram', cuenta: 'veseind.sa', rol: 'competidor' }, ejecutar, 0.2, new Set(['A']))
    const deComentarios = pedidos.filter((p) => p.actor.includes('comment'))
    expect(deComentarios).toHaveLength(1); expect(deComentarios[0].input).toMatchObject({ directUrls: ['https://www.instagram.com/p/B/'] })
    expect(r.comentarios).toHaveLength(1)
    // si todas ya se leyeron, no se pide ningún comentario
    pedidos.length = 0
    const r2 = await leerComentariosDeUnaCuenta({ red: 'instagram', cuenta: 'veseind.sa', rol: 'competidor' }, ejecutar, 0.2, new Set(['A', 'B']))
    expect(pedidos.filter((p) => p.actor.includes('comment'))).toHaveLength(0); expect(r2.r.causa).toMatch(/ya se leyeron/)
  })
})
