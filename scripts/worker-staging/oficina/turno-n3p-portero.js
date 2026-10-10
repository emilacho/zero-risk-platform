// ① EL PORTERO · CC#2 · 2026-10-09 · convierte la respuesta del flujo `zero-risk/portero` (o el modo seco) en el cuerpo de `POST /api/oficina/turnos {accion:'resultado'}`.
// El texto del portero es OPACO para la sala (se le pasa a los agentes tal cual); un error del portero no frena la oficina por sí solo: se manda como error y la sala decide (cierra fallido: sin material no se sigue a ciegas).
// 🔴 El contrato de la respuesta del portero NO está verificado campo a campo: se manda la respuesta entera como texto.
const e = $('⓪ Entrada · llave').first().json
const r = $input.first().json || {}
if (e.dry_run === true) {
  return [{ json: { ...e, resultado_body: { accion: 'resultado', encargo_id: e.encargo_id, n: e.turno.n, texto: '(simulado) material del portero: sin llamada al portero en modo seco', costo_usd: 0, workflow_execution_id: $execution.id } } }]
}
const b = r.body && typeof r.body === 'object' ? r.body : r
const body = { accion: 'resultado', encargo_id: e.encargo_id, n: e.turno.n, workflow_execution_id: $execution.id, costo_usd: typeof b.costo_usd === 'number' ? b.costo_usd : (typeof b.cost_usd === 'number' ? b.cost_usd : 0) }
if (b.error && typeof b.error === 'object') body.error = 'el portero no respondió · ' + String(b.error.message || 'sin detalle').slice(0, 200)
else if (b.rechazo) body.error = 'el portero rechazó el pedido · ' + JSON.stringify(b.rechazo).slice(0, 240)
else if (Object.keys(b).length === 0) body.error = 'el portero contestó vacío'
else body.texto = JSON.stringify(b).slice(0, 20000)
return [{ json: { ...e, resultado_body: body } }]
