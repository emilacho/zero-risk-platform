// ETIQUETADO DIARIO · bloque del nodo «② Ejecutar el plan y medir» del flujo `EZXAFQvKZsJlvGNO` (Cerebro · ponerse al día, diario) · relevo 21 (CC#1, firma de Emilio «SI APROBADO»).
// El flujo pega este archivo TAL CUAL dentro del nodo ②; la prueba `__tests__/cerebro-diario-etiquetado.test.ts` ejecuta ESTE MISMO texto con una base y una ruta simuladas.
// Qué hace: después de raspar, pide `etiquetar` (la ruta del portero, UNA llamada al modelo por foto, sin reintentos) para cada foto PROPIA del cliente que todavía no tiene etiqueta.
//   · LEE solo el id y la marca de «etiquetada» de `client_social_images` (excepción declarada en el detector de flujos vivos) y el libro (`agent_invocations`) para contar intentos y gasto.
//   · NO escribe en ninguna tabla: la etiqueta la escribe la ruta del portero. Nunca manda `forzar` ni `solo_toma`.
// Topes (vienen escritos en el nodo ①, `plan.topes.etiquetar`): fotos por cliente y día · gasto de etiquetar por día (cualquier origen, leído del libro) · intentos por foto de por vida · paro si el modelo no responde.
async function etiquetarFotos(d) {
  const T = d.topes
  const salida = { tope: T, sin_etiqueta: 0, elegibles: 0, llamadas: [], gastado_usd: 0, gasto_de_hoy_antes_usd: null, agotadas: [], parado: null }
  const leer = async (url, headers) => d.leer(url, headers)
  const UUID = /^[0-9a-fA-F-]{36}$/
  if (!UUID.test(String(d.cliente))) { salida.parado = 'cliente_invalido'; return salida }
  // 1 · el gasto de HOY de quien etiqueta (también lo de una corrida a mano). Si no se puede leer, NO se etiqueta: un fallo de lectura nunca se lee como «hoy no se gastó nada».
  const hoy = await leer(d.SB + '/rest/v1/agent_invocations?select=cost_usd&agent_name=eq.etiquetador-del-cerebro&created_at=gte.' + d.hoy0 + '&limit=1000', d.auth)
  if (hoy.statusCode !== 200 || !Array.isArray(hoy.body)) { salida.parado = 'no_se_pudo_leer_el_gasto_de_hoy (HTTP ' + hoy.statusCode + ')'; return salida }
  const gastoHoy = hoy.body.reduce((s, x) => s + (Number(x.cost_usd) || 0), 0)
  salida.gasto_de_hoy_antes_usd = Number(gastoHoy.toFixed(6))
  // 2 · las fotos PROPIAS sin etiqueta, las más nuevas primero (se piden más que el tope para poder saltar las que ya agotaron sus intentos)
  const fotos = await leer(d.SB + '/rest/v1/client_social_images?select=id,etiquetada_en&client_id=eq.' + d.cliente + '&owner_role=eq.propio&etiquetada_en=is.null&order=posted_at.desc.nullslast&limit=' + T.fotos_por_cliente_dia * 4, d.auth)
  if (fotos.statusCode !== 200 || !Array.isArray(fotos.body)) { salida.parado = 'no_se_pudo_leer_las_fotos (HTTP ' + fotos.statusCode + ')'; return salida }
  const ids = fotos.body.map((f) => String(f.id)).filter((id) => UUID.test(id))
  salida.sin_etiqueta = ids.length
  if (!ids.length) return salida
  // 3 · intentos de cada una = llamadas al modelo que se COBRARON (costo > 0) y no dejaron etiqueta. Una llamada cortada por falta de saldo cuesta 0 y no gasta un intento.
  const lib = await leer(d.SB + '/rest/v1/agent_invocations?select=metadata&agent_name=eq.etiquetador-del-cerebro&cost_usd=gt.0&metadata-%3E%3Efoto_id=in.(' + ids.join(',') + ')&limit=1000', d.auth)
  if (lib.statusCode !== 200 || !Array.isArray(lib.body)) { salida.parado = 'no_se_pudo_leer_los_intentos (HTTP ' + lib.statusCode + ')'; return salida }
  const intentos = {}
  for (const r of lib.body) { const k = r && r.metadata && r.metadata.foto_id; if (k) intentos[k] = (intentos[k] || 0) + 1 }
  const elegibles = []
  for (const id of ids) { if ((intentos[id] || 0) >= T.intentos_por_foto) salida.agotadas.push({ foto: id, intentos: intentos[id] }); else elegibles.push(id) }
  salida.elegibles = elegibles.length
  // 4 · una por una: antes de CADA llamada se comprueba el tope del día contra el peor caso de una foto
  let seguidasSinModelo = 0
  for (const id of elegibles) {
    if (salida.llamadas.length >= T.fotos_por_cliente_dia) { salida.parado = 'tope_de_fotos_del_cliente'; break }
    if (gastoHoy + salida.gastado_usd + T.peor_caso_usd > T.usd_dia) { salida.parado = 'tope_de_gasto_del_dia'; break }
    const t0 = Date.now()
    const r = await d.enviar(d.API + '/api/brain/portero/etiquetar', { cliente: d.cliente, foto: id, workflow_id: d.flujoId, workflow_execution_id: d.ejecucionId })
    const b = r.body && typeof r.body === 'object' ? r.body : {}
    const costo = typeof b.costo_usd === 'number' && b.costo_usd >= 0 ? b.costo_usd : 0
    salida.gastado_usd = Number((salida.gastado_usd + costo).toFixed(6))
    const ll = { foto: id, http: r.statusCode, modo: b.modo || null, llamo_al_modelo: b.llamo_al_modelo === true, escribio: b.escribio === true, costo_usd: costo, columnas_escritas: b.columnas_escritas || null, ms: Date.now() - t0 }
    if (r.statusCode !== 200) ll.error = String(b.error || b.detail || '').slice(0, 160)
    if (b.motivo_de_respaldo) ll.motivo_de_respaldo = b.motivo_de_respaldo
    salida.llamadas.push(ll)
    // la puerta cerrada (llave, flujo) o el modelo caído: no se sigue golpeando
    if (r.statusCode === 401 || r.statusCode === 403) { salida.parado = 'la_ruta_rechazo (HTTP ' + r.statusCode + ')'; break }
    seguidasSinModelo = b.llamo_al_modelo === true ? 0 : seguidasSinModelo + 1
    if (seguidasSinModelo >= 2) { salida.parado = 'el_modelo_no_responde (2 seguidas)'; break }
  }
  return salida
}
