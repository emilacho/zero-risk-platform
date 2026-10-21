// OFICINA · un turno · EL SEGUNDO CEREBRO DEL PRODUCTOR · CC#1 · 2026-10-21
// Hallazgo: la auto-revisión del productor usa un esquema nuevo (`autorevision.v1`). En modo seco el «modelo simulado» del turno responde con un MOLDE por esquema; sin molde el
// turno devuelve un error visible (OFICINA_SIN_MOLDE_SIMULADO) y el encargo en ensayo fallaría en cuanto hubiera una nota. Arreglo: un molde válido que dice «nada chocó» (la pieza sigue tal cual).
// Solo afecta al modo seco; en real el nodo no cambia. Parte de lo que quedó vivo en la ronda 78 (`turno-r78-ARREGLADO.json`).
// Uso:  node construir-segundo-cerebro-turno.mjs        (escribe turno-segundo-cerebro-ANTES.json y turno-segundo-cerebro-ARREGLADO.json junto a este archivo)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const NODO = '② Armar el pedido'
const ANCLA = "  'resolucion_laminas.v1': () => ({ respuestas: [] }),\r\n"
export const MOLDE = "  // segundo cerebro · la auto-revisión del productor: en seco «nada chocó» (la pieza sigue tal cual)\r\n  'autorevision.v1': () => ({ choca: false, hallazgos: [] }),\r\n"

export function cambiarPedido(codigo) {
  if (codigo.includes("'autorevision.v1'")) throw new Error('el nodo ya tiene el molde de la auto-revisión')
  const n = codigo.split(ANCLA).length - 1
  if (n !== 1) throw new Error('ancla: aparece ' + n + ' veces (debe ser 1)')
  return codigo.replace(ANCLA, () => ANCLA + MOLDE)
}

export function construirFlujo(flujo) {
  const copia = JSON.parse(JSON.stringify(flujo))
  const nodo = copia.nodes.find((x) => x.name === NODO)
  if (!nodo) throw new Error('no está el nodo ' + NODO)
  nodo.parameters.jsCode = cambiarPedido(nodo.parameters.jsCode)
  return copia
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const dir = path.dirname(fileURLToPath(import.meta.url))
  const base = fs.readFileSync(path.join(dir, 'turno-r78-ARREGLADO.json'), 'utf8')
  const crlf = base.includes('\r\n')
  const salida = (x) => { const t = JSON.stringify(x, null, 2); return crlf ? t.replace(/\n/g, '\r\n') : t }
  fs.writeFileSync(path.join(dir, 'turno-segundo-cerebro-ANTES.json'), base)
  fs.writeFileSync(path.join(dir, 'turno-segundo-cerebro-ARREGLADO.json'), salida(construirFlujo(JSON.parse(base))))
  console.log('escritos turno-segundo-cerebro-ANTES.json y turno-segundo-cerebro-ARREGLADO.json')
}
