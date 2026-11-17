/**
 * SERVICIO DE RENDER HTML · Railway (Sprint 2 · S2-5 · CC2 · GO Lenovo 17-nov 02:47; crear el servicio aprobado, en modo que duerme).
 *
 *  GET  /salud                    sin llave · para el chequeo de Railway
 *  POST /png                      {html, ancho, alto} → image/png (el anuncio fijo de la plantilla #1068)
 *  POST /video                    {html, ancho, alto, segundos, fps?, calidad?, archivos:[{nombre,url}]} → 202 {id} (trabajo en fila)
 *  GET  /video/:id                → {id, estado: en_fila|rindiendo|listo|fallido, error, segundos_de_render, bytes}
 *  GET  /video/:id/archivo        → video/mp4 (cuando está listo)
 * Todo menos /salud exige la cabecera `x-render-key` igual a RENDER_HTML_KEY (sin llave configurada, nadie pasa).
 * Sin base de datos ni almacenamiento: la plataforma guarda el resultado donde corresponde.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { autorizado, hostsPermitidos, LIMITES, validarPedidoPng, validarPedidoVideo, type PedidoVideo } from './logica'
import { ColaDeRenders, estadoPublico } from './cola'
import { cerrarNavegador, renderPng } from './navegador'
import { renderVideo } from './video'

const PUERTO = Number(process.env.PORT ?? 3000)
const HOSTS = hostsPermitidos(process.env.RENDER_HTML_HOSTS)
const cola = new ColaDeRenders<PedidoVideo>(renderVideo)

function json(res: ServerResponse, codigo: number, cuerpo: unknown): void {
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

async function atender(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://local')
  const ruta = url.pathname
  if (req.method === 'GET' && (ruta === '/salud' || ruta === '/health')) return json(res, 200, { ok: true, ocupados: cola.ocupados() })
  const llave = req.headers['x-render-key']
  if (!autorizado(Array.isArray(llave) ? llave[0] : llave, process.env.RENDER_HTML_KEY)) return json(res, 401, { error: 'no autorizado' })

  if (req.method === 'POST' && ruta === '/png') {
    const v = validarPedidoPng(await leerCuerpo(req, LIMITES.html_png_max_bytes + 4096))
    if (!v.ok) return json(res, 400, { error: v.error })
    const r = await renderPng(v.valor)
    res.writeHead(200, { 'content-type': 'image/png', 'content-length': r.png.length, 'x-render-ms': String(r.ms) })
    return void res.end(r.png)
  }
  if (req.method === 'POST' && ruta === '/video') {
    const v = validarPedidoVideo(await leerCuerpo(req, LIMITES.html_video_max_bytes + 64 * 1024), HOSTS)
    if (!v.ok) return json(res, 400, { error: v.error })
    const t = cola.agregar(v.valor)
    if (!t) return json(res, 429, { error: 'la fila de renders está llena: reintenta en un rato' })
    return json(res, 202, estadoPublico(t))
  }
  const m = /^\/video\/([0-9a-f-]{36})(\/archivo)?$/.exec(ruta)
  if (req.method === 'GET' && m) {
    const t = cola.ver(m[1])
    if (!t) return json(res, 404, { error: 'no existe (o ya venció): pídelo de nuevo' })
    if (!m[2]) return json(res, 200, estadoPublico(t))
    if (t.estado !== 'listo' || !t.mp4) return json(res, 409, { error: `el trabajo está ${t.estado}` })
    res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': t.mp4.length })
    return void res.end(t.mp4)
  }
  return json(res, 404, { error: 'ruta desconocida' })
}

const servidor = createServer((req, res) => {
  atender(req, res).catch((e: unknown) => {
    const codigo = (e as { codigo?: number }).codigo ?? 500
    if (!res.headersSent) json(res, codigo, { error: (e instanceof Error ? e.message : String(e)).slice(0, 500) })
    else res.destroy()
  })
})
servidor.requestTimeout = 5 * 60 * 1000
servidor.listen(PUERTO, () => console.log(`[render-html] escuchando en ${PUERTO} · hosts permitidos: ${HOSTS.size}`))

for (const s of ['SIGTERM', 'SIGINT'] as const) process.on(s, () => { void cerrarNavegador().finally(() => process.exit(0)) })
