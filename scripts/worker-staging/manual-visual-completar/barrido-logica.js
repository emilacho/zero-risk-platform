// MANUAL · COMPLETAR LO VISUAL · lógica PURA (sin red, sin `this`) · CC#1 · 2026-10-21 · ENCARGO «manual visual con todas las fuentes», T4.
// La usan los nodos del flujo «Manual · completar lo visual» (el constructor la pega delante de cada nodo).
//
// Qué resuelve: el manual se promueve UNA vez; si las copias de fotos (o los colores de la ficha) llegan DESPUÉS, la parte visual se quedaba vacía para siempre.
// Este flujo la vuelve a correr SOLA, con la misma lógica del piso, y promueve una versión nueva del manual (max+1, como pide la ruta canónica) SOLO si mejora.
//
// Reglas del lazo coherente (canon 6 guardarraíles): cadencia definida (cada 30 min) · tope por cliente y día · idempotente (misma huella de entradas ⇒ no repite) ·
// solo clientes AUTORIZADOS (cadena_config.manual_visual_clientes) · nunca toca un manual aprobado por una persona · rastro en el propio manual (visual.generado_*).

var MAX_INTENTOS_POR_DIA = 3
var RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
var RANGO = { ausente: 0, parcial: 1, completo: 2 }

/** Qué tan completo está un bloque `visual` (v2 trae `estado`; un v1 viejo se mide por lo que tiene). */
function rangoDeVisual(v) {
  if (!v || typeof v !== 'object') return 0
  if (v.estado && RANGO[v.estado] !== undefined) return RANGO[v.estado]
  var paleta = v.capa_grafica && Array.isArray(v.capa_grafica.paleta) ? v.capa_grafica.paleta.length : 0
  var producto = !!(v.capa_producto && v.reglas)
  if (paleta > 0 && producto) return 2
  if (paleta > 0 || producto) return 1
  return 0
}

/** La huella de las entradas del piso: si no cambió nada desde la última vez, no hay nada nuevo que probar. */
function huellaDeEntradas(o) {
  var copias = (o.copias || []).filter(function (c) { return c && c.estado === 'ok' && c.url })
  var ult = copias.map(function (c) { return String(c.created_at || '') }).sort().pop() || ''
  var ficha = o.ficha || {}
  var colores = Array.isArray(ficha.brand_colors) ? ficha.brand_colors.length : 0
  var fuentes = Array.isArray(ficha.brand_fonts) ? ficha.brand_fonts.length : 0
  return ['c' + copias.length, ult, 'f' + colores + '/' + fuentes, 's' + String(o.sitioId || '')].join('|')
}

/**
 * ¿Hay que correr el piso para este cliente? { correr, motivo }.
 * o = { permitido, humanoAprobo, visual (bloque actual o null), huellaActual, intento ({huella, dia, n} o null), hoy (YYYY-MM-DD), forzar }
 */
function decidirSiCorrer(o) {
  if (!o.permitido) return { correr: false, motivo: 'cliente_no_autorizado' }
  if (o.humanoAprobo) return { correr: false, motivo: 'manual_aprobado_por_una_persona' }
  if (rangoDeVisual(o.visual) >= 2 && !o.forzar) return { correr: false, motivo: 'visual_ya_completo' }
  var i = o.intento || null
  var hoy = i && i.dia === o.hoy ? Number(i.n) || 0 : 0
  if (hoy >= MAX_INTENTOS_POR_DIA) return { correr: false, motivo: 'tope_de_intentos_del_dia' }
  if (!o.forzar && i && i.huella === o.huellaActual) return { correr: false, motivo: 'sin_entradas_nuevas' }
  return { correr: true, motivo: null }
}

/** ¿El visual nuevo es mejor que el actual? Solo así se promueve una versión nueva del manual. */
function mejoraElVisual(antes, despues) {
  var a = rangoDeVisual(antes), d = rangoDeVisual(despues)
  if (d > a) return { mejora: true, motivo: 'sube de ' + a + ' a ' + d }
  var pa = antes && antes.capa_grafica && Array.isArray(antes.capa_grafica.paleta) ? antes.capa_grafica.paleta.length : 0
  var pd = despues && despues.capa_grafica && Array.isArray(despues.capa_grafica.paleta) ? despues.capa_grafica.paleta.length : 0
  if (d === a && pd > pa) return { mejora: true, motivo: 'mismo nivel pero con más colores (' + pa + ' → ' + pd + ')' }
  return { mejora: false, motivo: 'sin mejora (' + a + ' → ' + d + ')' }
}

/** El cuerpo para POST /api/brand-book/[clientId]: el borrador anterior con su visual nuevo (todo lo demás del manual viaja igual) y el veredicto previo conservado. */
function armarCuerpoDelManual(o) {
  var visual = Object.assign({}, o.borrador.visual, { entradas_huella: o.huella, generado_en: o.ahora, generado_por: 'manual-visual-completar' })
  var p = o.previo || {}
  return {
    brand_book: Object.assign({}, o.borrador, { visual: visual }),
    source: 'visual_completar',
    gate_outcome: p.gate_outcome === undefined ? null : p.gate_outcome,
    gate_nota: 'parte visual completada desde las copias propias del cliente (sin tocar el resto del manual)',
    fidelity_passed: p.fidelity_passed === true,
    fidelity_scores: p.fidelity_scores === undefined ? null : p.fidelity_scores,
    fidelity_threshold: p.fidelity_threshold === undefined ? null : p.fidelity_threshold,
    approved_by: 'manual-visual-completar',
    approved_at: o.ahora,
  }
}

/** Los clientes autorizados: solo uuids bien formados, sin repetidos. */
function clientesAutorizados(valor) {
  var lista = Array.isArray(valor) ? valor : []
  var vistos = {}
  return lista.filter(function (x) { if (typeof x !== 'string' || !RE_UUID.test(x) || vistos[x.toLowerCase()]) return false; vistos[x.toLowerCase()] = true; return true })
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MAX_INTENTOS_POR_DIA: MAX_INTENTOS_POR_DIA, rangoDeVisual: rangoDeVisual, huellaDeEntradas: huellaDeEntradas, decidirSiCorrer: decidirSiCorrer,
    mejoraElVisual: mejoraElVisual, armarCuerpoDelManual: armarCuerpoDelManual, clientesAutorizados: clientesAutorizados,
  }
}
