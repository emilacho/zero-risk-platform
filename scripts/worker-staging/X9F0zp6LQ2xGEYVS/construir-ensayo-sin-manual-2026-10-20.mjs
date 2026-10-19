// CC#1 · 20-oct · TRAMO 5 DEL ENSAYO DE PUNTA A PUNTA · la planeación en seco con un cliente SIN manual (el cimiento seco no promueve manual).
//   node construir-ensayo-sin-manual-2026-10-20.mjs
// Parte del ARREGLADO vigente (planeacion-ARREGLADO-icp-2026-10-19.json = vivo) y cambia UN solo nodo: «① GUARDA · sin manual aprobado se DETIENE».
// Regla: SOLO `dry_run === true` (booleano exacto) y SOLO cuando el cliente no tiene NINGUNA fila de manual: la guarda sigue con un manual SIMULADO EN MEMORIA
// (id `ensayo-sin-manual`, `manual_aprobado:false`, `manual_de_ensayo:true`). Nada se escribe en la base (el ensayo corta en «⑤ ¿Modo seco?»).
// Todo lo demás se queda igual: real sin manual ⇒ PLANEACION_SIN_MANUAL; ensayo CON manual no aprobado ⇒ PLANEACION_MANUAL_NO_APROBADO; dry_run no booleano ⇒ PLANEACION_DRY_RUN_INVALIDO.
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
const ENTRADA = join(aqui, 'planeacion-ARREGLADO-icp-2026-10-19.json')
const SALIDA = join(aqui, 'planeacion-ARREGLADO-ensayo-sin-manual-2026-10-20.json')
const w = JSON.parse(fs.readFileSync(ENTRADA, 'utf8'))
const n = w.nodes.find((x) => x.name === '① GUARDA · sin manual aprobado se DETIENE')
// el vivo guarda este nodo con CRLF: se trabaja en LF y se devuelve con los saltos que tenía
const CR = String.fromCharCode(13), LF = String.fromCharCode(10)
const CRLF = n.parameters.jsCode.includes(CR + LF)
let js = n.parameters.jsCode.split(CR + LF).join(LF)

const A = `if (filas.length === 0) {
  throw new Error('PLANEACION_SIN_MANUAL · el cliente ' + cid + ' no tiene manual de marca · la corrida se detiene y NO escribe nada (regla 1)');
}
const m = filas[0];
// 'aprobado' = paso la vara. La marca del veredicto vive en gate_outcome.
const aprobado = m.gate_outcome === 'paso_la_vara';
if (!aprobado) {`
const B = `// 🔴 EL ENSAYO SIN MANUAL (20-oct · tramo 5 del ensayo de punta a punta) · SOLO \`dry_run === true\` exacto y SOLO si el cliente no tiene NINGUNA fila de manual: se sigue con un manual SIMULADO EN MEMORIA
// (nunca en la base; el ensayo corta en «⑤ ¿Modo seco?» y no guarda nada). Un manual que EXISTE y no pasó la vara sigue deteniendo, también en ensayo. Lo real sin manual sigue deteniendo.
const ensayoSinManual = dryDelSobre === true && filas.length === 0;
if (filas.length === 0 && !ensayoSinManual) {
  throw new Error('PLANEACION_SIN_MANUAL · el cliente ' + cid + ' no tiene manual de marca · la corrida se detiene y NO escribe nada (regla 1)');
}
const m = ensayoSinManual ? { id: 'ensayo-sin-manual', gate_outcome: 'ensayo_sin_manual' } : filas[0];
// 'aprobado' = paso la vara. La marca del veredicto vive en gate_outcome.
const aprobado = m.gate_outcome === 'paso_la_vara';
if (!aprobado && !ensayoSinManual) {`
if (!js.includes(A)) throw new Error('el texto de la guarda cambió: no se aplica a ciegas')
js = js.replace(A, B)

const C = "manual_aprobado: true, registro_del_manual"
if (!js.includes(C)) throw new Error('no encuentro la salida de la guarda')
js = js.replace(C, "manual_aprobado: !ensayoSinManual, manual_de_ensayo: ensayoSinManual, registro_del_manual")
n.parameters.jsCode = CRLF ? js.split(LF).join(CR + LF) : js
fs.writeFileSync(SALIDA, JSON.stringify(w, null, 2))
console.log('escrito', SALIDA, '· nodos', w.nodes.length)
