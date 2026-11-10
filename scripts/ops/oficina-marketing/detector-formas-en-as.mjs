/**
 * 10-nov · RESPUESTA de Lenovo por Emilio (decisión 3) · el detector de trato pegado en los flujos suma las formas de voseo que no veía
 * («necesitás», «continuás», «ajustás», «parás», «etiquetá», «descargá», «configurá»), igual que `src/lib/trato/trato-logica.js`.
 *   node detector-formas-en-as.mjs <respaldo.json> <salida.json>
 * No toca la red: el respaldo se saca con `n8n-flujo.mjs respaldar` y la salida se publica con `n8n-flujo.mjs restaurar --ejecutar`.
 * Cambia SOLO los nodos que llevan el generador `function formasVoseo()`; cada uno se compila antes de escribir. Idempotente: si ya está, no cambia nada.
 */
import fs from 'node:fs'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const DECLARACION = "var VERBOS_SOLO_VOSEO = 'necesitar continuar ajustar parar etiquetar descargar configurar'.split(' ')"
const COMENTARIO = '// 10-nov (decisión 3 de Lenovo por Emilio): verbos que SOLO suman formas de voseo; en tuteo y usted chocan con sustantivos («las descargas», «el ajuste», «para»)'
const ANCLA_CLITICOS = "var CLITICOS = ['', 'lo', 'la', 'los', 'las', 'le', 'les', 'me', 'nos', 'te', 'se']"
const RECORRE_ANTES = 'function formasVoseo() {\n  var s = {}\n  VERBOS.forEach(function (inf) {'
const RECORRE_DESPUES = 'function formasVoseo() {\n  var s = {}\n  VERBOS.concat(VERBOS_SOLO_VOSEO).forEach(function (inf) {'

const una = (codigo, antes, que) => {
  const n = codigo.split(antes).length - 1
  if (n !== 1) throw new Error(`${que}: esperaba 1 ocurrencia y hay ${n}`)
}

/** el código de UN nodo con el cambio (respeta sus fines de línea) */
export function conFormasEnAs(codigo) {
  if (codigo.includes('VERBOS_SOLO_VOSEO')) return codigo
  const crlf = codigo.includes('\r\n')
  let c = crlf ? codigo.split('\r\n').join('\n') : codigo
  una(c, ANCLA_CLITICOS, 'CLITICOS')
  una(c, RECORRE_ANTES, 'formasVoseo')
  c = c.replace(ANCLA_CLITICOS, () => `${COMENTARIO}\n${DECLARACION}\n${ANCLA_CLITICOS}`)
  c = c.replace(RECORRE_ANTES, () => RECORRE_DESPUES)
  return crlf ? c.split('\n').join('\r\n') : c
}

/** compila el código como lo hace el nodo Code (cuerpo de una función asíncrona) */
export function compila(codigo) {
  new vm.Script(`(async function () {\n${codigo}\n})`)
  return true
}

/** el flujo con el cambio en cada nodo que lleva el generador · devuelve también los nombres cambiados */
export function construirFormasEnAs(flujo) {
  const cambiados = []
  const nodes = flujo.nodes.map((n) => {
    const js = n.parameters?.jsCode
    if (typeof js !== 'string' || !js.includes('function formasVoseo()')) return n
    const nuevo = conFormasEnAs(js)
    compila(nuevo)
    if (nuevo !== js) cambiados.push(n.name)
    return { ...n, parameters: { ...n.parameters, jsCode: nuevo } }
  })
  return { flujo: { ...flujo, nodes }, cambiados }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [entrada, salida] = process.argv.slice(2)
  if (!entrada || !salida) { console.error('uso: detector-formas-en-as.mjs <respaldo.json> <salida.json>'); process.exit(2) }
  const { flujo, cambiados } = construirFormasEnAs(JSON.parse(fs.readFileSync(entrada, 'utf8')))
  fs.writeFileSync(salida, JSON.stringify(flujo, null, 2))
  console.log(`${flujo.name} · nodos cambiados: ${cambiados.length ? cambiados.join(' · ') : 'ninguno (ya estaba)'}`)
}
