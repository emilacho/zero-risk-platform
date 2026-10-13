// ③ ¿Y AHORA? · CC#2 · J4 · 2026-10-13 · decide qué sigue con la respuesta REAL de `POST /api/jefatura/turnos` (statusCode + body).
//   200 `esperar` → el SIGUIENTE paso: se vuelve a despertar este mismo flujo (una ejecución por paso: ninguna pasa de unos minutos)
//   200 `cerrado` → la revisión terminó (limpia, con desacuerdo, sin segunda mirada, incompleta por tope o fallida): se ENTREGA al llamador según `devolver_a`:
//                     · `devolver.tipo = 'webhook'` → se manda `devolver.cuerpo` a `devolver.url` (SOLO si la dirección es de nuestro n8n o de nuestro Vercel: nada sale a un tercero)
//                     · `devolver.tipo = 'sala_ref'` o ausente con `sala_ref` → el CABLE a la sala con el resultado REAL
//                     · `devolver.tipo = 'ninguno'` → nada (la ruta ya guardó todo; p. ej. las pruebas de la jefatura)
//   cualquier otra respuesta (409 turno no esperado, 5xx…) → se DETIENE con su motivo (nunca se da por bien)
const c = $('⓪ Entrada · llave').first().json
const e = $input.first().json || {}
if (e.error && typeof e.error === 'object') throw new Error('JEFATURA_RESULTADO_NO_LLEGO · POST /api/jefatura/turnos falló antes de recibir respuesta (' + String(e.error.message || e.error.name || 'sin detalle').slice(0, 160) + ')')
const status = Number(e.statusCode)
const b = e.body && typeof e.body === 'object' ? e.body : {}
// «ya hay un paso esperando respuesta» llega como `esperar` SIN pedido: aquí no se despierta nada (se DETIENE con su motivo, no se manda un turno vacío a otro flujo)
if (status === 200 && b.accion === 'esperar' && b.turno && !b.turno.pedido) throw new Error('JEFATURA_ESPERA_SIN_PEDIDO · la ruta contestó «esperar» sin el pedido del paso (' + String(b.nota || 'sin nota').slice(0, 120) + ') · se DETIENE')
if (status === 200 && b.accion === 'esperar' && b.turno) return [{ json: { ruta: 'esperar', turno_body: { revision_id: c.revision_id, turno: b.turno } } }]
if (status === 200 && b.accion === 'cerrado') {
  const dev = b.devolver && typeof b.devolver === 'object' ? b.devolver : null
  const ref = b.sala_ref && typeof b.sala_ref === 'object' ? b.sala_ref : {}
  const tipo = dev && typeof dev.tipo === 'string' ? dev.tipo : (b.sala_ref ? 'sala_ref' : 'ninguno')
  if (tipo === 'webhook') {
    // solo destinos REALES de un llamador (certificación de CC#3 · J4 reparo 4): los webhooks de nuestro n8n (la base ya es `…/webhook`) y SOLO las rutas `/api/jefatura/` de nuestro Vercel (no cualquier ruta suya); la llave de despacho viaja en esta entrega
    const permitidas = [String($env.N8N_WEBHOOK_BASE || 'https://n8n-production-72be.up.railway.app/webhook').replace(/\/+$/, '') + '/', 'https://zero-risk-platform.vercel.app/api/jefatura/']
    const url = String(dev.url || '')
    if (!permitidas.some((p) => url.startsWith(p))) throw new Error('JEFATURA_DESTINO_NO_PERMITIDO · devolver.url no es de nuestro n8n ni de nuestro Vercel · no se entrega a un tercero · se DETIENE (' + url.slice(0, 80) + ')')
    return [{ json: { ruta: 'webhook', entrega_url: url, entrega_cuerpo: { revision_id: c.revision_id, resultado: String(b.resultado || 'fallida'), ...(dev.cuerpo && typeof dev.cuerpo === 'object' ? dev.cuerpo : {}) } } }]
  }
  if (tipo === 'sala_ref') {
    return [{ json: { ruta: 'cable', payload_cable: {
      event_type: 'run_completed', worker_id: $workflow.id, worker_name: 'jefatura',
      resultado: String(b.resultado_para_la_sala || b.resultado || 'fallido'), revision_id: c.revision_id, con_desacuerdo: b.marcas && b.marcas.con_desacuerdo === true, sin_segunda_mirada: b.marcas && b.marcas.sin_segunda_mirada === true, simulado: b.simulado === true,
      _sala_correlation_id: ref._sala_correlation_id || null, _journey_id: ref._journey_id || null, ts: new Date().toISOString(),
    } } }]
  }
  return [{ json: { ruta: 'nada' } }]
}
throw new Error('JEFATURA_TURNO_RECHAZADO · /api/jefatura/turnos contestó ' + status + ' · ' + String(b.error || b.detalle || JSON.stringify(b)).slice(0, 240) + ' · se DETIENE')
