/**
 * Cliente del SERVICIO DE RENDER HTML de Railway (S2-5 · CC2 · `services/render-html`).
 *  · sin `RENDER_HTML_URL` + `RENDER_HTML_KEY` no hay servicio (null): quien lo usa sigue con lo de hoy;
 *  · nada lanza: cada llamada devuelve ok o el error en palabras;
 *  · el video es un TRABAJO en fila (iniciar → estado → bajar): un render dura más que una llamada.
 */
export interface ServicioDeRender { url: string; llave: string }
type Fetch = typeof fetch
export type Resultado<T> = { ok: true } & T | { ok: false; error: string; /** 429 / 5xx / red: vale la pena reintentar más tarde */ reintentar: boolean }

/** el servicio, si está configurado entero (dirección + llave); con una sola de las dos, no hay servicio */
export function servicioDeRender(env: { RENDER_HTML_URL?: string; RENDER_HTML_KEY?: string }): ServicioDeRender | null {
  const url = (env.RENDER_HTML_URL ?? '').trim().replace(/\/+$/, '')
  const llave = (env.RENDER_HTML_KEY ?? '').trim()
  if (!url || !llave || !/^https?:\/\//.test(url)) return null
  return { url, llave }
}

async function errorDe(r: Response): Promise<{ ok: false; error: string; reintentar: boolean }> {
  let detalle = ''
  try { const j = (await r.json()) as { error?: unknown }; detalle = typeof j.error === 'string' ? j.error : '' } catch { /* sin cuerpo legible */ }
  return { ok: false, error: `servicio de render ${r.status}${detalle ? `: ${detalle.slice(0, 300)}` : ''}`, reintentar: r.status === 429 || r.status >= 500 }
}
const deRed = (e: unknown) => ({ ok: false as const, error: `servicio de render sin respuesta: ${e instanceof Error ? e.message : String(e)}`.slice(0, 400), reintentar: true })

/** el anuncio fijo: el documento de `htmlDeAnuncio` → PNG del tamaño pedido */
export async function pedirPng(s: ServicioDeRender, p: { html: string; ancho: number; alto: number }, f: Fetch = fetch, timeoutMs = 90_000): Promise<Resultado<{ png: Buffer }>> {
  try {
    const r = await f(`${s.url}/png`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-render-key': s.llave }, body: JSON.stringify(p), signal: AbortSignal.timeout(timeoutMs) })
    if (!r.ok) return errorDe(r)
    const png = Buffer.from(await r.arrayBuffer())
    // la firma del PNG: lo que vuelve tiene que ser una imagen, no una página de error
    if (png.length < 8 || png.readUInt32BE(0) !== 0x89504e47) return { ok: false, error: 'el servicio de render no devolvió un PNG', reintentar: false }
    return { ok: true, png }
  } catch (e) { return deRed(e) }
}

export interface PedidoDeVideoAlServicio {
  html: string
  ancho: number
  alto: number
  segundos: number
  fps?: number
  calidad?: 'draft' | 'looks' | 'delivery'
  archivos: Array<{ nombre: string; url: string }>
}
export type EstadoDeVideo = 'en_fila' | 'rindiendo' | 'listo' | 'fallido'

export async function iniciarVideo(s: ServicioDeRender, p: PedidoDeVideoAlServicio, f: Fetch = fetch): Promise<Resultado<{ id: string }>> {
  try {
    const r = await f(`${s.url}/video`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-render-key': s.llave }, body: JSON.stringify(p), signal: AbortSignal.timeout(60_000) })
    if (r.status !== 202) return errorDe(r)
    const j = (await r.json()) as { id?: unknown }
    return typeof j.id === 'string' && j.id ? { ok: true, id: j.id } : { ok: false, error: 'el servicio de render no devolvió el id del trabajo', reintentar: false }
  } catch (e) { return deRed(e) }
}

export async function estadoDeVideo(s: ServicioDeRender, id: string, f: Fetch = fetch): Promise<Resultado<{ estado: EstadoDeVideo; error: string | null; segundos_de_render: number | null }>> {
  try {
    const r = await f(`${s.url}/video/${encodeURIComponent(id)}`, { headers: { 'x-render-key': s.llave }, signal: AbortSignal.timeout(30_000) })
    // 404 = el trabajo no existe (venció o el servicio se reinició): no se reintenta el mismo id, se pide de nuevo
    if (!r.ok) return errorDe(r)
    const j = (await r.json()) as { estado?: unknown; error?: unknown; segundos_de_render?: unknown }
    const estado = j.estado
    if (estado !== 'en_fila' && estado !== 'rindiendo' && estado !== 'listo' && estado !== 'fallido') return { ok: false, error: 'estado desconocido del servicio de render', reintentar: false }
    return { ok: true, estado, error: typeof j.error === 'string' ? j.error : null, segundos_de_render: typeof j.segundos_de_render === 'number' ? j.segundos_de_render : null }
  } catch (e) { return deRed(e) }
}

export async function bajarVideo(s: ServicioDeRender, id: string, f: Fetch = fetch): Promise<Resultado<{ mp4: Buffer }>> {
  try {
    const r = await f(`${s.url}/video/${encodeURIComponent(id)}/archivo`, { headers: { 'x-render-key': s.llave }, signal: AbortSignal.timeout(120_000) })
    if (!r.ok) return errorDe(r)
    const mp4 = Buffer.from(await r.arrayBuffer())
    // un MP4 trae «ftyp» en los bytes 4–8
    if (mp4.length < 12 || mp4.subarray(4, 8).toString('latin1') !== 'ftyp') return { ok: false, error: 'el servicio de render no devolvió un MP4', reintentar: false }
    return { ok: true, mp4 }
  } catch (e) { return deRed(e) }
}

// ───────────────────────── Sprint 3 · T5 (CC4) · el análisis del sonido: palabras con su tiempo y golpes de la música
export interface PedidoDeAnalisisAlServicio {
  /** el archivo cuya voz se transcribe (el video unido o la locución) */
  voz?: { nombre: string; url: string }
  /** la pista de música cuyos golpes se miden */
  musica?: { nombre: string; url: string }
  /** el idioma de la pieza (dos letras); por omisión español */
  idioma?: string
}
export interface ResultadoDelAnalisis {
  /** tal cual las da el transcriptor: las limpia `leerPalabras` (video/subtitulos.ts) */
  palabras: unknown[] | null
  inicio_de_voz: number | null
  motor: string | null
  golpes: number[] | null
  bpm: number | null
  confianza: 'high' | 'low' | 'uncertain' | null
  avisos: string[]
}

/** encola el análisis (va en la misma fila que los renders) */
export async function iniciarAnalisis(s: ServicioDeRender, p: PedidoDeAnalisisAlServicio, f: Fetch = fetch): Promise<Resultado<{ id: string }>> {
  try {
    const r = await f(`${s.url}/analizar`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-render-key': s.llave }, body: JSON.stringify(p), signal: AbortSignal.timeout(60_000) })
    if (r.status !== 202) return errorDe(r)
    const j = (await r.json()) as { id?: unknown }
    return typeof j.id === 'string' && j.id ? { ok: true, id: j.id } : { ok: false, error: 'el servicio de render no devolvió el id del análisis', reintentar: false }
  } catch (e) { return deRed(e) }
}

const lista = <T>(v: unknown, es: (x: unknown) => x is T): T[] | null => (Array.isArray(v) ? v.filter(es) : null)
const esNumero = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

/** el estado del análisis; cuando está listo, su resultado (lo que no tiene la forma esperada queda en null, nunca se inventa) */
export async function estadoDeAnalisis(s: ServicioDeRender, id: string, f: Fetch = fetch): Promise<Resultado<{ estado: EstadoDeVideo; error: string | null; resultado: ResultadoDelAnalisis | null }>> {
  try {
    const r = await f(`${s.url}/analisis/${encodeURIComponent(id)}`, { headers: { 'x-render-key': s.llave }, signal: AbortSignal.timeout(30_000) })
    if (!r.ok) return errorDe(r)
    const j = (await r.json()) as { estado?: unknown; error?: unknown; resultado?: unknown }
    const estado = j.estado
    if (estado !== 'en_fila' && estado !== 'rindiendo' && estado !== 'listo' && estado !== 'fallido') return { ok: false, error: 'estado desconocido del servicio de render', reintentar: false }
    const o = (estado === 'listo' && j.resultado && typeof j.resultado === 'object' ? j.resultado : null) as Record<string, unknown> | null
    if (estado === 'listo' && !o) return { ok: false, error: 'el análisis terminó sin resultado', reintentar: false }
    const conf = o?.confianza
    const resultado: ResultadoDelAnalisis | null = o ? {
      palabras: Array.isArray(o.palabras) ? o.palabras : null,
      inicio_de_voz: esNumero(o.inicio_de_voz) ? o.inicio_de_voz : null,
      motor: typeof o.motor === 'string' ? o.motor : null,
      golpes: lista(o.golpes, esNumero),
      bpm: esNumero(o.bpm) ? o.bpm : null,
      confianza: conf === 'high' || conf === 'low' || conf === 'uncertain' ? conf : null,
      avisos: lista(o.avisos, (x): x is string => typeof x === 'string') ?? [],
    } : null
    return { ok: true, estado, error: typeof j.error === 'string' ? j.error : null, resultado }
  } catch (e) { return deRed(e) }
}
