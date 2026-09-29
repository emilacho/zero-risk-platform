// ⑥ SIN VUELTA · DECLARA · CC#1 · 2026-09-29. Se llega aquí cuando NO llegó la lista, o llegó pero no es legible, o falta la vuelta de alguna tanda.
// REGLA DE EMILIO (29-sep): si no llegó la vuelta, el flujo NO guarda NADA: ni fila en client_historical_outputs, ni Drive.
// Lo único que hace es AVISAR a la sala que terminó sin parte (para que su marca no quede sin resolver) y dejar el motivo escrito.
// (Motivo medido en la corrida 157555: antes se guardaba un parte vacío, se mandaba un PDF vacío y esa fila bloqueaba el reintento.)
const env = $('⓪ Sobre · llave · modo seco').first().json
let motivo = 'la vuelta no llegó'
let detalle = {}
try {
  const l = $('③a ¿Llegó la lista?').first().json
  motivo = l.motivo || motivo
  detalle.lista_llego = l.lista_llego
  detalle.lista_ok = l.lista_ok
  if (l.error_del_corredor) detalle.error_del_corredor = l.error_del_corredor
} catch (e) { /* la lista ni se pidió */ }
try {
  const j = $input.first().json
  if (j && j.motivo) motivo = j.motivo
  if (j && Array.isArray(j.tandas_sin_vuelta)) detalle.tandas_sin_vuelta = j.tandas_sin_vuelta
  if (j && Array.isArray(j.tandas_ilegibles)) detalle.tandas_ilegibles = j.tandas_ilegibles
} catch (e) { /* sin detalle de tandas */ }
return [{
  json: {
    dry_run: env.dry_run === true,
    sin_vuelta: true,
    escribio_algo: false,
    motivo,
    detalle,
    client_id: env.client_id,
    payload_cable: {
      event_type: 'run_completed',
      worker_id: $workflow.id,
      worker_name: 'brief',
      resultado: 'parte_sin_vuelta',
      motivo: String(motivo).slice(0, 300),
      client_id: env.client_id,
      tenant_id: env.tenant_id || env.client_id,
      _sala_correlation_id: env._sala_correlation_id || null,
      _journey_id: env._journey_id || null,
      ts: new Date().toISOString(),
    },
  },
}]
