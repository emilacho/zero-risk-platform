/**
 * NUEVOS BRAZOS DEL CEREBRO (15-oct) · US$ 0, sin red, sin modelo. Cada brazo: contexto · demanda · competencia · propios + el archivo común.
 * Reglas que se prueban: apagados por omisión (el plan y el ciclo quedan IGUALES), alcance (un competidor nunca es una cifra del cliente), nada se borra, idempotencia,
 * sin datos personales de terceros, la llave del cliente nunca sale en un texto, y 3 rubros con tuteo y voseo.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { alimentarCliente } from '../alimentar'
import { descubrir } from '../plan'
import { BRAZOS_APAGADOS, brazosDelEntorno, accionesDeBrazos, correrBrazos, type BrazosActivos } from '../brazos'
import { archivarFichasDeBrazos, huellaDeFicha } from '../brazos/archivo'
import { CATALOGO_DE_CONTEXTO, fichasDeContexto, feriadosDe, pascua } from '../brazos/contexto'
import { accionDeDemanda, DIA_DE_DEMANDA, fichasDeDemanda, terminosDeDemanda } from '../brazos/demanda'
import { accionesDeCompetencia, competidoresConfirmados, competidoresDelDia, diaDeCompetidor, fichasDeCompetencia } from '../brazos/competencia'
import { brazoDePropios, credencialesDe, leerMeta, leerVentasDeLoyverse, mesesCerradosHasta, resumirVentas, type Fetch } from '../brazos/propios'
import { crearBaseFalsa } from './base-falsa'
import { ALTA, CASOS, ON, REAL, tablas } from './fixtures-despertar'
import { idDeZona, paisIsoDe } from '../../cerebro/zona'
import { confirmarCompetidores, guardarCompetidoresConfirmados } from '../brazos/confirmar'

const MIERCOLES = new Date('2026-10-14T12:00:00Z')
const JUEVES = new Date('2026-10-15T15:00:00Z')
const TODOS: BrazosActivos = { contexto: true, demanda: true, competencia: true, propios: true, gustado: false }
const CL = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const FAMILIA: Record<string, string[]> = { '11111111-1111-4111-8111-111111111111': ['salud'], '22222222-2222-4222-8222-222222222222': ['automotriz'], '33333333-3333-4333-8333-333333333333': ['software'] }

describe('interruptores · todo apagado por omisión', () => {
  it('sin variables, ningún brazo está encendido; solo «on» exacto enciende', () => {
    expect(brazosDelEntorno({})).toEqual(BRAZOS_APAGADOS)
    expect(brazosDelEntorno({ PORTERO_BRAZO_DEMANDA: 'true', PORTERO_BRAZO_CONTEXTO: '1', PORTERO_BRAZO_PROPIOS: 'ON' })).toEqual({ contexto: false, demanda: false, competencia: false, propios: true, gustado: false })
  })
  it('las dos rutas de producción leen el entorno (nada está encendido «de fábrica»)', () => {
    const raiz = path.resolve(__dirname, '../../../..')
    for (const r of ['procesar', 'descubrir']) {
      const t = fs.readFileSync(path.join(raiz, 'src/app/api/brain/alimentar', r, 'route.ts'), 'utf8')
      expect(t, r).toMatch(/brazos: brazosDelEntorno\(\)/)
    }
  })
  it('ningún módulo de los brazos llama a un modelo (US$ 0 de modelo)', () => {
    const dir = path.resolve(__dirname, '../brazos')
    // el modelo SOLO entra por la función inyectada, y solo el juez de competencia y quien lo orquesta la nombran
    const PUEDEN_NOMBRAR_EL_MODELO = new Set(['juez-competencia.ts', 'sistematica.ts', 'index.ts'])
    for (const f of fs.readdirSync(dir)) {
      const t = fs.readFileSync(path.join(dir, f), 'utf8')
      expect(t, f).not.toMatch(/anthropic|openai|api\.openai|claude-/i)
      if (!PUEDEN_NOMBRAR_EL_MODELO.has(f)) expect(t, f).not.toMatch(/llamarModelo|llamar\(/)
    }
  })
  it('con los brazos apagados el PLAN es idéntico al de siempre (3 rubros)', () => {
    for (const c of CASOS) {
      const entrada = { cliente: { id: c.id, name: c.nombre, website_url: c.web, config: { apify: { own_handles: { instagram: c.ig } } } }, rubro: c.rubro, pais: c.pais, ciudad: c.ciudad, publicaciones_propias: [], gastado_hoy_usd: 0, interruptores: ON }
      expect(descubrir({ ...entrada, brazos: BRAZOS_APAGADOS, ahora: MIERCOLES })).toEqual(descubrir(entrada))
    }
  })
})

describe('el plan con los brazos encendidos', () => {
  const c = CASOS[0]
  const entrada = { cliente: { id: c.id, name: c.nombre, website_url: c.web, config: { apify: { own_handles: { instagram: c.ig }, competitor_list: [{ name: 'Rival Uno', competitor_type: 'direct' }], competidores_confirmados: { en: '2026-10-15', nombres: ['Rival Uno'] } } } }, rubro: c.rubro, pais: 'Ecuador', ciudad: c.ciudad, publicaciones_propias: [], gastado_hoy_usd: 0, interruptores: ON }
  it('demanda: el miércoles pide la búsqueda sin marca (marcada `_brazo`); el jueves no', () => {
    const mie = descubrir({ ...entrada, brazos: { ...BRAZOS_APAGADOS, demanda: true }, ahora: MIERCOLES })
    const a = mie.hacer.find((x) => x.fuente === 'demanda')
    expect(a?.funcion).toBe('google_maps_scraper')
    expect(a?.params._brazo).toBe('demanda')
    expect(a?.metadata.target_kind).toBe('third_party')
    expect(descubrir({ ...entrada, brazos: { ...BRAZOS_APAGADOS, demanda: true }, ahora: JUEVES }).hacer.some((x) => x.fuente === 'demanda')).toBe(false)
  })
  it('competencia: el día del competidor confirmado pide sus funciones; sin confirmar, no pide nada y lo dice', () => {
    const lunes = new Date('2026-10-12T12:00:00Z')
    const plan = descubrir({ ...entrada, brazos: { ...BRAZOS_APAGADOS, competencia: true }, ahora: lunes })
    expect(plan.hacer.filter((x) => x.fuente === 'competencia').map((x) => x.funcion)).toEqual(['google_maps_scraper', 'facebook_ads_library_scraper'])
    const sin = descubrir({ ...entrada, cliente: { ...entrada.cliente, config: { apify: { own_handles: { instagram: c.ig }, competitor_list: [{ name: 'Rival Uno' }] } } }, brazos: { ...BRAZOS_APAGADOS, competencia: true }, ahora: lunes })
    expect(sin.hacer.some((x) => x.fuente === 'competencia')).toBe(false)
    expect(sin.no_cubiertas.some((n) => n.fuente === 'competencia' && /todavía no hay competidores vigilados/.test(n.por_que))).toBe(true)
  })
})

describe('BRAZO · contexto (feriados y temporada)', () => {
  it('la Pascua y los feriados móviles de Ecuador 2026 (Carnaval 16-17 feb · Viernes Santo 3 abr)', () => {
    expect(pascua(2026).toISOString().slice(0, 10)).toBe('2026-04-05')
    const f = Object.fromEntries(feriadosDe('ec', 2026).map((x) => [x.nombre, x.fecha]))
    expect(f['Carnaval (lunes)']).toBe('2026-02-16')
    expect(f['Carnaval (martes)']).toBe('2026-02-17')
    expect(f['Viernes Santo']).toBe('2026-04-03')
    expect(f['Día de Difuntos']).toBe('2026-11-02')
  })
  it('desde el 15-oct, 120 días: los feriados y temporadas que caen dentro, sin cliente, con alcance «zona»', () => {
    const r = fichasDeContexto({ pais: 'EC', ahora: JUEVES })
    expect(r.estado).toBe('listo')
    const refs = r.fichas.map((f) => f.ref)
    expect(refs).toContain('brazo:contexto:ec:feriado:2026-11-02')
    expect(refs).toContain('brazo:contexto:ec:feriado:2026-12-25')
    expect(refs).toContain('brazo:contexto:ec:feriado:2027-01-01')
    expect(refs.some((x) => x.includes('feriado:2026-10-09'))).toBe(false) // ya pasó
    expect(refs.some((x) => x.includes('temporada:lluvias_costa:2027'))).toBe(true)
    expect(refs.some((x) => x.includes('temporada:ballenas_jorobadas:2026'))).toBe(false) // terminó el 30-sep
    expect(refs.some((x) => x.includes('temporada:vacaciones_escolares_sierra:2027'))).toBe(false) // empieza en julio: fuera de los 120 días
    for (const f of r.fichas) {
      expect(f.client_id).toBe('zona:ec')
      expect(f.alcance).toBe('zona')
      expect(f.origen).toBe('tercero')
    }
    // el traslado por decreto se DECLARA, no se calcula
    expect(r.fichas.find((f) => f.ref.endsWith('2026-11-02'))!.contenido).toMatch(/trasladarlo al lunes o al viernes por decreto/)
  })
  it('un país que el catálogo no tiene: «sin material» y lo dice (no inventa)', () => {
    const r = fichasDeContexto({ pais: 'zz', ahora: JUEVES })
    expect(r.estado).toBe('sin_material')
    expect(r.fichas).toEqual([])
    expect(r.declarado[0]).toMatch(/sin catálogo/)
  })
  it('agnóstico: un país nuevo es UNA entrada del catálogo (sin tocar la lógica)', () => {
    CATALOGO_DE_CONTEXTO.xx = { nombre: 'Pruebalandia', feriados_fijos: [{ mes: 11, dia: 20, nombre: 'Día de la Prueba' }], feriados_moviles: [], temporadas: [], aviso_de_feriados: 'Fecha legal.' }
    try {
      const r = fichasDeContexto({ pais: 'xx', ahora: JUEVES })
      expect(r.fichas.map((f) => f.client_id)).toEqual(['zona:xx'])
    } finally { delete CATALOGO_DE_CONTEXTO.xx }
  })
  it('el país sale de la ficha (código o nombre o mercado), nunca se adivina', () => {
    expect(paisIsoDe('Ecuador')).toBe('ec')
    expect(paisIsoDe('EC')).toBe('ec')
    expect(paisIsoDe(null, 'Olón, Santa Elena, Ecuador')).toBe('ec')
    expect(paisIsoDe('Narnia')).toBeNull()
    expect(idDeZona('EC')).toBe('zona:ec')
  })
})

describe('BRAZO · demanda y posición', () => {
  it('los términos: lo que declara el dueño primero, luego el rubro limpio y el genérico de su familia (≤ 3, sin repetir) · 3 rubros', () => {
    for (const c of CASOS) {
      const t = terminosDeDemanda({ rubro: c.rubro, familias: FAMILIA[c.id] })
      expect(t.length).toBeGreaterThanOrEqual(1)
      expect(t.length).toBeLessThanOrEqual(3)
      expect(new Set(t.map((x) => x.toLowerCase())).size).toBe(t.length)
    }
    expect(terminosDeDemanda({ rubro: 'restaurante de mariscos costero ecuatoriano', config: { apify: { terminos_de_demanda: ['ceviche', 'encebollado'] } }, familias: ['comida'] })).toEqual(['ceviche', 'encebollado', 'restaurante mariscos'])
  })
  it('solo los miércoles (UTC), con ciudad y términos; sin ciudad se declara y no se paga', () => {
    const t = ['ceviche', 'restaurante']
    expect(accionDeDemanda({ ahora: JUEVES, terminos: t, ciudad: 'Olón' }).accion).toBeNull()
    const a = accionDeDemanda({ ahora: MIERCOLES, terminos: t, ciudad: 'Olón' })
    expect(MIERCOLES.getUTCDay()).toBe(DIA_DE_DEMANDA)
    expect(a.accion?.funcion).toBe('google_maps_scraper')
    expect(a.accion?.params).toMatchObject({ searchStringsArray: t, locationQuery: 'Olón', resultsLimit: 15, _brazo: 'demanda' })
    expect(a.accion!.usd_max).toBeGreaterThanOrEqual(45 * 0.003) // lo medido el 15-oct: 45 lugares = US$ 0,135
    expect(accionDeDemanda({ ahora: MIERCOLES, terminos: t }).no_cubierta).toMatch(/sin ciudad ni mercado/)
  })
  const fila = (items: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) => ({ id: 'r1', apify_function: 'google_maps_scraper', ensayo: false, created_at: '2026-10-14T13:00:00.000Z', params: { searchStringsArray: ['ceviche'], _brazo: 'demanda' }, respuesta: items, ...extra })
  const lug = (rank: number, title: string, p: number, n: number, term = 'ceviche') => ({ searchString: term, rank, title, totalScore: p, reviewsCount: n, url: `https://maps.example/${rank}` })
  it('dice en qué puesto sale el cliente, quién va primero, y sugiere a los demás como competidores SIN vigilarlos', () => {
    const r = fichasDeDemanda({ client_id: CL, nombreDelCliente: 'Náufrago', ahora: JUEVES, ciudad: 'Olón', yaConocidos: ['Náufrago', 'Rasimar Restaurante'], filas: [fila([lug(1, 'Ceviches Don Villón', 4.8, 10), lug(2, 'Rasimar Restaurante', 4.5, 80), lug(3, 'Maximo 21-8', 5, 19), lug(4, 'Naufrago', 4.8, 26)])] })
    const pos = r.fichas.find((f) => f.clase === 'mercado_posicion')!
    expect(pos.contenido).toMatch(/Náufrago aparece en el puesto 4 según Maps \(se leyeron 4 resultados\)/)
    expect(pos.contenido).toMatch(/primero: «Ceviches Don Villón»/)
    expect(pos.alcance).toBe('mercado')
    const sug = r.fichas.filter((f) => f.clase === 'competidor_sugerido')
    expect(sug.map((s) => s.sobre).sort()).toEqual(['Ceviches Don Villón', 'Maximo 21-8'])
    for (const s of sug) { expect(s.alcance).toBe('competidor'); expect(s.contenido).toMatch(/NO se vigila hasta que el dueño lo confirme/) }
  })
  it('si no aparece lo dice (no lo lee como puesto cero) y los ensayos y las filas sin marca no cuentan', () => {
    const sinNosotros = fichasDeDemanda({ client_id: CL, nombreDelCliente: 'Náufrago', ahora: JUEVES, filas: [fila([lug(1, 'Otro', 4, 3)])] })
    expect(sinNosotros.fichas.find((f) => f.clase === 'mercado_posicion')!.contenido).toMatch(/NO aparece entre los 1 resultados leídos/)
    expect(fichasDeDemanda({ client_id: CL, nombreDelCliente: 'N', ahora: JUEVES, filas: [fila([lug(1, 'X', 4, 3)], { ensayo: true })] }).estado).toBe('sin_material')
    expect(fichasDeDemanda({ client_id: CL, nombreDelCliente: 'N', ahora: JUEVES, filas: [fila([lug(1, 'X', 4, 3)], { params: { searchStringsArray: ['x'] } })] }).estado).toBe('sin_material')
    expect(fichasDeDemanda({ client_id: CL, nombreDelCliente: 'N', ahora: JUEVES, filas: [fila([lug(1, 'X', 4, 3)], { params: { _brazo: 'otra:cosa' } })] }).estado).toBe('sin_material')
    const vacia = fichasDeDemanda({ client_id: CL, nombreDelCliente: 'N', ahora: JUEVES, filas: [fila([])] })
    expect(vacia.declarado[0]).toMatch(/no trajo lugares/)
  })
})

describe('BRAZO · competencia vigilada', () => {
  const lista = (nombres?: string[]) => ({
    apify: {
      competitor_list: [
        { name: "Cabaña D'Jerry", website: 'https://www.tripadvisor.com/Restaurant_Review-g1', competitor_type: 'direct' },
        { name: 'Rasimar Restaurante', website: 'https://rasimar.example', competitor_type: 'direct', instagram: '@rasimar.ok' },
        { name: 'Pigro', website: 'https://restaurantguru.com/Pigro-Olon', competitor_type: 'indirect' },
        { name: 'Almacígo', competitor_type: 'alternative' },
      ],
      ...(nombres ? { competidores_confirmados: { en: '2026-10-15T10:00:00Z', nombres } } : {}),
    },
  })
  it('sin confirmación del dueño NO hay competidores vigilados (y se dice)', () => {
    const r = competidoresConfirmados(lista())
    expect(r.vigilados).toEqual([])
    expect(r.motivo).toMatch(/dueño todavía no confirmó/) // la lista del dueño sola: sin confirmación no hay vigilados
    expect(r.sin_confirmar).toHaveLength(4)
    expect(accionesDeBrazos({ brazos: { ...BRAZOS_APAGADOS, competencia: true }, cliente: { id: CL, config: lista(), market: 'Olón, Ecuador' }, ciudad: 'Olón', ahora: MIERCOLES }).acciones).toEqual([])
  })
  it('solo los confirmados, directos primero, uno por día lunes-viernes, nada el fin de semana', () => {
    const r = competidoresConfirmados(lista(['Rasimar Restaurante', "Cabaña D'Jerry", 'Pigro']))
    expect(r.vigilados.map((c) => c.nombre)).toEqual(["Cabaña D'Jerry", 'Rasimar Restaurante', 'Pigro'])
    expect(r.sin_confirmar).toEqual(['Almacígo'])
    expect(r.vigilados.map((_, i) => diaDeCompetidor(i))).toEqual([1, 2, 3])
    const dia = (n: number) => new Date(Date.UTC(2026, 9, 11 + n, 12)) // 11-oct es domingo
    expect(competidoresDelDia(r.vigilados, dia(0))).toEqual([]) // domingo
    expect(competidoresDelDia(r.vigilados, dia(1)).map((c) => c.nombre)).toEqual(["Cabaña D'Jerry"])
    expect(competidoresDelDia(r.vigilados, dia(6))).toEqual([]) // sábado
  })
  it('tope de 5 vigilados', () => {
    const muchos = { apify: { competitor_list: Array.from({ length: 8 }, (_, i) => ({ name: `Comp ${i}`, competitor_type: 'direct' })), competidores_confirmados: { en: '2026-10-15', nombres: Array.from({ length: 8 }, (_, i) => `Comp ${i}`) } } }
    const r = competidoresConfirmados(muchos)
    expect(r.vigilados).toHaveLength(5)
    expect(new Set(r.vigilados.map((_, i) => diaDeCompetidor(i))).size).toBe(5)
  })
  it('las acciones: Maps siempre; Instagram solo con cuenta; anuncios siempre; sitio SOLO si la web es propia (no un directorio) · costo del día acotado', () => {
    const v = competidoresConfirmados(lista(['Rasimar Restaurante', "Cabaña D'Jerry", 'Pigro'])).vigilados
    const rasimar = accionesDeCompetencia({ vigilados: v, ahora: new Date('2026-10-13T12:00:00Z'), ciudad: 'Olón', pais: 'ec' }) // martes
    expect(rasimar.map((a) => a.funcion)).toEqual(['google_maps_scraper', 'instagram_scraper', 'facebook_ads_library_scraper', 'competitor_website_scraper'])
    expect(rasimar.every((a) => a.metadata.target_kind === 'third_party')).toBe(true)
    expect(String(rasimar[0].params._brazo)).toBe('competencia:rasimar-restaurante:mapas')
    expect(rasimar[2].params).toMatchObject({ countryCode: 'EC', maxItems: 20 })
    // 31-oct «guardar todo»: el sitio del competidor puede leer hasta 50 páginas (máx. US$ 0,60); lo demás sigue acotado
    expect(rasimar.find((a) => a.funcion === 'competitor_website_scraper')?.params).toMatchObject({ maxCrawlPages: 50, maxCrawlDepth: 10 })
    expect(rasimar.find((a) => a.funcion === 'google_maps_scraper')?.params).toMatchObject({ maxImages: 10 })
    expect(rasimar.reduce((s, a) => s + a.usd_max, 0)).toBeLessThan(1)
    const jerry = accionesDeCompetencia({ vigilados: v, ahora: new Date('2026-10-12T12:00:00Z'), ciudad: 'Olón', pais: 'ec' }) // lunes · su web es Tripadvisor
    expect(jerry.map((a) => a.funcion)).toEqual(['google_maps_scraper', 'facebook_ads_library_scraper'])
    const pigro = accionesDeCompetencia({ vigilados: v, ahora: new Date('2026-10-14T12:00:00Z'), ciudad: 'Olón', pais: 'ec' }) // miércoles · restaurantguru
    expect(pigro.some((a) => a.funcion === 'competitor_website_scraper')).toBe(false)
  })
  const vig = competidoresConfirmados(lista(['Rasimar Restaurante', "Cabaña D'Jerry"])).vigilados
  const f = (slug: string, tipo: string, funcion: string, respuesta: unknown, extra: Record<string, unknown> = {}) => ({ id: `${slug}-${tipo}`, apify_function: funcion, ensayo: false, created_at: '2026-10-13T13:00:00.000Z', params: { _brazo: `competencia:${slug}:${tipo}` }, respuesta, ...extra })
  it('las fichas: alcance competidor, nombre en el texto, sin usuarios ni autores, y un homónimo de Mapas no entra', () => {
    const r = fichasDeCompetencia({
      client_id: CL, vigilados: vig, filas: [
        f('rasimar-restaurante', 'mapas', 'google_maps_scraper', [{ title: 'Rasimar Restaurante', totalScore: 4.5, reviewsCount: 61, categoryName: 'Marisquería', address: 'Olón' }]),
        f('rasimar-restaurante', 'instagram', 'instagram_scraper', [{ username: 'rasimar.ok', followersCount: 1200, postsCount: 80, latestPosts: [{ caption: 'Gracias @cliente_feliz por venir, @amigo2 también' }] }]),
        f('rasimar-restaurante', 'anuncios', 'facebook_ads_library_scraper', [{ error: 'no_items', errorDescription: 'Empty or private data for provided input' }]),
        f('rasimar-restaurante', 'sitio', 'competitor_website_scraper', [{ url: 'https://rasimar.example/carta', text: 'Ceviche mixto $9,50\nEncebollado $4,00\nBienvenidos a nuestra casa en la playa' }]),
        f('cabana-d-jerry', 'mapas', 'google_maps_scraper', [{ title: 'Cabaña de otra ciudad Hotel', totalScore: 3, reviewsCount: 2 }]),
      ],
    })
    const por = Object.fromEntries(r.fichas.map((x) => [x.clase, x]))
    expect(por.competidor_mapas.contenido).toMatch(/«Rasimar Restaurante» \(competidor\) en Google Maps: puntaje 4,5, 61 reseñas/)
    expect(por.competidor_instagram.contenido).toMatch(/1200 seguidores/)
    expect(por.competidor_instagram.contenido).not.toMatch(/@cliente_feliz|@amigo2/)
    expect(por.competidor_anuncios.contenido).toMatch(/0 anuncios/)
    expect(por.competidor_precios.contenido).toMatch(/\$9,50|9 50|9,50/)
    expect(por.competidor_precios.contenido).not.toMatch(/bienvenidos/i)
    for (const x of r.fichas) { expect(x.alcance).toBe('competidor'); expect(x.contenido).toMatch(/competidor/i); expect(x.contenido).toMatch(/no del cliente/) }
    expect(r.fichas.some((x) => x.sobre === "Cabaña D'Jerry" && x.clase === 'competidor_mapas')).toBe(false)
    expect(r.declarado.join(' ')).toMatch(/no trajo una ficha con ese nombre/)
  })
})

describe('BRAZO · datos propios (llave del cliente)', () => {
  const TOKEN = 'tok-secreto-FALSO-123'
  const recibo = (n: number, total: number, hora: string, items: Array<[string, number, number]>, extra: Record<string, unknown> = {}) => ({ receipt_number: String(n), receipt_type: 'SALE', total_money: total, created_at: hora, line_items: items.map(([item_name, quantity, total_money]) => ({ item_name, quantity, total_money })), ...extra })
  const recibos = [
    recibo(1, 12, '2026-10-03T17:10:00Z', [['Ceviche mixto', 1, 9], ['Cerveza', 1, 3]]), // 12:10 hora local (UTC−5) · sábado
    recibo(2, 9, '2026-10-03T17:40:00Z', [['Ceviche mixto', 1, 9]]),
    recibo(3, 5, '2026-10-04T13:00:00Z', [['Encebollado', 1, 5]]),
    recibo(4, 7, '2026-10-04T13:05:00Z', [['Encebollado', 1, 5], ['Jugo', 1, 2]], { cancelled_at: '2026-10-04T14:00:00Z' }),
    recibo(5, -5, '2026-10-05T13:00:00Z', [['Encebollado', -1, -5]], { receipt_type: 'REFUND' }),
  ]
  const respuesta = (cuerpo: unknown, ok = true, status = 200) => ({ ok, status, json: async () => cuerpo })

  it('resumen: ticket medio, anuladas fuera, reembolso aparte, ítems por ingreso y horas en hora local', () => {
    const r = resumirVentas(recibos, { periodo: '2026-10' })
    expect(r).toMatchObject({ tickets: 3, ingreso: 26, reembolsos: 5, anuladas: 1, ticket_medio: 8.67 })
    expect(r.por_item[0]).toMatchObject({ item: 'Ceviche mixto', unidades: 2, ingreso: 18 })
    expect(r.por_hora[0]).toMatchObject({ hora: 12, tickets: 2 })
    expect(r.por_dia[0].dia).toBe('sábado')
  })
  it('sin llave NO es un error: «sin material» con el NOMBRE de la variable que falta, y no llama a nadie', async () => {
    let llamadas = 0
    const fetch: Fetch = async () => { llamadas++; return respuesta({}) }
    const r = await brazoDePropios({ client_id: CL, slug: 'naufrago', ahora: JUEVES, env: {}, fetch })
    expect(r.estado).toBe('sin_material')
    expect(llamadas).toBe(0)
    expect(r.detalle).toMatch(/CLIENTE_NAUFRAGO_LOYVERSE_TOKEN/)
    expect(r.detalle).toMatch(/CLIENTE_NAUFRAGO_META_TOKEN/)
    expect(credencialesDe('naufrago', {}).faltan).toContain('CLIENTE_NAUFRAGO_LOYVERSE_TOKEN')
  })
  it('con llave falsa: pagina por cursor, manda el token en la CABECERA (nunca en la URL) y la llave no sale en ninguna ficha', async () => {
    const urls: string[] = [], cabeceras: Array<Record<string, string> | undefined> = []
    const fetch: Fetch = async (url, init) => {
      urls.push(url); cabeceras.push(init?.headers)
      return respuesta(url.includes('cursor=P2') ? { receipts: recibos.slice(3) } : { receipts: recibos.slice(0, 3), cursor: 'P2' })
    }
    const r = await brazoDePropios({ client_id: CL, slug: 'Náufrago', ahora: JUEVES, env: { CLIENTE_NAUFRAGO_LOYVERSE_TOKEN: TOKEN }, fetch, config: { apify: { loyverse_mapa_de_items: { 'Ceviche mixto': 'Ceviche mixto (carta web)' } } } })
    expect(urls).toHaveLength(2)
    expect(urls.every((u) => !u.includes(TOKEN))).toBe(true)
    expect(cabeceras.every((h) => h?.Authorization === `Bearer ${TOKEN}`)).toBe(true)
    expect(urls[0]).toMatch(/created_at_min=2026-09-15T15%3A00%3A00.000Z/) // el plan de Loyverse deja leer 31 días: la ventana móvil de 30 días (cubre el mes en curso)
    expect(r.estado).toBe('listo')
    expect(JSON.stringify(r)).not.toContain(TOKEN)
    const ingreso = r.fichas.find((x) => x.atributo === 'metrica:loyverse:ingreso:2026-10')!
    expect(ingreso.contenido).toMatch(/no es margen/)
    expect(ingreso.metrica).toMatchObject({ valor: 26 })
    expect(r.fichas.find((x) => x.atributo.startsWith('metrica:loyverse:items:'))!.contenido).toMatch(/Ceviche mixto \(carta web\)/)
    for (const x of r.fichas) { expect(x.alcance).toBe('cliente'); expect(x.decision).toBe('reemplaza'); expect(x.origen).toBe('plataforma') }
  })
  it('un error de la llave (401) se DICE con su código; no se lee como «sin ventas»', async () => {
    const r = await leerVentasDeLoyverse({ token: TOKEN, ahora: JUEVES, fetch: async () => respuesta({ error: 'x' }, false, 401) })
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/401.*no sirve/) })
    const caido = await leerVentasDeLoyverse({ token: TOKEN, ahora: JUEVES, fetch: async () => { throw new Error(`fallo con ${TOKEN} adentro`) } })
    expect(JSON.stringify(caido)).not.toContain(TOKEN)
  })
  it('si hay más de 5.000 recibos el mes en curso se declara incompleto y no se archiva', async () => {
    const fetch: Fetch = async () => respuesta({ receipts: [recibo(1, 1, '2026-10-03T17:10:00Z', [])], cursor: 'sigue' })
    const v = await leerVentasDeLoyverse({ token: TOKEN, ahora: JUEVES, fetch })
    expect(v.ok && v.recortado).toBe(true)
    // el único mes leído quedó a medias: NO se archiva como si fuera completo
    const r = await brazoDePropios({ client_id: CL, slug: 'naufrago', ahora: JUEVES, env: { CLIENTE_NAUFRAGO_LOYVERSE_TOKEN: TOKEN }, fetch, mesesCerrados: new Set(mesesCerradosHasta(JUEVES)) })
    expect(r.fichas).toEqual([])
    expect(r.declarado.join(' ')).toMatch(/incompleto/)
  })
  it('Meta: token en cabecera; un error se dice sin la llave; sin gasto no inventa cifras', async () => {
    const urls: string[] = []
    const ok: Fetch = async (u) => { urls.push(u); return u.includes('/insights') ? respuesta({ data: [{ spend: '12.5', impressions: '1000', reach: '800', clicks: '40', ctr: '4', cpc: '0.31', actions: [{ action_type: 'lead', value: '3' }] }] }) : respuesta({ followers_count: 321, media_count: 54 }) }
    const m = await leerMeta({ token: TOKEN, adAccountId: '123', igUserId: '987', fetch: ok })
    expect(urls.every((u) => !u.includes(TOKEN))).toBe(true)
    expect(urls[0]).toMatch(/\/act_123\/insights/)
    expect(m.anuncios).toMatchObject({ gasto: 12.5, alcance: 800, leads: 3 })
    expect(m.instagram).toEqual({ seguidores: 321, publicaciones: 54 })
    const mal = await leerMeta({ token: TOKEN, adAccountId: '1', fetch: async () => respuesta({ error: { message: `Invalid OAuth ${TOKEN}` } }, false, 400) })
    expect(mal.anuncios).toBeNull()
    expect(JSON.stringify(mal)).not.toContain(TOKEN)
    expect(mal.errores[0]).toMatch(/400/)
  })
})

describe('archivo de los brazos (cerebro_fichas)', () => {
  const ficha = (o: Partial<Parameters<typeof archivarFichasDeBrazos>[0]['fichas'][0]> = {}) => ({
    brazo: 'competencia' as const, alcance: 'competidor' as const, client_id: CL, ref: 'brazo:competencia:rasimar:mapas:2026-10-13', atributo: 'competidor:rasimar:mapas', clase: 'competidor_mapas', titulo: 'Competidor · Rasimar · Mapas',
    contenido: '«Rasimar» (competidor) en Google Maps: puntaje 4,5. Observado 2026-10-13.', origen: 'tercero' as const, fuente_url: null, fecha_fuente: '2026-10-13', observado_en: '2026-10-13T13:00:00.000Z', vigente_hasta: '2026-10-27T13:00:00.000Z', decision: 'reemplaza' as const, ...o,
  })
  const vacio = () => ({ cerebro_fichas: [] as Array<Record<string, unknown>>, cerebro_ingresos: [] as Array<Record<string, unknown>> })
  it('la huella no cambia por la fecha del texto, sí por el dato', () => {
    expect(huellaDeFicha('puntaje 4,5. Observado 2026-10-13.')).toBe(huellaDeFicha('puntaje 4,5. Observado 2026-10-20.'))
    expect(huellaDeFicha('puntaje 4,5.')).not.toBe(huellaDeFicha('puntaje 4,3.'))
  })
  it('escribe con alcance y propiedad ajena (competidor) o propia (cliente); es idempotente el mismo día', async () => {
    const t = vacio()
    const base = crearBaseFalsa(t)
    const r1 = await archivarFichasDeBrazos({ db: base.db, fichas: [ficha(), ficha({ brazo: 'propios', alcance: 'cliente', ref: 'brazo:propios:x', atributo: 'propios:loyverse:resumen:2026-10', origen: 'plataforma', contenido: 'ventas 26' })], ahora: JUEVES, dry_run: false, workflow_id: 'wf', workflow_execution_id: 'ex' })
    expect(r1).toMatchObject({ escritas: 2, iguales: 0, retiradas: 0, errores: [] })
    const f = t.cerebro_fichas
    expect(f.find((x) => x.alcance === 'competidor')).toMatchObject({ propiedad: 'ajena', origen: 'tercero', juzgado_por: 'regla', descartada: false })
    expect(f.find((x) => x.alcance === 'cliente')).toMatchObject({ propiedad: 'propia', origen: 'plataforma' })
    expect(t.cerebro_ingresos).toHaveLength(2) // uno por origen
    const r2 = await archivarFichasDeBrazos({ db: base.db, fichas: [ficha()], ahora: JUEVES, dry_run: false })
    expect(r2).toMatchObject({ escritas: 0, iguales: 1 })
    expect(t.cerebro_fichas).toHaveLength(2)
  })
  it('la misma ref con el dato cambiado el mismo día NO se reescribe (una lectura por ref; la siguiente lectura trae otra ref)', async () => {
    const t = vacio()
    const base = crearBaseFalsa(t)
    await archivarFichasDeBrazos({ db: base.db, fichas: [ficha()], ahora: JUEVES, dry_run: false })
    const r = await archivarFichasDeBrazos({ db: base.db, fichas: [ficha({ contenido: '«Rasimar» (competidor) en Google Maps: puntaje 3,0. Observado 2026-10-13.' })], ahora: JUEVES, dry_run: false })
    expect(r).toMatchObject({ escritas: 0, iguales: 1 })
    expect(t.cerebro_fichas).toHaveLength(1)
  })
  it('el MISMO dato con otra fecha en el texto y otra ref no se vuelve a escribir (no hay versión nueva cada día)', async () => {
    const t = vacio()
    const base = crearBaseFalsa(t)
    await archivarFichasDeBrazos({ db: base.db, fichas: [ficha()], ahora: JUEVES, dry_run: false })
    const r = await archivarFichasDeBrazos({ db: base.db, fichas: [ficha({ ref: 'brazo:competencia:rasimar:mapas:2026-10-20', contenido: '«Rasimar» (competidor) en Google Maps: puntaje 4,5. Observado 2026-10-20.' })], ahora: new Date('2026-10-20T13:00:00Z'), dry_run: false })
    expect(r).toMatchObject({ escritas: 0, iguales: 1, retiradas: 0 })
    expect(t.cerebro_fichas).toHaveLength(1)
  })
  it('un dato nuevo REEMPLAZA: la ficha nueva apunta a la vieja y la vieja queda retirada con su motivo (nada se borra)', async () => {
    const t = vacio()
    const base = crearBaseFalsa(t)
    await archivarFichasDeBrazos({ db: base.db, fichas: [ficha()], ahora: JUEVES, dry_run: false })
    const vieja = t.cerebro_fichas[0]
    const r = await archivarFichasDeBrazos({ db: base.db, fichas: [ficha({ ref: 'brazo:competencia:rasimar:mapas:2026-10-20', contenido: '«Rasimar» (competidor) en Google Maps: puntaje 4,1. Observado 2026-10-20.' })], ahora: new Date('2026-10-20T13:00:00Z'), dry_run: false })
    expect(r).toMatchObject({ escritas: 1, retiradas: 1 })
    expect(t.cerebro_fichas).toHaveLength(2)
    const nueva = t.cerebro_fichas[1]
    expect(nueva.version_de).toBe(vieja.id)
    expect(vieja.retirada_en).toBeTruthy()
    expect(vieja.reemplazada_por).toBe(nueva.id)
    expect(String(vieja.motivo_retirada)).toMatch(/reemplazada por/)
  })
  it('dry_run: calcula el plan y NO escribe nada (ni el ingreso)', async () => {
    const t = vacio()
    const base = crearBaseFalsa(t)
    const r = await archivarFichasDeBrazos({ db: base.db, fichas: [ficha()], ahora: JUEVES, dry_run: true })
    expect(r.plan).toEqual([{ ref: 'brazo:competencia:rasimar:mapas:2026-10-13', accion: 'nueva', alcance: 'competidor' }])
    expect(base.escrituras).toEqual([])
  })
  it('una lectura fallida de lo vigente detiene SOLO a ese cliente y se dice (escribir a ciegas duplicaría)', async () => {
    const t = vacio()
    const base = crearBaseFalsa(t, { fallaEn: 'cerebro_fichas' })
    const r = await archivarFichasDeBrazos({ db: base.db, fichas: [ficha()], ahora: JUEVES, dry_run: false })
    expect(r.errores[0]).toMatch(/lectura de las fichas vigentes/)
    expect(r.escritas).toBe(0)
    expect(base.escrituras).toEqual([])
  })
  it('jamás toca las fichas del portero ni las de otro cliente (solo las que empiezan con «brazo:»)', async () => {
    const t = vacio()
    t.cerebro_fichas.push({ id: 'portero-1', client_id: CL, ref: 'portero:mapas:abc', atributo: 'competidor:rasimar:mapas', huella: 'x', retirada_en: null })
    t.cerebro_fichas.push({ id: 'otro-1', client_id: 'otro', ref: 'brazo:competencia:rasimar:mapas:2026-10-13', atributo: 'competidor:rasimar:mapas', huella: 'x', retirada_en: null })
    const base = crearBaseFalsa(t)
    const r = await archivarFichasDeBrazos({ db: base.db, fichas: [ficha()], ahora: JUEVES, dry_run: false })
    expect(r).toMatchObject({ escritas: 1, retiradas: 0 })
    expect(t.cerebro_fichas.find((x) => x.id === 'portero-1')!.retirada_en).toBeNull()
    expect(t.cerebro_fichas.find((x) => x.id === 'otro-1')!.retirada_en).toBeNull()
  })
})

describe('integración · alimentar con los brazos (3 rubros · tuteo y voseo)', () => {
  const fetchFalso: Fetch = async () => ({ ok: true, status: 200, json: async () => ({ receipts: [{ receipt_number: '1', receipt_type: 'SALE', total_money: 20, created_at: '2026-10-10T17:00:00Z', line_items: [{ item_name: 'Plato', quantity: 1, total_money: 20 }] }] }) })
  for (const c of CASOS) {
    it(`${c.nombre} (${c.voz}) · con contexto y propios encendidos archiva sus fichas aparte; sin ellos el ciclo es el de siempre`, async () => {
      const slug = c.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_')
      const sinBrazos = tablas(c)
      const conBrazos = tablas(c)
      ;(conBrazos.clients[0] as Record<string, unknown>).slug = c.nombre.toLowerCase()
      const a = await alimentarCliente({ db: crearBaseFalsa(sinBrazos as never).db, client_id: c.id, ...REAL, interruptores: ON, ahora: ALTA })
      const b = await alimentarCliente({
        db: crearBaseFalsa(conBrazos as never).db, client_id: c.id, ...REAL, interruptores: ON, ahora: ALTA, brazos: { ...BRAZOS_APAGADOS, contexto: true, propios: true },
        env: { [`CLIENTE_${slug}_LOYVERSE_TOKEN`]: 'tok-falso' }, fetch: fetchFalso,
      })
      expect(a.brazos).toBeUndefined()
      expect(b.brazos?.activos.sort()).toEqual(['contexto', 'propios'])
      expect(b.errores).toEqual([])
      // lo de siempre: las mismas fichas del portero (las de los brazos son aparte y empiezan con «brazo:»)
      const delPortero = (t: typeof conBrazos) => t.cerebro_fichas.filter((f) => !String(f.ref).startsWith('brazo:')).map((f) => f.ref).sort()
      expect(delPortero(conBrazos)).toEqual(delPortero(sinBrazos))
      const deBrazos = conBrazos.cerebro_fichas.filter((f) => String(f.ref).startsWith('brazo:'))
      // el contexto (feriados) existe para todo país del catálogo (16-oct: ya no solo Ecuador); la ficha de zona lleva el país del cliente
      const iso = ({ Ecuador: 'ec', Argentina: 'ar', 'México': 'mx' } as Record<string, string>)[c.pais]
      expect(deBrazos.some((f) => f.client_id === `zona:${iso}`)).toBe(true)
      expect(deBrazos.some((f) => f.client_id === c.id && f.alcance === 'cliente')).toBe(true)
      expect(JSON.stringify(deBrazos)).not.toContain('tok-falso')
    })
  }
  it('un error al escribir las fichas de un brazo SE DICE en el resultado (no queda «hecha» con el error escondido)', async () => {
    const c = CASOS[0]
    const t = tablas(c)
    ;(t.clients[0] as Record<string, unknown>).slug = 'clinica-sonrisa-norte'
    const base = crearBaseFalsa(t as never, { fallaEn: 'cerebro_ingresos' })
    const r = await alimentarCliente({ db: base.db, client_id: c.id, ...REAL, interruptores: ON, ahora: ALTA, brazos: { ...BRAZOS_APAGADOS, propios: true }, env: { CLIENTE_CLINICA_SONRISA_NORTE_LOYVERSE_TOKEN: 'tok' }, fetch: fetchFalso })
    expect(r.errores.some((e) => e.startsWith('brazos: '))).toBe(true)
    expect(r.estado).toBe('con_errores')
  })
  it('en seco los brazos calculan y no escriben nada', async () => {
    const c = CASOS[0]
    const t = tablas(c)
    const base = crearBaseFalsa(t as never)
    const r = await alimentarCliente({ db: base.db, client_id: c.id, dry_run: true, interruptores: ON, ahora: ALTA, brazos: { ...BRAZOS_APAGADOS, propios: true }, env: { CLIENTE_CLINICA_SONRISA_NORTE_LOYVERSE_TOKEN: 'tok' }, fetch: fetchFalso })
    expect(r.brazos?.archivo?.escritas).toBe(0)
    expect(base.escrituras).toEqual([])
  })
})

describe('cada brazo tiene SU interruptor (encender uno no enciende los demás)', () => {
  const cliente = { id: CL, name: 'Náufrago', slug: 'naufrago', country: 'Ecuador', market: 'Olón, Ecuador', industry: 'restaurante de mariscos', config: { apify: { competitor_list: [{ name: 'Rival Uno', competitor_type: 'direct' }], competidores_confirmados: { en: '2026-10-15', nombres: ['Rival Uno'] } } } }
  const lunesMasMiercoles = [new Date('2026-10-12T12:00:00Z'), MIERCOLES]
  it('plan: solo demanda → ninguna acción de competencia; solo competencia → ninguna de demanda; solo contexto/propios → nada que pedir', () => {
    for (const ahora of lunesMasMiercoles) {
      const d = accionesDeBrazos({ brazos: { ...BRAZOS_APAGADOS, demanda: true }, cliente, ciudad: 'Olón', ahora }).acciones
      expect(d.every((a) => a.fuente === 'demanda')).toBe(true)
      const c = accionesDeBrazos({ brazos: { ...BRAZOS_APAGADOS, competencia: true }, cliente, ciudad: 'Olón', ahora }).acciones
      expect(c.every((a) => a.fuente === 'competencia')).toBe(true)
      expect(accionesDeBrazos({ brazos: { ...BRAZOS_APAGADOS, contexto: true, propios: true }, cliente, ciudad: 'Olón', ahora }).acciones).toEqual([])
    }
    expect(accionesDeBrazos({ brazos: { ...BRAZOS_APAGADOS, demanda: true }, cliente, ciudad: 'Olón', ahora: MIERCOLES }).acciones).toHaveLength(1)
    expect(accionesDeBrazos({ brazos: { ...BRAZOS_APAGADOS, competencia: true }, cliente, ciudad: 'Olón', ahora: new Date('2026-10-12T12:00:00Z') }).acciones.length).toBeGreaterThan(0)
  })
  it('archivo: con un solo brazo encendido solo ese brazo aparece, y los otros no leen ni llaman', async () => {
    for (const solo of ['contexto', 'demanda', 'competencia', 'propios'] as const) {
      const base = crearBaseFalsa({ cerebro_fichas: [], cerebro_ingresos: [] })
      const r = await correrBrazos({ db: base.db, brazos: { ...BRAZOS_APAGADOS, [solo]: true }, cliente, client_id: CL, filas: [], ahora: JUEVES, dry_run: true, env: {}, fetch: async () => { throw new Error('llamada') } })
      expect(Object.keys(r.por_brazo)).toEqual([solo])
    }
  })
})

describe('correrBrazos · apagados no leen ni escriben', () => {
  it('sin ningún brazo encendido no toca la base', async () => {
    const base = crearBaseFalsa({ cerebro_fichas: [] })
    const r = await correrBrazos({ db: base.db, brazos: BRAZOS_APAGADOS, cliente: { id: CL }, client_id: CL, filas: [], ahora: JUEVES, dry_run: false })
    expect(r.activos).toEqual([])
    expect(base.lecturas).toEqual([])
    expect(base.escrituras).toEqual([])
  })
  it('todos encendidos pero sin material: todos dicen por qué (no hay silencio)', async () => {
    const base = crearBaseFalsa({ cerebro_fichas: [], cerebro_ingresos: [] })
    const r = await correrBrazos({ db: base.db, brazos: TODOS, cliente: { id: CL, name: 'Náufrago', slug: 'naufrago', country: 'Ecuador', config: { apify: { competitor_list: [{ name: 'X' }] } } }, client_id: CL, filas: [], ahora: JUEVES, dry_run: false, env: {}, fetch: async () => { throw new Error('no debe llamarse') } })
    expect(Object.keys(r.por_brazo).sort()).toEqual(['competencia', 'contexto', 'demanda', 'propios'])
    expect(r.por_brazo.competencia?.estado).toBe('sin_material')
    expect(r.por_brazo.demanda?.estado).toBe('sin_material')
    expect(r.por_brazo.propios?.estado).toBe('sin_material')
    expect(r.por_brazo.propios?.declarado.join(' ')).toMatch(/CLIENTE_NAUFRAGO_LOYVERSE_TOKEN/)
    expect(r.por_brazo.contexto?.estado).toBe('listo')
  })
})

describe('confirmar a los competidores (una vez)', () => {
  const cfg = { negocio: { x: 1 }, apify: { own_handles: { instagram: 'n' }, competitor_list: [{ name: "Cabaña D'Jerry" }, { name: 'Rasimar Restaurante' }, { name: 'Pigro' }] } }
  const AHORA = new Date('2026-10-15T10:00:00Z')
  it('solo confirma nombres que ya están en la lista de la ficha (sin tildes ni mayúsculas) y dice los que rechaza', () => {
    const r = confirmarCompetidores(cfg, ['rasimar restaurante', 'CABAÑA D JERRY', 'Inventado', '', 42], { ahora: AHORA, por: 'emilio' })
    expect(r.confirmados).toEqual(['Rasimar Restaurante', "Cabaña D'Jerry"])
    expect(r.rechazados.map((x) => x.por_que)).toEqual(['no está en la lista de competidores de la ficha (competitor_list)', 'no es un nombre', 'no es un nombre'])
    expect(r.config).toMatchObject({ negocio: { x: 1 }, apify: { own_handles: { instagram: 'n' }, competidores_confirmados: { en: '2026-10-15T10:00:00.000Z', por: 'emilio', nombres: ['Rasimar Restaurante', "Cabaña D'Jerry"] } } })
    expect(competidoresConfirmados(r.config).vigilados.map((c) => c.nombre)).toEqual(["Cabaña D'Jerry", 'Rasimar Restaurante'])
  })
  it('máximo 5; vaciar la lista deja de vigilar; no repite', () => {
    const muchos = { apify: { competitor_list: Array.from({ length: 7 }, (_, i) => ({ name: `Comp ${i}` })) } }
    const r = confirmarCompetidores(muchos, Array.from({ length: 7 }, (_, i) => `Comp ${i}`).concat('Comp 1'), { ahora: AHORA, por: 'x' })
    expect(r.confirmados).toHaveLength(5)
    expect(r.rechazados.some((x) => /máximo es 5/.test(x.por_que))).toBe(true)
    const doble = confirmarCompetidores(cfg, ['Pigro', 'pigro', 'PIGRO'], { ahora: AHORA, por: 'x' })
    expect([doble.confirmados, doble.rechazados]).toEqual([['Pigro'], []])
    expect(confirmarCompetidores(cfg, [], { ahora: AHORA, por: 'x' }).confirmados).toEqual([])
    expect(competidoresConfirmados(confirmarCompetidores(cfg, [], { ahora: AHORA, por: 'x' }).config).vigilados).toEqual([])
  })
  it('con la base: en seco no escribe; real escribe UNA vez y solo la config; cliente inexistente → 404; lectura fallida → 502', async () => {
    const t = { clients: [{ id: CL, config: cfg }] as Array<Record<string, unknown>> }
    const base = crearBaseFalsa(t)
    const seco = await guardarCompetidoresConfirmados(base.db, CL, ['Pigro'], { ahora: AHORA, por: 'emilio', dry_run: true })
    expect(seco.body.confirmados).toEqual(['Pigro'])
    expect(base.escrituras).toEqual([])
    const real = await guardarCompetidoresConfirmados(base.db, CL, ['Pigro'], { ahora: AHORA, por: 'emilio', dry_run: false })
    expect(real.ok).toBe(true)
    expect(base.escrituras).toHaveLength(1)
    expect((t.clients[0].config as { apify: { competidores_confirmados: { nombres: string[] } } }).apify.competidores_confirmados.nombres).toEqual(['Pigro'])
    expect((await guardarCompetidoresConfirmados(base.db, 'no-existe', [], { ahora: AHORA, por: 'x', dry_run: false })).estado).toBe(404)
    expect((await guardarCompetidoresConfirmados(crearBaseFalsa(t, { fallaEn: 'clients' }).db, CL, [], { ahora: AHORA, por: 'x', dry_run: false })).estado).toBe(502)
  })
  it('la ruta exige llave interna, dry_run booleano, client_id uuid y nombres en lista', () => {
    const ruta = fs.readFileSync(path.resolve(__dirname, '../../../app/api/brain/alimentar/competidores/route.ts'), 'utf8')
    expect(ruta).toMatch(/checkInternalKey/)
    expect(ruta).toMatch(/dry_run_obligatorio/)
    expect(ruta).toMatch(/client_id_invalido/)
    expect(ruta).toMatch(/nombres_invalidos/)
  })
})
