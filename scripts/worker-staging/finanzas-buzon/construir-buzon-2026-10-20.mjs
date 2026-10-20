#!/usr/bin/env node
/**
 * EL BUZÓN PREGUNTA Y RECOGE (CC#2 · 2026-10-20 · parte 5 · decisión de Lenovo: la respuesta del dueño alimenta el CEREBRO y el SIGUIENTE plan; NO dispara una ronda 2).
 * Dos piezas de n8n (la plataforma ya sabe preguntar, recoger y listar; faltaban los cables):
 *   node construir-buzon-2026-10-20.mjs planeacion <entrada.json> <salida.json>   · agrega a la planeación UN nodo lateral `FIN · preguntar al dueño` tras `FIN · cerrar la oficina`
 *   node construir-buzon-2026-10-20.mjs vigia <salida.json>                       · escribe el flujo NUEVO `finanzas · buzón` (cada 10 min · recoge las respuestas) · nace INACTIVO
 * Lo único que toca de la planeación: 1 nodo nuevo + 1 cable nuevo (de `FIN · cerrar la oficina`, ANTES del cable a `FIN · sobre`). Ningún nodo existente cambia; sirve sobre el vivo de hoy y sobre el de #665.
 */
import fs from 'node:fs'

const API = "={{ ($env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app') + '/api/finanzas/conversa' }}"
const CABECERAS = { parameters: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] }
const http = (id, name, position, jsonBody, timeout, extra = {}) => ({
  id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position, onError: 'continueRegularOutput',
  parameters: { method: 'POST', url: API, sendHeaders: true, headerParameters: CABECERAS, sendBody: true, specifyBody: 'json', jsonBody, options: { timeout, response: { response: { fullResponse: true, neverError: true } } } },
  ...extra,
})

export const NODO_PREGUNTAR = 'FIN · preguntar al dueño'

/** la rama LATERAL de la planeación: pregunta UNA vez por encargo (la plataforma lo garantiza), nunca frena (onError continúa, 30 s) y va ANTES del cable al sobre para que no espere a que termine el plan */
export function agregarPreguntar(flujo) {
  const w = JSON.parse(JSON.stringify(flujo))
  if (w.nodes.some((n) => n.name === NODO_PREGUNTAR)) throw new Error('el flujo ya trae el nodo ' + NODO_PREGUNTAR)
  const cerrar = w.nodes.find((n) => n.name === 'FIN · cerrar la oficina')
  if (!cerrar) throw new Error('no hay «FIN · cerrar la oficina»')
  w.nodes.push(http('5b0c7a36-9f1e-4c0e-8a52-2f6d3b1a7e01', NODO_PREGUNTAR, [cerrar.position[0] + 240, cerrar.position[1] + 260],
    "={{ JSON.stringify({ accion: 'preguntar', encargo_id: $('FIN · decidir').first().json.encargo_id, workflow_id: String($workflow.id), workflow_execution_id: String($execution.id) }) }}", 30000))
  const salida = w.connections['FIN · cerrar la oficina'].main[0]
  w.connections['FIN · cerrar la oficina'].main[0] = [{ node: NODO_PREGUNTAR, type: 'main', index: 0 }, ...salida]
  return w
}

const CODIGO_UNO_POR_ENCARGO = `// Buzón · de la lista a un ítem por encargo. Un fallo de lectura NO se calla: se lanza para que la ejecución quede en rojo.
const r = $input.first().json || {}
const status = Number(r.statusCode)
const b = r.body && typeof r.body === 'object' ? r.body : {}
if (status === 409) return [] // la oficina está apagada: nada que recoger
if (status !== 200) throw new Error('buzon_abiertos respondió ' + (Number.isFinite(status) ? status : 'sin respuesta') + ': ' + JSON.stringify(b).slice(0, 200))
const ids = Array.isArray(b.abiertos) ? b.abiertos.filter((x) => typeof x === 'string' && x) : []
return ids.slice(0, 20).map((encargo_id) => ({ json: { encargo_id } }))`

const CODIGO_RESUMEN = `// Buzón · resumen. Si alguna recogida falló en el servidor (5xx o sin respuesta), la ejecución se pone en rojo DESPUÉS de haber intentado todas.
const filas = $input.all().map((i) => i.json || {})
const malas = filas.filter((r) => !(Number(r.statusCode) >= 200 && Number(r.statusCode) < 500))
const aplicadas = filas.reduce((n, r) => n + ((r.body && Array.isArray(r.body.aplicadas)) ? r.body.aplicadas.length : 0), 0)
if (malas.length) throw new Error('recoger falló en ' + malas.length + ' de ' + filas.length + ' encargos')
return [{ json: { encargos: filas.length, respuestas_aplicadas: aplicadas } }]`

export function flujoDelVigia() {
  const trigger = { id: '8c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e01', name: 'Cada 10 minutos', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 0], parameters: { rule: { interval: [{ field: 'cronExpression', expression: '*/10 * * * *' }] } } }
  const abiertos = http('8c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e02', 'Buzón · abiertos', [240, 0], "={{ JSON.stringify({ accion: 'buzon_abiertos', workflow_id: String($workflow.id), workflow_execution_id: String($execution.id) }) }}", 30000)
  abiertos.onError = 'continueRegularOutput'
  const uno = { id: '8c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e03', name: 'Buzón · uno por encargo', type: 'n8n-nodes-base.code', typeVersion: 2, position: [480, 0], parameters: { jsCode: CODIGO_UNO_POR_ENCARGO } }
  const recoger = http('8c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e04', 'Buzón · recoger', [720, 0], "={{ JSON.stringify({ accion: 'recoger', encargo_id: $json.encargo_id, workflow_id: String($workflow.id), workflow_execution_id: String($execution.id) }) }}", 120000)
  const resumen = { id: '8c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e05', name: 'Buzón · resumen', type: 'n8n-nodes-base.code', typeVersion: 2, position: [960, 0], parameters: { jsCode: CODIGO_RESUMEN } }
  const c = (a, b) => [{ node: b, type: 'main', index: 0 }]
  return {
    name: 'Zero Risk — finanzas · buzón (recoge las respuestas del dueño · cada 10 min · CC#2)',
    nodes: [trigger, abiertos, uno, recoger, resumen],
    connections: {
      [trigger.name]: { main: [c(0, abiertos.name)] }, [abiertos.name]: { main: [c(0, uno.name)] },
      [uno.name]: { main: [c(0, recoger.name)] }, [recoger.name]: { main: [c(0, resumen.name)] },
    },
    settings: { executionOrder: 'v1' },
  }
}

if (process.argv[1] && process.argv[1].endsWith('construir-buzon-2026-10-20.mjs')) {
  const [modo, a, b] = process.argv.slice(2)
  if (modo === 'planeacion' && a && b) { fs.writeFileSync(b, JSON.stringify(agregarPreguntar(JSON.parse(fs.readFileSync(a, 'utf8'))), null, 1)); console.log('planeación escrita:', b) }
  else if (modo === 'vigia' && a) { fs.writeFileSync(a, JSON.stringify(flujoDelVigia(), null, 1)); console.log('vigía escrito:', a) }
  else { console.error('uso: planeacion <entrada.json> <salida.json> | vigia <salida.json>'); process.exit(2) }
}
