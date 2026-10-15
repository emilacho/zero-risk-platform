// F4 · EL BLOQUE FINANCIERO EN EL PLAN (CC#1 · 2026-10-14) · diseño v2 rev. 8 §5 · NO SE APLICA (aplica CC#3 con respaldo, n8n 0/0, después del seco J5 y ANTES del enganche J7).
//   node construir-f4.mjs [--salida=<carpeta>]   → escribe el ARREGLADO · NO toca n8n
// 🔴 APAGADO = IDÉNTICO A HOY: sin `finanzas_id` en el sobre el flujo hace exactamente lo de siempre (la rama «falso» va directo al redactor; B4 y «¿Llegó la vuelta?» producen la misma salida).
// Se parte del flujo vivo respaldado (`planeacion-ARREGLADO-r81-2026-10-13.json`, igual al vivo del 14-oct) y solo cambia:
//   · el módulo común de chequeos (P1–P7 intactos) gana P8 y P9, que SOLO corren si el contexto trae `finanzas`;
//   · «Redactor (B4)»: lee el bloque firmado de «FIN · leer el bloque» (si existe) y lo suma al pedido; si no, nada;
//   · tres nodos nuevos entre «Unir lo del dueño al paquete» y B4.
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MODULO_R81 } from '../X9F0zp6LQ2xGEYVS/construir-r81.mjs'

const aqui = dirname(fileURLToPath(import.meta.url))
const lf = (s) => String(s).split('\r\n').join('\n')
export const BASE = join(aqui, '..', 'X9F0zp6LQ2xGEYVS', 'planeacion-ARREGLADO-r81-2026-10-13.json')
export const MODULO_FINANZAS = lf(fs.readFileSync(join(aqui, 'chequeos-finanzas.js'), 'utf8'))
export const NODOS = { b4: 'Redactor (B4)', vuelta: '¿Llegó la vuelta?', unir: 'Unir lo del dueño al paquete' }
export const FIN = { si: 'FIN · ¿trae finanzas_id?', leer: 'FIN · leer el bloque', devolver: 'FIN · devolver el paquete' }
export const NOMBRES_NUEVOS = Object.values(FIN)
export const antesDeF4 = () => JSON.parse(lf(fs.readFileSync(BASE, 'utf8')).replace(/^﻿/, ''))

const unaVez = (s, de, a, que) => {
  const n = s.split(de).length - 1
  if (n !== 1) throw new Error(`${que}: se esperaba 1 aparición y hay ${n}; el flujo cambió, se revisa el enganche`)
  return s.replace(de, () => a)
}

/** el módulo común con P8/P9: P1–P7 intactos; P8/P9 solo si el contexto trae `finanzas` */
export function moduloConFinanzas(modulo = lf(MODULO_R81)) {
  let m = modulo
  m = unaVez(m, 'var _ETIQUETA_DE_MARCA = { P1:', "var _ETIQUETA_DE_MARCA = { P8: 'cifras del presupuesto que no son las firmadas', P9: 'cifras supuestas que se presentan como dato', P1:", 'etiquetas')
  m = unaVez(m, 'function revisarPlan(texto, ctx) {', MODULO_FINANZAS.trimEnd() + '\n\nfunction revisarPlan(texto, ctx) {', 'revisarPlan')
  m = unaVez(m, '  return { ok: marcas.length === 0, marcas: marcas }', '  if (ctx && ctx.finanzas) { marcas = marcas.concat(revisarCifrasFinanzas(texto, ctx.finanzas)) }\n  return { ok: marcas.length === 0, marcas: marcas }', 'cierre de revisarPlan')
  return m
}

const LEER_FIN = [
  '// F4 v2 · lo que la oficina financiera entrega al plan, FIRMADO O NO (hallazgo 3 · 15-oct): el bloque (si el sobre trajo `finanzas_id` y la ruta lo entregó) y/o el motivo por el que no hay firma',
  '// (`finanzas_motivo` del sobre). Sin ninguno de los dos: null y el pedido queda IDÉNTICO a hoy, byte por byte.',
  'const FIN = (function () {',
  '  try {',
  "    let cuerpoHook = {}",
  "    try { cuerpoHook = ($('Webhook · planeacion').first().json.body || {}) } catch (x) { cuerpoHook = {} }",
  "    const MOTIVOS = ['sin_acuerdo', 'sin_firma', 'vencido', 'sin_bloque', 'sin_referencia', 'sin_pauta']",
  '    const motivoPedido = MOTIVOS.indexOf(cuerpoHook.finanzas_motivo) >= 0 ? cuerpoHook.finanzas_motivo : null',
  '    let r = null',
  "    try { r = $('" + FIN.leer + "').first().json || {} } catch (x) { r = null }",
  '    const b = r && r.body && typeof r.body === "object" ? r.body : {}',
  '    const leido = !!r && Number(r.statusCode) === 200 && !!b.finanzas_id && Array.isArray(b.numeros) && b.numeros.length > 0 && !!b.resumen',
  '    if (leido) {',
  "      const firmado = b.estado === 'firmado'",
  "      return { finanzas_id: String(b.finanzas_id), estado: firmado ? 'firmado' : 'sin_firma', motivo: firmado ? null : (motivoPedido || 'sin_firma'), huella: b.huella || null, numeros: b.numeros, semanas: Number(b.semanas) || 12, resumen: b.resumen, declaradas: Array.isArray(b.montos_declarados) ? b.montos_declarados.filter(function (x) { return typeof x === 'number' && isFinite(x) }) : [] }",
  '    }',
  "    if (motivoPedido) return { finanzas_id: null, estado: 'sin_bloque', motivo: motivoPedido, huella: null, numeros: [], semanas: 12, resumen: null, declaradas: [] }",
  '    return null',
  '  } catch (x) { return null }',
  '})()',
  '',
].join('\n')

export function cambiarB4(codigo) {
  let s = lf(codigo)
  s = unaVez(s, lf(MODULO_R81), moduloConFinanzas(), 'módulo r81 en B4')
  s = unaVez(s, 'const ctxPN = ', LEER_FIN + 'const ctxPN = ', 'ctxPN')
  s = unaVez(s, "'══════ FIN DEL DOCUMENTO DE REFERENCIA ══════',", "...lineasDeFinanzas(FIN),\n'══════ FIN DEL DOCUMENTO DE REFERENCIA ══════',", 'fin del documento')
  s = unaVez(s, "contexto_chequeo: Object.assign({}, ctxPN, { personas: PROTEGIDAS, nombre_cliente: ficha.name || null }),", "contexto_chequeo: Object.assign({}, ctxPN, { personas: PROTEGIDAS, nombre_cliente: ficha.name || null }, FIN ? { finanzas: { numeros: FIN.numeros, semanas: FIN.semanas, estado: FIN.estado, motivo: FIN.motivo, declaradas: FIN.declaradas } } : {}),\n    ...(FIN ? { finanzas_id_usado: FIN.finanzas_id, finanzas_estado_usado: FIN.estado, finanzas_motivo_usado: FIN.motivo } : {}),", 'contexto_chequeo')
  return s
}
export function cambiarVuelta(codigo) {
  return unaVez(lf(codigo), lf(MODULO_R81), moduloConFinanzas(), 'módulo r81 en «¿Llegó la vuelta?»')
}

const VERCEL = "($env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app')"
const WEBHOOK_BODY = "($('Webhook · planeacion').first().json.body || {})"

export function enganchaFinanzas(antes) {
  const copia = JSON.parse(JSON.stringify(antes))
  for (const n of copia.nodes) if (NOMBRES_NUEVOS.includes(n.name)) throw new Error(`el flujo ya tiene «${n.name}»`)
  const get = (nombre) => { const x = copia.nodes.filter((n) => n.name === nombre); if (x.length !== 1) throw new Error(`${x.length} nodos «${nombre}»`); return x[0] }
  const b4 = get(NODOS.b4), vuelta = get(NODOS.vuelta), unir = get(NODOS.unir)
  const sal = copia.connections[NODOS.unir]?.main?.[0] ?? []
  if (sal.length !== 1 || sal[0].node !== NODOS.b4) throw new Error('«Unir lo del dueño al paquete» ya no va directo a «Redactor (B4)»: el flujo cambió, se revisa el enganche')
  b4.parameters.jsCode = cambiarB4(b4.parameters.jsCode)
  vuelta.parameters.jsCode = cambiarVuelta(vuelta.parameters.jsCode)
  const [x, y] = unir.position
  copia.nodes.push(
    { parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: `={{ ((typeof ${WEBHOOK_BODY}.finanzas_id === 'string' && ${WEBHOOK_BODY}.finanzas_id.length > 0) || (typeof ${WEBHOOK_BODY}.finanzas_motivo === 'string' && ${WEBHOOK_BODY}.finanzas_motivo.length > 0)) && typeof ${WEBHOOK_BODY}.client_id === 'string' && ${WEBHOOK_BODY}.client_id.length > 0 }}`, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }] }, options: {} }, name: FIN.si, type: 'n8n-nodes-base.if', typeVersion: 2, position: [x + 240, y + 260] },
    {
      parameters: {
        method: 'POST', url: `={{ ${VERCEL} + '/api/finanzas/tablero' }}`, sendHeaders: true,
        headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] },
        sendBody: true, specifyBody: 'json', jsonBody: `={{ JSON.stringify({ accion: 'leer', finanzas_id: ${WEBHOOK_BODY}.finanzas_id, client_id: ${WEBHOOK_BODY}.client_id }) }}`,
        options: { timeout: 30000, response: { response: { fullResponse: true, neverError: true } } },
      },
      name: FIN.leer, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [x + 480, y + 260], onError: 'continueRegularOutput',
    },
    { parameters: { jsCode: "// F4 · devuelve el paquete ORIGINAL (lo que recibe «Redactor (B4)» no cambia): el bloque se lee desde «" + FIN.leer + "».\nreturn $('" + NODOS.unir + "').all()" }, name: FIN.devolver, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x + 720, y + 260] },
  )
  const enlace = (de, a, i = 0) => { copia.connections[de] = copia.connections[de] || { main: [] }; while (copia.connections[de].main.length <= i) copia.connections[de].main.push([]); copia.connections[de].main[i].push({ node: a, type: 'main', index: 0 }) }
  copia.connections[NODOS.unir].main[0] = [{ node: FIN.si, type: 'main', index: 0 }]
  enlace(FIN.si, FIN.leer, 0)        // trae `finanzas_id`: leer
  enlace(FIN.si, NODOS.b4, 1)        // no lo trae: DIRECTO al redactor (idéntico a hoy)
  enlace(FIN.leer, FIN.devolver)
  enlace(FIN.devolver, NODOS.b4)
  return copia
}

// ── CLI: escribe el ARREGLADO (y el respaldo ANTES queda en el repo como `planeacion-ARREGLADO-r81-2026-10-13.json`)
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = process.argv.find((a) => a.startsWith('--salida='))
  const salida = arg ? arg.slice('--salida='.length) : aqui
  const despues = enganchaFinanzas(antesDeF4())
  const ruta = join(salida, 'plan-F4-finanzas-v2-ARREGLADO-2026-10-15.json')
  fs.writeFileSync(ruta, JSON.stringify(despues, null, 2))
  console.log(`plan · ${despues.nodes.length} nodos (+${NOMBRES_NUEVOS.length}) → ${ruta}`)
}
