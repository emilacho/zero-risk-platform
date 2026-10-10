// ④ EL VEREDICTO DEL JUEZ. Lee los puntajes que el corredor captura del tool (`fidelity_scores.scores`); si no vinieron, NO se inventan: queda `puntajes: null` y se declara.
// El veredicto NO bloquea ni dispara otro ciclo: se muestra en la tarjeta (los gateados bajo el umbral se marcan) y la persona decide. El lazo A del cimiento no se toca ni se llama.
const est = $('④ Juez · pedido').first().json
const r = $input.first().json || {}
const c = r.body ? r.body : r
const UMBRAL = 0.85
const GATEADOS = ['positioning', 'icp_summary']
const costo = typeof c.cost_usd === 'number' ? c.cost_usd : 0
const s = c.fidelity_scores && c.fidelity_scores.scores && typeof c.fidelity_scores.scores === 'object' ? c.fidelity_scores.scores : null
const puntajes = s ? Object.fromEntries(Object.keys(s).map((k) => [k, typeof s[k] === 'number' ? s[k] : null])) : null
const bajo = puntajes ? GATEADOS.filter((f) => typeof puntajes[f] !== 'number' || puntajes[f] < UMBRAL) : GATEADOS
const fidelidad = { umbral: UMBRAL, puntajes, bajo_umbral: bajo, sin_veredicto: !puntajes, evidencia_recortada: est.evidencia_recortada === true }
return [{ json: { ...est, fidelidad, costo_usd: (Number(est.costo_usd) || 0) + costo } }]
