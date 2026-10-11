// Ronda 73 · libro de Apify que CUADRE con la cuenta.
// Defecto (medido en el paso 2): la fila de cada llamada anota lo que Apify ya sabía AL RESPONDER (0,1937) y la cuenta cierra después (0,2950) → −34 %.
// La reconciliación daba por «anotada» toda corrida con fila de llamada y no sumaba la diferencia. Ahora, por corrida: resto = max(0, real − anotado en su llamada), y va a la fila del día.
// Idempotente: el anotado se lee de las filas de llamada (que no se tocan) y la fila del día se reescribe entera.
export const NODO = 'Agrupar por día'

const reemplazos = [
  [
    "url: SB_COSTS + '?select=description&service=like.apify:*&date=gte.' + desde,",
    "url: SB_COSTS + '?select=description,amount_usd_exact&service=like.apify:*&date=gte.' + desde,",
  ],
  [
    "const anotadas = new Set();",
    "const anotadas = new Set();\nconst anotado_usd = {}; // run_id → lo que quedó escrito en la fila de su llamada (RONDA 73)",
  ],
  [
    "if (d && d.run_id && d.costo_conocido === true) anotadas.add(String(d.run_id));",
    "if (d && d.run_id && d.costo_conocido === true) { anotadas.add(String(d.run_id)); const v = Number(f.amount_usd_exact); anotado_usd[String(d.run_id)] = (anotado_usd[String(d.run_id)] || 0) + (Number.isFinite(v) ? v : 0); }",
  ],
  [
    "porDia[d] = porDia[d] || { dia: d, corridas: 0, exacto_usd: 0, anotadas: 0, anotadas_usd: 0, cobro_sin_datos: 0, sin_conteo: 0, detalle: [] };",
    "porDia[d] = porDia[d] || { dia: d, corridas: 0, exacto_usd: 0, anotadas: 0, anotadas_usd: 0, completado_usd: 0, completadas: 0, cobro_sin_datos: 0, sin_conteo: 0, detalle: [] };",
  ],
  [
    "if (anotadas.has(String(c.run_id))) { porDia[d].anotadas += 1; porDia[d].anotadas_usd += c.usd; } else { porDia[d].exacto_usd += c.usd; }",
    // RONDA 73 · lo anotado al responder cuenta tal cual; si la cuenta cerró con MÁS, la diferencia va al resto del día (nunca se resta: si cerró con menos, no se inventa un abono)
    "if (anotadas.has(String(c.run_id))) { const ya = Math.min(anotado_usd[String(c.run_id)] || 0, c.usd); const falta = Math.max(0, c.usd - ya); porDia[d].anotadas += 1; porDia[d].anotadas_usd += ya; porDia[d].exacto_usd += falta; if (falta > 0.0000005) { porDia[d].completado_usd += falta; porDia[d].completadas += 1; } } else { porDia[d].exacto_usd += c.usd; }",
  ],
  [
    "anotada_en_su_llamada: anotadas.has(String(c.run_id)) });",
    "anotada_en_su_llamada: anotadas.has(String(c.run_id)), anotado_usd: anotadas.has(String(c.run_id)) ? Number((anotado_usd[String(c.run_id)] || 0).toFixed(6)) : null });",
  ],
  [
    "anotadas_usd: Number(d.anotadas_usd.toFixed(6)),",
    "anotadas_usd: Number(d.anotadas_usd.toFixed(6)),\n    completado_al_cierre_usd: Number(d.completado_usd.toFixed(6)),\n    corridas_completadas: d.completadas,",
  ],
]

export function construir(codigo) {
  const crlf = codigo.includes('\r\n')
  let s = codigo.split('\r\n').join('\n')
  for (const [a, b] of reemplazos) {
    const n = s.split(a).length - 1
    if (n !== 1) throw new Error('el texto a cambiar aparece ' + n + ' veces (debe ser 1): ' + a.slice(0, 70))
    s = s.replace(a, () => b)
  }
  return crlf ? s.split('\n').join('\r\n') : s
}

/** devuelve una copia del flujo con SOLO ese nodo cambiado */
export function construirFlujo(flujo) {
  const copia = JSON.parse(JSON.stringify(flujo))
  const n = copia.nodes.find((x) => x.name === NODO)
  if (!n) throw new Error('no está el nodo ' + NODO)
  n.parameters.jsCode = construir(n.parameters.jsCode)
  return copia
}
