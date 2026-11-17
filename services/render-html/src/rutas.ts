/**
 * LAS RUTAS del servicio, separadas del arranque para poder probarlas con un servidor de verdad y una fila falsa (🟡 2 de CC7 sobre #1110:
 * «un análisis no se baja como video» no tenía prueba). `index.ts` solo arma las piezas reales y escucha.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { autorizado, LIMITES, validarPedidoPng, validarPedidoVideo, type PedidoPng, type PedidoVideo } from './logica'
import { estadoPublico, type ColaDeRenders } from './cola'
import { validarPedidoDeAnalisis, type PedidoDeAnalisis } from './analisis'

export type Pedido = { tipo: 'video'; p: PedidoVideo } | { tipo: 'analisis'; p: PedidoDeAnalisis }

export interface PiezasDelServicio {
  cola: ColaDeRenders<Pedido>
  /** los trabajos que son análisis (su resultado es JSON, no un MP4) */
  analisis: Set<string>
  hosts: Set<string>
  /** la llave configurada (RENDER_HTML_KEY); sin llave, nadie pasa */
  llave: string | undefined
  renderPng: (p: PedidoPng) => Promise<{ png: Buffer; ms: number }>
}

export function json(res: ServerResponse, codigo: number, cuerpo: unknown): void {
  const b = Buffer.from(JSON.stringify(cuerpo), 'utf8')
  res.writeHead(codigo, { 'content-type': 'application/json; charset=utf-8', 'content-length': b.length })
  res.end(b)
}

function leerCuerpo(req: IncomingMessage, max: number): Promise<unknown> {
  return new Promise((ok, mal) => {
    const partes: Buffer[] = []
    let total = 0
    req.on('data', (d: Buffer) => {
      total += d.length
      if (total > max) { mal(Object.assign(new Error('cuerpo demasiado grande'), { codigo: 413 })); req.destroy(); return }
      partes.push(d)
    })
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(partes).toString('utf8'))) } catch { mal(Object.assign(new Error('el cuerpo no es JSON'), { codigo: 400 })) } })
    req.on('error', mal)
  })
}

export function crearAtender(d: PiezasDelServicio): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const { cola, analisis } = d
  /** los ids de análisis cuyo trabajo ya venció en la fila se sueltan (observación de CC7: si nadie los pedía, quedaban sueltos) */
  const soltarVencidos = () => { for (const id of analisis) if (!cola.ver(id)) analisis.delete(id) }
  return async function atender(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://local')
  const ruta = url.pathname
  if (req.method === 'GET' && (ruta === '/salud' || ruta === '/health')) return json(res, 200, { ok: true, ocupados: cola.ocupados() })
  const llave = req.headers['x-render-key']
  if (!autorizado(Array.isArray(llave) ? llave[0] : llave, d.llave)) return json(res, 401, { error: 'no autorizado' })

  if (req.method === 'POST' && ruta === '/png') {
    const v = validarPedidoPng(await leerCuerpo(req, LIMITES.html_png_max_bytes + 4096))
    if (!v.ok) return json(res, 400, { error: v.error })
    const r = await d.renderPng(v.valor)
    res.writeHead(200, { 'content-type': 'image/png', 'content-length': r.png.length, 'x-render-ms': String(r.ms) })
    return void res.end(r.png)
  }
  if (req.method === 'POST' && ruta === '/video') {
    const v = validarPedidoVideo(await leerCuerpo(req, LIMITES.html_video_max_bytes + 64 * 1024), d.hosts)
    if (!v.ok) return json(res, 400, { error: v.error })
    const t = cola.agregar({ tipo: 'video', p: v.valor })
    if (!t) return json(res, 429, { error: 'la fila de renders está llena: reintenta en un rato' })
    return json(res, 202, estadoPublico(t))
  }
  if (req.method === 'POST' && ruta === '/analizar') {
    const v = validarPedidoDeAnalisis(await leerCuerpo(req, 64 * 1024), d.hosts)
    if (!v.ok) return json(res, 400, { error: v.error })
    soltarVencidos()
    const t = cola.agregar({ tipo: 'analisis', p: v.valor })
    if (!t) return json(res, 429, { error: 'la fila de renders está llena: reintenta en un rato' })
    analisis.add(t.id)
    return json(res, 202, estadoPublico(t))
  }
  const a = /^\/analisis\/([0-9a-f-]{36})$/.exec(ruta)
  if (req.method === 'GET' && a) {
    const t = analisis.has(a[1]) ? cola.ver(a[1]) : null
    if (!t) { analisis.delete(a[1]); return json(res, 404, { error: 'no existe (o ya venció): pídelo de nuevo' }) }
    return json(res, 200, { ...estadoPublico(t), resultado: t.estado === 'listo' && t.mp4 ? JSON.parse(t.mp4.toString('utf8')) : null })
  }
  const m = /^\/video\/([0-9a-f-]{36})(\/archivo)?$/.exec(ruta)
  if (req.method === 'GET' && m) {
    // un análisis no se baja como video
    const t = analisis.has(m[1]) ? null : cola.ver(m[1])
    if (!t) return json(res, 404, { error: 'no existe (o ya venció): pídelo de nuevo' })
    if (!m[2]) return json(res, 200, estadoPublico(t))
    if (t.estado !== 'listo' || !t.mp4) return json(res, 409, { error: `el trabajo está ${t.estado}` })
    res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': t.mp4.length })
    return void res.end(t.mp4)
  }
  return json(res, 404, { error: 'ruta desconocida' })
  }
}

