/**
 * 04-nov · punto 2 de la revisión de CC#3 (#903) · EL PLAN CONTRA EL ACTA DE LA MESA (P21), pegado en los nodos de los chequeos. Lo escribe CC#1 (`plan-contra-el-acta.js`, JS plano); aquí solo se pega.
 *   · Mismo módulo en los 3 nodos que ya llevan los chequeos de coherencia: «Redactor (B4)», «¿Llegó la vuelta?», «JEF · plan · evaluar» (se pega antes de `revisarPlan`, y la marca P21 va tras la P20).
 *   · «Redactor (B4)»: `contexto_chequeo` lleva el `acta` (la que la mesa de estrategia cerró; `ACT` del módulo de la mesa). Los otros dos nodos leen ese mismo contexto, así que no hace falta más cableado.
 *   · Sin acta (mesa apagada, o plan que no pasó por la mesa) `_planContraElActa` calla: el chequeo no existe y el plan es el de hoy. Marca, nunca bloquea: la comprueba el jefe.
 * Va DESPUÉS de `plan-mesa-de-estrategia.mjs` (define `ACT`); si `ACT` no existe en el nodo, el contexto no lleva acta y nada cambia.
 */
import fs from 'node:fs'
import { cambiarCodigo as cambiarCodigoLF, nodo } from './lib.mjs'

/** como `cambiarCodigo`, pero respeta los saltos de línea del nodo (algunos del vivo vienen con CRLF) */
function cambiarCodigo(f, nombre, viejo, nuevo) {
  const CRLF = String.fromCharCode(13, 10), LF = String.fromCharCode(10)
  const crlf = nodo(f, nombre).parameters.jsCode.includes(CRLF)
  const a = (t) => (crlf ? t.split(CRLF).join(LF).split(LF).join(CRLF) : t)
  cambiarCodigoLF(f, nombre, a(viejo), a(nuevo))
}

export const MODULO_ACTA = fs.readFileSync(new URL('./plan-contra-el-acta.js', import.meta.url), 'utf8').split('\r\n').join('\n').trimEnd() + '\n\n'
export const NODOS_DEL_ACTA = ['Redactor (B4)', '¿Llegó la vuelta?', 'JEF · plan · evaluar']

const MARCA_P20 = "  if (_hor.length) marcas.push({ codigo: 'P20', que: 'lo que dice de los horarios no coincide con los días que abre el negocio', ejemplos: _hor.slice(0, 4) })\n"
const MARCA_P21 = "  var _acta = _planContraElActa(t, ctx)\n  if (_acta.length) marcas.push({ codigo: 'P21', que: 'el plan se aparta de lo que acordó la mesa de estrategia', ejemplos: _acta.slice(0, 6) })\n"

export function construirPlanContraElActa(f) {
  for (const n of NODOS_DEL_ACTA) {
    cambiarCodigo(f, n, 'function revisarPlan(texto, ctx) {', MODULO_ACTA + 'function revisarPlan(texto, ctx) {')
    cambiarCodigo(f, n, MARCA_P20, MARCA_P20 + MARCA_P21)
  }
  cambiarCodigo(f, 'Redactor (B4)', 'manual_limites: limitesDelManual(manual) }, FIN ?',
    "manual_limites: limitesDelManual(manual) }, (typeof ACT !== 'undefined' && ACT ? { acta: ACT } : {}), FIN ?")
}
