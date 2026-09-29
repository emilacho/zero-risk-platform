// ③a ¿LLEGÓ LA LISTA? · CC#1 · 2026-09-29. Mismo criterio que planeación (12-sep): una espera agotada NO se ve igual que una vuelta vacía.
// Lee la lista del redactor. Sin lista legible NO se sigue (no hay a quién pedirle briefs) y NO se escribe nada.
const c = $('③a Armar el pedido de la lista').first().json
const e = $input.first().json || {}
const cuerpo = e.body ? e.body : e
let texto = String(cuerpo.response || cuerpo.result || cuerpo.output || cuerpo.text || '')
const llegoReal = texto.trim().length > 0
// Simulacro SOLO en modo seco (nunca cobra): permite ejercitar el bucle y los chequeos con datos de forma real. En modo real no aplica.
let simulacro_usado = false
if (c.dry_run === true && c.simulacro && typeof c.simulacro.lista === 'string') { texto = c.simulacro.lista; simulacro_usado = true }
const llego = texto.trim().length > 0
// Si el corredor contestó un ERROR por el callback (success:false: tope de gasto §150, saldo agotado, fallo del agente…) se DICE cuál fue,
// en vez de un «no llegó» genérico (medido 29-sep: cost_cap_exceeded E-CAP-150 se veía como espera agotada).
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
const lista = j && (j.lista || j.parte)
const ok = !!(lista && Array.isArray(lista.entregables) && lista.entregables.length > 0)
const motivo = !llego
  ? errorDelCorredor
    ? 'el corredor RECHAZÓ el trabajo de la LISTA · ' + errorDelCorredor + ' · NO se da por exitosa'
    : 'la vuelta de la LISTA no llegó · se agotó la espera · NO se da por exitosa'
  : !ok
    ? 'la LISTA llegó pero no es legible (sin JSON con «entregables») · muestra: ' + texto.slice(0, 300).replace(/\n/g, ' ')
    : null
return [{
  json: {
    ...c,
    lista_llego: llego,
    lista_real: llegoReal,
    lista_ok: ok,
    lista: ok ? lista : null,
    lista_texto: texto,
    error_del_corredor: errorDelCorredor,
    simulacro_usado,
    lista_costo_usd: typeof cuerpo.costUsd === 'number' ? cuerpo.costUsd : null,
    lista_modelo: cuerpo.model || null,
    motivo,
  },
}]
