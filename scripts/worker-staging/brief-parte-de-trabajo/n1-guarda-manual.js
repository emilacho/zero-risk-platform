// ① GUARDA · sin manual APROBADO se DETIENE y no se escribe nada · CC#1 · 2026-09-29.
// Entrada: la fila más reciente de client_brand_books (versión más alta). Igual criterio que planeación.
const env = $('⓪ Sobre · llave · modo seco').first().json
const filas = $input.all().map((i) => i.json).filter((r) => r && r.id)
if (filas.length === 0) {
  throw new Error('BRIEF_SIN_MANUAL · el cliente ' + env.client_id + ' no tiene manual de marca · se DETIENE y NO escribe nada')
}
const m = filas[0]
if (m.gate_outcome !== 'paso_la_vara') {
  throw new Error('BRIEF_MANUAL_NO_APROBADO · manual ' + m.id + ' con gate_outcome=' + JSON.stringify(m.gate_outcome) + ' · se DETIENE y NO escribe nada')
}
return [{
  json: {
    ...env,
    manual_id: m.id,
    manual_version: m.version,
    manual_creado: m.created_at,
    forbidden_words: Array.isArray(m.forbidden_words) ? m.forbidden_words : [],
    required_terminology: Array.isArray(m.required_terminology) ? m.required_terminology : [],
    manual_texto: String(m.content_text || ''),
    // 03-oct · EL TRATO (tú · vos · usted) sale del manual: su descripción de voz y sus guías de tono viajan a ③ y ④
    manual_voz: { voice_description: m.voice_description || null, writing_style: m.writing_style || null, tone_guidelines: m.tone_guidelines && typeof m.tone_guidelines === 'object' ? m.tone_guidelines : {} },
  },
}]
