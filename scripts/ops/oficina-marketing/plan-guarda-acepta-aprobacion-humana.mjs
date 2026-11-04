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

/**
 * Defecto B (GO de Lenovo 04-nov) · si el plan muere ANTES de empezar (la guarda: sin cliente, sin manual, manual no aprobado, dry_run raro…), el flujo
 *   1) CIERRA su corrida de `plan_corridas` como `fallida` con el motivo en palabras simples (la misma ruta que usa V9 al terminar) y
 *   2) deja la ejecución en ROJO para que el aviso de error del motor mande UNA alarma a #alertas (con el freno de 10 min por flujo+nodo).
 * Antes el flujo no tenía enlazado el aviso de error y la fila quedaba «corriendo» hasta el barrido. No cambia nada del camino feliz: la guarda gana una salida de error.
 */
import { agregarNodo, codigo, conectar } from './lib.mjs'

export const FLUJO_AVISO_DE_ERROR = '5fkPLbZvQsQa1bcd' // «Aviso de error → #alertas (E73)»

const GUARDA = '① GUARDA · sin manual aprobado se DETIENE'
const N_ARMAR = 'V9 · murió antes de empezar · armar el cierre'
const N_CERRAR = 'V9 · murió antes de empezar · cerrar la corrida'
const N_PARAR = 'V9 · murió antes de empezar · parar ruidoso'

export const CODIGO_ARMAR = [
  '// 04-nov · el plan murió en la guarda (antes de empezar): se cierra su corrida como `fallida`, con el motivo en palabras simples, y luego se para en rojo.',
  "const sobre = ($('Webhook · planeacion').first().json.body || {})",
  'const e = $input.first().json || {}',
  "const err = e.error || {}",
  "const crudo = String(err.message || err.description || (typeof e.error === 'string' ? e.error : '') || 'sin detalle')",
  'let simple = \'el plan se detuvo antes de empezar: \' + crudo.slice(0, 160)',
  "if (/PLANEACION_MANUAL_NO_APROBADO/.test(crudo)) simple = 'el manual del cliente no está aprobado (ni pasó la revisión automática ni lo validó el dueño)'",
  "else if (/PLANEACION_SIN_MANUAL/.test(crudo)) simple = 'el cliente no tiene manual de marca'",
  "else if (/PLANEACION_SIN_CLIENTE/.test(crudo)) simple = 'el pedido del plan no trae el cliente'",
  "else if (/PLANEACION_DRY_RUN_INVALIDO/.test(crudo)) simple = 'el pedido del plan trae un modo de ensayo inválido'",
  "const cid = typeof sobre.client_id === 'string' ? sobre.client_id : ''",
  "const corrida = typeof sobre.corrida === 'string' ? sobre.corrida : ''",
  "return [{ json: { aplica: !!(cid && corrida), motivo: simple, detalle: crudo.slice(0, 300), cuerpo: { accion: 'cerrar', client_id: cid, corrida: corrida, estado: 'fallida', motivo: ('murió antes de empezar: ' + simple).slice(0, 300) } } }]",
].join('\n')

export const CODIGO_PARAR = [
  "const a = $('" + N_ARMAR + "').first().json",
  "const r = $input.first().json || {}",
  "const cierre = a.aplica ? ('corrida cerrada como fallida (HTTP ' + (r.statusCode || '?') + ')') : 'sin corrida que cerrar'",
  "throw new Error('PLAN_MURIO_ANTES_DE_EMPEZAR · ' + a.motivo + ' · ' + cierre + ' · detalle: ' + a.detalle)",
].join('\n')

export function construirPlanMuereAvisandoYCerrando(f) {
  const guarda = f.nodes.find((n) => n.name === GUARDA)
  if (!guarda) throw new Error('no está la guarda del plan')
  if (guarda.onError) throw new Error('la guarda ya tiene salida de error')
  guarda.onError = 'continueErrorOutput'

  agregarNodo(f, codigo(N_ARMAR, CODIGO_ARMAR), GUARDA, 300, 200)
  const cerrarDe = f.nodes.find((n) => n.name === 'V9 · cerrar la corrida')
  if (!cerrarDe) throw new Error('no está «V9 · cerrar la corrida»')
  const cerrar = agregarNodo(f, { name: N_CERRAR, type: 'n8n-nodes-base.httpRequest', typeVersion: cerrarDe.typeVersion, onError: 'continueRegularOutput', parameters: JSON.parse(JSON.stringify(cerrarDe.parameters)) }, GUARDA, 600, 200)
  cerrar.parameters.options = { ...cerrar.parameters.options, timeout: 60000 }
  agregarNodo(f, codigo(N_PARAR, CODIGO_PARAR), GUARDA, 900, 200)

  conectar(f, GUARDA, N_ARMAR, 1)
  conectar(f, N_ARMAR, N_CERRAR)
  conectar(f, N_CERRAR, N_PARAR)

  // el aviso de error del motor (E73) enlazado: antes este flujo moría en silencio
  f.settings = { ...(f.settings || {}), errorWorkflow: FLUJO_AVISO_DE_ERROR }
}
