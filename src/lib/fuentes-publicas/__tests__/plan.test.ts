/**
 * Fuentes públicas · AGNÓSTICO · 4 clientes de prueba de rubros distintos (inventados) + auditoría de que ningún archivo nombra a un cliente, lugar o rubro concreto.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ACTORES_NUEVOS, PLATAFORMAS_DE_RESENAS, REDES_CON_CONTENIDO } from '../catalogo'
import { familiasDelRubro, hallarDireccion, planDeFuentesPublicas, plataformasQueAplican, usuarioDeRed, type EntradaDelPlan } from '../plan'

const MAPAS = { url: 'https://www.google.com/maps/place/Negocio+de+prueba/@0,0,17z' }
const CLIENTES: Record<string, EntradaDelPlan & { espera: { familias: string[]; plataformas: string[]; videos: string[]; publicaciones: string[] } }> = {
  restaurante: {
    rubro: 'Restaurante de comida casera con entrega a domicilio', nombre: 'Cliente A', pais: 'EC', mapas: MAPAS,
    enlaces: ['https://www.tripadvisor.com/Restaurant_Review-g1-d2-Reviews-Cliente_A.html', 'https://www.facebook.com/cliente-a', 'https://www.booking.com/hotel/xx/otro.html'],
    redes: { instagram: '@cliente_a', facebook: 'https://www.facebook.com/cliente-a', tiktok: 'https://www.tiktok.com/@cliente_a' },
    espera: { familias: ['comida'], plataformas: ['resenas_google_maps', 'resenas_tripadvisor', 'resenas_facebook'], videos: ['videos_instagram', 'videos_tiktok'], publicaciones: ['publicaciones_facebook'] },
  },
  software: {
    rubro: 'Plataforma SaaS de gestión para pymes (B2B)', nombre: 'Producto B', pais: 'US', mapas: null,
    enlaces: ['https://www.trustpilot.com/review/producto-b.example', 'https://www.g2.com/products/producto-b', 'https://www.tripadvisor.com/x'],
    redes: { youtube: 'https://www.youtube.com/@producto_b', instagram: null },
    espera: { familias: ['software'], plataformas: ['trustpilot_scraper', 'software_review_scraper'], videos: ['videos_youtube'], publicaciones: [] },
  },
  clinica: {
    rubro: 'Clínica dental y odontología estética', nombre: 'Cliente C', pais: 'MX', mapas: { placeId: 'ChIJxxxxxxxx' },
    enlaces: ['https://www.facebook.com/clinica-c/'],
    redes: { facebook: 'clinica-c', instagram: 'clinica_c' },
    espera: { familias: ['salud'], plataformas: ['resenas_google_maps', 'resenas_facebook'], videos: ['videos_instagram'], publicaciones: ['publicaciones_facebook'] },
  },
  alojamiento: {
    rubro: 'Hostal y cabañas frente al mar', nombre: 'Cliente D', pais: 'CO', mapas: MAPAS,
    enlaces: ['https://www.booking.com/hotel/co/cliente-d.html', 'https://www.tripadvisor.com.co/Hotel_Review-g1-d3.html'],
    redes: {},
    espera: { familias: ['alojamiento'], plataformas: ['resenas_google_maps', 'resenas_tripadvisor', 'resenas_booking'], videos: [], publicaciones: [] },
  },
}

describe('4 rubros distintos → 4 planes distintos (lo que aplica a cada uno y nada fijo)', () => {
  for (const [nombre, c] of Object.entries(CLIENTES)) {
    it(`${nombre}: familias, plataformas de reseñas, textos y videos`, () => {
      const plan = planDeFuentesPublicas(c)
      expect(plan.familias).toEqual(expect.arrayContaining(c.espera.familias))
      const funciones = (t: string) => plan.llamadas.filter((l) => l.tipo === t).map((l) => l.funcion).sort()
      expect(funciones('resenas')).toEqual([...c.espera.plataformas].sort())
      expect(funciones('videos')).toEqual([...c.espera.videos].sort())
      expect(funciones('publicaciones')).toEqual([...c.espera.publicaciones].sort())
      // lo que NO se pidió queda dicho con su motivo
      for (const o of plan.omitidas) expect(o.motivo.length).toBeGreaterThan(10)
      // ninguna llamada sin objetivo ni sin pedido
      for (const l of plan.llamadas) { expect(l.objetivo).toBeTruthy(); expect(Object.keys(l.params).length).toBeGreaterThan(0); expect(ACTORES_NUEVOS[l.funcion] ?? { actor: 'existente' }).toBeTruthy() }
    })
  }
  it('las plataformas de un rubro NO aparecen en otro (Tripadvisor/Booking no van a un software; G2/Capterra no van a un restaurante)', () => {
    const f = (r: string) => plataformasQueAplican(familiasDelRubro(r)).map((p) => p.id)
    expect(f('software SaaS')).not.toContain('tripadvisor'); expect(f('software SaaS')).not.toContain('booking'); expect(f('software SaaS')).toContain('software_g2_capterra')
    expect(f('restaurante')).not.toContain('software_g2_capterra'); expect(f('restaurante')).toContain('tripadvisor')
    expect(f('hotel')).toContain('booking'); expect(f('clínica dental')).not.toContain('tripadvisor')
    expect(f('algo que no sabemos')).toEqual(['google_maps', 'facebook']) // sin familia: solo las de todas
    expect(familiasDelRubro('')).toEqual(['general']); expect(familiasDelRubro(null)).toEqual(['general'])
  })
  it('un rubro puede ser de varias familias (hotel con restaurante)', () => {
    expect(familiasDelRubro('hotel boutique con restaurante')).toEqual(expect.arrayContaining(['alojamiento', 'comida']))
  })
})

describe('nunca se inventa una dirección · lo que falta se declara', () => {
  it('sin direcciones halladas: solo lo que no necesita dirección (el mapa) y lo demás queda omitido con motivo', () => {
    const p = planDeFuentesPublicas({ rubro: 'restaurante', pais: 'EC', mapas: MAPAS, enlaces: [], redes: {} })
    expect(p.llamadas.map((l) => l.funcion)).toEqual(['resenas_google_maps'])
    expect(p.omitidas.find((o) => o.plataforma === 'Tripadvisor')!.motivo).toMatch(/no se halló una dirección/)
    expect(p.omitidas.filter((o) => o.tipo === 'videos').length).toBe(3) // instagram, tiktok, youtube sin red
  })
  it('sin ficha de mapas: la reseña de Maps queda omitida con su motivo', () => {
    const p = planDeFuentesPublicas({ rubro: 'tienda online', pais: 'ES', mapas: null, enlaces: [], redes: {} })
    expect(p.omitidas.find((o) => o.plataforma === 'Google Maps')!.motivo).toMatch(/no trajo la ficha propia/)
  })
  it('una dirección de otro sitio con el mismo nombre NO se toma (solo hosts de la plataforma)', () => {
    expect(hallarDireccion(['https://notripadvisor.example/x', 'https://www.tripadvisor.com/y'], ['tripadvisor.com'])).toBe('https://www.tripadvisor.com/y')
    expect(hallarDireccion(['https://tripadvisor.com.evil.example/x'], ['tripadvisor.com'])).toBeNull()
  })
  it('usuario de red: suelto, con arroba, desde dirección de perfil; nunca desde una publicación', () => {
    expect(usuarioDeRed('@nombre', ['instagram.com'])).toBe('nombre')
    expect(usuarioDeRed('https://www.instagram.com/nombre/', ['instagram.com'])).toBe('nombre')
    expect(usuarioDeRed('https://www.instagram.com/p/ABC/', ['instagram.com'])).toBe('')
    expect(usuarioDeRed('https://www.tiktok.com/@nombre', ['instagram.com'])).toBe('')
    expect(usuarioDeRed('https://www.youtube.com/channel/UCxyz', ['youtube.com'])).toBe('UCxyz')
  })
  it('los topes por llamada se respetan y se pueden cambiar', () => {
    const p = planDeFuentesPublicas({ ...CLIENTES.clinica, limites: { resenas: 25, videos: 3, publicaciones: 7 } })
    expect(p.llamadas.find((l) => l.funcion === 'resenas_google_maps')!.params.maxReviews).toBe(25)
    expect(p.llamadas.find((l) => l.funcion === 'videos_instagram')!.params.resultsLimit).toBe(3)
    expect(p.llamadas.find((l) => l.funcion === 'publicaciones_facebook')!.params.resultsLimit).toBe(7)
    expect(p.llamadas.find((l) => l.funcion === 'videos_instagram')!.params.includeTranscript).toBe(true)
  })
  it('las reseñas de Facebook piden la página de reseñas; los pies de Instagram no se piden dos veces', () => {
    const p = planDeFuentesPublicas(CLIENTES.restaurante)
    expect(JSON.stringify(p.llamadas.find((l) => l.funcion === 'resenas_facebook')!.params)).toMatch(/cliente-a\/reviews/)
    expect(p.omitidas.some((o) => o.tipo === 'publicaciones' && o.plataforma === 'Instagram' && /ya los trae/.test(o.motivo))).toBe(true)
  })
})

describe('catálogo coherente', () => {
  it('cada función nueva del catálogo tiene su actor y cada actor es de Apify (usuario~nombre)', () => {
    for (const [fn, a] of Object.entries(ACTORES_NUEVOS)) expect(a.actor, fn).toMatch(/^[a-z0-9_.-]+~[a-z0-9_.-]+$/i)
    const usadas = new Set([...PLATAFORMAS_DE_RESENAS.map((p) => p.funcion), ...REDES_CON_CONTENIDO.flatMap((r) => [r.funcionPublicaciones, r.funcionVideos])].filter(Boolean) as string[])
    for (const f of usadas) if (!['trustpilot_scraper', 'software_review_scraper', 'instagram_scraper'].includes(f)) expect(ACTORES_NUEVOS[f], f).toBeDefined()
  })
})

describe('auditoría agnóstica: ningún archivo de esta carpeta nombra a un cliente, un lugar ni un rubro concreto', () => {
  it('0 nombres propios', () => {
    const dir = join(process.cwd(), 'src/lib/fuentes-publicas')
    const PROHIBIDO = /n[aá]ufrago|ol[oó]n\b|guayaquil|santa elena|ecuador|quito|cuenca|manta\b|ceviche|encebollado|peniche|goeurope|p[eé]rez/i
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) expect(readFileSync(join(dir, f), 'utf8'), f).not.toMatch(PROHIBIDO)
  })
})
