/**
 * 05-nov · aplica `plan-informes-que-no-llegaron.mjs` sobre un RESPALDO FRESCO del flujo del plan:
 *   node aplicar-informes-que-no-llegaron.mjs <respaldo.json> <salida.json>
 * No toca la red: el respaldo se saca con `n8n-flujo.mjs respaldar` y la salida se publica con `n8n-flujo.mjs restaurar --ejecutar`.
 * Se detiene si el fragmento no aparece exactamente una vez, y compila el nodo antes de escribir.
 */
import fs from 'node:fs'
import { construirPlanInformesQueNoLlegaron } from './plan-informes-que-no-llegaron.mjs'

const [entrada, salida] = process.argv.slice(2)
if (!entrada || !salida) throw new Error('uso: node aplicar-informes-que-no-llegaron.mjs <respaldo.json> <salida.json>')
const leido = JSON.parse(fs.readFileSync(entrada, 'utf8'))
const f = leido.workflow || leido
construirPlanInformesQueNoLlegaron(f)
const codigo = f.nodes.find((n) => n.name === '¿Llegó la vuelta?').parameters.jsCode
new Function('$', '$input', '$execution', '$runIndex', '$workflow', '$json', '$now', 'require', codigo)
fs.writeFileSync(salida, JSON.stringify(leido, null, 2) + '\n')
console.log('ok →', salida)
