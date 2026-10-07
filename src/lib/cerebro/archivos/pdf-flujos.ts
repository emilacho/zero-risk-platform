/**
 * REVISIÓN DE LOS FLUJOS COMPRIMIDOS DE UN PDF, ANTES de abrirlo con la biblioteca (hallazgo F1 de CC#3: un PDF de 1–2 MB podía abrirse a 1–2 GB).
 * La biblioteca no trae ningún límite de memoria y su descompresión es síncrona: un tope de tiempo no la detiene. Por eso aquí cada flujo se infla con `zlib`
 * y un MÁXIMO DE SALIDA (por flujo y en total): si un flujo pasa el máximo, el PDF se rechaza como «sobre el tope» sin que la biblioteca llegue a verlo.
 * Solo lectura de la memoria del archivo; nada se escribe, nada sale a la red. Los filtros de expansión sin control (LZW, RunLength) no se admiten.
 */
import { inflateSync } from 'node:zlib'
import { TOPES } from './topes'

export type RevisionDeFlujos = { ok: true; flujos: number; inflado_bytes: number } | { ok: false; estado: 'sobre_el_tope' | 'ilegible'; motivo: string }

const NO_ADMITIDOS = new Set(['LZWDecode', 'LZW', 'RunLengthDecode', 'RL'])

function filtrosDe(dic: string): string[] {
  const m = /\/Filter\s*(\[[^\]]*\]|\/[A-Za-z0-9]+)/.exec(dic)
  return m ? [...m[1].matchAll(/\/([A-Za-z0-9]+)/g)].map((x) => x[1]) : []
}

function deHex(d: Buffer): Buffer {
  const fin = d.indexOf(0x3e)
  const t = d.toString('latin1', 0, fin < 0 ? d.length : fin).replace(/[^0-9a-fA-F]/g, '')
  return Buffer.from(t.length % 2 ? t + '0' : t, 'hex')
}

function de85(d: Buffer): Buffer {
  const salida: number[] = []
  const grupo: number[] = []
  const vacia = () => { while (grupo.length) grupo.pop() }
  for (let i = 0; i < d.length; i++) {
    const c = d[i]
    if (c === 0x7e) break // «~>» fin de los datos
    if (c <= 0x20) continue
    if (c === 0x7a && grupo.length === 0) { salida.push(0, 0, 0, 0); continue } // «z» = 4 ceros
    if (c < 0x21 || c > 0x75) continue
    grupo.push(c - 33)
    if (grupo.length === 5) {
      let v = 0
      for (const g of grupo) v = v * 85 + g
      salida.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255)
      vacia()
    }
  }
  if (grupo.length > 1) {
    const n = grupo.length
    while (grupo.length < 5) grupo.push(84)
    let v = 0
    for (const g of grupo) v = v * 85 + g
    const b = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]
    salida.push(...b.slice(0, n - 1))
  }
  return Buffer.from(salida)
}

export function revisarFlujosDePdf(buf: Buffer): RevisionDeFlujos {
  let desde = 0
  let flujos = 0
  let total = 0
  for (;;) {
    const p = buf.indexOf('stream', desde, 'latin1')
    if (p < 0) break
    desde = p + 6
    if (p >= 3 && buf.toString('latin1', p - 3, p) === 'end') continue // «endstream»
    let ini = p + 6
    if (buf[ini] === 0x0d) ini++
    if (buf[ini] === 0x0a) ini++
    else if (buf[p + 6] !== 0x0d) continue // «stream» debe ir seguido de fin de línea
    const fin = buf.indexOf('endstream', ini, 'latin1')
    if (fin < 0) break // archivo cortado: lo declara la biblioteca
    desde = fin + 9
    if (++flujos > TOPES.pdf_flujos_max) return { ok: false, estado: 'sobre_el_tope', motivo: `el PDF tiene más de ${TOPES.pdf_flujos_max} flujos` }
    const previo = buf.toString('latin1', Math.max(0, p - 4096), p)
    const o = previo.lastIndexOf('obj')
    const filtros = filtrosDe(o >= 0 ? previo.slice(o) : previo)
    if (filtros.length === 0) continue
    if (filtros.some((f) => NO_ADMITIDOS.has(f))) return { ok: false, estado: 'ilegible', motivo: 'filtro_no_admitido: el PDF usa compresión LZW o RunLength (puede expandirse sin control); no se lee' }
    let datos = buf.subarray(ini, fin)
    for (const f of filtros) {
      if (f === 'ASCIIHexDecode' || f === 'AHx') datos = deHex(datos)
      else if (f === 'ASCII85Decode' || f === 'A85') datos = de85(datos)
      else if (f === 'FlateDecode' || f === 'Fl') {
        const resto = TOPES.pdf_flujos_total_bytes - total
        if (resto <= 0) return { ok: false, estado: 'sobre_el_tope', motivo: `los flujos del PDF se inflarían a más de ${TOPES.pdf_flujos_total_bytes} bytes en total` }
        try {
          datos = inflateSync(datos, { maxOutputLength: Math.max(1, Math.min(TOPES.pdf_flujo_bytes, resto)) })
        } catch (e) {
          const codigo = (e as { code?: string }).code
          if (codigo === 'ERR_BUFFER_TOO_LARGE') {
            return { ok: false, estado: 'sobre_el_tope', motivo: resto < TOPES.pdf_flujo_bytes ? `los flujos del PDF se inflarían a más de ${TOPES.pdf_flujos_total_bytes} bytes en total` : `un flujo del PDF se infla a más de ${TOPES.pdf_flujo_bytes} bytes (bomba de compresión)` }
          }
          break // datos dañados o cortados: lo declara la biblioteca; no es una bomba
        }
        total += datos.length
        if (total > TOPES.pdf_flujos_total_bytes) return { ok: false, estado: 'sobre_el_tope', motivo: `los flujos del PDF se inflarían a más de ${TOPES.pdf_flujos_total_bytes} bytes en total` }
      } else break // otro filtro (imágenes, cifrado…): no se sigue la cadena
    }
  }
  return { ok: true, flujos, inflado_bytes: total }
}
