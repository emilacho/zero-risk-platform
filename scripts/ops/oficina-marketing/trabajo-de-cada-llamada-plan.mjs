/**
 * 04-nov · «cada llamada guarda de qué trabajo es» · parte del PLAN (`X9F0zp6LQ2xGEYVS`) · contrato de CC#1 (#878) y `corrida_id` (#882).
 * Tipo `plan` · id = `plan_corridas.id` (`corrida_id` que devuelve el pre-vuelo) · `paso` = `redactor`.
 * Solo se AGREGAN tres campos al cuerpo de «Pedir el plan al redactor». Vacío cuenta como «sin dato» en silencio: la expresión se atrapa y nunca frena la llamada.
 * NO se toca: finanzas (`/api/finanzas/conversa`) y la revisión de la jefatura (`/api/jefatura/revisiones`) llaman a sus empleados DESDE la plataforma; ahí el id lo pone su código (CC#1).
 */
import { nodo } from './lib.mjs'

export const CORRIDA_ID_JS = "(function () { try { const r = $('V9 · pre-vuelo').all(); const b = (r[r.length - 1].json.body || {}); return String(b.corrida_id || '') } catch (e) { return '' } })()"

export function construirTrabajoDeCadaLlamadaPlan(f) {
  const p = nodo(f, 'Pedir el plan al redactor').parameters
  const j = p.jsonBody
  const viejo = 'workflow_id: $workflow.id, workflow_execution_id: $execution.id,'
  if (typeof j !== 'string' || j.split(viejo).length !== 2) throw new Error('«Pedir el plan al redactor»: el cuerpo no tiene la forma esperada')
  if (/trabajo_tipo/.test(j)) throw new Error('«Pedir el plan al redactor» ya manda el trabajo')
  p.jsonBody = j.replace(viejo, () => viejo + " trabajo_tipo: 'plan', trabajo_id: " + CORRIDA_ID_JS + ", paso: 'redactor',")
}
