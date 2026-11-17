/**
 * SERVICIO DE RENDER HTML · reglas puras (Sprint 2 · S2-5 · CC2 · GO Lenovo 17-nov 02:47).
 *
 * El servicio dibuja la plantilla de marca (#1068) con un navegador sin pantalla:
 *  · PNG: el anuncio fijo (la misma página que `htmlDeAnuncio`);
 *  · MP4: la composición sobre el video (hyperframes, versión fija, telemetría apagada).
 * Aquí solo hay reglas sin red ni navegador (se prueban en el CI de la raíz):
 *  · qué pedidos se aceptan y con qué topes;
 *  · de qué direcciones puede bajar archivos (solo https a los dominios de la lista: no se le puede pedir que salga a cualquier lado);
 *  · la página queda cerrada a internet (CSP que el servicio impone, diga lo que diga el documento);
 *  · el entorno de hyperframes: sin telemetría, sin buscar versiones, sin instalar habilidades.
 */
import { timingSafeEqual } from 'node:crypto'

export const LIMITES = {
  lado_min: 64,
  lado_max: 4096,
  /** el anuncio fijo lleva la foto y las fuentes dentro del documento */
  html_png_max_bytes: 25 * 1024 * 1024,
  /** la composición de video NO lleva los clips dentro: van como archivos aparte */
  html_video_max_bytes: 8 * 1024 * 1024,
  archivos_max: 12,
  archivo_max_bytes: 250 * 1024 * 1024,
  segundos_max: 120,
  fps_permitidos: [24, 25, 30] as readonly number[],
  /** trabajos en fila (además del que corre): el resto se rechaza con 429, no se acumula */
  fila_max: 3,
  /** lo terminado se guarda este tiempo para que la plataforma lo baje; después se borra */
  resultado_ttl_ms: 30 * 60 * 1000,
  /** un render que pasa de esto se corta (el servicio no se queda pegado) */
  render_max_ms: 12 * 60 * 1000,
} as const

/** la página del anuncio fijo no pide NADA a la red: foto, logo y fuentes van dentro (data:) */
export const CSP_PNG = "default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'"
/**
 * la composición de video solo puede leer lo de su propia carpeta ('self' = el servidor local de hyperframes, que sirve los clips bajados).
 * hyperframes inyecta su motor como script en línea: por eso `script-src 'unsafe-inline'`; el texto del autor llega escapado y nunca es script.
 */
export const CSP_VIDEO = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; font-src data:; media-src 'self'; connect-src 'self'"

/** pone la CSP del servicio como PRIMER elemento del <head> (si el documento trae otra, el navegador aplica las dos: gana la más cerrada) */
export function conCsp(html: string, csp: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`
  // <head> exacto (con o sin atributos): un <header> NO es el <head> (ahí el navegador ignora la CSP · 🟡 de CC6)
  if (/<head(\s[^>]*)?>/i.test(html)) return html.replace(/<head(\s[^>]*)?>/i, (h) => `${h}${meta}`)
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (h) => `${h}<head>${meta}</head>`)
  return `<!doctype html><html><head>${meta}</head><body>${html}</body></html>`
}

const lado = (v: unknown): number | null => (Number.isInteger(v) && (v as number) >= LIMITES.lado_min && (v as number) <= LIMITES.lado_max ? (v as number) : null)
const bytes = (s: string): number => Buffer.byteLength(s, 'utf8')

export type Validado<T> = { ok: true; valor: T } | { ok: false; error: string }

export interface PedidoPng { html: string; ancho: number; alto: number }
export function validarPedidoPng(b: unknown): Validado<PedidoPng> {
  const o = (b ?? {}) as Record<string, unknown>
  if (typeof o.html !== 'string' || !o.html.trim()) return { ok: false, error: 'falta html' }
  if (bytes(o.html) > LIMITES.html_png_max_bytes) return { ok: false, error: `html de más de ${LIMITES.html_png_max_bytes} bytes` }
  const ancho = lado(o.ancho), alto = lado(o.alto)
  if (!ancho || !alto) return { ok: false, error: `ancho y alto deben ser enteros entre ${LIMITES.lado_min} y ${LIMITES.lado_max}` }
  return { ok: true, valor: { html: o.html, ancho, alto } }
}

/** el nombre con que el archivo queda en la carpeta del render (el documento lo cita así): sin rutas, sin subir de carpeta */
export const NOMBRE_DE_ARCHIVO = /^[a-z0-9][a-z0-9_-]{0,79}\.(mp4|mov|webm|png|jpg|jpeg|webp|mp3|m4a|wav|aac)$/i

/** hosts a los que el servicio puede ir a buscar archivos (lista separada por comas; sin lista, ninguno) */
export function hostsPermitidos(lista: string | undefined): Set<string> {
  return new Set(String(lista ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean))
}
/** solo https, sin usuario ni clave en la dirección, sin puerto raro, y a un host de la lista (exacto) */
export function urlPermitida(u: string, hosts: Set<string>): boolean {
  let url: URL
  try { url = new URL(u) } catch { return false }
  if (url.protocol !== 'https:' || url.username || url.password) return false
  if (url.port && url.port !== '443') return false
  return hosts.has(url.hostname.toLowerCase())
}

export interface ArchivoDelRender { nombre: string; url: string }
export interface PedidoVideo { html: string; ancho: number; alto: number; fps: number; segundos: number; archivos: ArchivoDelRender[]; calidad: 'draft' | 'looks' | 'delivery' }
export function validarPedidoVideo(b: unknown, hosts: Set<string>): Validado<PedidoVideo> {
  const o = (b ?? {}) as Record<string, unknown>
  if (typeof o.html !== 'string' || !o.html.trim()) return { ok: false, error: 'falta html' }
  if (bytes(o.html) > LIMITES.html_video_max_bytes) return { ok: false, error: `html de más de ${LIMITES.html_video_max_bytes} bytes (los clips van como archivos, no dentro del documento)` }
  const ancho = lado(o.ancho), alto = lado(o.alto)
  if (!ancho || !alto) return { ok: false, error: `ancho y alto deben ser enteros entre ${LIMITES.lado_min} y ${LIMITES.lado_max}` }
  const fps = o.fps === undefined ? 30 : Number(o.fps)
  if (!LIMITES.fps_permitidos.includes(fps)) return { ok: false, error: `fps debe ser uno de ${LIMITES.fps_permitidos.join(', ')}` }
  const segundos = Number(o.segundos)
  if (!Number.isFinite(segundos) || segundos <= 0 || segundos > LIMITES.segundos_max) return { ok: false, error: `segundos debe estar entre 0 y ${LIMITES.segundos_max}` }
  const calidad = o.calidad === undefined ? 'delivery' : o.calidad
  if (calidad !== 'draft' && calidad !== 'looks' && calidad !== 'delivery') return { ok: false, error: 'calidad debe ser draft, looks o delivery' }
  if (!Array.isArray(o.archivos)) return { ok: false, error: 'archivos debe ser una lista' }
  if (o.archivos.length > LIMITES.archivos_max) return { ok: false, error: `máximo ${LIMITES.archivos_max} archivos` }
  const archivos: ArchivoDelRender[] = []
  const vistos = new Set<string>()
  for (const a of o.archivos as Array<Record<string, unknown>>) {
    const nombre = typeof a?.nombre === 'string' ? a.nombre : ''
    const url = typeof a?.url === 'string' ? a.url : ''
    // la lista de extensiones ya deja fuera index.html (ningún .html entra): el documento del render no se puede pisar
    if (!NOMBRE_DE_ARCHIVO.test(nombre)) return { ok: false, error: `nombre de archivo no válido: «${nombre.slice(0, 90)}»` }
    if (vistos.has(nombre.toLowerCase())) return { ok: false, error: `archivo repetido: ${nombre}` }
    if (!urlPermitida(url, hosts)) return { ok: false, error: `dirección no permitida para ${nombre} (solo https a los dominios de la lista)` }
    vistos.add(nombre.toLowerCase())
    archivos.push({ nombre, url })
  }
  return { ok: true, valor: { html: o.html, ancho, alto, fps, segundos, archivos, calidad } }
}

/** la llave interna, comparada en tiempo constante. Sin llave configurada, NADIE pasa (el servicio no queda abierto por olvido) */
export function autorizado(recibida: string | undefined | null, esperada: string | undefined): boolean {
  if (!esperada || !recibida) return false
  const a = Buffer.from(recibida, 'utf8'), b = Buffer.from(esperada, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

/** el entorno de hyperframes: telemetría apagada (las dos llaves que lee), sin buscar versiones nuevas, sin instalar habilidades */
export function entornoDeHyperframes(base: NodeJS.ProcessEnv, rutas: { navegador?: string; ffmpeg?: string; ffprobe?: string; config: string }): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base }
  // la llave interna del servicio no viaja al proceso hijo
  delete env.RENDER_HTML_KEY
  Object.assign(env, {
    HYPERFRAMES_NO_TELEMETRY: '1',
    DO_NOT_TRACK: '1',
    HYPERFRAMES_NO_UPDATE_CHECK: '1',
    HYPERFRAMES_SKIP_SKILLS: '1',
    HYPERFRAMES_CHROME_SANDBOX: '0',
    HYPERFRAMES_CONFIG_DIR: rutas.config,
    CI: '1',
  })
  if (rutas.navegador) env.HYPERFRAMES_BROWSER_PATH = rutas.navegador
  if (rutas.ffmpeg) env.HYPERFRAMES_FFMPEG_PATH = rutas.ffmpeg
  if (rutas.ffprobe) env.HYPERFRAMES_FFPROBE_PATH = rutas.ffprobe
  return env
}

/** los argumentos del render: falla ante errores del documento (--strict), sin GPU, sin progreso por pantalla */
export function argumentosDelRender(p: Pick<PedidoVideo, 'fps' | 'calidad'>, salida: string, workers: number): string[] {
  return ['render', '.', '-o', salida, '--fps', String(p.fps), '--quality', p.calidad, '--workers', String(Math.max(1, Math.floor(workers) || 1)), '--strict', '--no-browser-gpu', '--quiet', '--no-wait']
}
