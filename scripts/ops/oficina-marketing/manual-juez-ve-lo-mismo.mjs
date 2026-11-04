/**
 * 04-nov · GO Lenovo «el juez de fidelidad recibe la misma información que el redactor» (dale de Emilio 15:19Z) · flujo del manual `ssLtwYPt7zxuvnM2` · nodo `[BB] Judge prep`.
 * Lo que el redactor (las lentes) recibe en `_grounding_refs` y el juez NO veía, o veía cortado:
 *   · resumen del descubrimiento cortado a 2.200 → entero
 *   · modelo de negocio, detalle de los competidores (el juez veía solo los nombres) y fuentes de la investigación → ahora entran
 *   · bloque ICP cortado a 1.900 → entero (cede solo si el pedido no cabe en el tope real)
 *   · materia del cliente (sitio 3.500 / Instagram 1.000 en el juez) → entera, con su origen si viene del guardado
 *   · lo que declaró el dueño en un pedido de cambios (su pedido y los campos que validó) → entra como evidencia que manda
 *   · tope del pedido al juez 14.000 → 590.000 (tope real 600.000 · `TOPE_REAL_DEL_PEDIDO`): la evidencia no se recorta para que quepa.
 * Lo que NO cambia: la vara (0,85), los campos puntuados, el orden de prioridad (gateados primero), la PROSA del juez. Si el tope real algún día mordiera, se sigue DECLARANDO.
 */
import { cambiarCodigo } from './lib.mjs'

export const TOPE_JUEZ = 590000
const N = '[BB] Judge prep'
const NL = String.fromCharCode(92) + 'n' // la secuencia «\n» ESCRITA en el código del nodo (no un salto de línea)

const DUENO = [
  '(function () { try {',
  "    const r = $('Validate Deal Data').first().json.reescritura;",
  "    if (!r || typeof r !== 'object') return '';",
  "    const pedido = String(r.cambios_del_dueno == null ? '' : r.cambios_del_dueno).trim();",
  "    const val = Array.isArray(r.campos_validados) ? r.campos_validados.filter(Boolean).join(', ') : '';",
  `    return (pedido ? 'LO QUE DECLARÓ EL DUEÑO (manda sobre la investigación):${NL}' + pedido + '${NL}' : '') + (val ? 'Campos que el dueño validó él mismo (su palabra): ' + val + '${NL}' : '');`,
  "  } catch (e) { return ''; } })()",
].join('\n')

export function construirJuezVeLoMismo(f) {
  cambiarCodigo(f, N, 'const TOPE_TASK = 14000;', `const TOPE_TASK = ${TOPE_JUEZ};   // 04-nov · tope real del pedido (600.000) menos margen: la evidencia no se recorta para que quepa`)
  cambiarCodigo(f, N, `String(g.discovery_summary || '').slice(0, 2200) + '${NL}${NL}' +`, `String(g.discovery_summary || '') + '${NL}${NL}' +`)
  cambiarCodigo(f, N, "  line('Competidores', (g.competitors || []).map((c) => c && c.name))\n);",
    "  line('Competidores', (g.competitors || []).map((c) => c && c.name)) +\n" +
    `  (ev(g.business_model) ? 'Modelo de negocio: ' + ev(g.business_model) + '${NL}' : '') +\n` +
    `  (Array.isArray(g.competitors) && g.competitors.length ? 'Competidores (detalle, lo que vio el redactor):${NL}' + JSON.stringify(g.competitors) + '${NL}' : '') +\n` +
    `  (Array.isArray(g.apify_sources) && g.apify_sources.length ? 'Fuentes de la investigación (lo que vio el redactor):${NL}' + JSON.stringify(g.apify_sources) + '${NL}' : '') +\n` +
    '  ' + DUENO + '\n);')
  cambiarCodigo(f, N, 'icpCrudo.slice(0, Math.min(1900, espacioIcp))', 'icpCrudo.slice(0, espacioIcp)')
  cambiarCodigo(f, N, "String(_mat.sitio_texto || '').slice(0, 3500)", "String(_mat.sitio_texto || '')")
  cambiarCodigo(f, N, "String(_mat.instagram_propio || '').slice(0, 1000)", "String(_mat.instagram_propio || '')")
  cambiarCodigo(f, N, `'${NL}MATERIA DEL CLIENTE (texto real · evidencia primaria):${NL}' +`, `'${NL}MATERIA DEL CLIENTE (texto real · evidencia primaria' + (_mat.materia_origen ? ' · origen: ' + String(_mat.materia_origen) : '') + '):${NL}' +`)
}
