/**
 * 01-nov · `parar_en: 'plan_revisado'` (encargo de CC1 en PRESUPUESTO-CC1-corrida-corta-del-plan) + tope del redactor.
 *   A · el corte: DESPUÉS de «Plan vigente» (la jefatura ya revisó y el plan vigente quedó elegido y marcado) y ANTES del PDF a Drive y de todo lo que lleva al brief
 *       (PDF → cable de vuelta → «BRIEF · sobre»). Las ramas laterales de «Plan vigente» que son de la revisión (marca de «revisión incompleta», aviso de plan con pendientes) siguen corriendo:
 *       un plan mal revisado no puede quedar sin su marca por haber parado. Ausente o 'guardar_plan' = lo de hoy.
 *   B · «Pedir el plan al redactor» manda `max_budget_usd: 2` (hoy no mandaba tope; máximo histórico de una llamada ≈ US$ 1,99).
 */
import { agregarNodo, codigo, conectar, redirigir, si } from './lib.mjs'

export const TOPE_REDACTOR_USD = 2

export const CODIGO_PARADO_REVISADO = `// PARAR · RESUMEN (plan revisado) · la corrida pidió detenerse DESPUÉS de la jefatura (parar_en = plan_revisado): el plan vigente ya quedó elegido; NO sigue el PDF a Drive, ni el brief, ni nada de lo que cuelga de ahí.
const g = $input.first().json || {}
const fila = Array.isArray(g) ? g[0] : (Array.isArray(g.body) ? g.body[0] : (g.body || g))
let jef = {}
try { jef = $('JEF · aplicar').first().json.jef || {} } catch (e) { jef = {} }
return [{ json: { parado_en: 'plan_revisado', plan_vigente_id: fila && fila.id ? fila.id : null, jefatura_fase: jef.fase || null, redactor: (function () { try { return $('Redactor · elegir').last().json.redactor_elegido || null } catch (e) { return null } })() } }]
`

export function construirParadaPlanRevisado(f) {
  agregarNodo(f, si('Parar · ¿plan revisado?', "={{ (function () { try { return $('Webhook · planeacion').first().json.body.parar_en } catch (e) { return null } })() }}", 'plan_revisado', 'equals', 'string'), 'Plan vigente', 220, 160)
  agregarNodo(f, codigo('Parar · resumen (plan revisado)', CODIGO_PARADO_REVISADO), 'Plan vigente', 440, 280)
  redirigir(f, 'Plan vigente', 'Plan → Drive (PDF)', 'Parar · ¿plan revisado?')
  conectar(f, 'Parar · ¿plan revisado?', 'Parar · resumen (plan revisado)', 0)
  conectar(f, 'Parar · ¿plan revisado?', 'Plan → Drive (PDF)', 1)
  const pedir = f.nodes.find((n) => n.name === 'Pedir el plan al redactor')
  const ancla = 'workflow_execution_id: $execution.id,'
  if (pedir.parameters.jsonBody.split(ancla).length !== 2) throw new Error('«Pedir el plan al redactor» ya no trae workflow_execution_id una sola vez')
  pedir.parameters.jsonBody = pedir.parameters.jsonBody.replace(ancla, () => ancla + ' max_budget_usd: ' + TOPE_REDACTOR_USD + ',')
}
