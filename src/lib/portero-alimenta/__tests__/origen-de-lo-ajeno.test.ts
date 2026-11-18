/**
 * ENCARGO 3 de Cerebro, fase B (17-nov) · de dónde viene lo ajeno. Los datos imitan filas REALES de producción (Náufrago y Zero Risk, leídas en seco el 17-nov),
 * con nombres de prueba: la propia como competidor, la página propia de Instagram como referencia, cuentas de hashtag, Mapas en Medellín y NJ, anuncios por palabra, la bodega.
 */
import { describe, expect, it } from 'vitest'
import { crearBaseFalsa } from './base-falsa'
import {
  armarContexto, clasificarFila, clasificarPendientes, clasificarLoAjenoDeLaCorrida, cuentaNormal, leerContexto, lugarDeLaDireccion, origenDeLaCorridaDelVigilante,
  slugDeNombre, POR_ESCRITURA, TOPE_POR_CORRIDA, type ContextoDelCliente,
} from '../origen-de-lo-ajeno'

const C1 = '11111111-1111-4111-8111-111111111111'
const C2 = '22222222-2222-4222-8222-222222222222'
const CLIENTE = {
  id: C1, country: 'EC', website_url: 'https://www.marisco.ec',
  config: { apify: {
    own_handles: { instagram: 'marisco.ec', facebook: '1525854397268597' },
    competitor_list: [
      { name: 'Ceviches Don Pepe', competitor_type: 'direct' },
      { name: 'Momo Deli', handles: { instagram: '@momo.deli' } },
      { name: 'Extintores TRD', website: 'https://extintores.ec/' },
      { name: 'Red Social', website: 'https://www.instagram.com/redsocial' },
    ],
    busqueda_de_cuentas: {
      'competidor:el-pez:x': { handle: 'ElPez_1', resultado: 'hallada' },
      'competidor:otro:x': { handle: 'nohay', resultado: 'no_hallada' },
      'gusto:algo:x': { handle: 'gusto1', resultado: 'hallada' },
    },
    ciudades_de_gusto: ['Olón'],
  } },
}
const SEDES = [{ ciudad: 'Guayaquil' }]
const LLAMADAS = [
  { params: { _brazo: 'gustado:hashtags', directUrls: ['https://www.instagram.com/explore/tags/mariscosolon/', 'https://www.instagram.com/explore/tags/restauranteolon/'] }, created_at: '2026-10-30T10:00:00Z' },
  { params: { _brazo: 'gustado:perfiles', usernames: ['parrillaX', 'pruebamask'] }, created_at: '2026-10-30T10:05:00Z' },
  { params: { _brazo: 'gustado:perfiles', usernames: ['solo_otro_dia'] }, created_at: '2026-10-31T10:05:00Z' },
  { params: { _brazo: 'competencia:ceviexpress:instagram', usernames: ['ceviexpress.ec'] }, created_at: '2026-11-03T00:00:00Z' },
  { params: { _brazo: 'competencia:krudo-viches:instagram', usernames: ['krudoviches'] }, created_at: '2026-11-03T00:00:00Z' },
  { params: { _brazo: 'competencia:la-quinta:mapas' }, created_at: '2026-11-03T00:00:00Z' },
  { params: { usernames: ['sin_marca'] }, created_at: '2026-11-03T00:00:00Z' },
]
const TENDENCIAS = [
  { video_id: 'v-global', nivel: 'global', consulta: '#ceviche' },
  { video_id: 'v-pais', nivel: 'pais', consulta: '#cevicheecuatoriano' },
  { video_id: 'v-raro', nivel: 'inventado', consulta: '#x' },
  { video_id: 'v-sin-consulta', nivel: 'competencia', consulta: '' },
]
const MAPAS = [
  { handle: 'ceviexpress', caption: 'Ceviexpress · Marisquería · Av. Benjamín Carrión, 090501 Guayaquil, Ecuador' },
  { handle: 'krudo-viches', caption: 'Krudo Viches · Marisquería · Cl. 10b #35-27, El Poblado, Medellín, Antioquia, Colombia' },
]
const PROPIAS = [{ id: 'p-1', post_id: 'ig-123' }]
const ctx = (extra: Partial<Parameters<typeof armarContexto>[0]> = {}): ContextoDelCliente =>
  armarContexto({ esBodega: false, cliente: CLIENTE, sedes: SEDES, tendencias: TENDENCIAS, llamadas: LLAMADAS, propias: PROPIAS, mapas: MAPAS, ...extra })
const fila = (f: Record<string, unknown>) => ({ id: 'x-1', owner_role: 'competidor', tipo: 'post_image', handle: 'alguien', caption: '', post_url: null, post_id: 'ig-999', video_id: null, ...f })

describe('🔴 la cuenta propia nunca es competidor ni referencia', () => {
  it('su cuenta declarada, guardada como competidor → propio, y la copia vieja se marca duplicada de la propia (no se borra)', () => {
    const c = clasificarFila(fila({ id: 'v-1', handle: 'Marisco.EC', post_id: 'ig-123' }), ctx())
    expect(c).toEqual({ papel: 'propio', via: 'cuenta_propia', via_detalle: null, nivel: 'propio', relevancia_motivo: 'es la cuenta propia del cliente («Marisco.EC»)', duplicado_de: 'p-1' })
  })
  it('sin copia propia de la misma publicación → propio sin duplicado; la propia misma nunca es duplicada de sí', () => {
    expect(clasificarFila(fila({ handle: '@marisco.ec', post_id: 'ig-777' }), ctx()).duplicado_de).toBeUndefined()
    expect(clasificarFila(fila({ id: 'p-1', handle: 'marisco.ec', post_id: 'ig-123' }), ctx()).duplicado_de).toBeUndefined()
    expect(clasificarFila(fila({ handle: 'marisco.ec', post_id: '' }), ctx()).duplicado_de).toBeUndefined()
  })
  it('ya marcada como duplicada → no se pisa su marca; una fila ya propia no se marca duplicada', () => {
    expect(clasificarFila(fila({ id: 'v-1', handle: 'marisco.ec', post_id: 'ig-123', duplicado_de: 'otra' }), ctx()).duplicado_de).toBeUndefined()
    expect(clasificarFila(fila({ id: 'v-1', owner_role: 'propio', handle: 'marisco.ec', post_id: 'ig-123' }), ctx()).duplicado_de).toBeUndefined()
  })
  it('su sitio (también con www o un subdominio) → propio; un dominio que solo lo contiene, no', () => {
    expect(clasificarFila(fila({ owner_role: 'referencia', tipo: 'web_imagen', handle: 'marisco.ec' }), ctx()).papel).toBe('propio')
    expect(clasificarFila(fila({ owner_role: 'referencia', tipo: 'web_imagen', handle: 'tienda.marisco.ec' }), ctx()).papel).toBe('propio')
    expect(clasificarFila(fila({ owner_role: 'referencia', tipo: 'web_imagen', handle: 'otromarisco.ec' }), ctx()).papel).not.toBe('propio')
  })
  it('su página de Instagram rastreada como sitio (cuenta «instagram.com») → propio; la página de OTRA cuenta en Instagram, no', () => {
    const r = clasificarFila(fila({ owner_role: 'referencia', tipo: 'web_imagen', handle: 'instagram.com', post_url: 'https://www.instagram.com/marisco.ec/p/CCE/' }), ctx())
    expect(r).toMatchObject({ papel: 'propio', nivel: 'propio', relevancia_motivo: 'es de la página propia del cliente en instagram.com («marisco.ec»)' })
    expect(clasificarFila(fila({ owner_role: 'referencia', tipo: 'web_imagen', handle: 'instagram.com', post_url: 'https://www.instagram.com/otra/' }), ctx()).papel).not.toBe('propio')
  })
  it('un cliente cuyo «sitio» es su Instagram: esa cuenta es propia, pero instagram.com no es su dominio', () => {
    const k = armarContexto({ esBodega: false, cliente: { ...CLIENTE, website_url: 'https://www.instagram.com/zerogye', config: { apify: {} } }, sedes: [], tendencias: [], llamadas: [], propias: [] })
    expect(k.hostPropio).toBe('')
    expect(clasificarFila(fila({ handle: 'zerogye' }), k).papel).toBe('propio')
    expect(clasificarFila(fila({ owner_role: 'referencia', tipo: 'web_imagen', handle: 'instagram.com', post_url: 'https://www.instagram.com/zerogye' }), k).papel).toBe('propio')
    expect(clasificarFila(fila({ tipo: 'web_imagen', handle: 'instagram.com', post_url: 'https://www.instagram.com/otro' }), k).papel).toBe('mercado')
  })
  it('el id numérico de Facebook no cuenta como cuenta propia', () => {
    expect(ctx().propios.has('1525854397268597')).toBe(false)
    expect(ctx().propios.has('marisco.ec')).toBe(true)
  })
  it('guardada como propia (owner_role propio) sigue propia aunque no coincida con nada', () => {
    expect(clasificarFila(fila({ owner_role: 'propio', handle: 'mapas-marisco' }), ctx())).toMatchObject({ papel: 'propio', relevancia_motivo: 'guardada como propia del cliente' })
  })
})

describe('🔴 competidor solo por la lista o por la búsqueda de competencia', () => {
  it('una cuenta hallada por un HASHTAG es mercado, con los hashtags del día en que se buscó, nunca competidor', () => {
    const r = clasificarFila(fila({ handle: 'pruebamask' }), ctx())
    expect(r).toEqual({ papel: 'mercado', via: 'hashtag', via_detalle: '#mariscosolon #restauranteolon', nivel: 'competencia', relevancia_motivo: 'apareció en hashtags del rubro y la ciudad del cliente (#mariscosolon #restauranteolon)' })
    expect(clasificarFila(fila({ handle: 'ParrillaX' }), ctx()).papel).toBe('mercado')
  })
  it('una cuenta de hashtag de un día sin búsqueda de hashtags guardada: mercado, pero sin motivo', () => {
    expect(clasificarFila(fila({ handle: 'solo_otro_dia' }), ctx())).toEqual({ papel: 'mercado', via: 'hashtag', via_detalle: 'hashtag', nivel: 'competencia', relevancia_motivo: null })
  })
  it('en la lista (por cuenta, por nombre o por la cuenta hallada) → competidor directo, con su nombre', () => {
    expect(clasificarFila(fila({ handle: 'momo.deli' }), ctx())).toEqual({ papel: 'competidor', via: 'lista_de_competidores', via_detalle: null, nivel: 'directa', relevancia_motivo: 'en la lista de competidores del cliente: «Momo Deli»' })
    expect(clasificarFila(fila({ tipo: 'maps_portada', handle: 'ceviches-don-pepe', caption: 'Ceviches Don Pepe · Marisquería · Montañita, Ecuador' }), ctx()).relevancia_motivo).toBe('en la lista de competidores del cliente: «Ceviches Don Pepe»')
    expect(clasificarFila(fila({ handle: 'elpez_1' }), ctx())).toMatchObject({ papel: 'competidor', relevancia_motivo: 'en la lista de competidores del cliente: «el-pez»' })
    expect(clasificarFila(fila({ handle: 'nohay' }), ctx()).papel).toBe('mercado')
    expect(clasificarFila(fila({ handle: 'gusto1' }), ctx()).papel).toBe('mercado')
  })
  it('el sitio de un competidor de la lista (imagen o logo) → competidor; la misma cuenta en una publicación de Instagram, no (el host solo vale para la web)', () => {
    expect(clasificarFila(fila({ tipo: 'web_imagen', handle: 'extintores.ec' }), ctx())).toMatchObject({ papel: 'competidor', via: 'lista_de_competidores' })
    expect(clasificarFila(fila({ tipo: 'logo_hd', handle: 'www.extintores.ec' }), ctx())).toMatchObject({ papel: 'competidor' })
    expect(clasificarFila(fila({ tipo: 'post_image', handle: 'extintores.ec' }), ctx()).papel).toBe('mercado')
    expect(ctx().hostsDeLaLista.has('instagram.com')).toBe(false)
  })
  it('vigilado por la búsqueda de competencia y en una ciudad del cliente → competidor directo', () => {
    expect(clasificarFila(fila({ handle: 'ceviexpress.ec' }), ctx())).toEqual({ papel: 'competidor', via: 'busqueda_de_competencia', via_detalle: 'vigilado: ceviexpress', nivel: 'directa', relevancia_motivo: 'competidor que vigila la búsqueda de competencia («ceviexpress»), en una ciudad del cliente (guayaquil)' })
  })
  it('vigilado pero su ficha de Mapas está en OTRO país → mercado sin motivo (Medellín no es competencia de Guayaquil)', () => {
    expect(clasificarFila(fila({ handle: 'krudoviches' }), ctx())).toEqual({ papel: 'mercado', via: 'busqueda_de_competencia', via_detalle: 'vigilado: krudo-viches · en otro país (CO)', nivel: 'competencia', relevancia_motivo: null })
  })
  it('vigilado sin ficha de Mapas conocida → competidor directo (lo eligió la búsqueda de competencia); en su país → lo dice', () => {
    expect(clasificarFila(fila({ handle: 'la-quinta' }), ctx())).toMatchObject({ papel: 'competidor', nivel: 'directa', relevancia_motivo: 'competidor que vigila la búsqueda de competencia («la-quinta»)' })
    expect(clasificarFila(fila({ tipo: 'maps_portada', handle: 'la-quinta', caption: 'La Quinta · Restaurante · Salinas, Ecuador' }), ctx()).relevancia_motivo).toBe('competidor que vigila la búsqueda de competencia («la-quinta»), en el país del cliente')
  })
  it('una llamada sin marca de brazo no vuelve vigilado a nadie', () => {
    expect(ctx().vigilados.has('sin_marca')).toBe(false)
  })
})

describe('🔴 Mapas: por ciudad y país de la dirección', () => {
  const mapa = (caption: string, handle = 'un-lugar') => clasificarFila(fila({ tipo: 'maps_portada', handle, caption }), ctx())
  it('en una ciudad del cliente (su sede o sus ciudades, sin tildes) → competidor por rubro y ciudad', () => {
    expect(mapa('La Caraway · Marisquería · 090511 Guayaquil, Ecuador')).toEqual({ papel: 'competidor', via: 'busqueda_de_competencia', via_detalle: 'Mapas: Marisquería · 090511 Guayaquil, Ecuador', nivel: 'competencia', relevancia_motivo: 'Mapas, en una ciudad del cliente (guayaquil)' })
    expect(mapa('Cabaña · Marisquería · 662R+H59, Olon, Ecuador').relevancia_motivo).toBe('Mapas, en una ciudad del cliente (olon)')
  })
  it('en su país pero fuera de sus ciudades → mercado con motivo', () => {
    expect(mapa('Brisas · Marisquería · C. 10 de Agosto, Salinas, Ecuador')).toMatchObject({ papel: 'mercado', via: 'mapas', relevancia_motivo: 'Mapas, en el país del cliente pero fuera de sus ciudades' })
  })
  it('en otro país (por su nombre o por el estado y código postal de EE. UU.) → mercado sin motivo, aunque la calle se llame como una ciudad del cliente', () => {
    expect(mapa('Delimar · Restaurante · Cra. 43F, El Poblado, Medellín, Antioquia, Colombia')).toMatchObject({ papel: 'mercado', relevancia_motivo: null, via_detalle: 'Mapas: Restaurante · Cra. 43F, El Poblado, Medellín, Antioquia, Colombia · en otro país (CO)' })
    expect(mapa('Ceviche Time · Restaurante peruano · 4538 Bergenline Ave, Union City, NJ 07087').via_detalle).toContain('en otro país (US)')
    expect(mapa('Mar · Restaurante · Av. Guayaquil 12, Lima, Perú')).toMatchObject({ papel: 'mercado', relevancia_motivo: null })
  })
  it('una foto de Mapas sin dirección toma el lugar de la ficha de su cuenta; sin ficha → sin lugar, sin motivo', () => {
    expect(clasificarFila(fila({ tipo: 'maps_foto', handle: 'krudo-viches', caption: 'Foto de la ficha · Krudo Viches' }), ctx())).toMatchObject({ papel: 'mercado', relevancia_motivo: null })
    expect(mapa('El Encocao')).toEqual({ papel: 'mercado', via: 'mapas', via_detalle: 'Mapas: El Encocao · sin lugar reconocible', nivel: 'competencia', relevancia_motivo: null })
  })
  it('lugarDeLaDireccion: la palabra entera (Perú no es «peruano»; Olón no es «Olonga»)', () => {
    const k = { ciudades: ['olon'], pais: 'EC' }
    expect(lugarDeLaDireccion('Cocina peruana · Olón, Ecuador', k)).toEqual({ donde: 'ciudad', ciudad: 'olon' })
    expect(lugarDeLaDireccion('Olonga, Ecuador', k)).toEqual({ donde: 'pais' })
    expect(lugarDeLaDireccion('Algo · Ecuadorian food', k)).toEqual({ donde: 'sin_lugar' })
    expect(lugarDeLaDireccion('Main St, Austin, TX 78701', { ciudades: [], pais: 'US' })).toEqual({ donde: 'pais' })
    expect(lugarDeLaDireccion('Main St, Austin, TX 78701', { ciudades: [], pais: null })).toEqual({ donde: 'otro_pais', pais: 'US' })
  })
})

describe('🔴 tendencias, anuncios y lo que no tiene motivo', () => {
  it('la tendencia que trajo el video manda su nivel y su búsqueda (por el video de la captura o por el video mismo)', () => {
    expect(clasificarFila(fila({ owner_role: 'referencia', tipo: 'video_captura', handle: 'acomer', video_id: 'v-global' }), ctx())).toEqual({ papel: 'referencia', via: 'tendencia', via_detalle: 'búsqueda «#ceviche»', nivel: 'global', relevancia_motivo: 'la trajo la búsqueda «#ceviche», hecha con el rubro del cliente (nivel global)' })
    expect(clasificarFila(fila({ id: 'v-pais', owner_role: 'referencia', tipo: 'reel', handle: 'x' }), ctx())).toMatchObject({ nivel: 'pais' })
  })
  it('una tendencia con un nivel que no existe no cuenta; sin búsqueda guardada → sin motivo', () => {
    expect(clasificarFila(fila({ owner_role: 'referencia', video_id: 'v-raro', handle: 'x' }), ctx()).via).toBe('sin_registro')
    expect(clasificarFila(fila({ owner_role: 'referencia', video_id: 'v-sin-consulta', handle: 'x' }), ctx())).toEqual({ papel: 'referencia', via: 'tendencia', via_detalle: null, nivel: 'competencia', relevancia_motivo: null })
  })
  it('un competidor de la lista gana a la tendencia que lo trajo (una búsqueda «@cuenta» de un competidor)', () => {
    expect(clasificarFila(fila({ handle: 'momo.deli', video_id: 'v-global' }), ctx()).papel).toBe('competidor')
  })
  it('anuncio de una página que no es competidor conocido → referencia sin motivo; de un competidor de la lista o vigilado → con motivo, nivel directa', () => {
    expect(clasificarFila(fila({ owner_role: 'referencia', tipo: 'anuncio', handle: 'fiction-echo6', caption: 'Traicionado y náufrago…' }), ctx())).toEqual({ papel: 'referencia', via: 'anuncios', via_detalle: 'hallado por búsqueda de palabra; su página («fiction-echo6») no es un competidor conocido', nivel: 'competencia', relevancia_motivo: null })
    expect(clasificarFila(fila({ owner_role: 'referencia', tipo: 'anuncio', handle: 'ceviches-don-pepe' }), ctx())).toEqual({ papel: 'referencia', via: 'anuncios', via_detalle: 'página «ceviches-don-pepe»', nivel: 'directa', relevancia_motivo: 'anuncio del competidor «Ceviches Don Pepe», de la lista del cliente' })
    expect(clasificarFila(fila({ owner_role: 'referencia', tipo: 'anuncio', handle: 'ceviexpress' }), ctx())).toMatchObject({ papel: 'referencia', via: 'anuncios', nivel: 'directa', relevancia_motivo: 'anuncio de un competidor que vigila la búsqueda de competencia («ceviexpress»)' })
    expect(clasificarFila(fila({ owner_role: 'referencia', tipo: 'anuncio', handle: 'krudo-viches' }), ctx())).toMatchObject({ papel: 'referencia', via: 'anuncios', relevancia_motivo: null })
  })
  it('lo demás: una referencia sigue referencia y un tercero es mercado; la web dice «sitio»; los dos sin motivo', () => {
    expect(clasificarFila(fila({ owner_role: 'referencia', tipo: 'video_captura', handle: 'lifeofcian' }), ctx())).toEqual({ papel: 'referencia', via: 'sin_registro', via_detalle: null, nivel: 'competencia', relevancia_motivo: null })
    expect(clasificarFila(fila({ handle: 'onc.drink' }), ctx())).toEqual({ papel: 'mercado', via: 'sin_registro', via_detalle: null, nivel: 'competencia', relevancia_motivo: null })
    expect(clasificarFila(fila({ tipo: 'web_imagen', handle: 'otro.com' }), ctx()).via).toBe('sitio')
  })
  it('la bodega del mundo (sin cliente) dice «mundo», con su motivo, aunque la cuenta coincida con algo', () => {
    const k = armarContexto({ esBodega: true, cliente: null, sedes: [], tendencias: [], llamadas: [], propias: [] })
    expect(clasificarFila(fila({ owner_role: 'referencia', handle: 'andyslife247' }), k)).toEqual({ papel: 'referencia', via: 'bodega', via_detalle: null, nivel: 'mundo', relevancia_motivo: 'bodega viral del mundo: lo más visto, sin importar el rubro (a propósito, sin cliente)' })
  })
  it('los textos largos se cortan a 300', () => {
    const r = clasificarFila(fila({ tipo: 'maps_portada', handle: 'h', caption: `N · ${'x'.repeat(400)}, Guayaquil` }), ctx())
    expect(r.via_detalle!.length).toBeLessThanOrEqual(300)
    expect(r.via_detalle!.endsWith('…')).toBe(true)
  })
})

describe('utilidades', () => {
  it('slugDeNombre y cuentaNormal', () => {
    expect(slugDeNombre("Cabaña D' Jerry")).toBe('cabana-d-jerry')
    expect(slugDeNombre('“Los Ceviches Del Decano”')).toBe('los-ceviches-del-decano')
    expect(cuentaNormal(' @Momo.Deli ')).toBe('momo.deli')
    expect(cuentaNormal(null)).toBe('')
  })
})

// ── con la base ─────────────────────────────────────────────────────────────
const AHORA = new Date('2026-11-18T12:00:00Z')
const baseCon = (imgs: Record<string, unknown>[], extra: Record<string, Record<string, unknown>[]> = {}, opciones: Parameters<typeof crearBaseFalsa>[1] = {}) => crearBaseFalsa({
  clients: [CLIENTE], client_sedes: SEDES.map((s) => ({ ...s, client_id: C1 })), cerebro_tendencias: TENDENCIAS.map((t) => ({ ...t, client_id: C1 })),
  apify_raw: LLAMADAS.map((l) => ({ ...l, client_id: C1, apify_function: 'instagram_scraper' })),
  client_social_images: [...imgs, ...MAPAS.map((m, i) => ({ id: `m-${i}`, client_id: C1, owner_role: 'competidor', tipo: 'maps_portada', ...m, clasificado_en: '2026-11-01T00:00:00Z' }))],
  client_videos: [], ...extra,
}, opciones)

describe('🔴 clasificarPendientes', () => {
  const IMGS = (): Array<Record<string, unknown>> => [
    { id: 'p-1', client_id: C1, owner_role: 'propio', handle: 'marisco.ec', post_id: 'ig-123', tipo: 'post_image', clasificado_en: null },
    { id: 'd-1', client_id: C1, owner_role: 'competidor', handle: 'marisco.ec', post_id: 'ig-123', tipo: 'post_image', clasificado_en: null },
    { id: 'h-1', client_id: C1, owner_role: 'competidor', handle: 'pruebamask', post_id: 'ig-5', tipo: 'post_image', clasificado_en: null },
    { id: 'h-2', client_id: C1, owner_role: 'competidor', handle: 'parrillax', post_id: 'ig-6', tipo: 'post_image', clasificado_en: null },
    { id: 'a-1', client_id: C1, owner_role: 'referencia', handle: 'fiction', post_id: 'ad-1', tipo: 'anuncio', clasificado_en: null },
    { id: 'ya', client_id: C1, owner_role: 'competidor', handle: 'pruebamask', post_id: 'ig-7', tipo: 'post_image', clasificado_en: '2026-11-10T00:00:00Z', papel: 'mercado' },
    { id: 'otro', client_id: C2, owner_role: 'competidor', handle: 'marisco.ec', post_id: 'ig-123', tipo: 'post_image', clasificado_en: null },
  ]
  const PAP = { client_social_images: 'id, client_id, owner_role, handle, post_id, tipo, caption, post_url, video_id, duplicado_de' }
  it('en seco solo cuenta: lee, no escribe nada', async () => {
    const { db, escrituras } = baseCon(IMGS())
    const r = await clasificarPendientes(db, { clientId: C1, tabla: 'client_social_images', dry_run: true, ahora: AHORA })
    expect(r).toEqual({ tabla: 'client_social_images', client_id: C1, estado: 'ok', por_clasificar: 5, clasificadas: 0, sin_motivo: 1, por_papel: { propio: 2, mercado: 2, referencia: 1 } })
    expect(escrituras).toEqual([])
  })
  it('de verdad: escribe papel, vía, nivel, motivo y la hora; agrupa iguales en UNA escritura; solo las sin clasificar y solo de ese cliente; no toca owner_role', async () => {
    const t = { tablas: IMGS() }
    const { db, escrituras } = baseCon(t.tablas)
    const r = await clasificarPendientes(db, { clientId: C1, tabla: 'client_social_images', dry_run: false, ahora: AHORA })
    expect(r).toMatchObject({ estado: 'ok', por_clasificar: 5, clasificadas: 5, sin_motivo: 1 })
    const porId = Object.fromEntries(t.tablas.map((f) => [f.id, f]))
    expect(porId['d-1']).toMatchObject({ owner_role: 'competidor', papel: 'propio', via: 'cuenta_propia', nivel: 'propio', duplicado_de: 'p-1', clasificado_en: AHORA.toISOString() })
    expect(porId['p-1']).toMatchObject({ owner_role: 'propio', papel: 'propio' })
    expect(porId['p-1'].duplicado_de).toBeUndefined()
    expect(porId['h-1']).toMatchObject({ papel: 'mercado', via: 'hashtag', clasificado_en: AHORA.toISOString() })
    expect(porId['a-1']).toMatchObject({ papel: 'referencia', via: 'anuncios', relevancia_motivo: null })
    expect(porId.ya.clasificado_en).toBe('2026-11-10T00:00:00Z')
    expect(porId.otro.clasificado_en).toBeNull()
    // h-1 y h-2 tienen la MISMA clasificación: una sola escritura con los dos ids
    const ups = escrituras.filter((e) => e.op === 'update')
    expect(ups).toHaveLength(4)
    expect(ups.find((e) => (e.filtros?.[0]?.[1] as string[]).includes('h-1'))?.filtros).toEqual([['id', ['h-1', 'h-2']]])
    expect(ups.every((e) => !('owner_role' in (e.fila ?? {})))).toBe(true)
    void PAP
  })
  it('client_videos no tiene duplicado_de: no se escribe ahí aunque haya copia propia', async () => {
    const vids = [{ id: 'vp', client_id: C1, owner_role: 'propio', handle: 'marisco.ec', post_id: 'r1', tipo: 'reel', clasificado_en: null }, { id: 'vd', client_id: C1, owner_role: 'competidor', handle: 'marisco.ec', post_id: 'r1', tipo: 'reel', clasificado_en: null }]
    const { db, escrituras } = baseCon([], { client_videos: vids })
    const r = await clasificarPendientes(db, { clientId: C1, tabla: 'client_videos', dry_run: false, ahora: AHORA })
    expect(r).toMatchObject({ estado: 'ok', clasificadas: 2 })
    expect(escrituras.filter((e) => e.op === 'update').every((e) => !('duplicado_de' in (e.fila ?? {})))).toBe(true)
    expect(vids[1]).toMatchObject({ papel: 'propio' })
  })
  it('la bodega (client_id null) se clasifica sin leer ningún cliente', async () => {
    const { db, lecturas } = baseCon([{ id: 'b-1', client_id: null, owner_role: 'referencia', handle: 'viral', post_id: 'x', tipo: 'video_captura', clasificado_en: null }])
    const r = await clasificarPendientes(db, { clientId: null, tabla: 'client_social_images', dry_run: false, ahora: AHORA })
    expect(r).toMatchObject({ estado: 'ok', clasificadas: 1, por_papel: { referencia: 1 }, sin_motivo: 0 })
    expect(lecturas).toEqual(['client_social_images'])
  })
  it('nada pendiente → no lee el contexto ni escribe', async () => {
    const { db, lecturas, escrituras } = baseCon([])
    expect(await clasificarPendientes(db, { clientId: C1, tabla: 'client_social_images', dry_run: false })).toMatchObject({ estado: 'ok', por_clasificar: 0 })
    expect(lecturas).toEqual(['client_social_images'])
    expect(escrituras).toEqual([])
  })
  it.each(['clients', 'client_sedes', 'cerebro_tendencias', 'apify_raw'])('si falla la lectura de %s → no se clasifica nada (nada a medias)', async (tabla) => {
    const { db, escrituras } = baseCon(IMGS(), {}, { fallaEn: tabla })
    const r = await clasificarPendientes(db, { clientId: C1, tabla: 'client_social_images', dry_run: false })
    expect(r.estado).toBe('no_se_pudo_leer')
    expect(r.detalle).toContain(tabla)
    expect(escrituras).toEqual([])
  })
  it('la lectura del contexto recortada por el tope → no se clasifica', async () => {
    const muchas = Array.from({ length: 2000 }, (_, i) => ({ client_id: C1, video_id: `v${i}`, nivel: 'global', consulta: 'x' }))
    const { db, escrituras } = baseCon(IMGS(), { cerebro_tendencias: muchas })
    const r = await clasificarPendientes(db, { clientId: C1, tabla: 'client_social_images', dry_run: false })
    expect(r).toMatchObject({ estado: 'no_se_pudo_leer', detalle: 'cerebro_tendencias: lectura recortada a 2000 filas' })
    expect(escrituras).toEqual([])
  })
  it('el cliente no existe → no se clasifica', async () => {
    const { db } = baseCon(IMGS(), { clients: [] })
    expect(await clasificarPendientes(db, { clientId: C1, tabla: 'client_social_images', dry_run: false })).toMatchObject({ estado: 'no_se_pudo_leer', detalle: 'clients: no existe el cliente' })
  })
  it('falla la primera lectura de la tabla → no_se_pudo_leer; una escritura que falla → fallo_al_escribir con lo ya escrito contado', async () => {
    const a = baseCon(IMGS(), {}, { fallaEn: 'client_social_images' })
    expect((await clasificarPendientes(a.db, { clientId: C1, tabla: 'client_social_images', dry_run: false })).estado).toBe('no_se_pudo_leer')
    const db = { from: (t: string) => { const q = baseCon(IMGS()).db.from(t); if (t === 'client_social_images') { const u = q.update as (f: unknown) => Record<string, unknown>; q.update = (f: unknown) => { const r = u(f); r.in = () => Promise.resolve({ data: null, error: { message: 'se cayó' } }); return r } } return q } }
    const r = await clasificarPendientes(db, { clientId: C1, tabla: 'client_social_images', dry_run: false })
    expect(r).toMatchObject({ estado: 'fallo_al_escribir', detalle: 'client_social_images: se cayó', clasificadas: 0 })
  })
  it('una excepción no se escapa', async () => {
    const db = { from: () => { throw new Error('rota') } }
    expect(await clasificarPendientes(db, { clientId: C1, tabla: 'client_videos', dry_run: false })).toMatchObject({ estado: 'no_se_pudo_leer', detalle: 'rota' })
  })
  it(`lee como mucho ${TOPE_POR_CORRIDA} filas y escribe de a ${POR_ESCRITURA} ids`, async () => {
    const muchas = Array.from({ length: TOPE_POR_CORRIDA + 30 }, (_, i) => ({ id: `h${i}`, client_id: C1, owner_role: 'competidor', handle: 'pruebamask', post_id: `p${i}`, tipo: 'post_image', clasificado_en: null }))
    const { db, escrituras } = baseCon(muchas)
    const r = await clasificarPendientes(db, { clientId: C1, tabla: 'client_social_images', dry_run: false, ahora: AHORA })
    expect(r).toMatchObject({ por_clasificar: TOPE_POR_CORRIDA, clasificadas: TOPE_POR_CORRIDA })
    const ups = escrituras.filter((e) => e.op === 'update')
    expect(ups).toHaveLength(TOPE_POR_CORRIDA / POR_ESCRITURA)
    expect(ups.every((e) => (e.filtros?.[0]?.[1] as string[]).length === POR_ESCRITURA)).toBe(true)
    expect(muchas.filter((f) => f.clasificado_en === null)).toHaveLength(30)
  })
})

describe('🔴 la corrida del vigilante', () => {
  const IMG = (): Array<Record<string, unknown>> => [{ id: 'h-1', client_id: C1, owner_role: 'competidor', handle: 'pruebamask', post_id: 'ig-5', tipo: 'post_image', clasificado_en: null }]
  const PEDIDO = { dry_run: false, workflow_id: 'wf', workflow_execution_id: 'ex' }
  it('clasifica los clientes que revisó y la bodega, las dos tablas; con dry_run:false + proceso escribe', async () => {
    const img = IMG()
    const { db } = baseCon(img)
    const r = await origenDeLaCorridaDelVigilante(db, PEDIDO, { clientes: [{ client_id: C1 }, { client_id: C1 }, { client_id: 'no-uuid' }] }, AHORA)
    expect(r!.map((x) => [x.client_id, x.tabla])).toEqual([[C1, 'client_social_images'], [C1, 'client_videos'], [null, 'client_social_images'], [null, 'client_videos']])
    expect(r![0]).toMatchObject({ clasificadas: 1 })
    expect(img[0].clasificado_en).toBe(AHORA.toISOString())
  })
  it.each([
    ['sin dry_run', { workflow_id: 'wf', workflow_execution_id: 'ex' }],
    ['dry_run true', { ...PEDIDO, dry_run: true }],
    ['sin workflow_id', { dry_run: false, workflow_execution_id: 'ex' }],
    ['sin workflow_execution_id', { dry_run: false, workflow_id: 'wf' }],
    ['workflow_id en blanco', { ...PEDIDO, workflow_id: '  ' }],
    ['pedido que no es objeto', 'x'],
  ])('%s → solo cuenta, no escribe', async (_n, pedido) => {
    const img = IMG()
    const { db, escrituras } = baseCon(img)
    const r = await origenDeLaCorridaDelVigilante(db, pedido, { clientes: [{ client_id: C1 }] })
    expect(r![0]).toMatchObject({ por_clasificar: 1, clasificadas: 0 })
    expect(escrituras).toEqual([])
  })
  it('sin clientes revisados → null (ni la bodega)', async () => {
    const { db, lecturas } = baseCon(IMG())
    expect(await origenDeLaCorridaDelVigilante(db, PEDIDO, { clientes: [] })).toBeNull()
    expect(await origenDeLaCorridaDelVigilante(db, PEDIDO, {})).toBeNull()
    expect(lecturas).toEqual([])
  })
  it('un cliente que falla no frena a los demás ni a la bodega', async () => {
    const C3 = '33333333-3333-4333-8333-333333333333'
    const { db } = baseCon([...IMG(), { id: 'sin-cliente', client_id: C3, owner_role: 'competidor', handle: 'x', post_id: 'y', tipo: 'post_image', clasificado_en: null }, { id: 'b', client_id: null, owner_role: 'referencia', handle: 'v', post_id: 'z', tipo: 'video_captura', clasificado_en: null }])
    const r = await clasificarLoAjenoDeLaCorrida(db, { clientes: [C3, C1], dry_run: false, ahora: AHORA })
    expect(r.map((x) => x.estado)).toEqual(['no_se_pudo_leer', 'ok', 'ok', 'ok', 'ok', 'ok'])
    expect(r[4]).toMatchObject({ client_id: null, clasificadas: 1 })
    expect(r[2]).toMatchObject({ client_id: C1, clasificadas: 1 })
  })
})

describe('leerContexto', () => {
  it('lee las llamadas de Instagram, Mapas y anuncios del cliente y las fichas de Mapas guardadas', async () => {
    const { db } = baseCon([])
    const r = await leerContexto(db, C1, 'client_social_images')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect([...r.contexto.vigilados.keys()].sort()).toEqual(['ceviexpress', 'ceviexpress.ec', 'krudo-viches', 'krudoviches', 'la-quinta'])
    expect(r.contexto.lugarDeCuenta.get('krudo-viches')).toEqual({ donde: 'otro_pais', pais: 'CO' })
    expect(r.contexto.ciudades.sort()).toEqual(['guayaquil', 'olon'])
    expect(r.contexto.pais).toBe('EC')
    expect(r.contexto.propiasPorPublicacion.get('ig-123')).toBeUndefined()
  })
})
