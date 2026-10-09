// 1 · AVISOS · UN solo mensaje a #alertas por pasada, agrupado por campaña (nunca uno por fila: el ruido es lo que mata una bandeja) · dice QUÉ HACER, no solo qué pasó
// En ensayo o en seco el reloj devuelve `enviar_alertas: false`: se REGISTRAN en la ejecución y no se mandan.
const r = $input.first().json || {}
const status = Number(r.statusCode)
const b = r.body && typeof r.body === 'object' ? r.body : {}
if (status !== 200) throw new Error('VIGIA_RELOJ_' + String(b.code || b.error || status) + ' · ' + String(b.detalle || b.detail || 'sin detalle') + ' · el reloj NO corrió: esto mismo es una alarma')
if (b.inactivo === true) return [{ json: { enviar: false, hay: false, nota: String(b.motivo || 'cadena apagada') } }]
const alertas = Array.isArray(b.alertas) ? b.alertas : []
const L = []
for (const a of alertas) {
  L.push('*' + (a.campana_id === 'sistema' ? 'La cadena' : 'Campaña ' + a.campana_id) + '*')
  for (const l of a.lineas || []) L.push('• ' + l)
  L.push('')
}
if (alertas.length) L.push('*Qué hacer:* revisa la bandeja de aprobaciones; lo que no se apruebe antes de su fecha vence y no se publica solo.')
const slack = { channel: 'C0B7XUUEBHA', text: L.join(String.fromCharCode(10)) }
return [{ json: { enviar: b.enviar_alertas === true && alertas.length > 0, hay: alertas.length > 0, slack, registrado: alertas, latido: b.latido || null } }]
