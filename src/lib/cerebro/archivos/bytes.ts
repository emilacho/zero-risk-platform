/**
 * «Recibir bytes»: el archivo llega en base64 dentro de la petición. NUNCA se descarga por una dirección: los campos `url` o `enlace`
 * se ignoran y aquí no existe ninguna llamada de red. Los topes se aplican sobre el LARGO del texto base64, antes de decodificar.
 */
import { TOPES, MAXIMO_DE_BASE64 } from './topes'
import { huellaDe } from './comun'
import { abrirZip } from './zip'
import type { TipoDeArchivo } from './tipos'

export type MotivoDeRechazoDeBytes = 'base64_invalido' | 'vacio' | 'sobre_el_tope' | 'tipo_no_admitido' | 'tipo_no_coincide'
export type BytesRecibidos =
  | { ok: true; tipo: TipoDeArchivo; mime: string; bytes: Buffer; huella: string; nombre: string }
  | { ok: false; motivo: MotivoDeRechazoDeBytes; detalle: string; nombre: string }

const MIME: Record<TipoDeArchivo, string> = {
  pdf: 'application/pdf',
  word: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  hoja: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  texto: 'text/plain',
  imagen: 'image/png',
}

/** solo una etiqueta: sin rutas ni caracteres de control, ≤ 200 */
export function limpiarNombre(n: unknown): string {
  const s = typeof n === 'string' ? n : ''
  return s.replace(/[\u0000-\u001f\u007f\\/]/g, '').replace(/\.\.+/g, '.').slice(0, 200)
}

const rechazo = (motivo: MotivoDeRechazoDeBytes, detalle: string, nombre: string): BytesRecibidos => ({ ok: false, motivo, detalle, nombre })

/** el tipo se reconoce por la FIRMA, no por el nombre; devuelve el mime exacto de las imágenes */
export function reconocer(b: Buffer, nombre: string): { tipo: TipoDeArchivo; mime: string } | null {
  if (b.length >= 5 && b.subarray(0, 5).toString('latin1') === '%PDF-') return { tipo: 'pdf', mime: MIME.pdf }
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { tipo: 'imagen', mime: 'image/png' }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { tipo: 'imagen', mime: 'image/jpeg' }
  if (b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return { tipo: 'imagen', mime: 'image/webp' }
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05)) {
    const z = abrirZip(b)
    if (z.ok) {
      if (z.entradas.has('word/document.xml')) return { tipo: 'word', mime: MIME.word }
      if (z.entradas.has('xl/workbook.xml')) return { tipo: 'hoja', mime: MIME.hoja }
      return null
    }
    // un ZIP dañado con la firma de Word/XLSX se deja pasar al lector para que lo declare «ilegible»
    return /\.docx$/i.test(nombre) ? { tipo: 'word', mime: MIME.word } : /\.xlsx$/i.test(nombre) ? { tipo: 'hoja', mime: MIME.hoja } : null
  }
  // texto: sin bytes nulos ni de control raros
  const muestra = b.subarray(0, Math.min(b.length, 8192))
  for (let i = 0; i < muestra.length; i++) {
    const c = muestra[i]
    if (c === 0 || (c < 9) || (c > 13 && c < 32 && c !== 27)) return null
  }
  if (muestra.length >= 2 && ((muestra[0] === 0x4d && muestra[1] === 0x5a) || (muestra[0] === 0x7f && muestra[1] === 0x45))) return null
  return /\.(csv|tsv)$/i.test(nombre) ? { tipo: 'csv', mime: MIME.csv } : { tipo: 'texto', mime: MIME.texto }
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

export function recibirBytes(entrada: unknown): BytesRecibidos {
  const obj = entrada && typeof entrada === 'object' ? (entrada as Record<string, unknown>) : {}
  const nombre = limpiarNombre(obj.nombre)
  const texto = obj.base64
  if (typeof texto !== 'string') return rechazo('base64_invalido', 'falta el campo base64 (los archivos llegan en base64; no se descargan por una dirección)', nombre)
  if (texto.length === 0) return rechazo('vacio', 'el archivo está vacío', nombre)
  // el tope se mide ANTES de mirar el contenido
  if (texto.length > MAXIMO_DE_BASE64) return rechazo('sobre_el_tope', `el archivo supera el máximo admitido (${Math.round((MAXIMO_DE_BASE64 * 3) / 4 / 1024 / 1024)} MB)`, nombre)
  if (texto.length % 4 !== 0 || !BASE64.test(texto)) return rechazo('base64_invalido', 'el texto no es base64 válido', nombre)
  const bytes = Buffer.from(texto, 'base64')
  if (bytes.length === 0) return rechazo('vacio', 'el archivo está vacío', nombre)
  const r = reconocer(bytes, nombre)
  if (!r) return rechazo('tipo_no_admitido', 'solo se admiten PDF, Word (.docx), hoja (.xlsx), CSV, texto e imagen PNG/JPEG/WebP', nombre)
  const tope = r.tipo === 'imagen' ? TOPES.imagen_bytes : r.tipo === 'pdf' ? TOPES.pdf_bytes : r.tipo === 'word' ? TOPES.word_bytes : r.tipo === 'texto' ? TOPES.texto_bytes : TOPES.hoja_bytes
  if (bytes.length > tope) return rechazo('sobre_el_tope', `el ${r.tipo} pesa ${bytes.length} bytes (tope ${tope})`, nombre)
  const declarado = typeof obj.tipo === 'string' ? obj.tipo.toLowerCase() : ''
  if (declarado && !coincide(declarado, r)) return rechazo('tipo_no_coincide', `se declaró «${declarado}» pero el contenido es ${r.tipo}`, nombre)
  return { ok: true, tipo: r.tipo, mime: r.mime, bytes, huella: huellaDe(bytes), nombre }
}

function coincide(declarado: string, r: { tipo: TipoDeArchivo; mime: string }): boolean {
  if (declarado === r.mime || declarado === r.tipo) return true
  if (r.tipo === 'imagen') return declarado.startsWith('image/') && declarado === r.mime
  if (r.tipo === 'csv' || r.tipo === 'texto') return declarado.startsWith('text/') || declarado === 'csv' || declarado === 'texto'
  return false
}
