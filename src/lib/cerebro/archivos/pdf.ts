/**
 * Lector de PDF sobre `unpdf` (pdf.js empaquetado, sin dependencias, MIT). Lee el texto con su posición: las celdas de una misma fila quedan
 * en la misma línea (separadas por tabulación si hay un hueco de columna). Sin modelo, sin red, sin escribir.
 * Un PDF escaneado (solo imagen) se DECLARA como tal: no se inventa texto. Los PDF con JavaScript se leen como datos: el código no corre.
 * Mitigaciones de seguridad de pdf.js: `isEvalSupported:false`, sin canvas, sin worker de página, y topes de tamaño, páginas y tiempo.
 */
import { getDocumentProxy, getResolvedPDFJS } from 'unpdf'
import { cortarSalida, lectura } from './comun'
import { TOPES } from './topes'
import type { LecturaDeArchivo } from './tipos'

interface ItemDeTexto { str?: string; transform?: number[]; width?: number; height?: number }
interface PaginaLeible { getTextContent(): Promise<{ items: ItemDeTexto[] }>; getOperatorList(): Promise<{ fnArray: number[] }> }
interface DocumentoLeible { numPages: number; getPage(n: number): Promise<PaginaLeible>; destroy?: () => Promise<void> | void; getJSActions?: () => Promise<unknown> }

export interface OpcionesDePdf {
  tiempoMs?: number
  /** solo para pruebas: reemplaza la apertura del documento */
  abrirDocumento?: (datos: Uint8Array) => Promise<DocumentoLeible>
}

export function clasificarErrorDePdf(e: unknown): 'protegido' | 'ilegible' {
  const nombre = e && typeof e === 'object' ? String((e as { name?: unknown }).name ?? '') : ''
  return nombre === 'PasswordException' ? 'protegido' : 'ilegible'
}

const abrirPorDefecto = (datos: Uint8Array): Promise<DocumentoLeible> =>
  getDocumentProxy(datos, { isEvalSupported: false, verbosity: 0, useSystemFonts: false, disableFontFace: true } as never) as unknown as Promise<DocumentoLeible>

/** junta los trozos de una página en líneas: por altura (tolerancia 3 pt), de arriba abajo; dentro de la línea, de izquierda a derecha */
function lineasDePagina(items: ItemDeTexto[]): string[] {
  const trozos = items
    .filter((i) => typeof i.str === 'string' && i.str.trim() !== '' && Array.isArray(i.transform))
    .map((i) => ({ t: i.str as string, x: i.transform![4], y: i.transform![5], w: i.width ?? 0, h: Math.abs(i.transform![3]) || i.height || 10 }))
  trozos.sort((a, b) => b.y - a.y || a.x - b.x)
  const lineas: Array<typeof trozos> = []
  for (const t of trozos) {
    const ultima = lineas[lineas.length - 1]
    if (ultima && Math.abs(ultima[0].y - t.y) <= 3) ultima.push(t)
    else lineas.push([t])
  }
  return lineas.map((l) => {
    l.sort((a, b) => a.x - b.x)
    let s = ''
    let finPrevio = 0
    l.forEach((t, k) => {
      if (k > 0) {
        const hueco = t.x - finPrevio
        s += hueco > t.h * 1.5 ? '\t' : hueco > t.h * 0.15 ? ' ' : ''
      }
      s += t.t
      finPrevio = t.x + t.w
    })
    return s.trim()
  }).filter(Boolean)
}

export async function leerPdf(buf: Buffer, nombre: string, op: OpcionesDePdf = {}): Promise<LecturaDeArchivo> {
  if (buf.length > TOPES.pdf_bytes) return lectura('pdf', nombre, buf, 'sobre_el_tope', { motivo: `el PDF pesa ${buf.length} bytes (tope ${TOPES.pdf_bytes})` })
  const tiempoMs = op.tiempoMs ?? TOPES.tiempo_ms
  const abrir = op.abrirDocumento ?? abrirPorDefecto
  const avisos: string[] = []
  let doc: DocumentoLeible | null = null
  let reloj: ReturnType<typeof setTimeout> | undefined
  const vencido = new Promise<'tiempo'>((resolve) => { reloj = setTimeout(() => resolve('tiempo'), tiempoMs) })

  const trabajar = async (): Promise<LecturaDeArchivo> => {
    doc = await abrir(new Uint8Array(buf))
    const paginas = doc.numPages
    if (paginas > TOPES.pdf_paginas) {
      return lectura('pdf', nombre, buf, 'sobre_el_tope', { paginas, motivo: `el PDF tiene ${paginas} páginas (tope ${TOPES.pdf_paginas}); no se extrajo nada` })
    }
    const { OPS } = (await getResolvedPDFJS()) as unknown as { OPS: Record<string, number> }
    const imagenes = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.paintJpegXObject, OPS.paintImageXObjectRepeat].filter((x) => typeof x === 'number'))
    const textos: string[] = []
    const sinTexto: number[] = []
    for (let n = 1; n <= paginas; n++) {
      const pagina = await doc.getPage(n)
      const lineas = lineasDePagina((await pagina.getTextContent()).items)
      if (lineas.length) { textos.push(lineas.join('\n')); continue }
      let conImagen = false
      try { conImagen = (await pagina.getOperatorList()).fnArray.some((f) => imagenes.has(f)) } catch { conImagen = false }
      if (conImagen) sinTexto.push(n)
    }
    let tieneJs = buf.includes('/JavaScript') || buf.includes('/JS')
    if (!tieneJs && doc.getJSActions) { try { tieneJs = Boolean(await doc.getJSActions()) } catch { /* sin acciones */ } }
    if (tieneJs) avisos.push('El PDF contiene JavaScript: NO se ejecuta; solo se leyó el texto como datos.')
    const extra = { paginas, ...(sinTexto.length ? { paginas_sin_texto: sinTexto } : {}) }
    if (textos.length === 0) {
      if (sinTexto.length) return lectura('pdf', nombre, buf, 'escaneado', { ...extra, avisos, motivo: 'el PDF es una imagen escaneada: no trae texto y no se inventa' })
      return lectura('pdf', nombre, buf, 'vacio', { ...extra, avisos, motivo: 'el PDF no tiene texto' })
    }
    if (sinTexto.length) avisos.push(`Las páginas ${sinTexto.join(', ')} son imágenes sin texto (escaneadas): NO se leyeron.`)
    return lectura('pdf', nombre, buf, 'ok', { ...extra, texto: cortarSalida(textos.join('\n\n'), avisos), avisos })
  }

  try {
    const r = await Promise.race([trabajar(), vencido])
    if (r === 'tiempo') return lectura('pdf', nombre, buf, 'ilegible', { motivo: 'tiempo_agotado' })
    return r
  } catch (e) {
    const estado = clasificarErrorDePdf(e)
    const motivo = estado === 'protegido' ? 'el PDF está protegido con contraseña' : `no se pudo leer el PDF (${(e instanceof Error ? e.message : String(e)).slice(0, 160)})`
    return lectura('pdf', nombre, buf, estado, { motivo })
  } finally {
    if (reloj) clearTimeout(reloj)
    const d = doc as DocumentoLeible | null
    if (d?.destroy) { try { void Promise.resolve(d.destroy()).catch(() => undefined) } catch { /* nada */ } }
  }
}
