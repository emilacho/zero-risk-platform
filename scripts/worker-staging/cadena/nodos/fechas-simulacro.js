// ④ SIMULACRO · SOLO en seco: la respuesta enlatada del agente (cero llamadas al modelo)
const s = $input.first().json
const sim = s.simulacro && s.simulacro.respuesta
if (sim === undefined || sim === null) throw new Error('CADENA_SIMULACRO_AGOTADO · el ensayo no trae respuesta simulada para las fechas')
const body = sim.__fallo ? { success: false, error: String(sim.__fallo), cost_usd: 0 } : { success: true, structured_output: sim, cost_usd: 0 }
return [{ json: { ...s, agente: { statusCode: 200, body } } }]
