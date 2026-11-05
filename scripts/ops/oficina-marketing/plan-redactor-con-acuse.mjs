/**
 * 05-nov · doble chequeo a US$ 0 (H2, H3, H6, H10) · lo que hacía perder trabajo pagado alrededor del redactor. Planeación `X9F0zp6LQ2xGEYVS`.
 *
 * H2 · «Pedir el plan al redactor» no miraba la respuesta. Con 400, 500 o el freno de gasto (429) el plan esperaba 24 h callado, con mesa y finanzas pagadas.
 *   Nodo nuevo «Redactor · ¿aceptó el pedido?»:
 *     · `accepted: true` ⇒ sigue a la espera, como hoy.
 *     · la plataforma contestó que no (`error` en texto o `success: false`) ⇒ cierra la corrida como `fallida`, para en rojo y el aviso de error del motor manda la alarma.
 *     · sin respuesta clara (conexión cortada, `agent-runner timeout`, `upstream_status: 0`, cuerpo sin esos campos) ⇒ sigue a la espera: el pedido pudo entrar y el empleado estar trabajando; pararlo tiraría trabajo pagado.
 *       Si nunca vuelve, la espera vence y «¿Llegó la vuelta?» la declara como hoy.
 *
 * H10 · La vuelta perdida (el motor caído 6 s durante sus 3 intentos) se recupera del punto de control recién al vencer la espera. Con 24 h, eso ocurre mucho después del
 *   techo de la corrida (100 min): el barrido ya la cerró y el plan despertaría a gastar jefatura sobre una corrida muerta. Espera nueva: 45 min. No corta a ningún empleado:
 *   la plataforma tiene 800 s por llamada, y al vencer se lee el punto de control. Mesa (~15 min) + finanzas (~20 min, medido) + 45 min quedan debajo del techo.
 *
 * H3 · Sin `force_restart`, el corredor devuelve el punto de control de (flujo, cliente, empleado): el redactor reutilizaba el acta de la consolidación y salía un «plan» con ese texto.
 *   Ahora siempre se fuerza. Reusar en este nodo nunca es lo buscado: la recuperación de una vuelta perdida lee por `workflow_execution_id` en otro nodo.
 *
 * H6 · El plazo se miraba después del turno que cierra (consolida · cierre), justo antes de la vuelta que recoge el resultado sin gastar: moría con el acta ya pagada.
 *   Esa vuelta ya no se corta por plazo. El tope de pasos sigue igual, y si esa vuelta abre una ronda nueva y pagada, en la siguiente el plazo vuelve a regir.
 *
 * H11 · Sin plan (la espera venció y no había punto de control), el camino del aviso seguía como si nada: `V9 · cerrar la corrida` la marcaba `hecha` · «plan entregado», el cierre correcto
 *   como `fallida` recibía 409, y se pedía el parte a la sala para una corrida sin plan. Ahora, sin vuelta: V9 no cierra (lo hace «C · sin vuelta») y no se pide el parte. El cable a la sala sigue: su marca debe resolverse.
 *
 * No limita a ningún agente: no toca lo que proponen ni sus topes de gasto.
 */
import { agregarNodo, cambiarCodigo, codigo, conectar, nodo, redirigir, si } from './lib.mjs'

export const N_ACUSE = 'Redactor · ¿aceptó el pedido?'
export const N_SI_RECHAZO = 'Redactor · ¿lo rechazaron?'
export const N_CERRAR = 'Redactor · rechazado · cerrar la corrida'
export const N_PARAR = 'Redactor · rechazado · parar en rojo'
const PEDIR = 'Pedir el plan al redactor'
const ESPERAR = 'Esperar al redactor'
export const ESPERA_S = 2700

export const CODIGO_ACUSE = [
  '// 05-nov · ¿la plataforma aceptó el pedido al redactor? Sin esto, un rechazo dejaba al plan esperando callado. Lo dudoso NO para: el empleado pudo arrancar y ya estar cobrando.',
  'const r = $input.first().json || {}',
  "const sobre = ($('Webhook · planeacion').first().json.body || {})",
  "const texto = typeof r.error === 'string' ? r.error : ''",
  "// la plataforma avisa que perdió al corredor: 790 s sin respuesta o conexión caída (upstream_status 0). El empleado pudo seguir trabajando: dudoso. Con un estado real del corredor (503) sí es rechazo.",
  "const dudoso = texto === 'agent-runner timeout' || r.upstream_status === 0",
  "const rechazado = r.accepted !== true && sobre.dry_run !== true && !dudoso && (texto !== '' || r.success === false)",
  'if (!rechazado) return [{ json: { ...r, redactor_rechazado: false } }]',
  "const cid = typeof sobre.client_id === 'string' ? sobre.client_id : ''",
  "const corrida = typeof sobre.corrida === 'string' ? sobre.corrida : ''",
  "const simple = (r.code === 'E-CAP-150' || texto === 'cost_cap_exceeded') ? 'el freno de gasto del cliente no dejó pedir el plan (se llegó al tope de 24 h)' : 'la plataforma rechazó el pedido del plan al redactor'",
  "const detalle = (texto || String(r.detail || r.message || 'sin detalle')).slice(0, 200)",
  "return [{ json: { redactor_rechazado: true, aplica: !!(cid && corrida), motivo: simple, detalle: detalle, cuerpo: { accion: 'cerrar', client_id: cid, corrida: corrida, estado: 'fallida', motivo: (simple + ': ' + detalle).slice(0, 300) } } }]",
].join('\n')

export const CODIGO_PARAR = [
  "const a = $('" + N_ACUSE + "').last().json",
  'const r = $input.first().json || {}',
  "const cierre = a.aplica ? ('corrida cerrada como fallida (HTTP ' + (r.statusCode || '?') + ')') : 'sin corrida que cerrar'",
  "throw new Error('PLAN_REDACTOR_RECHAZADO · ' + a.motivo + ' · ' + cierre + ' · detalle: ' + a.detalle)",
].join('\n')

// Los 4 lugares donde el plazo cortaba la vuelta que solo recoge. `paso` lo devuelve la plataforma al avanzar.
const PLAZOS = [
  { nodo: 'MESA · decidir', viejo: "if (Date.now() - t0 > PLAZO_MS || vuelta >= MAX_PASOS) return [{ json: { fin: true, encargo_id: id, motivo: 'vencido', detalle: 'la mesa no terminó a tiempo' } }]\nreturn [{ json: { fin: false, encargo_id: id } }]", nuevo: "// 05-nov · si este turno fue la consolidación, la próxima vuelta recoge el acta ya pagada sin gastar: el plazo no la corta\nconst acabaDeCerrar = /consolida/.test(String(b.paso || ''))\nif ((!acabaDeCerrar && Date.now() - t0 > PLAZO_MS) || vuelta >= MAX_PASOS) return [{ json: { fin: true, encargo_id: id, motivo: 'vencido', detalle: 'la mesa no terminó a tiempo' } }]\nreturn [{ json: { fin: false, encargo_id: id } }]" },
  { nodo: 'MESA · decidir la devolución', viejo: "if (Date.now() - t0 > PLAZO_MS || vuelta >= MAX_PASOS) return [{ json: { fin: true, encargo_id: id, motivo: 'vencido', detalle: 'la mesa no terminó la devolución a tiempo' } }]\nreturn [{ json: { fin: false, encargo_id: id } }]", nuevo: "// 05-nov · si este turno fue la consolidación, la próxima vuelta recoge el acta ya pagada sin gastar: el plazo no la corta\nconst acabaDeCerrar = /consolida/.test(String(b.paso || ''))\nif ((!acabaDeCerrar && Date.now() - t0 > PLAZO_MS) || vuelta >= MAX_PASOS) return [{ json: { fin: true, encargo_id: id, motivo: 'vencido', detalle: 'la mesa no terminó la devolución a tiempo' } }]\nreturn [{ json: { fin: false, encargo_id: id } }]" },
  ...['FIN · decidir', 'FIN2 · decidir'].map((n) => ({ nodo: n, viejo: 'if (pasado > PLAZO_MS || vuelta >= MAX_PASOS) return', nuevo: "// 05-nov · si este turno fue el cierre, la próxima vuelta recoge la firma ya pagada sin gastar: el plazo no la corta\nconst acabaDeCerrar = /^cierre/.test(String(b.paso || ''))\nif ((!acabaDeCerrar && pasado > PLAZO_MS) || vuelta >= MAX_PASOS) return" })),
]

export const N_BRIEF_SI = 'BRIEF · ¿hay plan?'
const BRIEF = 'BRIEF · sobre · pedir el parte a la sala (E-brief · CC#2)'
const CABLE = 'Cable · ¿volvió? · plan'
const SIN_VUELTA = "(function () { try { return $('¿Llegó la vuelta?').last().json.llego_la_vuelta === false } catch (e) { return false } })()"

export function construirRedactorConAcuse(f) {
  // H3
  const pedir = nodo(f, PEDIR)
  const cuerpo = pedir.parameters.jsonBody
  const i = typeof cuerpo === 'string' ? cuerpo.indexOf('force_restart: ') : -1
  const fin = ' }) }}'
  if (i < 0 || cuerpo.indexOf('force_restart: ', i + 1) >= 0 || !cuerpo.endsWith(fin)) throw new Error('«' + PEDIR + '» cambió de forma: no se aplica a ciegas')
  pedir.parameters.jsonBody = cuerpo.slice(0, i) + 'force_restart: true' + fin

  // H10
  const espera = nodo(f, ESPERAR)
  if (espera.parameters.resumeAmount !== 86400 || espera.parameters.resumeUnit !== 'seconds') throw new Error('«' + ESPERAR + '» cambió de forma: no se aplica a ciegas')
  espera.parameters.resumeAmount = ESPERA_S

  // H2
  const cerrarDe = nodo(f, 'V9 · cerrar la corrida')
  agregarNodo(f, codigo(N_ACUSE, CODIGO_ACUSE), PEDIR, 200, 180)
  agregarNodo(f, si(N_SI_RECHAZO, '={{ $json.redactor_rechazado }}'), PEDIR, 400, 180)
  const cerrar = agregarNodo(f, { name: N_CERRAR, type: 'n8n-nodes-base.httpRequest', typeVersion: cerrarDe.typeVersion, onError: 'continueRegularOutput', parameters: JSON.parse(JSON.stringify(cerrarDe.parameters)) }, PEDIR, 600, 300)
  cerrar.parameters.options = { ...cerrar.parameters.options, timeout: 60000 }
  agregarNodo(f, codigo(N_PARAR, CODIGO_PARAR), PEDIR, 800, 300)
  redirigir(f, PEDIR, ESPERAR, N_ACUSE)
  conectar(f, N_ACUSE, N_SI_RECHAZO)
  conectar(f, N_SI_RECHAZO, N_CERRAR, 0)
  conectar(f, N_SI_RECHAZO, ESPERAR, 1)
  conectar(f, N_CERRAR, N_PARAR)

  // H11
  cambiarCodigo(f, 'V9 · armar el cierre', 'if (!pide) return [{ json: { aplica: false } }]', 'if (!pide) return [{ json: { aplica: false } }]\n// 05-nov · sin plan no se cierra como entregado: lo cierra «C · sin vuelta» como fallida\nif (' + SIN_VUELTA + ') return [{ json: { aplica: false } }]')
  agregarNodo(f, si(N_BRIEF_SI, '={{ ' + SIN_VUELTA + ' }}'), BRIEF, -200, 180)
  redirigir(f, CABLE, BRIEF, N_BRIEF_SI)
  conectar(f, N_BRIEF_SI, BRIEF, 1)

  // H6
  for (const p of PLAZOS) cambiarCodigo(f, p.nodo, p.viejo, p.nuevo)
}
