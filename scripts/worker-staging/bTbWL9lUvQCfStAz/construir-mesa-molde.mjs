// OFICINA · un turno · LA MESA EN SECO · CC#2 · 2026-10-28
// Hallazgo (primer ensayo seco de la mesa): el «modelo simulado» del modo seco no tenía molde para `opinion_libre.v1`, el esquema con el que habla la mesa ⇒ el director falló sus 3 intentos (OFICINA_SIN_MOLDE_SIMULADO).
// Arreglo (solo afecta al modo seco; en real el nodo no cambia): un bloque que habla como la mesa (director, especialistas, integración con citas A<n>) y que llama a `pedir_material` de verdad. Fuente legible: mesa-molde-seco.js.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const NODO = '② Armar el pedido'
const AQUI = path.dirname(fileURLToPath(import.meta.url))
const ANCLA = 'if (e.dry_run === true) {'

export function cambiarPedido(codigo) {
  if (codigo.includes('LA MESA EN SECO')) throw new Error('el nodo ya tiene el molde de la mesa')
  const nl = codigo.includes('\r\n') ? '\r\n' : '\n'
  const bloque = fs.readFileSync(path.join(AQUI, 'mesa-molde-seco.js'), 'utf8').replace(/\r?\n/g, nl)
  if (codigo.split(ANCLA).length !== 2) throw new Error('ancla: «' + ANCLA + '» debe aparecer una sola vez')
  return codigo.replace(ANCLA, () => bloque + ANCLA)
}

export function construirFlujo(flujo) {
  const copia = JSON.parse(JSON.stringify(flujo))
  const n = copia.nodes.find((x) => x.name === NODO)
  if (!n) throw new Error('no está el nodo ' + NODO)
  n.parameters.jsCode = cambiarPedido(n.parameters.jsCode)
  return copia
}
