/**
 * 04-nov 18:4xZ · REPARACIÓN de un defecto que apliqué en vivo con la #891 (arreglos del plan aprobados): «Redactor (B4)» NO COMPILA.
 * Causa (medida en el vivo): el módulo de coherencia de CC#1 (`chequeos-de-coherencia.js`, P18/P20) declara `function _sinTildes(s)` y «Redactor (B4)» ya tenía una `const _sinTildes` propia (línea 45)
 * → `SyntaxError: Identifier '_sinTildes' has already been declared`. Los otros 3 nodos del módulo («¿Llegó la vuelta?», «JEF · plan · evaluar», «JEF · armar») compilan bien.
 * Reparación mínima: la función del MÓDULO se renombra `_cohSinTildes` (2 sitios: la declaración y su único uso). La `const` del redactor queda intacta. Mismo comportamiento, sin choque.
 * Hay que arreglarlo también en el origen (`chequeos-de-coherencia.js` de CC#1) para que ningún constructor lo reintroduzca.
 */
import { cambiarCodigo as cambiarCodigoLF, nodo } from './lib.mjs'

function cambiarCodigo(f, nombre, viejo, nuevo) {
  const CRLF = String.fromCharCode(13, 10), LF = String.fromCharCode(10)
  const crlf = nodo(f, nombre).parameters.jsCode.includes(CRLF)
  const a = (t) => (crlf ? t.split(CRLF).join(LF).split(LF).join(CRLF) : t)
  cambiarCodigoLF(f, nombre, a(viejo), a(nuevo))
}

export function construirArregloSintaxisRedactor(f) {
  cambiarCodigo(f, 'Redactor (B4)', "function _sinTildes(s) { return String(s || '')", "function _cohSinTildes(s) { return String(s || '')")
  cambiarCodigo(f, 'Redactor (B4)', 'return _DIAS.indexOf(_sinTildes(s).replace(', 'return _DIAS.indexOf(_cohSinTildes(s).replace(')
}
