/**
 * PR corto tras la primera corrida real (14-oct): filtro anti-homónimos con nombres COMUNES, reseñas y videos en tanda 2, dedupe de sedes y costos medidos.
 * Casos reales de la corrida (una noticia de naufragio, «Picantería El Náufrago Sebas», un homónimo de otra ciudad) + 3 rubros inventados con nombre común. US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { esSobreElCliente, filtrarUnidad, nombreEsComun, type ContextoDelCliente } from '../filtro'
import { COSTO_MAXIMO_POR_FUNCION, VIDEO_DE_INSTAGRAM_USD } from '../gasto'
import { descubrir } from '../plan'
import { contextoDelCliente, palabrasDelRubro } from '../alimentar'
import { rutaTanda2 } from '../rutas'
import { crearBaseFalsa } from './base-falsa'
import type { Unidad } from '../unidades'

const ctx = (o: Partial<ContextoDelCliente> & { nombre: string }): ContextoDelCliente => ({ ubicacion: [], handles: [], dominios: [], telefonos: [], rubro: [], ...o })
const tercero = (texto: string): Unidad => ({ fuente: 'articulo', ref: 'https://x.example/a', unidad_ref: 'u', texto, clase_dato: 'acumula', atributo: null, autoria: 'tercero', huella: 'h', fecha_fuente: null, apify_raw_id: 'r', observado_en: '2026-10-16T10:00:00Z' })
const estado = (c: ContextoDelCliente, texto: string) => esSobreElCliente(texto, c).estado

describe('nombres comunes: la ciudad sola NO confirma', () => {
  it('nombreEsComun: una sola palabra tras quitar artículos y tipo de local; los nombres de varias palabras no', () => {
    expect(nombreEsComun('Náufrago')).toBe(true)
    expect(nombreEsComun('El Náufrago')).toBe(true)
    expect(nombreEsComun('Restaurante Brisa')).toBe(true)
    expect(nombreEsComun('Casa Yoga Luna')).toBe(false)
    expect(nombreEsComun('Clínica Sonrisa Norte')).toBe(false)
    expect(nombreEsComun('')).toBe(true)
  })
  const naufrago = ctx({ nombre: 'Náufrago', ubicacion: ['Olón', 'Guayaquil'], handles: ['naufrago.ec'], dominios: ['naufrago.ec'], telefonos: ['0997744288'], rubro: palabrasDelRubro('restaurante de mariscos costero ecuatoriano') })
  it('los casos REALES de la primera corrida ya no pasan', () => {
    // una noticia de naufragio (nombre común + ciudad)
    expect(estado(naufrago, 'Ocho rescatados y un desaparecido tras naufragio frente al malecón en Guayaquil: el náufrago fue hallado por pescadores cerca del muelle')).toBe('sin_confirmar')
    // «Picantería El Náufrago Sebas» de Guayaquil (otro negocio, otra marca, misma ciudad)
    expect(estado(naufrago, 'picanteria el naufrago sebas restaurant guayas guayaquil yandex maps no reviews yet write review contacts 593 9904 76')).toBe('sin_confirmar')
    // el homónimo de otra ciudad
    expect(estado(naufrago, 'Náufrago Rooftop bar y grill en Medellín Colombia: un espacio único inspirado en la biodiversidad')).toBe('sin_confirmar')
  })
  it('con IDENTIDAD (cuenta, dominio o teléfono) sí pasa; con ciudad + 2 palabras de su rubro, también; con ciudad + 1 palabra de rubro, no', () => {
    expect(estado(naufrago, 'Cuando tengas esa hambre de Náufrago te espera. Pedidos al 099 774 4288')).toBe('propio')
    expect(estado(naufrago, 'Reseña: pedimos en naufrago.ec y llegó rápido')).toBe('propio')
    expect(estado(naufrago, 'El restaurante de mariscos Náufrago abre en Olón con ceviche fresco todos los días')).toBe('propio')
    expect(estado(naufrago, 'El restaurante Náufrago de Olón abre los jueves')).toBe('sin_confirmar')
  })
  it('sin el nombre entero, ajeno; y el filtro de unidades usa la misma regla', () => {
    expect(estado(naufrago, 'Cocina costera de Olón con mariscos frescos y restaurante familiar')).toBe('ajeno')
    expect(filtrarUnidad(tercero('Ocho rescatados tras naufragio en Guayaquil: un náufrago fue hallado cerca del muelle del malecón central'), naufrago, new Set()).estado).toBe('sin_confirmar')
    expect(filtrarUnidad(tercero('El restaurante de mariscos Náufrago en Olón sirve ceviche cada día y atiende pedidos por teléfono'), naufrago, new Set()).estado).toBe('propio')
  })
  it('3 rubros inventados con nombre común (spa, veterinaria, mueblería)', () => {
    const brisa = ctx({ nombre: 'Brisa', ubicacion: ['Cuenca'], rubro: palabrasDelRubro('spa de masajes y relajación') })
    expect(estado(brisa, 'La brisa del mar refresca las tardes de abril en Cuenca según los vecinos')).toBe('sin_confirmar')
    expect(estado(brisa, 'Spa Brisa en Cuenca ofrece masajes y relajación con aceites naturales')).toBe('propio')
    expect(estado(brisa, 'Cafetería Brisa de Quito abrió una segunda sucursal')).toBe('sin_confirmar')
    const aurora = ctx({ nombre: 'Aurora', ubicacion: ['Loja'], handles: ['aurora.vet'], rubro: palabrasDelRubro('clínica veterinaria para mascotas') })
    expect(estado(aurora, 'La aurora boreal se vio anoche en el norte de Europa')).toBe('sin_confirmar')
    expect(estado(aurora, 'Clínica veterinaria Aurora en Loja atiende mascotas las 24 horas')).toBe('propio')
    expect(estado(aurora, 'Sigue a Aurora (@aurora.vet) para consejos de mascotas')).toBe('propio')
    const roble = ctx({ nombre: 'Roble', ubicacion: ['Ambato'], rubro: palabrasDelRubro('mueblería y carpintería en madera') })
    expect(estado(roble, 'El roble es una madera noble que se usa en barricas y pisos')).toBe('sin_confirmar')
    expect(estado(roble, 'Mueblería Roble en Ambato: carpintería y madera a medida para tu hogar')).toBe('propio')
  })
  it('un nombre de varias palabras conserva la regla de siempre (ciudad basta); sin ninguna señal, sin_confirmar', () => {
    const c = ctx({ nombre: 'Casa Yoga Luna', ubicacion: ['Montevideo'] })
    expect(estado(c, 'La escuela Casa Yoga Luna de Montevideo abrió un salón nuevo')).toBe('propio')
    expect(estado(c, 'Casa Yoga Luna fue elegida en un listado nacional de estudios')).toBe('sin_confirmar')
  })
  it('la cuenta se busca tal cual: «sonrisanorte» no se confunde con el nombre «Sonrisa Norte» y «naufrago.ec» sí se reconoce', () => {
    const c = ctx({ nombre: 'Clínica Sonrisa Norte', handles: ['sonrisanorte'], ubicacion: [] })
    expect(estado(c, 'La clínica Sonrisa Norte de otra ciudad inauguró consultorio')).toBe('sin_confirmar')
    expect(estado(c, 'Clínica Sonrisa Norte, síguenos en @sonrisanorte')).toBe('propio')
    expect(estado(ctx({ nombre: 'Náufrago', handles: ['naufrago.ec'] }), 'Sigue a Náufrago en instagram.com/naufrago.ec para ver el menú')).toBe('propio')
    expect(estado(ctx({ nombre: 'Náufrago', handles: ['naufrago.ec'] }), 'El náufrago ecuatoriano fue rescatado')).toBe('sin_confirmar')
  })
  it('el rubro NO basta sin ciudad: nombre común + 2 palabras de rubro pero sin ubicación ni identidad es sin_confirmar', () => {
    const c = ctx({ nombre: 'Brisa', ubicacion: ['Cuenca'], rubro: palabrasDelRubro('spa de masajes y relajación') })
    expect(estado(c, 'Spa Brisa ofrece masajes y relajación en un lugar tranquilo')).toBe('sin_confirmar')
    expect(estado(c, 'Spa Brisa en Cuenca ofrece masajes y relajación')).toBe('propio')
  })
  it('el contexto del cliente trae su rubro de la ficha (industria) y la ubicación de sus sedes', () => {
    const c = contextoDelCliente({ id: 'C', name: 'Náufrago', industry: 'restaurante de mariscos costero', website_url: 'https://www.naufrago.ec', config: { apify: { own_handles: { instagram: '@naufrago.ec' } } } }, [{ ciudad: 'Olón', clave: 'olon' }])
    expect(c.rubro).toEqual(['restaurante', 'mariscos', 'costero'])
    expect(c.ubicacion).toEqual(['Olón', 'olon'])
    expect(c.handles).toEqual(['naufrago.ec'])
    expect(c.dominios).toEqual(['naufrago.ec'])
  })
  it('palabrasDelRubro: ≥ 4 letras, sin conectores ni tildes', () => {
    expect(palabrasDelRubro('Restaurante de mariscos, con delivery para la costa')).toEqual(['restaurante', 'mariscos', 'delivery', 'costa'])
    expect(palabrasDelRubro(null)).toEqual([])
  })
})

describe('mapas: las sedes no se repiten por mayúsculas o tildes', () => {
  it('«Guayaquil», «guayaquil», «Olón», «olon» y «OLÓN» son 2 búsquedas, no 5', () => {
    const p = descubrir({
      cliente: { id: 'C', name: 'Náufrago', website_url: 'https://naufrago.example', config: {} }, ciudad: 'Guayaquil', ciudades: ['Guayaquil', 'guayaquil', 'Olón', 'olon', 'OLÓN'],
      publicaciones_propias: [], gastado_hoy_usd: 0, interruptores: { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: false },
    })
    const m = p.hacer.find((a) => a.fuente === 'mapas')!
    expect(m.params.searchStringsArray).toEqual(['Náufrago Guayaquil', 'Náufrago Olón'])
    expect(m.usd_max).toBeCloseTo(0.014, 6)
  })
})

describe('costos declarados = lo medido el 14-oct', () => {
  it('las funciones medidas están marcadas y con el valor real', () => {
    const medidas = { website_content_scraper: 0.0536, instagram_scraper: 0.0025, own_google_maps_profile: 0.007, instagram_post_comments_scraper: 0.07, google_serp_scraper: 0.003, resenas_google_maps: 0.002, videos_instagram: 0.56 }
    for (const [f, usd] of Object.entries(medidas)) expect(COSTO_MAXIMO_POR_FUNCION[f], f).toEqual({ usd, medido: true })
    expect(VIDEO_DE_INSTAGRAM_USD).toBeCloseTo(0.056, 6)
    expect(COSTO_MAXIMO_POR_FUNCION.menciones_en_redes.medido).toBe(false)
  })
  it('el plan diario NO trae los videos de Instagram ni las reseñas de Mapas; los videos de otras redes van de 3 en 3 con su costo proporcional', () => {
    const p = descubrir({
      cliente: { id: 'C', name: 'Casa Yoga Luna', website_url: 'https://luna.example', config: { apify: { own_handles: { instagram: 'casayogaluna' } } } }, rubro: 'estudio de yoga y pilates', ciudad: 'Montevideo',
      redes: { instagram: 'casayogaluna', youtube: 'https://www.youtube.com/@luna', tiktok: 'lunayoga' }, publicaciones_propias: [], gastado_hoy_usd: 0,
      interruptores: { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: false },
    })
    expect(p.hacer.some((a) => a.funcion === 'videos_instagram')).toBe(false)
    expect(p.hacer.some((a) => a.funcion === 'resenas_google_maps')).toBe(false)
    const yt = p.hacer.find((a) => a.funcion === 'videos_youtube')!
    expect((yt.params as { maxResults: number }).maxResults).toBe(3)
    expect(yt.usd_max).toBeCloseTo(0.027, 6)
    expect(p.hacer.find((a) => a.funcion === 'videos_tiktok')!.usd_max).toBeCloseTo(0.015, 6)
  })
})

describe('tanda 2 · reseñas con la ficha confirmada y videos solo si hay publicaciones nuevas', () => {
  const C = '77777777-7777-4777-8777-777777777777'
  const ON = { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: false }
  const D = new Date('2026-10-16T12:00:00Z')
  const base = (o: { mapas?: unknown[]; ig?: unknown[]; vistas?: string[]; resenasHoy?: boolean; costs?: unknown[] }) => ({
    clients: [{ id: C, name: 'Náufrago', website_url: 'https://www.naufrago.ec', industry: 'restaurante de mariscos costero', config: { apify: { own_handles: { instagram: 'naufrago.ec' } } } }],
    client_sedes: [{ client_id: C, ciudad: 'Olón', clave: 'olon' }],
    apify_raw: [
      ...(o.mapas ? [{ id: 'm', client_id: C, apify_function: 'own_google_maps_profile', ensayo: false, created_at: '2026-10-16T08:00:00Z', respuesta: o.mapas }] : []),
      ...(o.ig ? [{ id: 'i', client_id: C, apify_function: 'instagram_scraper', ensayo: false, created_at: '2026-10-16T08:01:00Z', respuesta: o.ig }] : []),
      ...(o.resenasHoy ? [{ id: 'r', client_id: C, apify_function: 'resenas_google_maps', ensayo: false, created_at: '2026-10-16T09:00:00Z', params: {}, respuesta: [] }] : []),
    ],
    cerebro_unidades_vistas: (o.vistas ?? []).map((u) => ({ client_id: C, fuente: 'instagram', unidad_ref: u })),
    costs: o.costs ?? [], agent_invocations: [],
  })
  const ficha = { title: 'Naufrago', address: 'Olón, Santa Elena', website: 'https://www.naufrago.ec', url: 'https://www.google.com/maps/search/?api=1&query=Naufrago&query_place_id=ChIJabc' }
  const homonimo = { title: 'Náufrago Rooftop MDE', address: 'Medellín, Colombia', website: 'https://wanderlog.com/x', url: 'https://www.google.com/maps/place/rooftop' }
  const post = (id: string, type: string) => ({ shortCode: id, type })
  const correr = async (t: ReturnType<typeof base>) => rutaTanda2({ db: crearBaseFalsa(t as never).db, interruptores: ON, ahora: D }, { client_id: C, dry_run: true })
  const accion = (r: { body: Record<string, unknown> }, f: string) => (r.body.acciones as Array<{ funcion: string; params: Record<string, unknown>; usd_max: number }>).find((a) => a.funcion === f)

  it('pide las reseñas (≤ 100) con la dirección de la ficha que ES del cliente', async () => {
    const r = await correr(base({ mapas: [ficha] }))
    const a = accion(r, 'resenas_google_maps')!
    expect(a.params).toEqual({ startUrls: [{ url: ficha.url }], maxReviews: 100 })
    expect(a.usd_max).toBeCloseTo(0.002, 6)
  })
  it('una ficha de Mapas de un homónimo NO abre reseñas ajenas; la lista dice por qué', async () => {
    const r = await correr(base({ mapas: [homonimo] }))
    expect(accion(r, 'resenas_google_maps')).toBeUndefined()
    expect(JSON.stringify(r.body.omitidas)).toMatch(/homónimo/)
    expect(JSON.stringify(r.body.fichas_de_mapas_descartadas)).toMatch(/Rooftop/)
  })
  it('entre un homónimo y la ficha propia elige la propia', async () => {
    const r = await correr(base({ mapas: [homonimo, ficha] }))
    expect((accion(r, 'resenas_google_maps')!.params.startUrls as Array<{ url: string }>)[0].url).toBe(ficha.url)
  })
  it('la ficha REAL no trae sitio ni teléfono: se confirma por título exacto + sede declarada', async () => {
    const real = { title: 'Naufrago', address: '663R+25G, Olon, Ecuador', city: 'Olon', url: 'https://www.google.com/maps/search/?api=1&query=Naufrago&query_place_id=ChIJreal', placeId: 'ChIJreal' }
    const r = await correr(base({ mapas: [homonimo, { ...homonimo, title: 'Naufrago Market', address: 'Guayaquil, Ecuador', city: 'Guayaquil', placeId: 'otro' }, real] }))
    expect((accion(r, 'resenas_google_maps')!.params.startUrls as Array<{ url: string }>)[0].url).toBe(real.url)
  })
  it('una sola ficha en una sede, pero con otro título («Naufrago Market»), NO es la del cliente', async () => {
    const r = await correr(base({ mapas: [{ title: 'Naufrago Market', address: 'Olon, Ecuador', city: 'Olon', url: 'https://www.google.com/maps/place/m', placeId: 'm' }] }))
    expect(accion(r, 'resenas_google_maps')).toBeUndefined()
    expect(JSON.stringify(r.body.fichas_de_mapas_descartadas)).toMatch(/Naufrago Market/)
  })
  it('título exacto pero FUERA de las sedes del cliente ⇒ no es la ficha', async () => {
    const r = await correr(base({ mapas: [{ title: 'Naufrago', address: 'Medellín, Colombia', city: 'Medellín', url: 'https://www.google.com/maps/place/x', placeId: 'x' }] }))
    expect(accion(r, 'resenas_google_maps')).toBeUndefined()
  })
  it('dos fichas distintas con el título exacto en sedes declaradas ⇒ ambiguo: no se piden reseñas', async () => {
    const dos = [
      { title: 'Naufrago', address: 'Olon, Ecuador', city: 'Olon', url: 'https://www.google.com/maps/place/a', placeId: 'a' },
      { title: 'Naufrago', address: 'Olon, Ecuador, frente al muelle', city: 'Olon', url: 'https://www.google.com/maps/place/b', placeId: 'b' },
    ]
    const r = await correr(base({ mapas: dos }))
    expect(accion(r, 'resenas_google_maps')).toBeUndefined()
    expect(JSON.stringify(r.body.omitidas)).toMatch(/ambiguo/)
  })
  it('la misma ficha repetida en varias corridas cuenta como UNA', async () => {
    const real = { title: 'Naufrago', address: 'Olon, Ecuador', city: 'Olon', url: 'https://www.google.com/maps/place/a', placeId: 'a' }
    const r = await correr(base({ mapas: [real, real] }))
    expect(accion(r, 'resenas_google_maps')).toBeDefined()
  })
  it('ya se pidieron hoy ⇒ no se repiten', async () => {
    const r = await correr(base({ mapas: [ficha], resenasHoy: true }))
    expect(accion(r, 'resenas_google_maps')).toBeUndefined()
    expect(JSON.stringify(r.body.omitidas)).toMatch(/ya se pidieron hoy/)
  })
  it('videos: si no hay publicaciones NUEVAS no se baja ninguno (se revisa igual y se dice)', async () => {
    const r = await correr(base({ ig: [{ username: 'naufrago.ec', latestPosts: [post('A', 'Video'), post('B', 'Image')] }], vistas: ['A', 'B'] }))
    expect(accion(r, 'videos_instagram')).toBeUndefined()
    expect(r.body.revision_de_publicaciones).toEqual({ publicaciones_leidas: 2, publicaciones_nuevas: 0, videos_nuevos: 0 })
  })
  it('videos: una publicación nueva que es imagen tampoco baja videos', async () => {
    const r = await correr(base({ ig: [{ username: 'naufrago.ec', latestPosts: [post('A', 'Video'), post('N', 'Image')] }], vistas: ['A'] }))
    expect(accion(r, 'videos_instagram')).toBeUndefined()
    expect(r.body.revision_de_publicaciones).toMatchObject({ publicaciones_nuevas: 1, videos_nuevos: 0 })
  })
  it('videos: se piden tantos como videos nuevos (tope 10) y cuestan 0,056 por video', async () => {
    const uno = await correr(base({ ig: [{ username: 'naufrago.ec', latestPosts: [post('A', 'Video'), post('N', 'Video')] }], vistas: ['A'] }))
    expect(accion(uno, 'videos_instagram')!.params).toMatchObject({ username: ['naufrago.ec'], resultsLimit: 1, includeTranscript: true })
    expect(accion(uno, 'videos_instagram')!.usd_max).toBeCloseTo(0.056, 6)
    const muchos = Array.from({ length: 14 }, (_, i) => post(`V${i}`, 'Video'))
    const r = await correr(base({ ig: [{ username: 'naufrago.ec', latestPosts: muchos }] }))
    expect(accion(r, 'videos_instagram')!.params.resultsLimit).toBe(10)
    expect(accion(r, 'videos_instagram')!.usd_max).toBeCloseTo(0.56, 6)
  })
  it('videos: solo cuentan las publicaciones de la cuenta PROPIA', async () => {
    const r = await correr(base({ ig: [{ username: 'otra_cuenta', latestPosts: [post('X', 'Video')] }] }))
    expect(accion(r, 'videos_instagram')).toBeUndefined()
    expect(r.body.revision_de_publicaciones).toMatchObject({ publicaciones_leidas: 0 })
  })
  it('el tope corta la tanda con motivo (lo gastado hoy + lo que pide > 1,50)', async () => {
    const costs = [{ service: 'apify:videos_instagram', amount_usd: 1.49, created_at: '2026-10-16T09:00:00Z', description: JSON.stringify({ es: 'detalle_de_llamada', client_id: C }) }]
    const r = await correr(base({ mapas: [ficha], ig: [{ username: 'naufrago.ec', latestPosts: [post('N', 'Video'), post('M', 'Video')] }], costs }))
    // las reseñas (0,002) caben en lo que queda; los videos (0,112) no
    expect((r.body.acciones as Array<{ funcion: string }>).map((x) => x.funcion)).toEqual(['resenas_google_maps'])
    expect(JSON.stringify(r.body.omitidas)).toMatch(/videos.*no cabe en el tope/)
  })
  it('apagado: no lee nada; sin dry_run: 400', async () => {
    const b = crearBaseFalsa(base({ mapas: [ficha] }) as never)
    const r = await rutaTanda2({ db: b.db, interruptores: { ...ON, alimentar: false } }, { client_id: C, dry_run: true })
    expect(r.body.apagado).toBe(true)
    expect(b.lecturas).toEqual([])
    expect((await rutaTanda2({ db: b.db, interruptores: ON }, { client_id: C })).status).toBe(400)
  })
})

describe('Mapas: nunca se archiva «la primera ficha» (contaminación medida el 14-oct)', () => {
  const C2 = '88888888-8888-4888-8888-888888888888'
  const ctxN = ctx({ nombre: 'Náufrago', ubicacion: ['Olón', 'Guayaquil'], rubro: palabrasDelRubro('restaurante de mariscos costero') })
  const homonimo = { title: 'Puerto del Naufrago', address: 'V443+X23 Comisariato, 090509 Guayaquil, Ecuador', city: 'Guayaquil', phone: '+593 99 272 0675', placeId: 'h' }
  const propia = { title: 'Naufrago', address: '663R+25G, Olon, Ecuador', city: 'Olon', placeId: 'p' }
  const fila = (items: unknown[]) => ({ id: 'm1', apify_function: 'own_google_maps_profile', ensayo: false, created_at: '2026-10-16T08:00:00Z', respuesta: items })
  it('con selector: las unidades salen de la ficha del cliente aunque el homónimo venga primero', async () => {
    const { fichaPropiaDeMapas } = await import('../mapas-propia')
    const { unidadesDeRaspados } = await import('../unidades')
    const us = unidadesDeRaspados([fila([homonimo, propia])], { propios: { handles: [] }, fichaDeMapas: (items) => fichaPropiaDeMapas(items, ctxN).ficha })
    const txt = us.map((u) => u.texto).join(' | ')
    expect(txt).toContain('olon')
    expect(txt).not.toMatch(/puerto del naufrago|0675|comisariato/)
  })
  it('sin selector NO se leen unidades de Mapas (antes tomaba «la primera»)', async () => {
    const { unidadesDeRaspados } = await import('../unidades')
    expect(unidadesDeRaspados([fila([homonimo, propia])], { propios: { handles: [] } })).toEqual([])
  })
  it('solo homónimos o ambigua ⇒ ninguna unidad', async () => {
    const { fichaPropiaDeMapas } = await import('../mapas-propia')
    expect(fichaPropiaDeMapas([homonimo], ctxN).ficha).toBeNull()
    const dos = fichaPropiaDeMapas([propia, { ...propia, placeId: 'q', address: 'Olon, frente al muelle' }], ctxN)
    expect(dos.ambigua).toBe(true)
    expect(dos.candidatas).toBe(2)
  })
  it('de punta a punta: el homónimo primero NO deja su teléfono ni su dirección en las fichas', async () => {
    const { alimentarCliente } = await import('../alimentar')
    const base = crearBaseFalsa({
      clients: [{ id: C2, name: 'Náufrago', website_url: 'https://www.naufrago.ec', industry: 'restaurante de mariscos costero', config: {} }],
      client_sedes: [{ client_id: C2, ciudad: 'Olón', clave: 'olon' }, { client_id: C2, ciudad: 'Guayaquil', clave: 'guayaquil' }],
      apify_raw: [{ ...fila([homonimo, propia]), client_id: C2 }],
      cerebro_unidades_vistas: [], cerebro_fichas: [], cerebro_ingresos: [], cerebro_portero_corridas: [],
    } as never)
    const r = await alimentarCliente({ db: base.db, client_id: C2, dry_run: false, interruptores: { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: false }, ahora: new Date('2026-10-16T12:00:00Z'), workflow_id: 'wf', workflow_execution_id: 'ex' })
    expect(r.estado).toBe('hecha')
    const fichas = (base.tablas.cerebro_fichas as Array<{ contenido: string; atributo: string }>)
    expect(fichas.length).toBeGreaterThan(0)
    expect(fichas.map((f) => f.contenido).join(' | ')).not.toMatch(/puerto del naufrago|0675|comisariato/)
    expect(fichas.some((f) => f.atributo === 'mapas:direccion' && /olon/.test(f.contenido))).toBe(true)
  })
})
