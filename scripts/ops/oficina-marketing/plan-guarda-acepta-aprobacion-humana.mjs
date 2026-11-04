/**
 * 04-nov · RESPUESTA CC1 a Lenovo «el plan no espera, murió en la guarda» (defecto A) · flujo del plan `X9F0zp6LQ2xGEYVS`.
 * La guarda «① GUARDA · sin manual aprobado se DETIENE» solo aceptaba `gate_outcome = paso_la_vara` e ignoraba la aprobación del dueño. El manual v5 que aprobó Emilio
 * (`salio_al_tope` + `human_validated = true`) murió con `PLANEACION_MANUAL_NO_APROBADO`. ADR-020: si no alcanza la vara tras el tope, decide un HUMANO.
 * Cambio mínimo (recomendación de CC1; SIN aplicar hasta el GO de Lenovo):
 *   · «① Cargar el manual de marca»: el GET pide también `human_validated,version`.
 *   · «① GUARDA»: aprobado = `paso_la_vara` O `human_validated === true`. Todo lo demás (sin manual, ensayo sin manual, mensaje de error) queda igual.
 */
import { cambiarCodigo, nodo } from './lib.mjs'

export function construirGuardaAceptaAprobacionHumana(f) {
  const GET = nodo(f, '① Cargar el manual de marca')
  const url = GET.parameters.url
  const viejo = 'select=id,client_id,gate_outcome,created_at,'
  if (typeof url !== 'string' || url.split(viejo).length !== 2) throw new Error('«① Cargar el manual de marca»: la consulta no tiene la forma esperada')
  GET.parameters.url = url.replace(viejo, 'select=id,client_id,gate_outcome,human_validated,version,created_at,')

  const G = '① GUARDA · sin manual aprobado se DETIENE'
  cambiarCodigo(f, G, "const aprobado = m.gate_outcome === 'paso_la_vara';",
    "// 04-nov · ADR-020: si la vara automática no alcanzó tras el tope, decide un humano: el manual que el dueño validó (`human_validated`) también destraba el plan\nconst aprobado = m.gate_outcome === 'paso_la_vara' || m.human_validated === true;")
  cambiarCodigo(f, G, "' con gate_outcome=' + JSON.stringify(m.gate_outcome) + ' · la corrida", "' con gate_outcome=' + JSON.stringify(m.gate_outcome) + ' y human_validated=' + JSON.stringify(m.human_validated) + ' · la corrida")
}
