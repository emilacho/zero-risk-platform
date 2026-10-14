// LA PUERTA DE REVISIÓN DE UN PRODUCTOR (J7 · CC#1 · 2026-10-14) · la pieza común de todos los enganches de la `jefatura`.
// Un productor (brief, estrategia, calendario, plan, prueba de pieza) abre una revisión por `POST /api/jefatura/revisiones`, despierta el flujo `jefatura · turno`, espera y lee el cierre.
// Los nodos NUEVOS salen todos de aquí (misma fuente), con nombres que empiezan por «JEF · » y NINGÚN `retryOnFail` (un nodo que paga no se reintenta solo).
//
//   JEF · armar → JEF · ¿se abre? ─sí→ JEF · abrir → JEF · ¿cómo abrió? → JEF · ¿hay que despertar el turno? ─sí→ JEF · despertar el turno → JEF · esperar → JEF · leer → JEF · ¿cerró? → JEF · ¿seguir esperando? ─sí→ (JEF · esperar)
//                                  └no┐                                   └no→ JEF · ¿espera sin turno? ─sí→ (JEF · esperar)                                                                                └no┐
//                                     └────────────────────────────────────────────────no────────────────────────────────────────────────────────────────────────────────────────────────────────────────────→ JEF · aplicar
//
// 🔴 APAGADO = IDÉNTICO A HOY: con la `jefatura` apagada (o el tipo fuera de `tipos_activos`, o fuera del ensayo) la ruta contesta 409 y `JEF · aplicar` devuelve EXACTAMENTE la salida del nodo de origen;
//    ningún camino de error (409, 4xx, 5xx, corte de red, plazo) cambia lo que ve el siguiente nodo. La revisión es un AVISO/ENTREGA que se suma, nunca un freno.
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
export const leerJs = (f) => fs.readFileSync(join(aqui, f), 'utf8').split('\r\n').join('\n')

export const N = {
  armar: 'JEF · armar',
  seAbre: 'JEF · ¿se abre?',
  abrir: 'JEF · abrir',
  comoAbrio: 'JEF · ¿cómo abrió?',
  despertarSi: 'JEF · ¿hay que despertar el turno?',
  despertar: 'JEF · despertar el turno',
  sinTurnoSi: 'JEF · ¿espera sin turno?',
  esperar: 'JEF · esperar',
  leer: 'JEF · leer',
  cerro: 'JEF · ¿cerró?',
  seguirSi: 'JEF · ¿seguir esperando?',
  aplicar: 'JEF · aplicar',
}
export const NOMBRES_DE_LA_PUERTA = Object.values(N)

const VERCEL = "($env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app')"
const JSON_H = { name: 'Content-Type', value: 'application/json' }
const LLAVE = { name: 'x-sala-dispatch-key', value: '={{ $env.SALA_DISPATCH_KEY }}' }

export const conCfg = (js, cfg) => {
  if (!js.includes('__CFG__')) throw new Error('el nodo no declara __CFG__')
  return js.split('__CFG__').join(JSON.stringify(cfg))
}
export const code = (name, jsCode, position) => ({ parameters: { jsCode }, name, type: 'n8n-nodes-base.code', typeVersion: 2, position })
const http = (name, url, body, position, timeout) => ({
  parameters: {
    method: 'POST', url, sendHeaders: true, headerParameters: { parameters: [JSON_H, LLAVE] }, sendBody: true, specifyBody: 'json', jsonBody: body,
    options: { timeout, response: { response: { fullResponse: true, neverError: true } } },
  },
  name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position, onError: 'continueRegularOutput',
})
export const si = (name, izq, position) => ({
  parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: izq, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }] }, options: {} },
  name, type: 'n8n-nodes-base.if', typeVersion: 2, position,
})

/**
 * Los nodos de la puerta y sus enlaces. `armar` y `aplicar` son el código propio de cada productor (con `__CFG__`); `cfg` = { tipo, plazo_s, cada_s, max_sondeos, ... }.
 * `origen` = [x, y] donde colgarlos (cerca del nodo desde el que se engancha).
 */
export function nodosDeLaPuerta({ armar, aplicar, cfg, origen, comoAbrio = leerJs('comun-como-abrio.js'), cerro = leerJs('comun-cerro.js') }) {
  const [x, y] = origen
  const p = (i, fila = 0) => [x + 240 * i, y + 220 * fila]
  const c = { max_sondeos: Math.ceil(cfg.plazo_s / cfg.cada_s) + 2, ...cfg }
  const nodes = [
    code(N.armar, conCfg(armar, c), p(1)),
    si(N.seAbre, '={{ $json.abrir === true }}', p(2)),
    // 60 s: abrir vuelve en segundos (la primera tarea es del jefe, un turno de n8n; el GPT corre después, dentro de `/turnos`); si la ruta no contesta, el productor sigue como hoy sin esperar minutos
    http(N.abrir, `={{ ${VERCEL} + '/api/jefatura/revisiones' }}`, '={{ JSON.stringify($json.sobre) }}', p(3), 60000),
    code(N.comoAbrio, conCfg(comoAbrio, c), p(4)),
    si(N.despertarSi, "={{ $json.jef.fase === 'esperar' }}", p(5)),
    http(N.despertar, "={{ ($env.N8N_WEBHOOK_BASE || 'https://n8n-production-72be.up.railway.app/webhook').replace(/\\/+$/, '') + '/zero-risk/jefatura-turno' }}", '={{ JSON.stringify({ revision_id: $json.jef.revision_id, turno: $json.jef.turno }) }}', p(6), 20000),
    si(N.sinTurnoSi, "={{ $json.jef.fase === 'espera_sin_turno' }}", p(5, 1)),
    { parameters: { resume: 'timeInterval', amount: c.cada_s, unit: 'seconds' }, name: N.esperar, type: 'n8n-nodes-base.wait', typeVersion: 1.1, position: p(7), webhookId: `jef-espera-${c.tipo}-0001` },
    http(N.leer, `={{ ${VERCEL} + '/api/jefatura/revisiones' }}`, `={{ JSON.stringify({ accion: 'leer', revision_id: $('${N.comoAbrio}').first().json.jef.revision_id }) }}`, p(8), 60000),
    code(N.cerro, conCfg(cerro, c), p(9)),
    si(N.seguirSi, "={{ $json.jef.fase === 'seguir' }}", p(10)),
    code(N.aplicar, conCfg(aplicar, c), p(11, 1)),
  ]
  const links = [
    [N.armar, N.seAbre], [N.seAbre, N.abrir, 0], [N.seAbre, N.aplicar, 1],
    [N.abrir, N.comoAbrio], [N.comoAbrio, N.despertarSi],
    [N.despertarSi, N.despertar, 0], [N.despertarSi, N.sinTurnoSi, 1],
    [N.despertar, N.esperar],
    [N.sinTurnoSi, N.esperar, 0], [N.sinTurnoSi, N.aplicar, 1],
    [N.esperar, N.leer], [N.leer, N.cerro], [N.cerro, N.seguirSi],
    [N.seguirSi, N.esperar, 0], [N.seguirSi, N.aplicar, 1],
  ]
  return { nodes, links, entrada: N.armar, salida: N.aplicar }
}

/**
 * Engancha la puerta en un flujo: lo que salía de `desde` (por su salida `salida`) ahora pasa por la puerta y sale de `JEF · aplicar` hacia los MISMOS destinos.
 * No toca ningún nodo existente ni sus parámetros; solo cambia ese enlace. Devuelve una copia.
 */
export function engancharPuerta(flujo, { desde, salida = 0, armar, aplicar, cfg, comoAbrio, cerro, continuacion }) {
  const copia = JSON.parse(JSON.stringify(flujo))
  const o = copia.nodes.find((n) => n.name === desde)
  if (!o) throw new Error(`no existe el nodo de origen «${desde}»`)
  for (const n of copia.nodes) if (NOMBRES_DE_LA_PUERTA.includes(n.name)) throw new Error(`el flujo ya tiene la puerta («${n.name}»)`)
  const sal = copia.connections[desde]
  const destinos = sal && sal.main && sal.main[salida] ? sal.main[salida] : []
  if (!destinos.length) throw new Error(`«${desde}» no tiene destinos en su salida ${salida}`)
  const { nodes, links, entrada, salida: fin } = nodosDeLaPuerta({ armar, aplicar, cfg, origen: [o.position[0] + 240, o.position[1] + 400], comoAbrio, cerro })
  copia.nodes.push(...nodes)
  const enlace = (de, a, i = 0) => {
    copia.connections[de] = copia.connections[de] || { main: [] }
    while (copia.connections[de].main.length <= i) copia.connections[de].main.push([])
    copia.connections[de].main[i].push({ node: a, type: 'main', index: 0 })
  }
  for (const [de, a, i] of links) enlace(de, a, i ?? 0)
  copia.connections[desde].main[salida] = [{ node: entrada, type: 'main', index: 0 }]
  if (continuacion) {
    // lo que sigue a la puerta (la cadena de versiones del plan): aplicar → continuacion.entrada … continuacion.salida → los destinos de siempre
    copia.nodes.push(...continuacion.nodes)
    for (const [de, a, i] of continuacion.links) enlace(de, a, i ?? 0)
    enlace(fin, continuacion.entrada)
    // lo que ya colgaba de la salida de la continuación (ramas laterales) se CONSERVA; se suman los destinos de siempre
    copia.connections[continuacion.salida] = { main: [[...(copia.connections[continuacion.salida]?.main?.[0] ?? []), ...destinos]] }
  } else copia.connections[fin] = { main: [destinos] }
  return copia
}
