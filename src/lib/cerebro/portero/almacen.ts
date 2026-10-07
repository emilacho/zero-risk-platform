/**
 * BAJAR UNA FOTO · solo de NUESTRO almacén (lista cerrada de UN anfitrión y UNA carpeta: el bucket público `client-social-images` de nuestra base).
 *
 * Nunca de una dirección ajena (Instagram corta al corredor y una dirección de afuera es una puerta abierta): una dirección que no sea del almacén no sale a la red.
 * Solo lectura (GET), sin seguir saltos (`redirect: 'error'`), con tope de tamaño y de tiempo, y solo si lo que baja es una imagen que el modelo acepta.
 */
export const PREFIJO_DEL_ALMACEN = '/storage/v1/object/public/client-social-images/'
export const MAXIMO_DE_BYTES_DE_FOTO = 5_000_000
export const TIEMPO_MAXIMO_AL_BAJAR_MS = 10_000
const TIPOS_DE_IMAGEN = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export type ResultadoDeBajada = { ok: true; base64: string; tipo: string; bytes: number } | { ok: false; motivo: string; detalle?: string }

/** ¿esta dirección es EXACTAMENTE una foto de nuestro almacén? (mismo anfitrión que la base, https, sin usuario, sin puerto, sin saltos de carpeta) */
export function esUrlDelAlmacen(url: string, urlDeLaBase: string): boolean {
  let u: URL, b: URL
  try { u = new URL(url); b = new URL(urlDeLaBase) } catch { return false }
  if (u.protocol !== 'https:' || b.protocol !== 'https:') return false
  if (u.username || u.password || u.port || u.hostname !== b.hostname) return false
  if (!u.pathname.startsWith(PREFIJO_DEL_ALMACEN) || u.pathname.length <= PREFIJO_DEL_ALMACEN.length) return false
  const resto = u.pathname.slice(PREFIJO_DEL_ALMACEN.length)
  let decodificado: string
  try { decodificado = decodeURIComponent(resto) } catch { return false }
  return !decodificado.split('/').some((parte) => parte === '..' || parte === '.' || parte === '') && !resto.includes('\\')
}

/**
 * Una foto de PRUEBA que llega en base64 (modo prueba, sin subir nada al almacén ni salir a la red): mismos tipos y mismo tope de tamaño que una foto bajada,
 * y el tipo declarado tiene que coincidir con la firma de los bytes. Se mide el LARGO del texto antes de decodificar.
 */
const FIRMAS_DE_IMAGEN: Record<string, (b: Buffer) => boolean> = {
  'image/jpeg': (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  'image/gif': (b) => b.length >= 6 && /^GIF8[79]a$/.test(b.subarray(0, 6).toString('latin1')),
}
export function leerFotoEnBase64(base64: unknown, tipoDeclarado: unknown, maximoBytes: number = MAXIMO_DE_BYTES_DE_FOTO): ResultadoDeBajada {
  const tipo = typeof tipoDeclarado === 'string' ? tipoDeclarado.trim().toLowerCase() : ''
  if (!TIPOS_DE_IMAGEN.has(tipo)) return { ok: false, motivo: 'foto_no_es_imagen', detalle: tipo || 'sin tipo' }
  if (typeof base64 !== 'string' || base64.length === 0) return { ok: false, motivo: 'foto_vacia' }
  if (base64.length > Math.ceil((maximoBytes * 4) / 3) + 8) return { ok: false, motivo: 'foto_demasiado_grande', detalle: `${base64.length} caracteres de base64` }
  if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) return { ok: false, motivo: 'foto_base64_invalido' }
  const bytes = Buffer.from(base64, 'base64')
  if (bytes.length === 0) return { ok: false, motivo: 'foto_vacia' }
  if (bytes.length > maximoBytes) return { ok: false, motivo: 'foto_demasiado_grande', detalle: `${bytes.length} bytes` }
  if (!FIRMAS_DE_IMAGEN[tipo](bytes)) return { ok: false, motivo: 'foto_no_es_imagen', detalle: `se declaró ${tipo} pero los bytes no lo son` }
  return { ok: true, base64, tipo, bytes: bytes.length }
}

export function crearBajador(args: { urlDeLaBase: string; fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>; maximoBytes?: number; timeoutMs?: number }) {
  const traer = args.fetchImpl ?? ((u: string, i?: RequestInit) => fetch(u, i))
  const maximo = args.maximoBytes ?? MAXIMO_DE_BYTES_DE_FOTO
  return async (url: string): Promise<ResultadoDeBajada> => {
    if (!esUrlDelAlmacen(url, args.urlDeLaBase)) return { ok: false, motivo: 'foto_fuera_del_almacen' }
    const control = new AbortController()
    const reloj = setTimeout(() => control.abort(), args.timeoutMs ?? TIEMPO_MAXIMO_AL_BAJAR_MS)
    try {
      const r = await traer(url, { redirect: 'error', signal: control.signal })
      if (!r.ok) return { ok: false, motivo: 'no_se_pudo_bajar', detalle: `el almacén respondió ${r.status}` }
      const tipo = (r.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
      if (!TIPOS_DE_IMAGEN.has(tipo)) return { ok: false, motivo: 'foto_no_es_imagen', detalle: tipo || 'sin tipo' }
      const declarado = Number(r.headers.get('content-length') ?? '')
      if (Number.isFinite(declarado) && declarado > maximo) return { ok: false, motivo: 'foto_demasiado_grande', detalle: `${declarado} bytes` }
      const bytes = Buffer.from(await r.arrayBuffer())
      if (bytes.length > maximo) return { ok: false, motivo: 'foto_demasiado_grande', detalle: `${bytes.length} bytes` }
      if (bytes.length === 0) return { ok: false, motivo: 'foto_vacia' }
      return { ok: true, base64: bytes.toString('base64'), tipo, bytes: bytes.length }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return { ok: false, motivo: 'tiempo_al_bajar' }
      return { ok: false, motivo: 'no_se_pudo_bajar', detalle: e instanceof Error ? e.message.slice(0, 200) : String(e) }
    } finally {
      clearTimeout(reloj)
    }
  }
}
