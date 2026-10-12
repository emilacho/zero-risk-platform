// PIEZA · ronda 75 · H1 · el bloque «E) LA VOZ» usa el REGISTRO ya resuelto del cliente (manual > ficha > país) y, sin dato, lo declara; fuera «El español es de Ecuador: TUTEA siempre» · CC#2 · 2026-10-12
// Parte del flujo VIVO `lVCLzxQCKNkd3uS0`. Dos nodos cambian y nada más: «⑤ Armar el cuerpo del productor» (la llamada recibe `trato`) y los dos que pegan la lógica de sedes y voz (la función nueva).
// La función nueva sale de `src/lib/sedes/sedes-logica.js` (la MISMA que prueban los tests): este constructor la copia de ahí.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
export const NODOS_CON_LA_FUNCION = ['⑤ Armar el cuerpo del productor', '⑦ Chequeos']
export const NODO_DEL_CUERPO = '⑤ Armar el cuerpo del productor'
const LOGICA = readFileSync(join(aqui, '..', '..', '..', 'src', 'lib', 'sedes', 'sedes-logica.js'), 'utf8').split('\r\n').join('\n')

const IN_ANTES = '/** El bloque de voz del pedido · si no hay textos propios se DECLARA */\nfunction bloqueDeVoz(textos) {'
const IN_NUEVA = '/** r75 · H1 · la línea del REGISTRO del cliente'
/** de un marcador al cierre de su función (la primera `}` en columna 0 después de él) */
const bloque = (s, ini) => { const i = s.indexOf(ini); if (i < 0) return null; const j = s.indexOf('\n}\n', s.indexOf('function bloqueDeVoz', i)); return j < 0 ? null : { i, j: j + 3 } }

export const FUNCION_NUEVA = (() => { const b = bloque(LOGICA, IN_NUEVA); if (!b) throw new Error('no se encontró la función nueva en sedes-logica.js'); return LOGICA.slice(b.i, b.j) })()

export function cambiarFuncion(codigo, quien) {
  const crlf = codigo.includes('\r\n'); const s = codigo.split('\r\n').join('\n')
  if (s.includes('function lineaDeRegistro')) throw new Error(quien + ' ya tiene la función de la ronda 75')
  const b = bloque(s, IN_ANTES)
  if (!b) throw new Error(quien + ': no se encontró la función `bloqueDeVoz` de antes')
  const r = s.slice(0, b.i) + FUNCION_NUEVA + s.slice(b.j)
  return crlf ? r.split('\n').join('\r\n') : r
}
export function cambiarLlamada(codigo) {
  const crlf = codigo.includes('\r\n'); const s = codigo.split('\r\n').join('\n')
  const a = '  bloqueDeVoz(textosDeVoz),'
  if (s.split(a).length !== 2) throw new Error(NODO_DEL_CUERPO + ': la llamada a bloqueDeVoz aparece ' + (s.split(a).length - 1) + ' veces (debe ser 1)')
  const r = s.replace(a, () => '  bloqueDeVoz(textosDeVoz, trato),')
  return crlf ? r.split('\n').join('\r\n') : r
}
export function construirFlujo(flujo) {
  const copia = JSON.parse(JSON.stringify(flujo))
  for (const n of NODOS_CON_LA_FUNCION) {
    const x = copia.nodes.find((y) => y.name === n); if (!x) throw new Error('no está el nodo ' + n)
    x.parameters.jsCode = cambiarFuncion(x.parameters.jsCode, n)
    if (n === NODO_DEL_CUERPO) x.parameters.jsCode = cambiarLlamada(x.parameters.jsCode)
  }
  return copia
}
