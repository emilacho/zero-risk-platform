// MANUAL · COMPLETAR LO VISUAL · lógica PURA (sin red, sin `this`) · CC#1 · 2026-10-21 · ENCARGO «manual visual con todas las fuentes», T4.
// La usan los nodos del flujo «Manual · completar lo visual» (el constructor la pega delante de cada nodo, después de la lógica del piso).
//
// Qué resuelve: el manual se promueve UNA vez; si las copias de fotos (o los colores de la ficha) llegan DESPUÉS, la parte visual se quedaba vacía para siempre.
// Este flujo la vuelve a correr SOLA, para CUALQUIER cliente (nadie lo agrega a una lista a mano), con la misma lógica del piso, y promueve una versión nueva del manual
// (max+1, como pide la ruta canónica) SOLO si mejora. Corrección de Emilio 21-oct 20:50: «siempre arreglos estructurales».
//
// El disparo automático: cada 30 min recorre los clientes que tienen manual y elige, de a UNO, el que cumple TODO esto:
//   · su manual vigente no está aprobado por una persona · no está en `cadena_config.manual_visual_excluidos`
//   · tiene material propio que probar (copias propias, colores/tipografías en la ficha o un sitio raspado)
//   · su visual está incompleto (ausente, parcial, o «completo» con una tipografía propuesta que no es un nombre real)
//   · las entradas cambiaron desde el último intento (huella) · no pasó el tope por cliente (3/día) ni el global (3/día entre todos)
// Reglas del lazo coherente (canon 6 guardarraíles): cadencia definida · topes · idempotente · rastro en el propio manual (visual.generado_*) · cierre ruidoso si no se guardó.

var MAX_INTENTOS_POR_DIA = 3
var MAX_CORRIDAS_POR_DIA_TOTAL = 3
var RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
var RANGO = { ausente: 0, parcial: 1, completo: 2 }

/**
 * Qué tan completo está un bloque `visual` (v2 trae `estado`; un v1 viejo se mide por lo que tiene). Un v2 «completo» con una tipografía PROPUESTA que no es un nombre
 * real de tipografía (caso df7e47cc: «no reconocida con claridad») baja a 1: hay que volver a probar. `esTipografiaValida(nombre)` la pasa el nodo (la lógica del piso).
 */
function rangoDeVisual(v, esTipografiaValida) {
  if (!v || typeof v !== 'object') return 0
  var r
  if (v.estado && RANGO[v.estado] !== undefined) r = RANGO[v.estado]
  else {
    var paleta = v.capa_grafica && Array.isArray(v.capa_grafica.paleta) ? v.capa_grafica.paleta.length : 0
    var producto = !!(v.capa_producto && v.reglas)
    r = paleta > 0 && producto ? 2 : paleta > 0 || producto ? 1 : 0
  }
  if (r >= 2 && typeof esTipografiaValida === 'function') {
    var tipos = v.capa_grafica && Array.isArray(v.capa_grafica.tipografias) ? v.capa_grafica.tipografias : []
    var hayMala = tipos.some(function (t) { return t && t.estado === 'propuesta' && !esTipografiaValida(t.nombre) })
    if (hayMala) r = 1
  }
  return r
}

/** La huella de las entradas del piso: si no cambió nada desde la última vez (material Y lógica del piso), no hay nada nuevo que probar. */
function huellaDeEntradas(o) {
  var copias = (o.copias || []).filter(function (c) { return c && c.estado === 'ok' && c.url })
  var ult = copias.map(function (c) { return String(c.created_at || '') }).sort().pop() || ''
  var ficha = o.ficha || {}
  var colores = Array.isArray(ficha.brand_colors) ? ficha.brand_colors.length : 0
  var fuentes = Array.isArray(ficha.brand_fonts) ? ficha.brand_fonts.length : 0
  return ['c' + copias.length, ult, 'f' + colores + '/' + fuentes, 's' + String(o.sitioId || ''), 'v' + String(o.version || '')].join('|')
}

/** ¿Hay material propio que probar? copias propias bajadas, colores/tipografías en la ficha, o un sitio raspado. */
function hayMaterialQueProbar(o) {
  var copias = (o.copias || []).filter(function (c) { return c && c.estado === 'ok' && c.url }).length
  var ficha = o.ficha || {}
  var enFicha = (Array.isArray(ficha.brand_colors) && ficha.brand_colors.length > 0) || (Array.isArray(ficha.brand_fonts) && ficha.brand_fonts.length > 0)
  return copias > 0 || enFicha || !!o.sitioId
}

/**
 * ¿Hay que correr el piso para este cliente? { correr, motivo }.
 * o = { excluido, humanoAprobo, hayMaterial, rango (de rangoDeVisual), huellaActual, intento ({huella, dia, n} o null), hoy (YYYY-MM-DD), globalHoy (corridas de hoy entre todos), forzar }
 */
function decidirSiCorrer(o) {
  if (o.excluido) return { correr: false, motivo: 'cliente_excluido' }
  if (o.humanoAprobo) return { correr: false, motivo: 'manual_aprobado_por_una_persona' }
  if (!o.hayMaterial) return { correr: false, motivo: 'sin_material_que_probar' }
  if ((Number(o.rango) || 0) >= 2 && !o.forzar) return { correr: false, motivo: 'visual_ya_completo' }
  if ((Number(o.globalHoy) || 0) >= MAX_CORRIDAS_POR_DIA_TOTAL) return { correr: false, motivo: 'tope_global_del_dia' }
  var i = o.intento || null
  var hoy = i && i.dia === o.hoy ? Number(i.n) || 0 : 0
  if (hoy >= MAX_INTENTOS_POR_DIA) return { correr: false, motivo: 'tope_de_intentos_del_dia' }
  if (!o.forzar && i && i.huella === o.huellaActual) return { correr: false, motivo: 'sin_entradas_nuevas' }
  return { correr: true, motivo: null }
}

/** ¿El visual nuevo es mejor que el actual? Solo así se promueve una versión nueva del manual. */
function mejoraElVisual(antes, despues, esTipografiaValida) {
  var a = rangoDeVisual(antes, esTipografiaValida), d = rangoDeVisual(despues, esTipografiaValida)
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

/** Lista de uuid bien formados, sin repetidos (los clientes excluidos). */
function listaDeClientes(valor) {
  var lista = Array.isArray(valor) ? valor : []
  var vistos = {}
  return lista.filter(function (x) { if (typeof x !== 'string' || !RE_UUID.test(x) || vistos[x.toLowerCase()]) return false; vistos[x.toLowerCase()] = true; return true })
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MAX_INTENTOS_POR_DIA: MAX_INTENTOS_POR_DIA, MAX_CORRIDAS_POR_DIA_TOTAL: MAX_CORRIDAS_POR_DIA_TOTAL, rangoDeVisual: rangoDeVisual, huellaDeEntradas: huellaDeEntradas,
    hayMaterialQueProbar: hayMaterialQueProbar, decidirSiCorrer: decidirSiCorrer, mejoraElVisual: mejoraElVisual, armarCuerpoDelManual: armarCuerpoDelManual, listaDeClientes: listaDeClientes,
  }
}
