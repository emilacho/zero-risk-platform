// «Reconciliar» · el cuerpo del nodo del reloj · CC#1 · 2026-09-30. La lógica pura `clasificar.js` va ANTEPUESTA por el constructor.
// Lee (solo lectura) los despachos de las últimas 72 h + sus invocaciones + sus intentos de vuelta, los clasifica, y registra en
// `agent_dispatch_reconciliations` lo que hay que ver. NO toca `agent_dispatches`, ni el corredor, ni Vercel, ni ningún flujo.
// `SOLO_LECTURA` (lo inyecta el constructor: true SOLO en la copia de prueba) clasifica y devuelve, sin escribir ni avisar.
const SB = 'https://ordaeyxvvvdqsznsecjx.supabase.co'
const auth = { apikey: $env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + $env.SUPABASE_SERVICE_ROLE_KEY }
const VENTANA_H = 72
const ahora = Date.now()
const desde = new Date(ahora - VENTANA_H * 3600 * 1000).toISOString()
const leer = async (ruta) => this.helpers.httpRequest({ url: SB + '/rest/v1/' + ruta, method: 'GET', json: true, timeout: 30000, headers: auth })
const escribir = async (metodo, ruta, cuerpo, extra) => this.helpers.httpRequest({
  url: SB + '/rest/v1/' + ruta, method: metodo, json: true, body: cuerpo, returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 30000,
  headers: { ...auth, 'Content-Type': 'application/json', ...(extra || {}) },
})

const despachos = await leer('agent_dispatches?created_at=gte.' + desde + '&select=id,dispatch_key,workflow_execution_id,agent_name,client_id,status,created_at,running_at,completed_at&order=created_at&limit=1000')
const ejecs = [...new Set(despachos.map((d) => String(d.workflow_execution_id)).filter((x) => x && x !== 'null'))]
const invocaciones = ejecs.length
  ? await leer('agent_invocations?workflow_execution_id=in.(' + ejecs.join(',') + ')&created_at=gte.' + new Date(ahora - (VENTANA_H + 1) * 3600 * 1000).toISOString() + '&select=id,workflow_execution_id,agent_name,created_at,duration_ms,cost_usd,status&limit=2000')
  : []
const intentos = await leer('agent_callback_attempts?created_at=gte.' + desde + '&select=callback_url,attempt_number,status,http_status_code,attempted_at,created_at&limit=5000')
const clave = (d) => d.dispatch_key || 'id:' + d.id
const resultados = reconciliar(despachos, invocaciones, intentos, ahora)
const aRegistrar = resultados.filter((r) => r.resultado.severidad === 'alta' || r.resultado.severidad === 'info')
const resumen = { despachos: despachos.length, ok: resultados.filter((r) => r.resultado.severidad === 'ok').length, info: aRegistrar.filter((r) => r.resultado.severidad === 'info').length, alta: aRegistrar.filter((r) => r.resultado.severidad === 'alta').length }
const detalle = resultados.map((r) => ({ ejecucion: String(r.despacho.workflow_execution_id), agente: r.despacho.agent_name, estado: r.despacho.status, clasificacion: r.resultado.clasificacion, severidad: r.resultado.severidad }))

if (SOLO_LECTURA) return [{ json: { modo: 'solo_lectura', resumen, detalle, avisos: [], escribio: false } }]

// lo ya registrado y sin resolver (para no avisar dos veces y para marcar lo resuelto)
const existentes = await leer('agent_dispatch_reconciliations?resuelta_el=is.null&select=dispatch_key,avisado_el,clasificacion')
const yaAvisado = {}
existentes.forEach((e) => { yaAvisado[e.dispatch_key] = !!e.avisado_el })

const ts = new Date(ahora).toISOString()
if (aRegistrar.length) {
  const filas = aRegistrar.map((r) => ({
    dispatch_key: clave(r.despacho), agente: r.despacho.agent_name, ejecucion: String(r.despacho.workflow_execution_id), cliente: r.despacho.client_id || null,
    clasificacion: r.resultado.clasificacion, severidad: r.resultado.severidad, que: r.resultado.que, evidencia: r.resultado.evidencia, ultima_vez: ts, resuelta_el: null,
  }))
  // merge-duplicates: en una fila que ya existe solo se actualizan las columnas del cuerpo (primera_vez y avisado_el NO se pisan)
  const w = await escribir('POST', 'agent_dispatch_reconciliations?on_conflict=dispatch_key', filas, { Prefer: 'resolution=merge-duplicates,return=minimal' })
  if (w.statusCode >= 300) throw new Error('RECONCILIADOR_SIN_ANOTAR · la tabla respondió HTTP ' + w.statusCode + ' · ' + JSON.stringify(w.body).slice(0, 240))
}
// lo que ya no es un problema (el despacho se cerró / llegó la vuelta) se marca resuelto
const vigentes = {}
aRegistrar.forEach((r) => { vigentes[clave(r.despacho)] = true })
const resueltos = existentes.map((e) => e.dispatch_key).filter((k) => !vigentes[k])
if (resueltos.length) {
  const p = await escribir('PATCH', 'agent_dispatch_reconciliations?dispatch_key=in.(' + resueltos.map((k) => '"' + k + '"').join(',') + ')', { resuelta_el: ts }, { Prefer: 'return=minimal' })
  if (p.statusCode >= 300) throw new Error('RECONCILIADOR_SIN_RESOLVER · HTTP ' + p.statusCode)
}
const avisos = aRegistrar
  .filter((r) => r.resultado.severidad === 'alta' && !yaAvisado[clave(r.despacho)])
  .map((r) => ({
    dispatch_key: clave(r.despacho), clasificacion: r.resultado.clasificacion, que: r.resultado.que, agente: r.despacho.agent_name,
    ejecucion: String(r.despacho.workflow_execution_id), edad_s: r.resultado.evidencia.edad_s, invocacion: r.resultado.evidencia.invocacion,
    intentos: r.resultado.evidencia.intentos_de_vuelta, ultimo_intento: r.resultado.evidencia.ultimo_intento,
  }))
return [{ json: { modo: 'real', resumen, avisos, resueltos: resueltos.length, escribio: true } }]
