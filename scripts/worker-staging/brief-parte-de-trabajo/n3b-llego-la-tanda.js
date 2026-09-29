// ③b ¿LLEGÓ LA TANDA? · CC#1 · 2026-09-29. Una salida por tanda (el bucle las junta después en ③c).
// No corrige ni completa: si llegó pero no es legible, se declara y se guarda el texto CRUDO (ya está pagado).
const p = $('③b Armar el pedido de la tanda').first().json
const c = $('③a ¿Llegó la lista?').first().json
const e = $input.first().json || {}
const cuerpo = e.body ? e.body : e
let texto = String(cuerpo.response || cuerpo.result || cuerpo.output || cuerpo.text || '')
const llegoReal = texto.trim().length > 0
let simulacro_usado = false
if (c.dry_run === true && c.simulacro && Array.isArray(c.simulacro.tandas) && typeof c.simulacro.tandas[p.tanda_n - 1] === 'string') {
  texto = c.simulacro.tandas[p.tanda_n - 1]
  simulacro_usado = true
}
const llego = texto.trim().length > 0
const errorDelCorredor = cuerpo && cuerpo.success === false ? [cuerpo.error, cuerpo.inner && cuerpo.inner.code, cuerpo.inner && cuerpo.inner.detail].filter(Boolean).join(' · ').slice(0, 300) : null

function sacarJson(t) {
  const s = String(t || '')
  const cand = []
  const a0 = s.indexOf('```json')
  if (a0 !== -1) { const i = s.indexOf('\n', a0); const f = s.indexOf('```', i + 1); if (i !== -1 && f !== -1) cand.push(s.slice(i + 1, f)) }
  const a = s.indexOf('{'), b = s.lastIndexOf('}')
  if (a !== -1 && b > a) cand.push(s.slice(a, b + 1))
  for (const x of cand) { try { return JSON.parse(x) } catch (err) { /* siguiente */ } }
  return null
}
const j = llego ? sacarJson(texto) : null
const bloque = j && (j.tanda || j.parte || j)
const ents = bloque && Array.isArray(bloque.entregables) ? bloque.entregables : null
return [{
  json: {
    tanda_n: p.tanda_n,
    tandas_total: p.tandas_total,
    ids_pedidos: p.ids,
    llego,
    llego_real: llegoReal,
    legible: !!(ents && ents.length),
    entregables: ents || [],
    texto_crudo: ents && ents.length ? null : texto,
    simulacro_usado,
    costo_usd: typeof cuerpo.costUsd === 'number' ? cuerpo.costUsd : null,
    modelo: cuerpo.model || null,
    dry_run_enviado: p.cuerpo.dry_run,
    error_del_corredor: errorDelCorredor,
    motivo: !llego ? (errorDelCorredor ? 'el corredor RECHAZÓ la tanda ' + p.tanda_n + ' · ' + errorDelCorredor : 'la vuelta de la tanda ' + p.tanda_n + ' NO llegó · se agotó la espera') : ents && ents.length ? null : 'la tanda ' + p.tanda_n + ' llegó pero no es legible',
  },
}]
