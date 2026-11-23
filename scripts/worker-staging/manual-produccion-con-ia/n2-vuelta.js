// ② Vuelta del agente: éxito con texto → se escribe; «esperando al cerebro» (503 del encargo 15) o cualquier fallo → fin claro, reintentable.
const e = $('① Guarda').first().json
const r = $input.first().json
const body = r.body ? r.body : r
if (!body || body.success !== true || typeof body.response !== 'string' || !body.response.trim()) {
  const esperando = body && (body.estado === 'esperando_al_cerebro' || (typeof body.error === 'string' && body.error.indexOf('esperando_al_cerebro') === 0))
  return [{ json: { ...e, sigue: false, fin: { ok: false, error: esperando ? 'esperando_al_cerebro' : (body && body.error) || 'agente_fallo', detalle: esperando ? 'el cerebro no responde: este mismo paso se reintenta cuando vuelva' : 'el agente no entregó la prosa' } } }]
}
return [{ json: { ...e, sigue: true, texto: body.response.trim(), costo_usd: typeof body.costUsd === 'number' ? body.costUsd : null } }]
