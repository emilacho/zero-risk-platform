// ② SIMULACRO · SOLO en seco: la respuesta enlatada del agente para esta vuelta (cero llamadas al modelo, US$ 0). En real este nodo NO existe en el camino.
// Cada elemento del simulacro es el objeto estructurado que el agente devolvería, o `{ "__fallo": "texto" }` para simular una llamada que falla.
const s = $input.first().json
const lista = Array.isArray(s.simulacro) ? s.simulacro : []
const sim = lista[s.vuelta]
if (sim === undefined) throw new Error('CADENA_SIMULACRO_AGOTADO · el ensayo no trae respuesta simulada para la vuelta ' + s.vuelta)
const body = sim && sim.__fallo ? { success: false, error: String(sim.__fallo), cost_usd: 0 } : { success: true, structured_output: sim, cost_usd: 0 }
return [{ json: { ...s, agente: { statusCode: 200, body } } }]
