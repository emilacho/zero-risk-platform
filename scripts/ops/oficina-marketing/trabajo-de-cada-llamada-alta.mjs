/**
 * 04-nov · «cada llamada a un empleado guarda de qué trabajo es» · parte de CC#2, FLUJO DEL ALTA (`LyVoKcrypS5uLyuu`). Firma de Lenovo 04-nov (`…FIRMA-LENOVO-a-CC2-CC1-que-es-cada-id-del-trabajo`):
 * alta → el journey del cliente (`_journey_id` del sobre, el mismo que viaja a la sala). Tres cabeceras `x-zr-trabajo-tipo` / `x-zr-trabajo-id` / `x-zr-paso` en las 5 llamadas a un empleado.
 * Cada expresión se atrapa y devuelve '' («sin dato»): nunca frena la llamada. Solo se AGREGAN cabeceras.
 */
import { nodo } from './lib.mjs'

const V = "$('Validate Deal Data').first().json"
export const EXPR_ID_ALTA = `={{ (() => { try { return String(${V}._journey_id || ''); } catch (e) { return ''; } })() }}`

const LLAMADAS = [
  ['Call Onboarding Specialist: Auto-Discovery Dispatch (fire+forget)', 'descubrimiento'],
  ['Competitor Verdict · run-sdk (INLINE)', 'veredicto-de-competidores'],
  ['Re-gate INLINE (competitive-intelligence)', 'regate-competidores'],
  ['[RD] Dispatch (fire+forget)', 'redescubrimiento'],
  ['[RD] Re-dispatch tras error', 'redescubrimiento-tras-error'],
]

export function construirTrabajoDeCadaLlamadaAlta(f) {
  for (const [nombre, paso] of LLAMADAS) {
    const p = nodo(f, nombre).parameters
    const hp = (p.headerParameters && p.headerParameters.parameters) || []
    if (hp.some((h) => /^x-zr-trabajo/.test(h.name))) throw new Error(`«${nombre}» ya lleva las cabeceras del trabajo`)
    p.sendHeaders = true
    p.headerParameters = { parameters: [...hp, { name: 'x-zr-trabajo-tipo', value: 'alta' }, { name: 'x-zr-trabajo-id', value: EXPR_ID_ALTA }, { name: 'x-zr-paso', value: paso }] }
  }
}
