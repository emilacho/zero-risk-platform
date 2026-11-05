// CC#1 · 20-oct · LA VARA DE LOS JUECES DEL MANUAL · un manual sin contenido propio del cliente NO pasa la vara (encargo de Lenovo «limpiar y arreglar» · parte 2).
//   node construir-piso-de-contenido-2026-10-20.mjs        → ANTES (respaldo del vivo) → ARREGLADO
//   import { construirFlujo } y pasarle el flujo           → lo que prueba __tests__/cimiento-piso-de-contenido.test.ts
// Cambia DOS nodos del Cimiento (`ssLtwYPt7zxuvnM2`), y NADA se aplica en vivo hasta que otro empleado certifique:
//  · «[BB] Promote prep»: calcula `piso = pisoDeContenidoPropio(draft)`; la vara que se persiste es `fidelidad ∧ piso`. Fiel y hueco ⇒ `gate_outcome:'sin_contenido_propio'` (marcado, no pasa), firma `piso_de_contenido`,
//    `fidelity_passed:false` (el canon es por vara completa) y el piso queda registrado dentro del manual (`piso_contenido`).
//  · «Return scores a parent»: `track_pass`/`track_marked`/`track_reason` dicen lo mismo al padre (`sin_contenido_propio`); `track_published` no cambia (el manual SALE siempre, marcado).
// Quien lee `gate_outcome` para parar (la planeación y el brief exigen `paso_la_vara`) ya se detiene solo: no hay que tocarlos.
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const N_PROMOTE = '[BB] Promote prep'
export const N_RETORNO = 'Return scores a parent (grade-cimiento gate)'
const aqui = dirname(fileURLToPath(import.meta.url))
const CR = String.fromCharCode(13), LF = String.fromCharCode(10)
export const BLOQUE = fs.readFileSync(join(aqui, 'bloque-piso-de-contenido-2026-10-20.js'), 'utf8').split(CR + LF).join(LF).trim()

const unaVez = (s, viejo, nuevo, que) => {
  const n = s.split(viejo).length - 1
  if (n !== 1) throw new Error(`${que}: el ancla aparece ${n} veces (debe ser 1) · rehacer desde el vivo`)
  return s.replace(viejo, () => nuevo)
}
const enLF = (c) => ({ crlf: c.includes(CR + LF), s: c.split(CR + LF).join(LF) })
const devolver = (crlf, s) => (crlf ? s.split(LF).join(CR + LF) : s)

export function cambiarPromote(codigo) {
  const { crlf, s: s0 } = enLF(codigo)
  if (s0.includes('pisoDeContenidoPropio')) throw new Error('«Promote prep» ya trae el piso de contenido · no construir dos veces')
  let s = unaVez(s0, `const draft = ($json && $json.brand_book_draft) || {};
`, `const draft = ($json && $json.brand_book_draft) || {};
// 🔴 EL PISO DE CONTENIDO PROPIO (20-oct · prueba real): el juez califica si lo escrito está SOPORTADO, no si HAY contenido. Un manual casi vacío es perfectamente fiel y pasaba la vara.
// La vara que se persiste es fidelidad Y piso. Fiel y hueco ⇒ sale MARCADO como \`sin_contenido_propio\` (no \`paso_la_vara\`): la planeación y el brief exigen \`paso_la_vara\` y se detienen solos.
${BLOQUE}
const piso = pisoDeContenidoPropio(draft);
const pasa_todo = !!fidelity.pass && piso.ok;
`, 'draft')
  s = unaVez(s, `    provisional: !!$('Validate Deal Data').first().json._sin_web,
`, `    provisional: !!$('Validate Deal Data').first().json._sin_web,
    piso_contenido: piso,   // el piso queda REGISTRADO dentro del manual: qué se midió y por qué pasó o no
`, 'registro del piso')
  s = unaVez(s, `  fidelity_passed: !!fidelity.pass,
`, `  fidelity_passed: pasa_todo,   // el canon es por la vara COMPLETA (fidelidad Y piso de contenido)
`, 'fidelity_passed')
  s = unaVez(s, `  gate_outcome: fidelity.pass ? 'paso_la_vara' : 'salio_al_tope',
  gate_nota: fidelity.pass ? null : 'salió al tope, no alcanzó la vara',
`, `  gate_outcome: pasa_todo ? 'paso_la_vara' : (fidelity.pass ? 'sin_contenido_propio' : 'salio_al_tope'),
  gate_nota: pasa_todo ? null : (fidelity.pass ? 'fiel pero SIN contenido propio del cliente: ' + piso.motivos.join(' · ') : 'salió al tope, no alcanzó la vara'),
`, 'gate_outcome del cuerpo')
  s = unaVez(s, `  approved_by: (fidelity.pass ? 'faithfulness_check' : 'cap_agotado'),
`, `  approved_by: (pasa_todo ? 'faithfulness_check' : (fidelity.pass ? 'piso_de_contenido' : 'cap_agotado')),
`, 'approved_by')
  s = unaVez(s, `  gate_outcome: fidelity.pass ? 'paso_la_vara' : 'salio_al_tope',
  fidelity,
} }];`, `  gate_outcome: pasa_todo ? 'paso_la_vara' : (fidelity.pass ? 'sin_contenido_propio' : 'salio_al_tope'),
  piso_contenido: piso,
  fidelity,
} }];`, 'salida')
  return devolver(crlf, s)
}

export function cambiarRetorno(codigo) {
  const { crlf, s: s0 } = enLF(codigo)
  if (s0.includes('pisoDeContenidoPropio')) throw new Error('«Return scores» ya trae el piso de contenido · no construir dos veces')
  let s = unaVez(s0, `const draft = fj.brand_book_draft || (fj.promote_body && fj.promote_body.brand_book) || {};
`, `const draft = fj.brand_book_draft || (fj.promote_body && fj.promote_body.brand_book) || {};
// 🔴 EL PISO DE CONTENIDO PROPIO (20-oct): \`track_pass\` es la vara COMPLETA (fidelidad Y piso), el mismo veredicto que dejó escrito «[BB] Promote prep».
${BLOQUE}
const piso = pisoDeContenidoPropio(fj.best_draft || draft);
const pasa_todo = !!fid.pass && piso.ok;
`, 'cabecera')
  s = unaVez(s, `  track_pass: !!fid.pass,          // ¿alcanzó la vara? · sigue siendo el dato honesto
`, `  track_pass: pasa_todo,           // ¿alcanzó la vara COMPLETA (fidelidad Y contenido propio)? · sigue siendo el dato honesto
`, 'track_pass')
  s = unaVez(s, `  track_marked: !fid.pass,         // salió, pero no alcanzó · Emilio ve la marca
`, `  track_marked: !pasa_todo,        // salió, pero no alcanzó · Emilio ve la marca
`, 'track_marked')
  s = unaVez(s, `              : (fid.pass ? 'pass'
`, `              : (fid.pass ? (piso.ok ? 'pass' : 'sin_contenido_propio')
`, 'track_reason')
  s = unaVez(s, `  lazo_a: (fid._lazo || null),
`, `  lazo_a: (fid._lazo || null),
  piso_contenido: piso,
`, 'registro del piso')
  return devolver(crlf, s)
}

export function construirFlujo(flujo) {
  const copia = JSON.parse(JSON.stringify(flujo))
  const nodo = (n) => { const x = copia.nodes.find((y) => y.name === n); if (!x) throw new Error('falta el nodo ' + n); return x }
  nodo(N_PROMOTE).parameters.jsCode = cambiarPromote(nodo(N_PROMOTE).parameters.jsCode)
  nodo(N_RETORNO).parameters.jsCode = cambiarRetorno(nodo(N_RETORNO).parameters.jsCode)
  return copia
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const w = JSON.parse(fs.readFileSync(join(aqui, 'ssLtwYPt7zxuvnM2-ANTES-piso-de-contenido-2026-10-20.json'), 'utf8'))
  const salida = join(aqui, 'ssLtwYPt7zxuvnM2-ARREGLADO-piso-de-contenido-2026-10-20.json')
  const nuevo = construirFlujo(w)
  fs.writeFileSync(salida, JSON.stringify(nuevo, null, 2))
  console.log('escrito', salida, '· nodos', nuevo.nodes.length)
}
