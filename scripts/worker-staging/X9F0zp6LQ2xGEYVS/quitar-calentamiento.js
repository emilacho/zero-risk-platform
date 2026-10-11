/**
 * QUITAR LA FRASE DE CALENTAMIENTO DEL MODELO (ronda 73) · texto plano apto para pegar en un nodo Code de n8n (sin require/import/export).
 * Es de forma GENERAL: sirve a cualquier agente que entregue un documento (plan, manual, informe…); no sabe de qué cliente, rubro ni documento se trata.
 *
 * Qué es: el modelo suele abrir con una frase PARA EL USUARIO («Voy a escribir el plan…», «Aquí tienes el informe:», «Claro, …») y una raya `---` antes del documento.
 * Esa frase no es parte del documento: no debe guardarse, ni subirse a Drive, ni leerla el brief.
 * Regla (conservadora: ante la duda NO se toca): se quita el bloque inicial SOLO si
 *   1. el texto NO arranca ya en un título de markdown,
 *   2. el bloque son 1–3 párrafos cortos, sin viñetas ni títulos ni tablas,
 *   3. alguno de esos párrafos habla EN PRIMERA PERSONA o al lector como el que acompaña una entrega («Voy a…», «Aquí tienes…», «A continuación…», «Claro…»),
 *   4. y lo que sigue empieza en un título de markdown (opcionalmente tras una raya `---`): sin documento detrás, no se quita nada.
 * Devuelve { texto, quitado } · idempotente.
 */
function quitarCalentamiento(entrada) {
  var original = String(entrada === undefined || entrada === null ? '' : entrada)
  var s = original.replace(/^﻿/, '').replace(/^\s+/, '')
  if (!s || /^#{1,6}\s/.test(s)) return { texto: original, quitado: '' }
  // el primer título del documento
  var m = /(^|\n)(#{1,6}[ \t]+\S)/.exec(s)
  if (!m) return { texto: original, quitado: '' }
  var posTitulo = m.index + m[1].length
  var antes = s.slice(0, posTitulo)
  // la raya de separación (---, ***, ___) justo antes del título no es documento
  var bloque = antes.replace(/\n[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*\n*$/, '\n').replace(/\s+$/, '')
  if (!bloque) return { texto: original, quitado: '' }
  var lineas = bloque.split(/\n/)
  // sin viñetas, tablas, títulos, código ni citas: es una frase de acompañamiento, no contenido
  for (var i = 0; i < lineas.length; i++) {
    if (/^\s*([-*+•]\s|\d+[.)]\s|\||```|>|#)/.test(lineas[i])) return { texto: original, quitado: '' }
  }
  var parrafos = bloque.split(/\n\s*\n/).map(function (p) { return p.trim() }).filter(function (p) { return p && !/^([-*_])(?:\s*\1){2,}$/.test(p) })
  if (parrafos.length < 1 || parrafos.length > 3) return { texto: original, quitado: '' }
  for (var k = 0; k < parrafos.length; k++) if (parrafos[k].length > 320) return { texto: original, quitado: '' }
  var acompana = /^(?:claro|perfecto|entendido|listo|de acuerdo|por supuesto|excelente|muy bien|vale|ok|okay|sure|certainly|of course|got it|absolutely)\b|^(?:voy a|vamos a|procedo a|empiezo|comienzo|empecemos|a continuaci[oó]n|aqu[ií] (?:est[aá]|tienes|tiene|va|te dejo|te entrego|presento|est[aá]n)|te (?:entrego|dejo|presento|comparto)|le (?:entrego|dejo|presento)|ahora (?:voy|escribo|redacto|armo)|con (?:toda )?la (?:evidencia|informaci[oó]n)|tengo (?:todo|toda|lo necesario|la evidencia)|ya tengo|habiendo (?:le[ií]do|revisado)|bas[aá]ndome|seg[uú]n lo (?:pedido|solicitado)|i(?:'| wi)ll\b|i(?:'|’)m going to|here(?:'|’)s|here is|let me|below is)/i
  var habla = false
  for (var j = 0; j < parrafos.length; j++) if (acompana.test(parrafos[j].replace(/^[*_>\s]+/, ''))) habla = true
  if (!habla) return { texto: original, quitado: '' }
  return { texto: s.slice(posTitulo), quitado: bloque }
}
