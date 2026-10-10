// 1 · ¿ABIERTA? · lo que dijo `abrir`: abierta · ya estaba abierta (el mismo sobre dos veces no abre dos campañas) · el plan no coincide (no se escribió nada) · todo lo demás falla ruidoso
const s = $('⓪ Decidir').last().json
const r = $input.first().json || {}
const status = Number(r.statusCode)
const b = r.body && typeof r.body === 'object' ? r.body : {}
if (status === 201 && b.campana && b.campana.id) return [{ json: { ...s, sigue: true, campana_id: b.campana.id, reemplaza_a: b.reemplaza_a || null } }]
if (status === 200 && b.ya_abierta === true) {
  // 🔴 relevo 41 (#466 C3): reenviar el sobre de una campaña que SIGUE ARMANDO (abierta · estrategia · calendario) la RETOMA donde quedó: los pasos hechos contestan ya_hecha y no se repiten.
  //    Sin esto, el sobre repetido contestaba «ya abierta» y nunca reintentaba lo que se había atascado.
  const est = b.campana ? b.campana.estado : null
  if (b.campana && b.campana.id && (est === 'abierta' || est === 'estrategia' || est === 'calendario')) return [{ json: { ...s, sigue: true, campana_id: b.campana.id, reemplaza_a: null, nota: 'ya estaba abierta pero sin terminar de armar: se retoma donde quedó' } }]
  return [{ json: { ...s, sigue: false, resultado: 'cadena_abierta', campana_id: b.campana ? b.campana.id : null, nota: 'ya estaba abierta: no se repite el trabajo' } }]
}
if (status === 409 && b.resultado === 'plan_no_coincide') return [{ json: { ...s, sigue: false, resultado: 'plan_no_coincide', campana_id: null, nota: String(b.detalle || '') } }]
throw new Error('PUERTA_ABRIR_' + String(b.code || b.error || status) + ' · ' + String(b.detalle || b.detail || 'sin detalle') + ' · se DETIENE')
