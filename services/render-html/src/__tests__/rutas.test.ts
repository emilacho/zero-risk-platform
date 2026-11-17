/**
 * Sprint 3 · T5 · 🟡 2 de CC7 sobre #1110: las rutas con un servidor HTTP de verdad y una fila con un dibujante falso (sin Chrome, sin whisper).
 * Lo central: un ANÁLISIS nunca se baja como video (ni su estado por `/video/:id` ni su JSON por `/video/:id/archivo`), y un video no se lee como análisis.
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { ColaDeRenders } from '../cola'
import { crearAtender, type Pedido } from '../rutas'

const LLAVE = 'llave-de-prueba'
const HOST = 'archivos.test'
let servidor: Server | null = null
afterEach(async () => { await new Promise<void>((ok) => (servidor ? servidor.close(() => ok()) : ok())); servidor = null })

async function montar(reloj: () => number = Date.now) {
  const cola = new ColaDeRenders<Pedido>(async (x) => (x.tipo === 'video' ? Buffer.from('MP4-FALSO') : Buffer.from(JSON.stringify({ palabras: [], golpes: [1, 2] }))), reloj, 10, 1000)
  const analisis = new Set<string>()
  const atender = crearAtender({ cola, analisis, hosts: new Set([HOST]), llave: LLAVE, renderPng: async () => ({ png: Buffer.from('PNG'), ms: 1 }) })
  servidor = createServer((req, res) => { void atender(req, res) })
  await new Promise<void>((ok) => servidor!.listen(0, '127.0.0.1', () => ok()))
  const base = `http://127.0.0.1:${(servidor!.address() as AddressInfo).port}`
  const pedir = async (metodo: string, ruta: string, cuerpo?: unknown, llave: string | null = LLAVE) => {
    const r = await fetch(base + ruta, { method: metodo, headers: { ...(llave ? { 'x-render-key': llave } : {}), ...(cuerpo ? { 'content-type': 'application/json' } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined })
    const tipo = r.headers.get('content-type') ?? ''
    return { codigo: r.status, tipo, cuerpo: tipo.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()).toString('utf8') }
  }
  return { cola, analisis, pedir }
}

const PEDIDO_DE_ANALISIS = { voz: { nombre: 'voz.mp3', url: `https://${HOST}/voz.mp3` }, idioma: 'es' }
const PEDIDO_DE_VIDEO = { html: '<html></html>', ancho: 1080, alto: 1920, segundos: 5, archivos: [] }

describe('un análisis no se baja como video', () => {
  it('con el id de un análisis listo, /video/:id y /video/:id/archivo dan 404; /analisis/:id da el resultado', async () => {
    const { cola, pedir } = await montar()
    const a = await pedir('POST', '/analizar', PEDIDO_DE_ANALISIS)
    expect(a.codigo).toBe(202)
    const id = (a.cuerpo as { id: string }).id
    await cola.vaciar()
    expect(cola.ver(id)?.estado).toBe('listo')
    expect(await pedir('GET', `/video/${id}`)).toMatchObject({ codigo: 404 })
    const archivo = await pedir('GET', `/video/${id}/archivo`)
    expect(archivo.codigo).toBe(404)
    expect(archivo.tipo).not.toContain('video/mp4')
    expect(await pedir('GET', `/analisis/${id}`)).toMatchObject({ codigo: 200, cuerpo: { id, estado: 'listo', resultado: { golpes: [1, 2] } } })
  })
  it('y al revés: un video listo se baja como MP4, pero /analisis/:id con su id da 404', async () => {
    const { cola, pedir } = await montar()
    const v = await pedir('POST', '/video', PEDIDO_DE_VIDEO)
    expect(v.codigo).toBe(202)
    const id = (v.cuerpo as { id: string }).id
    await cola.vaciar()
    expect(await pedir('GET', `/video/${id}`)).toMatchObject({ codigo: 200, cuerpo: { id, estado: 'listo' } })
    expect(await pedir('GET', `/video/${id}/archivo`)).toMatchObject({ codigo: 200, tipo: 'video/mp4', cuerpo: 'MP4-FALSO' })
    expect(await pedir('GET', `/analisis/${id}`)).toMatchObject({ codigo: 404 })
  })
  it('sin la llave nadie pasa (tampoco al análisis); /salud no la pide', async () => {
    const { pedir } = await montar()
    expect(await pedir('POST', '/analizar', PEDIDO_DE_ANALISIS, null)).toMatchObject({ codigo: 401 })
    expect(await pedir('POST', '/analizar', PEDIDO_DE_ANALISIS, 'otra')).toMatchObject({ codigo: 401 })
    expect(await pedir('GET', '/salud', undefined, null)).toMatchObject({ codigo: 200, cuerpo: { ok: true } })
  })
  it('un pedido de análisis de un host no permitido se rechaza antes de la fila', async () => {
    const { cola, pedir } = await montar()
    expect(await pedir('POST', '/analizar', { voz: { nombre: 'voz.mp3', url: 'https://otro.test/voz.mp3' } })).toMatchObject({ codigo: 400 })
    expect(cola.ocupados()).toBe(0)
  })
  it('los ids de análisis vencidos se sueltan al llegar otro análisis (no quedan sueltos aunque nadie los pida)', async () => {
    let ahora = 1_000_000
    const { cola, analisis, pedir } = await montar(() => ahora)
    const a = (await pedir('POST', '/analizar', PEDIDO_DE_ANALISIS)).cuerpo as { id: string }
    await cola.vaciar()
    expect(analisis.has(a.id)).toBe(true)
    ahora += 5000 // pasa el tiempo de guarda (1 s en esta fila)
    const b = (await pedir('POST', '/analizar', PEDIDO_DE_ANALISIS)).cuerpo as { id: string }
    expect(analisis.has(a.id)).toBe(false)
    expect(analisis.has(b.id)).toBe(true)
  })
})
