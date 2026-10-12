/**
 * Ronda 76 · el libro de Apify de las funciones de VIDEO (y de cualquier actor de pago por evento) cuadra con la cuenta.
 * Defecto medido el 12-oct: la llamada leía `usageTotalUsd` apenas terminaba la corrida y Apify todavía no había cerrado los eventos (transcripciones): Instagram 10 videos, libro 0,17 contra 0,557 cobrado.
 * Arreglo: después de identificar la corrida se RELEE hasta que el importe deje de cambiar (dos lecturas iguales, separadas por una pausa y ≥ 45 s después de terminar); si no se estabiliza,
 * la fila va SIN importe y con el motivo (nunca un importe parcial como si fuera cierto) y la reconciliación del día (resto = cuenta − lo anotado, CC#2 ronda 73) la cubre ENTERA.
 * Solo cambia el nodo «Armar la fila de la libreta» del Servicio de Apify: se parte del flujo con las fuentes públicas (ARREGLADO-fuentes) y se sustituye el módulo del importe real.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const DIR = path.join(AQUI, '3lyknrP3PoS2KzUf')
export const NODO = 'Armar la fila de la libreta'
const INI = '// ═══ IMPORTE REAL DE LA CORRIDA'
const FIN = '// ═══ fin importe real ═══'
export const MODULO_R76 = fs.readFileSync(path.join(DIR, 'importe-real-de-la-corrida-r76.js'), 'utf8').split('\r\n').join('\n').trim()

export function conImporteEstable(flujo) {
  const f = JSON.parse(JSON.stringify(flujo))
  const n = f.nodes.filter((x) => x.name === NODO)
  if (n.length !== 1) throw new Error(`${n.length} nodos «${NODO}»`)
  const codigo = String(n[0].parameters.jsCode).split('\r\n').join('\n')
  const a = codigo.indexOf(INI)
  const b = codigo.indexOf(FIN)
  if (a < 0 || b < a || codigo.indexOf(INI, a + 1) >= 0) throw new Error('el módulo del importe no está una sola vez')
  n[0].parameters.jsCode = codigo.slice(0, a) + MODULO_R76 + codigo.slice(b + FIN.length)
  return f
}

if (process.argv[1] && process.argv[1].endsWith('construir-importe-r76.mjs')) {
  const antes = JSON.parse(fs.readFileSync(path.join(DIR, 'servicio-apify-ARREGLADO-fuentes-2026-10-12.json'), 'utf8'))
  fs.writeFileSync(path.join(DIR, 'servicio-apify-ARREGLADO-importe-r76-2026-10-12.json'), JSON.stringify(conImporteEstable(antes), null, 2))
  console.log('ok')
}
