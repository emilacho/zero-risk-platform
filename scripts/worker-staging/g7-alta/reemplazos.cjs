/**
 * G7 · el alta del cliente (LyVoKcrypS5uLyuu) sin recortes y con el país del cliente · 19-nov · CC5.
 * Firma de Emilio «nada se recorta» (18-nov) · GO de Lenovo (15:52Z 18-nov; 03:26Z 19-nov: «después de G5: G6, G7…»).
 * Base = el flujo VIVO bajado el 19-nov en solo lectura (carpeta vivo/, versión 127ed18d, actualizado 04-nov). Solo reemplazos exactos, nodo por nodo.
 * Uso: node reemplazos.cjs  ⇒ escribe nuevo/LyVoKcrypS5uLyuu.json · lo publica CC7 por la puerta (0 vivos), nunca CC5.
 *
 * NO se toca (y por qué):
 *  · `web-discovery.ts` y `brand-analyzer.ts`: solo los usa `/api/onboarding` (orquestador viejo). `onboarding_sessions` y
 *    `onboarding_discovery_logs` tienen 0 filas en producción (19-nov): la ruta nunca corrió. Las muertas no se tocan, se anotan.
 *  · las listas de señales (`senales.slice(0, 3|4)`): viven en el bloque «entrada del cliente», que debe ser IDÉNTICO a
 *    `src/lib/alta/entrada-del-cliente.ts` (lo exige una prueba).
 *  · lo que decide CUÁNTO SE RASPA (Apify: 8/10 competidores, 3 actores, 12/5/3/1 publicaciones, 5 resultados, 5 en el re-scrape):
 *    es gasto, no lectura. Queda como pregunta a Lenovo.
 *  · el cliente en 8 letras y la etiqueta de 80 (`target_label`): son identificadores, no contenido.
 */
const fs = require('fs')
const path = require('path')
const DIR = __dirname
const ID = 'LyVoKcrypS5uLyuu'
const FIRMA = '19-nov · G7 · firma de Emilio «nada se recorta» (18-nov)'
/** el techo real: el pedido entero (`TOPE_REAL_DEL_PEDIDO` = 1.500.000) con el mismo margen de 10.000 que G1b */
const TECHO = 1490000

// [nodo (o '*' = cualquier nodo de código), texto exacto del vivo, reemplazo, apariciones esperadas en total]
const REEMPLAZOS = [
  // 1 · el país de la biblioteca de anuncios: el del CLIENTE (antes 'US' fijo para todos)
  ['[APIFY-WIRE] Discovery Parser · dynamic targets (lazo)', "const dealData = $('Validate Deal Data').first().json;\n",
    `const dealData = $('Validate Deal Data').first().json;
// ${FIRMA} · el país de la biblioteca de anuncios es el del CLIENTE (antes 'US' fijo: un cliente de Ecuador veía los anuncios de EE. UU.).
// Código de dos letras; sin país reconocible, 'ALL' (todos los países), nunca uno inventado. El Servicio de Apify arma la búsqueda con \`country\`.
const PAIS_A_CODIGO = { argentina: 'AR', uruguay: 'UY', paraguay: 'PY', ecuador: 'EC', mexico: 'MX', peru: 'PE', chile: 'CL', espana: 'ES', spain: 'ES', bolivia: 'BO', venezuela: 'VE', panama: 'PA', colombia: 'CO', cuba: 'CU', 'puerto rico': 'PR', 'republica dominicana': 'DO', dominicana: 'DO', 'costa rica': 'CR', guatemala: 'GT', honduras: 'HN', 'el salvador': 'SV', nicaragua: 'NI', 'estados unidos': 'US', 'united states': 'US', usa: 'US', brasil: 'BR', brazil: 'BR', canada: 'CA' };
function paisDeLosAnuncios(d) {
  const norm = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z ]+/g, ' ').replace(/\\s+/g, ' ').trim();
  for (const crudo of [d && d.country, String((d && d.location) || '').split(/[·|,;\\/]/).pop()]) {
    const t = norm(crudo);
    if (!t) continue;
    if (/^[a-z]{2}$/.test(t)) return t.toUpperCase();
    if (PAIS_A_CODIGO[t]) return PAIS_A_CODIGO[t];
  }
  return 'ALL';
}
const PAIS_DE_LOS_ANUNCIOS = paisDeLosAnuncios(dealData);
`, 1],
  ['[APIFY-WIRE] Discovery Parser · dynamic targets (lazo)', "{ searchTerms: [cName], country: 'US', maxItems: 3 }", '{ searchTerms: [cName], country: PAIS_DE_LOS_ANUNCIOS, maxItems: 3 }', 1],

  // 2 · el texto del sitio y el perfil de la red: hasta el techo del pedido (antes 60.000 y 8.000; el «120.000 del endpoint» ya no existe)
  ['El texto del sitio, o el hueco', 'const TOPE = 60000; // el endpoint del empleado corta en 120.000 · esto deja sitio de sobra',
    `const TOPE = ${TECHO}; // ${FIRMA}: antes 60.000 («el endpoint corta en 120.000» ya no es así). Ahora el techo real del pedido (TOPE_REAL_DEL_PEDIDO menos 10.000), con el aviso de siempre si se pasa`, 1],
  ['El perfil de la red, o el hueco', 'const TOPE = 8000;', `const TOPE = ${TECHO}; // ${FIRMA}: antes 8.000. El techo real del pedido, con el aviso de siempre si se pasa`, 1],

  // 3 · la materia que lleva la jefatura: hasta el techo del pedido (antes 200.000 el sitio y 100.000 el Instagram), con el aviso de siempre
  ['[JEFATURA] Transform discovery→package', "m.sitio_texto = _t.length > 200000 ? _t.slice(0, 200000) + '\\n[recortado por la cabeza: se leyeron 200000 de '",
    `m.sitio_texto = _t.length > ${TECHO} ? _t.slice(0, ${TECHO}) + '\\n[recortado por la cabeza: se leyeron ${TECHO} de '`, 1],
  ['[JEFATURA] Transform discovery→package', "m.instagram_propio = _d.length > 100000 ? _d.slice(0, 100000) + '\\n[recortado: se leyeron 100000 de '",
    `m.instagram_propio = _d.length > ${TECHO} ? _d.slice(0, ${TECHO}) + '\\n[recortado: se leyeron ${TECHO} de '`, 2],

  // 4 · el posicionamiento de cada competidor y la nota del re-descubrimiento, enteros (antes 150 y 200)
  ['[JEFATURA] Transform discovery→package', 'base.positioning = String(v.positioning).slice(0, 150);', 'base.positioning = String(v.positioning);', 1],
  ['[APIFY] Enrich competitors', 'row.positioning = v.positioning.slice(0, 150);', 'row.positioning = v.positioning;', 1],
  ['Re-discovery INLINE (onboarding-specialist)', "' · nota: ' + preamble.slice(0,200)", "' · nota: ' + preamble", 1],
  // 4b · las señales del muro que se guardan con el estado (fuera del bloque compartido): todas (antes 4)
  ['*', 'senales: muro.senales.slice(0, 4) } : null,', 'senales: muro.senales } : null,', 2],
  // 5 · los hechos sin respaldo: todos (antes 20)
  ['[HECHOS] Unir el informe al ítem', 'sin_respaldo: (h.sin_respaldo || []).slice(0, 20) }', 'sin_respaldo: (h.sin_respaldo || []) }', 1],

  // 6 · los diagnósticos, enteros: el error, el veredicto perdido y la causa son lo único que explica una falla
  ['*', "|| 'sin mensaje')).slice(0, 400);", "|| 'sin mensaje'));", 6],
  ['*', "' · ' + String(body.error).slice(0, 120) : '');", "' · ' + String(body.error) : '');", 2],
  ['*', "'veredicto_desconocido: ' + JSON.stringify(v).slice(0, 40);", "'veredicto_desconocido: ' + JSON.stringify(v);", 2],
  ['*', "'json_invalido: ' + (e.message || String(e)).slice(0, 80);", "'json_invalido: ' + (e.message || String(e));", 2],
  ['*', "_verdict_raw: String(txtRaw || '').slice(0, 800) } }];", "_verdict_raw: String(txtRaw || '') } }];", 2],
  ['*', "v._perdida || 'sin motivo').slice(0, 200)", "v._perdida || 'sin motivo')", 2],
  ['Armar la causa · cimiento', 'try { return JSON.stringify(v).slice(0, 400); }', 'try { return JSON.stringify(v); }', 1],
  ['Armar la causa · cimiento', "'CIMIENTO MURIÓ · ' + String(err).slice(0, 700) + ", "'CIMIENTO MURIÓ · ' + String(err) + ", 1],
  ['[FUENTES] Armar las llamadas', "'el plan no devolvió ok'.slice(0, 300)", "'el plan no devolvió ok'", 1],
  ['[FUENTES] Resumen', "|| 'rechazada').slice(0, 200) });", "|| 'rechazada') });", 1],
]

const contar = (t, a) => t.split(a).length - 1
function construir(vivo) {
  const w = JSON.parse(JSON.stringify(vivo))
  const informe = []
  for (const [nodo, a, b, total] of REEMPLAZOS) {
    let c = 0
    for (const n of w.nodes) {
      const t = n.parameters && n.parameters.jsCode
      if (typeof t !== 'string' || (nodo !== '*' && n.name !== nodo)) continue
      const k = contar(t, a)
      if (k) { n.parameters.jsCode = t.split(a).join(b); c += k }
    }
    if (c !== total) throw new Error(`${nodo} · ${c}× (se esperaban ${total}): ${a.slice(0, 80)}`)
    informe.push(`×${c} · ${nodo === '*' ? '(varios)' : nodo} · ${a.trim().slice(0, 70)}`)
  }
  for (const n of w.nodes) {
    const t = n.parameters && n.parameters.jsCode
    if (typeof t === 'string') new Function(`return (async function(){${t}\n})`)
  }
  return { w, informe }
}

if (require.main === module) {
  const vivo = JSON.parse(fs.readFileSync(path.join(DIR, 'vivo', ID + '.json'), 'utf8'))
  const { w, informe } = construir(vivo)
  fs.writeFileSync(path.join(DIR, 'nuevo', ID + '.json'), JSON.stringify(w, null, 2))
  console.log(informe.join('\n'))
}
module.exports = { REEMPLAZOS, construir, ID, TECHO }
