/**
 * LO MÁS GUSTADO POR EL PÚBLICO (30-oct · firma de Emilio «DALE») · el brazo `gustado`: hashtags del rubro + ciudad → ranking por gusto relativo → dos notas («lo_mas_gustado» y «tendencia_del_publico») + las propias.
 * US$ 0 · base falsa · sin Apify real (las filas crudas imitan la forma del actor). Todo es dato: ningún cliente en el código.
 */
import { describe, expect, it } from 'vitest'
import { BRAZOS_APAGADOS, accionesDeBrazos, brazosDelEntorno, ciudadesDeGusto, correrBrazos, handlesPropios, hayBrazoActivo } from '../brazos'
import {
  MAX_POR_CUENTA, MINIMO_DE_INTERACCIONES, PERFILES_POR_LLAMADA, PISO_DE_SEGUIDORES, TOP_DE_GUSTADO, accionesDeGustado, agruparTop, fichasDeGustado, fueCortada, ganchoDe, hashtagsDeGusto, mejoresVariadas, ordenarPorGusto, publicacionesDe, registrosDe, seguidoresPorCuenta,
} from '../brazos/gustado'
import { crearBaseFalsa } from './base-falsa'

type Fila = Record<string, unknown>
const CL = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const JUEVES = new Date('2026-10-29T15:00:00Z')
const LUNES = new Date('2026-10-26T15:00:00Z')

const post = (cuenta: string, likes: number, com: number, extra: Fila = {}): Fila => ({ shortCode: `${cuenta}-${likes}-${com}`, ownerUsername: cuenta, likesCount: likes, commentsCount: com, type: 'Image', timestamp: '2026-10-20T12:00:00.000Z', caption: 'Ceviche de camarón fresco', url: `https://www.instagram.com/p/${cuenta}-${likes}-${com}/`, ...extra })
const filaHashtag = (ciudad: string, items: Fila[], cuando = '2026-10-29T10:00:00Z', tags = ['mariscosguayaquil']) => ({ id: `h-${ciudad}-${cuando}`, apify_function: 'instagram_scraper', ensayo: false, created_at: cuando, params: { directUrls: tags.map((t) => `https://www.instagram.com/explore/tags/${t}/`), resultsType: 'posts', _brazo: `gustado:hashtag:${ciudad}` }, respuesta: items })
const filaPerfiles = (perfiles: Array<[string, number]>, cuando = '2026-10-29T11:00:00Z') => ({ id: `p-${cuando}`, apify_function: 'instagram_scraper', ensayo: false, created_at: cuando, params: { _brazo: 'gustado:perfiles' }, respuesta: perfiles.map(([username, followersCount]) => ({ username, followersCount, latestPosts: [] })) })

describe('hashtags: salen de la ficha, no de un cliente', () => {
  it('la palabra específica del rubro pegada a la ciudad, la otra palabra pegada a la ciudad y la palabra sola', () => {
    expect(hashtagsDeGusto({ terminos: ['restaurante mariscos'], ciudad: 'Guayaquil' })).toEqual(['mariscosguayaquil', 'restauranteguayaquil', 'mariscos'])
    expect(hashtagsDeGusto({ terminos: ['gimnasio'], ciudad: 'Bogotá' })).toEqual(['gimnasiobogota', 'gimnasio'])
    expect(hashtagsDeGusto({ terminos: ['clínica dental'], ciudad: 'Ciudad de México' })[0]).toBe('dentalciudaddemexico')
  })
  it('el dueño puede declarar los suyos; sin palabras del rubro no se inventa nada', () => {
    expect(hashtagsDeGusto({ terminos: ['x'], ciudad: 'Quito', declarados: ['#Extintores', 'seguridad industrial', 'ab'] })).toEqual(['extintores', 'seguridadindustrial'])
    expect(hashtagsDeGusto({ terminos: [], ciudad: 'Quito' })).toEqual([])
  })
  it('ciudades y cuentas propias salen de la ficha', () => {
    expect(ciudadesDeGusto({ apify: { ciudades_de_gusto: ['Guayaquil', 'Olón'] } }, 'Lima')).toEqual(['Guayaquil', 'Olón'])
    expect(ciudadesDeGusto({}, 'Lima', 'x')).toEqual(['Lima'])
    expect(ciudadesDeGusto({}, null, 'Olón, Santa Elena, Ecuador')).toEqual(['Olón'])
    expect(ciudadesDeGusto({}, null, null)).toEqual([])
    expect(handlesPropios({ apify: { own_handles: { instagram: '@naufrago.ec' } } })).toEqual(['naufrago.ec'])
    expect(handlesPropios({})).toEqual([])
  })
})

describe('lectura y orden por gusto', () => {
  it('lee una fila por publicación (hashtag) y los últimos posts de un perfil; los likes ocultos (-1) se omiten; sin @usuarios en el texto', () => {
    const h = publicacionesDe([post('a', 100, 5, { caption: 'Gracias @juan por venir' }), post('b', -1, 3)])
    expect(h).toHaveLength(1)
    expect(h[0]).toMatchObject({ cuenta: 'a', likes: 100, comentarios: 5, formato: 'foto', fecha: '2026-10-20' })
    expect(h[0].texto).not.toContain('@juan')
    const perfil = publicacionesDe([{ username: 'Casa', followersCount: 900, latestPosts: [{ shortCode: 'z', likesCount: 40, commentsCount: 2, type: 'Video', timestamp: '2026-10-01T00:00:00Z' }] }])
    expect(perfil[0]).toMatchObject({ cuenta: 'casa', formato: 'video', url: 'https://www.instagram.com/p/z/' })
    expect(publicacionesDe([post('c', 5, 0, { type: 'Sidecar' })])[0].formato).toBe('carrusel')
    expect(publicacionesDe([post('d', 5, 0, { type: 'Video', productType: 'clips' })])[0].formato).toBe('video')
  })
  it('no gana solo la cuenta grande: se ordena por (likes+comentarios) ÷ seguidores, con piso, y las de menos de 10 interacciones no entran', () => {
    const pubs = publicacionesDe([post('grande', 5000, 100), post('mediana', 600, 40), post('chica', 90, 10), post('diminuta', 8, 1), post('sinseg', 9000, 0), post('ruido', 4, 2)])
    const seg = new Map([['grande', 500_000], ['mediana', 4_000], ['chica', 700], ['diminuta', 12]])
    const r = ordenarPorGusto(pubs, seg)
    expect(r.map((p) => p.cuenta)).toEqual(['mediana', 'chica', 'grande', 'sinseg'])
    expect(r.find((p) => p.cuenta === 'ruido')).toBeUndefined()
    expect(r.find((p) => p.cuenta === 'diminuta')).toBeUndefined() // 9 interacciones < mínimo
    expect(r[0].gusto).toBeCloseTo(640 / 4000, 6)
    expect(r[3].gusto).toBeNull() // sin seguidores: va al final y lo dice
    // el piso: una cuenta de 50 seguidores se mide como si tuviera 300
    const chico = ordenarPorGusto(publicacionesDe([post('mini', 30, 0)]), new Map([['mini', 50]]))
    expect(chico[0].gusto).toBeCloseTo(30 / PISO_DE_SEGUIDORES, 6)
    expect(MINIMO_DE_INTERACCIONES).toBe(10)
  })
  it('una publicación repetida (dos hashtags) cuenta una vez; seguidores: manda la lectura más reciente', () => {
    expect(ordenarPorGusto([...publicacionesDe([post('a', 50, 5)]), ...publicacionesDe([post('a', 50, 5)])], new Map([['a', 1000]]))).toHaveLength(1)
    const m = seguidoresPorCuenta([filaPerfiles([['a', 100]], '2026-10-01T00:00:00Z'), filaPerfiles([['a', 150]], '2026-10-20T00:00:00Z')] as never)
    expect(m.get('a')).toBe(150)
  })
})

describe('lo que el Servicio guardó cortado se rescata; y una cuenta no ocupa todo el ranking', () => {
  it('una respuesta cortada (`{_truncado, muestra}`) devuelve los registros completos', () => {
    const items = [post('a', 100, 5), post('b', 90, 5), post('c', 80, 5)]
    const texto = JSON.stringify(items)
    const cortada = { _truncado: true, _bytes: texto.length * 3, muestra: texto.slice(0, texto.length - 40) }
    expect(fueCortada(cortada)).toBe(true)
    expect(registrosDe(cortada).map((x) => x.ownerUsername)).toEqual(['a', 'b'])
    expect(publicacionesDe(cortada)).toHaveLength(2)
    expect(registrosDe(items)).toHaveLength(3)
    expect(registrosDe({ muestra: 'no es json' })).toEqual([])
    expect(fueCortada(items)).toBe(false)
  })
  it('a lo más 2 publicaciones por cuenta entre las mejores', () => {
    const pubs = publicacionesDe([...[1, 2, 3, 4].map((i) => post('activa', 500 - i, 10)), post('otra', 100, 10), post('tercera', 90, 10)])
    const seg = new Map([['activa', 1000], ['otra', 1000], ['tercera', 1000]])
    const top = mejoresVariadas(ordenarPorGusto(pubs, seg))
    expect(top.filter((p) => p.cuenta === 'activa')).toHaveLength(MAX_POR_CUENTA)
    expect(top.map((p) => p.cuenta)).toEqual(['activa', 'activa', 'otra', 'tercera'])
  })
})

describe('agrupar: formato, gancho y tema', () => {
  it('el gancho sale del texto por código', () => {
    expect(ganchoDe('')).toBe('sin texto (solo imagen)')
    expect(ganchoDe('¿Ya probaste nuestro ceviche mixto de la casa?')).toBe('pregunta')
    expect(ganchoDe('Combo familiar a $12.50 solo hoy en el local')).toBe('oferta o precio')
    expect(ganchoDe('Reserva tu mesa escribiéndonos por WhatsApp hoy mismo')).toBe('invitación a actuar')
    expect(ganchoDe('Un plato lleno de sabor y de mar en cada bocado')).toBe('descripción simple')
  })
  it('cuenta formatos, ganchos y temas que se repiten; los hashtags de la búsqueda no son tema', () => {
    const pubs = publicacionesDe([post('a', 100, 5, { type: 'Video', caption: 'Langostinos al ajillo para compartir' }), post('b', 90, 5, { type: 'Video', caption: 'Langostinos grandes del día' }), post('c', 80, 5, { type: 'Video', caption: 'Más langostinos frescos' }), post('d', 70, 5, { caption: 'mariscosguayaquil mariscosguayaquil' })])
    const top = ordenarPorGusto(pubs, new Map([['a', 1000], ['b', 1000], ['c', 1000], ['d', 1000]]))
    const g = agruparTop(top, ['mariscosguayaquil'])
    expect(g.find((x) => x.dimension === 'formato' && x.valor === 'video')?.veces).toBe(3)
    expect(g.find((x) => x.dimension === 'tema' && x.valor === 'langostinos')?.veces).toBe(3)
    expect(g.find((x) => x.dimension === 'tema' && x.valor.includes('mariscos'))).toBeUndefined()
  })
})

describe('acciones: se pide a Apify una vez por semana y en dos pasadas', () => {
  const base = { terminos: ['restaurante mariscos'], ciudades: ['Guayaquil', 'Olón'], ahora: JUEVES, filas: [] as never[] }
  it('el jueves pide los hashtags de cada ciudad con el Servicio (instagram_scraper de posts); otro día no pide nada; forzar lo salta', () => {
    const a = accionesDeGustado(base)
    // una llamada por hashtag (el Servicio corta lo que pasa de 200.000 caracteres)
    expect(a.acciones).toHaveLength(6)
    expect(a.acciones[0]).toMatchObject({ fuente: 'gustado', funcion: 'instagram_scraper', params: { resultsType: 'posts', _brazo: 'gustado:hashtag:guayaquil', directUrls: ['https://www.instagram.com/explore/tags/mariscosguayaquil/'] } })
    expect(a.acciones.map((x) => (x.params.directUrls as string[])[0].split('/tags/')[1])).toEqual(['mariscosguayaquil/', 'restauranteguayaquil/', 'mariscos/', 'mariscosolon/', 'restauranteolon/', 'mariscos/'])
    expect(a.acciones[3].params._brazo).toBe('gustado:hashtag:olon')
    expect(accionesDeGustado({ ...base, ahora: LUNES }).acciones).toHaveLength(0)
    expect(accionesDeGustado({ ...base, ahora: LUNES, forzar: true }).acciones).toHaveLength(6)
  })
  it('no repite una ciudad pedida hace menos de 6 días (salvo forzar) y dice si falta la ciudad', () => {
    const reciente = filaHashtag('guayaquil', [], '2026-10-27T10:00:00Z')
    const a = accionesDeGustado({ ...base, filas: [reciente] as never })
    expect(new Set(a.acciones.map((x) => x.params._brazo))).toEqual(new Set(['gustado:hashtag:olon']))
    expect(accionesDeGustado({ ...base, filas: [reciente] as never, forzar: true }).acciones).toHaveLength(6)
    expect(accionesDeGustado({ ...base, ciudades: [] }).no_cubiertas[0].por_que).toContain('no dice la ciudad')
  })
  it('segunda pasada: pide el perfil (seguidores) de las cuentas que salieron y aún no se conocen; no pide las propias ni las ya conocidas', () => {
    const h = filaHashtag('guayaquil', [post('nueva', 300, 20), post('conocida', 500, 10), post('propia', 400, 10), post('floja', 3, 1)])
    const perfiles = filaPerfiles([['conocida', 2000]])
    const a = accionesDeGustado({ ...base, ahora: LUNES, ciudades: ['Guayaquil'], filas: [h, perfiles] as never, handlesPropios: ['propia'] })
    expect(a.acciones).toHaveLength(1)
    expect(a.acciones[0].params).toMatchObject({ usernames: ['nueva'], resultsType: 'details', _brazo: 'gustado:perfiles' })
    // los perfiles pesan ≈ 70 mil caracteres cada uno: de a dos por llamada
    const muchas = filaHashtag('guayaquil', ['a', 'b', 'c', 'd', 'e'].map((c, i) => post(c, 500 - i, 10)))
    const lotes = accionesDeGustado({ ...base, ahora: LUNES, ciudades: ['Guayaquil'], filas: [muchas] as never }).acciones
    expect(lotes.map((x) => (x.params.usernames as string[]).length)).toEqual([PERFILES_POR_LLAMADA, PERFILES_POR_LLAMADA, 1])
    // una cuenta ya pedida que no devolvió seguidores (privada, borrada) no se vuelve a pedir
    const pedidaSinRespuesta = { ...filaPerfiles([]), params: { usernames: ['nueva'], _brazo: 'gustado:perfiles' } }
    expect(accionesDeGustado({ ...base, ahora: LUNES, ciudades: ['Guayaquil'], filas: [h, perfiles, pedidaSinRespuesta] as never, handlesPropios: ['propia'] }).acciones).toHaveLength(0)
    // si ya se conocen todas, no se pide nada
    expect(accionesDeGustado({ ...base, ahora: LUNES, ciudades: ['Guayaquil'], filas: [h, filaPerfiles([['nueva', 900], ['conocida', 2000]])] as never, handlesPropios: ['propia'] }).acciones).toHaveLength(0)
  })
  it('entra al plan solo con su interruptor encendido y respeta el tope diario de los brazos', () => {
    const cliente = { id: CL, name: 'X', industry: 'restaurante de mariscos', country: 'Ecuador', market: 'Guayaquil', config: {} }
    expect(accionesDeBrazos({ brazos: BRAZOS_APAGADOS, cliente, ahora: JUEVES, ciudad: 'Guayaquil' }).acciones).toHaveLength(0)
    const on = accionesDeBrazos({ brazos: { ...BRAZOS_APAGADOS, gustado: true }, cliente, ahora: JUEVES, ciudad: 'Guayaquil' })
    expect(on.acciones.map((a) => a.fuente)).toEqual(['gustado', 'gustado', 'gustado'])
    expect(accionesDeBrazos({ brazos: { ...BRAZOS_APAGADOS, gustado: true }, cliente, ahora: JUEVES, ciudad: 'Guayaquil', topeDiarioUsd: 0.01 }).no_cubiertas[0].por_que).toContain('tope diario')
    expect(brazosDelEntorno({ PORTERO_BRAZO_GUSTADO: 'on' }).gustado).toBe(true)
    expect(brazosDelEntorno({}).gustado).toBe(false)
    expect(hayBrazoActivo({ ...BRAZOS_APAGADOS, gustado: true })).toBe(true)
  })
})

describe('fichas: lo más gustado, tendencias y lo propio', () => {
  const items: Fila[] = [
    ...[1, 2, 3, 4].map((i) => post(`cuentav${i}`, 400 + i * 10, 20, { type: 'Video', caption: `¿Te animas a probar los langostinos de hoy? ${i}` })),
    post('cuentaf1', 300, 15, { caption: 'Combo de ceviche a $9.50 para dos' }),
    post('cuentaf2', 250, 12, { type: 'Sidecar', caption: 'Nuestro nuevo menú del día' }),
    post('gigante', 9000, 400, { caption: 'Marca grande' }),
    post('fuera', 3, 0),
  ]
  const perfiles = filaPerfiles([['cuentav1', 2000], ['cuentav2', 2500], ['cuentav3', 3000], ['cuentav4', 4000], ['cuentaf1', 1500], ['cuentaf2', 1800], ['gigante', 900_000]])
  const propia = { id: 'mi', apify_function: 'instagram_scraper', ensayo: false, created_at: '2026-10-28T09:00:00Z', params: {}, respuesta: [{ username: 'micasa', followersCount: 1200, latestPosts: [post('micasa', 80, 4, { shortCode: 'm1' }), post('micasa', 200, 30, { shortCode: 'm2', type: 'Video' }), post('micasa', 5, 0, { shortCode: 'm3' })] }] }
  const entrada = { client_id: CL, nombre: 'Casa de Prueba', terminos: ['restaurante mariscos'], ciudades: ['Guayaquil'], ahora: JUEVES, filas: [filaHashtag('guayaquil', items), perfiles, propia] as never, handlesPropios: ['micasa'] }

  it('«Lo más gustado»: las mejores con cuenta, likes, comentarios, fecha y enlace; la medida a la vista; la cuenta gigante no gana', () => {
    const r = fichasDeGustado(entrada)
    expect(r.estado).toBe('listo')
    const f = r.fichas.find((x) => x.clase === 'lo_mas_gustado')!
    expect(f).toMatchObject({ alcance: 'mercado', origen: 'tercero', decision: 'reemplaza', atributo: 'gustado:mercado:restaurante-mariscos:guayaquil', brazo: 'gustado' })
    expect(f.titulo).toBe('Lo más gustado por el público · restaurante mariscos · Guayaquil')
    expect(f.contenido).toContain('Medida: gusto = (likes + comentarios) ÷ seguidores')
    expect(f.contenido).toContain('https://www.instagram.com/p/cuentav1-410-20/')
    expect(f.contenido).toMatch(/1\. @cuentav\d · video o reel · \d+ likes \+ 20 comentarios · [\d. ]+ seguidores · gusto [\d,]+ % · 2026-10-20/)
    const pubs = (f.datos as { publicaciones: Array<{ cuenta: string }> }).publicaciones
    expect(pubs.length).toBeLessThanOrEqual(TOP_DE_GUSTADO)
    expect(pubs.find((p) => p.cuenta === 'fuera')).toBeUndefined()
    expect(pubs[0].cuenta).not.toBe('gigante')
    expect(pubs[pubs.length - 1].cuenta).toBe('gigante') // 9.400 ÷ 900.000: la última de las que tienen medida
    for (const c of new Set(pubs.map((p) => p.cuenta))) expect(pubs.filter((p) => p.cuenta === c).length).toBeLessThanOrEqual(MAX_POR_CUENTA)
    expect(f.contenido).toMatch(/de \d+ cuentas \(de los últimos 180 días, hasta 2 por cuenta/)
    expect(f.contenido).not.toMatch(/@juan/)
  })
  it('«Tendencia»: cuando un mismo tipo se repite (≥3 de las 10); no hay tendencia donde nada se repite', () => {
    const t = fichasDeGustado(entrada).fichas.filter((x) => x.clase === 'tendencia_del_publico')
    const titulos = t.map((x) => x.titulo)
    expect(titulos.some((x) => x.includes('formato: video'))).toBe(true)
    expect(titulos.some((x) => x.includes('gancho: pregunta'))).toBe(true)
    expect(t.find((x) => x.titulo.includes('formato: video'))!.contenido).toContain('4 de las 7 más gustadas son video o reel')
    for (const x of t) expect(x).toMatchObject({ alcance: 'mercado', decision: 'reemplaza' })
    const pocas = fichasDeGustado({ ...entrada, filas: [filaHashtag('guayaquil', [post('a', 100, 5), post('b', 90, 5, { type: 'Video' })]), filaPerfiles([['a', 1000], ['b', 1000]])] as never })
    expect(pocas.fichas.filter((x) => x.clase === 'tendencia_del_publico')).toHaveLength(0)
  })
  it('lo propio: sus publicaciones que más gustaron (alcance cliente)', () => {
    const p = fichasDeGustado(entrada).fichas.find((x) => x.clase === 'lo_mas_gustado_propio')!
    expect(p).toMatchObject({ alcance: 'cliente', atributo: 'gustado:propias' })
    expect(p.contenido.indexOf('micasa-200-30')).toBeLessThan(p.contenido.indexOf('micasa-80-4'))
    expect(p.contenido).not.toContain('micasa-5-0') // 5 interacciones: ruido
  })
  it('lo que falta se DICE: sin corrida de hashtags, sin lectura propia', () => {
    const r = fichasDeGustado({ ...entrada, filas: [] as never })
    expect(r.estado).toBe('sin_material')
    expect(r.declarado.join(' ')).toContain('todavía no hay una corrida de hashtags')
    expect(r.declarado.join(' ')).toContain('no hay una lectura reciente de las publicaciones de la cuenta propia')
    // una corrida de hace más de 14 días ya no cuenta
    expect(fichasDeGustado({ ...entrada, filas: [filaHashtag('guayaquil', items, '2026-09-01T10:00:00Z')] as never }).fichas.filter((x) => x.clase === 'lo_mas_gustado')).toHaveLength(0)
  })
  it('las del mismo rubro de OTRAS ciudades no se mezclan', () => {
    const r = fichasDeGustado({ ...entrada, ciudades: ['Guayaquil', 'Olón'], filas: [filaHashtag('guayaquil', items), filaHashtag('olon', [post('soloolon', 200, 10)], '2026-10-29T10:00:00Z', ['mariscosolon']), perfiles, filaPerfiles([['soloolon', 1000]])] as never })
    const g = r.fichas.find((x) => x.atributo.endsWith(':guayaquil') && x.clase === 'lo_mas_gustado')!
    const o = r.fichas.find((x) => x.atributo.endsWith(':olon') && x.clase === 'lo_mas_gustado')!
    expect(g.contenido).not.toContain('soloolon')
    expect(o.contenido).toContain('soloolon')
    expect(o.contenido).not.toContain('cuentav1')
  })
})

describe('corrida completa: se archivan y se renuevan sin duplicar', () => {
  const items: Fila[] = [...[1, 2, 3].map((i) => post(`v${i}`, 300 + i, 10, { type: 'Video', caption: 'Langostinos frescos hoy' })), post('f1', 200, 10)]
  const tablas = () => ({
    clients: [{ id: CL, name: 'Casa de Prueba', slug: 'casa', industry: 'restaurante de mariscos', country: 'Ecuador', market: 'Guayaquil', config: { apify: { own_handles: { instagram: 'micasa' }, ciudades_de_gusto: ['Guayaquil'] } } }],
    client_sedes: [] as Fila[], client_sede_datos: [] as Fila[],
    apify_raw: [{ ...filaHashtag('guayaquil', items), client_id: CL }, { ...filaPerfiles([['v1', 1000], ['v2', 1000], ['v3', 1000], ['f1', 800]]), client_id: CL }] as Fila[],
    cerebro_fichas: [] as Fila[], cerebro_ingresos: [] as Fila[],
  })
  const cliente = { id: CL, name: 'Casa de Prueba', slug: 'casa', industry: 'restaurante de mariscos', country: 'Ecuador', market: 'Guayaquil', config: { apify: { own_handles: { instagram: 'micasa' }, ciudades_de_gusto: ['Guayaquil'] } } }
  const correr = (t: ReturnType<typeof tablas>, base: ReturnType<typeof crearBaseFalsa>, ahora: Date) => correrBrazos({ db: base.db, brazos: { ...BRAZOS_APAGADOS, gustado: true }, cliente, client_id: CL, filas: [], ahora, dry_run: false, ciudad: 'Guayaquil' })

  it('archiva las notas (consultables por clase) y una segunda corrida igual no duplica; otra semana reemplaza', async () => {
    const t = tablas()
    const base = crearBaseFalsa(t as never)
    const r = await correr(t, base, JUEVES)
    expect(r.errores).toEqual([])
    expect(r.por_brazo.gustado?.estado).toBe('listo')
    const vivas = () => t.cerebro_fichas.filter((f) => !f.retirada_en)
    expect(vivas().filter((f) => f.clase === 'lo_mas_gustado')).toHaveLength(1)
    expect(vivas().find((f) => f.clase === 'tendencia_del_publico')).toBeDefined()
    expect(vivas().find((f) => f.clase === 'lo_mas_gustado')).toMatchObject({ propiedad: 'ajena', juzgado_por: 'regla', alcance: 'mercado' })
    const n = t.cerebro_fichas.length
    await correr(t, base, new Date('2026-10-29T18:00:00Z'))
    expect(t.cerebro_fichas.length).toBe(n)
    // una semana después, con otro ranking: la nueva reemplaza (la vieja queda retirada, no borrada)
    t.apify_raw.push({ ...filaHashtag('guayaquil', [post('nuevo', 900, 50)], '2026-11-05T10:00:00Z'), client_id: CL }, { ...filaPerfiles([['nuevo', 1000]], '2026-11-05T11:00:00Z'), client_id: CL })
    await correr(t, base, new Date('2026-11-05T15:00:00Z'))
    expect(vivas().filter((f) => f.clase === 'lo_mas_gustado')).toHaveLength(1)
    expect(t.cerebro_fichas.filter((f) => f.clase === 'lo_mas_gustado' && f.retirada_en)).toHaveLength(1)
  })
  it('en seco no escribe nada', async () => {
    const t = tablas()
    const base = crearBaseFalsa(t as never)
    const r = await correrBrazos({ db: base.db, brazos: { ...BRAZOS_APAGADOS, gustado: true }, cliente, client_id: CL, filas: [], ahora: JUEVES, dry_run: true, ciudad: 'Guayaquil' })
    expect(r.errores).toEqual([])
    expect(base.escrituras).toEqual([])
  })
})
