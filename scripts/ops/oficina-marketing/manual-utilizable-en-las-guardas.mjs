/**
 * TRABA DE PIEZAS · arreglo 1 (GO Lenovo 2026-11-10 18:14Z · responde a CC7 «foto del calendario de Náufrago» punto 6) · CC1.
 * Causa: las guardas del brief, de la parte por filas y del productor de la pieza solo aceptaban `gate_outcome = paso_la_vara`. El manual v5 de Náufrago
 * (`salio_al_tope`, validado por el dueño) mató los lotes de las semanas 46/47 con BRIEF_MANUAL_NO_APROBADO, mientras la planeación (regla del 04-nov) lo aceptaba.
 * Arreglo: UNA sola regla, `src/lib/manual/manual-utilizable-logica.js`, pegada ENTERA en las 4 guardas (planeación incluida, que tenía su propia copia).
 * La prueba `manual-utilizable-guardas.test.ts` exige que el bloque pegado sea idéntico al archivo y ejecuta cada guarda con filas reales.
 *   node scripts/ops/oficina-marketing/manual-utilizable-en-las-guardas.mjs   · lee vivo/<id>.json, escribe nuevo/<id>.json (SIN red)
 */
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { cambiarCodigo, escribirNuevo, leerVivo, nodo } from './lib.mjs'

const ORIGEN = fileURLToPath(new URL('../../../src/lib/manual/manual-utilizable-logica.js', import.meta.url))
const INICIO = '// ═══ MANUAL UTILIZABLE'
const FIN = '// ═══ fin manual utilizable ═══'

/** el bloque tal cual está en el archivo de la plataforma (de la marca de inicio a la de fin, ambas incluidas) */
export function bloqueDeLaRegla() {
  const t = fs.readFileSync(ORIGEN, 'utf8').replace(/\r\n/g, '\n')
  const i = t.indexOf(INICIO), j = t.indexOf(FIN)
  if (i !== 0 || j < 0) throw new Error('manual-utilizable-logica.js no tiene sus marcas de inicio y fin')
  return t.slice(i, j + FIN.length)
}

/** el bloque pegado dentro de un código de n8n, o null */
export function bloquePegado(js) {
  const i = js.indexOf(INICIO), j = js.indexOf(FIN)
  return i < 0 || j < 0 ? null : js.slice(i, j + FIN.length)
}

export const GUARDAS = {
  BNXqlaX1oHSfZIpF: { lectura: '① Cargar manual vigente', guarda: '① GUARDA · sin manual aprobado se DETIENE' },
  PQdIgbuFexuBsoh8: { lectura: '① Cargar manual vigente', guarda: '① GUARDA · sin manual aprobado se DETIENE' },
  lVCLzxQCKNkd3uS0: { lectura: '② Cargar el manual vigente', guarda: '② GUARDA · sin manual aprobado se DETIENE' },
  X9F0zp6LQ2xGEYVS: { lectura: '① Cargar el manual de marca', guarda: '① GUARDA · sin manual aprobado se DETIENE' },
}

/** la lectura del manual trae las dos columnas que la regla mira (planeación ya las traía) */
function lecturaConValidacion(f, nombre) {
  const n = nodo(f, nombre)
  const url = n.parameters.url
  if (typeof url !== 'string' || url.split('select=id,client_id,').length !== 2) throw new Error(`«${nombre}»: la consulta no tiene la forma esperada`)
  const faltan = ['human_validated', 'provenance_tag'].filter((c) => !new RegExp(`[=,]${c}[,&]`).test(url))
  if (faltan.length) n.parameters.url = url.replace('select=id,client_id,', `select=id,client_id,${faltan.join(',')},`)
}

const NO_APROBADO_VIEJO = {
  BNXqlaX1oHSfZIpF: ["if (m.gate_outcome !== 'paso_la_vara' && !ensayoSinManual) {", "const _uso = manualUtilizable(m)\nif (!_uso.utilizable && !ensayoSinManual) {"],
  PQdIgbuFexuBsoh8: ["if (m.gate_outcome !== 'paso_la_vara') {", "const _uso = manualUtilizable(m)\nif (!_uso.utilizable) {"],
  lVCLzxQCKNkd3uS0: ["if (m.gate_outcome !== 'paso_la_vara') {", "const _uso = manualUtilizable(m)\nif (!_uso.utilizable) {"],
}
const MENSAJE = ["' con gate_outcome=' + JSON.stringify(m.gate_outcome) + ' · se DETIENE", "' · ' + _uso.motivo + ' · se DETIENE"]

export function construirManualUtilizable(f) {
  const g = GUARDAS[f.id]
  if (!g) throw new Error(`flujo ${f.id} sin guarda conocida`)
  lecturaConValidacion(f, g.lectura)
  const n = nodo(f, g.guarda)
  if (bloquePegado(n.parameters.jsCode)) throw new Error(`«${g.guarda}» ya tiene la regla pegada`)
  if (f.id === 'X9F0zp6LQ2xGEYVS') {
    cambiarCodigo(f, g.guarda,
      "const _pt = (function () { try { return typeof m.provenance_tag === 'string' ? JSON.parse(m.provenance_tag) : (m.provenance_tag || {}); } catch (e) { return {}; } })();\nconst aprobado = m.gate_outcome === 'paso_la_vara' || (m.human_validated === true && _pt.validado_por !== 'jefatura');",
      '// 10-nov · la regla es la ÚNICA de la plataforma (manual-utilizable-logica.js, pegada arriba): pasó la vara O lo validó el dueño\nconst aprobado = manualUtilizable(m).utilizable;')
  } else {
    cambiarCodigo(f, g.guarda, ...NO_APROBADO_VIEJO[f.id])
    cambiarCodigo(f, g.guarda, ...MENSAJE)
    // quién lo aprobó viaja con el manual (evidencia en la corrida)
    cambiarCodigo(f, g.guarda, '    manual_version: m.version,', "    manual_version: m.version,\n    manual_aprobado_por: _uso.por,")
  }
  n.parameters.jsCode = bloqueDeLaRegla() + '\n' + n.parameters.jsCode
  return f
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const id of Object.keys(GUARDAS)) {
    const f = construirManualUtilizable(leerVivo(id))
    console.log('escrito', escribirNuevo(f))
  }
}
