/**
 * MARKDOWN → TEXTO LEGIBLE PARA EL PDF (ronda 73) · texto plano apto para pegar en un nodo Code de n8n (sin require/import/export).
 * El flujo «Texto → Drive» sube el texto como documento de Google y lo exporta a PDF; el documento NO interpreta markdown, así que el PDF salía con `#`, `**`, `---` y tablas con barras.
 * Es general (sirve a cualquier documento que llegue): no sabe de clientes ni de qué documento se trata. No toca el contenido, solo su marcado.
 */
function markdownATexto(entrada) {
  var t = String(entrada === undefined || entrada === null ? '' : entrada).split('\r\n').join('\n')
  var enCodigo = false
  var salida = []
  var lineas = t.split('\n')
  for (var i = 0; i < lineas.length; i++) {
    var l = lineas[i]
    if (/^\s*```/.test(l)) { enCodigo = !enCodigo; continue }
    if (enCodigo) { salida.push(l); continue }
    // raya horizontal (---, ***, ___): separa secciones, no es texto
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(l)) { salida.push(''); continue }
    // fila de separación de tabla (|---|---|)
    if (/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.indexOf('|') >= 0) continue
    // fila de tabla → celdas separadas por « · »
    if (/^\s*\|.*\|\s*$/.test(l)) {
      l = l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim() }).filter(function (c) { return c !== '' }).join(' · ')
    }
    // título: se quitan las almohadillas (la línea queda sola, con aire)
    var h = /^\s{0,3}#{1,6}[ \t]+(.*?)\s*#*\s*$/.exec(l)
    if (h) { if (salida.length && salida[salida.length - 1] !== '') salida.push(''); l = h[1] }
    // viñetas
    l = l.replace(/^(\s*)[-*+][ \t]+/, '$1• ')
    // cita
    l = l.replace(/^\s*>[ \t]?/, '')
    salida.push(l)
  }
  var s = salida.join('\n')
  // énfasis y código en línea
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, '$1').replace(/__([^_\n]+?)__/g, '$1')
  s = s.replace(/(^|[\s(«"'¿¡])\*([^*\n]+?)\*(?=[\s).,;:!?»"']|$)/g, '$1$2')
  s = s.replace(/`([^`\n]*)`/g, '$1')
  // enlaces [texto](url) → texto (url)
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 ($2)')
  // escapes de markdown: \# \* \_ \| \! \( \) \[ \] \- \. \\ \` \> \~
  s = s.replace(/\\([\\`*_{}\[\]()#+\-.!|>~])/g, '$1')
  // aire: no más de una línea en blanco seguida
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
  return s.replace(/^\s+/, '').replace(/\s+$/, '') + '\n'
}
