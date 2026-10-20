// ═══ EL PISO DE CONTENIDO PROPIO · CC#1 · 2026-10-20 (encargo de Lenovo «limpiar y arreglar» · parte 2 · «la vara de los jueces del manual») ═══
// Texto plano que se PEGA TAL CUAL dentro de «[BB] Promote prep» y de «Return scores a parent (grade-cimiento gate)» del Cimiento; la prueba `__tests__/cimiento-piso-de-contenido.test.ts` EJECUTA este mismo texto.
// Qué falló (prueba real del 20-oct): el juez de fidelidad califica si lo escrito está SOPORTADO por la evidencia (groundedness) y solo exige los campos fácticos (posicionamiento, resumen del público).
// Un manual casi vacío —voz «PENDIENTE», misión y propósito sin señal— es perfectamente fiel (no inventó nada) y sacó 0,95/0,95/0,93: pasó la vara con CERO contenido propio del cliente, y la planeación se escribió sobre él.
// Fiel ≠ completo. Este piso es código, no opinión de un modelo: un manual sin contenido propio real NO pasa la vara. Sale MARCADO (como siempre sale lo que no alcanza), con otra marca: `sin_contenido_propio`.
// Agnóstico: ningún cliente, rubro ni ciudad nombrados.

// DATO · cuántos campos de identidad SIN señal bastan para decir que el manual está hueco (la voz pendiente basta sola)
var PC_AUSENTES_QUE_BASTAN = 3
var PC_VOZ_PENDIENTE = /^\s*(pendiente|no determinad|no disponible|sin dato|sin datos|por definir|tbd|n\/a|desconocid|no se pudo|no se recupero)/
function pcSinTildes(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() }
/**
 * ¿Este borrador tiene contenido propio del cliente? → { ok, motivos[], voz_pendiente, ausentes[] }
 *  · la VOZ sale del texto propio del cliente (su sitio, su perfil, lo que dijo); si está vacía o dice «pendiente», no hubo de dónde sacarla;
 *  · `campos_ausentes` (o los `_field_meta` en estado «ausente») cuenta los campos de identidad sin ninguna señal.
 */
function pisoDeContenidoPropio(draft) {
  var d = draft || {}, meta = d._field_meta || {}, motivos = []
  var voz = String(d.voice_description == null ? '' : d.voice_description).trim()
  var vozMeta = meta.voice_description || {}
  var vozPendiente = voz === '' || PC_VOZ_PENDIENTE.test(pcSinTildes(voz)) || vozMeta.estado === 'ausente'
  if (vozPendiente) motivos.push('la voz del manual está vacía o PENDIENTE: no hubo texto propio del cliente de donde sacarla')
  var ausentes = Array.isArray(d.campos_ausentes) ? d.campos_ausentes.slice() : Object.keys(meta).filter(function (k) { return (meta[k] || {}).estado === 'ausente' })
  if (ausentes.length >= PC_AUSENTES_QUE_BASTAN) motivos.push('hay ' + ausentes.length + ' campos de identidad sin ninguna señal (' + ausentes.join(', ') + ')')
  return { ok: motivos.length === 0, motivos: motivos, voz_pendiente: vozPendiente, ausentes: ausentes }
}
// ═══ fin del piso de contenido propio ═══
