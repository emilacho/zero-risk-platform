// CC#1 · 20-oct · TRAMO 8 DEL ENSAYO DE PUNTA A PUNTA · el brief («parte por filas») en seco con un cliente SIN manual. SÍ de Lenovo 03:45 (RESPUESTA-LENOVO-a-CC1-CC3-CC2-tramo-8).
//   node construir-ensayo-sin-manual-2026-10-20.mjs
// Parte del respaldo del vivo (parte-por-filas-ANTES-ensayo-sin-manual-2026-10-20.json) y cambia UN solo nodo: «① GUARDA · sin manual aprobado se DETIENE».
// Misma regla que la planeación (#655): SOLO `dry_run === true` (booleano exacto) y SOLO si el cliente no tiene NINGUNA fila de manual, la guarda sigue con un manual SIMULADO EN MEMORIA
// (id `ensayo-sin-manual`, texto rotulado, sin palabras prohibidas ni terminología obligada). Nada se escribe en `client_brand_books` ni en ninguna tabla (el ensayo corta en «⑤ ¿Modo seco?»).
// Real sin manual ⇒ BRIEF_SIN_MANUAL; manual que EXISTE y no pasó la vara ⇒ BRIEF_MANUAL_NO_APROBADO (también en ensayo); el `dry_run` no booleano ya lo detiene el nodo ⓪.
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
const ENTRADA = join(aqui, 'parte-por-filas-ANTES-ensayo-sin-manual-2026-10-20.json')
const SALIDA = join(aqui, 'parte-por-filas-ARREGLADO-ensayo-sin-manual-2026-10-20.json')
const w = JSON.parse(fs.readFileSync(ENTRADA, 'utf8'))
const n = w.nodes.find((x) => x.name === '① GUARDA · sin manual aprobado se DETIENE')
// el nodo puede venir con CRLF: se trabaja en LF y se devuelve con los saltos que tenía
const CR = String.fromCharCode(13), LF = String.fromCharCode(10)
const CRLF = n.parameters.jsCode.includes(CR + LF)
let js = n.parameters.jsCode.split(CR + LF).join(LF)

const A = `if (filas.length === 0) {
  throw new Error('BRIEF_SIN_MANUAL · el cliente ' + env.client_id + ' no tiene manual de marca · se DETIENE y NO escribe nada')
}
const m = filas[0]
if (m.gate_outcome !== 'paso_la_vara') {`
const B = `// 🔴 EL ENSAYO SIN MANUAL (20-oct · tramo 8 del ensayo de punta a punta · SÍ de Lenovo) · SOLO \`dry_run === true\` exacto y SOLO si el cliente no tiene NINGUNA fila de manual: se sigue con un manual
// SIMULADO EN MEMORIA (nunca en la base; el ensayo corta en «⑤ ¿Modo seco?» y no guarda nada). Un manual que EXISTE y no pasó la vara sigue deteniendo, también en ensayo. Lo real sin manual sigue deteniendo.
const ensayoSinManual = env.dry_run === true && filas.length === 0
if (filas.length === 0 && !ensayoSinManual) {
  throw new Error('BRIEF_SIN_MANUAL · el cliente ' + env.client_id + ' no tiene manual de marca · se DETIENE y NO escribe nada')
}
const m = ensayoSinManual ? { id: 'ensayo-sin-manual', gate_outcome: 'ensayo_sin_manual', version: null, created_at: null, content_text: '(MANUAL SIMULADO DE ENSAYO: el cliente no tiene manual de marca; esto NO es un manual real)' } : filas[0]
if (m.gate_outcome !== 'paso_la_vara' && !ensayoSinManual) {`
if (!js.includes(A)) throw new Error('el texto de la guarda cambió: no se aplica a ciegas')
js = js.replace(A, B)

const C = '    manual_id: m.id,'
if (!js.includes(C)) throw new Error('no encuentro la salida de la guarda')
js = js.replace(C, '    manual_de_ensayo: ensayoSinManual,' + LF + C)
n.parameters.jsCode = CRLF ? js.split(LF).join(CR + LF) : js
fs.writeFileSync(SALIDA, JSON.stringify(w, null, 2))
console.log('escrito', SALIDA, '· nodos', w.nodes.length)
