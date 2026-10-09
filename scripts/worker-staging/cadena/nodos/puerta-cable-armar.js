// CABLE · ARMAR EL PEDIDO DE CIERRE · UN solo cable por viaje, y lo manda LA PUERTA con su `worker_id` (los sub-flujos no llaman a la sala): así la sala rotula el viaje como BRIEF
// El resultado ∈ cadena_abierta · lote_briefeado · necesita_humano · plan_no_coincide · pasarela_ok. El que arma el payload es la ruta (`cierre`), con el id de la puerta guardado en cadena_config.
const s = $input.first().json
const ok = ['cadena_abierta', 'lote_briefeado', 'necesita_humano', 'plan_no_coincide', 'pasarela_ok']
if (!ok.includes(s.resultado)) throw new Error('PUERTA_RESULTADO_INVALIDO · ' + JSON.stringify(s.resultado))
const pedido = { accion: 'cierre', resultado: s.resultado, client_id: s.client_id, journey_id: s._journey_id, sala_correlation_id: s._sala_correlation_id, workflow_id: String($workflow.id), workflow_execution_id: String($execution.id) }
if (s.campana_id) pedido.campana_id = s.campana_id
return [{ json: { ...s, pedido_cierre: pedido } }]
