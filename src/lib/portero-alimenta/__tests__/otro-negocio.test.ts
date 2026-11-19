/**
 * ENCARGO 10 · «NO ES DE ESTE CLIENTE» (18-nov + DECISIÓN 19-nov). US$ 0, sin red.
 * Los ejemplos salen de registros REALES de Náufrago:
 *   · la ficha del cliente: sitio `https://www.naufrago.ec`, cuentas `naufrago.ec` (SELECT del 19-nov);
 *   · la sede falsa «antioquia» y sus 5 datos (la página del hotel Click Clack de Medellín + la ficha de Mapas de «Náufrago Rooftop Mde.»),
 *     tal como quedaron en el respaldo de CC2 (`raw/evidencia/naufrago-sedes/respaldo-sedes-ajenas-2026-10-31.json`);
 *   · los datos de hoy de Olón y Guayaquil (sitio propio, el dueño, Mapas, Instagram sin «https://»);
 *   · las 4 páginas de homónimos que el rastreador guardó (myplainview, lmtonline, wanderlog, clickclackhotel).
 */
import { describe, expect, it } from 'vitest'
import { baseDeFicha } from '../../propio/regla-propio'
import { archivarFichasDeBrazos } from '../brazos/archivo'
import type { FichaDeBrazo } from '../brazos/tipos'
import { cargarPruebasDelCliente, columnasDeLaMarca, marcaDeOtroNegocio, paginaDeOtroSitio, sedesDeOtroNegocio, MARCADO_POR_LA_REGLA, type PruebasDelCliente } from '../otro-negocio'
import { crearBaseFalsa } from './base-falsa'

const CL = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const AHORA = new Date('2026-11-19T15:00:00Z')
const CLIENTE = { id: CL, name: 'Náufrago', website_url: 'https://www.naufrago.ec', config: { apify: { own_handles: { tiktok: 'naufrago.ec', facebook: '1525854397268597', instagram: 'naufrago.ec' } } } }
const BASE = baseDeFicha(CLIENTE)
const HOTEL = 'https://www.clickclackhotel.com/en/hotel-clickclackmedellin-in-medellin/restaurants/castaway/'
const MAPAS_ROOFTOP = 'https://www.google.com/maps/search/?api=1&query=N%C3%A1ufrago%20Rooftop%20Mde.&query_place_id=ChIJOxNY3HEpRI4R-4ViTaJmPA'
const MAPAS_OLON = 'https://www.google.com/maps/search/?api=1&query=Naufrago&query_place_id=ChIJ3asaJgArLJAR4P'
const ARTICULOS = [
  'https://www.myplainview.com/news/article/N-ufrago-ecuatoriano-est-vivo-para-contar-8567672.php',
  'https://www.lmtonline.com/lmtenespanol/article/N-ufrago-ecuatoriano-est-vivo-para-contar-10388465.php',
  'https://wanderlog.com/place/details/7482864/n%C3%A1ufrago-rooftop-mde',
  HOTEL,
]
// las sedes: las 2 reales de hoy + las 3 falsas del respaldo de CC2 (ids reales)
const SEDES = [
  { id: 's-olon', client_id: CL, clave: 'olon', ciudad: 'Olón' },
  { id: 's-gye', client_id: CL, clave: 'guayaquil', ciudad: 'Guayaquil' },
  { id: 'd0db2281-9a92-4a8b-8b4d-be87f4bdc2a9', client_id: CL, clave: 'antioquia', ciudad: 'Antioquia' },
  { id: '89226e8e-ba10-442f-b8e4-1e808ea175be', client_id: CL, clave: 'laredo', ciudad: 'Laredo' },
  { id: '3a967427-693a-4a00-ac65-96e571c543ac', client_id: CL, clave: 'plainview', ciudad: 'Plainview' },
]
const dato = (sede_id: string, campo: string, fuente: string, fuente_ref: string) => ({ client_id: CL, sede_id, campo, fuente, fuente_ref, retirada_en: null })
const DATOS = [
  // Olón hoy: Instagram sin «https://», Mapas propio, y la corrección del dueño
  dato('s-olon', 'horario', 'instagram', 'instagram.com/naufrago.ec'),
  dato('s-olon', 'direccion', 'mapas', MAPAS_OLON),
  dato('s-olon', 'tipo_de_atencion', 'dueno', 'corrección del dueño (Emilio) · 2026-10-12'),
  // Guayaquil hoy: su sitio
  dato('s-gye', 'direccion', 'sitio', 'https://www.naufrago.ec'),
  dato('s-gye', 'horario', 'sitio', 'https://www.naufrago.ec'),
  // Antioquia (respaldo de CC2): el hotel de Medellín y la ficha de Mapas del homónimo
  dato('d0db2281-9a92-4a8b-8b4d-be87f4bdc2a9', 'direccion', 'mapas', MAPAS_ROOFTOP),
  dato('d0db2281-9a92-4a8b-8b4d-be87f4bdc2a9', 'direccion', 'sitio', HOTEL),
  dato('d0db2281-9a92-4a8b-8b4d-be87f4bdc2a9', 'canal_pedido', 'sitio', HOTEL),
  dato('d0db2281-9a92-4a8b-8b4d-be87f4bdc2a9', 'horario', 'sitio', HOTEL),
  dato('d0db2281-9a92-4a8b-8b4d-be87f4bdc2a9', 'canal_pedido', 'mapas', MAPAS_ROOFTOP),
]
const PRUEBAS: PruebasDelCliente = { base: BASE, sedesDeOtroNegocio: sedesDeOtroNegocio(BASE, SEDES, DATOS) }

describe('¿es una página web de otro sitio? (la regla única «¿es del cliente?», sin redes ni plataformas)', () => {
  it('las 4 páginas de homónimos que se guardaron son de otro sitio', () => {
    expect(ARTICULOS.map((u) => paginaDeOtroSitio(BASE, u))).toEqual(['myplainview.com', 'lmtonline.com', 'wanderlog.com', 'clickclackhotel.com'])
  })
  it('el sitio del cliente (y un subdominio) NO', () => {
    expect(paginaDeOtroSitio(BASE, 'https://www.naufrago.ec/carta')).toBeNull()
    expect(paginaDeOtroSitio(BASE, 'https://reservas.naufrago.ec/')).toBeNull()
  })
  it('una publicación de Instagram o una ficha de Mapas NO se juzgan por su dirección (eso lo decide quien las trae)', () => {
    expect(paginaDeOtroSitio(BASE, 'https://www.instagram.com/p/DQ1abc/')).toBeNull()
    expect(paginaDeOtroSitio(BASE, 'https://www.tiktok.com/@otra.cuenta/video/1')).toBeNull()
    expect(paginaDeOtroSitio(BASE, MAPAS_ROOFTOP)).toBeNull()
    expect(paginaDeOtroSitio(BASE, 'https://maps.app.goo.gl/xyz')).toBeNull()
  })
  it('lo que no es una dirección web, o un cliente sin sitio ni cuentas (no hay con qué comparar), NO prueba nada', () => {
    expect(paginaDeOtroSitio(BASE, 'instagram.com/naufrago.ec')).toBeNull()
    expect(paginaDeOtroSitio(BASE, null)).toBeNull()
    expect(paginaDeOtroSitio(BASE, 'corrección del dueño')).toBeNull()
    expect(paginaDeOtroSitio(baseDeFicha({ website_url: null, config: {} }), HOTEL)).toBeNull()
  })
})

describe('las sedes de otro negocio (con los datos reales)', () => {
  it('«antioquia» lo es: sus datos salieron de la página del hotel de Medellín y ninguno tiene prueba', () => {
    expect([...PRUEBAS.sedesDeOtroNegocio.entries()]).toEqual([['antioquia', HOTEL]])
  })
  it('Olón y Guayaquil NO: tienen la palabra del dueño o su propio sitio', () => {
    expect(PRUEBAS.sedesDeOtroNegocio.has('olon')).toBe(false)
    expect(PRUEBAS.sedesDeOtroNegocio.has('guayaquil')).toBe(false)
  })
  it('una sede SIN datos no es «de otro negocio» (la sede nunca es filtro): Laredo y Plainview, sin datos, no se marcan por esta vía', () => {
    expect(PRUEBAS.sedesDeOtroNegocio.has('laredo')).toBe(false)
    expect(PRUEBAS.sedesDeOtroNegocio.has('plainview')).toBe(false)
  })
  it('basta UN dato con prueba para que la sede sea del cliente, aunque otros vengan de una página ajena', () => {
    const conDueno = [...DATOS, dato('d0db2281-9a92-4a8b-8b4d-be87f4bdc2a9', 'estado_de_la_sede', 'dueno', 'el dueño confirmó esta sede')]
    expect(sedesDeOtroNegocio(BASE, SEDES, conDueno).has('antioquia')).toBe(false)
    const conSitio = [...DATOS, dato('d0db2281-9a92-4a8b-8b4d-be87f4bdc2a9', 'horario', 'sitio', 'https://www.naufrago.ec/medellin')]
    expect(sedesDeOtroNegocio(BASE, SEDES, conSitio).has('antioquia')).toBe(false)
  })
  it('solo con datos de Mapas (sin página ajena) no se marca: la ficha de Mapas no prueba de quién es', () => {
    const soloMapas = DATOS.filter((d) => !(d.sede_id.startsWith('d0db') && d.fuente === 'sitio'))
    expect(sedesDeOtroNegocio(BASE, SEDES, soloMapas).has('antioquia')).toBe(false)
  })
})

describe('la marca al guardar', () => {
  it('regla 1 · lo que se presenta como del cliente y salió de una página de otro sitio: los 4 artículos reales', () => {
    for (const u of ARTICULOS) {
      const m = marcaDeOtroNegocio({ propiedad: 'incierta', fuente_url: u, sede: null }, PRUEBAS)
      expect(m, u).toMatchObject({ como: 'nada', nivel: null, prueba: u, por: MARCADO_POR_LA_REGLA })
      expect(m!.motivo).toContain('no es el sitio ni una cuenta del cliente')
    }
    expect(marcaDeOtroNegocio({ propiedad: 'propia', fuente_url: HOTEL }, PRUEBAS)).not.toBeNull()
  })
  it('regla 1 no toca lo de un competidor (ya es ajeno a sabiendas) ni lo del sitio o las redes del cliente', () => {
    expect(marcaDeOtroNegocio({ propiedad: 'ajena', fuente_url: 'https://www.pesqueira.co/', sede: null }, PRUEBAS)).toBeNull()
    expect(marcaDeOtroNegocio({ propiedad: 'propia', fuente_url: 'https://www.naufrago.ec/carta', sede: 'olon' }, PRUEBAS)).toBeNull()
    expect(marcaDeOtroNegocio({ propiedad: 'propia', fuente_url: 'https://www.instagram.com/p/DQ1abc/', sede: 'guayaquil' }, PRUEBAS)).toBeNull()
  })
  it('regla 2 · lo armado para la sede de otro negocio, aunque sea de un competidor y no traiga dirección', () => {
    const m = marcaDeOtroNegocio({ propiedad: 'ajena', fuente_url: null, sede: 'antioquia' }, PRUEBAS)
    expect(m).toMatchObject({ como: 'nada', nivel: null, prueba: HOTEL, por: MARCADO_POR_LA_REGLA })
    expect(m!.motivo).toContain('«antioquia»')
    expect(m!.motivo).toContain('clickclackhotel.com')
  })
  it('regla 2 · una ficha de varias sedes («antioquia,olon») se marca si UNA es de otro negocio; «guayaquil,olon» no', () => {
    expect(marcaDeOtroNegocio({ propiedad: 'propia', sede: 'antioquia,olon' }, PRUEBAS)).not.toBeNull()
    expect(marcaDeOtroNegocio({ propiedad: 'propia', sede: 'guayaquil,olon' }, PRUEBAS)).toBeNull()
  })
  it('las columnas: la marca va ENTERA (motivo, prueba, cómo, nivel, quién y cuándo); sin marca, nada', () => {
    const m = marcaDeOtroNegocio({ propiedad: 'ajena', sede: 'antioquia' }, PRUEBAS)
    expect(columnasDeLaMarca(m, AHORA)).toEqual({ otro_negocio_motivo: m!.motivo, otro_negocio_prueba: HOTEL, otro_negocio_como: 'nada', otro_negocio_nivel: null, otro_negocio_por: MARCADO_POR_LA_REGLA, otro_negocio_en: AHORA.toISOString() })
    expect(columnasDeLaMarca(null, AHORA)).toEqual({})
  })
})

describe('cargar las pruebas del cliente (lectura acotada; un error se DICE)', () => {
  const tablas = () => ({ clients: [CLIENTE], client_sedes: SEDES, client_sede_datos: DATOS, cerebro_fichas: [], cerebro_ingresos: [] }) as Record<string, Array<Record<string, unknown>>>
  it('lee la ficha, las sedes y sus datos y llega a lo mismo', async () => {
    const r = await cargarPruebasDelCliente(crearBaseFalsa(tablas()).db as never, CL)
    expect(r.ok && [...r.pruebas.sedesDeOtroNegocio.keys()]).toEqual(['antioquia'])
  })
  it('con la ficha y las sedes ya leídas, solo lee los datos de las sedes', async () => {
    const b = crearBaseFalsa(tablas())
    const r = await cargarPruebasDelCliente(b.db as never, CL, { cliente: CLIENTE, sedes: SEDES })
    expect(r.ok && [...r.pruebas.sedesDeOtroNegocio.keys()]).toEqual(['antioquia'])
    expect(b.lecturas).toEqual(['client_sede_datos'])
  })
  it('sin sedes no lee sus datos', async () => {
    const b = crearBaseFalsa({ ...tablas(), client_sedes: [] })
    const r = await cargarPruebasDelCliente(b.db as never, CL)
    expect(r.ok && r.pruebas.sedesDeOtroNegocio.size).toBe(0)
    expect(b.lecturas).not.toContain('client_sede_datos')
  })
  for (const tabla of ['clients', 'client_sedes', 'client_sede_datos']) {
    it(`si no se puede leer ${tabla}, lo dice (no devuelve «sin marcas»)`, async () => {
      const r = await cargarPruebasDelCliente(crearBaseFalsa(tablas(), { fallaEn: tabla }).db as never, CL)
      expect(r.ok).toBe(false)
      expect(!r.ok && r.error).toContain(tabla)
    })
  }
})

describe('el archivo de los brazos guarda la marca (de punta a punta, con la base falsa)', () => {
  const evaluacion = (sede: string): FichaDeBrazo => ({
    brazo: 'competencia', alcance: 'competidor', client_id: CL, ref: `brazo:competencia:pesqueira:${sede}`, atributo: `competencia:pesqueira:evaluacion:${sede}`, clase: 'competidor_vigilado',
    titulo: `Competidor vigilado · PESQUEIRA · sede ${sede}`, contenido: `«PESQUEIRA» (competidor) compite con la sede ${sede}: Marisquería a 0,1 km de la sede, mismo rubro y misma zona.`,
    origen: 'tercero', fuente_url: null, fecha_fuente: AHORA.toISOString(), observado_en: AHORA.toISOString(), vigente_hasta: null, decision: 'suma', datos: { sede },
  } as unknown as FichaDeBrazo)
  const tablas = () => ({ clients: [CLIENTE], client_sedes: SEDES, client_sede_datos: DATOS, cerebro_fichas: [], cerebro_ingresos: [] }) as Record<string, Array<Record<string, unknown>>>
  it('la evaluación contra «antioquia» se guarda MARCADA; la de Olón, sin marca; nada se deja de guardar', async () => {
    const b = crearBaseFalsa(tablas())
    const r = await archivarFichasDeBrazos({ db: b.db as never, fichas: [evaluacion('antioquia'), evaluacion('olon')], ahora: AHORA, dry_run: false })
    expect(r.errores).toEqual([])
    const escritas = b.escrituras.filter((w) => w.tabla === 'cerebro_fichas' && w.op === 'insert').map((w) => w.fila as Record<string, unknown>)
    expect(escritas).toHaveLength(2)
    const anti = escritas.find((f) => f.sede === 'antioquia')!, olon = escritas.find((f) => f.sede === 'olon')!
    expect(anti).toMatchObject({ otro_negocio_como: 'nada', otro_negocio_prueba: HOTEL, otro_negocio_por: MARCADO_POR_LA_REGLA, otro_negocio_en: AHORA.toISOString() })
    expect(String(anti.otro_negocio_motivo)).toContain('«antioquia»')
    expect(olon).not.toHaveProperty('otro_negocio_motivo')
  })
  it('con las pruebas que ya leyó quien llama no vuelve a leerlas', async () => {
    const b = crearBaseFalsa(tablas())
    await archivarFichasDeBrazos({ db: b.db as never, fichas: [evaluacion('antioquia')], ahora: AHORA, dry_run: false, pruebas: { client_id: CL, pruebas: PRUEBAS } })
    expect(b.lecturas.filter((t) => ['clients', 'client_sedes', 'client_sede_datos'].includes(t))).toEqual([])
    expect(b.escrituras.find((w) => w.tabla === 'cerebro_fichas')?.fila).toHaveProperty('otro_negocio_motivo')
  })
  it('las pruebas de OTRO cliente no sirven: se leen las de este', async () => {
    const b = crearBaseFalsa(tablas())
    await archivarFichasDeBrazos({ db: b.db as never, fichas: [evaluacion('antioquia')], ahora: AHORA, dry_run: false, pruebas: { client_id: 'otro', pruebas: { base: BASE, sedesDeOtroNegocio: new Map() } } })
    expect(b.lecturas).toContain('client_sede_datos')
    expect(b.escrituras.find((w) => w.tabla === 'cerebro_fichas')?.fila).toHaveProperty('otro_negocio_motivo')
  })
  it('si no se pueden leer las pruebas, ese cliente NO se escribe a ciegas y se dice', async () => {
    const b = crearBaseFalsa(tablas(), { fallaEn: 'client_sede_datos' })
    const r = await archivarFichasDeBrazos({ db: b.db as never, fichas: [evaluacion('antioquia')], ahora: AHORA, dry_run: false })
    expect(r.errores.join(' ')).toContain('no es de este cliente')
    expect(b.escrituras.filter((w) => w.tabla === 'cerebro_fichas' || w.tabla === 'cerebro_ingresos')).toEqual([])
  })
  it('en seco no lee las pruebas ni escribe', async () => {
    const b = crearBaseFalsa(tablas())
    const r = await archivarFichasDeBrazos({ db: b.db as never, fichas: [evaluacion('antioquia')], ahora: AHORA, dry_run: true })
    expect(r.plan).toHaveLength(1)
    expect(b.lecturas).not.toContain('client_sede_datos')
    expect(b.escrituras).toEqual([])
  })
})
