/**
 * Archivos de MUESTRA para las pruebas de los lectores (paso 5 del cerebro): todo se fabrica aquí, sin red y sin archivos de verdad.
 * ZIP/DOCX/XLSX se arman con `node:zlib`; el PDF se arma a mano (objetos, flujo de contenido, tabla de referencias).
 */
import { deflateRawSync } from 'node:zlib'

// ───────────────────────── ZIP ─────────────────────────
const TABLA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 }
  return t
})()
export const crc32 = (b: Buffer): number => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = TABLA_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }

export interface EntradaDeZip {
  nombre: string
  datos: Buffer | string
  metodo?: 'deflate' | 'store'
  /** MENTIRA a propósito: el tamaño que declara el encabezado (para probar que no se confía en él) */
  declarar_tamano?: number
  /** marca la entrada como cifrada (bit 0 de las banderas) */
  cifrada?: boolean
}

export function crearZip(entradas: EntradaDeZip[]): Buffer {
  const locales: Buffer[] = []
  const centrales: Buffer[] = []
  let desplazamiento = 0
  for (const e of entradas) {
    const datos = Buffer.isBuffer(e.datos) ? e.datos : Buffer.from(e.datos, 'utf8')
    const metodo = e.metodo === 'store' ? 0 : 8
    const comprimidos = metodo === 8 ? deflateRawSync(datos) : datos
    const nombre = Buffer.from(e.nombre, 'utf8')
    const bandera = e.cifrada ? 1 : 0
    const tam = e.declarar_tamano ?? datos.length
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(bandera, 6); local.writeUInt16LE(metodo, 8)
    local.writeUInt32LE(crc32(datos), 14); local.writeUInt32LE(comprimidos.length, 18); local.writeUInt32LE(tam, 22); local.writeUInt16LE(nombre.length, 26)
    locales.push(local, nombre, comprimidos)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(bandera, 8); central.writeUInt16LE(metodo, 10)
    central.writeUInt32LE(crc32(datos), 16); central.writeUInt32LE(comprimidos.length, 20); central.writeUInt32LE(tam, 24); central.writeUInt16LE(nombre.length, 28)
    central.writeUInt32LE(desplazamiento, 42)
    centrales.push(central, nombre)
    desplazamiento += 30 + nombre.length + comprimidos.length
  }
  const dirCentral = Buffer.concat(centrales)
  const fin = Buffer.alloc(22)
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(entradas.length, 8); fin.writeUInt16LE(entradas.length, 10)
  fin.writeUInt32LE(dirCentral.length, 12); fin.writeUInt32LE(desplazamiento, 16)
  return Buffer.concat([...locales, dirCentral, fin])
}

// ───────────────────────── DOCX ─────────────────────────
export const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
export const parrafoXml = (t: string): string => `<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr><w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`
export const tablaXml = (filas: string[][]): string =>
  `<w:tbl><w:tblPr/>${filas.map((f) => `<w:tr>${f.map((c) => `<w:tc><w:p><w:r><w:t>${esc(c)}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`

export function crearDocx(cuerpoXml: string, extra: EntradaDeZip[] = []): Buffer {
  return crearZip([
    { nombre: '[Content_Types].xml', datos: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { nombre: 'word/document.xml', datos: `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${cuerpoXml}</w:body></w:document>` },
    ...extra,
  ])
}

// ───────────────────────── XLSX ─────────────────────────
export interface HojaDeMuestra { nombre: string; filas: Array<Array<string | number | boolean | null>>; enLinea?: boolean }
const letra = (i: number): string => { let s = ''; let n = i + 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) } return s }

export function crearXlsx(hojas: HojaDeMuestra[]): Buffer {
  const compartidas: string[] = []
  const idx = (t: string): number => { let i = compartidas.indexOf(t); if (i < 0) { compartidas.push(t); i = compartidas.length - 1 } return i }
  const hojasXml = hojas.map((h) => {
    const filas = h.filas.map((fila, r) => {
      const celdas = fila.map((v, c) => {
        if (v === null || v === '') return ''
        const ref = `${letra(c)}${r + 1}`
        if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`
        if (typeof v === 'boolean') return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`
        return h.enLinea ? `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>` : `<c r="${ref}" t="s"><v>${idx(v)}</v></c>`
      }).join('')
      return `<row r="${r + 1}">${celdas}</row>`
    }).join('')
    return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${filas}</sheetData></worksheet>`
  })
  const libro = `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas.map((h, i) => `<sheet name="${esc(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`
  const rels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`
  const comp = `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${compartidas.length}" uniqueCount="${compartidas.length}">${compartidas.map((t) => `<si><t xml:space="preserve">${esc(t)}</t></si>`).join('')}</sst>`
  return crearZip([
    { nombre: '[Content_Types].xml', datos: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
    { nombre: 'xl/workbook.xml', datos: libro },
    { nombre: 'xl/_rels/workbook.xml.rels', datos: rels },
    { nombre: 'xl/sharedStrings.xml', datos: comp },
    ...hojasXml.map((x, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, datos: x })),
  ])
}

// ───────────────────────── PDF ─────────────────────────
export interface PaginaPdf {
  /** texto en (x, y) de la página, en puntos */
  textos?: Array<{ t: string; x: number; y: number }>
  /** una imagen de página completa y nada de texto (como un documento escaneado) */
  escaneada?: boolean
}
export interface OpcionesPdf { javascript?: boolean }

const escPdf = (s: string): string => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')

export function crearPdf(paginas: PaginaPdf[], op: OpcionesPdf = {}): Buffer {
  const objs: string[] = []
  const nuevo = (c: string): number => { objs.push(c); return objs.length }
  const raiz = nuevo('') // 1 catálogo (se rellena abajo)
  const arbol = nuevo('') // 2 páginas
  const fuente = nuevo('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  const imagen = nuevo('<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 1 >>\nstream\nÿ\nendstream')
  const hijas: number[] = []
  for (const p of paginas) {
    const flujo = p.escaneada
      ? 'q 595 0 0 842 0 0 cm /Im0 Do Q'
      : 'BT /F1 11 Tf ' + (p.textos ?? []).map((x, i, a) => `1 0 0 1 ${x.x} ${x.y} Tm (${escPdf(x.t)}) Tj${i < a.length - 1 ? ' ' : ''}`).join(' ') + ' ET'
    const contenido = nuevo(`<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`)
    const pagina = nuevo(`<< /Type /Page /Parent ${arbol} 0 R /MediaBox [0 0 595 842] /Contents ${contenido} 0 R /Resources << /Font << /F1 ${fuente} 0 R >> /XObject << /Im0 ${imagen} 0 R >> >> >>`)
    hijas.push(pagina)
  }
  objs[arbol - 1] = `<< /Type /Pages /Kids [${hijas.map((h) => `${h} 0 R`).join(' ')}] /Count ${hijas.length} >>`
  objs[raiz - 1] = `<< /Type /Catalog /Pages ${arbol} 0 R${op.javascript ? ' /OpenAction << /S /JavaScript /JS (globalThis.__pdf_js_ejecutado = true;) >> /Names << /JavaScript << /Names [(a) << /S /JavaScript /JS (globalThis.__pdf_js_ejecutado = true;) >>] >> >>' : ''} >>`
  let pdf = '%PDF-1.4\n'
  const pos: number[] = []
  objs.forEach((o, i) => { pos.push(Buffer.byteLength(pdf, 'latin1')); pdf += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const xref = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + pos.map((p) => String(p).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root ${raiz} 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(pdf, 'latin1')
}

export const textoPagina = (...lineas: string[]): PaginaPdf => ({ textos: lineas.map((t, i) => ({ t, x: 50, y: 780 - i * 16 })) })
export const b64 = (b: Buffer | string): string => (Buffer.isBuffer(b) ? b : Buffer.from(b, 'utf8')).toString('base64')

/** una imagen PNG mínima válida (1×1) */
export const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
export const JPEG_MINIMO = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9])
