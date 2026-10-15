// UNA EJECUCIÓN POR CLIENTE (15-oct · mejora 1) · el flujo diario reparte a cada cliente en SU PROPIA ejecución de n8n: el límite de 120 s por nodo de código es por ejecución, así que
// con 1 o con 50 clientes ninguna fuente se recorta por el tiempo de otro.
//   horario ─► ⓪ Entrada ─► ① Clientes activos ─► ① Un elemento por cliente ─► ① Repartir (POST al webhook «un cliente», uno por cliente) ─► fin (0 elementos)
//   «un cliente» (llave interna) ─► ⓪ Entrada(via cliente, client_id) ─► … la cadena de siempre para ESE cliente … ─► ⑤ Cierre ─► ⑥ Vigilar(client_id) ─► ⑦ Reintento
// · si un POST de reparto falla, ese cliente se corre en la ejecución del horario (nunca se pierde un cliente por un fallo de reparto);
// · ⑦ Reintento: si en la corrida de un cliente quedó algo omitido por tiempo, se pide UNA vez más la misma mañana (`reintento:true` ⇒ `forzar` en procesar); sin bucles;
// · ⑥ lleva `client_id` para que el vigilante de esta ejecución mire SOLO a su cliente.
//   node scripts/worker-staging/construir-un-cliente-por-ejecucion.mjs
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('../../', import.meta.url)).split('\\').join('/')
export const DIR = RAIZ + 'scripts/worker-staging/ogfq56oIEoHufFPM/'
export const ANTES = DIR + 'portero-ANTES-un-cliente-por-ejecucion-2026-10-15.json'
export const ARREGLADO = DIR + 'portero-ARREGLADO-un-cliente-por-ejecucion-2026-10-15.json'
export const RUTA_UN_CLIENTE = 'zero-risk/cerebro-diario-un-cliente'
export const NODO_WEBHOOK = 'Webhook · un cliente (llave interna)'
export const NODO_REPARTIR = '① Repartir (una ejecución por cliente)'
export const NODO_REINTENTO = '⑦ Reintento (misma mañana)'
export const ESPERA_ENTRE_CLIENTES_MS = 1000
export const PRESUPUESTO_DE_REPARTO_MS = 90_000

export function cambiar(codigo, antes, despues, que) {
  const n = codigo.split(antes).length - 1
  if (n !== 1) throw new Error(`${que}: esperaba 1 ocurrencia y hay ${n}`)
  return codigo.replace(antes, () => despues)
}
const conFinDeLinea = (codigo, fn) => {
  const crlf = codigo.includes('\r\n')
  const r = fn(crlf ? codigo.split('\r\n').join('\n') : codigo)
  return crlf ? r.split('\n').join('\r\n') : r
}

export const CODIGO_REPARTIR = [
  '// ① REPARTIR · en la ejecución del HORARIO cada cliente se corre en SU PROPIA ejecución (webhook «un cliente», llave interna). El límite de 120 s por nodo es por ejecución:',
  '// así ninguna fuente de un cliente se recorta por el tiempo de otro. En cualquier otra entrada (a mano, despertar, un cliente) los elementos pasan SIN cambio.',
  '// Si el plan falló o no hay clientes, pasa sin cambio (el cierre y el vigilante de ESTA ejecución lo dicen). Un reparto que falla NO pierde al cliente: se corre aquí mismo.',
  "const N8N = 'https://n8n-production-72be.up.railway.app'",
  'const T0 = Date.now()',
  "const entrada = $('⓪ Entrada').first().json",
  'const items = $input.all()',
  "if (!entrada || entrada.via !== 'horario' || entrada.dry_run === true) return items",
  'const clientes = items.filter((i) => i.json && i.json.cliente && !i.json.falla)',
  'if (!clientes.length || clientes.length !== items.length) return items',
  'const fallidos = []',
  'const repartidos = []',
  'for (let k = 0; k < clientes.length; k++) {',
  '  const it = clientes[k]',
  `  if (k > 0 && Date.now() - T0 < ${PRESUPUESTO_DE_REPARTO_MS}) await new Promise((r) => setTimeout(r, ${ESPERA_ENTRE_CLIENTES_MS}))`,
  '  try {',
  `    const r = await this.helpers.httpRequest({ url: N8N + '/webhook/${RUTA_UN_CLIENTE}', method: 'POST', json: true, returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 20000, headers: { 'Content-Type': 'application/json', 'x-api-key': $env.INTERNAL_API_KEY }, body: { client_id: it.json.cliente, origen_del_reparto: String(entrada.workflow_execution_id) } })`,
  '    if (r.statusCode === 200) repartidos.push(it.json.cliente)',
  '    else fallidos.push(it)',
  '  } catch (err) { fallidos.push(it) }',
  '}',
  'return fallidos',
].join('\n')

export const CODIGO_REINTENTO = [
  '// ⑦ REINTENTO (la misma mañana) · si en la corrida de este cliente algo quedó omitido por tiempo, se pide UNA vez más (reintento:true ⇒ `forzar`): nunca más de una, nunca si el vigilante habló,',
  '// nunca en una entrada a mano o en seco. Lo omitido hoy debe quedar en 0 en el caso normal; esto es la red.',
  "const N8N = 'https://n8n-production-72be.up.railway.app'",
  "const e = $('⓪ Entrada').first().json",
  'const v = $input.first().json || {}',
  'const vb = v.body ? v.body : v',
  "const cierre = $('⑤ Cierre').first().json",
  'const con = ((cierre && cierre.clientes) || []).filter((c) => c.cliente && Array.isArray(c.omitidas_por_tiempo) && c.omitidas_por_tiempo.length > 0)',
  "const motivo = e.reintento === true ? 'ya es un reintento' : e.dry_run !== false ? 'en seco' : vb.ok === false ? 'el vigilante habló' : !['horario', 'cliente'].includes(e.via) ? 'entrada a mano o despertar' : !con.length ? 'nada omitido' : null",
  "if (motivo) return [{ json: { reintento: false, motivo } }]",
  'await new Promise((r) => setTimeout(r, 20000))',
  'const lanzados = []',
  'for (const c of con) {',
  '  try {',
  `    const r = await this.helpers.httpRequest({ url: N8N + '/webhook/${RUTA_UN_CLIENTE}', method: 'POST', json: true, returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 20000, headers: { 'Content-Type': 'application/json', 'x-api-key': $env.INTERNAL_API_KEY }, body: { client_id: c.cliente, reintento: true } })`,
  '    lanzados.push({ cliente: c.cliente, http: r.statusCode, omitidas: c.omitidas_por_tiempo })',
  '  } catch (err) { lanzados.push({ cliente: c.cliente, http: 0, error: String((err && err.message) || err).slice(0, 120) }) }',
  '}',
  'return [{ json: { reintento: true, lanzados } }]',
].join('\n')

export function unClientePorEjecucion(flujo) {
  const f = JSON.parse(JSON.stringify(flujo))
  const nodo = (n) => { const m = f.nodes.filter((x) => x.name === n); if (m.length !== 1) throw new Error(m.length + ' nodos «' + n + '»'); return m[0] }
  if (f.nodes.some((n) => n.name === NODO_REPARTIR)) throw new Error('el flujo ya reparte por cliente')

  // 1 · el webhook «un cliente» (copia del de despertar: la respuesta sale al recibir)
  const wd = nodo('Webhook · completar despertar (llave interna)')
  const w = JSON.parse(JSON.stringify(wd))
  w.id = '9c1f0b52-6d7e-4b6a-9a5e-3f0c2a7d1e44'
  w.name = NODO_WEBHOOK
  w.webhookId = '5d2a8e71-0c43-4f9b-8b1d-6e7a9c3b2f10'
  w.parameters = { ...w.parameters, path: RUTA_UN_CLIENTE }
  w.position = [wd.position[0], wd.position[1] + 180]
  f.nodes.push(w)
  f.connections[NODO_WEBHOOK] = { main: [[{ node: '⓪ Entrada', type: 'main', index: 0 }]] }

  // 2 · ⓪ Entrada reconoce la entrada «un cliente» (llave interna + client_id uuid; reintento opcional)
  const en = nodo('⓪ Entrada')
  en.parameters.jsCode = conFinDeLinea(en.parameters.jsCode, (c) => {
    let x = c
    x = cambiar(x, "let w = null\ntry { w = $('Webhook · a mano (con llave)').first() } catch (e) { w = null }\n",
      "let w = null\ntry { w = $('Webhook · a mano (con llave)').first() } catch (e) { w = null }\nlet u = null\ntry { u = $('" + NODO_WEBHOOK + "').first() } catch (e) { u = null }\n", 'lectura del webhook un cliente')
    x = cambiar(x, "if (d) {\n",
      "if (u) {\n  const h = u.json || {}\n  const esperada = String($env.INTERNAL_API_KEY || '')\n  const recibida = String((h.headers || {})['x-api-key'] || '')\n  if (!esperada || recibida !== esperada) throw new Error('UN_CLIENTE_SIN_LLAVE · falta o no coincide x-api-key · se DETIENE')\n  const b = h.body || {}\n  if (typeof b.client_id !== 'string' || !UUID.test(b.client_id)) throw new Error('UN_CLIENTE_INVALIDO · `client_id` es obligatorio y debe ser un uuid · se DETIENE')\n  return [{ json: { ...base, via: 'cliente', dry_run: false, client_id: b.client_id, reintento: b.reintento === true } }]\n}\nif (d) {\n", 'rama un cliente')
    return x
  })

  // 3 · ① Repartir entre «Un elemento por cliente» y «Descubrir»
  const un = nodo('① Un elemento por cliente')
  const rep = {
    parameters: { jsCode: CODIGO_REPARTIR },
    id: '7a3e5b90-2c81-4d6f-a0e2-1b9d4c8f6a35', name: NODO_REPARTIR, type: 'n8n-nodes-base.code', typeVersion: 2, position: [un.position[0] + 220, un.position[1] + 180],
  }
  f.nodes.push(rep)
  const cx = f.connections['① Un elemento por cliente']
  if (!cx || cx.main[0].length !== 1 || cx.main[0][0].node !== '① Descubrir (el portero que alimenta)') throw new Error('las conexiones de ① Un elemento por cliente no son las esperadas')
  cx.main[0][0].node = NODO_REPARTIR
  f.connections[NODO_REPARTIR] = { main: [[{ node: '① Descubrir (el portero que alimenta)', type: 'main', index: 0 }]] }

  // 4 · ⑤ Cierre expone lo omitido por tiempo de cada cliente (para el reintento y para que el vigilante/lectores lo vean)
  const ci = nodo('⑤ Cierre')
  ci.parameters.jsCode = conFinDeLinea(ci.parameters.jsCode, (c) => cambiar(c,
    '    alimentar: a.apagado ?',
    "    omitidas_por_tiempo: [].concat((p.ampliacion && p.ampliacion.omitidas_por_tiempo) || [], (p.articulos && p.articulos.omitidas_por_tiempo) || [], (p.tanda2 && p.tanda2.omitidas_por_tiempo) || []),\n    alimentar: a.apagado ?", 'omitidas en el cierre'))

  // 5 · ④ Alimentar: el reintento fuerza (la corrida del día ya existe)
  const al = nodo('④ Alimentar (filtrar · razonar · archivar)')
  al.parameters.jsonBody = cambiar(al.parameters.jsonBody,
    "workflow_id: $json.workflow_id, workflow_execution_id: $json.workflow_execution_id }) }}",
    "workflow_id: $json.workflow_id, workflow_execution_id: $json.workflow_execution_id, ...($('⓪ Entrada').first().json.reintento === true ? { forzar: true } : {}) }) }}", 'forzar en el reintento')

  // 6 · ⑥ Vigilar: solo mira al cliente de ESTA ejecución
  const vi = nodo('⑥ Vigilar (apaga y avisa si algo falla)')
  vi.parameters.jsonBody = cambiar(vi.parameters.jsonBody,
    "cierre: $json }) }}",
    "cierre: $json, ...($('⓪ Entrada').first().json.client_id ? { client_id: $('⓪ Entrada').first().json.client_id } : {}) }) }}", 'client_id en el vigilante')

  // 7 · ⑦ Reintento después de ⑥
  const rei = { parameters: { jsCode: CODIGO_REINTENTO }, id: '2e8c4a17-9b30-4f5d-8c6a-0d1f7b3e9a52', name: NODO_REINTENTO, type: 'n8n-nodes-base.code', typeVersion: 2, position: [vi.position[0] + 220, vi.position[1]] }
  f.nodes.push(rei)
  f.connections['⑥ Vigilar (apaga y avisa si algo falla)'] = { main: [[{ node: NODO_REINTENTO, type: 'main', index: 0 }]] }
  return f
}

if (process.argv[1] && /construir-un-cliente-por-ejecucion\.mjs$/.test(process.argv[1])) {
  const antes = JSON.parse(fs.readFileSync(ANTES, 'utf8'))
  const despues = unClientePorEjecucion(antes)
  fs.writeFileSync(ARREGLADO, JSON.stringify(despues, null, 1))
  console.log('ARREGLADO escrito:', ARREGLADO, '· nodos', antes.nodes.length, '→', despues.nodes.length)
}
