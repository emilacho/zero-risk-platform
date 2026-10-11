// PLANEACIÓN · r73 · la frase de calentamiento del modelo fuera del plan guardado y del PDF · CC#2 · 2026-10-11 · ronda 73
// El plan guardado (`52529141…`) y su PDF empezaban con «Voy a escribir el plan de 90 días… » + `---` antes del título (paso 2 de CC#1 §2).
// Un SOLO nodo cambia: «¿Llegó la vuelta?». Antes de revisar el registro se quita el bloque de acompañamiento (`quitar-calentamiento.js`, general: no sabe de cliente ni de documento).
// El texto que sale de ese nodo es el que guardan «Guardar el plan» y «Plan → Drive (PDF)» y el que lee el brief ⇒ se arregla en los tres a la vez.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
export const NODO = '¿Llegó la vuelta?'
export const FUNCION = readFileSync(join(aqui, 'quitar-calentamiento.js'), 'utf8').split('\r\n').join('\n').replace(/\s+$/, '')

const PUNTO_DE_ENTRADA = 'const e = $input.first().json || {};'
const LINEA_VIEJA = 'const revisionDeRegistro = llego ? corregirRegistroDelPlan(textoDelRedactor, registroDelPlan) : null;'
const LINEA_NUEVA = [
  '// r73 · la frase de calentamiento del modelo («Voy a escribir el plan…» + ---) NO es parte del documento: por código, antes de revisar el registro',
  'const sinCalentamiento = llego ? quitarCalentamiento(textoDelRedactor) : { texto: textoDelRedactor, quitado: \'\' };',
  'const textoBase = sinCalentamiento.texto.trim() ? sinCalentamiento.texto : textoDelRedactor;',
  'const revisionDeRegistro = llego ? corregirRegistroDelPlan(textoBase, registroDelPlan) : null;',
].join('\n')
const CAMPO_VIEJO = '  descartados_declarados: llego && Array.isArray(descartados) ? descartados.length : null,'
const CAMPO_NUEVO = '  calentamiento_quitado: sinCalentamiento.quitado || null,\n' + CAMPO_VIEJO

export function construirCodigo(codigo) {
  const crlf = codigo.includes('\r\n')
  let s = codigo.split('\r\n').join('\n')
  const una = (a, b) => {
    const n = s.split(a).length - 1
    if (n !== 1) throw new Error('el texto a cambiar aparece ' + n + ' veces (debe ser 1): ' + a.slice(0, 70))
    s = s.replace(a, () => b)
  }
  if (s.includes('function quitarCalentamiento')) throw new Error('el nodo ya tiene quitarCalentamiento')
  una(PUNTO_DE_ENTRADA, FUNCION + '\n\n' + PUNTO_DE_ENTRADA)
  una(LINEA_VIEJA, LINEA_NUEVA)
  una(CAMPO_VIEJO, CAMPO_NUEVO)
  return crlf ? s.split('\n').join('\r\n') : s
}

export function construirFlujo(flujo) {
  const copia = JSON.parse(JSON.stringify(flujo))
  const n = copia.nodes.find((x) => x.name === NODO)
  if (!n) throw new Error('no está el nodo ' + NODO)
  n.parameters.jsCode = construirCodigo(n.parameters.jsCode)
  return copia
}
