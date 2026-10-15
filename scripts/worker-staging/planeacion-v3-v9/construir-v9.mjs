// PLAN v3 · V9 · los nodos de n8n del pre-vuelo y la espera (CC#2 · 2026-10-15) · diseño §10.3 / §16.2 / §17.1 · NO SE APLICA (lo aplica CC#3 en la tanda 2, con respaldo, n8n 0/0, fuera de 12:00–14:00 UTC).
//   node construir-v9.mjs [--salida=<carpeta>]   → escribe el ARREGLADO · NO toca n8n
// ORDEN DECLARADO: F4 (#547, 53 nodos) → enganche J7 (#584 de CC#1, código de la cadena; no cambia este flujo) → V9. La base de este constructor es el ARREGLADO de F4
//   (`plan-F4-finanzas-ARREGLADO-2026-10-14.json`). Si el vivo no es igual a esa base, NO se aplica (regla «vivo = respaldo»).
// 🔴 APAGADO = IDÉNTICO A HOY: V9 solo actúa si el sobre trae `plan_v3: true` Y una `corrida` Y un `client_id`. Sin eso, «⓪ Llave» → «① Cargar el manual de marca» como siempre.
// 🔴 Nada de Apify, ni modelo: el pre-vuelo (`/api/planeacion/prevuelo`, V8 #582) solo lee la base; este flujo solo decide a dónde sigue la ejecución.
// ESPERA: el pre-vuelo contesta `esperar` y el flujo hace «Wait» de 5 min y vuelve a preguntarlo con la MISMA `corrida` (el reloj vive en la base: `plan_corridas.espera_desde`).
//   Diferencia declarada con §16.2 («re-disparo por webhook»): el re-disparo por webhook exigiría que el flujo se llamara a sí mismo con la llave de despacho de la sala;
//   un «Wait» por intervalo es lo mismo (cada tramo dura segundos), no copia ninguna llave y sobrevive a un reinicio de n8n. Si Lenovo prefiere el webhook, cambia SOLO `V9 · esperar`.
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const lf = (s) => String(s).split('\r\n').join('\n')
export const BASE = join(aqui, '..', 'finanzas-f4', 'plan-F4-finanzas-ARREGLADO-2026-10-14.json')
export const antesDeV9 = () => JSON.parse(lf(fs.readFileSync(BASE, 'utf8')).replace(/^﻿/, ''))

export const NODOS = { llave: '⓪ Llave · Webhook · planeacion', manual: '① Cargar el manual de marca', hook: 'Webhook · planeacion', cableRepetida: 'Cable · ¿volvió? · repetida', cablePlan: 'Cable · ¿volvió? · plan' }
export const V9 = {
  pide: 'V9 · ¿pide el pre-vuelo?',
  prevuelo: 'V9 · pre-vuelo',
  decidir: 'V9 · decidir',
  seguir: 'V9 · ¿seguir?',
  esperarSi: 'V9 · ¿esperar?',
  esperar: 'V9 · esperar',
  devolver: 'V9 · devolver el sobre',
  noCorrio: 'V9 · no corrió',
  avisarSi: 'V9 · ¿avisar?',
  aviso: 'V9 · aviso · #alertas',
  cable: 'V9 · cable de vuelta · no corrió',
  volvio: 'V9 · ¿volvió? · no corrió',
  armarCierre: 'V9 · armar el cierre',
  cerrarSi: 'V9 · ¿cerrar la corrida?',
  cerrar: 'V9 · cerrar la corrida',
}
export const NOMBRES_NUEVOS = Object.values(V9)
/** 5 min entre lecturas (= `CADA_REINTENTO_S` de V13) y tope de vueltas: 45 min / 5 = 9 lecturas + margen. Pasado el tope el flujo PARA y lo dice (nunca queda en bucle). */
export const ESPERA_S = 300
export const MAX_VUELTAS = 14
export const CANAL_ALERTAS = 'C0B7XUUEBHA'

const VERCEL = "($env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app')"
const HOOK = `($('${NODOS.hook}').first().json.body || {})`
const llaveInterna = { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }

// ── el código de los nodos (se prueba tal cual en __tests__/plan-v3-v9-nodos.test.ts)
export const CODIGO_DECIDIR = [
  '// V9 · la respuesta del pre-vuelo → a dónde sigue la ejecución. FALLA CERRADO: lo que no se entiende NUNCA es «seguir».',
  `const MAX_VUELTAS = ${MAX_VUELTAS}`,
  'const r = $input.first().json || {}',
  'const cuerpo = r.body && typeof r.body === "object" ? r.body : {}',
  'const http = Number(r.statusCode)',
  'const vuelta = Number($runIndex) || 0',
  'const base = { vuelta: vuelta, http: Number.isFinite(http) ? http : null }',
  '// sin respuesta, o una caída del servicio (5xx sin decisión): se reintenta unas veces y luego PARA',
  'if (!Number.isFinite(http) || (http >= 500 && !cuerpo.decision) || (http === 0)) {',
  '  if (vuelta + 1 < 3) return [{ json: Object.assign({ ruta: "esperar", motivo: "el pre-vuelo no contestó (se reintenta)" }, base) }]',
  '  return [{ json: Object.assign({ ruta: "parar", decision: "no_corre", motivo: "prevuelo_sin_respuesta", detalle: "el pre-vuelo no contestó en 3 intentos: no se corrió nada y no se gastó nada" }, base) }]',
  '}',
  'const d = String(cuerpo.decision || "")',
  'const comun = { decision: d || null, motivo: cuerpo.motivo || null, detalle: cuerpo.detalle || null, corrida: cuerpo.corrida || null, dry_run: cuerpo.dry_run === true, relleno_permitido: cuerpo.relleno_permitido === true, huecos_tipos: Array.isArray(cuerpo.huecos_tipos) ? cuerpo.huecos_tipos : [], declara: Array.isArray(cuerpo.declara) ? cuerpo.declara : [], sube_la_ficha_a: cuerpo.sube_la_ficha_a == null ? null : cuerpo.sube_la_ficha_a }',
  'if (http === 200 && (d === "correr" || d === "correr_con_lo_del_alta")) return [{ json: Object.assign({ ruta: "seguir" }, comun, base) }]',
  'if (http === 200 && d === "esperar") {',
  '  if (vuelta + 1 >= MAX_VUELTAS) return [{ json: Object.assign({ ruta: "parar" }, comun, base, { decision: "no_corre", motivo: "espera_excedida", detalle: "el flujo esperó más vueltas de las posibles; la corrida la libera el barrido" }) }]',
  `  return [{ json: Object.assign({ ruta: "esperar", reintentar_en_s: ${ESPERA_S} }, comun, base) }]`,
  '}',
  '// ya_en_marcha / terminada: otro re-disparo lleva la corrida o ya terminó → esta ejecución NO hace nada (un solo plan)',
  'return [{ json: Object.assign({ ruta: "parar" }, comun, base, { decision: d || "no_corre", motivo: comun.motivo || ("http_" + http) }) }]',
  '',
].join('\n')

export const CODIGO_DEVOLVER = [
  '// V9 · devuelve el sobre ORIGINAL (lo que recibe «① Cargar el manual de marca» no cambia): lo decidido queda en «' + V9.decidir + '».',
  "return $('" + NODOS.llave + "').all()",
  '',
].join('\n')

export const CODIGO_NO_CORRIO = [
  '// V9 · la ejecución termina aquí: NO se gastó nada. Los motivos benignos (otro re-disparo lleva la corrida, ya terminó) no avisan; el resto sí, con QUÉ HACER.',
  'const d = $input.first().json || {}',
  `const sobre = ${HOOK}`,
  'let nombre = sobre.client_id || "(cliente sin nombre)"',
  'try { nombre = ($("Ficha del cliente").first().json || {}).name || nombre } catch (e) { /* la ficha aún no se leyó: es lo normal aquí */ }',
  'const benigno = d.decision === "ya_en_marcha" || d.decision === "terminada" || d.motivo === "otro_re_disparo_gano"',
  'const QUE_HACER = {',
  '  falta_cupo: "Sube el tope de la ficha" + (d.sube_la_ficha_a ? " a " + d.sube_la_ficha_a : "") + " (spend_cap_usd) y vuelve a pedir el plan.",',
  '  techo_generico_insuficiente: "Subir la ficha NO lo arregla: la ficha solo BAJA el techo genérico. Espera a que pasen las 24 h o decide subir el techo genérico.",',
  '  sin_manual_vigente: "Falta el manual de marca vigente del cliente: sin él el plan no se escribe.",',
  '  sin_moneda: "Falta declarar la moneda del cliente (ficha o manual): sin ella la oficina no calcula dinero.",',
  '  cliente_inexistente: "No existe la ficha del cliente: créala (clients/upsert) y luego pide el plan.",',
  '  corrida_activa: "El cliente ya tiene una corrida del plan viva: espera a que termine (o a que el barrido la libere).",',
  '  catalogo_no_aplicado: "Las tablas del catálogo del plan v3 no están aplicadas todavía.",',
  '  catalogo_incompleto: "El catálogo del plan v3 está incompleto: falta una fila crítica.",',
  '  prevuelo_sin_respuesta: "El pre-vuelo no contestó: mira /api/planeacion/prevuelo antes de repetir.",',
  '  espera_excedida: "La espera pasó el tope de vueltas: el barrido libera la corrida; repite el pedido.",',
  '}',
  'const hacer = QUE_HACER[d.motivo] || "Mira el motivo y repite el pedido cuando se arregle."',
  'const L = []',
  'L.push("🛫 *Plan v3 · NO se corrió* — no se gastó nada.")',
  'L.push("")',
  'L.push("*Cliente:* " + nombre)',
  'L.push("*Motivo:* " + (d.motivo || d.decision || "sin motivo") + (d.detalle ? " — " + d.detalle : ""))',
  'L.push("")',
  'L.push("*Qué hacer:* " + hacer)',
  'return [{ json: {',
  '  corrio: false, decision: d.decision || null, motivo: d.motivo || null, corrida: sobre.corrida || d.corrida || null,',
  '  avisar: !benigno,',
  `  slack: benigno ? null : { channel: '${CANAL_ALERTAS}', text: L.join(String.fromCharCode(10)) },`,
  '} }]',
  '',
].join('\n')

export const CODIGO_VOLVIO = [
  '// V9 · el cable de vuelta NO puede ser mudo (mismo criterio que «' + NODOS.cableRepetida + '»): si la sala lo despachó y no se enteró, falla RUIDOSA.',
  'const r = $input.first().json || {}',
  'const volvio = r.ok === true',
  'let corr = null',
  `try { corr = ${HOOK}._sala_correlation_id || null } catch (e) { corr = null }`,
  'if (corr && !volvio) {',
  "  throw new Error('CABLE_DE_VUELTA_MUDO · la sala NO se entero de que la corrida no corrio · codigo ' + String(r.code || r.error || 'sin codigo'))",
  '}',
  "return [{ json: { cierre: 'no_corrio_prevuelo', vuelta_ok: volvio, vuelta_detalle: volvio ? (r.event_id || 'sin event_id') : (r.code || r.detail || r.error || 'sin respuesta de la sala'), despachado_por_la_sala: !!corr } }]",
  '',
].join('\n')

export const CODIGO_ARMAR_CIERRE = [
  '// V9 · al TERMINAR la corrida (plan entregado, o «repetida» ya sin gasto) se cierra la fila de `plan_corridas`. Si V9 no actuó (sin `plan_v3`), no hace nada.',
  `const sobre = ${HOOK}`,
  'const pide = sobre.plan_v3 === true && typeof sobre.corrida === "string" && sobre.corrida.length > 0 && typeof sobre.client_id === "string" && sobre.client_id.length > 0',
  'if (!pide) return [{ json: { aplica: false } }]',
  'let repetida = false',
  `try { $('${NODOS.cableRepetida}').first(); repetida = true } catch (e) { repetida = false }`,
  'return [{ json: { aplica: true, cuerpo: {',
  '  accion: "cerrar", client_id: sobre.client_id, corrida: sobre.corrida,',
  '  estado: repetida ? "fallida" : "hecha",',
  '  motivo: repetida ? "el cliente ya tenía un plan (corrida repetida): no se gastó" : "plan entregado",',
  '} } }]',
  '',
].join('\n')

const IF_BOOL = (expr) => ({ conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: `={{ ${expr} }}`, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }] }, options: {} })
const unaVezNodo = (copia, nombre) => { const x = copia.nodes.filter((n) => n.name === nombre); if (x.length !== 1) throw new Error(`${x.length} nodos «${nombre}»: el flujo cambió, se revisa el enganche`); return x[0] }

export function enganchaV9(antes) {
  const copia = JSON.parse(JSON.stringify(antes))
  for (const n of copia.nodes) if (NOMBRES_NUEVOS.includes(n.name)) throw new Error(`el flujo ya tiene «${n.name}»`)
  const llave = unaVezNodo(copia, NODOS.llave)
  unaVezNodo(copia, NODOS.manual)
  unaVezNodo(copia, NODOS.cablePlan)
  unaVezNodo(copia, NODOS.cableRepetida)
  const sal = copia.connections[NODOS.llave]?.main?.[0] ?? []
  if (sal.length !== 1 || sal[0].node !== NODOS.manual) throw new Error('«⓪ Llave» ya no va directo a «① Cargar el manual de marca»: el flujo cambió, se revisa el enganche')
  const [x, y] = llave.position
  const Y = 1120 // fila propia, debajo de todo lo que ya existe (la rama nueva corre al final del orden por posición)
  const pos = (i, fila = 0) => [x + 240 * i, Y + 220 * fila]
  const http = (name, position, extra) => ({ name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position, onError: 'continueRegularOutput', ...extra })
  const nuevos = [
    { parameters: IF_BOOL(`${HOOK}.plan_v3 === true && typeof ${HOOK}.corrida === 'string' && ${HOOK}.corrida.length > 0 && typeof ${HOOK}.client_id === 'string' && ${HOOK}.client_id.length > 0`), name: V9.pide, type: 'n8n-nodes-base.if', typeVersion: 2, position: pos(1) },
    http(V9.prevuelo, pos(2), {
      parameters: {
        method: 'POST', url: `={{ ${VERCEL} + '/api/planeacion/prevuelo' }}`, sendHeaders: true,
        headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }, llaveInterna] },
        sendBody: true, specifyBody: 'json',
        jsonBody: `={{ JSON.stringify((function () { const b = ${HOOK}; const o = { client_id: b.client_id, corrida: b.corrida }; if (b.dry_run !== undefined) o.dry_run = b.dry_run; return o })()) }}`,
        options: { timeout: 60000, response: { response: { fullResponse: true, neverError: true } } },
      },
    }),
    { parameters: { jsCode: CODIGO_DECIDIR }, name: V9.decidir, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(3) },
    { parameters: IF_BOOL(`$json.ruta === 'seguir'`), name: V9.seguir, type: 'n8n-nodes-base.if', typeVersion: 2, position: pos(4) },
    { parameters: { jsCode: CODIGO_DEVOLVER }, name: V9.devolver, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(5) },
    { parameters: IF_BOOL(`$json.ruta === 'esperar'`), name: V9.esperarSi, type: 'n8n-nodes-base.if', typeVersion: 2, position: pos(4, 1) },
    { parameters: { resume: 'timeInterval', amount: ESPERA_S, unit: 'seconds' }, name: V9.esperar, type: 'n8n-nodes-base.wait', typeVersion: 1.1, position: pos(5, 1), webhookId: 'v9-espera-prevuelo' },
    { parameters: { jsCode: CODIGO_NO_CORRIO }, name: V9.noCorrio, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(5, 2) },
    { parameters: IF_BOOL('$json.avisar === true'), name: V9.avisarSi, type: 'n8n-nodes-base.if', typeVersion: 2, position: pos(6, 2) },
    http(V9.aviso, pos(7, 2), {
      parameters: {
        method: 'POST', url: 'https://slack.com/api/chat.postMessage', sendHeaders: true,
        headerParameters: { parameters: [{ name: 'Authorization', value: '=Bearer {{ $env.SLACK_BOT_TOKEN }}' }, { name: 'Content-Type', value: 'application/json; charset=utf-8' }] },
        sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.slack) }}', options: { timeout: 60000 },
      },
    }),
    http(V9.cable, pos(8, 2), {
      parameters: {
        method: 'POST', url: "={{ $env.SALA_CALLBACK_URL || 'https://zero-risk-platform.vercel.app/api/sala/callback' }}", sendHeaders: true,
        headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-api-key', value: '={{ $env.SALA_CALLBACK_API_KEY || $env.INTERNAL_API_KEY }}' }, { name: 'x-source', value: 'n8n-planeacion-X9F0zp6LQ2xGEYVS' }] },
        sendBody: true, contentType: 'json', specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({ event_type: 'run_completed', worker_id: 'X9F0zp6LQ2xGEYVS', worker_name: 'planeacion', resultado: 'no_corrio_prevuelo', motivo: $('${V9.noCorrio}').first().json.motivo ?? null, client_id: ${HOOK}.client_id ?? null, tenant_id: ${HOOK}.tenant_id ?? ${HOOK}.client_id ?? null, _sala_correlation_id: ${HOOK}._sala_correlation_id ?? null, _journey_id: ${HOOK}._journey_id ?? null, ts: new Date().toISOString() }) }}`,
        options: { timeout: 60000 },
      },
    }),
    { parameters: { jsCode: CODIGO_VOLVIO }, name: V9.volvio, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(9, 2) },
    { parameters: { jsCode: CODIGO_ARMAR_CIERRE }, name: V9.armarCierre, type: 'n8n-nodes-base.code', typeVersion: 2, position: [2700, Y + 440] },
    { parameters: IF_BOOL('$json.aplica === true'), name: V9.cerrarSi, type: 'n8n-nodes-base.if', typeVersion: 2, position: [2940, Y + 440] },
    http(V9.cerrar, [3180, Y + 440], {
      parameters: {
        method: 'POST', url: `={{ ${VERCEL} + '/api/planeacion/corrida' }}`, sendHeaders: true,
        headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }, llaveInterna] },
        sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.cuerpo) }}',
        options: { timeout: 30000, response: { response: { fullResponse: true, neverError: true } } },
      },
    }),
  ]
  copia.nodes.push(...nuevos)
  const enlace = (de, a, i = 0) => { copia.connections[de] = copia.connections[de] || { main: [] }; while (copia.connections[de].main.length <= i) copia.connections[de].main.push([]); copia.connections[de].main[i].push({ node: a, type: 'main', index: 0 }) }
  copia.connections[NODOS.llave].main[0] = [{ node: V9.pide, type: 'main', index: 0 }]
  enlace(V9.pide, V9.prevuelo, 0)      // pide el pre-vuelo
  enlace(V9.pide, NODOS.manual, 1)     // NO lo pide: DIRECTO a «① Cargar el manual» (idéntico a hoy)
  enlace(V9.prevuelo, V9.decidir)
  enlace(V9.decidir, V9.seguir)
  enlace(V9.seguir, V9.devolver, 0)
  enlace(V9.devolver, NODOS.manual)
  enlace(V9.seguir, V9.esperarSi, 1)
  enlace(V9.esperarSi, V9.esperar, 0)
  enlace(V9.esperar, V9.prevuelo)      // el bucle: la MISMA corrida, otra lectura
  enlace(V9.esperarSi, V9.noCorrio, 1)
  enlace(V9.noCorrio, V9.avisarSi)
  enlace(V9.avisarSi, V9.aviso, 0)
  enlace(V9.avisarSi, V9.cable, 1)
  enlace(V9.aviso, V9.cable)
  enlace(V9.cable, V9.volvio)
  // el cierre de la corrida cuelga de los dos finales que ya existen (plan entregado · repetida), como ÚLTIMA salida de cada uno
  enlace(NODOS.cablePlan, V9.armarCierre)
  enlace(NODOS.cableRepetida, V9.armarCierre)
  enlace(V9.armarCierre, V9.cerrarSi)
  enlace(V9.cerrarSi, V9.cerrar, 0)
  return copia
}

// ── CLI: escribe el ARREGLADO (la base queda en el repo como `planeacion-F4-finanzas-ARREGLADO-2026-10-14.json`)
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = process.argv.find((a) => a.startsWith('--salida='))
  const salida = arg ? arg.slice('--salida='.length) : aqui
  const despues = enganchaV9(antesDeV9())
  const ruta = join(salida, 'plan-V9-prevuelo-ARREGLADO-2026-10-15.json')
  fs.writeFileSync(ruta, JSON.stringify(despues, null, 2))
  console.log(`plan · ${despues.nodes.length} nodos (+${NOMBRES_NUEVOS.length}) → ${ruta}`)
}
