/**
 * Lector de Word (.docx): el documento es un ZIP con XML. Lector propio sobre `node:zlib` (sin biblioteca nueva), con los topes de zip.ts.
 * Lee el cuerpo (`word/document.xml`): párrafos separados por una línea en blanco; una tabla = una línea por fila, celdas separadas por « | ».
 * NO lee encabezados, pies ni comentarios (se avisa). Lo que parece una orden es dato: el texto no se toca.
 */
import { cortarSalida, lectura } from './comun'
import { TOPES } from './topes'
import type { LecturaDeArchivo } from './tipos'
import { recorrer } from './xml'
import { abrirZip, hayEntradaQueEmpiece, leerEntrada } from './zip'

export function leerWord(buf: Buffer, nombre: string): LecturaDeArchivo {
  const avisos: string[] = []
  if (buf.length > TOPES.word_bytes) return lectura('word', nombre, buf, 'sobre_el_tope', { motivo: `el Word pesa ${buf.length} bytes (tope ${TOPES.word_bytes})` })
  const z = abrirZip(buf)
  if (!z.ok) return lectura('word', nombre, buf, z.estado, { motivo: z.motivo })
  const doc = leerEntrada(z, 'word/document.xml')
  if (!doc.ok) return lectura('word', nombre, buf, doc.estado, { motivo: doc.motivo })
  if (hayEntradaQueEmpiece(z, /^word\/(header|footer|comments|footnotes|endnotes)/i)) avisos.push('No se leen los encabezados, los pies de página, las notas ni los comentarios del documento.')

  const bloques: string[] = []
  let total = 0
  let cortado = false
  let parrafo = ''
  let enTexto = false
  let nivelTabla = 0
  let filas: string[] = []
  let celdas: string[] = []
  let partesCelda: string[] = []

  const cerrarParrafo = () => {
    const t = parrafo.trimEnd()
    parrafo = ''
    if (!t.trim()) return
    if (nivelTabla > 0) partesCelda.push(t)
    else { bloques.push(t); total += t.length + 2 }
  }

  recorrer(doc.datos.toString('utf8'), (t) => {
    if (total > TOPES.texto_salida_chars) { cortado = true; return true }
    if (t.tipo === 'texto') { if (enTexto) parrafo += t.texto; return }
    switch (t.nombre) {
      case 'w:t': enTexto = t.tipo === 'abre'; if (t.tipo === 'cierra') enTexto = false; break
      case 'w:tab': if (t.tipo !== 'cierra') parrafo += '\t'; break
      case 'w:br': case 'w:cr': if (t.tipo !== 'cierra') parrafo += '\n'; break
      case 'w:p': if (t.tipo === 'abre') parrafo = ''; break
      case 'w:tbl': if (t.tipo === 'abre') { if (nivelTabla === 0) { filas = [] } nivelTabla++ } break
      case 'w:tc': if (t.tipo === 'abre' && nivelTabla === 1) partesCelda = []; break
      case 'w:tr': break
      default: break
    }
    if (t.tipo === 'cierra') {
      if (t.nombre === 'w:t') enTexto = false
      else if (t.nombre === 'w:p') cerrarParrafo()
      else if (t.nombre === 'w:tc' && nivelTabla === 1) { celdas.push(partesCelda.join(' ').trim()); partesCelda = [] }
      else if (t.nombre === 'w:tr' && nivelTabla === 1) { const f = celdas.join(' | '); if (celdas.some((c) => c)) { filas.push(f); total += f.length + 1 } celdas = [] }
      else if (t.nombre === 'w:tbl') {
        nivelTabla = Math.max(0, nivelTabla - 1)
        if (nivelTabla === 0 && filas.length) { bloques.push(filas.join('\n')); filas = [] }
      }
    }
  })
  if (parrafo.trim()) cerrarParrafo()
  let texto = bloques.join('\n\n')
  if (cortado) avisos.push('El documento es muy largo: el texto se cortó y lo que sigue NO se leyó.')
  texto = cortarSalida(texto, avisos)
  if (!texto.trim()) return lectura('word', nombre, buf, 'vacio', { avisos, motivo: 'el documento no tiene texto en el cuerpo' })
  return lectura('word', nombre, buf, 'ok', { texto, avisos })
}
