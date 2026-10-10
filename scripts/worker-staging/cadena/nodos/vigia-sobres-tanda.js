// 4 · UN SOBRE POR TANDA QUE TOCA ABRIR · calendario rodante: la tanda N+1 se abre cuando faltan ≤ 14 días para que termine la N · clave `campana:tanda-N`
const campanas = $('2 · Expandir').all()
const out = []
$input.all().forEach((r, i) => {
  const c = campanas[i] && campanas[i].json
  const j = r.json || {}
  const b = j.body && typeof j.body === 'object' ? j.body : {}
  if (!c) return
  if (Number(j.statusCode) !== 200) throw new Error('VIGIA_TANDA_' + String(b.code || b.error || j.statusCode) + ' · campaña ' + c.campana_id + ' · ' + String(b.detalle || b.detail || 'sin detalle'))
  if (!Number.isInteger(b.tanda)) return
  out.push({ json: { sobre: {
    source: 'cadena/vigia', intent: 'briefear',
    payload: { modo: 'tanda_siguiente', campana_id: c.campana_id, tanda: b.tanda, dry_run: c.seco === true, client_id: c.client_id },
    idempotency_key: c.campana_id + ':tanda-' + b.tanda, logical_period: 'tanda-' + b.tanda, tenant_id: c.client_id, client_id: c.client_id,
  } } })
})
return out
