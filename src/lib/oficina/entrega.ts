/**
 * SALA 4 · ENTREGA «lista para publicar» (forma mínima para un post; se amplía con las salas 2 y 3). Diseño: docs/DISENO-2026-10-09-oficina-salas-2-3-4.md §4.
 * Función de CÓDIGO: sin agentes, sin modelo, SIN brazo de publicación (la publicación es a mano). Puro: recibe bytes y datos, devuelve nombres, texto, manifiesto, fichas y vencimiento.
 */
import crypto from 'node:crypto'
import type { Ficha } from './tipos'
import { esFechaReal, esHoraReal } from './texto'

const ascii = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/** `{aaaa-mm-dd}_{hhmm}_{red}_{formato}_{brief}_{nn}-de-{NN}.{ext}` — ASCII, sin espacios, ordenable. Sin fecha: `sin-fecha_sin-hora`. */
export function nombreDeArchivo(a: { fecha?: string | null; hora?: string | null; red: string; formato: string; brief_id: string; n: number; de: number; ext: string }): string {
  const fecha = a.fecha && /^\d{4}-\d{2}-\d{2}$/.test(a.fecha) ? a.fecha : 'sin-fecha'
  const hora = a.fecha && a.hora && /^\d{2}:\d{2}/.test(a.hora) ? a.hora.slice(0, 5).replace(':', '') : 'sin-hora'
  const ancho = Math.max(2, String(a.de).length)
  const nn = String(a.n).padStart(ancho, '0'), NN = String(a.de).padStart(ancho, '0')
  return `${fecha}_${hora}_${ascii(a.red)}_${ascii(a.formato)}_${a.brief_id.replace(/[^A-Za-z0-9_-]/g, '-')}_${nn}-de-${NN}.${ascii(a.ext)}`
}

/** el texto EXACTO para pegar: pie de foto, línea en blanco y los hashtags (con # una sola vez) */
export function textoParaCopiar(p: { pie_de_foto: string; hashtags: string[] }): string {
  const tags = p.hashtags.map((h) => h.trim()).filter(Boolean).map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')
  return tags ? `${p.pie_de_foto.trim()}\n\n${tags}` : p.pie_de_foto.trim()
}

export interface Medidas { ancho: number; alto: number; tipo: 'png' | 'jpeg' }
/** medidas leídas del ENCABEZADO del archivo (PNG: IHDR; JPEG: marcador SOF); null si está corrupto */
export function leerMedidas(b: Buffer): Medidas | null {
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a && b.toString('ascii', 12, 16) === 'IHDR') {
    return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20), tipo: 'png' }
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue }
      const m = b[i + 1]
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { alto: b.readUInt16BE(i + 5), ancho: b.readUInt16BE(i + 7), tipo: 'jpeg' }
      i += 2 + b.readUInt16BE(i + 2)
    }
  }
  return null
}

export interface FilaDeFormato { red: string; formato: string; ancho: number; alto: number; tipos_archivo: string[]; peso_max_mb: number; n_min: number; n_max: number; texto_max: number; hashtags_max: number; pasos_publicacion?: string[]; verificado: boolean }
export interface ArchivoDeEntrega { nombre: string; bytes: Buffer }

export function manifiesto(archivos: ArchivoDeEntrega[], meta: Record<string, unknown>): { archivos: Array<{ nombre: string; bytes: number; sha256: string; ancho: number | null; alto: number | null; tipo: string | null }>; meta: Record<string, unknown> } {
  return {
    meta,
    archivos: archivos.map((a) => {
      const m = leerMedidas(a.bytes)
      return { nombre: a.nombre, bytes: a.bytes.length, sha256: crypto.createHash('sha256').update(a.bytes).digest('hex'), ancho: m?.ancho ?? null, alto: m?.alto ?? null, tipo: m?.tipo ?? null }
    }),
  }
}

/** chequeos de la entrega (sin modelo). Mientras la fila no esté verificada, los límites de texto/hashtags/peso avisan (`sugerencia`) y no bloquean; las medidas SÍ bloquean. */
export function chequeosDeEntrega(archivos: ArchivoDeEntrega[], fila: FilaDeFormato | null, p: { pie_de_foto: string; hashtags: string[] }, man: ReturnType<typeof manifiesto>): Ficha[] {
  const f: Ficha[] = []
  let n = 0
  const nueva = (gravedad: Ficha['gravedad'], que: string, contra_que: string, propuesta: string, donde = 'entrega') => f.push({ id: `ent-${n++}`, origen: 'chequeo', donde, gravedad, estado: 'abierta', que, contra_que, propuesta })
  if (!fila) { nueva('bloquea', 'no hay especificación técnica para este formato y red', 'tabla de formatos de entrega', 'agregar la fila del formato antes de empaquetar'); return f }
  const avisa: Ficha['gravedad'] = fila.verificado ? 'bloquea' : 'sugerencia'
  if (archivos.length < fila.n_min || archivos.length > fila.n_max) nueva('bloquea', `${archivos.length} archivo(s); el formato admite de ${fila.n_min} a ${fila.n_max}`, 'especificación del formato', 'ajustar la cantidad')
  const nombres = archivos.map((a) => a.nombre)
  if (new Set(nombres).size !== nombres.length) nueva('bloquea', 'hay nombres de archivo repetidos', 'orden continuo 01..NN', 'renombrar')
  man.archivos.forEach((a, i) => {
    if (a.ancho === null || a.alto === null) { nueva('bloquea', `«${a.nombre}» no es una imagen legible`, 'encabezado del archivo', 'regenerar el archivo'); return }
    if (Math.abs(a.ancho / a.alto - fila.ancho / fila.alto) > 0.01) nueva('bloquea', `«${a.nombre}» mide ${a.ancho}×${a.alto} y el formato pide la proporción ${fila.ancho}×${fila.alto}`, 'especificación del formato', 'recortar a la proporción del formato')
    else if (a.ancho !== fila.ancho || a.alto !== fila.alto) nueva('sugerencia', `«${a.nombre}» mide ${a.ancho}×${a.alto} (proporción correcta) y el formato indica ${fila.ancho}×${fila.alto}`, 'especificación del formato', 'la red lo reescala; subir tal cual o reescalar antes')
    if (a.tipo && !fila.tipos_archivo.includes(a.tipo)) nueva(avisa, `«${a.nombre}» es ${a.tipo} y el formato admite ${fila.tipos_archivo.join(', ')}`, 'especificación del formato', 'convertir')
    if (a.bytes > fila.peso_max_mb * 1024 * 1024) nueva(avisa, `«${a.nombre}» pesa ${(a.bytes / 1048576).toFixed(1)} MB y el límite es ${fila.peso_max_mb}`, 'especificación del formato', 'comprimir')
    void i
  })
  if (p.pie_de_foto.length > fila.texto_max) nueva(avisa, `el texto tiene ${p.pie_de_foto.length} caracteres y el límite es ${fila.texto_max}`, 'especificación del formato', 'acortar', 'texto')
  if (p.hashtags.length > fila.hashtags_max) nueva(avisa, `${p.hashtags.length} hashtags y el límite es ${fila.hashtags_max}`, 'especificación del formato', 'reducir', 'hashtags')
  return f
}

/** instante UTC (ISO) de una fecha y hora LOCALES en una zona IANA; null si falta la fecha o la zona no existe (la pieza no vence: se declara) */
export function aUtc(fecha: string | null | undefined, hora: string | null | undefined, zona: string | null | undefined): string | null {
  if (!fecha || !esFechaReal(fecha) || !zona) return null
  if (hora && !esHoraReal(hora.slice(0, 5))) return null // una hora que no existe no se corrige sola (antes caía a medianoche y la pieza vencía horas antes)
  const [y, mo, d] = fecha.split('-').map(Number)
  const [h, mi] = (hora ? hora.slice(0, 5) : '00:00').split(':').map(Number)
  try {
    const dtf = new Intl.DateTimeFormat('en-US', { timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    const desfase = (t: number) => {
      const p = Object.fromEntries(dtf.formatToParts(new Date(t)).map((x) => [x.type, x.value]))
      return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - t
    }
    const local = Date.UTC(y, mo - 1, d, h, mi, 0)
    let t = local - desfase(local)
    t = local - desfase(t)
    return new Date(t).toISOString()
  } catch { return null }
}

export interface FilaDeBandeja { id: string; status: string; expires_at: string | null; metadata?: Record<string, unknown> | null }
/** filas `pending` de la OFICINA cuya fecha ya pasó: vencen (se anotan) y NUNCA se publican solas. Una fila ajena a la oficina no se toca. */
export function filasQueVencen(filas: FilaDeBandeja[], ahora: Date): FilaDeBandeja[] {
  return filas.filter((x) => x.status === 'pending' && x.expires_at !== null && new Date(x.expires_at).getTime() < ahora.getTime() && (x.metadata as { origen?: string } | null | undefined)?.origen === 'oficina')
}
export const NOTA_DE_VENCIMIENTO = 'no aprobada antes de su fecha; no se publica'
