// 21-nov · opción A (GO Lenovo 02:47Z · A1 probada 04:02Z · CC1) · EL CORREDOR ENTREGA LA VUELTA en los 4 sub-flujos de la cadena
// (estrategia · calendario · fechas · fichas).
//
// ANTES: «Agente (run-sdk)» esperaba la respuesta EN LA MISMA LLAMADA, con un techo de 800 s (el de Vercel). Un razonamiento `maximo` no cabe.
// AHORA (el patrón del brief `PQdIg`, sin el techo):
//   «Armar la llamada» le suma `callback_url: $execution.resumeUrl` + `callback_mode: 'runner'`
//   → «Agente (run-sdk)» recibe el acuse 202 al instante
//   → «¿Quedó en espera?» (statusCode 202) → «Esperar la vuelta» (Wait por webhook, tope ESPERA_DE_LA_VUELTA_S)
//   → «La vuelta» (la deja con la forma `{ statusCode, body }` de antes) → «Armar guardar», sin cambios.
//   Si run-sdk NO contestó 202 (error, o la vía de siempre), se sigue como antes: directo a «Armar guardar».
//
// UNA sola función pura. La usa el constructor (los JSON del repositorio) y el parche del vivo (`aplicar.mjs`), así que los dos quedan iguales.
// Candados: falla si el flujo no tiene exactamente los nodos de antes, si la llamada no es la de antes o si ya tiene la espera.
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const NODOS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'nodos')
const leer = (f) => fs.readFileSync(path.join(NODOS, f), 'utf8').replace(/\r\n/g, '\n')
// el mismo id estable que el constructor (md5 en forma de uuid), sin cortar texto: la huella entera, partida en sus 5 grupos
const uuid = (s) => createHash('md5').update(s).digest('hex').replace(/^(\w{8})(\w{4})(\w{4})(\w{4})(\w{12})$/, '$1-$2-$3-$4-$5')

/** la espera del Wait: la MISMA que `ESPERA_DE_LA_VUELTA_S` de `src/lib/cadena/constantes.ts` (una prueba las ata) */
export const ESPERA_S = 3600
/** el corte de la llamada misma: si run-sdk no da el acuse y corre por la vía de siempre, se espera lo que se esperaba antes */
export const CORTE_DE_LA_LLAMADA_MS = 800000

/** los dos sub-flujos tienen la llamada en pasos distintos: ② en estrategia · calendario · fichas, ④ en fechas */
export const FORMA = {
  paso: { n: '②', llamada: '② Armar la llamada', agente: '② Agente (run-sdk)', guardar: '③ Armar guardar', archivo: 'paso-armar-llamada.js' },
  fechas: { n: '④', llamada: '④ Armar la llamada', agente: '④ Agente (run-sdk)', guardar: '⑤ Armar guardar', archivo: 'fechas-armar-llamada.js' },
}

/** la línea que suma la vuelta por el corredor a la llamada: se pega después del `const llamada = …` */
export const LINEA_DEL_CORREDOR =
  "// 🔴 21-nov · opción A: la vuelta la entrega el corredor de Railway al Wait de este flujo (sin el techo de 800 s de Vercel)\n" +
  "llamada.callback_url = $execution.resumeUrl\n" +
  "llamada.callback_mode = 'runner'\n"

/** el código de «Armar la llamada» con la vuelta por el corredor (el de antes, con la línea nueva antes del `return`) */
export function llamadaConCorredor(codigoAntes) {
  const marca = '\nreturn [{ json: { ...s, llamada } }]'
  if (codigoAntes.split(marca).length !== 2) throw new Error('«Armar la llamada» no es la de antes: no tiene un único `return [{ json: { ...s, llamada } }]`')
  if (codigoAntes.includes('callback_mode')) throw new Error('«Armar la llamada» ya tiene la vuelta por el corredor')
  return codigoAntes.replace(marca, '\n' + LINEA_DEL_CORREDOR + marca.slice(1))
}

const nodoUnico = (flujo, nombre) => {
  const hay = flujo.nodes.filter((n) => n.name === nombre)
  if (hay.length !== 1) throw new Error(`se esperaba 1 nodo «${nombre}», hay ${hay.length}`)
  return hay[0]
}

/**
 * El cambio, puro: devuelve una COPIA del flujo con la espera por el corredor. No toca nada más.
 * @param {any} flujo   el sub-flujo (vivo o construido)
 * @returns {any}
 * @param {'paso'|'fechas'} forma
 * @param {{ tiempoDeAntesMs?: number[] }} [opc]  los cortes que se aceptan como «de antes» (el vivo tiene 800 000; el constructor viejo, 290 000)
 */
export function conEsperaPorElCorredor(flujo, forma, opc = {}) {
  const F = FORMA[forma]
  if (!F) throw new Error(`forma desconocida: ${forma}`)
  const aceptados = opc.tiempoDeAntesMs ?? [CORTE_DE_LA_LLAMADA_MS]
  const copia = structuredClone(flujo)
  const nombres = { espera: `${F.n} ¿Quedó en espera?`, wait: `${F.n} Esperar la vuelta`, vuelta: `${F.n} La vuelta` }
  for (const n of Object.values(nombres)) if (copia.nodes.some((x) => x.name === n)) throw new Error(`el flujo ya tiene «${n}»: ya tiene la espera`)

  // 1 · la llamada suma la dirección de la vuelta
  const llamada = nodoUnico(copia, F.llamada)
  llamada.parameters.jsCode = llamadaConCorredor(String(llamada.parameters.jsCode).replace(/\r\n/g, '\n'))

  // 2 · el agente: el mismo nodo; solo el corte queda en 800 s (el acuse llega en < 1 s; si cae a la vía de siempre, espera como antes)
  const agente = nodoUnico(copia, F.agente)
  const t = agente.parameters?.options?.timeout
  if (!aceptados.includes(t)) throw new Error(`«${F.agente}» corta a los ${t} ms, no en ${aceptados.join(' / ')}: el flujo no es el que se midió`)
  agente.parameters.options.timeout = CORTE_DE_LA_LLAMADA_MS
  const salidaDeAntes = copia.connections[F.agente]?.main
  if (!salidaDeAntes || salidaDeAntes.length !== 1 || salidaDeAntes[0].length !== 1 || salidaDeAntes[0][0].node !== F.guardar) {
    throw new Error(`«${F.agente}» no sale solo a «${F.guardar}»: el flujo no es el que se midió`)
  }
  nodoUnico(copia, F.guardar)

  // 3 · los 3 nodos nuevos, al lado del agente
  const [x, y] = agente.position ?? [0, 0]
  const id = (nombre) => uuid(`${copia.name}|${nombre}`)
  copia.nodes.push(
    {
      id: id(nombres.espera), name: nombres.espera, type: 'n8n-nodes-base.if', typeVersion: 2, position: [x + 120, y + 160],
      parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: '={{ Number($json.statusCode) === 202 }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }] } },
    },
    {
      id: id(nombres.wait), name: nombres.wait, type: 'n8n-nodes-base.wait', typeVersion: 1.1, position: [x + 240, y + 160], webhookId: id(nombres.wait + '|webhook'),
      parameters: { resume: 'webhook', httpMethod: 'POST', limitWaitTime: true, resumeAmount: ESPERA_S, resumeUnit: 'seconds', options: {} },
    },
    {
      id: id(nombres.vuelta), name: nombres.vuelta, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x + 360, y + 160],
      parameters: { jsCode: leer('paso-la-vuelta.js').split('@@ESPERA_S@@').join(String(ESPERA_S)) },
    },
  )

  // 4 · los cables: agente → ¿espera? → (sí) Wait → la vuelta → guardar · (no) → guardar
  const a = (node) => [{ node, type: 'main', index: 0 }]
  copia.connections[F.agente] = { main: [a(nombres.espera)] }
  copia.connections[nombres.espera] = { main: [a(nombres.wait), a(F.guardar)] }
  copia.connections[nombres.wait] = { main: [a(nombres.vuelta)] }
  copia.connections[nombres.vuelta] = { main: [a(F.guardar)] }
  return copia
}

/**
 * 21-nov · al publicar #1263: la forma de un flujo (nodos + cables) para compararlo con el vivo, con las CLAVES de cada objeto ordenadas.
 * n8n guarda un nodo que trae `webhookId` con sus claves en otro orden (`id,name,webhookId,type,…`): mismo valor, otro texto. Comparar el texto tal cual
 * frenó la publicación con el vivo idéntico. El ORDEN de las listas (nodos, cables, salidas) sí cuenta y se conserva; solo se ordenan las claves.
 */
export function formaDelFlujo(f) {
  const orden = (v) => (Array.isArray(v) ? v.map(orden) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, orden(v[k])])) : v)
  return JSON.stringify(orden({ n: f.nodes, c: f.connections }))
}
export const mismaForma = (a, b) => formaDelFlujo(a) === formaDelFlujo(b)

/** cuál forma tiene cada sub-flujo vivo */
export const SUBFLUJOS = {
  ZnoFdGfACA36c3qE: { clave: 'cadena-estrategia', forma: 'paso' },
  cR22ztH1p2ihTIwD: { clave: 'cadena-calendario', forma: 'paso' },
  KNkgFo1hulmNY05s: { clave: 'cadena-fechas', forma: 'fechas' },
  k1IZ5eGfGbUeMQR8: { clave: 'cadena-fichas', forma: 'paso' },
}
