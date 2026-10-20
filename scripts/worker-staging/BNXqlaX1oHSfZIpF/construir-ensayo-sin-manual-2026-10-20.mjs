// CC#1 · 20-oct · TRAMO 8 DEL ENSAYO DE PUNTA A PUNTA · el brief («parte por filas») en seco con un cliente SIN manual. SÍ de Lenovo 03:45 (RESPUESTA-LENOVO-a-CC1-CC3-CC2-tramo-8).
//   node construir-ensayo-sin-manual-2026-10-20.mjs        → escribe el ARREGLADO a partir del ANTES
//   import { construirFlujo } y pasarle el flujo           → lo que prueba __tests__/brief-ensayo-sin-manual.test.ts
// LINAJE: el ANTES de esta ronda es EXACTAMENTE el estado r80 del flujo (`cadena/copia-r80-ARREGLADO.json`, que `cadena/construir-ronda80-copia.mjs` construye): la prueba lo exige.
// Quien reconstruya la copia de la cadena debe pasar por AQUÍ después del r80, o la guarda ① vuelve a la de antes.
// Cambia TRES nodos:
//  · «① GUARDA»: SOLO `dry_run === true` (booleano exacto) y SOLO si el cliente no tiene NINGUNA fila de manual, sigue con un manual SIMULADO EN MEMORIA (id `ensayo-sin-manual`, texto rotulado,
//    sin palabras prohibidas ni terminología obligada, sin trato inventado). Nada se escribe en `client_brand_books` ni en ninguna tabla (el ensayo corta en «⑤ ¿Modo seco?»).
//    Real sin manual ⇒ BRIEF_SIN_MANUAL; manual que EXISTE y no pasó la vara ⇒ BRIEF_MANUAL_NO_APROBADO (también en ensayo).
//    🔴 REPARO 1 de CC#2: un ERROR de la base NO es «cero filas»: si el GET trae un objeto de error (sin `id`, con `code`/`message`/`error`) la guarda lanza BRIEF_LECTURA_MANUAL_FALLIDA en AMBOS modos.
//  · «④ Chequeos»: la `provenance_tag` lleva `manual_de_ensayo:true` SOLO cuando el manual es el simulado (en lo real la fila no cambia de forma).
//  · «⑤ Seco · lo que se habría escrito»: muestra `manual_de_ensayo` y `lectura_del_manual`, para que el ensayo diga que su manual fue simulado.
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const N1 = '① GUARDA · sin manual aprobado se DETIENE'
const N4 = '④ Chequeos'
const N5 = '⑤ Seco · lo que se habría escrito'
const CR = String.fromCharCode(13), LF = String.fromCharCode(10)

const unaVez = (s, viejo, nuevo, que) => {
  const n = s.split(viejo).length - 1
  if (n !== 1) throw new Error(`${que}: el ancla aparece ${n} veces (debe ser 1) · rehacer desde el vivo`)
  return s.replace(viejo, () => nuevo)
}
const enLF = (codigo) => ({ crlf: codigo.includes(CR + LF), s: codigo.split(CR + LF).join(LF) })
const devolver = (crlf, s) => (crlf ? s.split(LF).join(CR + LF) : s)

export function cambiarGuarda(codigo) {
  const { crlf, s: s0 } = enLF(codigo)
  if (s0.includes('ensayoSinManual')) throw new Error('«① GUARDA» ya trae el ensayo sin manual · no construir dos veces')
  let s = s0
  s = unaVez(s, `const filas = $input.all().map((i) => i.json).filter((r) => r && r.id)
if (filas.length === 0) {
  throw new Error('BRIEF_SIN_MANUAL · el cliente ' + env.client_id + ' no tiene manual de marca · se DETIENE y NO escribe nada')
}
const m = filas[0]
if (m.gate_outcome !== 'paso_la_vara') {`, `const items = $input.all().map((i) => i.json)
// 🔴 UN ERROR DE LA BASE NO ES «CERO FILAS» (reparo de CC#2 · lección «una guarda que filtra por id lee un error como vacío»): el GET de PostgREST que falla devuelve un objeto de error SIN \`id\`.
// Sin esta línea el filtro de abajo lo descartaría y, en ensayo, la guarda SIMULARÍA un manual aunque la consulta hubiera fallado: se esconde justo la falla que el ensayo debe mostrar. Se detiene en AMBOS modos.
const conError = items.filter((r) => r && typeof r === 'object' && !r.id && (r.error || r.code || r.message || r.hint))
if (conError.length) {
  throw new Error('BRIEF_LECTURA_MANUAL_FALLIDA · no se pudo leer el manual del cliente ' + env.client_id + ' · ' + JSON.stringify(conError[0]).slice(0, 200) + ' · se DETIENE y NO escribe nada (un error de la base no es «sin manual»)')
}
const filas = items.filter((r) => r && r.id)
// 🔴 EL ENSAYO SIN MANUAL (20-oct · tramo 8 del ensayo de punta a punta · SÍ de Lenovo) · SOLO \`dry_run === true\` exacto y SOLO si el cliente no tiene NINGUNA fila de manual: se sigue con un manual
// SIMULADO EN MEMORIA (nunca en la base; el ensayo corta en «⑤ ¿Modo seco?» y no guarda nada). Un manual que EXISTE y no pasó la vara sigue deteniendo, también en ensayo. Lo real sin manual sigue deteniendo.
const ensayoSinManual = env.dry_run === true && filas.length === 0
if (filas.length === 0 && !ensayoSinManual) {
  throw new Error('BRIEF_SIN_MANUAL · el cliente ' + env.client_id + ' no tiene manual de marca · se DETIENE y NO escribe nada')
}
const m = ensayoSinManual ? { id: 'ensayo-sin-manual', gate_outcome: 'ensayo_sin_manual', version: null, created_at: null, content_text: '(MANUAL SIMULADO DE ENSAYO: el cliente no tiene manual de marca; esto NO es un manual real)' } : filas[0]
if (m.gate_outcome !== 'paso_la_vara' && !ensayoSinManual) {`, 'guarda')
  s = unaVez(s, '    manual_id: m.id,', '    manual_de_ensayo: ensayoSinManual,' + LF + '    manual_id: m.id,', 'salida de la guarda')
  return devolver(crlf, s)
}

export function cambiarChequeos(codigo) {
  const { crlf, s: s0 } = enLF(codigo)
  if (s0.includes('manual_de_ensayo')) throw new Error('«④ Chequeos» ya trae manual_de_ensayo · no construir dos veces')
  const s = unaVez(s0, `    manual_id: c.manual_id,
    manual_version: c.manual_version,
    legible: ext.legible,`, `    manual_id: c.manual_id,
    manual_version: c.manual_version,
    ...(c.manual_de_ensayo === true ? { manual_de_ensayo: true } : {}), // solo el ensayo sin manual lo lleva · en lo real la fila no cambia de forma
    legible: ext.legible,`, 'provenance_tag')
  return devolver(crlf, s)
}

export function cambiarSeco(codigo) {
  const { crlf, s: s0 } = enLF(codigo)
  if (s0.includes('manual_de_ensayo')) throw new Error('«⑤ Seco» ya muestra manual_de_ensayo · no construir dos veces')
  const s = unaVez(s0, '    habria_guardado: { tabla:', "    manual_de_ensayo: !!(f.provenance_tag && f.provenance_tag.manual_de_ensayo === true), // true = el manual de este ensayo fue SIMULADO en memoria (el cliente no tiene manual)\n    habria_guardado: { tabla:", 'seco')
  return devolver(crlf, s)
}

export function construirFlujo(flujo) {
  const copia = JSON.parse(JSON.stringify(flujo))
  const nodo = (n) => { const x = copia.nodes.find((y) => y.name === n); if (!x) throw new Error('falta el nodo ' + n); return x }
  nodo(N1).parameters.jsCode = cambiarGuarda(nodo(N1).parameters.jsCode)
  nodo(N4).parameters.jsCode = cambiarChequeos(nodo(N4).parameters.jsCode)
  nodo(N5).parameters.jsCode = cambiarSeco(nodo(N5).parameters.jsCode)
  return copia
}

const aqui = dirname(fileURLToPath(import.meta.url))
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const w = JSON.parse(fs.readFileSync(join(aqui, 'parte-por-filas-ANTES-ensayo-sin-manual-2026-10-20.json'), 'utf8'))
  const salida = join(aqui, 'parte-por-filas-ARREGLADO-ensayo-sin-manual-2026-10-20.json')
  const nuevo = construirFlujo(w)
  fs.writeFileSync(salida, JSON.stringify(nuevo, null, 2))
  console.log('escrito', salida, '· nodos', nuevo.nodes.length)
}
