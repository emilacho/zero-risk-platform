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
// F4 v2.1 · LA OFICINA CONDUCIDA POR EL PLAN (15-oct): nadie más abre ni cierra la conversación; el plan la pide, la avanza y copia el resultado a su propio sobre.
export const OF = {
  abre: 'FIN · ¿abre la oficina?', armar: 'FIN · armar la semilla', abrir: 'FIN · abrir la conversación', decidir: 'FIN · decidir', sigue: 'FIN · ¿sigue la conversación?',
  avanzar: 'FIN · avanzar un paso', leerSi: 'FIN · ¿leer la firma?', leer: 'FIN · leer el encargo', cerrar: 'FIN · cerrar la oficina', sobre: 'FIN · sobre',
}
export const NOMBRES_NUEVOS = [...Object.values(FIN), ...Object.values(OF)]
/** tope de la espera de la oficina dentro del plan (diseño §6b: 15 minutos) y de pasos (MAX_AVANCES del kit) */
export const PLAZO_OFICINA_MS = 15 * 60 * 1000
export const MAX_PASOS_OFICINA = 40
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
  '    let ef = null',
  "    try { ef = $('" + OF.sobre + "').first().json.finanzas_efectivo || null } catch (x) { ef = null }",
  '    const motivoPedido = MOTIVOS.indexOf(cuerpoHook.finanzas_motivo) >= 0 ? cuerpoHook.finanzas_motivo : (ef && MOTIVOS.indexOf(ef.finanzas_motivo) >= 0 ? ef.finanzas_motivo : null)',
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

const CODIGO_ARMAR = [
  '// F4 v2.1 · arma la SEMILLA de la oficina con lo que el plan ya tiene en el paquete (resúmenes cortos; nada del expediente entero). Nunca lanza.',
  "const body = ($('Webhook · planeacion').first().json.body || {})",
  "const p = $('Unir lo del dueño al paquete').first().json || {}",
  'const ficha = p.ficha && typeof p.ficha === "object" ? p.ficha : {}',
  'const cfg = ficha.config && typeof ficha.config === "object" ? ficha.config : {}',
  'const manual = p.manual && typeof p.manual === "object" ? p.manual : {}',
  'const reg = (p.registro_del_manual || manual.registro_del_manual || {}).registro',
  'const material = Array.isArray(p.material) ? p.material : []',
  'const descartados = Array.isArray(p.descartados) ? p.descartados : []',
  'const semilla = {',
  '  rubro: ficha.industry || null, pais: ficha.country || null, moneda: cfg.moneda || cfg.currency || null,',
  "  ficha_resumen: 'Rubro: ' + (ficha.industry || 'sin declarar') + '. País: ' + (ficha.country || 'sin declarar') + '.',",
  "  manual_resumen: reg ? 'Registro del cliente: ' + reg + '.' : 'Sin registro declarado en el manual.',",
  "  brazos_resumen: 'Material recolectado: ' + material.length + ' ítems; descartados: ' + descartados.length + '.',",
  '  fecha: new Date(Date.now()).toISOString().slice(0, 10),',
  '}',
  "return [{ json: { accion: 'abrir', client_id: String(body.client_id), dry_run: body.dry_run === true, semilla: semilla, t0: Date.now() } }]",
].join('\n')

const CODIGO_DECIDIR = [
  '// F4 v2.1 · a dónde sigue la conversación de la oficina. FALLA HACIA «sin números»: nada de lo que se interprete mal bloquea ni se lee como «firmado». Nunca lanza.',
  `const PLAZO_MS = ${PLAZO_OFICINA_MS}`,
  `const MAX_PASOS = ${MAX_PASOS_OFICINA}`,
  'const r = $input.first().json || {}',
  'const b = r.body && typeof r.body === "object" ? r.body : {}',
  'const http = Number(r.statusCode)',
  'const vuelta = Number($runIndex) || 0',
  "const t0 = Number($('" + OF.armar + "').first().json.t0) || Date.now()",
  'const pasado = Date.now() - t0',
  '// vuelta 0 = la respuesta de «abrir»; las demás, la de «avanzar»',
  'if (vuelta === 0) {',
  "  if (http === 409) return [{ json: { fin: true, resultado: 'apagada' } }]",
  "  if (!(http === 200 && typeof b.encargo_id === 'string' && b.encargo_id)) return [{ json: { fin: true, finanzas_motivo: 'sin_bloque', detalle: 'la oficina no abrió (HTTP ' + (Number.isFinite(http) ? http : 'sin respuesta') + ')' } }]",
  "  return [{ json: { fin: false, encargo_id: b.encargo_id } }]",
  '}',
  "const id = $('" + OF.decidir + "').first().json.encargo_id",
  "if (!(http === 200)) return [{ json: { fin: true, encargo_id: id, finanzas_motivo: 'sin_bloque', detalle: 'la oficina dejó de contestar (HTTP ' + (Number.isFinite(http) ? http : 'sin respuesta') + ')' } }]",
  "if (b.terminado === true) return [{ json: { fin: true, encargo_id: id, leer: true, estado: String(b.estado || '') } }]",
  "if (pasado > PLAZO_MS || vuelta >= MAX_PASOS) return [{ json: { fin: true, encargo_id: id, finanzas_motivo: 'vencido', detalle: 'la oficina no terminó a tiempo' } }]",
  "return [{ json: { fin: false, encargo_id: id } }]",
].join('\n')
// nota: «FIN · decidir» se llama a sí mismo en el bucle: su salida anterior vive en `$('FIN · decidir')` (la última ejecución)

const CODIGO_CERRAR = [
  '// F4 v2.1 · copia el resultado de la oficina al sobre del plan: `finanzas_id` si hay tablero, y `finanzas_motivo` (lista cerrada) cuando no hay firma. Nunca lanza.',
  "const dec = $('" + OF.decidir + "').first().json || {}",
  "const body = ($('Webhook · planeacion').first().json.body || {})",
  "if (dec.resultado === 'apagada') return [{ json: { finanzas_id: null, finanzas_motivo: null } }]",
  "if (dec.finanzas_motivo) return [{ json: { finanzas_id: null, finanzas_motivo: dec.finanzas_motivo } }]",
  'let leido = null',
  "try { leido = $('" + OF.leer + "').first().json || null } catch (x) { leido = null }",
  'const cuerpo = leido && leido.body && typeof leido.body === "object" ? leido.body : {}',
  "if (!leido || Number(leido.statusCode) !== 200) return [{ json: { finanzas_id: null, finanzas_motivo: 'sin_bloque' } }]",
  "const turnos = Array.isArray(cuerpo.turnos) ? cuerpo.turnos : []",
  "const t = turnos.filter(function (x) { return x && x.paso === 'firma' })[0]",
  "const salida = t && t.salida && typeof t.salida === 'object' ? t.salida : null",
  "const estado = String(cuerpo.estado || dec.estado || '')",
  "if (estado === 'cierre_por_tope') return [{ json: { finanzas_id: null, finanzas_motivo: 'vencido' } }]",
  "if (!salida) return [{ json: { finanzas_id: null, finanzas_motivo: estado === 'fallido' ? 'sin_bloque' : 'sin_firma' } }]",
  "const MAPA = { sin_base: 'sin_referencia', sin_referencia: 'sin_referencia', sin_pauta: 'sin_pauta', sin_bloque: 'sin_bloque' }",
  "if (salida.estado === 'sin_bloque') return [{ json: { finanzas_id: null, finanzas_motivo: MAPA[salida.motivo] || 'sin_bloque' } }]",
  "const id = typeof salida.finanzas_id === 'string' && salida.finanzas_id ? salida.finanzas_id : null",
  '// un ensayo (dry_run) no guarda tablero: no hay nada que leer ni firmar',
  "if (!id) return [{ json: { finanzas_id: null, finanzas_motivo: 'sin_firma' } }]",
  "if (salida.estado === 'firmado') return [{ json: { finanzas_id: id, finanzas_motivo: null } }]",
  "return [{ json: { finanzas_id: id, finanzas_motivo: estado === 'sin_acuerdo' || salida.sin_acuerdo === true ? 'sin_acuerdo' : 'sin_firma' } }]",
].join('\n')

const CODIGO_SOBRE = [
  '// F4 v2.1 · devuelve el paquete ORIGINAL. Si la oficina conducida por el plan dejó un resultado, lo agrega como `finanzas_efectivo`; si no, el paquete sale INTACTO (idéntico a hoy).',
  "const paquete = $('Unir lo del dueño al paquete').all()",
  'let ef = null',
  "try { const c = $('" + OF.cerrar + "').first().json; if (c && (c.finanzas_id || c.finanzas_motivo)) ef = { finanzas_id: c.finanzas_id || null, finanzas_motivo: c.finanzas_motivo || null } } catch (x) { ef = null }",
  'if (!ef) return paquete',
  'return paquete.map(function (i) { return { json: Object.assign({}, i.json, { finanzas_efectivo: ef }), pairedItem: i.pairedItem } })',
].join('\n')

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
    { parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: `={{ !!(((typeof ${WEBHOOK_BODY}.finanzas_id === 'string' && ${WEBHOOK_BODY}.finanzas_id.length > 0) || (typeof ${WEBHOOK_BODY}.finanzas_motivo === 'string' && ${WEBHOOK_BODY}.finanzas_motivo.length > 0) || ($json.finanzas_efectivo && ($json.finanzas_efectivo.finanzas_id || $json.finanzas_efectivo.finanzas_motivo))) && typeof ${WEBHOOK_BODY}.client_id === 'string' && ${WEBHOOK_BODY}.client_id.length > 0) }}`, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }] }, options: {} }, name: FIN.si, type: 'n8n-nodes-base.if', typeVersion: 2, position: [x + 240, y + 260] },
    {
      parameters: {
        method: 'POST', url: `={{ ${VERCEL} + '/api/finanzas/tablero' }}`, sendHeaders: true,
        headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] },
        sendBody: true, specifyBody: 'json', jsonBody: `={{ JSON.stringify({ accion: 'leer', finanzas_id: ($json.finanzas_efectivo && $json.finanzas_efectivo.finanzas_id) || ${WEBHOOK_BODY}.finanzas_id, client_id: ${WEBHOOK_BODY}.client_id }) }}`,
        options: { timeout: 30000, response: { response: { fullResponse: true, neverError: true } } },
      },
      name: FIN.leer, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [x + 480, y + 260], onError: 'continueRegularOutput',
    },
    { parameters: { jsCode: "// F4 · devuelve el paquete ORIGINAL (lo que recibe «Redactor (B4)» no cambia): el bloque se lee desde «" + FIN.leer + "».\nreturn $('" + NODOS.unir + "').all()" }, name: FIN.devolver, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x + 720, y + 260] },
  )
  // ── la oficina conducida por el plan (cuelga ANTES de «FIN · ¿trae finanzas_id?»; con la oficina apagada, o sin `plan_v3`, el paquete sale intacto)
  const [ox, oy] = unir.position
  const http = (name, jsonBody, timeout, dx) => ({
    parameters: {
      method: 'POST', url: `={{ ${VERCEL} + '/api/finanzas/conversa' }}`, sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] },
      sendBody: true, specifyBody: 'json', jsonBody,
      options: { timeout, response: { response: { fullResponse: true, neverError: true } } },
    },
    name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [ox + dx, oy + 520], onError: 'continueRegularOutput',
  })
  const codigo = (name, jsCode, dx, dy = 520) => ({ parameters: { jsCode }, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: [ox + dx, oy + dy] })
  const si = (name, expr, dx) => ({ parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: expr, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }] }, options: {} }, name, type: 'n8n-nodes-base.if', typeVersion: 2, position: [ox + dx, oy + 520] })
  const wfCtx = `workflow_id: String($workflow.id), workflow_execution_id: String($execution.id)`
  copia.nodes.push(
    si(OF.abre, `={{ ${WEBHOOK_BODY}.plan_v3 === true && typeof ${WEBHOOK_BODY}.client_id === 'string' && ${WEBHOOK_BODY}.client_id.length > 0 && !(typeof ${WEBHOOK_BODY}.finanzas_id === 'string' && ${WEBHOOK_BODY}.finanzas_id.length > 0) && !(typeof ${WEBHOOK_BODY}.finanzas_motivo === 'string' && ${WEBHOOK_BODY}.finanzas_motivo.length > 0) }}`, 240),
    codigo(OF.armar, CODIGO_ARMAR, 480),
    http(OF.abrir, `={{ JSON.stringify({ accion: 'abrir', client_id: $json.client_id, dry_run: $json.dry_run, semilla: $json.semilla, ${wfCtx} }) }}`, 60000, 720),
    codigo(OF.decidir, CODIGO_DECIDIR, 960),
    si(OF.sigue, `={{ $json.fin === false }}`, 1200),
    http(OF.avanzar, `={{ JSON.stringify({ accion: 'avanzar', encargo_id: $('${OF.decidir}').first().json.encargo_id, dry_run: ${WEBHOOK_BODY}.dry_run === true, ${wfCtx} }) }}`, 300000, 1440),
    si(OF.leerSi, `={{ $json.leer === true }}`, 1440),
    http(OF.leer, `={{ JSON.stringify({ accion: 'leer', encargo_id: $('${OF.decidir}').first().json.encargo_id, ${wfCtx} }) }}`, 60000, 1680),
    codigo(OF.cerrar, CODIGO_CERRAR, 1920),
    codigo(OF.sobre, CODIGO_SOBRE, 2160),
  )
  const enlace = (de, a, i = 0) => { copia.connections[de] = copia.connections[de] || { main: [] }; while (copia.connections[de].main.length <= i) copia.connections[de].main.push([]); copia.connections[de].main[i].push({ node: a, type: 'main', index: 0 }) }
  copia.connections[NODOS.unir].main[0] = [{ node: OF.abre, type: 'main', index: 0 }]
  enlace(OF.abre, OF.armar, 0)      // pide la oficina (plan v3 + cliente + sin finanzas_id ni motivo en el sobre)
  enlace(OF.abre, OF.sobre, 1)      // no la pide: directo (el paquete sale intacto)
  enlace(OF.armar, OF.abrir)
  enlace(OF.abrir, OF.decidir)
  enlace(OF.decidir, OF.sigue)
  enlace(OF.sigue, OF.avanzar, 0)   // sigue: otro paso
  enlace(OF.avanzar, OF.decidir)
  enlace(OF.sigue, OF.leerSi, 1)    // terminó (o no hay nada que seguir)
  enlace(OF.leerSi, OF.leer, 0)
  enlace(OF.leerSi, OF.cerrar, 1)
  enlace(OF.leer, OF.cerrar)
  enlace(OF.cerrar, OF.sobre)
  enlace(OF.sobre, FIN.si)
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
