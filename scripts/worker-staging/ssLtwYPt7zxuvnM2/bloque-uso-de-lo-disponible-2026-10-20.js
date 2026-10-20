// ═══ EL USO DE LO DISPONIBLE · CC#1 · 2026-10-20 (firma de Emilio 15:22: «el manual de marca tiene que trabajar con lo que tenga disponible») ═══
// Texto plano que se PEGA TAL CUAL dentro de los nodos del Cimiento («[BB] Uso · ¿usó lo disponible?» y «[BB] Faithfulness judge»); la prueba `__tests__/cimiento-manual-con-lo-disponible.test.ts` EJECUTA este mismo texto.
// Reemplaza al «piso de contenido propio» de #661 (que paraba la cadena cuando faltaba contenido): el manual NUNCA se detiene por falta de contenido propio.
// La vara mide «¿USÓ lo que había?», no «¿había mucho?»:
//   · si había una fuente (sitio, perfil de Instagram, frase propia, público ideal, competidores, resumen del descubrimiento) y el campo quedó vacío o «PENDIENTE» ⇒ NO usó lo disponible;
//   · si usó todo lo que había ⇒ pasa, aunque sea poco; si NO había nada de nada ⇒ no hay nada que usar y pasa (la cadena sigue);
//   · sin texto propio del cliente, lo que se arma desde el público ideal, los competidores y las prácticas del rubro es una PROPUESTA y tiene que decirlo («PROPUESTA (no es dato del cliente): …»).
// Agnóstico: ningún cliente, rubro ni ciudad nombrados.

// DATO · mínimos para decir «hay» (evita contar un vacío con espacios como fuente)
var UD_MIN_TEXTO_PROPIO = 100   // caracteres de sitio o de perfil para que cuente como fuente propia
var UD_MIN_SITIO = 200
var UD_MIN_CAMPO = 40           // largo mínimo de positioning / icp_summary cuando hay con qué escribirlos
var UD_MIN_RESUMEN = 80
var UD_MIN_VOZ = 40             // una voz de menos de esto no es una voz (igual que positioning / icp_summary)
var UD_PENDIENTE = /^\s*(pendiente|no determinad|no disponible|sin dato|sin datos|por definir|por determinar|a definir|a determinar|tbd|n\/a|n\/d|desconocid|unknown|not available|no se pudo|no se recupero|sin informaci|no hay informaci|no aplica|sin voz|ninguna|ninguno)/
var UD_PROPUESTA = /^\s*propuesta\b/
function udSinTildes(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() }
function udLargo(v) { return String(v == null ? '' : v).trim().length }
function udNumItems(o, claves) { var n = 0; claves.forEach(function (k) { if (o && Array.isArray(o[k])) n += o[k].length }); return n }
/** qué hay disponible en la evidencia que recibe el manual → { propio: string[], contexto: string[] } */
function udDisponible(g) {
  g = g || {}
  var m = (g.materia_cliente && typeof g.materia_cliente === 'object') ? g.materia_cliente : {}
  var propio = [], contexto = []
  if (m.sitio_estado === 'trajo' && udLargo(m.sitio_texto) >= UD_MIN_SITIO) propio.push('el sitio del cliente')
  if (m.instagram_estado === 'trajo' && udLargo(m.instagram_propio) >= UD_MIN_TEXTO_PROPIO) propio.push('el perfil de Instagram del cliente')
  if (udLargo(m.frase_propia) > 0) propio.push('la frase propia del cliente')
  if (udNumItems(g.icp_signals, ['segments', 'pain_points', 'goals', 'objections', 'preferred_channels']) > 0) contexto.push('el público ideal')
  if (Array.isArray(g.competitors) && g.competitors.length > 0) contexto.push('los competidores')
  if (udLargo(g.discovery_summary) >= UD_MIN_RESUMEN) contexto.push('el resumen del descubrimiento')
  return { propio: propio, contexto: contexto }
}
/**
 * ¿El borrador USÓ lo que había? → { ok, sin_usar: [{ campo, fuente, motivo, rotulo? }], disponibles: { propio[], contexto[] } }
 *  · hay algo (propio o de contexto) y la voz quedó vacía/PENDIENTE ⇒ no usó lo disponible;
 *  · no hay texto propio y la voz se armó desde el contexto sin decir que es PROPUESTA ⇒ falta el rótulo;
 *  · hay con qué escribir positioning / icp_summary y quedaron (casi) vacíos ⇒ no usó lo disponible.
 */
function usoDeLoDisponible(draft, grounding) {
  var d = draft || {}, disp = udDisponible(grounding), sin = []
  var hay = disp.propio.length + disp.contexto.length > 0
  var fuentes = disp.propio.concat(disp.contexto).join(', ')
  var voz = String(d.voice_description == null ? '' : d.voice_description).trim()
  var vozVacia = voz.length < UD_MIN_VOZ || UD_PENDIENTE.test(udSinTildes(voz))
  if (hay && vozVacia) sin.push({ campo: 'voice_description', fuente: fuentes, motivo: 'la voz quedó vacía o PENDIENTE habiendo con qué armarla' })
  else if (hay && !vozVacia && disp.propio.length === 0 && !UD_PROPUESTA.test(udSinTildes(voz))) sin.push({ campo: 'voice_description', fuente: fuentes, motivo: 'sin texto propio del cliente la voz es una PROPUESTA y debe decirlo: «PROPUESTA (no es dato del cliente): …»', rotulo: true })
  if ((disp.propio.length + disp.contexto.length > 0) && udLargo(d.positioning) < UD_MIN_CAMPO && (disp.contexto.indexOf('los competidores') !== -1 || disp.contexto.indexOf('el resumen del descubrimiento') !== -1 || disp.propio.length > 0)) sin.push({ campo: 'positioning', fuente: fuentes, motivo: 'el posicionamiento quedó vacío habiendo con qué escribirlo' })
  if (disp.contexto.indexOf('el público ideal') !== -1 && udLargo(d.icp_summary) < UD_MIN_CAMPO) sin.push({ campo: 'icp_summary', fuente: 'el público ideal', motivo: 'el resumen del público quedó vacío habiendo público ideal' })
  return { ok: sin.length === 0, sin_usar: sin, disponibles: disp }
}
// ═══ fin del uso de lo disponible ═══
