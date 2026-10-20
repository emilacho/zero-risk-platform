/**
 * LA ENTRADA DEL CLIENTE en TypeScript (CC#1 · 20-oct): el MISMO criterio que el texto pegado en el alta, y la ruta `/api/clients/upsert` ya no guarda una red social como «sitio web». US$ 0.
 */
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clasificarDireccion, esMuro, normalizarEntrada, usuarioDeRed } from '@/lib/alta/entrada-del-cliente'

const D = path.resolve(__dirname, '../scripts/worker-staging/LyVoKcrypS5uLyuu')
const js = new Function(fs.readFileSync(path.join(D, 'bloque-entrada-del-cliente-2026-10-20.js'), 'utf8') + '\nreturn { entNormalizar, entEsMuro, entClasificar, entUsuarioDe }')() as {
  entNormalizar: (b: Record<string, unknown>) => unknown; entEsMuro: (t: string, u?: string) => unknown; entClasificar: (u: string) => unknown; entUsuarioDe: (r: string, v: string) => unknown
}

const DIRECCIONES = [
  'https://www.instagram.com/zeroriskgye', 'https://www.instagram.com/zeroriskgye/', 'instagram.com/mi.cuenta', 'https://instagram.com/p/ABC/', 'https://www.instagram.com/accounts/login/?next=x', 'http://instagr.am/x',
  'https://www.facebook.com/mi.negocio', 'https://m.facebook.com/mi.negocio/', 'https://www.facebook.com/profile.php?id=1', 'https://fb.me/mi.negocio',
  'https://www.tiktok.com/@mi_negocio', 'https://www.tiktok.com/@mi_negocio?lang=es', 'https://www.linkedin.com/company/mi-negocio/', 'https://www.linkedin.com/in/alguien', 'https://www.linkedin.com/feed/',
  'https://www.youtube.com/@mi_negocio', 'https://www.youtube.com/c/MiNegocio', 'https://www.youtube.com/channel/UC123', 'https://youtu.be/abc', 'https://x.com/mi_negocio', 'https://twitter.com/mi_negocio',
  'https://linktr.ee/negocio', 'https://wa.me/593999999999', 'https://beacons.ai/x', 'https://maps.app.goo.gl/abc', 'https://tienda.com', 'tienda.com', 'http://www.empresa.com.ec/inicio', 'https://empresa.ec/?utm=x',
  'https://user:pass@sitio.com/ruta', 'https://sitio.com:8080/x', '', '   ', 'no es una direccion', 'ftp://archivo.com/x', 'HTTPS://WWW.INSTAGRAM.COM/Mayusculas',
]
const TRATOS: Array<Record<string, unknown>> = [
  {}, { website: 'https://www.instagram.com/zeroriskgye', instagram: 'zeroriskgye' }, { website: 'https://www.instagram.com/otra', instagram: '@dada' }, { website: 'https://empresa.ec', instagram_handle: 'https://instagram.com/cuenta/' },
  { domain: 'https://www.facebook.com/mi.negocio', tiktok: '@tt', youtube_handle: 'yt' }, { website: 'https://linktr.ee/x', facebook: 'mi.negocio' }, { website: null, domain: 'tienda.com' }, { instagram: 'dos palabras', facebook: '!!!' },
]
const TEXTOS = [
  'Instagram\nSee everyday moments from your close friends.\nLog into Instagram\nMobile number, username or email\nPassword\nLog in\nForgot password?\nLog in with Facebook\nCreate new account',
  'descripcion create an account or log in to instagram share what you re into with the people who get you', 'Just a moment... Verifying you are human.', '# 502 Bad Gateway\n\n### Host Not Found or connection failed',
  'Inicia sesión para continuar. Crear cuenta nueva.', 'Somos una empresa de extintores en Guayaquil. Recarga y mantenimiento.', 'x'.repeat(6000) + ' Iniciar sesión ' + 'menú '.repeat(80), '', '   ', 'Access denied', 'Page not found',
]

describe('el TypeScript da EXACTAMENTE lo que el texto pegado en el alta', () => {
  it('clasificar una dirección', () => { for (const d of DIRECCIONES) expect(clasificarDireccion(d), d).toEqual(js.entClasificar(d)) })
  it('la cuenta de una red desde cualquier forma', () => {
    for (const red of ['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube']) for (const v of [...DIRECCIONES, '@cuenta', 'cuenta/', 'cuenta', 'dos palabras', 5 as unknown as string]) expect(usuarioDeRed(red as 'instagram', v), `${red} ${v}`).toEqual(js.entUsuarioDe(red, v))
  })
  it('normalizar un trato', () => { for (const t of TRATOS) expect(normalizarEntrada(t), JSON.stringify(t)).toEqual(js.entNormalizar(t)) })
  it('reconocer una pared (con y sin dirección cargada)', () => {
    for (const x of TEXTOS) for (const u of ['', 'https://www.instagram.com/accounts/login/?next=x', 'https://sitio.com/x']) expect(esMuro(x, u), `${x.slice(0, 30)} | ${u}`).toEqual(js.entEsMuro(x, u))
  })
})

// ───────────────────────── la ruta
const mockAuth = vi.fn()
vi.mock('@/lib/internal-auth', () => ({ checkInternalKey: (r: Request) => mockAuth(r) }))
let configEnBase: unknown = {}
let filasUpsert: Array<Record<string, unknown>> = []
let escrituras: Array<Record<string, unknown>> = []
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from(t: string) {
      if (t === 'client_journey_state') return { insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'j-1' }, error: null }) }) }) }
      if (t !== 'clients') throw new Error('tabla inesperada ' + t)
      return {
        upsert: (fila: Record<string, unknown>) => { filasUpsert.push(fila); return { select: () => ({ single: async () => ({ data: { id: 'c-1', name: 'X', slug: 'x' }, error: null }) }) } },
        select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }), maybeSingle: async () => ({ data: { config: configEnBase }, error: null }) }) }),
        update: (fila: Record<string, unknown>) => ({ eq: async () => { escrituras.push(fila); return { error: null } } }),
      }
    },
  }),
}))
import { POST } from '@/app/api/clients/upsert/route'
const pedido = (c: Record<string, unknown>) => new Request('http://x/api/clients/upsert', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Clinica Ejemplo', ...c }) })

describe('POST /api/clients/upsert · una red social no se guarda como sitio web', () => {
  beforeEach(() => { mockAuth.mockReturnValue({ ok: true }); configEnBase = { apify: { competitor_list: [1] } }; filasUpsert = []; escrituras = [] })
  it('la «web» es un Instagram: NO queda en `website_url` y la cuenta pasa a `own_handles`', async () => {
    const r = await POST(pedido({ website: 'https://www.instagram.com/clinicaejemplo' })); const j = await r.json()
    expect(r.status).toBe(200)
    expect(filasUpsert[0]).not.toHaveProperty('website_url')
    expect(j.own_handles).toEqual({ guardados: ['instagram'], descartados: [] })
    expect(escrituras).toEqual([{ config: { apify: { competitor_list: [1], own_handles: { instagram: 'clinicaejemplo' } } } }])
  })
  it('`website_url` (el otro nombre del campo) se trata igual', async () => {
    await POST(pedido({ website_url: 'https://www.instagram.com/clinicaejemplo/' }))
    expect(filasUpsert[0]).not.toHaveProperty('website_url')
  })
  it('lo pedido EXPLÍCITO en `own_handles` manda sobre la cuenta que venía dentro de la «web»', async () => {
    await POST(pedido({ website: 'https://www.instagram.com/otra_cuenta', own_handles: { instagram: '@la_dada' } }))
    expect(escrituras[0]).toEqual({ config: { apify: { competitor_list: [1], own_handles: { instagram: 'la_dada' } } } })
  })
  it('un sitio real se guarda como siempre y NO inventa cuentas', async () => {
    const j = await (await POST(pedido({ website: 'https://clinicaejemplo.com' }))).json()
    expect(filasUpsert[0]).toMatchObject({ website_url: 'https://clinicaejemplo.com' })
    expect(j).not.toHaveProperty('own_handles'); expect(escrituras).toEqual([])
  })
  it('un agregador de enlaces tampoco es sitio (y no inventa una cuenta)', async () => {
    const j = await (await POST(pedido({ website: 'https://linktr.ee/clinica' }))).json()
    expect(filasUpsert[0]).not.toHaveProperty('website_url'); expect(j).not.toHaveProperty('own_handles')
  })
  it('sin ninguna web: nada cambia', async () => {
    await POST(pedido({}))
    expect(filasUpsert[0]).not.toHaveProperty('website_url'); expect(escrituras).toEqual([])
  })
})
