/**
 * Lector de hojas: CSV y XLSX → filas como texto. Cada fila se explica sola: «fila N: Columna: valor | …».
 * Cada 20 filas va una línea en blanco y se repite «Columnas: …» (el sistema corta en segmentos por línea en blanco, y cada segmento se entiende solo).
 * Las fórmulas NO se interpretan: se lee el valor guardado como texto. Sin biblioteca: lector de CSV propio y XLSX sobre zip.ts.
 */
import { cortarSalida, lectura } from './comun'
import { TOPES } from './topes'
import type { LecturaDeArchivo } from './tipos'
import { atributo, recorrer } from './xml'
import { abrirZip, leerEntrada } from './zip'

const FILAS_POR_BLOQUE = 20

interface FilaLeida { numero: number; celdas: string[] }
interface HojaLeida { nombre: string | null; filas: FilaLeida[]; cortada: boolean; columnasCortadas: boolean; celdasCortadas: boolean }

const vacia = (f: FilaLeida): boolean => f.celdas.every((c) => !c.trim())

function recortarCelda(c: string, h: { celdasCortadas: boolean }): string {
  if (c.length <= TOPES.celda_chars) return c
  h.celdasCortadas = true
  return c.slice(0, TOPES.celda_chars)
}

// ───────────────────────── CSV ─────────────────────────
function elegirSeparador(t: string): string {
  const fin = t.indexOf('\n')
  const primera = fin < 0 ? t : t.slice(0, fin)
  let mejor = ','
  let max = 0
  for (const s of [',', ';', '\t']) {
    const n = primera.split(s).length - 1
    if (n > max) { max = n; mejor = s }
  }
  return mejor
}

function leerCsv(buf: Buffer): HojaLeida {
  let t = buf.toString('utf8')
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1)
  const sep = elegirSeparador(t)
  const h: HojaLeida = { nombre: null, filas: [], cortada: false, columnasCortadas: false, celdasCortadas: false }
  let celdas: string[] = []
  let celda = ''
  let entre = false
  let numero = 1
  let datos = 0
  const cerrarCelda = () => {
    if (celdas.length < TOPES.hoja_columnas) celdas.push(recortarCelda(celda, h))
    else h.columnasCortadas = true
    celda = ''
  }
  const cerrarFila = (): boolean => {
    cerrarCelda()
    const f = { numero, celdas }
    numero++
    celdas = []
    if (h.filas.length === 0) { if (!vacia(f)) h.filas.push(f); return false }
    if (!vacia(f)) {
      if (datos >= TOPES.hoja_filas) { h.cortada = true; return true }
      h.filas.push(f); datos++
    }
    return false
  }
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (entre) {
      if (c === '"') { if (t[i + 1] === '"') { celda += '"'; i++ } else entre = false }
      else if (c === '\r') { celda += '\n'; if (t[i + 1] === '\n') i++ } // un salto dentro de la celda sale siempre como un solo salto de línea
      else celda += c
      continue
    }
    if (c === '"' && celda === '') entre = true
    else if (c === sep) cerrarCelda()
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; if (cerrarFila()) return h }
    else celda += c
  }
  if (celda !== '' || celdas.length) cerrarFila()
  return h
}

// ───────────────────────── XLSX ─────────────────────────
function columnaDe(ref: string): number {
  let n = 0
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i)
    if (c < 65 || c > 90) break
    n = n * 26 + (c - 64)
    if (n > 100_000) return n
  }
  return n - 1
}

function cadenasCompartidas(xml: string): string[] {
  const salida: string[] = []
  let actual = ''
  let enT = false
  let enFonetico = false
  recorrer(xml, (t) => {
    if (t.tipo === 'texto') { if (enT && !enFonetico) actual += t.texto; return }
    if (t.nombre === 'si') { if (t.tipo === 'abre') actual = ''; else if (t.tipo === 'cierra') salida.push(actual); else salida.push('') }
    else if (t.nombre === 't') enT = t.tipo === 'abre'
    else if (t.nombre === 'rPh') enFonetico = t.tipo === 'abre'
  })
  return salida
}

function leerHojaXlsx(xml: string, compartidas: string[], nombre: string): HojaLeida {
  const h: HojaLeida = { nombre, filas: [], cortada: false, columnasCortadas: false, celdasCortadas: false }
  let numero = 0
  let celdas: string[] = []
  let tipo = ''
  let col = -1
  let ref = ''
  let valor = ''
  let enV = false
  let enT = false
  let enIs = false
  let datos = 0
  recorrer(xml, (t) => {
    if (t.tipo === 'texto') { if (enV || (enIs && enT)) valor += t.texto; return }
    switch (t.nombre) {
      case 'row':
        if (t.tipo === 'cierra') {
          const f = { numero, celdas }
          celdas = []
          if (h.filas.length === 0) { if (!vacia(f)) h.filas.push(f) }
          else if (!vacia(f)) {
            if (datos >= TOPES.hoja_filas) { h.cortada = true; return true }
            h.filas.push(f); datos++
          }
        } else {
          const r = parseInt(atributo(t.crudo, 'r') ?? '', 10)
          numero = Number.isFinite(r) && r > 0 ? r : numero + 1
          celdas = []
          if (t.tipo === 'vacia') { /* fila vacía: nada que guardar */ }
        }
        break
      case 'c':
        if (t.tipo === 'abre' || t.tipo === 'vacia') {
          tipo = atributo(t.crudo, 't') ?? ''
          ref = atributo(t.crudo, 'r') ?? ''
          col = ref ? columnaDe(ref) : celdas.length
          valor = ''; enV = false; enT = false; enIs = false
          if (t.tipo === 'vacia') break
        } else {
          if (col >= TOPES.hoja_columnas) h.columnasCortadas = true
          else if (col >= 0) {
            let v = valor
            if (tipo === 's') v = compartidas[parseInt(valor, 10)] ?? ''
            else if (tipo === 'b') v = valor.trim() === '1' ? 'VERDADERO' : 'FALSO'
            else if (tipo !== 'inlineStr' && tipo !== 'str') v = valor.trim()
            while (celdas.length < col) celdas.push('')
            celdas[col] = recortarCelda(v, h)
          }
          col = -1
        }
        break
      case 'v': enV = t.tipo === 'abre'; break
      case 'is': enIs = t.tipo === 'abre'; break
      case 't': enT = t.tipo === 'abre'; break
      default: break
    }
  })
  return h
}

function rutaDeHoja(destino: string): string {
  const limpio = destino.replace(/^\/+/, '')
  return limpio.startsWith('xl/') ? limpio : 'xl/' + limpio
}

// ───────────────────────── salida ─────────────────────────
function describir(h: HojaLeida, avisos: string[]): { texto: string; filas: number } | null {
  if (h.filas.length < 2) return null
  const [encabezado, ...datos] = h.filas
  const nombres = encabezado.celdas.map((c, i) => (c.trim() ? c.trim() : `col ${i + 1}`))
  const cabeza = (h.nombre ? `Hoja «${h.nombre}»\n` : '') + `Columnas: ${nombres.join(' | ')}`
  const bloques: string[] = []
  for (let i = 0; i < datos.length; i += FILAS_POR_BLOQUE) {
    const lineas = datos.slice(i, i + FILAS_POR_BLOQUE).map((f) => {
      const partes: string[] = []
      f.celdas.forEach((c, k) => { if (c.trim()) partes.push(`${nombres[k] ?? `col ${k + 1}`}: ${c}`) })
      return `fila ${f.numero}: ${partes.join(' | ')}`
    })
    bloques.push(cabeza + '\n' + lineas.join('\n'))
  }
  const tag = h.nombre ? `«${h.nombre}»` : 'la hoja'
  if (h.cortada) avisos.push(`${tag}: pasa de ${TOPES.hoja_filas} filas; se leyeron las primeras ${TOPES.hoja_filas} y lo que sigue NO se leyó.`)
  if (h.columnasCortadas) avisos.push(`${tag}: pasa de ${TOPES.hoja_columnas} columnas; las que sobran NO se leyeron.`)
  if (h.celdasCortadas) avisos.push(`${tag}: hay celdas de más de ${TOPES.celda_chars} caracteres; se cortaron.`)
  return { texto: bloques.join('\n\n'), filas: datos.length }
}

export function leerHoja(buf: Buffer, nombre: string, formato: 'csv' | 'xlsx'): LecturaDeArchivo {
  const tipo = formato === 'csv' ? 'csv' : 'hoja'
  if (buf.length > TOPES.hoja_bytes) return lectura(tipo, nombre, buf, 'sobre_el_tope', { motivo: `la hoja pesa ${buf.length} bytes (tope ${TOPES.hoja_bytes})` })
  const avisos: string[] = []
  const partes: string[] = []
  let filas = 0
  let hojas: string[] | undefined

  if (formato === 'csv') {
    const d = describir(leerCsv(buf), avisos)
    if (d) { partes.push(d.texto); filas = d.filas }
  } else {
    const z = abrirZip(buf)
    if (!z.ok) return lectura(tipo, nombre, buf, z.estado, { motivo: z.motivo })
    const libro = leerEntrada(z, 'xl/workbook.xml')
    if (!libro.ok) return lectura(tipo, nombre, buf, libro.estado, { motivo: libro.motivo })
    const lista: Array<{ nombre: string; rid: string; oculta: boolean }> = []
    recorrer(libro.datos.toString('utf8'), (t) => {
      if (t.nombre === 'sheet' && t.tipo !== 'cierra') lista.push({ nombre: atributo(t.crudo, 'name') ?? `Hoja ${lista.length + 1}`, rid: atributo(t.crudo, 'r:id') ?? '', oculta: /^(hidden|veryHidden)$/i.test(atributo(t.crudo, 'state') ?? '') })
    })
    if (lista.length === 0) return lectura(tipo, nombre, buf, 'ilegible', { motivo: 'el libro no declara ninguna hoja' })
    const destinos = new Map<string, string>()
    const rels = z.entradas.has('xl/_rels/workbook.xml.rels') ? leerEntrada(z, 'xl/_rels/workbook.xml.rels') : null
    if (rels && rels.ok) recorrer(rels.datos.toString('utf8'), (t) => { if (t.nombre === 'Relationship' && t.tipo !== 'cierra') destinos.set(atributo(t.crudo, 'Id') ?? '', atributo(t.crudo, 'Target') ?? '') })
    let compartidas: string[] = []
    if (z.entradas.has('xl/sharedStrings.xml')) {
      const cs = leerEntrada(z, 'xl/sharedStrings.xml')
      if (!cs.ok) return lectura(tipo, nombre, buf, cs.estado, { motivo: cs.motivo })
      compartidas = cadenasCompartidas(cs.datos.toString('utf8'))
    }
    if (lista.length > TOPES.hoja_hojas) avisos.push(`El libro tiene ${lista.length} hojas; solo se leyeron las primeras ${TOPES.hoja_hojas}.`)
    hojas = []
    for (let i = 0; i < Math.min(lista.length, TOPES.hoja_hojas); i++) {
      // una hoja que el dueño ESCONDIÓ no entra al cerebro sin que se diga (hallazgo F3 de CC#3): no se lee y se avisa
      if (lista[i].oculta) { avisos.push(`La hoja «${lista[i].nombre}» está OCULTA en el libro: NO se leyó.`); continue }
      const destino = destinos.get(lista[i].rid)
      const ruta = destino ? rutaDeHoja(destino) : `xl/worksheets/sheet${i + 1}.xml`
      const ent = leerEntrada(z, ruta)
      if (!ent.ok) { avisos.push(`No se pudo leer la hoja «${lista[i].nombre}» (${ent.motivo}).`); continue }
      hojas.push(lista[i].nombre)
      const d = describir(leerHojaXlsx(ent.datos.toString('utf8'), compartidas, lista[i].nombre), avisos)
      if (d) { partes.push(d.texto); filas += d.filas }
    }
    avisos.push('Las fechas pueden venir como número de serie (no como fecha) y las fórmulas se leen con el último valor guardado, no se calculan.')
    if (hojas.length === 0) return lectura(tipo, nombre, buf, 'ilegible', { avisos, motivo: 'no se pudo leer ninguna hoja del libro' })
  }
  const texto = cortarSalida(partes.join('\n\n'), avisos)
  if (!texto.trim()) return lectura(tipo, nombre, buf, 'vacio', { avisos, hojas, motivo: 'la hoja no tiene filas de datos' })
  return lectura(tipo, nombre, buf, 'ok', { texto, avisos, filas, ...(hojas ? { hojas } : {}) })
}
