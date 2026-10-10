// Relevo 59 · tres cambios mínimos al alta (parte de r57), apagada:
//  (1) «Persist Client to Supabase» manda `own_handles` (la cuenta de Instagram que dio quien cerró el trato) → /api/clients/upsert lo guarda en clients.config.apify.own_handles ANTES de la materia (recomendado de CC#3).
//  (2) «[RD] Poll Retry Guard»: cada INTENTO tiene su propia ventana de 36 sondeos (35 × (intento + 1)); antes el contador era común y un fallo tardío dejaba al reintento sin tiempo (R1 de CC#3).
//  (3) El mensaje de «Parada ruidosa» dice el tope real (1 reintento, no 2).
// Desde la raiz: node scripts/worker-staging/LyVoKcrypS5uLyuu/construir-r59.mjs
import fs from 'node:fs'
const R = 'scripts/worker-staging/LyVoKcrypS5uLyuu/'
const w = JSON.parse(fs.readFileSync(R + 'alta-ARREGLADA-2026-10-10-r57.json', 'utf8'))
const nodo = (n) => { const x = w.nodes.find((y) => y.name === n); if (!x) throw new Error('no hallé ' + n); return x }
const cambia = (t, a, b, q) => { if (t.split(a).length !== 2) throw new Error('ancla ' + q); return t.replace(a, () => b) }
{
  const n = nodo('Persist Client to Supabase')
  n.parameters.jsonBody = cambia(n.parameters.jsonBody, "  url_reparto: $('Validate Deal Data').first().json.url_reparto || undefined",
    "  own_handles: (function () { const b = $('Validate Deal Data').first().json; const ig = b.instagram_handle || b.instagram || ''; return ig ? { instagram: ig } : undefined })(),   // r59 · la cuenta que dio quien cerró el trato · se guarda ANTES de la materia\n  url_reparto: $('Validate Deal Data').first().json.url_reparto || undefined", 'persist')
}
{
  const c = nodo('[RD] Poll Retry Guard').parameters.conditions.conditions[0]
  if (c.rightValue !== 35) throw new Error('el tope del guardia no era 35')
  c.rightValue = "={{ 35 * (Number($('[RD] Sello de intento').last().json.rd_attempt || 0) + 1) }}"
}
{
  const n = nodo('[RD] Parada ruidosa · reintentos agotados')
  n.parameters.jsCode = cambia(n.parameters.jsCode, "  2 + ' reintentos quedó agotado", "  1 + ' reintento quedó agotado", 'mensaje')
  const t = nodo('[RD] Poll Timeout')
  t.parameters.jsCode = cambia(t.parameters.jsCode, 'hasta 36 vueltas ($runIndex < 35) a 20s = ~12 min', 'hasta 36 vueltas POR INTENTO ($runIndex < 35 × (intento + 1)) a 20s = ~12 min cada una', 'timeout')
}
fs.writeFileSync(R + 'alta-ARREGLADA-2026-10-10-r59.json', JSON.stringify(w, null, 1))
console.log('ok')
