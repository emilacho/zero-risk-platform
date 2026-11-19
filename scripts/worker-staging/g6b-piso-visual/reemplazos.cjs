/**
 * G6b · el piso visual del manual (cimiento ssLtwYPt7zxuvnM2) sin recortes · 19-nov · CC5.
 * Firma de Emilio «nada se recorta» (18-nov) · GO de Lenovo 04:30Z (INVENTARIO-CC5): «el piso visual del manual mira 20 fotos;
 * si no caben en los 300 s, sube el plazo hasta el máximo de 800 en el mismo cambio. Que no se corte por tiempo».
 * Base = el flujo VIVO bajado el 19-nov a las 04:3xZ (carpeta vivo/, versión af6dabe3). OJO: el código de main
 * (`ssLtwYPt7zxuvnM2/piso-visual-logica.js` y `nodo-visual-piso.js`) está ATRASADO frente al vivo (el arreglo del voseo,
 * el agente `design-visual-storyteller`, `paso`/`trabajo_*`, el plazo de 300 s): por eso NO se reconstruye desde main;
 * solo se aplican estos reemplazos exactos sobre el nodo vivo. Nada más cambia.
 * Uso: node reemplazos.cjs  ⇒ escribe nuevo/ssLtwYPt7zxuvnM2.json · lo publica CC7 por la puerta (0 vivos), nunca CC5.
 */
const fs = require('fs')
const path = require('path')
const DIR = __dirname
const ID = 'ssLtwYPt7zxuvnM2'
const NODO = '[BB] Piso visual (antes del Promote · CC#1)'

const FIRMA = '19-nov · G6b · firma de Emilio «nada se recorta» (18-nov)'
// [texto exacto del vivo, reemplazo, apariciones esperadas]
const REEMPLAZOS = [
  // 1 · las fotos: 6 → 20, el máximo de imágenes por pedido de run-sdk (`MAX_IMAGENES` de src/lib/imagenes-del-pedido.ts); el logo ocupa una
  ['var MAX_FOTOS_A_MIRAR = 6\n',
    `// ${FIRMA}: antes 6 fotos. Ahora todas las que caben en un pedido: run-sdk recibe hasta 20 imágenes
// (\`MAX_IMAGENES\`, src/lib/imagenes-del-pedido.ts); si va el logo, ocupa una y quedan 19 para fotos.
var MAX_FOTOS_A_MIRAR = 20
var MAX_IMAGENES_POR_PEDIDO = 20
function cupoDeFotos(tope, hayLogo) { return Math.max(0, Math.min(tope, MAX_IMAGENES_POR_PEDIDO - (hayLogo ? 1 : 0))) }
`, 1],
  ['  var fotosElegidas = elegirFotos(clasif.foto, MAX_FOTOS_A_MIRAR)',
    '  var fotosElegidas = elegirFotos(clasif.foto, cupoDeFotos(MAX_FOTOS_A_MIRAR, !!logoOriginal))', 1],
  ["  var logo = logos.filter(function (c) { return /hd/.test(String(c.post_id || '') + String(c.tipo || '')) })[0] || logos[0] || null\n",
    "  var logo = logos.filter(function (c) { return /hd/.test(String(c.post_id || '') + String(c.tipo || '')) })[0] || logos[0] || null\n  tope = cupoDeFotos(tope, !!logo)\n", 1],
  // 2 · lo que el cliente DECLARÓ entra entero (antes 6 colores y 4 tipografías)
  ['  declarados.colores.slice(0, 6).forEach(', `  // ${FIRMA}: entran TODOS los colores y tipografías que el cliente declaró (antes 6 y 4)\n  declarados.colores.forEach(`, 1],
  ['  declarados.tipografias.slice(0, 4).forEach(', '  declarados.tipografias.forEach(', 1],
  // 3 · el rol de cada color y tipografía, entero (antes 20 caracteres)
  ['.rol = String(p.rol).slice(0, 20)', '.rol = String(p.rol)', 1],
  ['.rol = String(t.rol).slice(0, 20)', '.rol = String(t.rol)', 1],
  ['rol: o.rol ? String(o.rol).slice(0, 20) : null', 'rol: o.rol ? String(o.rol) : null', 2],
  // 4 · todas las marcas ajenas vistas, con su descripción entera (antes 6 y 120)
  ["      .filter(function (a) { return a && typeof a === 'object' })\n      .slice(0, 6)\n",
    `      .filter(function (a) { return a && typeof a === 'object' }) // ${FIRMA}: todas (antes 6), con la descripción entera (antes 120)\n`, 1],
  [".replace(/\\s+/g, ' ').trim().slice(0, 120) }", ".replace(/\\s+/g, ' ').trim() }", 1],
  // 5 · el plazo de la llamada al modelo: 300 s → 790 s (run-sdk tiene maxDuration 800 y corta a los 790)
  ["      method: 'POST', json: true, timeout: 300000,",
    `      // ${FIRMA}: 300 s → 790 s, el máximo de run-sdk (maxDuration 800, corta a los 790). Medido 19-nov: con 6 fotos (7 imágenes)
      // la llamada tardó hasta 149 s (Opus, 02-nov); con 20 imágenes el texto de respuesta crece por foto y 300 s no da margen. Que no se corte por tiempo.
      method: 'POST', json: true, timeout: 790000,`, 1],
  // 6 · el error y el motivo, enteros (antes 250 y 300)
  ["motivo: 'el piso visual falló: ' + String((e && e.message) || e).slice(0, 250), error: String((e && e.message) || e).slice(0, 300) }",
    "motivo: 'el piso visual falló: ' + String((e && e.message) || e), error: String((e && e.message) || e) }", 1],
  ["motivo: String(visual.motivo || '').slice(0, 300) } })", "motivo: String(visual.motivo || '') } })", 1],
]

const contar = (t, a) => t.split(a).length - 1
function construir(vivo) {
  const w = JSON.parse(JSON.stringify(vivo))
  const n = w.nodes.find((x) => x.name === NODO)
  if (!n) throw new Error(`falta el nodo ${NODO}`)
  let t = n.parameters.jsCode
  const informe = []
  for (const [a, b, veces] of REEMPLAZOS) {
    const c = contar(t, a)
    if (c !== veces) throw new Error(`${NODO} · ${c}× (se esperaban ${veces}): ${a.slice(0, 70)}`)
    t = t.split(a).join(b)
    informe.push(`×${c} · ${a.trim().slice(0, 70)}`)
  }
  new Function(`return (async function(){${t}\n})`)
  n.parameters.jsCode = t
  return { w, informe }
}

if (require.main === module) {
  const vivo = JSON.parse(fs.readFileSync(path.join(DIR, 'vivo', ID + '.json'), 'utf8'))
  const { w, informe } = construir(vivo)
  fs.writeFileSync(path.join(DIR, 'nuevo', ID + '.json'), JSON.stringify(w, null, 2))
  console.log(informe.join('\n'))
}
module.exports = { REEMPLAZOS, construir, NODO, ID }
