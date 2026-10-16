/**
 * COMPETENCIA SISTEMÁTICA POR SEDE (15-oct) · US$ 0, sin red, con un modelo simulado. El sistema descubre (código), el agente juzga (con cita literal y tope), nada espera al dueño,
 * y todo se re-evalúa cada mes retirando con motivo. Agnóstico: 1 sede, N sedes o ninguna; 3 rubros; tuteo y voseo.
 */
import { describe, expect, it } from 'vitest'
import { BRAZOS_APAGADOS, TOPE_DIARIO_DE_BRAZOS_USD, accionesDeBrazos, correrBrazos } from '../brazos'
import { archivarFichasDeBrazos } from '../brazos/archivo'
import { accionesDeCompetencia, competidoresVigilados, diaDeCompetidor, fichasDeCompetencia, handleDeInstagram, semanaIso, type Competidor } from '../brazos/competencia'
import { accionesDeDemandaPorSede, fichasDeDemanda, type FilaCrudaDeBrazo } from '../brazos/demanda'
import { candidatosDeSede } from '../brazos/descubrir'
import { aplicarGuardasDeCompetencia, juzgarCompetenciaDeSede, MAX_COMPETIDORES_POR_SEDE, armarMensajeDeCompetencia } from '../brazos/juez-competencia'
import { distanciaKm, radioDe, sedesConPunto, type SedeConPunto } from '../brazos/sedes'
import { competidoresDelSistema, debeEvaluarse, descubrirYJuzgar, cargarContextoDeBrazos, type ContextoDeBrazos } from '../brazos/sistematica'
import { alimentarCliente } from '../alimentar'
import { rutaDescubrir } from '../rutas'
import { crearBaseFalsa } from './base-falsa'
import { ALTA, CASOS, ON, REAL, tablas as tablasDelCaso } from './fixtures-despertar'

const CL = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const AHORA = new Date('2026-10-14T12:00:00Z') // miércoles
const iso = (d: Date) => d.toISOString()
const OLON = { lat: -1.7974316, lng: -80.7595412 }
const sedeOlon: SedeConPunto = { clave: 'olon', ciudad: 'Olón', ...OLON, origen_del_punto: 'ficha_de_mapas', tipo: 'local', direccion: '663R+25G, Olon' }
const sedeGye: SedeConPunto = { clave: 'guayaquil', ciudad: 'Guayaquil', lat: -2.1626, lng: -79.9015, origen_del_punto: 'direccion_aproximada', tipo: 'solo_domicilio', direccion: 'Avenida 8 NO, Guayaquil' }
const lugar = (title: string, o: Record<string, unknown> = {}) => ({ title, categoryName: 'Marisquería', totalScore: 4.5, reviewsCount: 40, location: { lat: OLON.lat + 0.01, lng: OLON.lng + 0.01 }, address: 'Olón', placeId: `p-${title}`, rank: 1, searchString: 'ceviche', ...o })
const filaDemanda = (sede: string, items: Array<Record<string, unknown>>, o: Partial<FilaCrudaDeBrazo> = {}): FilaCrudaDeBrazo => ({ id: `d-${sede}`, apify_function: 'google_maps_scraper', ensayo: false, created_at: '2026-10-14T12:30:00.000Z', params: { _brazo: `demanda:${sede}` }, respuesta: items, ...o })

describe('sedes con su punto', () => {
  const sedes = [{ id: 's-olon', clave: 'olon', ciudad: 'Olon' }, { id: 's-gye', clave: 'guayaquil', ciudad: 'Guayaquil' }]
  const datos = [
    { sede_id: 's-olon', campo: 'tipo_de_atencion', valor_texto: 'restaurante (local) y domicilio' }, { sede_id: 's-olon', campo: 'direccion', valor_texto: '663R+25G, Olon' },
    { sede_id: 's-gye', campo: 'tipo_de_atencion', valor_texto: 'solo domicilio (sin local)' }, { sede_id: 's-gye', campo: 'direccion', valor_texto: 'Avenida 8 NO, Guayaquil' },
  ]
  const propia = (title: string, city: string, loc: unknown) => ({ apify_function: 'own_google_maps_profile', ensayo: false, created_at: '2026-10-14T10:00:00Z', respuesta: [{ title, city, location: loc }] })
  it('la ficha PROPIA de Mapas da el punto; un homónimo de otra ciudad NO; Guayaquil queda sin punto y declara su dirección', () => {
    const r = sedesConPunto({ nombreDelCliente: 'Náufrago', sedes, datos, config: {}, filas: [propia('Naufrago', 'Olon', { lat: -1.7974316, lng: -80.7595412 }), propia('Picanteria El Naufrago', 'Guayaquil', { lat: -2.13, lng: -79.89 }), propia('Naufrago', 'Manta', { lat: -0.95, lng: -80.7 })] })
    const olon = r.find((s) => s.clave === 'olon')!, gye = r.find((s) => s.clave === 'guayaquil')!
    expect([olon.lat, olon.lng, olon.origen_del_punto, olon.tipo]).toEqual([-1.7974316, -80.7595412, 'ficha_de_mapas', 'local'])
    expect([gye.lat, gye.lng, gye.origen_del_punto, gye.tipo, gye.direccion]).toEqual([null, null, null, 'solo_domicilio', 'Avenida 8 NO, Guayaquil'])
  })
  it('el orden es: coordenadas del dueño > ficha de Mapas > ubicación aproximada por dirección; coordenadas inválidas no cuentan', () => {
    const aprox = { apify_function: 'google_maps_scraper', ensayo: false, created_at: '2026-10-14T11:00:00Z', params: { _brazo: 'sede:guayaquil:ubicar' }, respuesta: [{ title: 'Av. 8 NO', location: { lat: -2.16, lng: -79.9 } }] }
    const conAprox = sedesConPunto({ nombreDelCliente: 'Náufrago', sedes, datos, config: {}, filas: [aprox] }).find((s) => s.clave === 'guayaquil')!
    expect([conAprox.lat, conAprox.origen_del_punto]).toEqual([-2.16, 'direccion_aproximada'])
    const config = { apify: { sedes_coordenadas: { guayaquil: { lat: -2.15, lng: -79.95 }, olon: { lat: 200, lng: 0 } } } }
    const r = sedesConPunto({ nombreDelCliente: 'Náufrago', sedes, datos, config, filas: [aprox, propia('Naufrago', 'Olon', { lat: -1.79, lng: -80.75 })] })
    expect(r.find((s) => s.clave === 'guayaquil')).toMatchObject({ lat: -2.15, origen_del_punto: 'config' })
    expect(r.find((s) => s.clave === 'olon')).toMatchObject({ lat: -1.79, origen_del_punto: 'ficha_de_mapas' }) // 200° no es una latitud: se ignora
  })
  it('un ensayo (dry_run) nunca da un punto', () => {
    const r = sedesConPunto({ nombreDelCliente: 'Náufrago', sedes, datos, config: {}, filas: [{ ...propia('Naufrago', 'Olon', { lat: -1.79, lng: -80.75 }), ensayo: true }] })
    expect(r.find((s) => s.clave === 'olon')!.lat).toBeNull()
  })
  it('radio por familia: comida local 3 km, a domicilio 6; software y finanzas no compiten por cercanía', () => {
    expect(radioDe(['comida'], 'local')).toBe(3)
    expect(radioDe(['comida'], 'solo_domicilio')).toBe(6)
    expect(radioDe(['software'], 'local')).toBeNull()
    expect(radioDe(['alojamiento'], 'solo_domicilio')).toBeNull()
    expect(radioDe([], 'local')).toBe(5)
    expect(Math.round(distanciaKm(OLON, { lat: OLON.lat + 0.01, lng: OLON.lng }) * 10) / 10).toBe(1.1)
  })
})

describe('demanda por sede', () => {
  it('una corrida por sede alrededor de su punto (con radio) y la ciudad como respaldo; 2 términos × 10 lugares', () => {
    const r = accionesDeDemandaPorSede({ ahora: AHORA, terminos: ['ceviche', 'restaurante', 'sushi'], sedes: [sedeOlon, sedeGye], familias: ['comida'] })
    expect(r.acciones.map((a) => a.params._brazo)).toEqual(['demanda:olon', 'demanda:guayaquil'])
    expect(r.acciones[0].params).toMatchObject({ searchStringsArray: ['ceviche', 'restaurante'], locationQuery: 'Olón', resultsLimit: 10, customGeolocation: { type: 'Point', coordinates: [OLON.lng, OLON.lat], radiusKm: 3 } })
    expect(r.acciones[1].params.customGeolocation).toMatchObject({ radiusKm: 6 }) // solo domicilio: radio de reparto
    expect(r.acciones[0].usd_max).toBeCloseTo(2 * 10 * 0.003, 6)
  })
  it('solo los miércoles; sin punto pide ubicar la sede por su dirección (una vez por semana) y mira por ciudad declarando el sesgo', () => {
    const sinPunto: SedeConPunto = { ...sedeGye, lat: null, lng: null, origen_del_punto: null }
    const jueves = new Date('2026-10-15T12:00:00Z')
    const j = accionesDeDemandaPorSede({ ahora: jueves, terminos: ['ceviche'], sedes: [sinPunto], familias: ['comida'] })
    expect(j.acciones.map((a) => a.params._brazo)).toEqual(['sede:guayaquil:ubicar'])
    expect(j.acciones[0].params).toMatchObject({ searchStringsArray: ['Avenida 8 NO, Guayaquil, Guayaquil'], resultsLimit: 1 })
    expect(j.no_cubiertas[0].por_que).toMatch(/no tiene punto/)
    const m = accionesDeDemandaPorSede({ ahora: AHORA, terminos: ['ceviche'], sedes: [sinPunto], familias: ['comida'], ubicadasEnLosUltimos7Dias: new Set(['guayaquil']) })
    expect(m.acciones.map((a) => a.params._brazo)).toEqual(['demanda:guayaquil'])
    expect(m.acciones[0].params).not.toHaveProperty('customGeolocation')
    expect(m.acciones[0].objetivo).toMatch(/por ciudad/)
  })
  it('un rubro que no compite por cercanía no pide nada por sede y lo dice; sin sedes, tampoco', () => {
    const s = accionesDeDemandaPorSede({ ahora: AHORA, terminos: ['crm'], sedes: [sedeOlon], familias: ['software'] })
    expect(s.acciones).toEqual([])
    expect(s.no_cubiertas[0].por_que).toMatch(/no aplica por sede/)
    expect(accionesDeDemandaPorSede({ ahora: AHORA, terminos: ['x'], sedes: [], familias: ['comida'] }).no_cubiertas[0].por_que).toMatch(/no tiene sedes/)
  })
  it('las fichas por sede llevan la sede en su clave y NO sugieren competidores (los descubre el módulo de competencia)', () => {
    const r = fichasDeDemanda({ client_id: CL, nombreDelCliente: 'Náufrago', ahora: AHORA, sede: 'olon', ciudad: 'Olón', filas: [filaDemanda('olon', [lugar('Don Villón', { rank: 1 }), lugar('Naufrago', { rank: 2 })]), filaDemanda('guayaquil', [lugar('Otro')])] })
    expect(r.fichas).toHaveLength(1)
    expect(r.fichas[0]).toMatchObject({ atributo: 'mercado:posicion:olon:ceviche', alcance: 'mercado' })
    expect(r.fichas[0].titulo).toMatch(/sede olon/)
    expect(r.fichas[0].contenido).toMatch(/Náufrago aparece en el puesto 2/)
  })
})

describe('descubrir candidatos por sede (código)', () => {
  const entrada = (items: Array<Record<string, unknown>>, o: Record<string, unknown> = {}) => candidatosDeSede({ sede: sedeOlon, filas: [filaDemanda('olon', items)], nombreDelCliente: 'Náufrago', familias: ['comida'], radioKm: 3, ...o })
  it('aplica las reglas de código: no es el cliente, no está cerrado, es del rubro, tiene reseñas y está dentro del radio', () => {
    const r = entrada([
      lugar('Don Villón'), lugar('Naufrago', { placeId: 'propio' }), lugar('Cerrado Hnos', { permanentlyClosed: true }), lugar('Hotel Playa', { categoryName: 'Hotel', categories: ['Hotel'] }),
      lugar('Nuevo Local', { reviewsCount: 2 }), lugar('Lejano', { location: { lat: OLON.lat + 0.3, lng: OLON.lng } }), lugar('Cevichería del Mar', { categoryName: 'Cevichería', categories: ['Marisquería', 'Restaurante'] }),
    ])
    expect(r.candidatos.map((c) => c.nombre).sort()).toEqual(['Cevichería del Mar', 'Don Villón'])
    const por = Object.fromEntries(r.descartados.map((d) => [d.nombre, d.por_que]))
    expect(por['Naufrago']).toMatch(/propio cliente/)
    expect(por['Cerrado Hnos']).toBe('cerrado')
    expect(por['Hotel Playa']).toMatch(/no es del rubro/)
    expect(por['Nuevo Local']).toMatch(/menos de 5 reseñas/)
    expect(por['Lejano']).toMatch(/fuera del radio de 3 km/)
  })
  it('los hechos que ve el agente traen categoría, puntaje, reseñas y distancia; la corrida más nueva manda; los ensayos no cuentan', () => {
    const vieja = filaDemanda('olon', [lugar('Viejo')], { created_at: '2026-10-01T00:00:00Z' })
    const ensayo = filaDemanda('olon', [lugar('De ensayo')], { ensayo: true, created_at: '2026-10-14T13:00:00Z' })
    const r = candidatosDeSede({ sede: sedeOlon, filas: [vieja, filaDemanda('olon', [lugar('Don Villón', { totalScore: 4.8, reviewsCount: 10 })]), ensayo], nombreDelCliente: 'Náufrago', familias: ['comida'], radioKm: 3 })
    expect(r.candidatos.map((c) => c.nombre)).toEqual(['Don Villón'])
    expect(r.candidatos[0].hechos).toMatch(/categoría Marisquería; puntaje 4,8 con 10 reseñas; a 1,\d km de la sede/)
  })
  it('suma los del análisis del alta (sin datos de Mapas) sin repetir los que ya vinieron de Mapas', () => {
    const r = entrada([lugar('Don Villón')], { listaDelAlta: [{ name: 'Don Villón', competitor_type: 'direct' }, { name: 'Rasimar Restaurante', competitor_type: 'indirect', website: 'https://r.example' }] })
    expect(r.candidatos.map((c) => [c.nombre, c.origen])).toEqual([['Don Villón', 'mapas'], ['Rasimar Restaurante', 'alta']])
    expect(r.candidatos[1].hechos).toMatch(/lo nombró el análisis del alta como competidor de tipo indirect/)
  })
  it('sin punto la sede no filtra por distancia (lo declara la distancia desconocida) y deduplica por lugar', () => {
    const r = candidatosDeSede({ sede: { ...sedeOlon, lat: null, lng: null }, filas: [filaDemanda('olon', [lugar('A', { placeId: 'x' }), lugar('A', { placeId: 'x', reviewsCount: 90 })])], nombreDelCliente: 'Náufrago', familias: ['comida'], radioKm: 3 })
    expect(r.candidatos).toHaveLength(1)
    expect(r.candidatos[0].distancia_km).toBeNull()
    expect(r.candidatos[0].hechos).toMatch(/distancia desconocida/)
  })
  it('agnóstico: una clínica y un taller (3 rubros) filtran por SU familia, no por la de comida', () => {
    const clin = candidatosDeSede({ sede: sedeOlon, filas: [filaDemanda('olon', [lugar('Dental Norte', { categoryName: 'Clínica dental' }), lugar('Pizzería', { categoryName: 'Pizzería' })])], nombreDelCliente: 'Sonrisa', familias: ['salud'], radioKm: 8 })
    expect(clin.candidatos.map((c) => c.nombre)).toEqual(['Dental Norte'])
    const taller = candidatosDeSede({ sede: sedeOlon, filas: [filaDemanda('olon', [lugar('Taller Rápido', { categoryName: 'Taller mecánico' }), lugar('Clínica', { categoryName: 'Clínica dental' })])], nombreDelCliente: 'El Pistón', familias: ['automotriz'], radioKm: 6 })
    expect(taller.candidatos.map((c) => c.nombre)).toEqual(['Taller Rápido'])
  })
})

describe('el juez de competencia (guardas de código)', () => {
  const c = (nombre: string, hechos: string) => ({ nombre, slug: nombre.toLowerCase().replace(/\W+/g, '-'), sede: 'olon', origen: 'mapas' as const, categoria: null, puntaje: 4, resenas: 20, distancia_km: 1, direccion: null, web: null, url: null, place_id: null, tipo_del_alta: null, hechos, puesto: 1, termino: null })
  const A = c('Alfa', 'categoría Marisquería; puntaje 4,5 con 40 reseñas; a 1,1 km de la sede')
  const B = c('Beta', 'categoría Pizzería; puntaje 4,0 con 12 reseñas; a 2,5 km de la sede')
  const respuesta = (d: unknown[]) => JSON.stringify({ decisiones: d })
  it('una cita literal vale; sin cita o con una cita inventada es duda; un veredicto desconocido o un n inventado se ignora', () => {
    const j = aplicarGuardasDeCompetencia([A, B, c('Gamma', 'categoría Bar; 8 reseñas'), c('Delta', 'categoría Cevichería; 30 reseñas')], respuesta([
      { n: 1, veredicto: 'competidor', cita: 'categoría Marisquería', razon: 'mismo rubro y cerca' }, { n: 2, veredicto: 'no', cita: 'una frase que no existe', razon: 'otro rubro' },
      { n: 3, veredicto: 'quizas', cita: 'categoría Bar' }, { n: 99, veredicto: 'competidor', cita: 'x' },
    ]))
    expect(j.map((x) => [x.candidato.nombre, x.veredicto])).toEqual([['Alfa', 'competidor'], ['Beta', 'duda'], ['Gamma', 'duda'], ['Delta', 'duda']])
    expect(j[1].degradada_por).toMatch(/sin cita literal/)
    expect(j[3].razon).toMatch(/no decidió/)
  })
  it('nunca más de 5 competidores por sede: los de más puntuación primero, el resto pasa a duda con su motivo', () => {
    const muchos = Array.from({ length: 7 }, (_, i) => c(`C${i}`, `categoría Marisquería ${i}`))
    const j = aplicarGuardasDeCompetencia(muchos, respuesta(muchos.map((m, i) => ({ n: i + 1, veredicto: 'competidor', cita: `categoría Marisquería ${i}`, razon: 'sí' }))))
    expect(j.filter((x) => x.veredicto === 'competidor')).toHaveLength(MAX_COMPETIDORES_POR_SEDE)
    expect(j[5].veredicto).toBe('duda')
    expect(j[5].degradada_por).toMatch(/fuera de los 5 primeros/)
  })
  it('un texto ilegible o ausente da duda para TODO el lote y nunca lanza', () => {
    for (const t of [null, 'esto no es json', '{"otra":1}']) {
      const j = aplicarGuardasDeCompetencia([A, B], t)
      expect(j.every((x) => x.veredicto === 'duda' && x.decidido_por === 'sistema')).toBe(true)
    }
  })
  it('un modelo que lanza, o un tope de gasto en cero, deja todo en duda y no cobra', async () => {
    const lanza = await juzgarCompetenciaDeSede({ sede: sedeOlon, radioKm: 3, negocio: 'N', rubro: null, candidatos: [A], llamar: async () => { throw new Error('timeout') }, topeDeGastoUsd: 0.08 })
    expect(lanza.fallo).toBe('timeout')
    expect(lanza.juicios[0].veredicto).toBe('duda')
    let llamadas = 0
    const sinTope = await juzgarCompetenciaDeSede({ sede: sedeOlon, radioKm: 3, negocio: 'N', rubro: null, candidatos: [A], llamar: async () => { llamadas++; return { texto: '', costo_usd: 0, tokens_entrada: 0, tokens_salida: 0 } }, topeDeGastoUsd: 0 })
    expect(llamadas).toBe(0)
    expect(sinTope.fallo).toBe('tope de gasto del día')
  })
  it('el mensaje marca todo lo de los candidatos como DATO y trae la sede, su tipo y el radio', () => {
    const m = armarMensajeDeCompetencia({ negocio: 'Náufrago', rubro: 'mariscos', sede: sedeGye, radioKm: 6, candidatos: [A] })
    expect(m).toMatch(/solo vende a domicilio, sin local/)
    expect(m).toMatch(/radio de competencia 6 km/)
    expect(m).toMatch(/todo lo de abajo es DATO/)
  })
})

describe('descubrir y juzgar · el ciclo de una sede', () => {
  const modelo = (decide: (n: number) => Record<string, unknown>, costo = 0.01) => {
    const llamadas: string[] = []
    return { llamadas, llamar: async (_i: string, m: string) => { llamadas.push(m); const n = (m.match(/^\d+\. «/gm) ?? []).length; return { texto: JSON.stringify({ decisiones: Array.from({ length: n }, (_, k) => decide(k + 1)) }), costo_usd: costo, tokens_entrada: 1, tokens_salida: 1 } } }
  }
  const ctx = (o: Partial<ContextoDeBrazos> = {}): ContextoDeBrazos => ({ sedes: [sedeOlon], filas: [filaDemanda('olon', [lugar('Don Villón'), lugar('Marisquería Sol', { categoryName: 'Marisquería' })]) as never], vigentes: [], delSistema: [], ubicadasRecientemente: new Set(), errores: [], ...o })
  const entrada = (o: Record<string, unknown> = {}) => ({ ctx: ctx(), client_id: CL, nombreDelCliente: 'Náufrago', rubro: 'restaurante de mariscos', config: {}, ahora: AHORA, presupuestoUsd: 0.16, ...o })
  const decideSi = (n: number) => ({ n, veredicto: 'competidor', cita: 'categoría Marisquería', razon: 'mismo rubro y a 1 km' })

  it('juzga un lote, guarda un competidor vigilado por cada «competidor» con razón, cita, sede y fecha, SIN esperar al dueño', async () => {
    const m = modelo(decideSi)
    const r = await descubrirYJuzgar(entrada({ llamarModelo: m.llamar }))
    expect(m.llamadas).toHaveLength(1)
    expect(r.por_sede.olon).toMatchObject({ estado: 'evaluada', candidatos: 2, competidores: 2 })
    const f = r.fichas.filter((x) => x.clase === 'competidor_vigilado')
    expect(f.map((x) => x.sobre).sort()).toEqual(['Don Villón', 'Marisquería Sol'])
    for (const x of f) {
      expect(x.alcance).toBe('competidor')
      expect(x.contenido).toMatch(/sin esperar al dueño/)
      expect(x.contenido).toMatch(/cita: «categoría Marisquería»/)
      expect(x.datos).toMatchObject({ sede: 'olon', veredicto: 'competidor', evaluado_en: iso(AHORA) })
    }
    expect(r.costo_usd).toBeCloseTo(0.01, 6)
  })
  it('lo que no compite o queda en duda se guarda como evaluación (no se vigila) y no se retira nada por una duda', async () => {
    const vigente = { clase: 'competidor_vigilado', atributo: 'competidor:marisqueria-sol:vigilado:olon', ref: 'brazo:x', observado_en: '2026-08-01T00:00:00Z', provenance_tag: { datos: { slug: 'marisqueria-sol', sede: 'olon', nombre: 'Marisquería Sol' } } }
    const m = modelo((n) => (n === 1 ? { n, veredicto: 'no', cita: 'categoría Marisquería', razon: 'otro formato' } : { n, veredicto: 'duda', razon: 'no sé' }))
    const r = await descubrirYJuzgar(entrada({ llamarModelo: m.llamar, ctx: ctx({ vigentes: [vigente] }) }))
    expect(r.fichas.every((x) => x.clase === 'competidor_evaluacion')).toBe(true)
    // «Don Villón» (puesto 1) fue «no» → si hubiera estado vigilado se retiraría; «Marisquería Sol» quedó en duda → NO se retira
    expect(r.retiros).toEqual([])
  })
  it('cada mes: una sede evaluada hace menos de 30 días no se vuelve a evaluar; a los 30, sí, y el que dejó de competir se RETIRA con su motivo', async () => {
    const vigente = (slug: string) => ({ clase: 'competidor_vigilado', atributo: `competidor:${slug}:vigilado:olon`, ref: 'brazo:x', observado_en: '2026-09-20T00:00:00Z', provenance_tag: { datos: { slug, sede: 'olon', nombre: slug } } })
    expect(debeEvaluarse([vigente('a')], 'olon', AHORA)).toBe(false) // 24 días
    expect(debeEvaluarse([vigente('a')], 'olon', new Date('2026-10-21T00:00:00Z'))).toBe(true) // 31 días
    expect(debeEvaluarse([], 'olon', AHORA)).toBe(true)
    expect(debeEvaluarse([vigente('a')], 'olon', AHORA, true)).toBe(true)
    const m = modelo(() => ({ n: 1, veredicto: 'competidor', cita: 'categoría Marisquería', razon: 'sí' }))
    const alDia = await descubrirYJuzgar(entrada({ llamarModelo: m.llamar, ctx: ctx({ vigentes: [vigente('antiguo')] }) }))
    expect(alDia.por_sede.olon.estado).toBe('al_dia')
    expect(m.llamadas).toHaveLength(0)
    // 31 días después: «antiguo» ya no está entre los candidatos pero fue filtrado por cerrado → se retira con motivo; «viejo» no aparece (nada se retira por ausencia)
    const filas = [filaDemanda('olon', [lugar('Don Villón'), lugar('Antiguo', { permanentlyClosed: true })]) as never]
    const r = await descubrirYJuzgar(entrada({ llamarModelo: m.llamar, ahora: new Date('2026-10-21T12:00:00Z'), ctx: ctx({ filas, vigentes: [vigente('antiguo'), vigente('viejo')] }) }))
    expect(r.retiros).toEqual([{ client_id: CL, atributo: 'competidor:antiguo:vigilado:olon', motivo: expect.stringMatching(/reevaluación 2026-10-21: cerrado/) }])
  })
  it('un «no» del agente (con cita) retira al que estaba vigilado, con la razón', async () => {
    const vig = { clase: 'competidor_vigilado', atributo: 'competidor:don-villon:vigilado:olon', ref: 'brazo:x', observado_en: '2026-08-01T00:00:00Z', provenance_tag: { datos: { slug: 'don-villon', sede: 'olon', nombre: 'Don Villón' } } }
    const m = modelo((n) => ({ n, veredicto: 'no', cita: 'categoría Marisquería', razon: 'ahora es solo catering' }))
    const r = await descubrirYJuzgar(entrada({ llamarModelo: m.llamar, ctx: ctx({ vigentes: [vig] }) }))
    expect(r.retiros[0]).toMatchObject({ atributo: 'competidor:don-villon:vigilado:olon', motivo: expect.stringMatching(/ya no compite \(ahora es solo catering\)/) })
  })
  it('si el modelo responde basura (sin falla de red) NO se retira nada aunque haya un cerrado; y una evaluación de otra sede no retira en esta', async () => {
    const vig = (sede: string) => ({ clase: 'competidor_vigilado', atributo: `competidor:antiguo:vigilado:${sede}`, ref: 'brazo:x', observado_en: '2026-08-01T00:00:00Z', provenance_tag: { datos: { slug: 'antiguo', sede, nombre: 'Antiguo' } } })
    const filas = [filaDemanda('olon', [lugar('Don Villón'), lugar('Antiguo', { permanentlyClosed: true })]) as never]
    const basura = await descubrirYJuzgar(entrada({ ctx: ctx({ filas, vigentes: [vig('olon')] }), llamarModelo: async () => ({ texto: 'no es json', costo_usd: 0.001, tokens_entrada: 1, tokens_salida: 1 }) }))
    expect(basura.retiros).toEqual([])
    const ok = modelo(decideSi)
    const otraSede = await descubrirYJuzgar(entrada({ ctx: ctx({ filas, vigentes: [vig('guayaquil')] }), llamarModelo: ok.llamar }))
    expect(otraSede.retiros).toEqual([])
    const estaSede = await descubrirYJuzgar(entrada({ ctx: ctx({ filas, vigentes: [vig('olon')] }), llamarModelo: ok.llamar }))
    expect(estaSede.retiros).toHaveLength(1)
  })
  it('si el modelo falla NO se retira nada y se declara; en seco (sin modelo) se muestran los candidatos y no se juzga', async () => {
    const vig = { clase: 'competidor_vigilado', atributo: 'competidor:don-villon:vigilado:olon', ref: 'brazo:x', observado_en: '2026-08-01T00:00:00Z', provenance_tag: { datos: { slug: 'don-villon', sede: 'olon', nombre: 'Don Villón' } } }
    const falla = await descubrirYJuzgar(entrada({ llamarModelo: async () => { throw new Error('caído') }, ctx: ctx({ vigentes: [vig] }) }))
    expect(falla.retiros).toEqual([])
    expect(falla.fichas).toEqual([])
    expect(falla.declarado.join(' ')).toMatch(/no pudo juzgar \(caído\); no se retiró nada/)
    const seco = await descubrirYJuzgar(entrada())
    expect(seco.por_sede.olon).toMatchObject({ estado: 'sin_modelo', candidatos: 2 })
    expect(seco.fichas).toEqual([])
  })
  it('sin candidatos, sin corrida de posición, rubro sin radio o sin sedes: lo dice y no llama al modelo', async () => {
    const m = modelo(decideSi)
    const sinCorrida = await descubrirYJuzgar(entrada({ llamarModelo: m.llamar, ctx: ctx({ filas: [] }) }))
    expect(sinCorrida.por_sede.olon).toMatchObject({ estado: 'sin_candidatos' })
    expect(sinCorrida.por_sede.olon.detalle).toMatch(/todavía no hay corrida/)
    const software = await descubrirYJuzgar(entrada({ llamarModelo: m.llamar, rubro: 'software CRM para pymes' }))
    expect(software.por_sede.olon.estado).toBe('no_aplica')
    const sinSedes = await descubrirYJuzgar(entrada({ llamarModelo: m.llamar, ctx: ctx({ sedes: [] }) }))
    expect(sinSedes.declarado[0]).toMatch(/no tiene sedes/)
    expect(m.llamadas).toHaveLength(0)
  })
  it('dos sedes: un lote por sede, y el presupuesto se reparte (la segunda se queda en duda si se acabó)', async () => {
    const dos = ctx({ sedes: [sedeOlon, sedeGye], filas: [filaDemanda('olon', [lugar('A')]), filaDemanda('guayaquil', [lugar('B', { location: { lat: -2.16, lng: -79.9 } })])] as never })
    const m = modelo(decideSi, 0.2)
    const r = await descubrirYJuzgar(entrada({ ctx: dos, llamarModelo: m.llamar, presupuestoUsd: 0.16 }))
    expect(m.llamadas).toHaveLength(1)
    expect(r.por_sede.olon.estado).toBe('evaluada')
    expect(r.por_sede.guayaquil.estado).toBe('fallo')
    expect(r.por_sede.guayaquil.detalle).toMatch(/tope de gasto/)
  })
})

describe('los vigilados: dueño + sistema − vetados · reparto por día', () => {
  const sis = (nombre: string, sede: string, o: Partial<Competidor> = {}): Competidor => ({ nombre, slug: nombre.toLowerCase().replace(/\W+/g, '-'), tipo: 'direct', web: null, sitio_propio: null, instagram: null, sedes: [sede], origen: 'sistema', ...o })
  it('sin confirmación del dueño los del sistema se vigilan igual; el dueño agrega y VETA (vetar gana)', () => {
    const r = competidoresVigilados({ config: { apify: { competidores_vetados: ['Beta'], competidores_agregados: [{ name: 'Gamma', website: 'https://gamma.example', instagram: '@gamma' }] } }, delSistema: [sis('Alfa', 'olon'), sis('Beta', 'olon')] })
    expect(r.vigilados.map((c) => c.nombre).sort()).toEqual(['Alfa', 'Gamma'])
    expect(r.vigilados.find((c) => c.nombre === 'Gamma')).toMatchObject({ origen: 'dueno', instagram: 'gamma', sitio_propio: 'https://gamma.example' })
    expect(r.motivo).toBeNull()
  })
  it('un competidor de dos sedes es UNO con sus dos sedes; sin nadie dice cómo se llena la lista', () => {
    const r = competidoresVigilados({ config: {}, delSistema: [sis('Alfa', 'olon'), sis('Alfa', 'guayaquil')] })
    expect(r.vigilados).toHaveLength(1)
    expect(r.vigilados[0].sedes.sort()).toEqual(['guayaquil', 'olon'])
    expect(competidoresVigilados({ config: {}, delSistema: [] }).motivo).toMatch(/el sistema los descubre/)
  })
  it('hasta 10 en total, a lo más 2 por día hábil, y las acciones de un día no mezclan a los de otro', () => {
    const diez = Array.from({ length: 12 }, (_, i) => sis(`Comp ${String(i).padStart(2, '0')}`, 'olon'))
    const v = competidoresVigilados({ config: {}, delSistema: diez })
    expect(v.vigilados).toHaveLength(10)
    const porDia = new Map<number, number>()
    v.vigilados.forEach((_, i) => porDia.set(diaDeCompetidor(i), (porDia.get(diaDeCompetidor(i)) ?? 0) + 1))
    expect([...porDia.entries()].sort()).toEqual([[1, 2], [2, 2], [3, 2], [4, 2], [5, 2]])
    const lunes = accionesDeCompetencia({ vigilados: v.vigilados, ahora: new Date('2026-10-12T12:00:00Z'), ciudad: 'Olón' })
    expect(new Set(lunes.map((a) => String(a.params._brazo).split(':')[1])).size).toBe(2)
  })
  it('los anuncios van cada dos semanas, alternando: dos competidores del mismo día nunca los piden la misma semana', () => {
    const v = [sis('Alfa', 'olon'), sis('Beta', 'olon'), sis('Gamma', 'olon'), sis('Delta', 'olon'), sis('Epsilon', 'olon'), sis('Zeta', 'olon')]
    const lunes = (d: string) => accionesDeCompetencia({ vigilados: v, ahora: new Date(`${d}T12:00:00Z`), ciudad: 'Olón', pais: 'ec', anunciosCadaSemanas: 2 }).filter((a) => a.funcion === 'facebook_ads_library_scraper').map((a) => String(a.params._brazo).split(':')[1])
    const s1 = lunes('2026-10-12'), s2 = lunes('2026-10-19')
    expect(s1).toHaveLength(1)
    expect(s2).toHaveLength(1)
    expect(s1[0]).not.toBe(s2[0])
    expect(semanaIso(new Date('2026-10-12T00:00:00Z'))).toBe(42)
    expect(semanaIso(new Date('2026-01-01T00:00:00Z'))).toBe(1)
    expect(semanaIso(new Date('2027-01-01T00:00:00Z'))).toBe(53)
  })
  it('la búsqueda del competidor se hace alrededor del punto de SU sede', () => {
    const a = accionesDeCompetencia({ vigilados: [sis('Alfa', 'olon')], ahora: new Date('2026-10-12T12:00:00Z'), ciudad: 'X', sedes: { olon: { lat: OLON.lat, lng: OLON.lng, ciudad: 'Olón' } }, radioKm: 3, forzar: true })
    expect(a[0].params).toMatchObject({ searchStringsArray: ['Alfa'], locationQuery: 'Olón', customGeolocation: { coordinates: [OLON.lng, OLON.lat], radiusKm: 3 } })
  })
  it('el sistema lee de las fichas vigentes: competidores con su sede y la cuenta de Instagram descubierta', () => {
    const v = [
      { clase: 'competidor_vigilado', provenance_tag: { datos: { nombre: 'Alfa', slug: 'alfa', sede: 'olon', web: 'https://a.example' } } },
      { clase: 'competidor_vigilado', provenance_tag: { datos: { nombre: 'Alfa', slug: 'alfa', sede: 'guayaquil' } } },
      { clase: 'competidor_cuenta', provenance_tag: { datos: { slug: 'alfa', instagram: 'alfa.ok' } } },
      { clase: 'competidor_evaluacion', provenance_tag: { datos: { nombre: 'No', slug: 'no', sede: 'olon' } } },
      { clase: 'competidor_vigilado', retirada_en: '2026-10-01', provenance_tag: { datos: { nombre: 'Retirado', slug: 'retirado', sede: 'olon' } } },
    ]
    const r = competidoresDelSistema(v)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ nombre: 'Alfa', instagram: 'alfa.ok', origen: 'sistema' })
    expect(r[0].sedes.sort()).toEqual(['guayaquil', 'olon'])
  })
  it('la cuenta de Instagram se toma de SU ficha o SU sitio (la que más se repite; sin rutas que no son cuentas)', () => {
    expect(handleDeInstagram('<a href="https://www.instagram.com/rasimar.ok/">x</a> <a href="https://instagram.com/p/AbC/">y</a> instagram.com/rasimar.ok')).toBe('rasimar.ok')
    expect(handleDeInstagram('https://instagram.com/explore/ https://instagram.com/reel/xyz')).toBeNull()
    expect(handleDeInstagram({ website: 'https://instagram.com/@cuenta_x', otra: 'nada' })).toBe('cuenta_x')
    expect(handleDeInstagram('sin enlaces')).toBeNull()
  })
  it('fichas de la cuenta descubierta (clase competidor_cuenta) cuando el competidor no la tenía', () => {
    const v = [sis('Rasimar Restaurante', 'olon', { sitio_propio: 'https://rasimar.example' })]
    const filas: FilaCrudaDeBrazo[] = [{ id: 'm', apify_function: 'competitor_website_scraper', ensayo: false, created_at: '2026-10-13T13:00:00Z', params: { _brazo: 'competencia:rasimar-restaurante:sitio' }, respuesta: [{ url: 'https://rasimar.example', text: 'Síguenos https://instagram.com/rasimar.ok' }] }]
    const r = fichasDeCompetencia({ client_id: CL, vigilados: v, filas })
    const cuenta = r.fichas.find((f) => f.clase === 'competidor_cuenta')!
    expect(cuenta.datos).toEqual({ instagram: 'rasimar.ok', slug: 'rasimar-restaurante' })
    expect(cuenta.alcance).toBe('competidor')
    // y con la cuenta ya conocida no hay ficha de cuenta
    expect(fichasDeCompetencia({ client_id: CL, vigilados: [{ ...v[0], instagram: 'rasimar.ok' }], filas }).fichas.some((f) => f.clase === 'competidor_cuenta')).toBe(false)
  })
})

describe('el plan de los brazos por sede · tope y declaraciones', () => {
  const cliente = { id: CL, name: 'Náufrago', industry: 'restaurante de mariscos', country: 'Ecuador', market: 'Olón, Ecuador', config: { apify: {} } }
  const ctx = { sedes: [sedeOlon, sedeGye], delSistema: [] as Competidor[], ubicadasRecientemente: new Set<string>() }
  it('con sedes, la demanda va por sede (no por ciudad)', () => {
    const r = accionesDeBrazos({ brazos: { ...BRAZOS_APAGADOS, demanda: true }, cliente, ahora: AHORA, ctx })
    expect(r.acciones.map((a) => a.params._brazo)).toEqual(['demanda:olon', 'demanda:guayaquil'])
    expect(r.acciones.every((a) => a.params.customGeolocation)).toBe(true)
  })
  it('lo que pasa del tope del día se DECLARA y no se pide', () => {
    const muchos: Competidor[] = Array.from({ length: 10 }, (_, i) => ({ nombre: `Comp ${i}`, slug: `comp-${i}`, tipo: 'direct', web: `https://c${i}.example`, sitio_propio: `https://c${i}.example`, instagram: `c${i}`, sedes: ['olon'], origen: 'sistema' }))
    // los 10 caen en 5 días: los dos de un mismo día con Instagram y sitio propio superan el tope si piden todo
    for (const dia of ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16']) {
      const r = accionesDeBrazos({ brazos: { ...BRAZOS_APAGADOS, competencia: true }, cliente, ahora: new Date(`${dia}T12:00:00Z`), ctx: { ...ctx, delSistema: muchos } })
      expect(r.acciones.reduce((s, a) => s + a.usd_max, 0)).toBeLessThanOrEqual(TOPE_DIARIO_DE_BRAZOS_USD + 1e-9)
      expect(r.acciones.length).toBeGreaterThan(0)
    }
  })
  it('los anuncios van cada dos semanas también en el plan: dos competidores del mismo día no los piden juntos', () => {
    const c = (n: string): Competidor => ({ nombre: n, slug: n.toLowerCase(), tipo: 'direct', web: null, sitio_propio: null, instagram: null, sedes: ['olon'], origen: 'sistema' })
    const v = Array.from({ length: 6 }, (_, i) => c(`Comp${i}`))
    const lunes = accionesDeBrazos({ brazos: { ...BRAZOS_APAGADOS, competencia: true }, cliente: { ...cliente, country: 'Ecuador' }, ahora: new Date('2026-10-12T12:00:00Z'), ctx: { ...ctx, delSistema: v } })
    expect(lunes.acciones.filter((a) => a.funcion === 'facebook_ads_library_scraper')).toHaveLength(1)
    expect(lunes.acciones.filter((a) => a.funcion === 'google_maps_scraper')).toHaveLength(2)
  })
  it('un tope más bajo corta lo que no cabe y lo dice (el orden de la lista manda)', () => {
    const c = (n: string): Competidor => ({ nombre: n, slug: n.toLowerCase(), tipo: 'direct', web: 'https://x.example', sitio_propio: 'https://x.example', instagram: n.toLowerCase(), sedes: ['olon'], origen: 'sistema' })
    const v = Array.from({ length: 6 }, (_, i) => c(`Comp${i}`))
    const lunes = new Date('2026-10-12T12:00:00Z')
    const libre = accionesDeBrazos({ brazos: { ...BRAZOS_APAGADOS, competencia: true }, cliente, ahora: lunes, ctx: { ...ctx, delSistema: v } })
    const corto = accionesDeBrazos({ brazos: { ...BRAZOS_APAGADOS, competencia: true }, cliente, ahora: lunes, ctx: { ...ctx, delSistema: v }, topeDiarioUsd: 0.1 })
    expect(libre.acciones.length).toBeGreaterThan(corto.acciones.length)
    expect(corto.acciones.reduce((s, a) => s + a.usd_max, 0)).toBeLessThanOrEqual(0.1 + 1e-9)
    expect(corto.no_cubiertas.some((n) => /tope diario de los brazos \(US\$ 0,10\)|tope diario de los brazos \(US\$ 0\.10\)/.test(n.por_que))).toBe(true)
  })
})

describe('integración · correrBrazos con sedes, modelo simulado y base falsa', () => {
  const tablas = () => ({
    client_sedes: [{ id: 's-olon', client_id: CL, clave: 'olon', ciudad: 'Olon' }, { id: 's-gye', client_id: CL, clave: 'guayaquil', ciudad: 'Guayaquil' }],
    client_sede_datos: [{ sede_id: 's-olon', client_id: CL, campo: 'tipo_de_atencion', valor_texto: 'restaurante (local) y domicilio' }, { sede_id: 's-gye', client_id: CL, campo: 'tipo_de_atencion', valor_texto: 'solo domicilio (sin local)' }, { sede_id: 's-gye', client_id: CL, campo: 'direccion', valor_texto: 'Avenida 8 NO, Guayaquil' }],
    apify_raw: [
      { id: 'own', client_id: CL, apify_function: 'own_google_maps_profile', ensayo: false, created_at: '2026-10-14T10:00:00Z', params: {}, respuesta: [{ title: 'Naufrago', city: 'Olon', location: OLON }] },
      { ...filaDemanda('olon', [lugar('Don Villón'), lugar('Marisquería Sol')]), id: 'd1', client_id: CL },
      { ...filaDemanda('guayaquil', [lugar('Cevichería Puerto', { location: { lat: -2.16, lng: -79.9 }, address: 'Guayaquil' })]), id: 'd2', client_id: CL },
    ],
    cerebro_fichas: [] as Array<Record<string, unknown>>, cerebro_ingresos: [] as Array<Record<string, unknown>>,
  })
  const cliente = { id: CL, name: 'Náufrago', slug: 'naufrago', industry: 'restaurante de mariscos', country: 'Ecuador', config: { apify: {} } }
  const modelo = async (_i: string, m: string) => ({ texto: JSON.stringify({ decisiones: (m.match(/^\d+\. «/gm) ?? []).map((_x, k) => ({ n: k + 1, veredicto: 'competidor', cita: 'categoría Marisquería', razon: 'compite' })) }), costo_usd: 0.012, tokens_entrada: 1, tokens_salida: 1 })

  it('descubre por sede, el agente juzga, se archivan fichas con alcance y datos; la segunda corrida del día no duplica; a los 5 días nadie se re-evalúa', async () => {
    const t = tablas()
    const base = crearBaseFalsa(t as never)
    const r = await correrBrazos({ db: base.db, brazos: { ...BRAZOS_APAGADOS, demanda: true, competencia: true }, cliente, client_id: CL, filas: [], ahora: AHORA, dry_run: false, llamarModelo: modelo })
    expect(r.errores).toEqual([])
    expect(r.por_sede?.olon).toMatchObject({ estado: 'evaluada', candidatos: 2, competidores: 2 })
    expect(r.por_sede?.guayaquil).toMatchObject({ estado: 'evaluada', competidores: 1 })
    expect(r.costo_modelo_usd).toBeCloseTo(0.024, 6)
    const vig = t.cerebro_fichas.filter((f) => f.clase === 'competidor_vigilado')
    expect(vig).toHaveLength(3)
    for (const f of vig) {
      expect(f).toMatchObject({ alcance: 'competidor', propiedad: 'ajena', juzgado_por: 'regla' })
      expect((f.provenance_tag as { datos: Record<string, unknown> }).datos).toMatchObject({ veredicto: 'competidor', evaluado_en: iso(AHORA) })
    }
    // posición por sede (no por ciudad)
    expect(t.cerebro_fichas.filter((f) => f.clase === 'mercado_posicion').map((f) => f.atributo).sort()).toEqual(['mercado:posicion:guayaquil:ceviche', 'mercado:posicion:olon:ceviche'])
    const otra = await correrBrazos({ db: base.db, brazos: { ...BRAZOS_APAGADOS, demanda: true, competencia: true }, cliente, client_id: CL, filas: [], ahora: new Date('2026-10-14T18:00:00Z'), dry_run: false, llamarModelo: modelo })
    expect(otra.por_sede?.olon.estado).toBe('al_dia')
    expect(t.cerebro_fichas.filter((f) => f.clase === 'competidor_vigilado')).toHaveLength(3)
  })
  it('en seco: muestra los candidatos, no llama al modelo y no escribe nada', async () => {
    const t = tablas()
    const base = crearBaseFalsa(t as never)
    const r = await correrBrazos({ db: base.db, brazos: { ...BRAZOS_APAGADOS, competencia: true }, cliente, client_id: CL, filas: [], ahora: AHORA, dry_run: true })
    expect(r.por_sede?.olon).toMatchObject({ estado: 'sin_modelo', candidatos: 2 })
    expect(base.escrituras).toEqual([])
  })
  it('los juzgados entran a la vigilancia: el plan del día de la semana de cada uno pide sus funciones, por sede', async () => {
    const t = tablas()
    const base = crearBaseFalsa(t as never)
    await correrBrazos({ db: base.db, brazos: { ...BRAZOS_APAGADOS, demanda: true, competencia: true }, cliente, client_id: CL, filas: [], ahora: AHORA, dry_run: false, llamarModelo: modelo })
    const ctx = await cargarContextoDeBrazos(base.db, CL, cliente as never, AHORA)
    expect(ctx.delSistema.map((c) => c.nombre).sort()).toEqual(['Cevichería Puerto', 'Don Villón', 'Marisquería Sol'])
    const dias = [12, 13, 14, 15, 16].map((d) => accionesDeBrazos({ brazos: { ...BRAZOS_APAGADOS, competencia: true }, cliente, ahora: new Date(`2026-10-${d}T12:00:00Z`), ctx }).acciones)
    expect(dias.flat().filter((a) => a.funcion === 'google_maps_scraper')).toHaveLength(3) // una ficha de Mapas por competidor en la semana
    expect(dias.flat().every((a) => String(a.params._brazo).startsWith('competencia:'))).toBe(true)
  })
  it('una lectura fallida del contexto se DICE (no se escribe a ciegas)', async () => {
    const t = tablas()
    const base = crearBaseFalsa(t as never, { fallaEn: 'client_sedes' })
    const r = await correrBrazos({ db: base.db, brazos: { ...BRAZOS_APAGADOS, competencia: true }, cliente, client_id: CL, filas: [], ahora: AHORA, dry_run: false, llamarModelo: modelo })
    expect(r.errores.join(' ')).toMatch(/lectura de los brazos: client_sedes/)
  })
})

describe('archivo · retiros sin reemplazo', () => {
  it('retira solo fichas `brazo:` por atributo, con su motivo; en seco solo cuenta', async () => {
    const t = { cerebro_fichas: [
      { id: 'a', client_id: CL, ref: 'brazo:competencia:x:vigilado:olon:2026-09-01', atributo: 'competidor:x:vigilado:olon', retirada_en: null },
      { id: 'b', client_id: CL, ref: 'portero:otra', atributo: 'competidor:x:vigilado:olon', retirada_en: null },
    ] as Array<Record<string, unknown>>, cerebro_ingresos: [] as Array<Record<string, unknown>> }
    const base = crearBaseFalsa(t)
    const seco = await archivarFichasDeBrazos({ db: base.db, fichas: [], retiros: [{ client_id: CL, atributo: 'competidor:x:vigilado:olon', motivo: 'ya no compite' }], ahora: AHORA, dry_run: true })
    expect(seco.plan).toEqual([{ ref: 'brazo:competencia:x:vigilado:olon:2026-09-01', accion: 'retira', alcance: 'competidor' }])
    expect(base.escrituras).toEqual([])
    const r = await archivarFichasDeBrazos({ db: base.db, fichas: [], retiros: [{ client_id: CL, atributo: 'competidor:x:vigilado:olon', motivo: 'ya no compite' }], ahora: AHORA, dry_run: false })
    expect(r.retiradas).toBe(1)
    expect(t.cerebro_fichas[0]).toMatchObject({ motivo_retirada: 'ya no compite' })
    expect(t.cerebro_fichas[0].retirada_en).toBeTruthy()
    expect(t.cerebro_fichas[1].retirada_en).toBeNull() // la del portero no se toca
  })
})

describe('integración · alimentar (el ciclo diario) con la competencia por sede', () => {
  for (const c of CASOS) {
    it(`${c.nombre} (${c.voz}): el juez corre dentro del ciclo, su costo cuenta en el gasto del portero y queda en el rastro del día`, async () => {
      const t = tablasDelCaso(c) as Record<string, Array<Record<string, unknown>>>
      t.client_sedes = [{ id: 's-1', client_id: c.id, ciudad: c.ciudad, clave: 'central' }]
      t.client_sede_datos = [{ sede_id: 's-1', client_id: c.id, campo: 'tipo_de_atencion', valor_texto: 'local de atención al público' }]
      t.apify_raw.push({ id: 'dem', client_id: c.id, apify_function: 'google_maps_scraper', ensayo: false, created_at: '2026-10-15T13:00:00.000Z', params: { _brazo: 'demanda:central' }, respuesta: [{ title: `Rival de ${c.nombre}`, categoryName: 'Restaurante', categories: ['Restaurante', 'Clínica dental', 'Taller mecánico', 'Empresa de software'], totalScore: 4.4, reviewsCount: 30, location: { lat: 0, lng: 0 }, placeId: 'rv', rank: 1, searchString: 'x' }] })
      let mensajes = 0
      const llamarModelo = async (_i: string, m: string) => { mensajes++; return { texto: JSON.stringify({ decisiones: (m.match(/^\d+\. «/gm) ?? []).map((_x, k) => ({ n: k + 1, veredicto: 'competidor', cita: 'puntaje 4,4', razon: 'compite' })) }), costo_usd: 0.021, tokens_entrada: 1, tokens_salida: 1 } }
      const base = crearBaseFalsa(t as never)
      const r = await alimentarCliente({ db: base.db, client_id: c.id, ...REAL, interruptores: ON, ahora: new Date('2026-10-15T15:00:00Z'), brazos: { ...BRAZOS_APAGADOS, competencia: true }, llamarModelo })
      expect(r.errores).toEqual([])
      // un software no compite por cercanía: no aplica por sede y no se gasta ni una llamada (agnóstico: el radio sale del rubro)
      if (/software/i.test(c.rubro)) {
        expect(mensajes).toBe(0)
        expect(r.brazos?.por_sede?.central.estado).toBe('no_aplica')
        expect(r.gasto.modelo_usd).toBe(0)
        return
      }
      expect(mensajes).toBe(1)
      expect(r.brazos?.por_sede?.central.estado).toBe('evaluada')
      expect(r.gasto.modelo_usd).toBeCloseTo(0.021, 6)
      const corrida = t.cerebro_portero_corridas[0]
      expect(Number(corrida.gasto_modelo_usd)).toBeCloseTo(0.021, 6)
      expect(JSON.stringify(corrida.resumen)).toMatch(/"brazos"/)
      expect(t.cerebro_fichas.some((f) => f.clase === 'competidor_vigilado' && f.alcance === 'competidor')).toBe(true)
    })
  }
  it('en seco el ciclo no llama al modelo aunque tenga uno inyectado... salvo que la ruta lo dé: sin modelo, solo candidatos', async () => {
    const c = CASOS[0]
    const t = tablasDelCaso(c) as Record<string, Array<Record<string, unknown>>>
    t.client_sedes = [{ id: 's-1', client_id: c.id, ciudad: c.ciudad, clave: 'central' }]
    t.apify_raw.push({ id: 'dem', client_id: c.id, apify_function: 'google_maps_scraper', ensayo: false, created_at: '2026-10-15T13:00:00.000Z', params: { _brazo: 'demanda:central' }, respuesta: [{ title: 'Rival', categoryName: 'Clínica dental', totalScore: 4, reviewsCount: 30, placeId: 'r', rank: 1 }] })
    const base = crearBaseFalsa(t as never)
    const r = await alimentarCliente({ db: base.db, client_id: c.id, dry_run: true, interruptores: ON, ahora: ALTA, brazos: { ...BRAZOS_APAGADOS, competencia: true } })
    expect(r.brazos?.por_sede?.central).toMatchObject({ estado: 'sin_modelo', candidatos: 1 })
    expect(base.escrituras).toEqual([])
  })
})

describe('rubro sin cercanía y la ruta del plan', () => {
  it('un software con sedes: la demanda no cae a «por ciudad», declara que no aplica por sede', async () => {
    const t = { client_sedes: [{ id: 's', client_id: CL, clave: 'central', ciudad: 'Quito' }], client_sede_datos: [], apify_raw: [{ ...filaDemanda('central', [lugar('Rival')]), id: 'd', client_id: CL }], cerebro_fichas: [], cerebro_ingresos: [] }
    const base = crearBaseFalsa(t as never)
    const r = await correrBrazos({ db: base.db, brazos: { ...BRAZOS_APAGADOS, demanda: true }, cliente: { id: CL, name: 'Flujo CRM', slug: 'flujo-crm', industry: 'software CRM para pymes', country: 'Ecuador', config: {} }, client_id: CL, filas: [], ahora: AHORA, dry_run: false })
    expect(r.por_brazo.demanda).toMatchObject({ estado: 'sin_material', fichas: 0 })
    expect(r.por_brazo.demanda?.declarado.join(' ')).toMatch(/no aplica por sede/)
    expect(t.cerebro_fichas).toEqual([])
  })
  it('la RUTA del plan carga las sedes y pide la demanda por sede (con punto) el miércoles; sin brazos, el plan es el de siempre', async () => {
    const c = CASOS[0]
    const t = tablasDelCaso(c) as Record<string, Array<Record<string, unknown>>>
    t.client_sedes = [{ id: 's-1', client_id: c.id, ciudad: c.ciudad, clave: 'central' }]
    t.client_sede_datos = [{ sede_id: 's-1', client_id: c.id, campo: 'tipo_de_atencion', valor_texto: 'local de atención al público' }]
    t.apify_raw.push({ id: 'own2', client_id: c.id, apify_function: 'own_google_maps_profile', ensayo: false, created_at: '2026-10-14T10:00:00Z', params: {}, respuesta: [{ title: c.nombre, city: c.ciudad, location: { lat: -0.18, lng: -78.48 } }] })
    const deps = (brazos?: typeof BRAZOS_APAGADOS) => ({ db: crearBaseFalsa(t as never).db, interruptores: ON, ahora: new Date('2026-10-14T15:00:00Z'), brazos })
    const con = await rutaDescubrir(deps({ ...BRAZOS_APAGADOS, demanda: true }), { dry_run: true, client_id: c.id })
    const acciones = ((con.body as { plan: { hacer: Array<{ fuente: string; params: Record<string, unknown> }> } }).plan.hacer).filter((a) => a.fuente === 'demanda')
    expect(acciones).toHaveLength(1)
    expect(acciones[0].params).toMatchObject({ _brazo: 'demanda:central', customGeolocation: { type: 'Point', coordinates: [-78.48, -0.18] } })
    const sin = await rutaDescubrir(deps(), { dry_run: true, client_id: c.id })
    expect(((sin.body as { plan: { hacer: Array<{ fuente: string }> } }).plan.hacer).some((a) => a.fuente === 'demanda')).toBe(false)
  })
})
