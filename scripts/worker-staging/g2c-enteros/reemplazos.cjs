/**
 * G2c · los textos del dueño y lo que recibe el redactor del plan, ENTEROS en los flujos n8n · 19-nov · firma de Emilio «nada se recorta» (CC5).
 * Base = el flujo VIVO bajado el 19-nov ~01:45Z (carpeta vivo/): el manual ya trae lo de las fotos de CC2 (versionId c745d997) y la planeación es la de G1b (4f145345).
 * Solo se aplican estos reemplazos exactos, nodo por nodo; nada más cambia. Cada uno debe aparecer las veces declaradas, si no, el guion se detiene.
 * Uso: node reemplazos.cjs  ⇒ escribe nuevo/<id>.json · lo aplica CC7 por la puerta (0 vivos), nunca CC5.
 * 100000 = TOPE_DEL_TEXTO_DEL_DUENO (src/lib/limites-de-tamano.ts): la plataforma ya no deja pasar más, así que en el flujo no recorta nada.
 */
const fs = require('fs')
const path = require('path')
const DIR = __dirname

// [nodo, campo ('jsCode' | 'url'), antes, después, veces]
const REEMPLAZOS = {
  // ── el manual (cimiento): los cambios que pide el dueño, enteros (antes 20 000)
  ssLtwYPt7zxuvnM2: [
    ['[BB] Fan-out prep', 'jsCode', "r.cambios_del_dueno).replace(/\\s+/g, ' ').trim().slice(0, 20000);", "r.cambios_del_dueno).replace(/\\s+/g, ' ').trim().slice(0, 100000);", 1],
    // el presupuesto de la tarea (15 500) se comía el borrador del manual cuando el pedido del dueño era largo (`cuerpoBorrador.slice(0, falta)` con falta ≤ 0): sube al techo real del pedido, como el resto (G1b)
    ['*Equipo*', 'jsCode', 'const PRESUPUESTO_TAREA = 15500;', 'const PRESUPUESTO_TAREA = 1490000;', 10],
    ['*Equipo*', 'jsCode', "RE.cambios_del_dueno).replace(/\\s+/g, ' ').trim(), 20000)", "RE.cambios_del_dueno).replace(/\\s+/g, ' ').trim(), 100000)", null],
  ],
  // ── la planeación
  X9F0zp6LQ2xGEYVS: [
    // lo que el negocio respondió con sus palabras: la lectura pedía 30 (la ruta da hasta 100) y el nodo cortaba 30 ítems, 600 c/u, 6000 en total
    ['Lo que dijo el dueño · texto libre', 'url', '&limite=30', '&limite=100', 1],
    ['Unir el texto libre del dueño al paquete', 'jsCode', 'const items = lista.slice(0, 30).map(function (x) {', 'const items = lista.map(function (x) {', 1],
    ['Unir el texto libre del dueño al paquete', 'jsCode', 'return { tema: corta(x.tema, 80), hace_dias: dias, respuesta: corta(x.respuesta, 600) };', 'return { tema: corta(x.tema, 100000), hace_dias: dias, respuesta: corta(x.respuesta, 100000) };', 1],
    ['Unir el texto libre del dueño al paquete', 'jsCode', 'items.forEach(function (it) { const n = it.respuesta.length + it.tema.length + 30; if (usado + n <= 6000) { usado += n; recorte.push(it); } });', 'items.forEach(function (it) { usado += it.respuesta.length + it.tema.length + 30; recorte.push(it); });', 1],
    ['Unir el texto libre del dueño al paquete', 'jsCode', 'texto_libre_del_dueno: recorte, texto_libre_estado: estado }', 'texto_libre_del_dueno: recorte, texto_libre_estado: estado, texto_libre_recortado_por_la_lectura: !!(cuerpo && cuerpo.recortado === true) }', 1],
    // lo que declaró el dueño (hechos): 20 filas, 500 la respuesta, 120 el tema, 80 la sede, 6 × 120 las frases negadas
    ['Redactor (B4)', 'jsCode', 'for (let i = 0; i < lista.length && filas.length < 20; i++) {', 'for (let i = 0; i < lista.length; i++) {', 1],
    ['Redactor (B4)', 'jsCode', 'const resp = una(h.respuesta, 500);', 'const resp = una(h.respuesta, 100000);', 1],
    ['Redactor (B4)', 'jsCode', 'const tema = una(h.tema, 120);', 'const tema = una(h.tema, 100000);', 1],
    ['Redactor (B4)', 'jsCode', 'const sede = una(h.sede, 80);', 'const sede = una(h.sede, 100000);', 1],
    ['Redactor (B4)', 'jsCode', '.map(function (x) { return una(x, 120); }).filter(Boolean).slice(0, 6);', '.map(function (x) { return una(x, 100000); }).filter(Boolean);', 1],
    // G4 · el redactor recibe los brazos enteros: cada brazo 2500, lo citado 800, cada dato de la tabla 1200, 20 citas × 120
    ['Redactor (B4)', 'jsCode', "' · material citado: ' + JSON.stringify(d.material_citado).slice(0, 800)", "' · material citado: ' + JSON.stringify(d.material_citado)", 1],
    ['Redactor (B4)', 'jsCode', "if (m.brazo !== 'analisis') return JSON.stringify(d).slice(0, 2500);", "if (m.brazo !== 'analisis') return JSON.stringify(d);", 1],
    ['Redactor (B4)', 'jsCode', "i.citas.slice(0, 20).map((c) => String(c).slice(0, 120)).join(' | ')", "i.citas.map((c) => String(c)).join(' | ')", 1],
    ['Redactor (B4)', 'jsCode', 'var _V3_MAX_CONTENIDO = 1200', 'var _V3_MAX_CONTENIDO = 100000', 1],
  ],
}

const cuenta = (s, a) => s.split(a).length - 1
function aplicar(id) {
  const w = JSON.parse(fs.readFileSync(path.join(DIR, 'vivo', `${id}.json`), 'utf8'))
  const informe = []
  for (const [nodo, campo, a, b, veces] of REEMPLAZOS[id]) {
    const nodos = nodo.startsWith('*') ? w.nodes.filter((n) => n.name.includes(nodo.slice(1, -1))) : w.nodes.filter((n) => n.name === nodo)
    if (!nodos.length) throw new Error(`${id} · no está el nodo «${nodo}»`)
    let total = 0
    for (const n of nodos) {
      const t = n.parameters?.[campo]
      if (typeof t !== 'string') continue
      const k = cuenta(t, a)
      if (cuenta(t, b) && k === 0) throw new Error(`${id} · «${n.name}» ya trae el valor nuevo`)
      if (!k) continue
      n.parameters[campo] = t.split(a).join(b)
      total += k
    }
    if (veces !== null && total !== veces) throw new Error(`${id} · «${nodo}» · ${a.slice(0, 60)}… aparece ${total} veces, se esperaban ${veces}`)
    if (!total) throw new Error(`${id} · «${nodo}» · ${a.slice(0, 60)}… no aparece`)
    informe.push(`${nodo} · ${total}×`)
  }
  fs.mkdirSync(path.join(DIR, 'nuevo'), { recursive: true })
  fs.writeFileSync(path.join(DIR, 'nuevo', `${id}.json`), JSON.stringify(w, null, 2) + '\n')
  return informe
}

module.exports = { REEMPLAZOS }
if (require.main === module) for (const id of Object.keys(REEMPLAZOS)) console.log(id, aplicar(id).join(' | '))
