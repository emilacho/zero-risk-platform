// «Marcar avisados» · CC#1 · 2026-09-30. Lección E81 de los avisos: la marca «avisado» se pone SOLO cuando Slack confirma ok:true.
// Si Slack no confirmó, NO se marca (el próximo reloj vuelve a intentar) y la corrida falla RUIDOSA para que se vea.
const previo = $('Armar el aviso').first().json
const r = $input.first().json || {}
const slack = r.body ? r.body : r
if (!slack || slack.ok !== true) {
  throw new Error('RECONCILIADOR_AVISO_NO_LLEGO · Slack no confirmó ok:true (' + String((slack && slack.error) || 'sin respuesta') + ') · los hallazgos NO se marcan avisados · se reintenta en el próximo reloj')
}
const SB = 'https://ordaeyxvvvdqsznsecjx.supabase.co'
const auth = { apikey: $env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + $env.SUPABASE_SERVICE_ROLE_KEY }
const w = await this.helpers.httpRequest({
  url: SB + '/rest/v1/agent_dispatch_reconciliations?dispatch_key=in.(' + previo.claves.map((k) => '"' + k + '"').join(',') + ')', method: 'PATCH', json: true,
  body: { avisado_el: new Date().toISOString() }, returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 30000, headers: { ...auth, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
})
if (w.statusCode >= 300) throw new Error('RECONCILIADOR_SIN_MARCAR · HTTP ' + w.statusCode)
return [{ json: { avisados: previo.claves.length } }]
