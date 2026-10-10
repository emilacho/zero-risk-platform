// ⑤ LA VUELTA DE GPT. Su texto es una OPINIÓN (se rotula como tal): nunca es dato confirmado ni cuenta como desacuerdo.
// Si GPT falló (tras los 3 reintentos de la ruta) NO bloquea: la tarjeta sale «SIN SEGUNDA MIRADA».
const est = $('⑤ Opinión · pedido').first().json
const r = $input.first().json || {}
const c = r.body ? r.body : r
const ok = c.ok === true && typeof c.opinion === 'string' && c.opinion.trim() !== ''
const opinion = ok ? { ok: true, texto: c.opinion } : { ok: false, error: String(c.error || c.detalle || 'el revisor externo no respondió') }
const costo = typeof c.costo_usd === 'number' ? c.costo_usd : 0
return [{ json: { ...est, opinion, hay_opinion: ok, costo_usd: (Number(est.costo_usd) || 0) + costo } }]
