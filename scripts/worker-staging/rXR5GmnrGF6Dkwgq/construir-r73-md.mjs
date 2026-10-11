// TEXTO → DRIVE (PDF) · r73 (2.º cambio) · el PDF del plan deja de salir como markdown crudo (hallazgo de CC#3 en el paso 2: `#`, `**`, `---`, tablas con barras).
// Un SOLO nodo cambia: «Leer el pedido» pasa el texto por `markdownATexto` (general: cualquier documento que llegue a este flujo). El texto GUARDADO en la base no se toca: solo el que va al documento/PDF.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
export const NODO = 'Leer el pedido'
export const FUNCION = readFileSync(join(aqui, 'markdown-a-texto.js'), 'utf8').split('\r\n').join('\n').replace(/\s+$/, '')

const VIEJA = "const texto = String(b.texto || '');"
const NUEVA = "// r73 · el documento de Google no interpreta markdown: se pasa a texto legible (sin # ni ** ni --- ni barras de tabla) · el texto guardado en la base no cambia\nconst texto = markdownATexto(String(b.texto || ''));"

export function construirCodigo(codigo) {
  const crlf = codigo.includes('\r\n')
  let s = codigo.split('\r\n').join('\n')
  if (s.includes('function markdownATexto')) throw new Error('el nodo ya tiene markdownATexto')
  const n = s.split(VIEJA).length - 1
  if (n !== 1) throw new Error('el texto a cambiar aparece ' + n + ' veces (debe ser 1): ' + VIEJA)
  s = s.replace(VIEJA, () => NUEVA)
  const ancla = 'const b = $input.first().json.body || $input.first().json;'
  if (s.split(ancla).length - 1 !== 1) throw new Error('no se encontró el punto de entrada del nodo')
  s = s.replace(ancla, () => FUNCION + '\n\n' + ancla)
  return crlf ? s.split('\n').join('\r\n') : s
}

export function construirFlujo(flujo) {
  const copia = JSON.parse(JSON.stringify(flujo))
  const n = copia.nodes.find((x) => x.name === NODO)
  if (!n) throw new Error('no está el nodo ' + NODO)
  n.parameters.jsCode = construirCodigo(n.parameters.jsCode)
  return copia
}
