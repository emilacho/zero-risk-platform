// PLAN v3 · LOS DIRECTORES DE OFICINA LE PIDEN AL `portero` LO QUE LES FALTA (CC#1 · 2026-10-16) · NO SE APLICA (lo aplica CC#3 con respaldo, n8n 0/0, fuera de 12:00–14:00 y 00:00–00:30 UTC, «vivo = respaldo»).
//   node construir-pedidos.mjs [--salida=<carpeta>]   → escribe el ARREGLADO · NO toca n8n
// Base: `LISTO-CC-CEREBRO-completar-con-huecos` (ruta `POST|GET /api/brain/alimentar/pedido`, pedido LIBRE, sin lista de autorizados) + SENAL «pedido libre»: el portero o ENTREGA o dice «esta información me falta».
// Qué engancha en el flujo de planeación (vivo de hoy = 84 nodos), TODO detrás de `plan_v3` y de que haya algo que pedir (sin eso: salida IDÉNTICA a hoy, byte por byte):
//   · PEDP · el director de la `planeación` (`campaign-brief-agent`) pide los tipos de dato que el `dato.v1` no trajo o trajo vacíos, ANTES de abrir la oficina financiera;
//   · PEDF · el director de la `oficina financiera` (`chief-financial-officer`) pide lo que la oficina declaró no saber (`no_se` de su planteo), DESPUÉS de que cierra;
//   · «Redactor (B4)» suma `lineasDePedidos`: lo traído, citado y delimitado como DATO; lo que falta, como «esta información me falta». NUNCA inventa.
// El interruptor del portero es el suyo (`PORTERO_PEDIDOS`, apagado ⇒ `{apagado:true}` ⇒ el plan sigue como hoy). Gasto: el del portero (tope US$ 0,40 por pedido y 1,50 por oficina y día).
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const lf = (s) => String(s).split('\r\n').join('\n')
export const BASE = join(aqui, 'ANTES-X9F0zp6LQ2xGEYVS-2026-10-16-pedidos.json')
export const MODULO_PEDIDOS = lf(fs.readFileSync(join(aqui, 'pedidos-lineas.js'), 'utf8'))
export const antesDePedidos = () => JSON.parse(lf(fs.readFileSync(BASE, 'utf8')).replace(/^﻿/, ''))

/** pasos del bucle de espera: 15 × 20 s = 5 min (el pedido sigue «hasta ~5 min» en segundo plano) */
export const ESPERA_S = 20
export const MAX_VUELTAS = 15
export const NODOS = { b4: 'Redactor (B4)', pv3Si: 'PV3 · ¿pide el dato v1?', pv3Paquete: 'PV3 · paquete', abreOficina: 'FIN · ¿abre la oficina?', sobre: 'FIN · sobre', puertaFin: 'FIN · ¿trae finanzas_id?', leerOficina: 'FIN · leer el encargo', hook: 'Webhook · planeacion' }

function nombres(p) {
  return {
    armar: `${p} · armar el pedido`, si: `${p} · ¿hay algo que pedir?`, pedir: `${p} · pedir al portero`, decidir: `${p} · decidir`, sigue: `${p} · ¿sigue esperando?`,
    esperar: `${p} · esperar`, leer: `${p} · leer el resultado`, resultado: `${p} · resultado`, devolver: `${p} · devolver el paquete`,
  }
}
export const PLAN = nombres('PEDP')
export const FIN = nombres('PEDF')
export const NOMBRES_NUEVOS = [...Object.values(PLAN).filter((n) => n !== PLAN.devolver), ...Object.values(FIN)]

const VERCEL = "($env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app')"
const HOOK = `($('${NODOS.hook}').first().json.body || {})`

// ── el código de los nodos (cada uno se prueba tal cual)
const BASE_ARMAR = (director, oficina, agente, para, huecosJs) => [
  `// ${director}: arma el pedido LIBRE al portero con lo que le falta a su oficina. Nunca lanza. Sin sobre plan_v3 o sin huecos: \`pedir:false\` (el flujo sigue como hoy).`,
  `const body = ${HOOK}`,
  "const salida = { pedir: false }",
  'try {',
  "  if (body.plan_v3 === true && typeof body.client_id === 'string' && body.client_id.length > 0) {",
  `    const huecos = (function () {\n${huecosJs}\n    })()`,
  '    if (huecos.length > 0) {',
  '      // idéntico pedido de la MISMA corrida = mismo `pedido_id` (el portero devuelve el anterior sin gastar); FNV-1a ×4 → 32 hex en forma de uuid',
  `      const semilla = String(body.corrida || body.client_id) + '|${oficina}'`,
  '      const h = function (s, k) { let x = 0x811c9dc5 ^ k; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0 } return (\'00000000\' + x.toString(16)).slice(-8) }',
  '      const hex = h(semilla, 1) + h(semilla, 2) + h(semilla, 3) + h(semilla, 4)',
  "      const pedido_id = hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-4' + hex.slice(13, 16) + '-8' + hex.slice(17, 20) + '-' + hex.slice(20, 32)",
  "      const dry = body.dry_run === true",
  `      salida.pedir = true`,
  `      salida.director = '${oficina}'`,
  "      salida.dry_run = dry",
  `      salida.pedido = { client_id: String(body.client_id), dry_run: dry, workflow_id: String($workflow.id), workflow_execution_id: String($execution.id), pedido_por: { oficina: '${oficina}', agente: '${agente}' }, para: ${JSON.stringify(para)}, huecos: huecos.slice(0, 12), pedido_id: pedido_id }`,
  '    }',
  '  }',
  '} catch (x) { salida.pedir = false }',
  'return [{ json: salida }]',
].join('\n')

const HUECOS_PLAN = [
  "      let pv = null",
  `      try { const p = $('${NODOS.pv3Paquete}').first().json; if (p && p.plan_version === 'v3') pv = p } catch (x) { pv = null }`,
  '      if (!pv) return []',
  '      const vistos = {}',
  '      const out = []',
  '      const poner = function (tipo, motivo) { if (typeof tipo === "string" && tipo && !vistos[tipo]) { vistos[tipo] = 1; out.push({ tipo: tipo, objetivo: "dato del negocio que el plan necesita citar", motivo: motivo }) } }',
  '      ;((pv.resumen && Array.isArray(pv.resumen.faltantes)) ? pv.resumen.faltantes : []).forEach(function (t) { poner(t, "no hay una ficha fresca en el cerebro") })',
  '      ;(Array.isArray(pv.datos) ? pv.datos : []).forEach(function (d) { if (d && d.origen === "hueco") poner(d.tipo_id, "la lectura vino vacía o sin campos") })',
  '      return out',
].join('\n')

const HUECOS_FIN = [
  '      let leido = null',
  `      try { leido = $('${NODOS.leerOficina}').first().json } catch (x) { leido = null }`,
  '      const cuerpo = leido && leido.body && typeof leido.body === "object" ? leido.body : {}',
  '      const turnos = Array.isArray(cuerpo.turnos) ? cuerpo.turnos : []',
  '      let noSe = []',
  '      turnos.forEach(function (t) { if (t && (t.paso === "planteo" || t.paso === "ajuste" || t.paso === "ajuste_2") && t.salida && Array.isArray(t.salida.no_se) && t.salida.no_se.length) noSe = t.salida.no_se })',
  '      const vistos = {}',
  '      const out = []',
  '      noSe.forEach(function (x) { const s = typeof x === "string" ? x.trim() : ""; if (s && !vistos[s]) { vistos[s] = 1; out.push({ objetivo: s.slice(0, 200), motivo: "la oficina financiera declaró no saberlo al cerrar" }) } })',
  '      return out',
].join('\n')

export const CODIGO_ARMAR_PLAN = BASE_ARMAR('PEDP · el director de la planeación', 'planeacion', 'campaign-brief-agent', 'El plan de campaña necesita citar estos datos del negocio. Si no existen o no se pueden verificar, dilo con «esta información me falta»: el plan los declarará como hueco y no los inventará.', HUECOS_PLAN)
export const CODIGO_ARMAR_FIN = BASE_ARMAR('PEDF · el director de la oficina financiera', 'oficina-financiera', 'chief-financial-officer', 'La oficina financiera cerró sin estos datos y los declaró como no sabidos. Si existen y se pueden verificar, tráelos y archívalos para la próxima versión; si no, dilo con «esta información me falta».', HUECOS_FIN)

/** la respuesta del POST (vuelta 0) y la del GET (vueltas siguientes) → seguir esperando o terminar. FALLA HACIA «sin lo pedido»: el plan sigue como hoy. Nunca lanza. */
export const codigoDecidir = (p) => [
  `// ${p}: a dónde sigue el pedido. Terminales del portero: resuelto · parcial · no_resuelto · en_cadena · fallo. «en_proceso» espera (tope ${MAX_VUELTAS} vueltas de ${ESPERA_S} s).`,
  `const MAX_VUELTAS = ${MAX_VUELTAS}`,
  'const r = $input.first().json || {}',
  'const b = r.body && typeof r.body === "object" && !Array.isArray(r.body) ? r.body : {}',
  'const http = Number(r.statusCode)',
  'const vuelta = Number($runIndex) || 0',
  "const TERMINALES = ['resuelto', 'parcial', 'no_resuelto', 'en_cadena', 'fallo']",
  `let pedido_id = null`,
  `try { pedido_id = $('${p} · armar el pedido').first().json.pedido.pedido_id } catch (x) { pedido_id = null }`,
  "if (b.apagado === true) return [{ json: { fin: true, estado: 'apagado', pedido_id: pedido_id, huecos: [] } }]",
  "if (!(http === 200)) return [{ json: { fin: true, estado: 'sin_respuesta', pedido_id: pedido_id, http: Number.isFinite(http) ? http : null, error: typeof b.error === 'string' ? b.error : null, huecos: [] } }]",
  'let dry = false',
  `try { dry = $('${p} · armar el pedido').first().json.dry_run === true } catch (x) { dry = false }`,
  "if (vuelta === 0 && dry) return [{ json: { fin: true, estado: 'en_seco', pedido_id: pedido_id, huecos: [] } }]",
  "const id = typeof b.pedido_id === 'string' && b.pedido_id ? b.pedido_id : pedido_id",
  "const estado = String(b.estado || '')",
  "if (TERMINALES.indexOf(estado) >= 0) return [{ json: { fin: true, estado: estado, pedido_id: id, costo_usd: typeof b.costo_usd === 'number' ? b.costo_usd : null, huecos: Array.isArray(b.huecos) ? b.huecos : [], cadena_llego: b.cadena_llego || null } }]",
  "if (vuelta >= MAX_VUELTAS) return [{ json: { fin: true, estado: 'sin_respuesta_a_tiempo', pedido_id: id, huecos: [] } }]",
  "if (!id) return [{ json: { fin: true, estado: 'sin_respuesta', pedido_id: null, huecos: [] } }]",
  'return [{ json: { fin: false, pedido_id: id } }]',
].join('\n')

export const codigoResultado = (p, director) => [
  `// ${p}: lo que el redactor leerá. Solo lo útil (huecos con su estado); apagado, en seco o sin respuesta = nada. Nunca lanza.`,
  'const d = $input.first().json || {}',
  `return [{ json: { director: '${director}', estado: String(d.estado || 'sin_estado'), pedido_id: d.pedido_id || null, costo_usd: d.costo_usd == null ? null : d.costo_usd, huecos: Array.isArray(d.huecos) ? d.huecos : [], cadena_llego: d.cadena_llego || null } }]`,
].join('\n')

function nodosDeCadena(N, p, director, codigoArmar, pos, final) {
  const [x, y] = pos
  const cond = (leftValue) => ({ conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }] }, options: {} })
  const http = (name, extra, dx) => ({ parameters: { sendHeaders: true, headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] }, options: { timeout: 60000, response: { response: { fullResponse: true, neverError: true } } }, ...extra }, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [x + dx, y], onError: 'continueRegularOutput' })
  const nodos = [
    { parameters: { jsCode: codigoArmar }, name: N.armar, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x, y] },
    { parameters: cond('={{ $json.pedir === true }}'), name: N.si, type: 'n8n-nodes-base.if', typeVersion: 2, position: [x + 240, y] },
    http(N.pedir, { method: 'POST', url: `={{ ${VERCEL} + '/api/brain/alimentar/pedido' }}`, sendBody: true, specifyBody: 'json', jsonBody: `={{ JSON.stringify($('${N.armar}').first().json.pedido) }}` }, 480),
    { parameters: { jsCode: codigoDecidir(p) }, name: N.decidir, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x + 720, y] },
    { parameters: cond('={{ $json.fin === false }}'), name: N.sigue, type: 'n8n-nodes-base.if', typeVersion: 2, position: [x + 960, y] },
    { parameters: { resume: 'timeInterval', amount: ESPERA_S, unit: 'seconds' }, name: N.esperar, type: 'n8n-nodes-base.wait', typeVersion: 1.1, position: [x + 1200, y + 120], webhookId: `${p.toLowerCase()}-espera-portero` },
    http(N.leer, { method: 'GET', url: `={{ ${VERCEL} + '/api/brain/alimentar/pedido?id=' + encodeURIComponent($('${N.decidir}').first().json.pedido_id) }}` }, 1440),
    { parameters: { jsCode: codigoResultado(p, director) }, name: N.resultado, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x + 1200, y - 120] },
  ]
  if (final) nodos.push({ parameters: { jsCode: `// ${p}: devuelve el paquete ORIGINAL de «${NODOS.sobre}» (con \`finanzas_efectivo\` si la oficina lo dejó): el pedido no altera lo que sigue.\nreturn $('${NODOS.sobre}').all()` }, name: N.devolver, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x + 1440, y - 120] })
  return nodos
}

export function conectaPedidos(antes) {
  const copia = JSON.parse(JSON.stringify(antes))
  for (const n of copia.nodes) if (NOMBRES_NUEVOS.includes(n.name) || n.name === PLAN.devolver || n.name === FIN.devolver) throw new Error(`el flujo ya tiene «${n.name}»`)
  const get = (nombre) => { const x = copia.nodes.filter((n) => n.name === nombre); if (x.length !== 1) throw new Error(`${x.length} nodos «${nombre}»`); return x[0] }
  const b4 = get(NODOS.b4), pv3Si = get(NODOS.pv3Si), sobre = get(NODOS.sobre)
  get(NODOS.pv3Paquete); get(NODOS.abreOficina); get(NODOS.puertaFin); get(NODOS.leerOficina)
  const sal = (n) => copia.connections[n]?.main ?? []
  const aAbre = (lista) => lista.length === 1 && lista[0].node === NODOS.abreOficina
  if (!aAbre(sal(NODOS.pv3Paquete)[0] ?? []) || !aAbre(sal(NODOS.pv3Si)[1] ?? [])) throw new Error('«PV3 · …» ya no va directo a «FIN · ¿abre la oficina?»: el flujo cambió, se revisa la conexión')
  const aPuerta = sal(NODOS.sobre)[0] ?? []
  if (aPuerta.length !== 1 || aPuerta[0].node !== NODOS.puertaFin) throw new Error('«FIN · sobre» ya no va directo a «FIN · ¿trae finanzas_id?»: el flujo cambió, se revisa la conexión')

  // 1 · el módulo y las líneas en B4 (después de las líneas del dato v1)
  let s = lf(b4.parameters.jsCode)
  const unaVez = (txt, de, a, que) => { const n = txt.split(de).length - 1; if (n !== 1) throw new Error(`${que}: se esperaba 1 aparición y hay ${n}; el flujo cambió, se revisa`); return txt.replace(de, () => a) }
  s = unaVez(s, 'const FIN = (function () {', MODULO_PEDIDOS.trimEnd() + '\n\n' + [
    '// lo que los directores le pidieron al portero (solo si el sobre pidió `plan_v3`): sin resultado útil → [] y el pedido queda IDÉNTICO a hoy',
    'const PEDIDOS_AL_PORTERO = (function () {',
    '  const out = []',
    `  ;['${PLAN.resultado}', '${FIN.resultado}'].forEach(function (n) { try { const j = $(n).first().json; if (j && Array.isArray(j.huecos) && j.huecos.length) out.push(j) } catch (x) { /* ese director no pidió */ } })`,
    '  return out',
    '})()',
    'const LINEAS_PEDIDOS = lineasDePedidos(PEDIDOS_AL_PORTERO)',
    '',
  ].join('\n') + 'const FIN = (function () {', 'módulo y lector de pedidos')
  s = unaVez(s, '...LINEAS_V3,\n', '...LINEAS_V3,\n...LINEAS_PEDIDOS,\n', 'líneas de pedidos en el pedido')
  b4.parameters.jsCode = s

  // 2 · las dos cadenas
  const [px, py] = pv3Si.position
  const [sx, sy] = sobre.position
  copia.nodes.push(...nodosDeCadena(PLAN, 'PEDP', 'planeacion', CODIGO_ARMAR_PLAN, [px + 120, py + 300], false))
  copia.nodes.push(...nodosDeCadena(FIN, 'PEDF', 'oficina-financiera', CODIGO_ARMAR_FIN, [sx + 120, sy + 300], true))
  const enlace = (de, a, i = 0) => { copia.connections[de] = copia.connections[de] || { main: [] }; while (copia.connections[de].main.length <= i) copia.connections[de].main.push([]); copia.connections[de].main[i].push({ node: a, type: 'main', index: 0 }) }
  const cadena = (N, siguiente, final) => {
    enlace(N.armar, N.si)
    enlace(N.si, N.pedir, 0)          // hay algo que pedir
    enlace(N.si, final ? N.devolver : siguiente, 1) // nada que pedir: DIRECTO (idéntico a hoy)
    enlace(N.pedir, N.decidir)
    enlace(N.decidir, N.sigue)
    enlace(N.sigue, N.esperar, 0)     // sigue esperando
    enlace(N.esperar, N.leer)
    enlace(N.leer, N.decidir)         // bucle
    enlace(N.sigue, N.resultado, 1)   // terminó
    enlace(N.resultado, final ? N.devolver : siguiente)
    if (final) enlace(N.devolver, siguiente)
  }
  // PEDP entre «PV3 · …» y «FIN · ¿abre la oficina?»
  copia.connections[NODOS.pv3Paquete].main[0] = [{ node: PLAN.armar, type: 'main', index: 0 }]
  copia.connections[NODOS.pv3Si].main[1] = [{ node: PLAN.armar, type: 'main', index: 0 }]
  cadena(PLAN, NODOS.abreOficina, false)
  // PEDF entre «FIN · sobre» y «FIN · ¿trae finanzas_id?»
  copia.connections[NODOS.sobre].main[0] = [{ node: FIN.armar, type: 'main', index: 0 }]
  cadena(FIN, NODOS.puertaFin, true)
  return copia
}

// ── CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = process.argv.find((a) => a.startsWith('--salida='))
  const salida = arg ? arg.slice('--salida='.length) : aqui
  const despues = conectaPedidos(antesDePedidos())
  const ruta = join(salida, 'ARREGLADO-X9F0zp6LQ2xGEYVS-pedidos-al-portero-2026-10-16.json')
  fs.writeFileSync(ruta, JSON.stringify(despues, null, 2))
  console.log(`plan · ${despues.nodes.length} nodos (+${despues.nodes.length - antesDePedidos().nodes.length}) → ${ruta}`)
}
