/**
 * La herramienta para MIRAR AFUERA · un empleado pide un dato público.
 *
 * ── EL ROJO ───────────────────────────────────────────────────────────────
 * Contra el estado de HOY estas afirmaciones tienen que FALLAR:
 *   1. «el empleado que escribe el plan puede pedir un dato de afuera»
 *      → hoy: ningún empleado tiene esa herramienta · sólo la piden FLUJOS.
 *   2. «la herramienta apunta a un archivo que existe en la imagen»
 *      → hoy: el único montaje de Apify apunta a `packages/apify-mcp-server/
 *        dist/index.js`, carpeta que el Dockerfile del corredor NO COPIA.
 *
 * ── EL CONTROL POSITIVO ───────────────────────────────────────────────────
 * «default-deny sigue firme» y «sin cliente no se monta nada» tienen que dar
 * VERDE hoy y después.
 */
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildMcpServers } from '../agent-mcp-registry'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CATALOGO } = require('../mcp/apify-catalogo.js') as {
  CATALOGO: Record<string, { para: string; funcion: string; params: (a: Record<string, string>) => Record<string, unknown> }>
}

/** Las 16 que el Servicio acepta · lista medida del flujo vivo (2026-09-05). */
const FUNCIONES_DEL_SERVICIO = new Set([
  'facebook_ads_library_scraper', 'instagram_scraper', 'instagram_post_comments_scraper',
  'linkedin_company_scraper', 'tiktok_profile_scraper', 'google_ads_scraper',
  'tiktok_creative_center_scraper', 'youtube_channel_scraper', 'youtube_video_scraper',
  'youtube_comments_scraper', 'google_serp_scraper', 'google_maps_scraper',
  'similarweb_scraper', 'trustpilot_scraper', 'software_review_scraper', 'twitter_scraper',
  // 17ª · 2026-09-06 · leer el sitio del cliente
  'website_content_scraper',
])

const ctx = { agentSlug: 'campaign-brief-agent', clientId: 'cli-1' }

describe('el empleado puede pedir que se mire afuera', () => {
  it('🔴 ROJO · el que escribe el plan TIENE la herramienta', () => {
    expect(buildMcpServers(ctx)['mirar-afuera']).toBeDefined()
  })

  it('🔴 ROJO · el montaje apunta a un archivo que EXISTE (el viejo no existía)', () => {
    const s = buildMcpServers(ctx)['mirar-afuera']
    const ruta = s.args[0]
    expect(ruta.endsWith('apify-service-server.js')).toBe(true)
    // el archivo vive en `src/lib/mcp/`, que es lo único que la imagen lleva
    expect(existsSync(resolve(__dirname, '..', 'mcp', 'apify-service-server.js'))).toBe(true)
    // y el camino viejo, el que nunca pudo arrancar, sigue sin existir
    expect(existsSync(resolve(process.cwd(), '..', '..', 'packages', 'apify-mcp-server', 'dist', 'index.js'))).toBe(false)
  })

  it('no necesita la llave de Apify · la tiene el Servicio', () => {
    const s = buildMcpServers(ctx)['mirar-afuera']
    expect(Object.keys(s.env)).not.toContain('APIFY_TOKEN')
    expect(Object.keys(s.env)).not.toContain('APIFY_API_TOKEN')
    expect(s.env.CLIENT_ID).toBe('cli-1')
    expect(s.env.AGENT_SLUG).toBe('campaign-brief-agent')
  })

  it('CONTROL POSITIVO · default-deny · un empleado fuera de la lista NO la tiene', () => {
    expect(buildMcpServers({ agentSlug: 'content-creator', clientId: 'cli-1' })['mirar-afuera']).toBeUndefined()
  })

  it('CONTROL POSITIVO · sin cliente no se monta · mirar es mirar a nombre de alguien', () => {
    expect(buildMcpServers({ agentSlug: 'campaign-brief-agent' })['mirar-afuera']).toBeUndefined()
  })

  it('también la tienen los dos que investigan', () => {
    for (const slug of ['competitive-intelligence-agent', 'market-research']) {
      expect(buildMcpServers({ agentSlug: slug, clientId: 'c' })['mirar-afuera']).toBeDefined()
    }
  })
})

describe('el catálogo · lo que el empleado pide, traducido', () => {
  it('cada cosa que se puede mirar cae en una función que el Servicio acepta', () => {
    const funciones = Object.values(CATALOGO).map((c) => c.funcion)
    expect(funciones.length).toBeGreaterThanOrEqual(8)
    for (const f of funciones) expect(FUNCIONES_DEL_SERVICIO.has(f)).toBe(true)
  })

  it('🔴 arma el mínimo que cada raspador necesita · lo que faltaba en los rotos', () => {
    // anuncios de Google · busca por DOMINIO (medido · era el defecto)
    const g = CATALOGO.anuncios_en_google.params({ de_quien: 'booking.com' })
    expect(g.domain).toBe('booking.com')
    // mapas · necesita la búsqueda, no un nombre suelto
    const m = CATALOGO.ficha_en_mapas.params({ de_quien: 'Náufrago Olón', donde: 'Ecuador' })
    expect(m.searchStringsArray).toEqual(['Náufrago Olón'])
    expect(m.locationQuery).toBe('Ecuador')
    // instagram · sin arroba
    expect(CATALOGO.instagram.params({ de_quien: '@naufrago.ec' }).usernames).toEqual(['naufrago.ec'])
    // tráfico · dominio pelado
    expect(CATALOGO.trafico_del_sitio.params({ de_quien: 'https://naufrago.ec/menu' }).websites).toEqual(['naufrago.ec'])
  })

  it('el empleado no necesita saber un solo nombre interno', () => {
    // lo que se le ofrece está en castellano de negocio
    for (const clave of Object.keys(CATALOGO)) {
      expect(clave).not.toMatch(/scraper|apify|actor/i)
      expect(CATALOGO[clave].para.length).toBeGreaterThan(15)
    }
  })
})

describe('leer el sitio · la 17ª, desde el empleado', () => {
  it('🔴 ROJO · el empleado puede pedir que se lea un sitio', () => {
    expect(CATALOGO.leer_el_sitio).toBeDefined()
    expect(CATALOGO.leer_el_sitio.funcion).toBe('website_content_scraper')
  })

  it('le saca el esquema a la direccion · el Servicio se lo vuelve a poner', () => {
    expect(CATALOGO.leer_el_sitio.params({ de_quien: 'https://naufrago.ec' }).url).toBe('naufrago.ec')
  })
})
