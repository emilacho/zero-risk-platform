/**
 * 16-oct · dos cosas del encargo «historial de Loyverse + mapa de ítems + Guayaquil»: US$ 0, sin red.
 *   · SEDE POR ABRIR: dato de la ficha de la sede (`estado_de_la_sede`); no se vigila competencia ni posición por sede, no se reporta como problema, y entra sola al marcarla abierta.
 *   · MAPA DE ÍTEMS POR SINÓNIMO: caja ↔ carta web sin esperar al dueño; lo dudoso se marca dudoso, nunca se inventa.
 */
import { describe, expect, it } from 'vitest'
import { BRAZOS_APAGADOS, accionesDeBrazos, correrBrazos, sinLosDeSedesPorAbrir } from '../brazos'
import type { Competidor } from '../brazos/competencia'
import { accionesDeDemandaPorSede } from '../brazos/demanda'
import { armarMapaDeItems, itemsDeLaCarta, metaDelMapa } from '../brazos/mapa-de-items'
import { fichasDeVentas, resumirVentas } from '../brazos/propios'
import { estadoDeLaSede, porAbrir, sedesConPunto, type SedeConPunto } from '../brazos/sedes'
import { cargarContextoDeBrazos, descubrirYJuzgar, type ContextoDeBrazos } from '../brazos/sistematica'
import { crearBaseFalsa } from './base-falsa'

const CL = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const AHORA = new Date('2026-10-14T12:00:00Z') // miércoles: día de la demanda por sede
const sedeOlon: SedeConPunto = { clave: 'olon', ciudad: 'Olón', lat: -1.797, lng: -80.759, origen_del_punto: 'ficha_de_mapas', tipo: 'local', direccion: '663R+25G, Olon', estado: 'abierta' }
const sedeGye: SedeConPunto = { clave: 'guayaquil', ciudad: 'Guayaquil', lat: -2.16, lng: -79.9, origen_del_punto: 'direccion_aproximada', tipo: 'solo_domicilio', direccion: 'Avenida 8 NO, Guayaquil', estado: 'por_abrir' }
const comp = (nombre: string, sedes: string[]): Competidor => ({ nombre, slug: nombre.toLowerCase().replace(/\W+/g, '-'), tipo: 'direct', web: null, sitio_propio: null, instagram: null, sedes, origen: 'sistema' })

describe('sede por abrir · el dato de la ficha de la sede', () => {
  it('«por abrir» y sus formas de decirlo; cualquier otra cosa (o nada) es abierta', () => {
    for (const v of ['por abrir', 'Por abrir', 'aún no abre al público', 'todavía no abre', 'próxima apertura', 'pre-apertura', 'sin abrir']) {
      expect(estadoDeLaSede([{ campo: 'estado_de_la_sede', valor_texto: v }])).toBe('por_abrir')
    }
    expect(estadoDeLaSede([{ campo: 'estado_de_la_sede', valor_texto: 'abierta' }])).toBe('abierta')
    expect(estadoDeLaSede([{ campo: 'tipo_de_atencion', valor_texto: 'por abrir' }])).toBe('abierta') // otro campo no cuenta
    expect(estadoDeLaSede([])).toBe('abierta')
  })
  it('si hay varias filas vale la más reciente: al marcarla abierta, la sede entra sola', () => {
    const viejo = { campo: 'estado_de_la_sede', valor_texto: 'por abrir', observado_en: '2026-10-16T10:00:00Z' }
    const nuevo = { campo: 'estado_de_la_sede', valor_texto: 'abierta', observado_en: '2026-12-01T10:00:00Z' }
    expect(estadoDeLaSede([viejo, nuevo])).toBe('abierta')
    expect(estadoDeLaSede([nuevo, viejo])).toBe('abierta')
    expect(estadoDeLaSede([{ ...nuevo, valor_texto: 'por abrir' }, { ...viejo, valor_texto: 'abierta', observado_en: '2026-01-01T00:00:00Z' }])).toBe('por_abrir')
  })
  it('sedesConPunto lo lee de la ficha de SU sede (no de otra) y no usa nombres propios', () => {
    const sedes = [{ id: 's-1', clave: 'norte', ciudad: 'Quito' }, { id: 's-2', clave: 'sur', ciudad: 'Cuenca' }]
    const r = sedesConPunto({ nombreDelCliente: 'Clínica Sol', sedes, datos: [{ sede_id: 's-2', campo: 'estado_de_la_sede', valor_texto: 'por abrir' }], config: {}, filas: [] })
    expect(r.map((s) => [s.clave, s.estado])).toEqual([['norte', 'abierta'], ['sur', 'por_abrir']])
    expect(porAbrir(r[1])).toBe(true)
    expect(porAbrir(r[0])).toBe(false)
    expect(porAbrir({})).toBe(false) // sin dato = abierta
  })
})

describe('sede por abrir · no se vigila ni se reporta como problema', () => {
  it('la demanda por sede la salta por completo: ni corrida, ni ubicar por dirección, ni «hueco»; la otra sede sigue igual', () => {
    const sinPunto: SedeConPunto = { ...sedeGye, lat: null, lng: null, origen_del_punto: null }
    const r = accionesDeDemandaPorSede({ ahora: AHORA, terminos: ['ceviche'], sedes: [sedeOlon, sinPunto], familias: ['comida'] })
    expect(r.acciones.map((a) => a.params._brazo)).toEqual(['demanda:olon'])
    expect(r.no_cubiertas).toEqual([])
  })
  it('al marcarla abierta entra sola (misma función, otro estado)', () => {
    const abierta: SedeConPunto = { ...sedeGye, estado: 'abierta' }
    const r = accionesDeDemandaPorSede({ ahora: AHORA, terminos: ['ceviche'], sedes: [sedeOlon, abierta], familias: ['comida'] })
    expect(r.acciones.map((a) => a.params._brazo).sort()).toEqual(['demanda:guayaquil', 'demanda:olon'])
  })
  const cliente = { id: CL, name: 'Náufrago', industry: 'restaurante de mariscos', country: 'EC', config: {} }
  const ctx = (sedes: SedeConPunto[], delSistema: Competidor[] = []) => ({ sedes, delSistema, ubicadasRecientemente: new Set<string>() })
  it('un competidor que solo compite por la sede por abrir no se vigila; el de otra sede, o de varias, sí', () => {
    const lunes = new Date('2026-10-12T12:00:00Z')
    const todos = [comp('Solo Gye', ['guayaquil']), comp('Solo Olon', ['olon']), comp('De Ambas', ['olon', 'guayaquil']), comp('Sin Sede', [])]
    const r = accionesDeBrazos({ brazos: { ...BRAZOS_APAGADOS, competencia: true }, cliente, ahora: lunes, ctx: ctx([sedeOlon, sedeGye], todos), topeDiarioUsd: 5 })
    const nombres = new Set(r.acciones.map((a) => String(a.objetivo).split(' · ')[0]))
    expect(nombres.has('Solo Gye')).toBe(false)
    expect(sinLosDeSedesPorAbrir(todos, [sedeOlon, sedeGye]).map((c) => c.nombre).sort()).toEqual(['De Ambas', 'Sin Sede', 'Solo Olon'])
    expect(sinLosDeSedesPorAbrir(todos, [sedeOlon])).toHaveLength(4) // sin sedes por abrir no cambia nada
  })
  it('si TODAS las sedes están por abrir no se cae a mirar «por ciudad»: no pide demanda ni competencia del sistema, y no es un hueco de demanda', () => {
    const r = accionesDeBrazos({ brazos: { ...BRAZOS_APAGADOS, demanda: true, competencia: true }, cliente, ahora: AHORA, ctx: ctx([sedeGye], [comp('Solo Gye', ['guayaquil'])]), ciudad: 'Guayaquil', topeDiarioUsd: 5 })
    expect(r.acciones).toEqual([])
    expect(r.no_cubiertas.some((n) => n.fuente === 'demanda')).toBe(false)
  })
  it('la competencia sistemática la marca «no aplica · por abrir», no llama al modelo y no guarda ni retira nada', async () => {
    let llamadas = 0
    const c: ContextoDeBrazos = { sedes: [sedeGye], filas: [], vigentes: [], delSistema: [], ubicadasRecientemente: new Set(), errores: [] }
    const r = await descubrirYJuzgar({ ctx: c, client_id: CL, nombreDelCliente: 'Náufrago', rubro: 'restaurante de mariscos', config: {}, ahora: AHORA, presupuestoUsd: 0.16, llamarModelo: async () => { llamadas++; return { texto: '{}', costo_usd: 0, tokens_entrada: 0, tokens_salida: 0 } } })
    expect(llamadas).toBe(0)
    expect(r.por_sede.guayaquil).toMatchObject({ estado: 'no_aplica', candidatos: 0, competidores: 0, costo_usd: 0 })
    expect(r.por_sede.guayaquil.detalle).toMatch(/por abrir/)
    expect(r.fichas).toEqual([])
    expect(r.retiros).toEqual([])
    expect(r.declarado).toEqual([])
  })
})

describe('sede por abrir · integración con la base falsa (lo que hace la corrida diaria)', () => {
  const OLON = { lat: -1.7974316, lng: -80.7595412 }
  const lugar = (title: string, loc: { lat: number; lng: number }) => ({ title, categoryName: 'Marisquería', totalScore: 4.5, reviewsCount: 40, location: loc, address: 'x', placeId: `p-${title}`, rank: 1, searchString: 'ceviche' })
  const fila = (sede: string, id: string, items: unknown[]) => ({ id, client_id: CL, apify_function: 'google_maps_scraper', ensayo: false, created_at: '2026-10-14T12:30:00.000Z', params: { _brazo: `demanda:${sede}` }, respuesta: items })
  const tablas = (estado: Array<Record<string, unknown>>) => ({
    client_sedes: [{ id: 's-olon', client_id: CL, clave: 'olon', ciudad: 'Olon' }, { id: 's-gye', client_id: CL, clave: 'guayaquil', ciudad: 'Guayaquil' }],
    client_sede_datos: [
      { sede_id: 's-olon', client_id: CL, campo: 'tipo_de_atencion', valor_texto: 'restaurante (local) y domicilio' }, { sede_id: 's-gye', client_id: CL, campo: 'tipo_de_atencion', valor_texto: 'solo domicilio (sin local)' },
      { sede_id: 's-gye', client_id: CL, campo: 'direccion', valor_texto: 'Avenida 8 NO, Guayaquil' }, ...estado,
    ],
    apify_raw: [
      { id: 'own', client_id: CL, apify_function: 'own_google_maps_profile', ensayo: false, created_at: '2026-10-14T10:00:00Z', params: {}, respuesta: [{ title: 'Naufrago', city: 'Olon', location: OLON }] },
      fila('olon', 'd1', [lugar('Don Villón', { lat: OLON.lat + 0.01, lng: OLON.lng + 0.01 }), lugar('Marisquería Sol', { lat: OLON.lat + 0.01, lng: OLON.lng })]),
      fila('guayaquil', 'd2', [lugar('Cevichería Puerto', { lat: -2.16, lng: -79.9 })]),
    ],
    cerebro_fichas: [] as Array<Record<string, unknown>>, cerebro_ingresos: [] as Array<Record<string, unknown>>,
  })
  const cliente = { id: CL, name: 'Náufrago', slug: 'naufrago', industry: 'restaurante de mariscos', country: 'Ecuador', config: { apify: {} } }
  const modelo = async (_i: string, m: string) => ({ texto: JSON.stringify({ decisiones: (m.match(/^\d+\. «/gm) ?? []).map((_x, k) => ({ n: k + 1, veredicto: 'competidor', cita: 'categoría Marisquería', razon: 'compite' })) }), costo_usd: 0.012, tokens_entrada: 1, tokens_salida: 1 })
  const POR_ABRIR = { sede_id: 's-gye', client_id: CL, campo: 'estado_de_la_sede', valor_texto: 'por abrir', observado_en: '2026-10-16T10:00:00Z' }
  const correr = (t: ReturnType<typeof tablas>, ahora = AHORA) => correrBrazos({ db: crearBaseFalsa(t as never).db, brazos: { ...BRAZOS_APAGADOS, demanda: true, competencia: true }, cliente, client_id: CL, filas: [], ahora, dry_run: false, llamarModelo: modelo })
  const deGye = (t: ReturnType<typeof tablas>) => t.cerebro_fichas.filter((f) => JSON.stringify(f.provenance_tag ?? {}).includes('guayaquil') || String(f.atributo).includes('guayaquil'))

  it('con Guayaquil por abrir: no se mira su posición, no se evalúa su competencia, no se escribe nada de la sede y no queda como error ni «hueco»', async () => {
    const t = tablas([POR_ABRIR])
    const r = await correr(t)
    expect(r.errores).toEqual([])
    expect(r.por_sede?.guayaquil).toMatchObject({ estado: 'no_aplica', competidores: 0, costo_usd: 0 })
    expect(r.por_sede?.olon).toMatchObject({ estado: 'evaluada', competidores: 2 })
    expect(r.costo_modelo_usd).toBeCloseTo(0.012, 6) // un lote (Olón), no dos
    expect(deGye(t)).toEqual([])
    expect(t.cerebro_fichas.filter((f) => f.clase === 'mercado_posicion').map((f) => f.atributo)).toEqual(['mercado:posicion:olon:ceviche'])
    expect(JSON.stringify(r.por_brazo.demanda?.declarado ?? [])).toMatch(/guayaquil: por abrir/)
  })
  it('sin el dato, lo mismo que antes (Guayaquil se evalúa); al marcarla abierta con una fila más nueva, entra sola', async () => {
    const t0 = tablas([])
    const r0 = await correr(t0)
    expect(r0.por_sede?.guayaquil).toMatchObject({ estado: 'evaluada', competidores: 1 })
    const t1 = tablas([POR_ABRIR, { ...POR_ABRIR, valor_texto: 'abierta', observado_en: '2026-12-01T10:00:00Z' }])
    const r1 = await correr(t1)
    expect(r1.por_sede?.guayaquil).toMatchObject({ estado: 'evaluada', competidores: 1 })
    expect(t1.cerebro_fichas.filter((f) => f.clase === 'mercado_posicion')).toHaveLength(2)
  })
  it('lo que ya vigilaba de Guayaquil no se sigue vigilando mientras esté por abrir (competidor que solo compite ahí)', async () => {
    const t = tablas([])
    await correr(t) // la prueba de competencia la dejó vigilada
    const antes = t.cerebro_fichas.filter((f) => f.clase === 'competidor_vigilado' && JSON.stringify(f.provenance_tag).includes('guayaquil'))
    expect(antes.length).toBeGreaterThan(0)
    const t2 = { ...t, client_sede_datos: [...t.client_sede_datos, POR_ABRIR] }
    const ctx = await cargarContextoDeBrazos(crearBaseFalsa(t2 as never).db, CL, cliente as never, AHORA)
    expect(ctx.sedes.find((s) => s.clave === 'guayaquil')?.estado).toBe('por_abrir')
    expect(ctx.sedes.find((s) => s.clave === 'olon')?.estado).toBe('abierta')
    expect(ctx.delSistema.map((c) => c.nombre)).toContain('Cevichería Puerto') // sigue guardado (con su motivo se retira aparte)
    const dias = [12, 13, 14, 15, 16].map((d) => accionesDeBrazos({ brazos: { ...BRAZOS_APAGADOS, competencia: true }, cliente, ahora: new Date(`2026-10-${d}T12:00:00Z`), ctx }).acciones)
    const objetivos = dias.flat().map((a) => String(a.objetivo))
    expect(objetivos.some((o) => /Cevichería Puerto/.test(o))).toBe(false)
    expect(objetivos.some((o) => /Don Villón|Marisquería Sol/.test(o))).toBe(true)
    // y el archivado de competencia de la corrida diaria tampoco escribe sus fichas: llega una lectura nueva de Mapas del competidor de la sede por abrir (y otra del de Olón, de control)
    const mapas = (slug: string, titulo: string, dia: string) => ({ id: `m-${slug}-${dia}`, client_id: CL, apify_function: 'google_maps_scraper', ensayo: false, created_at: `${dia}T13:00:00Z`, params: { _brazo: `competencia:${slug}:mapas` }, respuesta: [{ title: titulo, totalScore: 4.6, reviewsCount: 30, categoryName: 'Marisquería', address: 'x' }] })
    t2.apify_raw.push(mapas('cevicheria-puerto', 'Cevichería Puerto', '2026-10-19'), mapas('don-villon', 'Don Villón', '2026-10-19'))
    const r = await correrBrazos({ db: crearBaseFalsa(t2 as never).db, brazos: { ...BRAZOS_APAGADOS, competencia: true }, cliente, client_id: CL, filas: [], ahora: new Date('2026-10-20T12:00:00Z'), dry_run: false, llamarModelo: modelo })
    expect(r.errores).toEqual([])
    const mapasNuevas = t2.cerebro_fichas.filter((f) => f.clase === 'competidor_mapas' && String(f.ref).endsWith('2026-10-19'))
    expect(mapasNuevas.map((f) => f.atributo)).toEqual(['competidor:don-villon:mapas']) // el de Olón sí; el de la sede por abrir, no
  })
  it('el radio de competencia lo da solo la sede abierta (la sede por abrir a domicilio no lo agranda)', () => {
    const cli = { id: CL, name: 'Náufrago', industry: 'restaurante de mariscos', country: 'EC', config: {} }
    const c = comp('Don Villón', ['olon'])
    const r = (sedes: SedeConPunto[]) => accionesDeBrazos({ brazos: { ...BRAZOS_APAGADOS, competencia: true }, cliente: cli, ahora: new Date('2026-10-12T12:00:00Z'), ctx: { sedes, delSistema: [c], ubicadasRecientemente: new Set() }, topeDiarioUsd: 5 })
    const geo = (x: ReturnType<typeof r>) => x.acciones.map((a) => (a.params.customGeolocation as { radiusKm: number } | undefined)?.radiusKm).find((v) => v !== undefined)
    expect(geo(r([sedeOlon, sedeGye]))).toBe(3) // local de comida: 3 km (a domicilio sería 6)
    expect(geo(r([sedeOlon, { ...sedeGye, estado: 'abierta' }]))).toBe(6)
  })
})

describe('mapa de ítems por sinónimo', () => {
  it('dos ítems de la carta con las mismas palabras distintivas: dudosa con los dos, no toma el primero', () => {
    const m = armarMapaDeItems({ pos: ['Encebollado con chifle'], web: ['Encebollado Náufrago', 'Encebollado'], negocio: 'Náufrago' })
    expect(m.equivalencias[0]).toMatchObject({ certeza: 'dudosa', web: null, candidatos: ['Encebollado Náufrago', 'Encebollado'] })
    expect(m.mapa).toEqual({})
  })
  it('una variante con el mismo precio que DOS ítems de la carta tampoco toma el primero', () => {
    const web = [{ nombre: 'Encebollado Mixto', precio: 5 }, { nombre: 'Encebollado Junior', precio: 5 }]
    expect(armarMapaDeItems({ pos: [{ nombre: 'Encebollado junior mixto', precio: 5 }], web, negocio: 'Náufrago' }).equivalencias[0]).toMatchObject({ certeza: 'dudosa', web: null })
  })
  it('un ítem que SOLO trae palabras de presentación sigue siendo comparable si la carta lo lista («Vaso»)', () => {
    expect(una2('Vaso adicional', ['Vaso'])).toMatchObject({ certeza: 'sinonimo', web: 'Vaso' })
    expect(una2('Porción extra', ['Vaso'])).toMatchObject({ certeza: 'sin_equivalente' })
    expect(una2('Porción extra', ['Vaso']).motivo).toMatch(/presentación/)
  })
})
const una2 = (pos: string, web: string[]) => armarMapaDeItems({ pos: [pos], web, negocio: null }).equivalencias[0]

describe('mapa de ítems por sinónimo · (cont.)', () => {
  const CARTA = ['Encebollado Náufrago', 'Encebollado Mixto', 'Encebollado Junior', 'Ceviche Náufrago', 'Ceviche Mixto', 'Cola grande', 'Cola pequeña', 'Cerveza grande', 'Agua', 'Chifle', 'Pan']
  const una = (pos: string, o: { precio?: number; web?: Array<string | { nombre: string; precio?: number }> } = {}) =>
    armarMapaDeItems({ pos: [{ nombre: pos, precio: o.precio }], web: o.web ?? CARTA, negocio: 'Náufrago' }).equivalencias[0]

  it('mismo nombre: exacta (sin tildes ni mayúsculas)', () => {
    expect(una('ceviche mixto')).toMatchObject({ certeza: 'exacta', web: 'Ceviche Mixto' })
    expect(una('COLA PEQUEÑA')).toMatchObject({ certeza: 'exacta', web: 'Cola pequeña' })
  })
  it('sinónimo: se ignora la guarnición, el envase y el nombre del negocio; «jr» es «junior», aunque venga pegado', () => {
    expect(una('Encebollado con chifle')).toMatchObject({ certeza: 'sinonimo', web: 'Encebollado Náufrago' })
    expect(una('Encebollado sin chifle')).toMatchObject({ certeza: 'sinonimo', web: 'Encebollado Náufrago' })
    expect(una('ENCEBOLLADO TARRINA BLANCA')).toMatchObject({ certeza: 'sinonimo', web: 'Encebollado Náufrago' })
    expect(una('Encebollado mixto con chifle')).toMatchObject({ certeza: 'sinonimo', web: 'Encebollado Mixto' })
    expect(una('Encebollado JR. + chifle')).toMatchObject({ certeza: 'sinonimo', web: 'Encebollado Junior' })
    expect(una('EncebolladoJR tarrina ploma')).toMatchObject({ certeza: 'sinonimo', web: 'Encebollado Junior' })
    expect(una('Ceviche Naufrago (pescado)')).toMatchObject({ certeza: 'sinonimo', web: 'Ceviche Náufrago' })
    expect(una('Pan adicional')).toMatchObject({ certeza: 'sinonimo', web: 'Pan' })
    expect(una('Vaso con agua')).toMatchObject({ certeza: 'sinonimo', web: 'Agua' })
  })
  it('«Chifle» como ítem propio es el ítem «Chifle»; solo «con chifle» es guarnición', () => {
    expect(una('Chifle')).toMatchObject({ certeza: 'exacta', web: 'Chifle' })
    expect(una('Chifle/pan adicional')).toMatchObject({ certeza: 'dudosa', web: null, candidatos: ['Chifle', 'Pan'] })
  })
  it('una variante solo es «probable» si el precio coincide; con otro precio (o sin precio) es dudosa: un plato distinto no se disfraza de sinónimo', () => {
    const web = [{ nombre: 'Ceviche Náufrago', precio: 7 }, { nombre: 'Cerveza grande', precio: 3 }, { nombre: 'Jugo natural del día', precio: 2 }]
    expect(una('Cerveza', { precio: 3, web })).toMatchObject({ certeza: 'probable', web: 'Cerveza grande' })
    expect(una('Cerveza', { precio: 2.5, web })).toMatchObject({ certeza: 'dudosa', web: null, candidatos: ['Cerveza grande'] })
    expect(una('Cerveza', { web })).toMatchObject({ certeza: 'dudosa' })
    expect(una('Ceviche de camarón', { precio: 8.5, web })).toMatchObject({ certeza: 'dudosa', web: null })
    expect(una('Jugo Maracuyá', { precio: 2, web })).toMatchObject({ certeza: 'probable', web: 'Jugo natural del día' })
    expect(una('Jugo Pequeno Jamaica', { precio: 1, web })).toMatchObject({ certeza: 'dudosa' })
  })
  it('lo que coincide con varios ítems de la carta es dudoso y lista los candidatos; lo que la carta no tiene queda sin equivalente', () => {
    expect(una('Cola')).toMatchObject({ certeza: 'dudosa', web: null, candidatos: ['Cola grande', 'Cola pequeña'] })
    expect(una('Encebollado junior mixto')).toMatchObject({ certeza: 'dudosa', web: null, candidatos: expect.arrayContaining(['Encebollado Mixto', 'Encebollado Junior']) })
    for (const n of ['Burrito lomo grande', 'Extra Queso', 'Envase de 25ctv', 'Tarrina 0,25', 'Envío (naufrago.ec)']) expect(una(n)).toMatchObject({ certeza: 'sin_equivalente', web: null })
  })
  it('el mapa solo trae exacta, sinónimo y probable; lo dudoso va al `_meta`, nunca al mapa', () => {
    const web = [{ nombre: 'Cerveza grande', precio: 3 }, { nombre: 'Cola grande' }, { nombre: 'Cola pequeña' }, { nombre: 'Encebollado Náufrago' }]
    const m = armarMapaDeItems({ pos: [{ nombre: 'Cerveza', precio: 3 }, 'Cola', 'Encebollado con chifle', 'Burrito', 'Cola grande'], web, negocio: 'Náufrago' })
    expect(m.mapa).toEqual({ Cerveza: 'Cerveza grande', 'Encebollado con chifle': 'Encebollado Náufrago', 'Cola grande': 'Cola grande' })
    expect(m.resumen).toEqual({ exacta: 1, sinonimo: 1, probable: 1, dudosa: 1, sin_equivalente: 1 })
    const meta = metaDelMapa(m, AHORA)
    expect(meta).toMatchObject({ origen: 'automático por sinónimo', generado_en: AHORA.toISOString(), probables: { Cerveza: 'Cerveza grande' }, dudosos: { Cola: ['Cola grande', 'Cola pequeña'] }, sin_equivalente: ['Burrito'] })
  })
  it('agnóstico: una clínica y un taller se resuelven con sus propias palabras (sin tocar el código)', () => {
    const clinica = armarMapaDeItems({ pos: ['Consulta medica general', 'CONSULTA PEDIATRIA', 'Ecografia abdominal'], web: ['Consulta médica general', 'Consulta de pediatría', 'Ecografía abdominal'], negocio: 'Clínica Sol' })
    expect(clinica.mapa).toEqual({ 'Consulta medica general': 'Consulta médica general', 'CONSULTA PEDIATRIA': 'Consulta de pediatría', 'Ecografia abdominal': 'Ecografía abdominal' })
    const taller = armarMapaDeItems({ pos: ['Cambio de aceite sintético', 'Alineación y balanceo'], web: ['Cambio de aceite', 'Alineación y balanceo'], negocio: 'Taller Rápido' })
    expect(taller.mapa['Alineación y balanceo']).toBe('Alineación y balanceo')
    expect(taller.equivalencias[0].certeza).not.toBe('exacta') // «sintético» agrega algo: no es el mismo nombre
  })
  it('sin carta (o sin ítems) nada se afirma; nombres repetidos y vacíos no duplican ni rompen', () => {
    const m = armarMapaDeItems({ pos: ['Cerveza', 'cerveza', '  ', 'Cerveza'], web: [], negocio: null })
    expect(m.mapa).toEqual({})
    expect(m.equivalencias).toHaveLength(1)
    expect(m.equivalencias[0].certeza).toBe('sin_equivalente')
  })
})

describe('la carta web desde el JSON-LD', () => {
  const ld = JSON.stringify({ '@type': 'Restaurant', hasMenu: { hasMenuSection: [{ hasMenuItem: [
    { '@type': 'MenuItem', name: 'Encebollado "de la casa"', description: 'con {llaves}', offers: { '@type': 'Offer', price: '4.00' } },
    { '@type': 'MenuItem', name: 'Agua', offers: { '@type': 'Offer', price: '1,00' } },
    { '@type': 'MenuItem', name: 'Sin precio' },
    { '@type': 'MenuItem', name: 'Agua', offers: { price: '1.00' } },
  ] }] } })
  it('trae nombre y precio de cada ítem, sin repetir, con comillas y llaves dentro del texto', () => {
    expect(itemsDeLaCarta(`<script>${ld}</script>`)).toEqual([
      { nombre: 'Encebollado "de la casa"', precio: 4 }, { nombre: 'Agua', precio: 1 }, { nombre: 'Sin precio', precio: null },
    ])
  })
  it('un texto sin JSON-LD, o con un objeto cortado, da lista vacía y no lanza', () => {
    expect(itemsDeLaCarta('')).toEqual([])
    expect(itemsDeLaCarta('{"@type":"MenuItem","name":"Corta')).toEqual([])
    expect(itemsDeLaCarta('solo texto de la página')).toEqual([])
  })
})

describe('los ítems más vendidos con el mapa automático', () => {
  const recibo = (items: Array<[string, number, number]>) => ({ created_at: '2026-10-10T15:00:00Z', receipt_type: 'SALE', total_money: items.reduce((s, i) => s + i[2], 0), line_items: items.map(([item_name, quantity, total_money]) => ({ item_name, quantity, total_money })) })
  const mes = (items: Array<[string, number, number]>) => [{ periodo: '2026-10', grupo: '', rotulo: '', resumen: resumirVentas([recibo(items)], { periodo: '2026-10' }) }]
  const texto = (o: Record<string, unknown>) => String(fichasDeVentas({ client_id: CL, meses: mes([['Encebollado con chifle', 4, 14], ['Cerveza', 1, 3], ['Cola', 2, 2.5], ['Burrito', 1, 4]]), ahora: new Date('2026-10-15T15:00:00Z'), ...o }).find((f) => f.atributo === 'metrica:loyverse:items:2026-10')!.contenido)

  it('con el mapa armado por sinónimo: cita la carta, rotula lo probable, muestra lo dudoso como «podría ser» y dice que no lo confirmó el dueño', () => {
    const t = texto({
      mapaDeItems: { 'Encebollado con chifle': 'Encebollado Náufrago', Cerveza: 'Cerveza grande' },
      mapaMeta: { origen: 'automático por sinónimo', probables: { Cerveza: 'Cerveza grande' }, dudosos: { Cola: ['Cola grande', 'Cola pequeña'] } },
    })
    expect(t).toMatch(/Encebollado Náufrago \(en el punto de venta: «Encebollado con chifle»\)/)
    expect(t).toMatch(/Cerveza grande \(probable\) \(en el punto de venta: «Cerveza»\)/)
    expect(t).toMatch(/Cola \(podría ser «Cola grande» o «Cola pequeña»; sin afirmar\)/)
    expect(t).toMatch(/armadas automáticamente por sinónimo \(no las confirmó el dueño\)/)
    expect(t).toMatch(/2 ítem\(s\) sin equivalente afirmado/) // Burrito y Cola (dudosa)
    expect(t).not.toMatch(/equivalencia confirmada/) // el rótulo «sin confirmar» ya no aplica cuando hay mapa automático
  })
  it('sin mapa ni meta: los nombres son los del punto de venta y lo dice (como antes)', () => {
    const t = texto({})
    expect(t).toMatch(/sin equivalencia confirmada con la carta web/)
    expect(t).not.toMatch(/armadas automáticamente/)
  })
})
