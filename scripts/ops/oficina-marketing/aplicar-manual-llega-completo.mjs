/**
 * 04-nov · aplica `manual-llega-completo.mjs` sobre un RESPALDO FRESCO del flujo vivo (no sobre `vivo/`, que puede ir atrás del vivo):
 *   node aplicar-manual-llega-completo.mjs <manual|pedir|trabajo-manual|trabajo-alta> <respaldo.json> <salida.json>
 * No toca la red: el respaldo se saca con `n8n-flujo.mjs respaldar` y la salida se publica con `n8n-flujo.mjs restaurar --ejecutar`.
 */
import fs from 'node:fs'
import { construirManualCompleto, construirPedirCambiosCompleto } from './manual-llega-completo.mjs'
import { construirTrabajoDeCadaLlamadaManual } from './trabajo-de-cada-llamada-manual.mjs'
import { construirTrabajoDeCadaLlamadaAlta } from './trabajo-de-cada-llamada-alta.mjs'

const [cual, entrada, salida] = process.argv.slice(2)
if (!['manual', 'pedir', 'trabajo-manual', 'trabajo-alta'].includes(cual) || !entrada || !salida) { console.error('uso: <manual|pedir> <respaldo.json> <salida.json>'); process.exit(1) }
const f = JSON.parse(fs.readFileSync(entrada, 'utf8'))
if (cual === 'manual') construirManualCompleto(f); else if (cual === 'trabajo-alta') construirTrabajoDeCadaLlamadaAlta(f); else if (cual === 'trabajo-manual') construirTrabajoDeCadaLlamadaManual(f); else construirPedirCambiosCompleto(f)
fs.writeFileSync(salida, JSON.stringify(f, null, 2) + '\n')
console.log('ok →', salida)
