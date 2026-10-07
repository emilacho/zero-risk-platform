'use strict'
/**
 * EL HILO DEL LECTOR DE PDF (relevo 4 · hallazgo F1 de CC#3). Aquí, y SOLO aquí, corre `unpdf` (pdf.js).
 * Lo lanza `pdf.ts` en un hilo aparte con la memoria del montón topada y un reloj DURO: si el PDF se pasa de tiempo o de memoria, el hilo se MATA desde afuera
 * (a mitad de una página, a mitad de una descompresión) y el proceso principal ni se entera. Por eso aquí NO hay revisiones del PDF «por texto» ni cancelación
 * cooperativa: el aislamiento es lo que protege.
 * Sin red, sin disco, sin variables de entorno (el hilo nace con el entorno vacío), sin procesos hijos. Los topes llegan de `topes.ts` por el mensaje.
 * Protocolo: manda {tipo:'listo'} al cargar; recibe {datos: Uint8Array, topes}; contesta {tipo:'resultado', resultado} o {tipo:'error', nombre, mensaje}.
 */
const { parentPort } = require('node:worker_threads')
const { getDocumentProxy, getResolvedPDFJS } = require('unpdf')

/** junta los trozos de una página en líneas: por altura (tolerancia 3 pt), de arriba abajo; dentro de la línea, de izquierda a derecha */
function lineasDePagina(items) {
  const trozos = items
    .filter((i) => typeof i.str === 'string' && i.str.trim() !== '' && Array.isArray(i.transform))
    .map((i) => ({ t: i.str, x: i.transform[4], y: i.transform[5], w: i.width || 0, h: Math.abs(i.transform[3]) || i.height || 10 }))
  trozos.sort((a, b) => b.y - a.y || a.x - b.x)
  const lineas = []
  for (const t of trozos) {
    const ultima = lineas[lineas.length - 1]
    if (ultima && Math.abs(ultima[0].y - t.y) <= 3) ultima.push(t)
    else lineas.push([t])
  }
  return lineas.map((l) => {
    l.sort((a, b) => a.x - b.x)
    let s = ''
    let finPrevio = 0
    l.forEach((t, k) => {
      if (k > 0) {
        const hueco = t.x - finPrevio
        s += hueco > t.h * 1.5 ? '\t' : hueco > t.h * 0.15 ? ' ' : ''
      }
      s += t.t
      finPrevio = t.x + t.w
    })
    return s.trim()
  }).filter(Boolean)
}

/** los trozos de texto de una página, juntados de a poco: si pasan del tope se corta ahí (no se espera a tenerlos todos en memoria) */
async function itemsDePagina(pagina, topes) {
  const lector = pagina.streamTextContent().getReader()
  const items = []
  let caracteres = 0
  for (;;) {
    const { done, value } = await lector.read()
    if (done) return { items, cortada: false }
    for (const it of (value && value.items) || []) { items.push(it); caracteres += (it.str || '').length }
    if (items.length > topes.pdf_items_por_pagina || caracteres > topes.texto_salida_chars) {
      await lector.cancel().catch(() => undefined)
      return { items, cortada: true }
    }
  }
}

async function leer(datos, topes) {
  const avisos = []
  const doc = await getDocumentProxy(new Uint8Array(datos), { isEvalSupported: false, verbosity: 0, useSystemFonts: false, disableFontFace: true })
  try {
    const paginas = doc.numPages
    if (paginas > topes.pdf_paginas) return { estado: 'sobre_el_tope', paginas, motivo: `el PDF tiene ${paginas} páginas (tope ${topes.pdf_paginas}); no se extrajo nada`, texto: '', avisos }
    const { OPS } = await getResolvedPDFJS()
    const imagenes = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.paintJpegXObject, OPS.paintImageXObjectRepeat].filter((x) => typeof x === 'number'))
    const textos = []
    const sinTexto = []
    const cortadas = []
    let acumulado = 0
    let leidas = 0
    for (let n = 1; n <= paginas; n++) {
      if (acumulado > topes.texto_salida_chars) break // ya llegó al máximo de texto: no se leen más páginas
      const pagina = await doc.getPage(n)
      const { items, cortada } = await itemsDePagina(pagina, topes)
      leidas = n
      const lineas = lineasDePagina(items)
      if (cortada) cortadas.push(n)
      if (lineas.length) { const t = lineas.join('\n'); textos.push(t); acumulado += t.length + 2; continue }
      let conImagen = false
      try { conImagen = (await pagina.getOperatorList()).fnArray.some((f) => imagenes.has(f)) } catch (e) { conImagen = false }
      if (conImagen) sinTexto.push(n)
    }
    if (cortadas.length) avisos.push(`El texto de la(s) página(s) ${cortadas.join(', ')} se cortó (demasiado texto en una página); lo que sigue NO se leyó.`)
    if (leidas < paginas) avisos.push(`El texto leído ya llegó al máximo: las páginas ${leidas + 1} a ${paginas} NO se leyeron.`)
    const crudo = Buffer.from(datos.buffer, datos.byteOffset, datos.byteLength)
    let tieneJs = crudo.includes('/JavaScript') || crudo.includes('/JS')
    if (!tieneJs && doc.getJSActions) { try { tieneJs = Boolean(await doc.getJSActions()) } catch (e) { /* sin acciones */ } }
    if (tieneJs) avisos.push('El PDF contiene JavaScript: NO se ejecuta; solo se leyó el texto como datos.')
    const base = { paginas, ...(sinTexto.length ? { paginas_sin_texto: sinTexto } : {}) }
    if (textos.length === 0) {
      if (sinTexto.length) return { ...base, estado: 'escaneado', texto: '', avisos, motivo: 'el PDF es una imagen escaneada: no trae texto y no se inventa' }
      return { ...base, estado: 'vacio', texto: '', avisos, motivo: 'el PDF no tiene texto' }
    }
    if (sinTexto.length) avisos.push(`Las páginas ${sinTexto.join(', ')} son imágenes sin texto (escaneadas): NO se leyeron.`)
    let texto = textos.join('\n\n')
    if (texto.length > topes.texto_salida_chars) {
      avisos.push(`El texto se cortó a ${topes.texto_salida_chars} caracteres; lo que sigue NO se leyó.`)
      texto = texto.slice(0, topes.texto_salida_chars)
    }
    return { ...base, estado: 'ok', texto, avisos }
  } finally {
    try { await doc.destroy() } catch (e) { /* nada */ }
  }
}

parentPort.once('message', async (m) => {
  try {
    parentPort.postMessage({ tipo: 'resultado', resultado: await leer(m.datos, m.topes) })
  } catch (e) {
    parentPort.postMessage({ tipo: 'error', nombre: e && e.name ? String(e.name) : 'Error', mensaje: String(e && e.message ? e.message : e).slice(0, 300) })
  }
})
parentPort.postMessage({ tipo: 'listo' })
