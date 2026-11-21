/**
 * Los 🟡 de CC6 a #1178, antes de encender `PORTERO_COMENTARIOS_INDUSTRIA` (después del 25-nov):
 *  · n1: «lo ya leído» de la industria mira SOLO la industria (los comentarios de la competencia de hoy no la dejan `al_dia`);
 *  · n5 / n5b / n6: el paso REAL `correrPasoDeRedes('comentarios_industria')` pasa el interruptor, la puerta de crédito y las cuentas propias.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ACTORES_DE_LA_INDUSTRIA } from '../comentarios-de-la-industria'
import { correrFuenteNueva, type Ejecutar } from '../fuentes-nuevas'
import { correrPasoDeRedes } from '../redes-del-cliente'
import { crearBaseFalsa } from './base-falsa'

const AHORA = new Date('2026-11-26T12:00:00Z')
const CLIENTE = 'c0ffee00-0000-4000-8000-000000000001'
const hace = (h: number) => new Date(AHORA.getTime() - h * 3_600_000).toISOString()
const tend = (red: string, ref: string, autor: string, extra: Record<string, unknown> = {}) => ({
  client_id: CLIENTE, red, nivel: 'pais', consulta: red === 'instagram' ? '#encebollado' : 'encebollado', post_ref: ref,
  url: red === 'instagram' ? `https://www.instagram.com/p/${ref}/` : `https://www.tiktok.com/@${autor}/video/${ref}`, autor: `@${autor}`, me_gusta: 500, observado_en: hace(24), ...extra,
})
const comentarios = (pre: string, n = 3) => Array.from({ length: n }, (_, i) => ({ cid: `${pre}${i}`, id: `${pre}${i}`, text: `muy rico ${i}`, comment: `muy rico ${i}`, diggCount: i, likesCount: i, createTimeISO: hace(2), timestamp: hace(2) }))
const filaComentario = (nivel: 'competencia' | 'industria', red: string, ref: string) => ({
  client_id: CLIENTE, red, nivel, cuenta: nivel === 'industria' ? 'industria:pais' : 'competidor_x', post_ref: ref, post_url: 'https://x', comentario_ref: `${red}:${ref}:k`, texto: 'hola', me_gusta: 1, observado_en: hace(1),
})
const clienteFicha = { id: CLIENTE, name: 'Mar Abierto', industry: 'restaurante de mariscos', country: 'Ecuador', config: { apify: { own_handles: { tiktok: '@propio', instagram: '@propio' } } } }

describe('n1 · lo ya leído de la industria no mira la competencia', () => {
  const correr = async (yaGuardado: ReturnType<typeof filaComentario>[]) => {
    const base = crearBaseFalsa({ cerebro_tendencias: [tend('tiktok', 't1', 'otro')], cerebro_comentarios_competencia: yaGuardado } as never)
    const actores: string[] = []
    const ejecutar: Ejecutar = async (actor) => { actores.push(actor); return { items: comentarios('k'), costo_usd: 0.01 } }
    await correrFuenteNueva({ db: base.db, fuente: 'comentarios_industria', cliente: clienteFicha as never, clientId: CLIENTE, ciudadesDeSedes: [], ahora: AHORA, ejecutar, leerComentarios: async () => ({ costo_usd: 0 }), env: { PORTERO_COMENTARIOS_INDUSTRIA: 'on' }, credito: async () => ({ hay_credito: true, leido: true, usado_usd: 5, credito_usd: 29, hasta: '2026-11-30', mensaje: null }) })
    return actores
  }
  it('con comentarios de la COMPETENCIA de hace 1 hora en TikTok, la industria igual lee TikTok', async () => {
    expect(await correr([filaComentario('competencia', 'tiktok', 'z1')])).toContain(ACTORES_DE_LA_INDUSTRIA.tiktok.comentarios)
  })
  it('CONTROL · con comentarios de la INDUSTRIA de hace 1 hora en TikTok, no vuelve a leer TikTok esta semana', async () => {
    expect(await correr([filaComentario('industria', 'tiktok', 'z1')])).not.toContain(ACTORES_DE_LA_INDUSTRIA.tiktok.comentarios)
  })
})

describe('n5 · n5b · n6 · el paso real de redes para la industria', () => {
  const correr = async (env: Record<string, string>) => {
    const base = crearBaseFalsa({ clients: [clienteFicha], client_sedes: [], cerebro_tendencias: [tend('tiktok', 'mio1', 'propio', { me_gusta: 99_999 }), tend('tiktok', 'ajeno1', 'otro')], cerebro_comentarios_competencia: [] } as never)
    const urls: string[] = [], pedidos: Array<{ actor: string; cuerpo: string }> = []
    const responder = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } })
    const fetchFalso = async (u: string, i?: RequestInit): Promise<Response> => {
      urls.push(u)
      if (u.startsWith('https://api.apify.com/v2/users/me/limits')) return responder({ data: { limits: { maxMonthlyUsageUsd: 29 }, current: { monthlyUsageUsd: 5 }, monthlyUsageCycle: { endAt: '2026-11-30T00:00:00Z' } } })
      if (u.startsWith('https://api.apify.com/v2/users/me')) return responder({ data: { plan: { monthlyUsageCreditsUsd: 29 } } })
      const run = u.match(/\/v2\/acts\/([^/]+)\/runs/)
      if (run) { pedidos.push({ actor: decodeURIComponent(run[1]), cuerpo: String(i?.body ?? '') }); return responder({ data: { id: `r${pedidos.length}`, status: 'SUCCEEDED', defaultDatasetId: `d${pedidos.length}`, usageTotalUsd: 0.01 } }) }
      if (/\/v2\/datasets\/[^/]+\/items/.test(u)) return responder(comentarios('k'))
      return responder({ data: [] })
    }
    const r = await correrPasoDeRedes({ db: base.db as never, clientId: CLIENTE, paso: 'comentarios_industria', ahora: AHORA, env: { PORTERO_TENDENCIAS: 'on', APIFY_API_TOKEN: 'tok', NEXT_PUBLIC_SUPABASE_URL: 'https://base.test', SUPABASE_SERVICE_ROLE_KEY: 'llave', ...env }, fetch: fetchFalso as never })
    return { r, urls, pedidos }
  }
  it('encendido: lee el crédito de Apify (n5b) y lee la publicación AJENA del rubro (n5)', async () => {
    const { urls, pedidos } = await correr({ PORTERO_COMENTARIOS_INDUSTRIA: 'on' })
    expect(urls.some((u) => u.startsWith('https://api.apify.com/v2/users/me'))).toBe(true)
    const tiktok = pedidos.filter((p) => p.actor === ACTORES_DE_LA_INDUSTRIA.tiktok.comentarios)
    expect(tiktok).toHaveLength(1)
    expect(tiktok[0].cuerpo).toContain('ajeno1')
  })
  it('las cuentas PROPIAS del cliente, leídas de su ficha, nunca entran como industria (n6)', async () => {
    const { pedidos } = await correr({ PORTERO_COMENTARIOS_INDUSTRIA: 'on' })
    expect(pedidos.length).toBeGreaterThan(0)
    expect(pedidos.some((p) => p.cuerpo.includes('mio1') || p.cuerpo.includes('@propio'))).toBe(false)
  })
  it('CONTROL · apagado: ni lee el crédito ni pide nada a Apify', async () => {
    const { urls, pedidos } = await correr({ PORTERO_COMENTARIOS_INDUSTRIA: 'off' })
    expect(pedidos).toHaveLength(0)
    expect(urls.some((u) => u.includes('api.apify.com'))).toBe(false)
  })
})

describe('m1 · m2 · la migración 202611181400', () => {
  const sql = readFileSync('supabase/migrations/202611181400_cerebro_comentarios_de_la_industria.sql', 'utf8').replace(/--.*$/gm, '')
  it('lo de hoy queda como competencia: `nivel` es NOT NULL con default competencia (m1)', () => {
    expect(sql).toMatch(/add column if not exists nivel text not null default 'competencia'/)
    expect(sql).not.toMatch(/nivel text[^,;]*default 'industria'/)
  })
  it('la red de YouTube entra al check de redes, sin perder las de hoy (m2)', () => {
    const check = sql.match(/red_check check \(red in \(([^)]*)\)\)/)?.[1] ?? ''
    expect(check.split(',').map((x) => x.trim().replace(/'/g, '')).sort()).toEqual(['facebook', 'instagram', 'tiktok', 'x', 'youtube'])
  })
  it('el nivel solo acepta competencia o industria', () => {
    expect(sql).toMatch(/nivel_check check \(nivel in \('competencia', 'industria'\)\)/)
  })
})
