// EXTRACTOR PURO del resultado de UNA ejecución del flujo del brief · CC#1 · 2026-09-30.
// Recibe el `runData` de n8n y devuelve lo que interesa de la corrida (sin tocar red ni base). Lo usa `corrida-real-brief.mjs` y lo prueban las pruebas con datos sintéticos.
const salida0 = (runData, nodo, i = 0) => runData?.[nodo]?.[i]?.data?.main?.[0]?.[0]?.json
const cuerpoHttp = (j) => (j && j.body && typeof j.body === 'object' ? j.body : j)

export function resumenDeLaCorrida(exec) {
  const rd = exec?.data?.resultData?.runData || {}
  const j = (n, i) => salida0(rd, n, i)
  const nodos = []
  for (const [nombre, runs] of Object.entries(rd)) for (const r of runs) nodos.push({ nombre, t: r.startTime })
  nodos.sort((a, b) => a.t - b.t)
  const sobre = j('⓪ Sobre · llave · modo seco') || {}
  const cuerpo = (j('③ Armar el cuerpo del redactor') || {}).cuerpo || {}
  const espera = cuerpoHttp(j('③ Esperar al redactor')) || {}
  const llego = j('③ ¿Llegó la vuelta?') || {}
  const ch = j('④ Chequeos') || {}
  const guardar = cuerpoHttp(j('⑤ Guardar el parte'))
  const fila = Array.isArray(guardar) ? guardar[0] : guardar
  const drive = cuerpoHttp(j('⑤ Parte a Drive')) || {}
  const cierre = j('⑤ ¿Guardó y salió el PDF?') || {}
  const cable = cuerpoHttp(j('⑥ Cable de vuelta · sala')) || {}
  const volvio = j('⑥ Cable · ¿volvió?') || {}
  const seco = j('⑤ Seco · lo que se habría escrito')
  const primero = nodos[0]?.t, ultimo = exec?.stoppedAt && exec?.startedAt ? Date.parse(exec.stoppedAt) - Date.parse(exec.startedAt) : null
  return {
    ejecucion: exec?.id ?? null,
    estado: exec?.status ?? null,
    error: exec?.data?.resultData?.error?.message || null,
    ultimo_nodo: exec?.data?.resultData?.lastNodeExecuted || null,
    duracion_s: ultimo === null ? null : Math.round(ultimo / 1000),
    nodos_ejecutados: nodos.length,
    modo_seco: !!seco,
    sobre: { dry_run: sobre.dry_run, forzar: sobre.forzar, tope_usd: sobre.tope_usd ?? null },
    cuerpo_al_redactor: { dry_run: cuerpo.dry_run, max_budget_usd: cuerpo.max_budget_usd ?? null, callback_mode: cuerpo.callback_mode ?? null, agent: cuerpo.agent },
    vuelta: { delivered_by: espera.delivered_by ?? null, success: espera.success ?? null, cost_usd: espera.cost_usd ?? null, model: espera.model ?? null, error: espera.error ?? null },
    llego: { llego_la_vuelta: llego.llego_la_vuelta ?? null, caracteres: llego.caracteres ?? null, falla_del_redactor: llego.falla_del_redactor ?? null, costo_usd: llego.vuelta_costo_usd ?? null, motivo: llego.motivo ?? null },
    chequeos: {
      parte_legible: ch.parte_legible ?? null, parte_reparado: ch.parte_reparado ?? null, comillas_reparadas: ch.comillas_reparadas ?? null, parte_valido: ch.parte_valido ?? null, motivo_invalido: ch.motivo_invalido ?? null, chequeos_ok: ch.chequeos_ok ?? null,
      entregables: ch.entregables ?? null, pendientes_declarados: ch.pendientes_declarados ?? null, titulo: ch.titulo_parte ?? null,
      hallazgos: Array.isArray(ch.hallazgos) ? ch.hallazgos.map((h) => ({ chequeo: h.chequeo, entregable: h.entregable, detalle: String(h.detalle || '').slice(0, 200) })) : [],
      por_chequeo: ch.por_chequeo ?? null,
    },
    guardado: { id: fila?.id ?? null },
    drive: { ok: drive.ok ?? null, file_id: drive.file_id ?? null, url: drive.url ?? null, motivo: drive.motivo ?? null },
    cierre: { ok: cierre.ok ?? null, hay_pdf: cierre.hay_pdf ?? null, parte_guardado: cierre.parte_guardado ?? null, parte_valido: cierre.parte_valido ?? null, problemas: cierre.problemas ?? [] },
    cable: { ok: cable.ok ?? null, event_id: cable.event_id ?? null, code: cable.code ?? null },
    cable_volvio: { vuelta_ok: volvio.vuelta_ok ?? null, detalle: volvio.vuelta_detalle ?? null, cierre: volvio.cierre ?? null },
    seco: seco ? { escrituras_reales: seco.escrituras_reales, habria_cerrado_como: seco.habria_cerrado_como } : null,
    _primero: primero ?? null,
  }
}

/** ¿la corrida cumple lo que Emilio quiere ver? · cada punto con su veredicto y por qué (para el papel de resultado) */
export function veredictoDeLaCorrida(r, { topeAutorizadoUsd, costoRealUsd }) {
  const v = []
  const p = (punto, ok, detalle) => v.push({ punto, ok, detalle })
  p('corrida REAL (no seca)', r.sobre.dry_run === false && r.modo_seco === false, `dry_run=${r.sobre.dry_run} · seco=${r.modo_seco}`)
  p('la vuelta entró por el corredor', r.vuelta.delivered_by === 'runner', `delivered_by=${r.vuelta.delivered_by}`)
  p('el redactor recibió el tope', typeof r.cuerpo_al_redactor.max_budget_usd === 'number', `max_budget_usd=${r.cuerpo_al_redactor.max_budget_usd}`)
  p('el parte trae su lista de entregables', (r.chequeos.entregables ?? 0) > 0, `entregables=${r.chequeos.entregables}`)
  p('el parte es válido (o, si no, lo dice)', r.chequeos.parte_valido === true || (r.chequeos.parte_valido === false && !!r.chequeos.motivo_invalido), `válido=${r.chequeos.parte_valido} · motivo=${r.chequeos.motivo_invalido}`)
  p('el parte quedó guardado', !!r.guardado.id, `id=${r.guardado.id}`)
  p('el PDF salió a Drive', r.drive.ok === true && !!r.drive.file_id, `ok=${r.drive.ok} · file_id=${r.drive.file_id}`)
  p('el cable de vuelta volvió con su asiento', r.cable_volvio.vuelta_ok === true, `vuelta_ok=${r.cable_volvio.vuelta_ok} · ${r.cable_volvio.detalle}`)
  p('un parte inválido NO cierra en verde', r.chequeos.parte_valido !== false || r.estado === 'error', `parte_valido=${r.chequeos.parte_valido} · estado=${r.estado}`)
  p('el gasto quedó dentro del tope autorizado', typeof costoRealUsd === 'number' && costoRealUsd <= topeAutorizadoUsd, `gastado=US$ ${costoRealUsd} · tope=US$ ${topeAutorizadoUsd}`)
  return v
}
