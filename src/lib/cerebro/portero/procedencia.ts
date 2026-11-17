/**
 * PROCEDENCIA, LUGAR Y FECHA DE UNA IMAGEN · y si es una CAPTURA DE LA WEB (17-nov · ENCARGO 1 de Cerebro, firma de Emilio; ADENDA 1: la unidad es la oferta).
 * Regla general, cualquier cliente. Todo PURO (sin red ni base): lo usan las lecturas, el escritor de Mapas y el completado de lo ya guardado.
 *
 *  · procedencia: de dónde se copió (sitio web, Mapas, Instagram, …). La columna manda; vacía, se deduce de lo que la fila dice (enlace, tipo, cuenta).
 *  · lugar: la OFERTA (y la sede cuando es física) con su fuente. Solo de un dato: la ficha de Mapas de una sede, el dueño o la publicación. Sin dato → «no consta».
 *  · fecha: la de la publicación, la de los metadatos del archivo o la del dueño, con su fuente. Sin dato → «no consta». Nunca la fecha en que la copiamos.
 *  · captura de la web: `clase = 'captura_web'` o `tipo = 'web_captura'`. Se guarda entera, pero NO es foto propia: no sale en la lista de fotos.
 */
import type { Fila } from '../consulta'

export const PROCEDENCIAS = ['sitio_web', 'mapas', 'instagram', 'facebook', 'tiktok', 'youtube', 'x', 'linkedin', 'dueno', 'otro'] as const
export type Procedencia = (typeof PROCEDENCIAS)[number]
export const FUENTES_DE_LUGAR = ['mapas', 'dueno', 'publicacion'] as const
export const FUENTES_DE_FECHA = ['publicacion', 'mapas', 'metadatos', 'dueno'] as const
export const NO_CONSTA = 'no consta' as const

const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** ¿es una captura de pantalla de una página o red? (la clase guardada, o el tipo con que la guardó el raspado del sitio) */
export function esCapturaDeLaWeb(f: Fila): boolean {
  return txt(f.clase) === 'captura_web' || txt(f.tipo)?.toLowerCase() === 'web_captura'
}

/** de dónde se copió: la columna si la hay; si no, lo que dice la fila (el enlace de la publicación primero, después el tipo y la cuenta) */
export function procedenciaDeLaFila(f: Fila): Procedencia {
  const guardada = txt(f.procedencia)
  if (guardada && (PROCEDENCIAS as readonly string[]).includes(guardada)) return guardada as Procedencia
  const enlace = (txt(f.post_url) ?? '').toLowerCase()
  const tipo = (txt(f.tipo) ?? '').toLowerCase()
  const cuenta = (txt(f.handle) ?? '').toLowerCase()
  if (/(^|\.|\/\/)instagram\.com/.test(enlace) || cuenta === 'instagram.com') return 'instagram'
  if (/(^|\.|\/\/)(facebook|fb)\.com/.test(enlace)) return 'facebook'
  if (/(^|\.|\/\/)tiktok\.com/.test(enlace)) return 'tiktok'
  if (/(^|\.|\/\/)(youtube\.com|youtu\.be)/.test(enlace)) return 'youtube'
  if (/(^|\.|\/\/)(x|twitter)\.com/.test(enlace)) return 'x'
  if (/(^|\.|\/\/)linkedin\.com/.test(enlace)) return 'linkedin'
  if (/mapa|maps/.test(tipo) || cuenta.startsWith('mapas-') || /google\.[a-z.]+\/maps/.test(enlace)) return 'mapas'
  if (/dueno|archivo|subido/.test(tipo)) return 'dueno'
  if (/^web_|sitio|pagina/.test(tipo) || /^https?:\/\//.test(enlace)) return 'sitio_web'
  return 'otro'
}

export interface Lugar { oferta: string; sede_id: string | null; fuente: (typeof FUENTES_DE_LUGAR)[number] }
/** el lugar de la imagen solo si hay un dato con su fuente; si no, «no consta» (nunca se adivina por lo que se ve) */
export function lugarDeLaFila(f: Fila): Lugar | typeof NO_CONSTA {
  const oferta = txt(f.oferta)
  const fuente = txt(f.lugar_fuente)
  if (!oferta || !fuente || !(FUENTES_DE_LUGAR as readonly string[]).includes(fuente)) return NO_CONSTA
  return { oferta, sede_id: txt(f.sede_id), fuente: fuente as Lugar['fuente'] }
}

export interface FechaDeLaImagen { valor: string; fuente: (typeof FUENTES_DE_FECHA)[number] }
/** la fecha guardada con su fuente; si no, la de la publicación; si no, «no consta». La fecha en que la copiamos (`created_at`) NO es la fecha de la imagen */
export function fechaDeLaFila(f: Fila): FechaDeLaImagen | typeof NO_CONSTA {
  const guardada = txt(f.fecha_origen)
  const fuente = txt(f.fecha_fuente)
  if (guardada && fuente && (FUENTES_DE_FECHA as readonly string[]).includes(fuente) && Number.isFinite(Date.parse(guardada))) return { valor: guardada, fuente: fuente as FechaDeLaImagen['fuente'] }
  const publicada = txt(f.posted_at)
  if (publicada && Number.isFinite(Date.parse(publicada))) return { valor: publicada, fuente: 'publicacion' }
  return NO_CONSTA
}

const NOMBRE_DE_PROCEDENCIA: Record<Procedencia, string> = { sitio_web: 'el sitio web', mapas: 'Google Maps', instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', x: 'X', linkedin: 'LinkedIn', dueno: 'el dueño', otro: 'otra fuente' }
const NOMBRE_DE_FUENTE_DE_FECHA: Record<FechaDeLaImagen['fuente'], string> = { publicacion: 'fecha de la publicación', mapas: 'fecha de Google Maps', metadatos: 'metadatos del archivo (Google los reescribe: puede ser la fecha de subida)', dueno: 'lo dijo el dueño' }

/** las tres cosas en una frase corta, para la línea que lee el portero y la consulta */
export function frasePLF(f: Fila): string {
  const p = procedenciaDeLaFila(f)
  const l = lugarDeLaFila(f)
  const d = fechaDeLaFila(f)
  const lugar = l === NO_CONSTA ? `lugar: ${NO_CONSTA}` : `oferta «${l.oferta}» (según ${l.fuente === 'mapas' ? 'su ficha de Google Maps' : l.fuente === 'dueno' ? 'el dueño' : 'la publicación'})`
  const fecha = d === NO_CONSTA ? `fecha: ${NO_CONSTA}` : `fecha ${d.valor.slice(0, 10)} (${NOMBRE_DE_FUENTE_DE_FECHA[d.fuente]})`
  return `procedencia: ${p === 'mapas' && l !== NO_CONSTA ? `ficha de Google Maps de «${l.oferta}»` : NOMBRE_DE_PROCEDENCIA[p]} · ${lugar} · ${fecha}`
}

/** los tres datos en forma de objeto, para las lecturas que entregan campos (la ruta de fotos y la mesa) */
export function datosPLF(f: Fila): { procedencia: Procedencia; lugar: Lugar | typeof NO_CONSTA; fecha: FechaDeLaImagen | typeof NO_CONSTA } {
  return { procedencia: procedenciaDeLaFila(f), lugar: lugarDeLaFila(f), fecha: fechaDeLaFila(f) }
}

// ── la sede de una foto de Mapas: la ficha de Mapas cuya dirección cita la MISMA ficha (place id) en los datos de una sede ─────────────────────────
// el identificador de una ficha de Mapas es ASCII: basta pasarlo a minúsculas y cambiar lo que no sea letra o número por guion (igual que el nombre del archivo)
const slugDeFicha = (t: string): string => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
/** el identificador de la ficha de Mapas dentro de una dirección (`query_place_id=…`, `place_id:…` o `!1s…`), o null */
export function fichaDeMapasEnDireccion(url: unknown): string | null {
  const t = txt(url)
  if (!t) return null
  const m = t.match(/[?&]query_place_id=([^&#]+)/i) ?? t.match(/place_id[:=]([^&#/]+)/i)
  return m ? decodeURIComponent(m[1]) : null
}
export interface DatoDeSede { sede_id: unknown; fuente: unknown; fuente_ref: unknown; retirada_en?: unknown }
export interface SedeDelCliente { id: unknown; clave: unknown }
/**
 * La sede cuya ficha de Mapas es `ficha` (place id, o su forma corta con que se nombra el archivo): la dice un dato de esa sede tomado de Mapas y NO retirado.
 * Si dos sedes distintas citan la misma ficha, o ninguna, no se adivina: null.
 */
export function sedeDeLaFichaDeMapas(ficha: string | null, datos: DatoDeSede[], sedes: SedeDelCliente[]): { sede_id: string; oferta: string } | null {
  if (!ficha) return null
  const buscada = slugDeFicha(ficha)
  const ids = new Set<string>()
  for (const d of datos) {
    if (txt(d.fuente) !== 'mapas' || txt(d.retirada_en) || !txt(d.sede_id)) continue
    const f = fichaDeMapasEnDireccion(d.fuente_ref)
    if (f && slugDeFicha(f) === buscada) ids.add(String(d.sede_id))
  }
  if (ids.size !== 1) return null
  const id = [...ids][0]
  const sede = sedes.find((s) => String(s.id) === id)
  const clave = txt(sede?.clave)
  return clave ? { sede_id: id, oferta: clave } : null
}
/** la forma corta de la ficha con que el escritor de Mapas nombra cada foto: `maps-<ficha>-<huella>` → `<ficha>` */
export function fichaDelNombreDeLaFoto(postId: unknown): string | null {
  const m = String(txt(postId) ?? '').match(/^maps-(.+)-[0-9a-f]{12}$/)
  return m ? m[1] : null
}

// ── la fecha de los metadatos del archivo (EXIF «DateTimeOriginal», si no «DateTimeDigitized») · sin red: solo los bytes que ya están en nuestro almacén ──
/** «AAAA:MM:DD hh:mm:ss» → ISO en UTC (el EXIF no trae zona: se toma tal cual) · null si no es una fecha posible */
export function fechaExifComoIso(t: string): string | null {
  const m = t.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/)
  if (!m) return null
  const [a, mes, d, h, mi, s] = m.slice(1).map(Number)
  if (a < 1990 || mes < 1 || mes > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null
  const f = new Date(Date.UTC(a, mes - 1, d, h, mi, s))
  return f.getUTCDate() === d ? f.toISOString() : null
}
export function fechaDeLosMetadatos(b: Uint8Array): string | null {
  const buf = Buffer.from(b.buffer, b.byteOffset, b.byteLength)
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null // solo JPEG trae EXIF así
  let i = 2
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) return null
    const marca = buf[i + 1]
    const largo = buf.readUInt16BE(i + 2)
    if (marca === 0xda || marca === 0xd9) return null // empieza la imagen: ya no hay metadatos
    if (marca === 0xe1 && buf.subarray(i + 4, i + 10).toString('latin1') === 'Exif\0\0') return leerFechaExif(buf.subarray(i + 10, i + 2 + largo))
    i += 2 + largo
  }
  return null
}
function leerFechaExif(t: Buffer): string | null {
  if (t.length < 8) return null
  const le = t.subarray(0, 2).toString('latin1') === 'II'
  const u16 = (o: number) => (o + 2 <= t.length ? (le ? t.readUInt16LE(o) : t.readUInt16BE(o)) : -1)
  const u32 = (o: number) => (o + 4 <= t.length ? (le ? t.readUInt32LE(o) : t.readUInt32BE(o)) : -1)
  const fechas: Record<number, string> = {}
  const recorrer = (off: number, profundidad: number): void => {
    const n = u16(off)
    if (n < 0 || n > 500 || profundidad > 1) return
    for (let k = 0; k < n; k++) {
      const e = off + 2 + k * 12
      const etiqueta = u16(e), tipo = u16(e + 2), cuenta = u32(e + 4)
      if (etiqueta < 0 || cuenta < 0) return
      if (etiqueta === 0x8769) { const sub = u32(e + 8); if (sub > 0 && sub < t.length) recorrer(sub, profundidad + 1); continue }
      if ((etiqueta === 0x9003 || etiqueta === 0x9004) && tipo === 2 && cuenta >= 19) {
        const desde = u32(e + 8)
        if (desde > 0 && desde + 19 <= t.length) fechas[etiqueta] = t.subarray(desde, desde + 19).toString('latin1')
      }
    }
  }
  recorrer(u32(4), 0)
  for (const etiqueta of [0x9003, 0x9004]) { const iso = fechas[etiqueta] ? fechaExifComoIso(fechas[etiqueta]) : null; if (iso) return iso }
  return null
}
