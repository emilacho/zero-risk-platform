/**
 * P3–P9 de la auditoría agnóstica (16-oct · firma de Emilio) · US$ 0 · base falsa. Con los diez clientes de prueba.
 *  P4 costo por cliente y umbral global en proporción · P5 familia industria_b2b · P7 idioma de búsqueda por país · P8 directorios por familia · P9 bandera de cliente de prueba · sin país no se adivina Ecuador.
 * (P2 vive en pausa-por-cliente.test.ts; P3 en diez-clientes.test.ts.)
 */
import { describe, expect, it } from 'vitest'
import { clientesActivos } from '../clientes'
import { COSTO_GLOBAL_BASE_POR_OMISION_USD, COSTO_GLOBAL_POR_CLIENTE_POR_OMISION_USD, rutaCostos, umbralGlobalUsd } from '../costos'
import { IDIOMA_DE_BUSQUEDA_POR_PAIS, idiomaDeBusqueda } from '../datos'
import { familiasDelRubro } from '../../fuentes-publicas/plan'
import { DIRECTORIOS_POR_FAMILIA, descubrir } from '../plan'
import { accionesDeCompetencia, type Competidor } from '../brazos/competencia'
import { accionesDeBrazos } from '../brazos'
import { BRAZOS_APAGADOS } from '../brazos'
import { accionDeDemanda } from '../brazos/demanda'
import { radioDe } from '../brazos/sedes'
import { crearBaseFalsa } from './base-falsa'
import { revisarCanalPorSede } from '../sedes-fuentes'
import { DIEZ_CLIENTES } from './diez-clientes.fixtures'
import { tablasDe, type T } from './diez-clientes.tablas'
import { AHORA, ON } from './fixtures-despertar'

const RIVAL: Competidor = { nombre: 'Rival', slug: 'rival', tipo: 'direct', web: 'https://r.example', sitio_propio: 'https://r.example', instagram: null, sedes: [], origen: 'sistema' }
const juntos = (): T => {
  const out: T = {}
  for (const c of DIEZ_CLIENTES) for (const [k, v] of Object.entries(tablasDe(c))) (out[k] ??= []).push(...v)
  return out
}

describe('P4 · costo por cliente y umbral global en proporción a los clientes activos', () => {
  it('el umbral crece con los clientes (base + por cliente × activos); es dato; un valor roto vuelve al de siempre', () => {
    expect(umbralGlobalUsd(0, {})).toMatchObject({ umbral_usd: COSTO_GLOBAL_BASE_POR_OMISION_USD, activos: 0 })
    expect(umbralGlobalUsd(10, {}).umbral_usd).toBe(COSTO_GLOBAL_BASE_POR_OMISION_USD + 10 * COSTO_GLOBAL_POR_CLIENTE_POR_OMISION_USD)
    expect(umbralGlobalUsd(50, {}).umbral_usd).toBeGreaterThan(umbralGlobalUsd(10, {}).umbral_usd)
    expect(umbralGlobalUsd(10, { PORTERO_COSTO_GLOBAL_BASE_USD: '2', PORTERO_COSTO_GLOBAL_POR_CLIENTE_USD: '0,5' }).umbral_usd).toBe(7)
    expect(umbralGlobalUsd(10, { PORTERO_COSTO_GLOBAL_BASE_USD: 'x', PORTERO_COSTO_GLOBAL_POR_CLIENTE_USD: '-3' }).umbral_usd).toBe(15)
  })
  it('con diez clientes que gastan ≈ US$ 0,6 cada uno, el total NO pasa el umbral global (con uno fijo de US$ 5 sí pasaría)', async () => {
    const t = juntos()
    for (const c of DIEZ_CLIENTES) t.costs.push({ service: 'apify:instagram', amount_usd: 0.6, created_at: AHORA.toISOString(), description: JSON.stringify({ es: 'detalle_de_llamada', client_id: c.id }) })
    const r = await rutaCostos({ db: crearBaseFalsa(t as never).db as never, ahora: AHORA, env: {} })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ clientes_activos: 10, sobre_el_umbral_global: false })
    expect(Number(r.body.total_del_portero_usd)).toBeGreaterThan(5)
    expect((r.body.umbral_global as { umbral_usd: number }).umbral_usd).toBe(15)
    expect((r.body.clientes as unknown[]).length).toBe(10)
  })
  it('el informe dice cuánto costó cada cliente y quién pasó sus umbrales; el que más gasta va primero', async () => {
    const t = juntos()
    t.costs.push({ service: 'apify:x', amount_usd: 4, created_at: AHORA.toISOString(), description: JSON.stringify({ es: 'detalle_de_llamada', client_id: DIEZ_CLIENTES[4].id }) }, { service: 'apify:x', amount_usd: 2, created_at: AHORA.toISOString(), description: JSON.stringify({ es: 'detalle_de_llamada', client_id: DIEZ_CLIENTES[1].id }) })
    const r = await rutaCostos({ db: crearBaseFalsa(t as never).db as never, ahora: AHORA, env: {} })
    const cl = r.body.clientes as Array<{ client_id: string; gasto_usd: number; estado: string }>
    expect(cl[0]).toMatchObject({ client_id: DIEZ_CLIENTES[4].id, estado: 'pasa_el_umbral_de_apagado' })
    expect(cl[1]).toMatchObject({ client_id: DIEZ_CLIENTES[1].id, estado: 'pasa_el_umbral_de_aviso' })
    expect(cl[2].estado).toBe('normal')
    expect(r.body.umbrales_por_cliente).toMatchObject({ aviso_usd: 1.5, apagar_usd: 3 }) // los firmados por cliente no cambian aquí
  })
  it('con más de 1.000 filas de costo en el día (50 clientes) el gasto de cada uno sale completo', async () => {
    const t = juntos()
    const c = DIEZ_CLIENTES[0]
    for (let i = 0; i < 1200; i++) t.costs.push({ id: `k${i}`, service: 'apify:otro', amount_usd: 0.001, created_at: AHORA.toISOString(), description: JSON.stringify({ es: 'detalle_de_llamada', client_id: i < 1100 ? DIEZ_CLIENTES[9].id : c.id }) })
    const r = await rutaCostos({ db: crearBaseFalsa(t as never, { topeDeFilas: 1000 }).db as never, ahora: AHORA, env: {} })
    const mio = (r.body.clientes as Array<{ client_id: string; gasto_usd: number }>).find((x) => x.client_id === c.id)!
    expect(mio.gasto_usd).toBeCloseTo(0.1, 1) // 100 filas de 0,001 que están pasada la fila 1.000
  })
})

describe('P5 · familia industria_b2b: vender a empresas no compite por cercanía', () => {
  it('extintores / seguridad contra incendios cae en industria_b2b, sin radio de cercanía', () => {
    const c = DIEZ_CLIENTES[0]
    expect(familiasDelRubro(c.rubro)).toEqual(['industria_b2b'])
    expect(radioDe(['industria_b2b'], 'local')).toBeNull()
    expect(radioDe(['industria_b2b'], 'solo_domicilio')).toBeNull()
  })
  it('una palabra de otra familia suma la suya («fábrica de pan» sigue siendo comida) y la de b2b no la apaga', () => {
    expect(radioDe(['comida', 'industria_b2b'], 'local')).toBe(3)
    expect(familiasDelRubro('proveedor industrial de maquinaria y equipos industriales')).toEqual(['industria_b2b'])
    expect(familiasDelRubro('restaurante de mariscos costero')).toEqual(['comida'])
  })
})

describe('P7 · idioma de búsqueda por país', () => {
  it('español por omisión; portugués, inglés, francés… por dato; sin país no se adivina otro', () => {
    expect(idiomaDeBusqueda('Ecuador')).toBe('es')
    expect(idiomaDeBusqueda('Argentina')).toBe('es')
    expect(idiomaDeBusqueda('Brasil')).toBe('pt')
    expect(idiomaDeBusqueda('Estados Unidos')).toBe('en')
    expect(idiomaDeBusqueda('US')).toBe('en')
    expect(idiomaDeBusqueda(null)).toBe('es')
    expect(idiomaDeBusqueda('Narnia')).toBe('es')
    expect(Object.keys(IDIOMA_DE_BUSQUEDA_POR_PAIS).every((k) => k === k.toUpperCase() && k.length === 2)).toBe(true)
  })
  const base = { ahora: new Date('2026-10-14T12:00:00Z'), rubro: 'tienda de ropa', nombre: 'X', ciudad: 'Sao Paulo', gastado_hoy_usd: 0, interruptores: ON }
  it('el plan pide Mapas y las búsquedas en el idioma del país', () => {
    const cliente = { id: 'c', name: 'Loja Sol', website_url: 'https://loja.example', config: {} }
    const br = descubrir({ ...base, cliente, pais: 'Brasil', ciudades: ['Sao Paulo'], publicaciones_propias: [] } as never)
    const de = (p: typeof br) => p.hacer.filter((a) => a.fuente === 'mapas' || a.fuente === 'prensa').map((a) => String(a.params.language ?? a.params.languageCode))
    expect(de(br).length).toBeGreaterThan(0)
    expect(de(br).every((i) => i === 'pt')).toBe(true)
    const co = descubrir({ ...base, cliente, pais: 'Colombia', ciudades: ['Bogotá'], publicaciones_propias: [] } as never)
    expect(de(co).every((i) => i === 'es')).toBe(true)
  })
  it('la demanda y la competencia también', () => {
    const d = accionDeDemanda({ ahora: new Date('2026-10-14T12:00:00Z'), terminos: ['tienda'], ciudad: 'Sao Paulo', idioma: 'pt' })
    expect(d.accion?.params.language).toBe('pt')
    expect(accionDeDemanda({ ahora: new Date('2026-10-14T12:00:00Z'), terminos: ['tienda'], ciudad: 'Bogotá' }).accion?.params.language).toBe('es')
    const cliente = { id: 'c', name: 'Loja Sol', country: 'Brasil', industry: 'tienda de ropa', config: {} }
    const a = accionesDeBrazos({ brazos: { ...BRAZOS_APAGADOS, demanda: true, competencia: true }, cliente, ciudad: 'Sao Paulo', ahora: new Date('2026-10-14T12:00:00Z'), ctx: { sedes: [], delSistema: [RIVAL], ubicadasRecientemente: new Set() } })
    expect(a.acciones.length).toBeGreaterThan(0)
    expect(a.acciones.filter((x) => x.funcion === 'google_maps_scraper').every((x) => x.params.language === 'pt')).toBe(true)
    // la competencia (el lunes le toca al primer vigilado) también busca en el idioma del país
    const lunes = accionesDeBrazos({ brazos: { ...BRAZOS_APAGADOS, competencia: true }, cliente, ciudad: 'Sao Paulo', ahora: new Date('2026-10-12T12:00:00Z'), ctx: { sedes: [], delSistema: [RIVAL], ubicadasRecientemente: new Set() } })
    const mapasDeRival = lunes.acciones.filter((x) => x.funcion === 'google_maps_scraper')
    expect(mapasDeRival.length).toBeGreaterThan(0)
    expect(mapasDeRival.every((x) => x.params.language === 'pt')).toBe(true)
  })
})

describe('sin país NO se adivina Ecuador: no se piden los anuncios de Meta', () => {
  it('con país los pide en SU país; sin país los omite', () => {
    const v = [RIVAL]
    const lunes = new Date('2026-10-12T12:00:00Z')
    const anuncios = (pais?: string | null) => accionesDeCompetencia({ vigilados: v, ahora: lunes, ciudad: 'Lima', pais, forzar: true }).filter((a) => a.funcion === 'facebook_ads_library_scraper')
    expect(anuncios('pe')[0].params.countryCode).toBe('PE')
    expect(anuncios('co')[0].params.countryCode).toBe('CO')
    expect(anuncios(null)).toEqual([])
    expect(anuncios('Peru')).toEqual([]) // un nombre no es un código de país: no se adivina
  })
})

describe('P8 · directorios para las familias que faltaban', () => {
  it('educación, automotriz, belleza, comercio, inmobiliaria, hogar, finanzas y turismo ya tienen directorio; el plan pide su búsqueda (≈ +US$ 0,003)', () => {
    for (const f of ['educacion', 'automotriz', 'belleza_bienestar', 'comercio', 'inmobiliaria', 'servicios_hogar', 'finanzas', 'turismo']) expect(DIRECTORIOS_POR_FAMILIA[f]?.length, f).toBeGreaterThan(0)
    for (const c of DIEZ_CLIENTES.filter((x) => x.sedes.length || x.web)) {
      const p = descubrir({ cliente: { id: c.id, name: c.nombre, website_url: c.web, config: {} }, rubro: c.rubro, pais: c.pais, ciudad: c.sedes[0]?.ciudad ?? 'Ciudad', ciudades: c.sedes.map((s) => s.ciudad), publicaciones_propias: [], ahora: AHORA, gastado_hoy_usd: 0, interruptores: ON } as never)
      const consultas = p.hacer.filter((a) => a.fuente === 'prensa')
      expect(consultas.length, c.nombre).toBeGreaterThan(0)
      const fams = familiasDelRubro(c.rubro).filter((f) => (DIRECTORIOS_POR_FAMILIA[f] ?? []).length > 0)
      if (fams.length) expect(consultas.length, c.nombre).toBe(2) // el nombre + ciudad, y el directorio de su familia
    }
  })
})

describe('P9 · la bandera de cliente de prueba es explícita (no por el nombre)', () => {
  const c = DIEZ_CLIENTES[0]
  it('un cliente real llamado «Pruebas…» SÍ es cliente activo; el marcado con la bandera, no', async () => {
    const t = juntos()
    ;(t.clients.find((x) => x.id === c.id) as Record<string, unknown>).name = 'Pruebas de Laboratorio Andino'
    ;(t.clients.find((x) => x.id === DIEZ_CLIENTES[1].id)!.config as Record<string, unknown>).es_de_prueba = true
    const r = await clientesActivos(crearBaseFalsa(t as never).db)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.datos.clientes.some((x) => x.client_id === c.id)).toBe(true)
    expect(r.datos.excluidos).toEqual([{ client_id: DIEZ_CLIENTES[1].id, motivos: ['cliente de prueba'] }])
  })
})

describe('P6 · el canal de cada sede lo pide el alta (dato); sin dato se deduce', () => {
  it('lo recibido se revisa: sedes que no existen y canales fuera de la lista se rechazan; las sedes sin dato se listan (se deducen y se rotulan «deducido»)', () => {
    const claves = ['norte', 'centro', 'valle']
    expect(revisarCanalPorSede({ apify: { canal_por_sede: { norte: 'local', centro: 'solo_entrega' } } }, claves)).toEqual({ errores: [], sin_dato: ['valle'] })
    const mal = revisarCanalPorSede({ apify: { canal_por_sede: { luna: 'local', norte: 'volando' } } }, claves)
    expect(mal.errores).toHaveLength(2)
    expect(mal.errores.join(' ')).toMatch(/«luna» no es una sede/)
    expect(mal.errores.join(' ')).toMatch(/«volando» no es un canal/)
    expect(mal.sin_dato).toEqual(claves)
    expect(revisarCanalPorSede({}, claves).sin_dato).toEqual(claves)
    expect(revisarCanalPorSede({}, [])).toEqual({ errores: [], sin_dato: [] })
  })
})
