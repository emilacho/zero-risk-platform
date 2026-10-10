// ② LA AMPLIACIÓN (paso 1, lo que el flujo de la mañana NO cubre) · ejecuta SOLO lo que la ruta `plan` dejó en `acciones` de CADA cliente (ya recortado al tope de US$ 1,00 por cliente y día).
// 🔴 Con `dry_run` NO llama a nadie. 🔴 Una llamada al Servicio por acción, SIN reintento (cada una paga). 🔴 Dos fallas seguidas por cliente ⇒ para a ese cliente. Este nodo NO lee ninguna tabla: lo decide la ruta.
// El Servicio guarda lo crudo en `apify_raw` (destino `respuesta`); lo que cuesta se mide con la API de Apify y se informa a `correr`, que lo compara con el tope.
// Procesa TODOS los elementos (uno por cliente), en orden, y devuelve uno por cliente.
const N8N = 'https://n8n-production-72be.up.railway.app'
const http = async (o) => this.helpers.httpRequest({ json: true, returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 140000, ...o })
const salidas = []
for (const item of $input.all()) {
  const e = item.json
  const salida = { ...e, ampliacion: { hecho: false, llamadas: [], gasto_usd: 0, parado: null } }
  if (e.falla || !e.cliente) { salidas.push({ json: salida }); continue }
  if (e.dry_run === true) { salida.ampliacion.nota = 'dry_run: no se llamó a ningún proveedor'; salidas.push({ json: salida }); continue }
  let seguidasConFalla = 0
  for (const a of e.acciones || []) {
    const t0 = Date.now()
    const r = await http({ url: N8N + '/webhook/apify-service-workflow', method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: { client_id: e.cliente, apify_function: a.funcion, params: a.params, destination: 'respuesta', dry_run: false, metadata: { ...(a.metadata || {}), calling_workflow_id: e.workflow_id } } })
    const b = r.body && typeof r.body === 'object' ? r.body : {}
    const ll = { fuente: a.fuente, funcion: a.funcion, hecho: r.statusCode === 200 && b.ok === true, http: r.statusCode, ms: Date.now() - t0, apify_run_id: b.apify_run_id || null, usd_max: a.usd_max, medido: a.medido }
    if (!ll.hecho) ll.error = String(b.error || b.message || b.validation_errors || '').slice(0, 160)
    let costo = typeof a.usd_max === 'number' ? a.usd_max : 0 // sin dato real, se cuenta el MÁXIMO (nunca 0 para decir «no sé»)
    if (ll.apify_run_id && $env.APIFY_API_TOKEN) {
      const u = await http({ url: 'https://api.apify.com/v2/actor-runs/' + ll.apify_run_id + '?token=' + $env.APIFY_API_TOKEN, method: 'GET', headers: {} })
      const d = u.body && u.body.data
      if (d && d.usageTotalUsd !== undefined) { ll.costo_real_usd = Number(d.usageTotalUsd); costo = ll.costo_real_usd }
    }
    ll.costo_contado_usd = costo
    salida.ampliacion.gasto_usd = Number((salida.ampliacion.gasto_usd + costo).toFixed(6))
    salida.ampliacion.llamadas.push(ll)
    seguidasConFalla = ll.hecho ? 0 : seguidasConFalla + 1
    if (seguidasConFalla >= 2) { salida.ampliacion.parado = 'dos_fallas_seguidas'; break }
  }
  salida.ampliacion.hecho = salida.ampliacion.llamadas.length > 0 && salida.ampliacion.llamadas.every((l) => l.hecho)
  salidas.push({ json: salida })
}
return salidas
