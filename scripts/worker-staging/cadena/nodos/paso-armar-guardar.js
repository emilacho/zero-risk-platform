// ③ ARMAR `guardar` · lo que volvió del agente (o del simulacro) tal cual, sin interpretarlo: el código de la ruta decide si sirve
const entrada = $input.first().json || {}
const simulado = !!(entrada.agente && entrada.paso)
const s = simulado ? entrada : $('② Armar la llamada').last().json
const resp = simulado ? entrada.agente : entrada
const b = resp.body && typeof resp.body === 'object' ? resp.body : {}
// un corte de la llamada (red, 290 s) llega como `{ error: { message } }` sin statusCode: se cuenta como llamada FALLIDA con sus palabras
const corte = resp.error && typeof resp.error === 'object' ? String(resp.error.message || resp.error.name || 'la llamada se cortó') : (typeof resp.error === 'string' ? resp.error : null)
const ok = Number(resp.statusCode) === 200 && b.success === true
const resultado = ok
  ? { success: true, structured_output: b.structured_output, cost_usd: typeof b.cost_usd === 'number' ? b.cost_usd : null, cerrada_por_tope: b.cerrada_por_tope === true }
  : { success: false, error: String(b.error || b.detail || (corte ? 'LLAMADA_CORTADA · ' + corte : 'HTTP ' + resp.statusCode)).slice(0, 400), cost_usd: typeof b.cost_usd === 'number' ? b.cost_usd : null, cerrada_por_tope: b.cerrada_por_tope === true }
const guardar = { accion: 'guardar', campana_id: s.campana_id, seco: s.seco, corrida_id: s.corrida_id, resultado, correccion: !!s.correccion, workflow_id: s.workflow_id, workflow_execution_id: s.workflow_execution_id }
if (s.tanda !== null && s.tanda !== undefined) { guardar.tanda = s.tanda; guardar.modo = s.correccion && s.correccion.modo ? s.correccion.modo : 'tanda' }
return [{ json: { ...s, guardar } }]
