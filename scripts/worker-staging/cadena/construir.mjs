/**
 * CONSTRUCTOR DE LOS FLUJOS DE LA CADENA · CC#1 · 2026-10-09 · diseño v2 §10.6 · TODO INACTIVO.
 *
 *   node scripts/worker-staging/cadena/construir.mjs            → escribe flujos/*.json con ids de relleno
 *   import { construirFlujos } from './construir.mjs'            → las pruebas y `crear-en-n8n.mjs` lo usan con los ids reales
 *
 * Los nodos de código viven en `nodos/*.js` (uno por archivo, legibles y revisables); aquí solo se arma el grafo.
 * La parte «por filas» sale de COPIAR el flujo vivo `PQdIgbuFexuBsoh8` (se pasa su JSON) con cambios mínimos y con una aserción por cambio: si el flujo vivo cambió y un texto ya no está, el constructor FALLA en vez de copiar mal.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const NODOS = path.join(AQUI, 'nodos')
// el código de los nodos siempre con saltos LF (en Windows el repositorio puede traerlos CRLF: el flujo construido no debe depender del sistema donde se arma)
const leer = (f) => fs.readFileSync(path.join(NODOS, f), 'utf8').replace(/\r\n/g, '\n')
const uuid = (s) => { const h = createHash('md5').update(s).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}` }

export const IDS_DE_RELLENO = { estrategia: '@@ID_ESTRATEGIA@@', calendario: '@@ID_CALENDARIO@@', fechas: '@@ID_FECHAS@@', puerta: '@@ID_PUERTA@@' }
const BASE_API = "($env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app')"
const SALA_CALLBACK = "={{ $env.SALA_CALLBACK_URL || 'https://zero-risk-platform.vercel.app/api/sala/callback' }}"

// ───────────────────────────── ladrillos
class Flujo {
  constructor(nombre) { this.nombre = nombre; this.nodos = []; this.conexiones = {}; this.x = 0 }
  _pos(col, fila) { return [col * 280, fila * 200] }
  add(nodo, col, fila) { nodo.position = this._pos(col, fila); nodo.id = uuid(this.nombre + '|' + nodo.name); this.nodos.push(nodo); return nodo.name }
  /** unir(de, a, salida = 0) */
  unir(de, a, salida = 0) {
    const c = (this.conexiones[de] ??= { main: [] })
    while (c.main.length <= salida) c.main.push([])
    c.main[salida].push({ node: a, type: 'main', index: 0 })
  }
  json() {
    return { name: this.nombre, nodes: this.nodos, connections: this.conexiones, settings: { executionOrder: 'v1' } }
  }
}

const codigo = (name, archivo, reemplazos = {}) => {
  let js = leer(archivo)
  for (const [k, v] of Object.entries(reemplazos)) js = js.split(`@@${k}@@`).join(String(v))
  if (/@@[A-Z_]+@@/.test(js)) throw new Error(`${archivo}: quedó un token sin reemplazar`)
  return { name, type: 'n8n-nodes-base.code', typeVersion: 2, parameters: { jsCode: js } }
}
const si = (name, expresion) => ({
  name, type: 'n8n-nodes-base.if', typeVersion: 2,
  parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: `={{ ${expresion} }}`, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }] } },
})
const http = (name, { url, cuerpo, metodo = 'POST', cabeceras = [], timeout = 60000, texto = false, interna = true, onError = null }) => ({
  name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
  ...(onError ? { onError } : {}),
  parameters: {
    method: metodo, url,
    sendHeaders: true,
    headerParameters: { parameters: [...(interna ? [{ name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] : []), ...cabeceras] },
    ...(metodo === 'GET' ? {} : { sendBody: true, specifyBody: 'json', jsonBody: cuerpo }),
    options: { timeout, response: { response: { fullResponse: true, neverError: true, ...(texto ? { responseFormat: 'text' } : {}) } } },
  },
})
const rutaCadena = (r) => `={{ ${BASE_API} + '/api/cadena/${r}' }}`
const llamadaCadena = (name, ruta, expresionCuerpo, timeout = 60000) => http(name, { url: rutaCadena(ruta), cuerpo: `={{ JSON.stringify(${expresionCuerpo}) }}`, timeout })
const entradaSubflujo = () => ({ name: 'Entrada · sub-flujo', type: 'n8n-nodes-base.executeWorkflowTrigger', typeVersion: 1.1, parameters: { inputSource: 'passthrough' } })
const subflujo = (name, id, cada = false) => ({
  name, type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.2,
  parameters: { workflowId: { __rl: true, value: id, mode: 'id' }, ...(cada ? { mode: 'each' } : {}), options: { waitForSubWorkflow: true } },
})
const webhook = (name, ruta) => ({ name, type: 'n8n-nodes-base.webhook', typeVersion: 2, webhookId: uuid('wh|' + ruta), parameters: { httpMethod: 'POST', path: ruta, responseMode: 'onReceived', options: {} } })

// ───────────────────────────── sub-flujo de UN paso con agente (estrategia · calendario)
export function flujoDePaso({ paso, ruta, conTanda }) {
  const f = new Flujo(`Zero Risk — Cadena · ${paso} (sub-flujo · CC#1)`)
  const r = { PASO: paso, CON_TANDA: conTanda ? 'true' : 'false' }
  f.add(entradaSubflujo(), 0, 0)
  f.add(codigo('⓪ Entrada', 'paso-entrada.js', r), 1, 0)
  f.add(codigo('① Armar el pedido', 'paso-armar-pedido.js'), 2, 0)
  f.add(llamadaCadena('① Preparar', ruta, '$json.pedido'), 3, 0)
  f.add(codigo('① ¿Qué dijo?', 'paso-que-dijo.js'), 4, 0)
  f.add(si('① ¿Termina?', '$json.fin === true'), 5, 0)
  f.add(si('② ¿Simulacro?', '$json.simulacro !== null && $json.seco === true'), 6, 0)
  f.add(codigo('② Simulacro', 'paso-simulacro.js'), 7, -1)
  f.add(codigo('② Armar la llamada', 'paso-armar-llamada.js'), 7, 1)
  // 🔴 la cabecera de saltar la revisión del editor la lleva SOLO el nodo del agente de estos tres flujos (estrategia · calendario · fechas) y su valor sale de la ruta
  f.add(http('② Agente (run-sdk)', {
    url: `={{ ${BASE_API} + '/api/agents/run-sdk' }}`, cuerpo: '={{ JSON.stringify($json.llamada) }}', timeout: 290000,
    // 🔴 relevo 41 (#464 C4): si la llamada se corta (red, 290 s) el flujo NO muere: el error sigue de largo y `guardar` cierra la corrida como FALLIDA al instante (la siguiente vuelta reintenta, máx. 3)
    onError: 'continueRegularOutput',
    cabeceras: [{ name: 'x-skip-editor-middleware', value: "={{ $json.headers['x-skip-editor-middleware'] }}" }],
  }), 8, 1)
  f.add(codigo('③ Armar guardar', 'paso-armar-guardar.js'), 9, 0)
  f.add(llamadaCadena('③ Guardar', ruta, '$json.guardar'), 10, 0)
  f.add(codigo('④ ¿Y ahora?', 'paso-y-ahora.js'), 11, 0)
  f.add(si('④ ¿Termina?', '$json.fin === true'), 12, 0)
  f.add(codigo('⑤ Salida', 'paso-salida.js'), 13, 0)
  f.unir('Entrada · sub-flujo', '⓪ Entrada'); f.unir('⓪ Entrada', '① Armar el pedido'); f.unir('① Armar el pedido', '① Preparar'); f.unir('① Preparar', '① ¿Qué dijo?')
  f.unir('① ¿Qué dijo?', '① ¿Termina?')
  f.unir('① ¿Termina?', '⑤ Salida', 0); f.unir('① ¿Termina?', '② ¿Simulacro?', 1)
  f.unir('② ¿Simulacro?', '② Simulacro', 0); f.unir('② ¿Simulacro?', '② Armar la llamada', 1)
  f.unir('② Armar la llamada', '② Agente (run-sdk)')
  f.unir('② Simulacro', '③ Armar guardar'); f.unir('② Agente (run-sdk)', '③ Armar guardar')
  f.unir('③ Armar guardar', '③ Guardar'); f.unir('③ Guardar', '④ ¿Y ahora?'); f.unir('④ ¿Y ahora?', '④ ¿Termina?')
  f.unir('④ ¿Termina?', '⑤ Salida', 0); f.unir('④ ¿Termina?', '① Armar el pedido', 1)
  return f.json()
}

// ───────────────────────────── sub-flujo de fechas especiales
export function flujoDeFechas() {
  const f = new Flujo('Zero Risk — Cadena · fechas especiales (sub-flujo · CC#1)')
  f.add(entradaSubflujo(), 0, 0)
  f.add(codigo('⓪ Entrada', 'fechas-entrada.js'), 1, 0)
  f.add(llamadaCadena('① Cobertura', 'fechas', "{ accion: 'cobertura', campana_id: $json.campana_id, pais: $json.pais, tipo: $json.tipo, ambito: $json.ambito, anio: $json.anio, workflow_id: $json.workflow_id, workflow_execution_id: $json.workflow_execution_id }"), 2, 0)
  f.add(codigo('① ¿Qué dijo?', 'fechas-cobertura-que-dijo.js'), 3, 0)
  f.add(si('① ¿Termina?', '$json.fin === true'), 4, 0)
  f.add(si('② ¿Simulacro?', '$json.simulacro !== null && $json.seco === true'), 5, 0)
  f.add(codigo('② Páginas simuladas', 'fechas-paginas-simuladas.js'), 6, -1)
  f.add(http('② Descargar la página', { url: '={{ $json.dominio }}', metodo: 'GET', interna: false, texto: true, timeout: 30000 }), 6, 1)
  f.add(codigo('② Juntar las páginas', 'fechas-juntar.js'), 7, 1)
  f.add(codigo('③ Armar preparar', 'fechas-armar-preparar.js'), 8, 0)
  f.add(llamadaCadena('③ Preparar', 'fechas', '$json.pedido', 60000), 9, 0)
  f.add(codigo('③ ¿Qué dijo?', 'fechas-preparar-que-dijo.js'), 10, 0)
  f.add(si('③ ¿Termina?', '$json.fin === true'), 11, 0)
  f.add(si('④ ¿Simulacro del agente?', '$json.simulacro !== null && $json.seco === true'), 12, 0)
  f.add(codigo('④ Simulacro', 'fechas-simulacro.js'), 13, -1)
  f.add(codigo('④ Armar la llamada', 'fechas-armar-llamada.js'), 13, 1)
  f.add(http('④ Agente (run-sdk)', {
    url: `={{ ${BASE_API} + '/api/agents/run-sdk' }}`, cuerpo: '={{ JSON.stringify($json.llamada) }}', timeout: 290000, onError: 'continueRegularOutput',
    cabeceras: [{ name: 'x-skip-editor-middleware', value: "={{ $json.headers['x-skip-editor-middleware'] }}" }],
  }), 14, 1)
  f.add(codigo('⑤ Armar guardar', 'fechas-armar-guardar.js'), 15, 0)
  f.add(llamadaCadena('⑤ Guardar', 'fechas', '$json.guardar'), 16, 0)
  f.add(codigo('⑥ Salida', 'fechas-salida.js'), 17, 0)
  f.unir('Entrada · sub-flujo', '⓪ Entrada'); f.unir('⓪ Entrada', '① Cobertura'); f.unir('① Cobertura', '① ¿Qué dijo?'); f.unir('① ¿Qué dijo?', '① ¿Termina?')
  f.unir('① ¿Termina?', '⑥ Salida', 0); f.unir('① ¿Termina?', '② ¿Simulacro?', 1)
  f.unir('② ¿Simulacro?', '② Páginas simuladas', 0); f.unir('② ¿Simulacro?', '② Descargar la página', 1)
  f.unir('② Descargar la página', '② Juntar las páginas')
  f.unir('② Páginas simuladas', '③ Armar preparar'); f.unir('② Juntar las páginas', '③ Armar preparar')
  f.unir('③ Armar preparar', '③ Preparar'); f.unir('③ Preparar', '③ ¿Qué dijo?'); f.unir('③ ¿Qué dijo?', '③ ¿Termina?')
  f.unir('③ ¿Termina?', '⑥ Salida', 0); f.unir('③ ¿Termina?', '④ ¿Simulacro del agente?', 1)
  f.unir('④ ¿Simulacro del agente?', '④ Simulacro', 0); f.unir('④ ¿Simulacro del agente?', '④ Armar la llamada', 1)
  f.unir('④ Armar la llamada', '④ Agente (run-sdk)')
  f.unir('④ Simulacro', '⑤ Armar guardar'); f.unir('④ Agente (run-sdk)', '⑤ Armar guardar')
  f.unir('⑤ Armar guardar', '⑤ Guardar'); f.unir('⑤ Guardar', '⑥ Salida')
  return f.json()
}

// ───────────────────────────── el vigía (el reloj nuevo · 2 veces al día)
export function flujoDelVigia() {
  const f = new Flujo('Zero Risk — Cadena · vigía (reloj 2×/día · CC#1)')
  f.add({ name: 'Cada 12 horas', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 6,18 * * *' }] } } }, 0, 0)
  f.add(codigo('1 · Pedido del reloj', 'vigia-pedido.js'), 1, 0)
  f.add(llamadaCadena('1 · Reloj', 'esperas', '$json.pedido', 120000), 2, 0)
  f.add(codigo('1 · Avisos', 'vigia-avisos.js'), 3, 0)
  f.add(si('1 · ¿Hay avisos para mandar?', '$json.enviar === true'), 4, 0)
  // 🔴 relevo 41 (#466 C2): el latido lo vigila alguien de AFUERA. Cada pasada que llegó hasta aquí (el reloj contestó 200) avisa a un vigilante externo (Healthchecks u otro) cuya alarma es «sin aviso en 18 h».
  //    Si la variable no existe no se avisa a nadie (y se nota: el vigilante externo da la alarma por falta de aviso).
  f.add(si('1 · ¿Hay vigilante externo?', '!!$env.CADENA_VIGIA_PING_URL'), 4, 1)
  f.add(http('1 · Latido · vigilante externo', { url: '={{ $env.CADENA_VIGIA_PING_URL }}', metodo: 'GET', interna: false, timeout: 15000, texto: true, onError: 'continueRegularOutput' }), 5, 1)
  f.add(http('1 · Aviso · #alertas', {
    url: 'https://slack.com/api/chat.postMessage', cuerpo: '={{ JSON.stringify($json.slack) }}', interna: false,
    cabeceras: [{ name: 'Authorization', value: '=Bearer {{ $env.SLACK_BOT_TOKEN }}' }, { name: 'Content-Type', value: 'application/json; charset=utf-8' }],
  }), 5, -1)
  f.add(llamadaCadena('2 · Campañas activas', 'campanas', "{ accion: 'activas', workflow_id: $workflow.id, workflow_execution_id: $execution.id }"), 6, 0)
  f.add(codigo('2 · Expandir', 'vigia-campanas.js'), 7, 0)
  f.add(si('2 · ¿Hay campañas?', '$json.ninguna === false'), 8, 0)
  f.add(llamadaCadena('3 · Lotes', 'filas', "{ accion: 'lotes', campana_id: $json.campana_id, workflow_id: $workflow.id, workflow_execution_id: $execution.id }"), 9, -1)
  f.add(codigo('3 · Sobres de lote', 'vigia-sobres-lote.js'), 10, -1)
  f.add(http('3 · Sobre a la sala (lote)', { url: '={{ $env.SALA_INTAKE_URL || "https://zero-risk-platform.vercel.app/api/sala/intake" }}', cuerpo: '={{ JSON.stringify($json.sobre) }}', interna: false, timeout: 20000, cabeceras: [{ name: 'x-api-key', value: '={{ $env.SALA_INGRESS_API_KEY }}' }] }), 11, -1)
  f.add(llamadaCadena('4 · Tanda siguiente', 'calendario', "{ accion: 'siguiente', campana_id: $json.campana_id, workflow_id: $workflow.id, workflow_execution_id: $execution.id }"), 9, 1)
  f.add(codigo('4 · Sobres de tanda', 'vigia-sobres-tanda.js'), 10, 1)
  f.add(http('4 · Sobre a la sala (tanda)', { url: '={{ $env.SALA_INTAKE_URL || "https://zero-risk-platform.vercel.app/api/sala/intake" }}', cuerpo: '={{ JSON.stringify($json.sobre) }}', interna: false, timeout: 20000, cabeceras: [{ name: 'x-api-key', value: '={{ $env.SALA_INGRESS_API_KEY }}' }] }), 11, 1)
  f.unir('Cada 12 horas', '1 · Pedido del reloj'); f.unir('1 · Pedido del reloj', '1 · Reloj'); f.unir('1 · Reloj', '1 · Avisos'); f.unir('1 · Avisos', '1 · ¿Hay avisos para mandar?'); f.unir('1 · Avisos', '1 · ¿Hay vigilante externo?'); f.unir('1 · ¿Hay vigilante externo?', '1 · Latido · vigilante externo', 0)
  f.unir('1 · ¿Hay avisos para mandar?', '1 · Aviso · #alertas', 0); f.unir('1 · ¿Hay avisos para mandar?', '2 · Campañas activas', 1)
  f.unir('1 · Aviso · #alertas', '2 · Campañas activas')
  f.unir('2 · Campañas activas', '2 · Expandir'); f.unir('2 · Expandir', '2 · ¿Hay campañas?')
  f.unir('2 · ¿Hay campañas?', '3 · Lotes', 0); f.unir('2 · ¿Hay campañas?', '4 · Tanda siguiente', 0)
  f.unir('3 · Lotes', '3 · Sobres de lote'); f.unir('3 · Sobres de lote', '3 · Sobre a la sala (lote)')
  f.unir('4 · Tanda siguiente', '4 · Sobres de tanda'); f.unir('4 · Sobres de tanda', '4 · Sobre a la sala (tanda)')
  return f.json()
}

// ───────────────────────────── la puerta
export function flujoDeLaPuerta(ids = IDS_DE_RELLENO) {
  const f = new Flujo('Zero Risk — Cadena · puerta (webhook · CC#1)')
  const ctx = '{ client_id: $json.client_id, workflow_id: $workflow.id, workflow_execution_id: $execution.id }'
  f.add(webhook('Webhook · cadena', 'zero-risk/cadena'), 0, 0)
  f.add(codigo('⓪ Llave y origen', 'puerta-llave.js'), 1, 0)
  f.add(llamadaCadena('⓪ ¿Existe el viaje?', 'campanas', "{ accion: 'verificar_viaje', client_id: $json.client_id, journey_id: $json._journey_id, workflow_id: $workflow.id, workflow_execution_id: $execution.id }"), 2, 0)
  f.add(codigo('⓪ Guarda del viaje', 'puerta-viaje-guarda.js'), 3, 0)
  f.add(llamadaCadena('⓪ ¿Qué modo?', 'campanas', "{ accion: 'estado', client_id: $json.client_id, workflow_id: $workflow.id, workflow_execution_id: $execution.id }"), 4, 0)
  f.add(codigo('⓪ Decidir', 'puerta-decidir.js'), 5, 0)
  f.add(si('¿Pasarela?', "$json.efectivo === 'pasarela'"), 6, 0)
  // pasarela: el cuerpo ENTERO, sin tocar un campo, a la parte original
  f.add(http('Pasarela · reenviar a la parte', {
    url: "={{ ($env.N8N_PUBLIC_URL || 'https://n8n-production-72be.up.railway.app') + '/webhook/zero-risk/brief' }}", cuerpo: '={{ $json.cuerpo_original }}', interna: false, timeout: 30000,
    cabeceras: [{ name: 'x-sala-dispatch-key', value: '={{ $env.SALA_DISPATCH_KEY }}' }, { name: 'Content-Type', value: 'application/json' }],
  }), 7, -3)
  f.add(codigo('Pasarela · ¿salió?', 'puerta-pasarela-salio.js'), 8, -3)
  // cadena
  f.add(si('¿Modo abrir?', "$json.modo === 'abrir'"), 7, 0)
  f.add(llamadaCadena('1 · Abrir campaña', 'campanas', "{ accion: 'abrir', client_id: $json.client_id, plan_id: $json.plan_id, seco: $json.dry_run, sala_ref: { _journey_id: $json._journey_id, _sala_correlation_id: $json._sala_correlation_id }, workflow_id: $workflow.id, workflow_execution_id: $execution.id }"), 8, -1)
  f.add(codigo('1 · ¿Abierta?', 'puerta-abierta.js'), 9, -1)
  f.add(si('1 · ¿Sigue?', '$json.sigue === true'), 10, -1)
  f.add(codigo('2 · Entrada de la estrategia', 'puerta-estrategia-entrada.js'), 11, -2)
  f.add(subflujo('2 · Estrategia (sub-flujo)', ids.estrategia), 12, -2)
  f.add(codigo('2 · ¿Estrategia?', 'puerta-estrategia-resultado.js'), 13, -2)
  f.add(si('2 · ¿Sigue?', '$json.sigue === true'), 14, -2)
  f.add(codigo('3 · Fechas · expandir', 'puerta-fechas-expandir.js'), 15, -3)
  f.add(si('3 · Fechas · ¿hay?', '$json.hay_fechas === true'), 16, -3)
  f.add(codigo('3 · Fechas · una por tipo', 'puerta-fechas-explotar.js'), 17, -4)
  f.add(subflujo('3 · Fechas (sub-flujo)', ids.fechas, true), 18, -4)
  f.add(codigo('3 · Juntar', 'puerta-fechas-juntar.js'), 19, -4)
  f.add(codigo('4 · Entrada del calendario', 'puerta-calendario-entrada.js'), 20, -3)
  f.add(subflujo('4 · Calendario tanda 1 (sub-flujo)', ids.calendario), 21, -3)
  f.add(codigo('4 · ¿Calendario?', 'puerta-calendario-resultado.js'), 22, -3)
  // el vigía: parte por lote · tanda siguiente
  f.add(si('¿Modo parte?', "$json.modo === 'parte'"), 8, 1)
  f.add(codigo('Parte · armar', 'puerta-parte-armar.js'), 9, 1)
  f.add(http('Parte · pedir a la copia por filas', {
    url: "={{ ($env.N8N_PUBLIC_URL || 'https://n8n-production-72be.up.railway.app') + '/webhook/zero-risk/cadena-parte' }}", cuerpo: '={{ $json.cuerpo_parte }}', interna: false, timeout: 30000,
    cabeceras: [{ name: 'x-sala-dispatch-key', value: '={{ $env.SALA_DISPATCH_KEY }}' }, { name: 'Content-Type', value: 'application/json' }],
  }), 10, 1)
  f.add(codigo('Parte · ¿salió?', 'puerta-pasarela-salio.js'), 11, 1)
  f.add(codigo('Tanda · entrada', 'puerta-tanda-entrada.js'), 9, 2)
  f.add(subflujo('Tanda · Calendario (sub-flujo)', ids.calendario), 10, 2)
  f.add(codigo('Tanda · ¿resultado?', 'puerta-tanda-resultado.js'), 11, 2)
  // el cable único
  f.add(codigo('Cable · armar', 'puerta-cable-armar.js'), 23, 0)
  f.add(llamadaCadena('Cable · cierre', 'campanas', '$json.pedido_cierre'), 24, 0)
  f.add(si('Cable · ¿hay cable?', '$json.body && $json.body.payload_cable !== null && $json.body.payload_cable !== undefined'), 25, 0)
  f.add(http('Cable · enviar a la sala', {
    url: SALA_CALLBACK, cuerpo: '={{ JSON.stringify($json.body.payload_cable) }}', interna: false, timeout: 60000,
    cabeceras: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-api-key', value: '={{ $env.SALA_CALLBACK_API_KEY || $env.INTERNAL_API_KEY }}' }, { name: 'x-source', value: 'n8n-cadena' }],
  }), 26, 0)
  f.add(codigo('Cable · ¿volvió?', 'puerta-cable-volvio.js'), 27, 0)

  f.unir('Webhook · cadena', '⓪ Llave y origen'); f.unir('⓪ Llave y origen', '⓪ ¿Existe el viaje?'); f.unir('⓪ ¿Existe el viaje?', '⓪ Guarda del viaje'); f.unir('⓪ Guarda del viaje', '⓪ ¿Qué modo?'); f.unir('⓪ ¿Qué modo?', '⓪ Decidir'); f.unir('⓪ Decidir', '¿Pasarela?')
  f.unir('¿Pasarela?', 'Pasarela · reenviar a la parte', 0); f.unir('Pasarela · reenviar a la parte', 'Pasarela · ¿salió?')
  f.unir('¿Pasarela?', '¿Modo abrir?', 1)
  f.unir('¿Modo abrir?', '1 · Abrir campaña', 0); f.unir('¿Modo abrir?', '¿Modo parte?', 1)
  f.unir('1 · Abrir campaña', '1 · ¿Abierta?'); f.unir('1 · ¿Abierta?', '1 · ¿Sigue?')
  f.unir('1 · ¿Sigue?', '2 · Entrada de la estrategia', 0); f.unir('1 · ¿Sigue?', 'Cable · armar', 1)
  f.unir('2 · Entrada de la estrategia', '2 · Estrategia (sub-flujo)'); f.unir('2 · Estrategia (sub-flujo)', '2 · ¿Estrategia?'); f.unir('2 · ¿Estrategia?', '2 · ¿Sigue?')
  f.unir('2 · ¿Sigue?', '3 · Fechas · expandir', 0); f.unir('2 · ¿Sigue?', 'Cable · armar', 1)
  f.unir('3 · Fechas · expandir', '3 · Fechas · ¿hay?')
  f.unir('3 · Fechas · ¿hay?', '3 · Fechas · una por tipo', 0); f.unir('3 · Fechas · ¿hay?', '4 · Entrada del calendario', 1)
  f.unir('3 · Fechas · una por tipo', '3 · Fechas (sub-flujo)'); f.unir('3 · Fechas (sub-flujo)', '3 · Juntar'); f.unir('3 · Juntar', '4 · Entrada del calendario')
  f.unir('4 · Entrada del calendario', '4 · Calendario tanda 1 (sub-flujo)'); f.unir('4 · Calendario tanda 1 (sub-flujo)', '4 · ¿Calendario?'); f.unir('4 · ¿Calendario?', 'Cable · armar')
  f.unir('¿Modo parte?', 'Parte · armar', 0); f.unir('¿Modo parte?', 'Tanda · entrada', 1)
  f.unir('Parte · armar', 'Parte · pedir a la copia por filas'); f.unir('Parte · pedir a la copia por filas', 'Parte · ¿salió?')
  f.unir('Tanda · entrada', 'Tanda · Calendario (sub-flujo)'); f.unir('Tanda · Calendario (sub-flujo)', 'Tanda · ¿resultado?'); f.unir('Tanda · ¿resultado?', 'Cable · armar')
  f.unir('Cable · armar', 'Cable · cierre'); f.unir('Cable · cierre', 'Cable · ¿hay cable?'); f.unir('Cable · ¿hay cable?', 'Cable · enviar a la sala', 0); f.unir('Cable · enviar a la sala', 'Cable · ¿volvió?')
  return f.json()
}

// ───────────────────────────── la copia de la parte «por filas» (cambios mínimos, cada uno con su aserción)
export function parteDeCopia(vivo, ids = IDS_DE_RELLENO) {
  const w = JSON.parse(JSON.stringify(vivo))
  const nodo = (n) => { const x = w.nodes.find((y) => y.name === n); if (!x) throw new Error('el flujo vivo ya no tiene el nodo «' + n + '»'); return x }
  const cambia = (n, de, a) => {
    const x = nodo(n); const src = x.parameters.jsCode ?? x.parameters.url
    const campo = x.parameters.jsCode !== undefined ? 'jsCode' : 'url'
    if (typeof src !== 'string' || src.split(de).length !== 2) throw new Error(`el flujo vivo cambió: «${n}» ya no tiene exactamente una vez «${de.slice(0, 60)}»`)
    x.parameters[campo] = src.replace(de, () => a)
  }
  w.name = 'Zero Risk — Cadena · parte por filas (copia de Brief · CC#1)'
  for (const k of ['id', 'active', 'activeVersionId', 'activeVersion', 'createdAt', 'updatedAt', 'versionId', 'versionCounter', 'sourceWorkflowId', 'triggerCount', 'shared', 'tags', 'isArchived', 'nodeGroups', 'meta', 'description', 'pinData', 'staticData']) delete w[k]
  w.settings = { executionOrder: 'v1' }
  // webhook propio (la original sigue en zero-risk/brief)
  nodo('Webhook · brief').parameters.path = 'zero-risk/cadena-parte'
  nodo('Webhook · brief').webhookId = uuid('wh|zero-risk/cadena-parte')
  // ⓪ el sobre trae un LOTE, no un plan: campana_id + lote + fila_ids
  cambia('⓪ Sobre · llave · modo seco', "// RAZONAMIENTO limitado (opt-in)", "if (typeof body.campana_id !== 'string' || body.campana_id.trim() === '') throw new Error('PARTE_SIN_CAMPANA · falta campana_id · se DETIENE y no escribe nada')\nif (typeof body.lote !== 'string' || body.lote.trim() === '') throw new Error('PARTE_SIN_LOTE · falta lote (semana ISO) · se DETIENE y no escribe nada')\nif (!Array.isArray(body.fila_ids) || body.fila_ids.length === 0 || body.fila_ids.some((x) => typeof x !== 'string')) throw new Error('PARTE_SIN_FILAS · fila_ids debe ser una lista no vacía de textos · se DETIENE y no escribe nada')\n\n// RAZONAMIENTO limitado (opt-in)")
  cambia('⓪ Sobre · llave · modo seco', '    plan_id: body.plan_id || null,', '    plan_id: null, // el plan es el de la CAMPAÑA (lo pone ⓪ GUARDA · el lote), nunca el que diga el sobre\n    campana_id: String(body.campana_id),\n    lote: String(body.lote),\n    fila_ids: body.fila_ids,')
  // nodos nuevos: leer las filas del lote y guardar el lote ANTES de gastar
  const pos0 = nodo('⓪ Sobre · llave · modo seco').position
  const filas = http('⓪ Filas del lote', { url: rutaCadena('filas'), cuerpo: "={{ JSON.stringify({ accion: 'listar', campana_id: $json.campana_id, workflow_id: $workflow.id, workflow_execution_id: $execution.id }) }}", timeout: 30000 })
  const guarda = codigo('⓪ GUARDA · el lote', 'parte-guarda-lote.js')
  filas.position = [pos0[0] + 130, pos0[1] + 160]; guarda.position = [pos0[0] + 130, pos0[1] + 320]
  filas.id = uuid('parte|filas'); guarda.id = uuid('parte|guarda')
  w.nodes.push(filas, guarda)
  w.connections['⓪ Sobre · llave · modo seco'] = { main: [[{ node: '⓪ Filas del lote', type: 'main', index: 0 }]] }
  w.connections['⓪ Filas del lote'] = { main: [[{ node: '⓪ GUARDA · el lote', type: 'main', index: 0 }]] }
  w.connections['⓪ GUARDA · el lote'] = { main: [[{ node: '① Cargar manual vigente', type: 'main', index: 0 }]] }
  // ① todo el estado de aquí en adelante parte del lote guardado
  cambia('① GUARDA · sin manual aprobado se DETIENE', "const env = $('⓪ Sobre · llave · modo seco').first().json", "const env = $('⓪ GUARDA · el lote').first().json")
  // ② el plan es el de la campaña, no «el último»
  cambia('② Cargar plan vigente', "&order=created_at.desc&limit=1", "&id=eq.{{ $('⓪ GUARDA · el lote').first().json.plan_id }}&limit=1")
  // ② la guarda de «ya hay parte» pasa a ser POR LOTE (campana:semana:version), no por plan
  cambia('② ¿Ya hay parte de este plan?', "&provenance_tag->>plan_id=eq.{{ $('② GUARDA · sin plan se DETIENE').first().json.plan_id }}", "&provenance_tag->>lote_key=eq.{{ $('② GUARDA · sin plan se DETIENE').first().json.lote_key }}")
  cambia('② ¿Ya hay parte de este plan? · guarda', "' · no corre dos veces el mismo plan · para repetirlo a propósito, el sobre lleva forzar:true'", "' · el lote ' + prev.lote_key + ' ya tiene su parte · no corre dos veces el mismo lote · para repetirlo a propósito, el sobre lleva forzar:true'")
  // ③ el pedido incluye las filas del lote: UN entregable por fila, cada uno con su fila_id
  cambia('③ Armar el cuerpo del redactor', "'════════ REFERENCIA · EL BRIEF DE UN ENTREGABLE (campos, reglas y trampas) ════════',", "'════════ FILAS DEL LOTE (' + (prev.lote || '') + ') · UN entregable por fila · cada entregable lleva su fila_id ════════',\n  JSON.stringify((prev.filas_lote || []).map(function (f) { return { fila_id: f.id, fecha: f.fecha, hora: f.hora, red: f.red, formato: f.formato, pilar: f.pilar, tema: f.tema, sede: f.sede, datos: f.datos, pendientes: f.pendientes } })),\n  'REGLA DEL LOTE: cada fila de arriba sale briefeada EXACTAMENTE una vez, con su `fila_id` en el entregable. No agregues entregables que no sean de una fila del lote. La fecha y la hora de cada pieza son las de su fila: no las cambies.',\n  '',\n  '════════ REFERENCIA · EL BRIEF DE UN ENTREGABLE (campos, reglas y trampas) ════════',")
  cambia('③ Armar el cuerpo del redactor', '    "id": "BRF-0001", "plataforma"', '    "id": "BRF-0001", "fila_id": "…", "plataforma"')
  // ④ chequeos: brief_repetido baja a AVISO, y nace «cada fila del lote sale briefeada exactamente una vez» (fatal)
  cambia('④ Chequeos', "falla('brief_repetido', mensajes[m].join(' · '), 'comparten el mismo mensaje · «un brief = una estrategia»: uno sobra')", "falla('aviso_brief_repetido', mensajes[m].join(' · '), 'comparten el mismo mensaje · en una serie de piezas parecidas es válido si cada fila tiene su tema: AVISO, no fallo')")
  cambia('④ Chequeos', "  // ── centinelas también en lo que declara fuera de los briefs", "  // ── CADA FILA DEL LOTE SALE BRIEFEADA EXACTAMENTE UNA VEZ\n  var esperadas = (c.fila_ids || [])\n  var cuenta = {}\n  ents.forEach(function (e) { var k = e && e.fila_id; if (k) cuenta[k] = (cuenta[k] || 0) + 1 })\n  esperadas.forEach(function (fid) {\n    if (!cuenta[fid]) falla('fila_sin_brief', fid, 'la fila ' + fid + ' del lote NO salió briefeada')\n    else if (cuenta[fid] > 1) falla('fila_repetida', fid, 'la fila ' + fid + ' salió briefeada ' + cuenta[fid] + ' veces')\n  })\n  ents.forEach(function (e) { if (e && e.fila_id && esperadas.indexOf(e.fila_id) === -1) falla('fila_ajena', e.fila_id, 'el entregable ' + (e.id || '?') + ' trae un fila_id que NO es del lote') })\n\n  // ── centinelas también en lo que declara fuera de los briefs")
  cambia('④ Chequeos', "const CHEQUEOS_FATALES = ['respuesta_no_legible', 'sin_entregables', 'centinela']", "const CHEQUEOS_FATALES = ['respuesta_no_legible', 'sin_entregables', 'centinela', 'fila_sin_brief', 'fila_repetida', 'fila_ajena']")
  // ④ lo que se guarda lleva su lote; el cable lleva el worker_id de la PUERTA (así la sala rotula el viaje como BRIEF) y el resultado nuevo
  cambia('④ Chequeos', '    plan_id: c.plan_id,\n    manual_id: c.manual_id,\n    manual_version: c.manual_version,\n    legible: ext.legible,', '    plan_id: c.plan_id,\n    campana_id: c.campana_id,\n    lote: c.lote,\n    lote_key: c.lote_key,\n    fila_ids: c.fila_ids,\n    manual_id: c.manual_id,\n    manual_version: c.manual_version,\n    legible: ext.legible,')
  cambia('④ Chequeos', '  worker_id: $workflow.id,\n  worker_name', `  worker_id: '${ids.puerta}', // el id de la PUERTA, no el de esta copia\n  worker_name`)
  cambia('④ Chequeos', "resultado: parte_valido ? 'parte_terminado' : 'parte_no_valido',", "resultado: parte_valido ? 'lote_briefeado' : 'parte_no_valido',")
  cambia('⑤ ¿Guardó y salió el PDF?', "'parte_terminado'", "'lote_briefeado'")
  // ⑤ tras guardar, las filas del lote pasan a «briefeada» (solo si el parte vale; si no, nada se marca y el vigía lo reintenta)
  const marcar = http('⑤ Marcar las filas del lote', {
    url: rutaCadena('filas'), timeout: 30000,
    cuerpo: "={{ JSON.stringify({ accion: 'marcar', campana_id: $('④ Chequeos').first().json.fila_parte.provenance_tag.campana_id, estado: 'briefeada', fila_ids: $('④ Chequeos').first().json.parte_valido === true ? $('④ Chequeos').first().json.fila_parte.provenance_tag.fila_ids : [], workflow_id: $workflow.id, workflow_execution_id: $execution.id }) }}",
  })
  const posG = nodo('⑤ Guardar el parte').position
  marcar.position = [posG[0] + 130, posG[1] + 160]; marcar.id = uuid('parte|marcar'); marcar.onError = 'continueRegularOutput'
  w.nodes.push(marcar)
  const sigue = w.connections['⑤ Guardar el parte'].main[0].map((x) => x.node)
  w.connections['⑤ Guardar el parte'] = { main: [[{ node: '⑤ Marcar las filas del lote', type: 'main', index: 0 }]] }
  w.connections['⑤ Marcar las filas del lote'] = { main: [sigue.map((n) => ({ node: n, type: 'main', index: 0 }))] }
  return w
}

export function construirFlujos({ ids = IDS_DE_RELLENO, parteViva = null, planViva = null } = {}) {
  const out = {
    'cadena-estrategia': flujoDePaso({ paso: 'estrategia', ruta: 'estrategia', conTanda: false }),
    'cadena-calendario': flujoDePaso({ paso: 'calendario', ruta: 'calendario', conTanda: true }),
    'cadena-fechas': flujoDeFechas(),
    'cadena-vigia': flujoDelVigia(),
    'cadena-puerta': flujoDeLaPuerta(ids),
  }
  if (parteViva) out['cadena-parte-por-filas'] = parteDeCopia(parteViva, ids)
  if (planViva) {
    const c = JSON.parse(JSON.stringify(planViva))
    c.name = '[COPIA INACTIVA · sin cambios · referencia] ' + c.name
    for (const k of ['id', 'active', 'activeVersionId', 'activeVersion', 'createdAt', 'updatedAt', 'versionId', 'versionCounter', 'sourceWorkflowId', 'triggerCount', 'shared', 'tags', 'isArchived', 'nodeGroups', 'meta', 'description', 'pinData', 'staticData']) delete c[k]
    c.settings = { executionOrder: 'v1' }
    // una copia inactiva NO registra su webhook, pero por si alguien la activa por error, su ruta no choca con la del plan vivo
    const wh = c.nodes.find((n) => n.type === 'n8n-nodes-base.webhook')
    if (wh) { wh.parameters.path = wh.parameters.path + '-copia-inactiva'; wh.webhookId = uuid('wh|' + wh.parameters.path) }
    out['copia-plan-X9F0'] = c
  }
  return out
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = path.join(AQUI, 'flujos')
  fs.mkdirSync(dir, { recursive: true })
  const vivo = (f) => { const p = path.join(AQUI, 'vivos', f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null }
  const todos = construirFlujos({ parteViva: vivo('PQdIgbuFexuBsoh8.json'), planViva: vivo('X9F0zp6LQ2xGEYVS.json') })
  for (const [k, w] of Object.entries(todos)) { fs.writeFileSync(path.join(dir, k + '.json'), JSON.stringify(w, null, 1)); console.log(k, w.nodes.length, 'nodos') }
}
