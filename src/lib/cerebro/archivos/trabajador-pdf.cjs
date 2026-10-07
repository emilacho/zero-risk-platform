'use strict'
/**
 * EL PROCESO DEL LECTOR DE PDF (relevo 4 · F1 de CC#3, ronda 2: proceso hijo en vez de hilo). Aquí, y SOLO aquí, corre `unpdf` (pdf.js).
 * Lo lanza `pdf.ts` con `child_process.fork` como un PROCESO APARTE: con `--max-old-space-size`, entorno vacío y un RELOJ DURO (SIGKILL desde afuera). Un hilo no basta:
 * cuando su montón se agota, V8 puede abortar el proceso entero (código 134); un proceso hijo muere SOLO y el principal sigue vivo.
 * La memoria total del proceso se vigila desde un hilo guardián que vive dentro de este mismo proceso (no depende de que el PDF coopere ni de que el hilo principal esté libre):
 * al pasar el límite escribe MEMORIA_AGOTADA en la salida de errores y el proceso se mata a sí mismo.
 * Sin red, sin disco (salvo cargar la biblioteca), sin variables de entorno (nace con el entorno vacío), sin más procesos. Los topes llegan de `topes.ts` por el mensaje.
 * Protocolo (canal IPC): manda {tipo:'listo'} al cargar; recibe {datos: Uint8Array, topes, limite_mb}; contesta {tipo:'resultado', resultado} o {tipo:'error', nombre, mensaje}.
 */
const { Worker } = require('node:worker_threads')
const { getDocumentProxy, getResolvedPDFJS } = require('unpdf')

/** el guardián de memoria: un hilo propio, con su propio reloj, que mata el proceso al pasar el límite de memoria total (rss) */
function vigilarMemoria(limiteMb) {
  const guardian = new Worker(
    "const { workerData } = require('node:worker_threads'); const fs = require('node:fs'); setInterval(() => { if (process.memoryUsage.rss() > workerData.limite) { try { fs.writeSync(2, 'MEMORIA_AGOTADA' + String.fromCharCode(10)) } catch (e) { /* nada */ } process.kill(process.pid, 'SIGKILL') } }, 20)",
    { eval: true, env: {}, workerData: { limite: limiteMb * 1024 * 1024 } },
  )
  guardian.unref()
}

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

process.once('message', async (m) => {
  try {
    if (m && typeof m.limite_mb === 'number' && m.limite_mb > 0) vigilarMemoria(m.limite_mb)
    process.send({ tipo: 'resultado', resultado: await leer(m.datos, m.topes) })
  } catch (e) {
    process.send({ tipo: 'error', nombre: e && e.name ? String(e.name) : 'Error', mensaje: String(e && e.message ? e.message : e).slice(0, 300) })
  }
})
process.send({ tipo: 'listo' })
