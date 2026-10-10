// ⑤ ARMAR `guardar` · el resultado del agente tal cual + las páginas: el CÓDIGO comprueba cada cita contra el texto descargado
const entrada = $input.first().json || {}
const simulado = !!(entrada.agente && entrada.paso)
const s = simulado ? entrada : $('④ Armar la llamada').last().json
const resp = simulado ? entrada.agente : entrada
const b = resp.body && typeof resp.body === 'object' ? resp.body : {}
// un corte de la llamada (red, 290 s) llega como `{ error: { message } }` sin statusCode: se cuenta como llamada FALLIDA con sus palabras
const corte = resp.error && typeof resp.error === 'object' ? String(resp.error.message || resp.error.name || 'la llamada se cortó') : (typeof resp.error === 'string' ? resp.error : null)
const ok = Number(resp.statusCode) === 200 && b.success === true
const resultado = ok
  ? { success: true, structured_output: b.structured_output, cost_usd: typeof b.cost_usd === 'number' ? b.cost_usd : null }
  : { success: false, error: String(b.error || b.detail || (corte ? 'LLAMADA_CORTADA · ' + corte : 'HTTP ' + resp.statusCode)).slice(0, 400), cost_usd: typeof b.cost_usd === 'number' ? b.cost_usd : null }
const paginas = $('③ Armar preparar').last().json.paginas || []
const guardar = { accion: 'guardar', campana_id: s.campana_id, seco: s.seco, corrida_id: s.corrida_id, pais: s.pais, tipo: s.tipo, ambito: s.ambito, anio: s.anio, paginas, resultado, workflow_id: s.workflow_id, workflow_execution_id: s.workflow_execution_id }
return [{ json: { ...s, guardar } }]
