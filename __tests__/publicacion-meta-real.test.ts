/**
 * PUBLICAR DE VERDAD EN META (16-nov · CC3) · red simulada, US$ 0.
 *  · solo cuatro rutas orgánicas, en la cuenta de la ficha del cliente; nada de pauta ni de promoción;
 *  · Instagram: contenedor → espera a FINISHED → publicar; Facebook: token de la página → publicar;
 *  · nunca devuelve un token.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { publicarPiezaEnMeta, rutaPermitida } from '../src/lib/publicacion/meta-real'
import { armarSolicitud } from '../src/lib/publicacion/en-ensayo'
import type { CuentasMeta } from '../src/lib/clients/cuentas-meta'

const IG = '17841464538946870'
const PAG = '1525854397268597'
const CUENTAS: CuentasMeta = { pagina_facebook: PAG, instagram_id: IG, publicacion_real: true }
const ENV = { META_ACCESS_TOKEN: 'SECRETO-SIS' }
const RAPIDO = { intentos: 3, pausaMs: 0 }
const PIEZA_IG = armarSolicitud({ canal: 'instagram', image_url: 'https://c.com/a.jpg', caption: 'Hola' }, CUENTAS)
const PIEZA_FB = armarSolicitud({ canal: 'facebook', message: 'Hola' }, CUENTAS)

type Llamada = { metodo: string; url: string; cuerpo: unknown; token: string | null }
let llamadas: Llamada[] = []
let responder: (l: Llamada) => { status?: number; json: unknown }
beforeEach(() => {
  llamadas = []
  responder = () => ({ json: {} })
  vi.stubGlobal('fetch', async (u: string, init?: RequestInit) => {
    const url = new URL(String(u))
    const l = { metodo: init?.method ?? 'GET', url: url.origin + url.pathname + (url.searchParams.get('fields') ? `?fields=${url.searchParams.get('fields')}` : ''), cuerpo: init?.body ? JSON.parse(String(init.body)) : null, token: url.searchParams.get('access_token') }
    llamadas.push(l)
    const r = responder(l)
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200 })
  })
})
afterEach(() => { vi.unstubAllGlobals() })
const G = (r: string) => `https://graph.facebook.com/v21.0${r}`

describe('rutaPermitida (solo lo orgánico, solo la cuenta de la ficha)', () => {
  it('acepta las cuatro rutas en su red y su cuenta', () => {
    expect(rutaPermitida(`/${IG}/media`, 'instagram', CUENTAS)).toBe(true)
    expect(rutaPermitida(`/${IG}/media_publish`, 'instagram', CUENTAS)).toBe(true)
    expect(rutaPermitida(`/${PAG}/photos`, 'facebook', CUENTAS)).toBe(true)
    expect(rutaPermitida(`/${PAG}/feed`, 'facebook', CUENTAS)).toBe(true)
  })
  it('niega pauta, promoción, otra cuenta, otra red y rutas con trampas', () => {
    for (const [ruta, canal] of [
      [`/${PAG}/promote`, 'facebook'], [`/${IG}/promote`, 'instagram'], ['/act_123/campaigns', 'facebook'], ['/act_123/ads', 'facebook'],
      [`/${PAG}_1/promotions`, 'facebook'], ['/999999/feed', 'facebook'], ['/888888/media', 'instagram'],
      [`/${PAG}/feed`, 'instagram'], [`/${IG}/media`, 'facebook'], [`/${IG}/media`, 'tiktok'],
      [`/${IG}/feed`, 'instagram'], [`/${IG}/photos`, 'instagram'], [`/${PAG}/media`, 'facebook'], [`/${PAG}/media_publish`, 'facebook'], [`/${IG}/promote`, 'instagram'], [`/${PAG}/ads`, 'facebook'],
      [`/${PAG}/feed/../promote`, 'facebook'], [`/${PAG}/feed?x=1`, 'facebook'], [`//${PAG}/feed`, 'facebook'], [`/{redes_oficiales.meta.pagina_facebook}/feed`, 'facebook'],
    ]) expect(rutaPermitida(ruta, canal, CUENTAS)).toBe(false)
    expect(rutaPermitida(`/${PAG}/feed`, 'facebook', { ...CUENTAS, pagina_facebook: null })).toBe(false)
  })
})

describe('publicarPiezaEnMeta · Instagram', () => {
  it('contenedor → espera FINISHED → publicar, con el token del sistema; devuelve el id', async () => {
    let estados = ['IN_PROGRESS', 'FINISHED']
    responder = (l) => {
      if (l.metodo === 'POST' && l.url.endsWith('/media')) return { json: { id: 'C1' } }
      if (l.metodo === 'GET') return { json: { status_code: estados.shift() } }
      return { json: { id: 'POST1' } }
    }
    const r = await publicarPiezaEnMeta(PIEZA_IG, CUENTAS, ENV, RAPIDO)
    expect(r).toEqual({ canal: 'instagram', ok: true, id: 'POST1', creation_id: 'C1' })
    expect(llamadas.map((l) => `${l.metodo} ${l.url}`)).toEqual([`POST ${G(`/${IG}/media`)}`, `GET ${G('/C1')}?fields=status_code`, `GET ${G('/C1')}?fields=status_code`, `POST ${G(`/${IG}/media_publish`)}`])
    expect(llamadas[0].cuerpo).toEqual({ image_url: 'https://c.com/a.jpg', caption: 'Hola' })
    expect(llamadas[3].cuerpo).toEqual({ creation_id: 'C1' })
    expect(llamadas.every((l) => l.token === 'SECRETO-SIS')).toBe(true)
    expect(JSON.stringify(r)).not.toContain('SECRETO')
  })
  it('un contenedor en ERROR, o que nunca termina, no se publica', async () => {
    responder = (l) => (l.metodo === 'POST' ? { json: { id: 'C1' } } : { json: { status_code: 'ERROR' } })
    expect(await publicarPiezaEnMeta(PIEZA_IG, CUENTAS, ENV, RAPIDO)).toMatchObject({ ok: false, paso: 'contenedor' })
    expect(llamadas.some((l) => l.url.endsWith('/media_publish'))).toBe(false)
    llamadas = []; responder = (l) => (l.metodo === 'POST' ? { json: { id: 'C1' } } : { json: { status_code: 'IN_PROGRESS' } })
    expect(await publicarPiezaEnMeta(PIEZA_IG, CUENTAS, ENV, RAPIDO)).toMatchObject({ ok: false, paso: 'contenedor', error: expect.stringContaining('a tiempo') })
    expect(llamadas.some((l) => l.url.endsWith('/media_publish'))).toBe(false)
  })
  it('si Meta no devuelve el contenedor, no espera ni publica', async () => {
    responder = () => ({ json: {} })
    expect(await publicarPiezaEnMeta(PIEZA_IG, CUENTAS, ENV, RAPIDO)).toMatchObject({ ok: false, paso: 'contenedor', error: expect.stringContaining('contenedor') })
    expect(llamadas.map((l) => l.metodo)).toEqual(['POST'])
  })
  it('un error de Meta se dice con su mensaje (sin el token)', async () => {
    responder = () => ({ status: 400, json: { error: { message: 'Invalid image' } } })
    expect(await publicarPiezaEnMeta(PIEZA_IG, CUENTAS, ENV, RAPIDO)).toEqual({ canal: 'instagram', ok: false, paso: 'contenedor', error: 'Invalid image' })
  })
})

describe('publicarPiezaEnMeta · Facebook', () => {
  it('pide el token DE LA PÁGINA y publica con él en /feed', async () => {
    responder = (l) => (l.metodo === 'GET' ? { json: { access_token: 'TOKEN-PAG', name: 'Náufrago' } } : { json: { id: `${PAG}_9` } })
    const r = await publicarPiezaEnMeta(PIEZA_FB, CUENTAS, ENV, RAPIDO)
    expect(r).toEqual({ canal: 'facebook', ok: true, id: `${PAG}_9` })
    const post = llamadas.filter((l) => l.metodo === 'POST')
    expect(post.map((l) => l.url)).toEqual([G(`/${PAG}/feed`)]); expect(post[0].token).toBe('TOKEN-PAG'); expect(post[0].cuerpo).toEqual({ message: 'Hola' })
    expect(JSON.stringify(r)).not.toContain('TOKEN')
  })
  it('con foto usa post_id; sin token de página no publica', async () => {
    const foto = armarSolicitud({ canal: 'facebook', image_url: 'https://c.com/a.jpg', caption: 'x' }, CUENTAS)
    responder = (l) => (l.metodo === 'GET' ? { json: { access_token: 'T' } } : { json: { id: 'PH1', post_id: `${PAG}_7` } })
    expect(await publicarPiezaEnMeta(foto, CUENTAS, ENV, RAPIDO)).toEqual({ canal: 'facebook', ok: true, id: `${PAG}_7` })
    llamadas = []; responder = () => ({ status: 400, json: { error: { message: 'no' } } })
    expect(await publicarPiezaEnMeta(PIEZA_FB, CUENTAS, ENV, RAPIDO)).toMatchObject({ ok: false, paso: 'token_de_pagina' })
    expect(llamadas.some((l) => l.metodo === 'POST')).toBe(false)
  })
})

describe('publicarPiezaEnMeta · lo que se niega sin llamar a nadie', () => {
  it('sin token, sin armar, otra red, una ruta cambiada o la cuenta de OTRA ficha', async () => {
    expect(await publicarPiezaEnMeta(PIEZA_FB, CUENTAS, {}, RAPIDO)).toMatchObject({ ok: false, paso: 'configuracion' })
    expect(await publicarPiezaEnMeta(armarSolicitud({ canal: 'facebook' }), CUENTAS, ENV, RAPIDO)).toMatchObject({ ok: false, paso: 'armado' })
    expect(await publicarPiezaEnMeta({ ...PIEZA_FB, canal: 'tiktok' }, CUENTAS, ENV, RAPIDO)).toMatchObject({ ok: false })
    const promo = { ...PIEZA_FB, solicitudes: [{ ...PIEZA_FB.solicitudes[0], ruta: `/${PAG}/promote` }] }
    expect(await publicarPiezaEnMeta(promo, CUENTAS, ENV, RAPIDO)).toMatchObject({ ok: false, error: expect.stringContaining('ruta no permitida') })
    expect(await publicarPiezaEnMeta(PIEZA_FB, { ...CUENTAS, pagina_facebook: '1111111111' }, ENV, RAPIDO)).toMatchObject({ ok: false, error: expect.stringContaining('ruta no permitida') })
    const sinFicha = armarSolicitud({ canal: 'instagram', image_url: 'https://c.com/a.jpg', caption: 'x' })
    expect(await publicarPiezaEnMeta(sinFicha, CUENTAS, ENV, RAPIDO)).toMatchObject({ ok: false, error: expect.stringContaining('ruta no permitida') })
    expect(llamadas).toEqual([])
  })
})
