#!/usr/bin/env node
/**
 * 03-nov · SEÑAL LENOVO 14:49Z (ajuste de Emilio) · «solo poner pequeñas pausas que se quitan cuando yo hago las aprobaciones; por ahora solo la del manual».
 * El alta (`LyVoKcrypS5uLyuu`) NO pierde nodos: «E57 · sobre · pedir planeación a la sala» deja de POSTear el sobre a la sala y lo GUARDA en la espera del dueño
 * (`POST /api/esperas-del-dueno`, ruta de CC#1); el botón «Aprobar el manual» lo suelta una sola vez. Su GUARDA se queda (lanza si `ok !== true`, pasa con `duplicate`).
 *   node scripts/ops/alta-espera-del-manual.mjs <alta-entrada.json> <alta-salida.json>
 * Falla en voz alta si la forma esperada no está (otro cambió el alta): no adivina.
 */
import fs from 'node:fs'

export const SOBRE = 'E57 · sobre · pedir planeación a la sala'
export const RUTA_ESPERA = '/api/esperas-del-dueno'
const URL_ESPERA = "={{ $env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app' }}" + RUTA_ESPERA
const V = "$('Validate Deal Data').first().json"

export function guardarSobreEnEspera(alta) {
  const w = JSON.parse(JSON.stringify(alta))
  const n = w.nodes.find((x) => x.name === SOBRE)
  if (!n) throw new Error(`el alta no trae «${SOBRE}»`)
  const p = n.parameters
  if (!String(p.url).includes('/api/sala/intake')) throw new Error(`«${SOBRE}» ya no manda a la sala (¿ya está adaptado?): ${String(p.url).slice(0, 80)}`)
  if (!/^=\{/.test(String(p.jsonBody))) throw new Error('el cuerpo del sobre no tiene la forma esperada ("={ … }")')
  const cuerpoSala = String(p.jsonBody).slice(1) // el sobre EXACTO que hoy sale hacia la sala
  p.url = URL_ESPERA
  p.jsonBody = `={\n  "client_id": "{{ ${V}.client_id }}",\n  "tipo": "manual",\n  "journey_id": "{{ ${V}._journey_id }}",\n  "sobre": ${cuerpoSala}\n}`
  const h = p.headerParameters.parameters
  const key = h.find((x) => x.name === 'x-api-key')
  if (!key) throw new Error('el sobre no trae x-api-key')
  key.value = '={{ $env.INTERNAL_API_KEY }}'
  const src = h.find((x) => x.name === 'x-source')
  if (src) src.value = 'n8n-e57-alta-espera-del-manual'
  n.notes = String(n.notes ?? '') + '\n03-nov (señal 14:49Z): ya no pide el plan a la sala; GUARDA el sobre en la espera del dueño. El botón «Aprobar el manual» lo suelta.'
  return w
}

const esMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())
if (esMain) {
  const [, , entrada, salida] = process.argv
  if (!entrada || !salida) { console.error('uso: alta-espera-del-manual.mjs <entrada.json> <salida.json>'); process.exit(2) }
  const out = guardarSobreEnEspera(JSON.parse(fs.readFileSync(entrada, 'utf8')))
  fs.writeFileSync(salida, JSON.stringify(out))
  console.log(`listo · ${out.nodes.length} nodos · «${SOBRE}» guarda en ${RUTA_ESPERA}`)
}
