/**
 * 02-nov · las seis fuentes nuevas (anuncios de Google/YouTube, búsquedas, horas de más gente, eventos, comentarios de Instagram y Facebook, foros).
 * US$ 0 · base falsa · actores falsos con la FORMA de lo que devolvieron las llamadas reales del 02-nov · sin red ni modelo.
 */
import { describe, expect, it } from 'vitest'
import {
  CLASES_NUEVAS, FUENTES_NUEVAS, competidoresDeLaFicha, correrFuenteNueva, datosDelCliente, fichaDeBusqueda, fichasDeAnuncios, fichasDeComentarios, fichasDeEventos, fichasDeForos, fichasDeHoras,
  fuentesNuevasEncendidas, pedidoDeAnuncios, pedidoDeBusqueda, pedidoDeEventos, pedidoDeForos, terminoDelRubro, textoDeHoras, type Ejecutar,
} from '../fuentes-nuevas'
import { PASOS, PASOS_DE_REDES, esPaso, pasosDelDia } from '../pasos-diarios'
import { nivelDeFicha } from '../embudo'
import { crearBaseFalsa } from './base-falsa'

const AHORA = new Date('2026-11-04T12:30:00Z')
const CL = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const ZR = 'df7e47cc-bec4-4fa2-bc24-ff97ba5213a5'

const ZERO_RISK = { name: 'Zero Risk Seguridad Industrial', industry: 'seguridad industrial y protección contra incendios (extintores) · B2B', country: 'EC', market: 'Guayaquil, Ecuador · Ecuador (envíos nacionales)', config: { apify: { competitor_list: [
  { name: 'Veseind S.A.', website: 'https://veseind.com/', competitor_type: 'direct', handles: { tiktok: '@veseind.sa', facebook: 'veseind', linkedin: 'Veseind S.A.', instagram: '@veseind.sa' } },
  { name: 'Extintores y Servicios TRD', website: 'https://extintores.ec/', competitor_type: 'direct' },
  { name: 'IMPROSEG', competitor_type: 'direct', handles: { linkedin: 'linkedin.com/in/improseg-237083185' } },
  { name: 'Un directorio', website: 'https://www.facebook.com/undirectorio' },
] } } }
const NAUFRAGO = { name: 'Náufrago', industry: 'restaurante de mariscos costero ecuatoriano', country: 'EC', market: 'Olón, Santa Elena, Ecuador', config: { apify: { competitor_list: [
  { name: 'Rasimar Restaurante', handles: { x: '@RasimarKathi' }, competitor_type: 'direct' },
  { name: 'Targelia Restaurante', handles: { facebook: 'targeliaolon' }, competitor_type: 'direct' },
  { name: 'MOMO Restaurante y Deli', handles: { facebook: 'momo.olon.restaurante' }, competitor_type: 'indirect' },
] } } }
const dZR = datosDelCliente(ZERO_RISK, ZR, [])
const dNA = datosDelCliente(NAUFRAGO, CL, ['Guayaquil', 'Olon'])
const ctx = (clientId: string) => ({ clientId, ahora: AHORA })

describe('el cliente → lo que las fuentes necesitan', () => {
  it('el término del rubro es corto y sale de la primera cláusula', () => {
    expect(terminoDelRubro('seguridad industrial y protección contra incendios (extintores) · B2B')).toBe('seguridad industrial')
    expect(terminoDelRubro('restaurante de mariscos costero ecuatoriano')).toBe('restaurante de mariscos')
    expect(terminoDelRubro('unknown')).toBeNull()
    expect(terminoDelRubro('')).toBeNull()
  })
  it('país, ciudades sin repetir (Olón = Olon) y competidores con su dominio propio (un directorio no es sitio propio)', () => {
    expect(dNA.iso).toBe('ec'); expect(dNA.pais).toBe('Ecuador')
    expect(dNA.ciudades).toEqual(['Guayaquil', 'Olon'])
    expect(dZR.ciudades).toEqual(['Guayaquil'])
    const v = dZR.competidores.find((c) => c.nombre === 'Veseind S.A.')!
    expect(v).toMatchObject({ dominio: 'veseind.com', instagram: 'veseind.sa', facebook: 'veseind' })
    expect(dZR.competidores.find((c) => c.nombre === 'Un directorio')!.dominio).toBeNull()
    expect(dZR.competidores.find((c) => c.nombre === 'IMPROSEG')!.dominio).toBeNull()
  })
  it('los vetados no entran', () => {
    const c = competidoresDeLaFicha({ apify: { competitor_list: [{ name: 'A', website: 'https://a.com' }, { name: 'B', website: 'https://b.com' }], competidores_vetados: ['b'] } })
    expect(c.map((x) => x.nombre)).toEqual(['A'])
  })
})

describe('1 · anuncios de la competencia en Google y YouTube', () => {
  const anuncio = (o: Record<string, unknown> = {}) => ({ creativeId: 'CR1', advertiserId: 'AR1', advertiserName: 'VESEIND S.A.', domain: 'veseind.com', format: 'IMAGE', firstShown: '2026-02-04T13:19:41.000Z', lastShown: '2026-11-02T14:45:49.000Z', shownForDays: 247, adUrl: 'https://adstransparency.google.com/advertiser/AR1/creative/CR1?region=EC', region: 'EC', adHeadline: 'Extintores PQS desde $20', adTextLines: ['Extintores PQS desde $20', 'veseind.com'], previewUrl: 'https://x/p', ...o })
  it('el pedido va por dominio exacto y país', () => {
    expect(pedidoDeAnuncios('veseind.com', 'ec')).toMatchObject({ domains: ['veseind.com'], region: 'EC', includeAdText: true })
    expect(pedidoDeAnuncios('veseind.com', null)).toMatchObject({ region: 'ANYWHERE' })
  })
  it('una ficha por anuncio: anunciante, texto, formato, fechas y país; alcance competidor; nivel directa', () => {
    const c = dZR.competidores.find((x) => x.dominio === 'veseind.com')!
    const { fichas, informe } = fichasDeAnuncios([anuncio(), anuncio({ creativeId: 'CR2', format: 'VIDEO' })], c, ctx(ZR))
    expect(fichas).toHaveLength(2); expect(informe.de_otro_dominio).toBe(0)
    expect(fichas[0]).toMatchObject({ clase: CLASES_NUEVAS.anuncios, alcance: 'competidor', origen: 'tercero', decision: 'suma', fecha_fuente: '2026-02-04T13:19:41.000Z', client_id: ZR })
    expect(fichas[0].ref.startsWith('brazo:')).toBe(true)
    expect(fichas[0].contenido).toContain('Veseind S.A.'); expect(fichas[0].contenido).toContain('Extintores PQS desde $20'); expect(fichas[0].contenido).toContain('2026-02-04'); expect(fichas[0].contenido).toContain('país EC')
    expect(fichas[1].contenido).toContain('video (YouTube)')
    expect(nivelDeFicha(fichas[0].alcance)).toBe('directa')
  })
  it('un anuncio de OTRO dominio (homónimo) se descarta y se cuenta; sin identificador tampoco entra', () => {
    const c = dZR.competidores.find((x) => x.dominio === 'veseind.com')!
    const { fichas, informe } = fichasDeAnuncios([anuncio({ domain: 'veseind-falso.com' }), anuncio({ domain: 'otro.com' }), anuncio({ creativeId: '' }), anuncio({ domain: 'tienda.veseind.com', creativeId: 'CR9' })], c, ctx(ZR))
    expect(informe).toMatchObject({ de_otro_dominio: 2, sin_identificador: 1 }); expect(fichas.map((f) => f.datos?.anuncio_id)).toEqual(['CR9'])
  })
  it('no guarda @usuarios del texto', () => {
    const c = dZR.competidores.find((x) => x.dominio === 'veseind.com')!
    const { fichas } = fichasDeAnuncios([anuncio({ adHeadline: 'Escríbenos a @juan.perez ya', adTextLines: [] })], c, ctx(ZR))
    expect(fichas[0].contenido).not.toContain('@juan')
  })
})

describe('2 · interés de búsqueda del rubro (Google Trends)', () => {
  const dias = (n: number, f: (i: number) => number) => Array.from({ length: n }, (_, i) => ({ time: String(Date.parse('2026-08-02T00:00:00Z') / 1000 + i * 86400), value: [f(i)], hasData: [f(i) > 0] }))
  const trends = (serie: Array<{ time: string; value: number[]; hasData: boolean[] }>) => [{ searchTerm: 'seguridad industrial', interestOverTime_timelineData: serie,
    interestBySubregion: [{ geoName: 'Orellana Province', value: [100], hasData: [true] }, { geoName: 'Guayas Province', value: [30], hasData: [true] }, { geoName: 'Loja Province', value: [0], hasData: [false] }],
    interestByCity: [{ geoName: 'Guayaquil', value: [55], hasData: [true] }], relatedQueries_top: [{ query: 'que es seguridad industrial', value: 100 }], relatedQueries_rising: [{ query: 'guantes de seguridad industrial', value: 200, formattedValue: '+200%' }] }]
  it('el pedido es país + 3 meses', () => { expect(pedidoDeBusqueda('seguridad industrial', 'ec')).toMatchObject({ searchTerms: ['seguridad industrial'], geo: 'EC', timeRange: 'today 3-m', viewedFrom: 'ec' }) })
  it('arma la ficha con semanas, cambio, zonas, ciudades, relacionadas y en subida; alcance país; vence en 14 días', () => {
    const r = fichaDeBusqueda(trends(dias(93, (i) => (i < 60 ? 10 : 30))), dZR, ctx(ZR))
    const f = r.ficha!
    expect(f).toMatchObject({ clase: 'tendencia_busqueda', alcance: 'pais', origen: 'plataforma', decision: 'reemplaza', atributo: 'busqueda:seguridad-industrial:ec' })
    expect(f.contenido).toContain('suben'); expect(f.contenido).toContain('Orellana 100'); expect(f.contenido).toContain('Guayaquil 55'); expect(f.contenido).toContain('en las zonas del cliente: Guayaquil 55')
    expect(f.contenido).toContain('que es seguridad industrial'); expect(f.contenido).toContain('guantes de seguridad industrial (+200%)')
    expect(f.contenido).not.toContain('Loja')
    expect(Date.parse(f.vigente_hasta!) - AHORA.getTime()).toBe(14 * 86_400_000)
    expect(nivelDeFicha(f.alcance)).toBe('pais')
  })
  it('todo en cero NO es una tendencia: no hay ficha y se dice por qué', () => {
    const r = fichaDeBusqueda(trends(dias(93, () => 0)), dZR, ctx(ZR))
    expect(r.ficha).toBeNull(); expect(r.motivo).toMatch(/demasiado bajo/)
  })
  it('sin país o sin rubro no se inventa', () => {
    expect(fichaDeBusqueda(trends(dias(10, () => 5)), datosDelCliente({ name: 'X', industry: 'unknown' }, 'x', []), ctx('x')).ficha).toBeNull()
  })
})

describe('3 · horas de más gente (del raspado de Mapas que ya existe)', () => {
  const hist = { Fr: [{ hour: 12, occupancyPercent: 60 }, { hour: 13, occupancyPercent: 95 }, { hour: 14, occupancyPercent: 80 }, { hour: 15, occupancyPercent: 20 }, { hour: 21, occupancyPercent: 70 }], Sa: [{ hour: 20, occupancyPercent: 100 }] }
  it('dice las tres horas más llenas de cada día', () => { expect(textoDeHoras(hist)).toBe('viernes 13h (95 %), 14h (80 %), 21h (70 %) · sábado 20h (100 %)'); expect(textoDeHoras({})).toBeNull() })
  const filas = [
    { apify_function: 'own_google_maps_profile', created_at: '2026-11-03T10:00:00Z', respuesta: [{ title: 'Náufrago', city: 'Olón', popularTimesHistogram: hist }, { title: 'Otro lugar cualquiera', city: 'Olón', popularTimesHistogram: hist }, { title: 'Náufrago', city: 'Guayaquil' }] },
    { apify_function: 'google_maps_scraper', created_at: '2026-11-03T11:00:00Z', respuesta: [{ title: 'Rasimar Restaurante', city: 'Olón', popularTimesHistogram: hist }, { title: 'Rasimar Restaurante', city: 'Olón', popularTimesHistogram: { Fr: [{ hour: 9, occupancyPercent: 5 }] } }] },
  ]
  it('la ficha propia confirmada y la de cada competidor, cada una con su clase; lo que no se puede atribuir se cuenta', () => {
    const { fichas, informe } = fichasDeHoras(filas, dNA, ctx(CL))
    expect(informe).toEqual({ lugares_con_horas: 2, propios: 1, competencia: 1, sin_atribuir: 1 })
    expect(fichas.find((f) => f.alcance === 'cliente')).toMatchObject({ clase: 'horas_de_mas_gente', origen: 'plataforma', decision: 'reemplaza', renueva_vigencia: true })
    expect(fichas.find((f) => f.alcance === 'competidor')).toMatchObject({ clase: 'competidor_horas_de_mas_gente' })
    expect(fichas.find((f) => f.alcance === 'competidor')!.contenido).toContain('Competidor Rasimar Restaurante')
  })
  it('un ensayo no cuenta', () => {
    expect(fichasDeHoras(filas.map((f) => ({ ...f, ensayo: true })), dNA, ctx(CL)).fichas).toHaveLength(0)
  })
})

describe('4 · eventos locales', () => {
  const ev = (o: Record<string, unknown>) => ({ title: 'Barcelona vs. Ldu Quito', startDate: '2026-11-08T15:00:00', endDate: null, eventType: 'Ecuadorian football match', venue: 'Banco Pichincha Monumental Stadium', address: 'Guayaquil, Ecuador', ...o })
  it('el pedido va por ciudad y país', () => { expect(pedidoDeEventos('Guayaquil', 'Ecuador')).toMatchObject({ location: 'Guayaquil, Ecuador' }) })
  it('solo eventos futuros dentro de 120 días y de la ciudad, con su fecha; alcance país; vencen al pasar', () => {
    const { fichas, informe } = fichasDeEventos([ev({}), ev({ title: 'Ayer', startDate: '2026-10-20T10:00:00' }), ev({ title: 'En Quito', address: 'Quito, Ecuador', venue: 'Teatro' }), ev({ title: 'Lejano', startDate: '2027-06-01T10:00:00' }), ev({ title: 'Sin fecha', startDate: null })], 'Guayaquil', 'Ecuador', ctx(CL))
    expect(informe).toMatchObject({ recibidos: 5, fuera_de_la_ciudad: 1, sin_fecha_o_pasados: 2, muy_lejanos: 1 })
    expect(fichas).toHaveLength(1)
    expect(fichas[0]).toMatchObject({ clase: 'evento_local', alcance: 'pais', origen: 'tercero', fecha_fuente: '2026-11-08T15:00:00.000Z' })
    expect(fichas[0].contenido).toContain('fecha 2026-11-08'); expect(fichas[0].contenido).toContain('Guayaquil')
    expect(Date.parse(fichas[0].vigente_hasta!)).toBeGreaterThan(Date.parse('2026-11-08T15:00:00Z'))
  })
})

describe('5 · comentarios de Instagram y Facebook de la competencia', () => {
  const k = (o: Record<string, unknown>) => ({ red: 'instagram', cuenta: 'veseind.sa', post_ref: 'Cxyz', post_url: 'https://www.instagram.com/p/Cxyz/', comentario_ref: 'c1', texto: 'Excelente servicio, @maria me atendió muy bien', me_gusta: 3, fecha_comentario: '2026-10-20T10:00:00Z', ...o })
  it('una ficha por publicación, con fecha real y sin @usuarios; el competidor sale de su cuenta', () => {
    const { fichas, informe } = fichasDeComentarios([k({}), k({ comentario_ref: 'c2', texto: 'Precios muy altos para lo que ofrecen', fecha_comentario: '2026-10-25T10:00:00Z' }), k({ post_ref: 'Cabc', comentario_ref: 'c3', post_url: 'https://www.instagram.com/p/Cabc/' }), k({ red: 'facebook', cuenta: 'veseind', post_ref: 'f1', comentario_ref: 'f1c' })], dZR, ctx(ZR))
    expect(informe).toMatchObject({ comentarios: 4, publicaciones: 3, sin_competidor: 0 })
    const a = fichas.find((f) => f.ref.endsWith(':cxyz'))!
    expect(a).toMatchObject({ clase: 'competidor_comentarios', alcance: 'competidor', origen: 'tercero', fecha_fuente: '2026-10-25T10:00:00.000Z' })
    expect(a.contenido).toContain('Veseind S.A.'); expect(a.contenido).toContain('2 comentario(s)'); expect(a.contenido).toContain('del 2026-10-20 al 2026-10-25'); expect(a.contenido).not.toContain('@maria')
    expect(fichas.some((f) => f.titulo.includes('Facebook'))).toBe(true)
  })
  it('mismo comentario dos veces = una sola ficha por publicación (idempotente por ref)', () => {
    const a = fichasDeComentarios([k({})], dZR, ctx(ZR)).fichas[0], b = fichasDeComentarios([k({}), k({ comentario_ref: 'c9' })], dZR, ctx(ZR)).fichas[0]
    expect(a.ref).toBe(b.ref)
  })
  it('una cuenta que no es de ningún competidor se cuenta', () => {
    expect(fichasDeComentarios([k({ cuenta: 'desconocida' })], dZR, ctx(ZR)).informe.sin_competidor).toBe(1)
  })
})

describe('6 · foros (Reddit)', () => {
  const post = (o: Record<string, unknown>) => ({ id: 't3_a1', parsedId: 'a1', title: 'Dónde comer buen restaurante de mariscos en Ecuador', body: 'Voy a Olón y quiero mariscos frescos, ¿recomiendan?', communityName: 'ecuador', postUrl: 'https://www.reddit.com/r/ecuador/comments/a1/', createdAt: '2026-10-29T23:15:00.000Z', score: 12, commentsCount: 4, ...o })
  const com = (o: Record<string, unknown>) => ({ dataType: 'comment', parsedPostId: 'a1', body: 'En Olón hay buenos ceviches, prueba el de @juan', commentCreatedAt: '2026-10-30T10:00:00.000Z', ...o })
  it('el pedido va por rubro y país con comentarios', () => { expect(pedidoDeForos('restaurante de mariscos', 'Ecuador')).toMatchObject({ searchTerms: ['restaurante de mariscos Ecuador'], crawlCommentsPerPost: true }) })
  it('un hilo del rubro y del lugar entra con sus respuestas y su fecha; alcance mercado (nivel competencia)', () => {
    const { fichas, informe } = fichasDeForos([post({}), com({})], dNA, ctx(CL))
    expect(informe.hilos).toBe(1)
    expect(fichas[0]).toMatchObject({ clase: 'foro', alcance: 'mercado', origen: 'tercero', fecha_fuente: '2026-10-29T23:15:00.000Z', fuente_url: 'https://www.reddit.com/r/ecuador/comments/a1/' })
    expect(fichas[0].contenido).toContain('Dónde comer'); expect(fichas[0].contenido).toContain('2026-10-30'); expect(fichas[0].contenido).not.toContain('@juan')
    expect(nivelDeFicha(fichas[0].alcance)).toBe('competencia')
  })
  it('fuera del rubro, fuera del lugar, muy viejo o sin fecha: se descarta y se cuenta', () => {
    const r = fichasDeForos([post({ parsedId: 'b', title: 'Soy culero con un cliente', body: 'mi jefe', communityName: 'soyculero' }), post({ parsedId: 'c', title: 'Restaurante de mariscos en Chile', body: 'santiago', communityName: 'chile' }), post({ parsedId: 'd', createdAt: '2025-01-01T00:00:00Z' }), post({ parsedId: 'e', createdAt: null })], dNA, ctx(CL))
    expect(r.fichas).toHaveLength(0)
    expect(r.informe).toMatchObject({ fuera_del_rubro: 1, fuera_del_lugar: 1, muy_viejos: 1, sin_fecha: 1 })
  })
})

describe('los pasos: rastro, una vez por corrida', () => {
  it('los pasos nuevos existen y se aceptan en la ruta', () => {
    for (const f of FUENTES_NUEVAS) { expect(PASOS).toContain(f); expect(esPaso(f)).toBe(true) }
    expect(PASOS_DE_REDES).toHaveLength(4)
  })
  it('en días con corrida corren todos; en días sin corrida solo los de redes (no gastan)', () => {
    const env = { PORTERO_CORRIDAS_CADA_DIAS: '2', PORTERO_CORRIDAS_CADA_DIAS_HASTA: '2026-11-25' }
    expect(pasosDelDia(new Date('2026-11-04T00:05:00Z'), env)).toEqual(PASOS)
    expect(pasosDelDia(new Date('2026-11-05T00:05:00Z'), env)).toEqual(PASOS_DE_REDES)
    expect(pasosDelDia(new Date('2026-11-26T00:05:00Z'), env)).toEqual(PASOS)
  })
  it('el interruptor apaga solo las fuentes nuevas (por omisión encendidas)', () => {
    expect(fuentesNuevasEncendidas({})).toBe(true); expect(fuentesNuevasEncendidas({ PORTERO_FUENTES_NUEVAS: 'off' })).toBe(false)
    expect(pasosDelDia(new Date('2026-11-04T00:05:00Z'), { PORTERO_CORRIDAS_CADA_DIAS: '2', PORTERO_CORRIDAS_CADA_DIAS_HASTA: '2026-11-25', PORTERO_FUENTES_NUEVAS: 'off' })).toEqual(PASOS_DE_REDES)
  })
})

describe('el paso de punta a punta (actor falso → ficha en el cerebro)', () => {
  const tablas = () => ({ cerebro_fichas: [] as Array<Record<string, unknown>>, cerebro_ingresos: [] as Array<Record<string, unknown>>, apify_raw: [] as Array<Record<string, unknown>>, cerebro_comentarios_competencia: [] as Array<Record<string, unknown>> })
  const anuncio = { creativeId: 'CR1', advertiserName: 'VESEIND S.A.', domain: 'veseind.com', format: 'TEXT', firstShown: '2026-02-04T13:19:41.000Z', lastShown: '2026-11-02T14:45:49.000Z', adHeadline: 'Extintores', region: 'EC', adUrl: 'https://x/ad' }
  it('anuncios: llama solo a los competidores con sitio propio, topa cada llamada, guarda el crudo y las fichas; repetir no duplica', async () => {
    const t = tablas(); const b = crearBaseFalsa(t)
    const llamadas: Array<{ actor: string; input: Record<string, unknown>; max: number }> = []
    const ejecutar: Ejecutar = async (actor, input, max) => { llamadas.push({ actor, input, max }); return { items: (input.domains as string[])[0] === 'veseind.com' ? [anuncio] : [], costo_usd: 0.004 } }
    const r1 = await correrFuenteNueva({ db: b.db, fuente: 'anuncios_google', cliente: ZERO_RISK, clientId: ZR, ciudadesDeSedes: [], ahora: AHORA, ejecutar })
    expect(llamadas.map((l) => (l.input.domains as string[])[0]).sort()).toEqual(['extintores.ec', 'veseind.com'])
    expect(llamadas.every((l) => l.max <= 0.06)).toBe(true)
    expect(r1.errores).toEqual([]); expect(r1.gasto_usd).toBeCloseTo(0.008, 6)
    expect(r1.resumen).toMatchObject({ fichas_armadas: 1, archivo: { escritas: 1 }, sin_sitio_propio: ['IMPROSEG', 'Un directorio'] })
    expect(t.cerebro_fichas).toHaveLength(1); expect(t.cerebro_fichas[0]).toMatchObject({ clase: 'competidor_anuncios_google', alcance: 'competidor', propiedad: 'ajena', client_id: ZR })
    expect(t.apify_raw.map((x) => x.apify_function)).toEqual(['fuente_anuncios_google', 'fuente_anuncios_google'])
    const r2 = await correrFuenteNueva({ db: b.db, fuente: 'anuncios_google', cliente: ZERO_RISK, clientId: ZR, ciudadesDeSedes: [], ahora: AHORA, ejecutar })
    expect(r2.resumen).toMatchObject({ archivo: { escritas: 0, iguales: 1 } }); expect(t.cerebro_fichas).toHaveLength(1)
  })
  it('una llamada que falla se DICE y no tumba el paso; el tope del paso corta lo que sigue', async () => {
    const t = tablas(); const b = crearBaseFalsa(t)
    const caro: Ejecutar = async () => ({ items: [], costo_usd: 0.25 })
    const ocho = { ...ZERO_RISK, config: { apify: { competitor_list: Array.from({ length: 8 }, (_, i) => ({ name: `Comp ${i}`, website: `https://comp${i}.com` })) } } }
    const r = await correrFuenteNueva({ db: b.db, fuente: 'anuncios_google', cliente: ocho, clientId: ZR, ciudadesDeSedes: [], ahora: AHORA, ejecutar: caro })
    expect(r.gasto_usd).toBeCloseTo(0.5, 6); expect(r.errores.join(' ')).toMatch(/tope de gasto/)
    const falla: Ejecutar = async () => { throw new Error('HTTP 402 sin crédito') }
    const r2 = await correrFuenteNueva({ db: crearBaseFalsa(tablas()).db, fuente: 'foros', cliente: NAUFRAGO, clientId: CL, ciudadesDeSedes: [], ahora: AHORA, ejecutar: falla })
    expect(r2.errores[0]).toMatch(/402/); expect(r2.gasto_usd).toBe(0)
  })
  it('horas de más gente: no llama a Apify (US$ 0) y archiva lo que ya está en el crudo', async () => {
    const t = { ...tablas(), apify_raw: [{ client_id: CL, ensayo: false, apify_function: 'own_google_maps_profile', created_at: '2026-11-03T10:00:00Z', respuesta: [{ title: 'Náufrago', city: 'Olón', popularTimesHistogram: { Fr: [{ hour: 13, occupancyPercent: 95 }] } }] }] }
    const b = crearBaseFalsa(t)
    let llamado = false
    const r = await correrFuenteNueva({ db: b.db, fuente: 'horas_de_mas_gente', cliente: NAUFRAGO, clientId: CL, ciudadesDeSedes: [], ahora: AHORA, ejecutar: async () => { llamado = true; return { items: [], costo_usd: 0 } } })
    expect(llamado).toBe(false); expect(r.gasto_usd).toBe(0); expect(t.cerebro_fichas).toHaveLength(1)
    expect(t.cerebro_fichas[0]).toMatchObject({ clase: 'horas_de_mas_gente', alcance: 'cliente', propiedad: 'propia' })
  })
  it('comentarios IG/FB: lee lo nuevo, y luego fichea TODO lo guardado de la competencia; el costo de leer suma al paso', async () => {
    const t = { ...tablas(), cerebro_comentarios_competencia: [{ client_id: ZR, red: 'instagram', cuenta: 'veseind.sa', post_ref: 'P1', post_url: 'https://www.instagram.com/p/P1/', comentario_ref: 'a', texto: 'Muy buen servicio de recarga de extintores', me_gusta: 1, fecha_comentario: '2026-10-30T10:00:00Z' }] }
    const r = await correrFuenteNueva({ db: crearBaseFalsa(t).db, fuente: 'comentarios_ig_fb', cliente: ZERO_RISK, clientId: ZR, ciudadesDeSedes: [], ahora: AHORA, ejecutar: async () => ({ items: [], costo_usd: 0 }), leerComentarios: async () => ({ costo_usd: 0.12, resumen: { estado: 'corrida' } }) })
    expect(r.gasto_usd).toBeCloseTo(0.12, 6); expect(t.cerebro_fichas).toHaveLength(1)
    expect(t.cerebro_fichas[0]).toMatchObject({ clase: 'competidor_comentarios', alcance: 'competidor' })
  })
  it('sin rubro, sin país o sin ciudades: no inventa ni llama', async () => {
    let n = 0
    const ejecutar: Ejecutar = async () => { n++; return { items: [], costo_usd: 0 } }
    const vacio = { name: 'X', industry: 'unknown', config: {} }
    for (const fuente of ['busquedas_google', 'eventos_locales', 'foros'] as const) {
      const r = await correrFuenteNueva({ db: crearBaseFalsa(tablas()).db, fuente, cliente: vacio, clientId: 'x', ciudadesDeSedes: [], ahora: AHORA, ejecutar })
      expect(r.gasto_usd).toBe(0); expect(r.resumen.motivo).toBeTruthy()
    }
    expect(n).toBe(0)
  })
})
