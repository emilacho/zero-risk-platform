// ② LA VUELTA DEL AGENTE (o el portero) · CC#2 · 2026-10-09 · convierte lo que volvió en el cuerpo de `POST /api/oficina/turnos {accion:'resultado'}`.
// Un fallo declarado del agente (`success:false`: corte por tope, etc.) NO es una vuelta: su texto, si trae, es PARCIAL y no se manda como respuesta (se manda el error).
// El costo es el que reporta el corredor (el libro de la sala lo suma); sin costo reportado se manda 0 y la sala lo declara.
const c = $('② Armar el pedido').first().json
const e = $input.first().json || {}
const cuerpo = e.body ? e.body : e
const fallo = cuerpo.success === false ? String(cuerpo.error || cuerpo.error_kind || 'sin detalle') : null
const texto = fallo ? '' : String(cuerpo.response || cuerpo.result || cuerpo.output || cuerpo.text || '')
const costo = typeof cuerpo.cost_usd === 'number' ? cuerpo.cost_usd : (typeof cuerpo.costUsd === 'number' ? cuerpo.costUsd : 0)
const body = { accion: 'resultado', encargo_id: c.encargo_id, n: c.turno.n, costo_usd: costo, workflow_execution_id: $execution.id }
if (fallo) body.error = 'el agente FALLÓ · ' + fallo + (cuerpo.partial === true ? ' · (había texto parcial: no se usa)' : '')
else if (texto.trim() === '') body.error = 'la vuelta del agente llegó vacía (o se agotó la espera)'
else body.texto = texto
if (typeof cuerpo.tokens_in === 'number') body.tokens_in = cuerpo.tokens_in
if (typeof cuerpo.tokens_out === 'number') body.tokens_out = cuerpo.tokens_out
return [{ json: { ...c, resultado_body: body } }]
