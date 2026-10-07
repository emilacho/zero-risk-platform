/**
 * Lector de PDF sobre `unpdf` (pdf.js empaquetado, sin dependencias, MIT). Lee el texto con su posición: las celdas de una misma fila quedan
 * en la misma línea (separadas por tabulación si hay un hueco de columna). Sin modelo, sin red, sin escribir.
 * Un PDF escaneado (solo imagen) se DECLARA como tal: no se inventa texto. Los PDF con JavaScript se leen como datos: el código no corre.
 * Defensas (hallazgo F1 de CC#3): ANTES de abrir se infla cada flujo comprimido con un máximo de salida (`pdf-flujos.ts`: una bomba se rechaza sin llegar a la
 * biblioteca); el tiempo máximo CANCELA el trabajo (no se lee otra página) y el texto de una página se corta al juntarlo, no al final.
 * Mitigaciones de pdf.js: `isEvalSupported:false`, sin canvas, sin visor ni scripting, y topes de tamaño, páginas y tiempo.
 */
import { getDocumentProxy, getResolvedPDFJS } from 'unpdf'
import { cortarSalida, lectura } from './comun'
import { revisarFlujosDePdf } from './pdf-flujos'
import { TOPES } from './topes'
import type { LecturaDeArchivo } from './tipos'

interface ItemDeTexto { str?: string; transform?: number[]; width?: number; height?: number }
interface PaginaLeible {
  getTextContent(): Promise<{ items: ItemDeTexto[] }>
  streamTextContent?(): { getReader(): { read(): Promise<{ done: boolean; value?: { items: ItemDeTexto[] } }>; cancel(): Promise<void> } }
  getOperatorList(): Promise<{ fnArray: number[] }>
}
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

class Cancelado extends Error { constructor() { super('cancelado por tiempo'); this.name = 'Cancelado' } }

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

/** los trozos de texto de una página, juntados de a poco: si pasan del tope se corta ahí y se cancela la lectura (no se espera a tenerlos todos en memoria) */
async function itemsDePagina(pagina: PaginaLeible, cancelado: () => boolean): Promise<{ items: ItemDeTexto[]; cortada: boolean }> {
  if (typeof pagina.streamTextContent !== 'function') {
    const items = (await pagina.getTextContent()).items
    return items.length > TOPES.pdf_items_por_pagina ? { items: items.slice(0, TOPES.pdf_items_por_pagina), cortada: true } : { items, cortada: false }
  }
  const lector = pagina.streamTextContent().getReader()
  const items: ItemDeTexto[] = []
  let caracteres = 0
  for (;;) {
    if (cancelado()) { await lector.cancel().catch(() => undefined); throw new Cancelado() }
    const { done, value } = await lector.read()
    if (done) return { items, cortada: false }
    for (const it of value?.items ?? []) { items.push(it); caracteres += it.str?.length ?? 0 }
    if (items.length > TOPES.pdf_items_por_pagina || caracteres > TOPES.texto_salida_chars) {
      await lector.cancel().catch(() => undefined)
      return { items, cortada: true }
    }
  }
}

export async function leerPdf(buf: Buffer, nombre: string, op: OpcionesDePdf = {}): Promise<LecturaDeArchivo> {
  if (buf.length > TOPES.pdf_bytes) return lectura('pdf', nombre, buf, 'sobre_el_tope', { motivo: `el PDF pesa ${buf.length} bytes (tope ${TOPES.pdf_bytes})` })
  // ANTES de abrir: ningún flujo comprimido puede inflarse más de lo permitido (el PDF no llega a la biblioteca si es una bomba)
  const revision = revisarFlujosDePdf(buf)
  if (!revision.ok) return lectura('pdf', nombre, buf, revision.estado, { motivo: revision.motivo })
  const tiempoMs = op.tiempoMs ?? TOPES.tiempo_ms
  const abrir = op.abrirDocumento ?? abrirPorDefecto
  const avisos: string[] = []
  let doc: DocumentoLeible | null = null
  let reloj: ReturnType<typeof setTimeout> | undefined
  let cancelar = false
  const vencido = new Promise<'tiempo'>((resolve) => { reloj = setTimeout(() => { cancelar = true; resolve('tiempo') }, tiempoMs) })

  const trabajar = async (): Promise<LecturaDeArchivo> => {
    doc = await abrir(new Uint8Array(buf))
    if (cancelar) throw new Cancelado()
    const paginas = doc.numPages
    if (paginas > TOPES.pdf_paginas) {
      return lectura('pdf', nombre, buf, 'sobre_el_tope', { paginas, motivo: `el PDF tiene ${paginas} páginas (tope ${TOPES.pdf_paginas}); no se extrajo nada` })
    }
    const { OPS } = (await getResolvedPDFJS()) as unknown as { OPS: Record<string, number> }
    const imagenes = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.paintJpegXObject, OPS.paintImageXObjectRepeat].filter((x) => typeof x === 'number'))
    const textos: string[] = []
    const sinTexto: number[] = []
    const cortadas: number[] = []
    let acumulado = 0
    let leidas = 0
    for (let n = 1; n <= paginas; n++) {
      if (cancelar) throw new Cancelado() // el tiempo venció: no se lee ninguna página más
      if (acumulado > TOPES.texto_salida_chars) break
      const pagina = await doc.getPage(n)
      const { items, cortada } = await itemsDePagina(pagina, () => cancelar)
      leidas = n
      const lineas = lineasDePagina(items)
      if (cortada) cortadas.push(n)
      if (lineas.length) { const t = lineas.join('\n'); textos.push(t); acumulado += t.length + 2; continue }
      let conImagen = false
      try { conImagen = (await pagina.getOperatorList()).fnArray.some((f) => imagenes.has(f)) } catch { conImagen = false }
      if (conImagen) sinTexto.push(n)
    }
    if (cortadas.length) avisos.push(`El texto de la(s) página(s) ${cortadas.join(', ')} se cortó (demasiado texto en una página); lo que sigue NO se leyó.`)
    if (leidas < paginas) avisos.push(`El texto leído ya llegó al máximo: las páginas ${leidas + 1} a ${paginas} NO se leyeron.`)
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
    if (e instanceof Cancelado) return lectura('pdf', nombre, buf, 'ilegible', { motivo: 'tiempo_agotado' })
    const estado = clasificarErrorDePdf(e)
    const motivo = estado === 'protegido' ? 'el PDF está protegido con contraseña' : `no se pudo leer el PDF (${(e instanceof Error ? e.message : String(e)).slice(0, 160)})`
    return lectura('pdf', nombre, buf, estado, { motivo })
  } finally {
    if (reloj) clearTimeout(reloj)
    const d = doc as DocumentoLeible | null
    if (d?.destroy) { try { void Promise.resolve(d.destroy()).catch(() => undefined) } catch { /* nada */ } }
  }
}
