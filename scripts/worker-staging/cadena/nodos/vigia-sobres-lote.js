// 3 · UN SOBRE POR LOTE · a la sala (`cadena/vigia` · `briefear`), con clave de idempotencia `campana:semana-iso:version`: el mismo lote repetido no abre un viaje nuevo
const campanas = $('2 · Expandir').all()
const out = []
$input.all().forEach((r, i) => {
  const c = campanas[i] && campanas[i].json
  const j = r.json || {}
  const b = j.body && typeof j.body === 'object' ? j.body : {}
  if (!c) return
  if (Number(j.statusCode) !== 200) throw new Error('VIGIA_LOTES_' + String(b.code || b.error || j.statusCode) + ' · campaña ' + c.campana_id + ' · ' + String(b.detalle || b.detail || 'sin detalle'))
  for (const l of b.lotes || []) {
    out.push({ json: { sobre: {
      source: 'cadena/vigia', intent: 'briefear',
      payload: { modo: 'parte', campana_id: c.campana_id, lote: l.lote, fila_ids: l.fila_ids, dry_run: c.seco === true, client_id: c.client_id },
      idempotency_key: l.idempotency_key, logical_period: l.lote, tenant_id: c.client_id, client_id: c.client_id,
    } } })
  }
})
return out
