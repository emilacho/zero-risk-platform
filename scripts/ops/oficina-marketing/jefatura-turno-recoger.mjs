/**
 * 01-nov · EL TURNO DE LA JEFATURA TAMBIÉN RECOGE SU VUELTA DEL PUNTO DE CONTROL (pendiente 🔴 del LISTO de CC1 «jefatura con carpeta y sin topes»; CC3 lo confirmó).
 * Causa (la misma que en la planeación, medida en la corrida 209744): un agente de más de ~13 min termina cuando la ruta de Vercel que lleva su respuesta (waitUntil de 800 s) ya murió;
 * el corredor SÍ deja el texto en `workflow_checkpoints` (step_name = el agente, workflow_execution_id = esta ejecución, output_ref.response) pero nadie despierta la espera. Con la jefatura
 * leyendo la carpeta entera el pedido crece y el turno tarda más: sin esta recuperación, la espera se agota (1800 s) y el turno se registra «la vuelta llegó vacía (o se agotó la espera)».
 * Qué cambia (y SOLO esto) en el flujo `o8qaF7bI0PKv2XGZ` (`zero-risk/jefatura-turno`): entre «② Esperar al agente» y «② Vuelta» se lee el punto de control de ESTA ejecución para el agente del pedido:
 *   · si la vuelta llegó por cable con texto, o falló de forma declarada (`success:false`) → pasa EXACTAMENTE lo mismo que hoy;
 *   · si no llegó (vacía / espera agotada) y el punto de control de ESTE pedido (creado desde el `ack_timestamp` del 202 de run-sdk, con 10 s de holgura) está `completed`, no truncado y con texto
 *     → la vuelta se arma desde ahí (`recuperada_del_punto_de_control: true`) y el turno sigue como si hubiera llegado por cable; el costo no viaja (se registra 0 y la sala lo declara);
 *   · cualquier otra cosa (lectura que falla, paso aún `running`, truncado, de otro pedido, sin texto) → igual que hoy. Nunca se inventa una respuesta.
 * El modo seco no pasa por la espera, así que no cambia.
 */
import { agregarNodo, codigo, conectar, nodo, redirigir, si } from './lib.mjs'

/** la espera por el cable vence a los 15 min (el vigía de la plataforma da por muerto un paso a los 12; su constante sube aparte) y, si el agente SIGUE corriendo, se relee cada 2 min hasta 8 veces */
export const ESPERA_POR_EL_CABLE_S = 900
export const RELECTURAS_MAX = 8
export const RELECTURA_CADA_S = 120

export const CODIGO_COMPLETAR_VUELTA_DEL_TURNO = `// ② VUELTA · COMPLETAR · si la vuelta por cable no llegó, la respuesta del agente puede estar en el punto de control (workflow_checkpoints) de ESTA ejecución. Si no, todo igual que hoy.
const orig = $('② Esperar al agente').last().json || {}
const cuerpoO = orig.body ? orig.body : orig
const textoO = String(cuerpoO.response || cuerpoO.result || cuerpoO.output || cuerpoO.text || '')
if (textoO.trim().length > 0 || cuerpoO.success === false) return [{ json: orig }]
const r = $input.first().json || {}
const filas = Array.isArray(r.body) ? r.body : []
const f = Number(r.statusCode) === 200 && filas.length && filas[0] && typeof filas[0] === 'object' ? filas[0] : null
if (!f || f.step_status !== 'completed' || String(f.truncado) === 'true' || !String(f.texto || '').trim()) return [{ json: orig }]
let ack = null
try { const a = $('② Agente (run-sdk)').last().json; ack = (a.body && a.body.ack_timestamp) || a.ack_timestamp || null } catch (e) { ack = null }
const desde = ack ? new Date(ack).getTime() : NaN
const creado = new Date(f.created_at).getTime()
if (!(desde > 0) || !(creado >= desde - 10000)) return [{ json: orig }]
return [{ json: { body: { response: String(f.texto), recuperada_del_punto_de_control: true } } }]
`

export const SIGUE_CORRIENDO = `={{ (function () { try { const c = $('② Vuelta · completar').last().json || {}; const cu = c.body ? c.body : c; if (cu.recuperada_del_punto_de_control === true || cu.success === false) return false; if (String(cu.response || cu.result || cu.output || cu.text || '').trim()) return false; const r = $('② Vuelta · leer el punto de control').last().json || {}; const f = Array.isArray(r.body) ? r.body[0] : null; return !!f && f.step_status === 'running' && $runIndex < ${RELECTURAS_MAX} } catch (e) { return false } })() }}`

export function construirTurnoQueRecoge(f) {
  nodo(f, '② Esperar al agente').parameters.resumeAmount = ESPERA_POR_EL_CABLE_S
  const leer = agregarNodo(f, {
    name: '② Vuelta · leer el punto de control', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
    parameters: {
      method: 'GET',
      url: "={{ ($env.SUPABASE_URL || $env.NEXT_PUBLIC_SUPABASE_URL) }}/rest/v1/workflow_checkpoints?workflow_execution_id=eq.{{ $execution.id }}&step_name=eq.{{ encodeURIComponent($('② Armar el pedido').first().json.cuerpo.agent) }}&select=step_status,created_at,texto:output_ref->>response,truncado:output_ref->>response_truncated&order=created_at.desc&limit=1",
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_ROLE_KEY }}' }, { name: 'Authorization', value: '=Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}' }] },
      options: { timeout: 20000, response: { response: { fullResponse: true, neverError: true } } },
    },
  }, '② Esperar al agente', 220, 0)
  // una caída de red o un tiempo agotado de la base NO debe cambiar el camino de hoy: el error pasa como item y «② Vuelta · completar» lo trata como «no hay fila»
  leer.onError = 'continueRegularOutput'
  leer.alwaysOutputData = true
  agregarNodo(f, codigo('② Vuelta · completar', CODIGO_COMPLETAR_VUELTA_DEL_TURNO), '② Esperar al agente', 440, 0)
  redirigir(f, '② Esperar al agente', '② Vuelta', '② Vuelta · leer el punto de control')
  conectar(f, '② Vuelta · leer el punto de control', '② Vuelta · completar')
  // si al despertar el agente SIGUE corriendo (paso `running`), se espera un poco y se vuelve a leer; con el tope agotado o cualquier otro estado se sigue a «② Vuelta» como antes
  agregarNodo(f, si('② Vuelta · ¿sigue corriendo?', SIGUE_CORRIENDO), '② Esperar al agente', 660, 0)
  agregarNodo(f, { name: '② Vuelta · esperar un poco', webhookId: 'jefatura-turno-0002-relectura', type: 'n8n-nodes-base.wait', typeVersion: 1.1, parameters: { resume: 'timeInterval', amount: RELECTURA_CADA_S, unit: 'seconds' } }, '② Esperar al agente', 660, 160)
  conectar(f, '② Vuelta · completar', '② Vuelta · ¿sigue corriendo?')
  conectar(f, '② Vuelta · ¿sigue corriendo?', '② Vuelta · esperar un poco', 0)
  conectar(f, '② Vuelta · ¿sigue corriendo?', '② Vuelta', 1)
  conectar(f, '② Vuelta · esperar un poco', '② Vuelta · leer el punto de control')
}
