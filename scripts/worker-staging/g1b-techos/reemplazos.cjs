/**
 * G1b · techos al máximo en los flujos n8n · 18-nov · firma de Emilio «nada se recorta» (CC5).
 * Base = el flujo VIVO bajado el 18-nov (carpeta vivo/). Solo se aplican estos reemplazos exactos, nodo por nodo; nada más cambia.
 * Uso: node reemplazos.cjs  ⇒ escribe nuevo/<id>.json · lo publica CC7 por la puerta (0 vivos), nunca CC5.
 */
const fs = require('fs')
const path = require('path')
const DIR = __dirname

const LISTA = "['disabled', 'low', 'medium', 'high', 'xhigh', 'max', 'maximo', 'completo']"
const REEMPLAZOS = {
  // la oficina y la jefatura: el turno sin modo manda el máximo (la plataforma ya manda 'maximo' · #1183)
  bTbWL9lUvQCfStAz: { '② Armar el pedido': [["p.thinking_mode || 'disabled'", "p.thinking_mode || 'maximo'"]] },
  o8qaF7bI0PKv2XGZ: { '② Armar el pedido': [["p.thinking_mode || 'disabled'", "p.thinking_mode || 'maximo'"]] },
  // el productor de piezas y sus chequeos
  lVCLzxQCKNkd3uS0: {
    '⑤ Armar el cuerpo del productor': [["thinking_mode: 'disabled'", "thinking_mode: 'maximo'"]],
    '⑦ Chequeos': [["thinking_mode: 'disabled'", "thinking_mode: 'maximo'"]],
  },
  // el brief y la cadena: por defecto al máximo y la lista de niveles nuevos
  PQdIgbuFexuBsoh8: { '⓪ Sobre · llave · modo seco': sobre() },
  BNXqlaX1oHSfZIpF: { '⓪ Sobre · llave · modo seco': sobre() },
  // el manual (cimiento) y la planeación: el tope del pedido sube con TOPE_REAL_DEL_PEDIDO (600.000 → 1.500.000), con el mismo margen de 10.000
  ssLtwYPt7zxuvnM2: '590000→1490000',
  X9F0zp6LQ2xGEYVS: '590000→1490000',
}
function sobre() {
  return [
    ["let razonamiento = 'disabled'", "let razonamiento = 'maximo' // 18-nov · G1 «nada se recorta»: el techo de respuesta subió a 128.000 (#1183), el razonamiento va al máximo del modelo"],
    ["body.razonamiento !== 'disabled' && body.razonamiento !== 'low' && body.razonamiento !== 'medium' && body.razonamiento !== 'completo'", `!${LISTA}.includes(body.razonamiento)`],
    ['razonamiento debe ser disabled | low | medium | completo', 'razonamiento debe ser disabled | low | medium | high | xhigh | max | maximo | completo'],
  ]
}

const contar = (t, a) => t.split(a).length - 1
const informe = []
for (const [id, regla] of Object.entries(REEMPLAZOS)) {
  const w = JSON.parse(fs.readFileSync(path.join(DIR, 'vivo', id + '.json'), 'utf8'))
  for (const n of w.nodes) {
    const t = n.parameters && n.parameters.jsCode
    if (typeof t !== 'string') continue
    let nuevo = t
    if (typeof regla === 'string') {
      const c = contar(nuevo, '590000')
      if (c) { nuevo = nuevo.split('590000').join('1490000'); informe.push(`${id} · ${n.name} · 590000→1490000 ×${c}`) }
    } else if (regla[n.name]) {
      for (const [a, b] of regla[n.name]) {
        const c = contar(nuevo, a)
        if (c === 0) throw new Error(`${id} · ${n.name} · NO ESTÁ: ${a}`)
        nuevo = nuevo.split(a).join(b)
        informe.push(`${id} · ${n.name} · ×${c} · ${a.slice(0, 60)}`)
      }
    }
    if (nuevo !== t) { new Function(`return (async function(){${nuevo}\n})`); n.parameters.jsCode = nuevo }
  }
  for (const nombre of typeof regla === 'string' ? [] : Object.keys(regla)) if (!w.nodes.some((n) => n.name === nombre)) throw new Error(`${id} · falta el nodo ${nombre}`)
  fs.writeFileSync(path.join(DIR, 'nuevo', id + '.json'), JSON.stringify(w, null, 1))
}
console.log(informe.join('\n'))
module.exports = { REEMPLAZOS }
