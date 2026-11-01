/**
 * 01-nov · CICLO DEL PLAN · TRAMO 2 · el sub-flujo NUEVO «Plan · segunda mitad (PDF → brief)» (ORDEN CC1, parte B). US$ 0 al construirlo.
 * Dos puertas: el webhook `zero-risk/plan-aprobado` (lo despierta la puerta `plan-aprobar`; pasa por su propia «⓪ Llave») y un disparador de «Execute Workflow» (lo llama la planeación
 * cuando NO hay compuerta). Ambas dejan UN sobre normalizado en «Sobre»; el resto es la cola de hoy COPIADA de la planeación (PDF → cable a la sala → brief → cierre de la corrida v3), con
 * UN solo cambio de texto en sus expresiones: `$('Webhook · planeacion')` → `$('Sobre')`.
 * Regla de memoria: debe estar PUBLICADO toda la corrida si la planeación lo llama; el webhook responde `onReceived` (la puerta espera ≤ 30 s).
 */
import fs from 'node:fs'
import path from 'node:path'
import { AQUI, idDeNodo, nodo } from './lib.mjs'
import { httpBase } from './ciclo-del-plan.mjs'

export const ID_SEGUNDA_MITAD = 'segundaMitadDelPlan'
export const NOMBRE_SEGUNDA_MITAD = 'Plan · segunda mitad (PDF → brief)'
/** los nodos de la cola vieja que se copian al sub-flujo (en la planeación se quedan: dos caminos sin plan todavía los usan) */
export const COLA = [
  'Plan → Drive (PDF)', '¿Salió el PDF?', 'IF · ¿hay PDF?', 'Cable de vuelta · sala', 'Cable · ¿volvió? · plan',
  'BRIEF · sobre · pedir el parte a la sala (E-brief · CC#2)', 'Nota perdida · sobre del brief', 'Armar el aviso · sin PDF', 'Campana · plan sin PDF',
  'V9 · armar el cierre', 'V9 · ¿cerrar la corrida?', 'V9 · cerrar la corrida',
]
const leer = (f) => fs.readFileSync(path.join(AQUI, 'ciclo-nodos', f), 'utf8').replace(/\r\n/g, '\n')
const base = "={{ ($env.SUPABASE_URL || $env.NEXT_PUBLIC_SUPABASE_URL) }}/rest/v1/"

export function construirSegundaMitad(planeacion) {
  const nodos = []
  const conexiones = {}
  const id = (n) => idDeNodo(ID_SEGUNDA_MITAD, n)
  const poner = (def, x, y) => { const n = { id: id(def.name), position: [x, y], typeVersion: def.typeVersion ?? 2, ...def }; nodos.push(n); return n }
  const cx = (de, a, salida = 0) => { conexiones[de] ??= { main: [] }; while (conexiones[de].main.length <= salida) conexiones[de].main.push([]); conexiones[de].main[salida].push({ node: a, type: 'main', index: 0 }) }

  // entradas
  poner({ name: 'Webhook · plan-aprobado', type: 'n8n-nodes-base.webhook', typeVersion: 2, parameters: { httpMethod: 'POST', path: 'zero-risk/plan-aprobado', responseMode: 'onReceived', options: {} }, webhookId: id('webhook').slice(0, 36) }, 0, 0)
  poner({ name: 'Entrada · desde la planeación', type: 'n8n-nodes-base.executeWorkflowTrigger', typeVersion: 1, parameters: {} }, 0, 240)
  // la llave del webhook: la MISMA de la planeación (las dos reglas de procedencia; sin las entradas de la planeación)
  const llavePlaneacion = nodo(planeacion, '⓪ Llave · Webhook · planeacion').parameters.jsCode
  const corte = llavePlaneacion.indexOf('// T5 · parar_en')
  if (corte < 0) throw new Error('la «⓪ Llave» de la planeación no tiene el corte esperado (// T5 · parar_en)')
  const llave = llavePlaneacion.slice(0, corte).replace('Este flujo GASTA', 'Este sub-flujo GASTA (PDF, cable a la sala, brief)') + 'return $input.all()\n'
  poner({ name: '⓪ Llave · plan-aprobado', type: 'n8n-nodes-base.code', typeVersion: 2, parameters: { jsCode: llave } }, 220, 0)
  poner({ name: 'Sobre', type: 'n8n-nodes-base.code', typeVersion: 2, parameters: { jsCode: leer('segunda-mitad-sobre.js') } }, 440, 120)
  cx('Webhook · plan-aprobado', '⓪ Llave · plan-aprobado'); cx('⓪ Llave · plan-aprobado', 'Sobre'); cx('Entrada · desde la planeación', 'Sobre')

  // rastro de la compuerta: con aprobacion_id se anota qué ejecución la reanudó (una anotación: si falla, el PDF y el brief NO se frenan)
  poner({ name: '¿Compuerta · en marcha?', type: 'n8n-nodes-base.if', typeVersion: 2, parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: "={{ !!$('Sobre').first().json.body.aprobacion_id }}", rightValue: true, operator: { type: 'boolean', operation: 'equals' } }] }, options: {} } }, 660, 120)
  const enMarcha = poner({ ...httpBase('Compuerta · en marcha', 'PATCH', `${base}plan_aprobaciones?id=eq.{{ $('Sobre').first().json.body.aprobacion_id }}`, '={{ JSON.stringify({ workflow_id: $workflow.id, workflow_execution_id: $execution.id }) }}') }, 880, 60)
  enMarcha.onError = 'continueRegularOutput'; enMarcha.alwaysOutputData = true
  const pedir = poner({
    name: 'Plan · pedir', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
    parameters: {
      method: 'GET',
      url: `${base}client_historical_outputs?select=id,client_id,output_type,status,content_text,content,provenance_tag&id=eq.{{ $('Sobre').first().json.body.plan_id }}`,
      sendHeaders: true, headerParameters: { parameters: [{ name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_ROLE_KEY }}' }, { name: 'Authorization', value: '=Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}' }] },
      options: { timeout: 20000, response: { response: { fullResponse: true, neverError: true } } },
    },
  }, 1100, 120)
  pedir.onError = 'continueRegularOutput'; pedir.alwaysOutputData = true
  poner({ name: 'Plan vigente', type: 'n8n-nodes-base.code', typeVersion: 2, parameters: { jsCode: leer('segunda-mitad-plan-vigente.js') } }, 1320, 120)
  cx('Sobre', '¿Compuerta · en marcha?'); cx('¿Compuerta · en marcha?', 'Compuerta · en marcha', 0)
  cx('Compuerta · en marcha', 'Plan · pedir'); cx('¿Compuerta · en marcha?', 'Plan · pedir', 1)
  cx('Plan · pedir', 'Plan vigente')

  // la cola copiada, con el único cambio de texto
  const porNombre = new Map(planeacion.nodes.map((n) => [n.name, n]))
  let y = 0
  for (const nombre of COLA) {
    const orig = porNombre.get(nombre)
    if (!orig) throw new Error(`la planeación no tiene el nodo de la cola «${nombre}»`)
    const copia = JSON.parse(JSON.stringify(orig).split("$('Webhook · planeacion')").join("$('Sobre')"))
    copia.id = id(nombre)
    copia.position = [1540 + (y % 6) * 220, 120 + Math.floor(y / 6) * 200]
    delete copia.webhookId
    nodos.push(copia)
    y++
  }
  for (const nombre of COLA) for (const [i, salida] of (planeacion.connections[nombre]?.main || []).entries()) for (const c of salida) {
    if (!COLA.includes(c.node)) continue // «V9 · armar el cierre» tenía otra entrada desde «Cable · ¿volvió? · repetida»: ese camino se queda en la planeación
    cx(nombre, c.node, i)
  }
  cx('Plan vigente', 'Plan → Drive (PDF)')
  return {
    id: ID_SEGUNDA_MITAD, name: NOMBRE_SEGUNDA_MITAD, nodes: nodos, connections: conexiones,
    settings: { executionOrder: 'v1' }, staticData: null, pinData: {},
  }
}

export function escribirSegundaMitad(f) {
  const dir = path.join(AQUI, 'nuevo')
  fs.mkdirSync(dir, { recursive: true })
  const archivo = path.join(dir, `${ID_SEGUNDA_MITAD}.json`)
  fs.writeFileSync(archivo, JSON.stringify(f, null, 2) + '\n')
  return archivo
}
