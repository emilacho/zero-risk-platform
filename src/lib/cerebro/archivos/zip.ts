/**
 * Lector de ZIP mínimo (lo usan Word y XLSX, que son ZIP con XML). Sin biblioteca: solo `node:zlib`.
 * Nunca escribe a disco: lee entradas por su nombre exacto. Desconfía de todo lo que declara el archivo:
 *  · cuenta de entradas, tamaño de cada entrada y total descomprimido, con tope y ANTES de inflar;
 *  · una entrada se infla con un máximo igual a su tamaño declarado: si el archivo miente, falla;
 *  · cifrado, ZIP64 y métodos raros se rechazan.
 */
import { inflateRawSync } from 'node:zlib'
import { TOPES } from './topes'

export interface EntradaDeZip {
  nombre: string
  metodo: number
  cifrada: boolean
  comprimido: number
  tamano: number
  desplazamiento: number
}
export type FalloDeZip = { ok: false; estado: 'ilegible' | 'sobre_el_tope' | 'protegido'; motivo: string }
export type ZipAbierto = { ok: true; buf: Buffer; entradas: Map<string, EntradaDeZip> }

const falla = (estado: FalloDeZip['estado'], motivo: string): FalloDeZip => ({ ok: false, estado, motivo })

export function abrirZip(buf: Buffer): ZipAbierto | FalloDeZip {
  if (buf.length < 22) return falla('ilegible', 'el archivo es demasiado corto para ser un ZIP')
  // el final del directorio central está en los últimos 65.557 bytes
  let fin = -1
  const desde = Math.max(0, buf.length - 65_557)
  for (let i = buf.length - 22; i >= desde; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { fin = i; break }
  }
  if (fin < 0) return falla('ilegible', 'no se encontró el final del ZIP (archivo truncado o no es un ZIP)')
  const total = buf.readUInt16LE(fin + 10)
  const tamDir = buf.readUInt32LE(fin + 12)
  const offDir = buf.readUInt32LE(fin + 16)
  if (total === 0xffff || tamDir === 0xffffffff || offDir === 0xffffffff) return falla('ilegible', 'ZIP64 no admitido')
  if (total > TOPES.zip_entradas) return falla('sobre_el_tope', `el ZIP trae ${total} entradas (tope ${TOPES.zip_entradas})`)
  if (offDir + tamDir > buf.length) return falla('ilegible', 'el directorio del ZIP apunta fuera del archivo')

  const entradas = new Map<string, EntradaDeZip>()
  let p = offDir
  let sumaDescomprimida = 0
  for (let n = 0; n < total; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) return falla('ilegible', 'entrada del directorio dañada')
    const banderas = buf.readUInt16LE(p + 8)
    const metodo = buf.readUInt16LE(p + 10)
    const comprimido = buf.readUInt32LE(p + 20)
    const tamano = buf.readUInt32LE(p + 24)
    const largoNombre = buf.readUInt16LE(p + 28)
    const largoExtra = buf.readUInt16LE(p + 30)
    const largoComentario = buf.readUInt16LE(p + 32)
    const desplazamiento = buf.readUInt32LE(p + 42)
    if (comprimido === 0xffffffff || tamano === 0xffffffff) return falla('ilegible', 'ZIP64 no admitido')
    if (p + 46 + largoNombre > buf.length) return falla('ilegible', 'nombre de entrada fuera del archivo')
    const nombre = buf.toString('utf8', p + 46, p + 46 + largoNombre)
    if (tamano > TOPES.zip_entrada_bytes) return falla('sobre_el_tope', `la entrada «${nombre.slice(0, 80)}» pesaría ${tamano} bytes descomprimida (tope ${TOPES.zip_entrada_bytes})`)
    sumaDescomprimida += tamano
    if (sumaDescomprimida > TOPES.zip_total_bytes) return falla('sobre_el_tope', `el ZIP pesaría más de ${TOPES.zip_total_bytes} bytes descomprimido`)
    entradas.set(nombre, { nombre, metodo, cifrada: (banderas & 1) === 1, comprimido, tamano, desplazamiento })
    p += 46 + largoNombre + largoExtra + largoComentario
  }
  return { ok: true, buf, entradas }
}

export function leerEntrada(z: ZipAbierto, nombre: string): { ok: true; datos: Buffer } | FalloDeZip {
  const e = z.entradas.get(nombre)
  if (!e) return falla('ilegible', `falta «${nombre}» dentro del archivo`)
  if (e.cifrada) return falla('protegido', `«${nombre}» está cifrada`)
  const buf = z.buf
  const o = e.desplazamiento
  if (o + 30 > buf.length || buf.readUInt32LE(o) !== 0x04034b50) return falla('ilegible', `encabezado local dañado en «${nombre}»`)
  const inicio = o + 30 + buf.readUInt16LE(o + 26) + buf.readUInt16LE(o + 28)
  const final = inicio + e.comprimido
  if (final > buf.length) return falla('ilegible', `«${nombre}» se sale del archivo (truncado)`)
  const crudo = buf.subarray(inicio, final)
  if (e.metodo === 0) {
    if (crudo.length !== e.tamano) return falla('ilegible', `«${nombre}» no mide lo que declara`)
    return { ok: true, datos: crudo }
  }
  if (e.metodo !== 8) return falla('ilegible', `método de compresión ${e.metodo} no admitido`)
  try {
    // el máximo de salida es el tamaño DECLARADO (ya bajo tope): si el archivo miente, falla en vez de inflarse
    const datos = inflateRawSync(crudo, { maxOutputLength: Math.max(1, e.tamano) })
    if (datos.length !== e.tamano) return falla('ilegible', `«${nombre}» no mide lo que declara`)
    return { ok: true, datos }
  } catch {
    return falla('ilegible', `no se pudo descomprimir «${nombre}» (dañada o más grande de lo que declara)`)
  }
}

/** nombres que empiezan con un prefijo (para avisar lo que no se lee: encabezados, pies, comentarios) */
export const hayEntradaQueEmpiece = (z: ZipAbierto, prefijo: RegExp): boolean => [...z.entradas.keys()].some((n) => prefijo.test(n))
