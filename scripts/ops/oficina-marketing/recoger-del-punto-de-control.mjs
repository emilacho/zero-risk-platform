/**
 * 01-nov · la vuelta del redactor que NO llega por cable se recoge del PUNTO DE CONTROL (propuesta de CC1 tras la corrida corta 209744).
 * Causa medida: un agente de más de ~13 min termina cuando la ruta de Vercel que lleva su respuesta (waitUntil de 800 s) ya murió; el corredor SÍ deja el texto en
 * `workflow_checkpoints` (step_name = el agente, workflow_execution_id = esta ejecución, output_ref.response) y nadie llama al `webhook-waiting`. El plan se escribió (30.515 caracteres,
 * US$ 1,08) y el flujo declaró «sin plan».
 * Qué cambia (y SOLO esto): entre «Esperar al redactor» y «¿Llegó la vuelta?» se leen los puntos de control de esta ejecución para el redactor elegido y un nodo decide:
 *   · si la vuelta llegó por cable con texto → pasa EXACTAMENTE lo mismo que hoy (el nodo devuelve la entrada del Wait sin tocarla);
 *   · en ensayo (`dry_run === true`) → igual que hoy: el ensayo no se "recupera";
 *   · si no llegó, y el punto de control de ESTE pedido (creado a partir del `ack_timestamp` del último «Pedir el plan al redactor», con 10 s de holgura) está `completed`, no truncado y con texto
 *     → la vuelta se arma desde ahí y el plan sigue (validar → guardar → jefatura → corte). La salida de «¿Llegó la vuelta?» lo declara (`vuelta_recuperada: true`, y una línea en el registro interno);
 *   · cualquier otra cosa (lectura que falla, paso aún `running`, truncado, de otro pedido, sin texto) → igual que hoy: «sin plan». Nunca se inventa un plan.
 */
import { agregarNodo, cambiarCodigo, codigo, conectar, redirigir } from './lib.mjs'

export const CODIGO_COMPLETAR_VUELTA = `// VUELTA · COMPLETAR · si la vuelta por cable no llegó, el plan puede estar en el punto de control (workflow_checkpoints) de ESTA ejecución. Si no, todo igual que hoy.
const orig = $('Esperar al redactor').last().json || {}
const cuerpoO = orig.body ? orig.body : orig
const textoO = String(cuerpoO.response || cuerpoO.result || cuerpoO.output || cuerpoO.text || '')
if (textoO.trim().length > 0) return [{ json: orig }]
let dry = false
try { dry = $('Webhook · planeacion').first().json.body.dry_run === true } catch (e) { dry = false }
if (dry) return [{ json: orig }]
const r = $input.first().json || {}
const filas = Array.isArray(r.body) ? r.body : []
const f = Number(r.statusCode) === 200 && filas.length && filas[0] && typeof filas[0] === 'object' ? filas[0] : null
if (!f || f.step_status !== 'completed' || String(f.truncado) === 'true' || !String(f.texto || '').trim()) return [{ json: orig }]
let ack = null
try { ack = $('Pedir el plan al redactor').last().json.ack_timestamp } catch (e) { ack = null }
const desde = ack ? new Date(ack).getTime() : NaN
// 06-nov · el punto de control se reescribe por upsert y conserva la creación de la primera vez: lo que dice si es de ESTE pedido es la actualización
const creado = new Date(f.updated_at || f.created_at).getTime()
if (!(desde > 0) || !(creado >= desde - 10000)) return [{ json: orig }]
return [{ json: { body: { response: String(f.texto), recuperada_del_punto_de_control: true } } }]
`

export function construirRecogerDelPuntoDeControl(f) {
  const leer = agregarNodo(f, {
    name: 'Vuelta · leer el punto de control', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
    parameters: {
      method: 'GET',
      url: "={{ ($env.SUPABASE_URL || $env.NEXT_PUBLIC_SUPABASE_URL) }}/rest/v1/workflow_checkpoints?workflow_execution_id=eq.{{ $execution.id }}&step_name=eq.{{ encodeURIComponent($('Redactor · elegir').last().json.redactor_elegido) }}&select=step_status,created_at,updated_at,texto:output_ref->>response,truncado:output_ref->>response_truncated&order=updated_at.desc&limit=1",
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_ROLE_KEY }}' }, { name: 'Authorization', value: '=Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}' }] },
      options: { timeout: 20000, response: { response: { fullResponse: true, neverError: true } } },
    },
  }, 'Esperar al redactor', 220, 0)
  // una caída de red o un tiempo agotado de la base NO debe detener el camino normal (la vuelta SÍ llegó por cable y hoy no se hace esta llamada): el error pasa como item y «Vuelta · completar» lo trata como «no hay fila»
  leer.onError = 'continueRegularOutput'
  leer.alwaysOutputData = true
  agregarNodo(f, codigo('Vuelta · completar', CODIGO_COMPLETAR_VUELTA), 'Esperar al redactor', 440, 0)
  redirigir(f, 'Esperar al redactor', '¿Llegó la vuelta?', 'Vuelta · leer el punto de control')
  conectar(f, 'Vuelta · leer el punto de control', 'Vuelta · completar')
  conectar(f, 'Vuelta · completar', '¿Llegó la vuelta?')
  const v = '¿Llegó la vuelta?'
  cambiarCodigo(f, v, 'const llego = textoDelRedactor.trim().length > 0;',
    "const llego = textoDelRedactor.trim().length > 0;\n// 01-nov · ¿la vuelta se recogió del punto de control porque la del cable no llegó? (lo decide «Vuelta · completar»)\nlet recuperada = false;\ntry { recuperada = $('Vuelta · completar').last().json.body.recuperada_del_punto_de_control === true; } catch (x) { recuperada = false; }")
  cambiarCodigo(f, v, 'const registroInterno = llego ? { revision_del_registro: bloqueRevision || null,',
    "const registroInterno = llego ? { vuelta: recuperada ? 'recuperada del punto de control (la vuelta por cable no llegó a tiempo)' : null, revision_del_registro: bloqueRevision || null,")
  cambiarCodigo(f, v, '  client_name: cnom,', '  client_name: cnom,\n  vuelta_recuperada: recuperada,')
}
