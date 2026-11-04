/**
 * 04-nov · GO Lenovo 13:05Z «tres arreglos del plan» (a partir del AVISO de CC1: el redactor tardó 22 min 25 s y la espera era de 15) · flujo del plan `X9F0zp6LQ2xGEYVS`.
 *   A · «Esperar al redactor»: la espera de la vuelta pasa de 900 s a 86.400 s (el máximo que ya usa este motor en producción, la espera de «Wait · Camino III decision» del alta;
 *       el corredor no tiene tope por llamada, dato de CC1). Es el ÚNICO Wait por webhook del plan; los otros son de intervalo fijo. En los otros tres flujos no hay otra espera corta.
 *   B · «¿Salió el PDF?»: en la rama sin plan «Plan vigente» no corrió y la primera línea lanzaba «Node 'Plan vigente' hasn't been executed». Ahora se atrapa y cae a la vuelta (sin plan, en palabras simples).
 *   C · cuando la vuelta NO llegó (venció la espera o llegó vacía) la corrida de `plan_corridas` se cierra como `fallida` con el motivo en palabras simples, en una rama LATERAL de «Armar el aviso · sin PDF»
 *       (no cambia el camino de hoy: aviso, campana y cable de vuelta siguen igual). Si falla el cierre, no rompe nada (continúa), y si el pedido no trae cliente/corrida no se llama.
 */
import { agregarNodo, cambiarCodigo, codigo, conectar, nodo } from './lib.mjs'

export const ESPERA_SEGUNDOS = 86400
const N_ARMAR = 'C · sin vuelta · armar el cierre'
const N_CERRAR = 'C · sin vuelta · cerrar la corrida'
const N_AVISO = 'Armar el aviso · sin PDF'

export const CODIGO_ARMAR = [
  '// 04-nov · la vuelta del redactor no llegó (venció la espera o llegó vacía): se cierra la corrida como `fallida`, con el motivo en palabras simples. Solo cuelga del aviso «sin PDF».',
  "const r = $input.first().json || {}",
  "let sobre = {}; try { sobre = ($('Webhook · planeacion').first().json.body || {}) } catch (e) { sobre = {} }",
  "const cid = typeof sobre.client_id === 'string' ? sobre.client_id : ''",
  "const corrida = typeof sobre.corrida === 'string' ? sobre.corrida : ''",
  "const sinVuelta = r.llego_la_vuelta !== true",
  "const motivo = 'el redactor no devolvió el plan a tiempo o lo devolvió vacío; el texto, si se escribió, quedó en el registro de la llamada'",
  "return [{ json: { aplica: !!(sinVuelta && cid && corrida), cuerpo: { accion: 'cerrar', client_id: cid, corrida: corrida, estado: 'fallida', motivo: motivo } } }]",
].join('\n')

export function construirPlanEsperaPdfYCierre(f) {
  // A
  const w = nodo(f, 'Esperar al redactor')
  if (w.parameters.resumeAmount !== 900 || w.parameters.resumeUnit !== 'seconds') throw new Error('«Esperar al redactor» ya no es de 900 s: el vivo cambió')
  w.parameters.resumeAmount = ESPERA_SEGUNDOS

  // B
  cambiarCodigo(f, '¿Salió el PDF?',
    "const v = ($('Plan vigente').first().json.jef_vigente || $('¿Llegó la vuelta?').first().json);",
    "// 04-nov · en la rama sin plan «Plan vigente» no corrió: se atrapa y se cae a la vuelta (sin plan), no a un error crudo\nlet _pv = null; try { _pv = $('Plan vigente').first().json } catch (e) { _pv = null }\nconst v = ((_pv && _pv.jef_vigente) || $('¿Llegó la vuelta?').first().json);")

  // C
  const cerrarDe = nodo(f, 'V9 · cerrar la corrida')
  agregarNodo(f, codigo(N_ARMAR, CODIGO_ARMAR), N_AVISO, 300, 200)
  const c = agregarNodo(f, { name: N_CERRAR, type: 'n8n-nodes-base.httpRequest', typeVersion: cerrarDe.typeVersion, onError: 'continueRegularOutput', parameters: JSON.parse(JSON.stringify(cerrarDe.parameters)) }, N_AVISO, 600, 200)
  c.parameters.options = { ...c.parameters.options, timeout: 60000 }
  // el cuerpo del HTTP viene de «armar»; solo se llama si aplica
  c.parameters.jsonBody = "={{ JSON.stringify($('" + N_ARMAR + "').first().json.cuerpo) }}"
  // si no aplica, el cierre no debe llamar: un If simple adelante
  const ifN = agregarNodo(f, { name: 'C · sin vuelta · ¿aplica?', type: 'n8n-nodes-base.if', typeVersion: 2, parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'strict' }, conditions: [{ id: 'sin-vuelta-aplica', leftValue: '={{ $json.aplica }}', rightValue: true, operator: { type: 'boolean', operation: 'true' } }], combinator: 'and' } } }, N_AVISO, 450, 200)
  // armar → if → cerrar
  conectar(f, N_AVISO, N_ARMAR)
  conectar(f, N_ARMAR, 'C · sin vuelta · ¿aplica?')
  conectar(f, 'C · sin vuelta · ¿aplica?', N_CERRAR, 0)
}
