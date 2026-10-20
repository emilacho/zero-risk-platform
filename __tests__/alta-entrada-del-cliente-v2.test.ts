/**
 * LA ENTRADA DEL CLIENTE · V2 (CC#1 · 20-oct · pendientes (a)(b)(c) de la certificación de CC#3 sobre #659). US$ 0.
 * (a) el dominio PARECIDO a una red no es la red (mata la mutación que sobrevivió: quitar el ancla `$` del host);
 * (b) más formas de enlace que no son sitio (Google Maps, acortadores, agregadores) y más paredes (TikTok, LinkedIn, Cloudflare, X, consentimiento de Google, «Forbidden»), con paridad JS↔TS;
 * (c) un «@usuario» (o un texto que no es una dirección) en el campo web se AVISA, no se calla.
 * Se EJECUTA el texto real de los 3 nodos del flujo preparado y se compara con la V1 (lo vivo y certificado).
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { clasificarDireccion, esMuro, normalizarEntrada } from '@/lib/alta/entrada-del-cliente'

const D = path.resolve(__dirname, '../scripts/worker-staging/LyVoKcrypS5uLyuu')
const M = await import(pathToFileURL(path.join(D, 'construir-entrada-del-cliente-v2-2026-10-20.mjs')).href)
type Nodo = { name: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: unknown }
const leer = (f: string) => JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')) as Flujo
const v1 = leer('LyVoKcrypS5uLyuu-ARREGLADO-entrada-del-cliente-2026-10-20.json')
const v2 = leer('LyVoKcrypS5uLyuu-ARREGLADO-entrada-del-cliente-v2-2026-10-20.json')
const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!

const b = new Function(M.BLOQUE_V2 + '\nreturn { entNormalizar, entEsMuro, entClasificar }')() as {
  entNormalizar: (x: Record<string, unknown>) => { sitio: string | null; cuentas: Record<string, string>; avisos: string[]; direccion_era: string | null }
  entEsMuro: (t: string, u?: string) => { es: boolean; tipo: string | null }
  entClasificar: (u: string) => { tipo: string; red: string | null; usuario: string | null }
}

describe('(a) un dominio PARECIDO a una red no es la red', () => {
  it('instagram.com.algo.ec, miempresa-instagram.com, instagram.com.ec y similares son SITIOS', () => {
    for (const u of ['https://instagram.com.algo.ec', 'https://miempresa-instagram.com', 'https://instagram.com.ec/inicio', 'https://www.facebook.com.empresa.ec', 'https://no-tiktok.com', 'https://youtube.com.mx.tienda.com', 'https://linkedin.com.example.org', 'https://fb.me.tienda.ec', 'https://t.co.algo.ec', 'https://wa.me.empresa.ec', 'https://google.com.ec/search?q=x', 'https://g.page.empresa.ec']) {
      expect(b.entClasificar(u).tipo, u).toBe('sitio'); expect(clasificarDireccion(u).tipo, u).toBe('sitio')
    }
  })
  it('y los de verdad siguen siéndolo (incluidos subdominios legítimos)', () => {
    for (const u of ['https://instagram.com/x', 'https://www.instagram.com/x', 'https://l.instagram.com/x', 'https://m.facebook.com/x', 'https://web.facebook.com/x']) expect(b.entClasificar(u).tipo, u).toBe('red')
  })
})

describe('(b) más formas que no son un sitio con el texto del negocio', () => {
  it('Google Maps en todas sus formas: la ficha de Maps NO es el sitio', () => {
    for (const u of ['https://g.page/mi-negocio', 'https://www.google.com/maps/place/Mi+Negocio/@-2.1,-79.9', 'https://google.com.ec/maps/x', 'https://maps.google.com/?cid=123', 'https://maps.app.goo.gl/abc', 'https://goo.gl/maps/abc', 'https://www.google.com/maps']) expect(b.entClasificar(u).tipo, u).toBe('no_sitio')
    expect(b.entClasificar('https://www.google.com/search?q=mi+negocio').tipo).toBe('sitio') // Google que no es Maps: no se adivina
  })
  it('acortadores y enlaces de mensaje son redes pero NO dan una cuenta (la primera parte de la ruta no es un usuario)', () => {
    for (const [u, red] of [['https://instagr.am/mi_cuenta', 'instagram'], ['https://ig.me/m/alguien', 'instagram'], ['https://fb.watch/abc123', 'facebook'], ['https://m.me/mi.pagina', 'facebook'], ['https://messenger.com/t/123', 'facebook'], ['https://lnkd.in/xyz', 'linkedin'], ['https://t.co/abc', 'x']] as const) {
      const r = b.entClasificar(u); expect(r.tipo, u).toBe('red'); expect(r.red, u).toBe(red)
    }
    expect(b.entClasificar('https://instagr.am/mi_cuenta').usuario).toBe('mi_cuenta') // el alias de Instagram SÍ es un perfil
    for (const u of ['https://ig.me/m/alguien', 'https://fb.watch/abc123', 'https://messenger.com/t/123', 'https://lnkd.in/xyz', 'https://t.co/abc']) expect(b.entClasificar(u).usuario, u).toBeNull()
    expect(b.entClasificar('https://m.me/mi.pagina').usuario).toBe('mi.pagina') // m.me/<página> SÍ nombra la página
  })
  it('agregadores de enlaces y chats nuevos', () => {
    for (const u of ['https://taplink.cc/negocio', 'https://lnk.bio/negocio', 'https://msha.ke/negocio', 'https://solo.to/negocio', 'https://linkin.bio/negocio', 'https://wa.link/abc']) expect(b.entClasificar(u).tipo, u).toBe('no_sitio')
  })
  it('paredes nuevas: login de TikTok · authwall de LinkedIn · Cloudflare (2.º tipo) · error de X · consentimiento de YouTube/Google · «Forbidden»/«Not Found» sueltos', () => {
    const casos: Array<[string, string]> = [
      ['Log in to TikTok\nPhone / Email / Username\nContinue with Facebook', 'login'], ['Join now to see who you already know on LinkedIn. Sign in or join.', 'login'],
      ['Checking if the site connection is secure\nverify you are human by completing the action below', 'bloqueo'], ['Sorry, you have been blocked\nCloudflare Ray ID: 7a1b', 'bloqueo'],
      ['Something went wrong. Try again.', 'bloqueo'], ['Before you continue to YouTube\nWe use cookies and data to deliver and maintain Google services', 'login'],
      ['Forbidden', 'error'], ['Not Found', 'error'], ['Sign in to continue', 'login'],
    ]
    for (const [t, tipo] of casos) { const r = b.entEsMuro(t); expect(r.es, t).toBe(true); expect(r.tipo, t).toBe(tipo); expect(esMuro(t).es, t).toBe(true) }
  })
  it('las paredes de antes siguen y un texto real largo NO se marca por una palabra suelta', () => {
    expect(b.entEsMuro('descripcion create an account or log in to instagram share what you re into with the people who get you').es).toBe(true)
    expect(b.entEsMuro('Somos una empresa de extintores. No hemos encontrado ninguna queja pendiente en veinte años de servicio. '.repeat(40)).es).toBe(false)
    expect(b.entEsMuro('x'.repeat(5000) + ' not found forbidden ' + 'menú '.repeat(80)).es).toBe(false)
  })
})

describe('(c) lo que llega en el campo web y no es una dirección se AVISA', () => {
  it('«@usuario» (con o sin punto): no es sitio, no se adivina de qué red es, y el aviso lo dice', () => {
    for (const x of ['@zeroriskgye', '@mi.negocio', ' @cuenta_1 ']) {
      const r = b.entNormalizar({ website: x })
      expect(r.sitio, x).toBeNull(); expect(r.cuentas, x).toEqual({}); expect(r.avisos.join(' '), x).toMatch(/una cuenta, no un sitio.*ni se adivina de qué red es/)
      expect(normalizarEntrada({ website: x })).toEqual(r)
    }
  })
  it('un texto que no es una dirección («no tiene», «n/a», «-») tampoco es sitio y se avisa; lo vacío no avisa', () => {
    for (const x of ['no tiene', 'n/a', '-', 'proximamente']) { const r = b.entNormalizar({ website: x }); expect(r.sitio, x).toBeNull(); expect(r.avisos.join(' '), x).toMatch(/no parece una dirección web/) }
    for (const x of [undefined, null, '', '   ']) expect(b.entNormalizar({ website: x as string }).avisos, String(x)).toEqual([])
  })
  it('una dirección real sigue sin aviso, y la cuenta pasada en su campo se conserva', () => {
    expect(b.entNormalizar({ website: 'https://tienda.com', instagram: '@mi_cuenta' })).toMatchObject({ sitio: 'https://tienda.com', cuentas: { instagram: 'mi_cuenta' }, avisos: [] })
    expect(b.entNormalizar({ website: '@zeroriskgye', instagram: 'zeroriskgye' }).cuentas).toEqual({ instagram: 'zeroriskgye' })
  })
})

describe('el flujo V2: solo cambia el TEXTO del bloque, en los mismos 3 nodos', () => {
  it('solo difieren los 3 nodos; nodos y cables iguales a la V1 (lo vivo)', () => {
    expect(v2.nodes.map((n) => n.name)).toEqual(v1.nodes.map((n) => n.name))
    expect(v2.nodes.filter((n, i) => JSON.stringify(n) !== JSON.stringify(v1.nodes[i])).map((n) => n.name).sort()).toEqual([...M.NODOS].sort())
    expect(JSON.stringify(v2.connections)).toBe(JSON.stringify(v1.connections))
  })
  it('🔴 LINAJE: la V1 es la que está certificada y viva; el constructor V2 reproduce la V2 y no se construye dos veces', () => {
    expect(JSON.stringify(M.construirFlujo(v1))).toBe(JSON.stringify(v2))
    expect(() => M.construirFlujo(v2)).toThrow(/ya trae la V2/)
  })
  it('en cada nodo, TODO lo que no es el bloque queda idéntico a la V1', () => {
    const sinBloque = (c: string) => { const i = c.indexOf('// ═══ LA ENTRADA DEL CLIENTE'), j = c.indexOf('// ═══ fin de la entrada del cliente ═══'); return c.slice(0, i) + c.slice(j + '// ═══ fin de la entrada del cliente ═══'.length) }
    for (const n of M.NODOS) expect(sinBloque(nodo(v2, n).parameters.jsCode), n).toBe(sinBloque(nodo(v1, n).parameters.jsCode))
  })
  it('los 3 nodos traen EXACTAMENTE el bloque V2 y se ejecutan: el caso de la prueba real sigue igual', () => {
    for (const n of M.NODOS) expect(nodo(v2, n).parameters.jsCode as string, n).toContain(M.BLOQUE_V2)
    const validar = nodo(v2, 'Validate Deal Data').parameters.jsCode as string
    const $ = () => { throw new Error('no se usa') }
    const [{ json }] = new Function('$input', '$', '$env', '$workflow', '$execution', validar)({ first: () => ({ json: { body: { client_name: 'X', industry: 'r', website: 'https://www.instagram.com/zeroriskgye', instagram: 'zeroriskgye', country: 'EC', city: 'Guayaquil', client_id: 'c-1' } } }) }, $, {}, { id: 'W' }, { id: 'E' })
    expect(json).toMatchObject({ website: null, instagram_handle: 'zeroriskgye' })
  })
  it('conserva los saltos de línea y no lleva llaves ni nombres de clientes en lo nuevo', () => {
    const CRLF = String.fromCharCode(13, 10)
    for (const n of M.NODOS) expect((nodo(v2, n).parameters.jsCode as string).includes(CRLF), n).toBe((nodo(v1, n).parameters.jsCode as string).includes(CRLF))
    expect(JSON.stringify(v2)).not.toMatch(/sk-[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{20,}/)
    for (const p of ['naufrago', 'náufrago', 'zeroriskgye', 'zerorisk', 'guayaquil', 'olon']) expect(M.BLOQUE_V2.toLowerCase().includes(p), p).toBe(false)
  })
})
