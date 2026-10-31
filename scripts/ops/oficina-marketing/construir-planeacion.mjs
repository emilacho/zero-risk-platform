/**
 * T5 · paso 4 · la PLANEACIÓN (`X9F0zp6LQ2xGEYVS` · webhook `zero-risk/planeacion`) para el nuevo orden.
 *   node scripts/ops/oficina-marketing/construir-planeacion.mjs        · escribe nuevo/X9F0zp6LQ2xGEYVS.json
 * Qué cambia (y SOLO esto):
 *   A · `parar_en` (condición 2 de CC3): el cuerpo del disparo puede traer `parar_en: 'guardar_plan'`; la corrida se detiene justo DESPUÉS de «Guardar el plan» (el plan queda guardado) y no sigue a la jefatura, al PDF ni al brief.
 *       Ausente (o null) el flujo es el de hoy. Cualquier otro valor se rechaza en «⓪ Llave» ANTES de gastar nada.
 *   B · el REDACTOR DEL PLAN es un dato: `cadena_config.planeacion = { redactor, indicacion }`. Dos nodos nuevos después de «Redactor (B4)» lo leen:
 *       sin fila o sin `redactor` ⇒ `campaign-brief-agent` y el pedido sin tocar (lo de hoy); con `indicacion` ⇒ va ANTES del pedido. Un slug mal formado o una lectura que falla DETIENEN (no se cae al agente viejo en silencio).
 *       Los CUATRO nodos que tenían el nombre pegado («Pedir el plan al redactor», «Guardar el plan», «JEF · plan · armar B», «JEF · plan · armar C») lo leen de ahí: el rótulo `producing_agent` es el redactor REAL.
 *   C · el brazo «INFORME DE MERCADO» (paso 0 del plan · ruta `/api/planeacion/brazo/mercado` de CC1): `elegir brazos` lo pide SOLO si el disparo trae `con_mercado: true` (ausente = el flujo de hoy, sin gasto nuevo; otro valor se rechaza en «⓪ Llave»).
 *       Rama nueva `Brazo · mercado` → `firma de la rama · mercado` → 4.ª entrada de la junta. Su material viaja como PROPUESTA (rótulo + `es_dato_del_cliente:false` los pone la ruta; la junta y el redactor lo leen genérico).
 *   D · el VALIDADOR DE FORMA del plan (ruta `/api/planeacion/validar-plan` de CC1): entre «¿Hay plan?» y «Guardar el plan», SOLO si el disparo trae `validar_forma: true` (ausente = el flujo de hoy; otro valor se rechaza en «⓪ Llave»).
 *       ok → guarda. (la 2.ª vez sin forma queda guardada como BORRADOR MARCADO `forma_invalida`, no se pierde) No ok la 1.ª vez → UN reintento al redactor con `correccion` pegada al final del pedido (con `force_restart`: sin él el corredor devuelve la respuesta vieja). No ok la 2.ª vez → alerta en Slack + `necesita_humano` y NO se guarda ni sigue.
 *       Una validación que no se pudo leer DETIENE (no se lee un error como «el plan está bien»).
 */
import { agregarNodo, cambiarCodigo, codigo, conectar, escribirNuevo, http, leerVivo, nodo, redirigir, si } from './lib.mjs'

const ID = 'X9F0zp6LQ2xGEYVS'
const AGENTE_DE_HOY = 'campaign-brief-agent'
export const SLUG = '^[a-z0-9][a-z0-9_-]{1,63}$'

export const CODIGO_ELEGIR = `// REDACTOR · ELEGIR · el agente que escribe el plan es un DATO (cadena_config.planeacion = { redactor, indicacion }), no un nombre pegado en cuatro nodos.
// Sin fila o sin redactor ⇒ el de hoy y el pedido SIN tocar. Un slug mal formado o una lectura que falla DETIENEN: nunca se cae "por si acaso" a otro agente (gastaría con quien nadie eligió).
const b4 = $('Redactor (B4)').last().json
const r = $input.first().json || {}
if (r.error && typeof r.error === 'object') throw new Error('PLANEACION_REDACTOR_NO_LEGIBLE · la lectura de cadena_config falló antes de recibir respuesta (' + String(r.error.message || r.error.name || 'sin detalle').slice(0, 160) + ') · se DETIENE antes de gastar')
const status = Number(r.statusCode)
if (status !== 200) throw new Error('PLANEACION_REDACTOR_NO_LEGIBLE · cadena_config contestó ' + status + ' · se DETIENE antes de gastar')
const filas = Array.isArray(r.body) ? r.body : []
const v = filas.length && filas[0] && typeof filas[0].valor === 'object' && filas[0].valor !== null && !Array.isArray(filas[0].valor) ? filas[0].valor : {}
const redactor = v.redactor === undefined || v.redactor === null || v.redactor === '' ? '${AGENTE_DE_HOY}' : v.redactor
if (typeof redactor !== 'string' || !/${SLUG}/.test(redactor)) throw new Error('PLANEACION_REDACTOR_INVALIDO · cadena_config.planeacion.redactor debe ser un slug de agente (' + JSON.stringify(redactor).slice(0, 80) + ') · se DETIENE antes de gastar')
const indicacion = typeof v.indicacion === 'string' && v.indicacion.trim() ? v.indicacion.trim() : ''
return [{ json: { ...b4, redactor_elegido: redactor, indicacion_elegida: indicacion || null, pedido: indicacion ? indicacion + '\\n\\n' + b4.pedido : b4.pedido } }]
`

export const CODIGO_PARADO = `// PARAR · RESUMEN · la corrida pidió detenerse después de «Guardar el plan» (parar_en = guardar_plan): el plan YA quedó guardado; no sigue la jefatura, ni el PDF, ni el brief.
const g = $input.first().json || {}
const fila = Array.isArray(g) ? g[0] : (Array.isArray(g.body) ? g.body[0] : (g.body || g))
return [{ json: { parado_en: 'guardar_plan', plan_guardado_id: fila && fila.id ? fila.id : null, redactor: (function () { try { return $('Redactor · elegir').last().json.redactor_elegido || null } catch (e) { return null } })() } }]
`

const LEER_CONFIG = {
  name: 'Redactor · leer la elección', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
  parameters: {
    method: 'GET',
    url: "={{ ($env.SUPABASE_URL || $env.NEXT_PUBLIC_SUPABASE_URL) }}/rest/v1/cadena_config?clave=eq.planeacion&select=valor",
    sendHeaders: true,
    headerParameters: { parameters: [{ name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_ROLE_KEY }}' }, { name: 'Authorization', value: '=Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}' }] },
    options: { timeout: 20000, response: { response: { fullResponse: true, neverError: true } } },
  },
}

const ELEGIDO = "$('Redactor · elegir').last().json.redactor_elegido"

export const MERCADO_PEDIR = `// T5 · INFORME DE MERCADO (paso 0 del plan): se pide SOLO si el disparo trae con_mercado === true · ausente = el flujo de hoy (no sale pedido ni gasto). Sin rubro en la ficha el propio brazo contesta sin_respuesta (no se inventa).
let con_mercado = false;
try { con_mercado = $('Webhook · planeacion').first().json.body.con_mercado === true; } catch (e) { con_mercado = false; }
if (con_mercado) pedir('mercado', 'informe_mercado');
`

function construirMercado(f) {
  cambiarCodigo(f, 'elegir brazos', "pedir('posthog', 'analitica_propia');", "pedir('posthog', 'analitica_propia');\n\n" + MERCADO_PEDIR)
  const base = structuredClone(nodo(f, 'Brazo · PostHog'))
  delete base.id
  delete base.position
  base.name = 'Brazo · mercado'
  base.parameters.url = base.parameters.url.replace('/brazo/posthog', '/brazo/mercado')
  base.parameters.jsonBody = base.parameters.jsonBody.replaceAll('"posthog"', '"mercado"')
  if (base.parameters.url.includes('posthog') || base.parameters.jsonBody.includes('posthog')) throw new Error('«Brazo · PostHog» trae más "posthog" de lo previsto: ¿cambió el vivo?')
  agregarNodo(f, base, 'Brazo · cerebro', 0, 100)
  const firma = nodo(f, 'firma de la rama · posthog').parameters.jsCode
  if (!firma.includes("const BRAZO = 'posthog';")) throw new Error('la firma de posthog ya no trae BRAZO fijo')
  agregarNodo(f, codigo('firma de la rama · mercado', firma.replace("const BRAZO = 'posthog';", "const BRAZO = 'mercado';").replace('// firma de la rama · posthog ·', '// firma de la rama · mercado ·')), 'firma de la rama · posthog', 0, 200)
  conectar(f, 'elegir brazos', 'Brazo · mercado')
  conectar(f, 'Brazo · mercado', 'firma de la rama · mercado')
  const junta = nodo(f, 'Junta · esperar los 3 brazos')
  if (junta.parameters.numberInputs !== 3) throw new Error('la junta ya no tiene 3 entradas')
  junta.parameters.numberInputs = 4
  f.connections['firma de la rama · mercado'] = { main: [[{ node: 'Junta · esperar los 3 brazos', type: 'main', index: 3 }]] }
}

export const CODIGO_VALIDAR = `// VALIDAR · ¿QUÉ DIJO? · la puerta de CC1 mira SOLO la forma del plan (calendario fechado · meta por semana · canales · sin cifras ",77"). El fondo sigue en el chequeo de «¿Llegó la vuelta?» y en la jefatura.
// ok → el plan pasa INTACTO a «Guardar el plan» · no ok la 1.ª vez ($runIndex 0) → UN reintento con la corrección pegada al pedido · no ok la 2.ª → fallo (alerta + necesita_humano).
// 🔴 una validación que NO se pudo leer (red, 4xx/5xx, forma rara) DETIENE: nunca se lee como «el plan está bien».
const plan = $('¿Llegó la vuelta?').last().json
const r = $input.first().json || {}
if (r.error && typeof r.error === 'object') throw new Error('PLAN_VALIDADOR_NO_LEGIBLE · la llamada falló antes de recibir respuesta (' + String(r.error.message || r.error.name || 'sin detalle').slice(0, 160) + ') · se DETIENE · el plan sigue en esta corrida')
const status = Number(r.statusCode)
const b = r.body && typeof r.body === 'object' ? r.body : {}
if (status !== 200 || typeof b.ok !== 'boolean') throw new Error('PLAN_VALIDADOR_NO_LEGIBLE · el validador contestó ' + status + ' · ' + String(b.error || 'sin detalle').slice(0, 160) + ' · se DETIENE · el plan sigue en esta corrida')
const intento = $runIndex + 1
if (b.ok) return [{ json: Object.assign({}, plan, { veredicto: 'ok', validacion_forma: { ok: true, intentos: intento } }) }]
const hallazgos = Array.isArray(b.hallazgos) ? b.hallazgos : []
if (intento === 1) {
  const base = $('Redactor · elegir').last().json
  const correccion = typeof b.correccion === 'string' && b.correccion.trim() ? b.correccion.trim() : ''
  if (!correccion) throw new Error('PLAN_VALIDADOR_NO_LEGIBLE · el validador dijo que el plan no tiene forma pero no trajo la corrección · se DETIENE')
  return [{ json: Object.assign({}, base, { veredicto: 'reintentar', reintento_forma: true, pedido: base.pedido + '\\n\\n' + correccion, hallazgos: hallazgos }) }]
}
return [{ json: { veredicto: 'fallo', hallazgos: hallazgos, intentos: intento, client_id: plan.client_id || null, client_name: plan.client_name || null, caracteres: plan.caracteres || 0 } }]
`

export const CODIGO_ALERTA_FORMA = `// VALIDAR · ARMAR LA ALERTA · el plan volvió sin forma DOS veces (1 reintento gastado) · quedó guardado como BORRADOR MARCADO (necesita_humano) y no sigue a jefatura/PDF/brief
const v = $('Validar · ¿qué dijo?').last().json
const g = $input.first().json || {}
const fila = Array.isArray(g.body) ? g.body[0] : g.body
const id = Number(g.statusCode) >= 200 && Number(g.statusCode) < 300 && fila && fila.id ? fila.id : null
const lista = (v.hallazgos || []).slice(0, 8).map((h) => '  - ' + String(h.que || '?') + (h.donde ? ' (' + String(h.donde).slice(0, 80) + ')' : '')).join('\\n') || '  - (sin detalle)'
const dondeEsta = id
  ? 'quedó guardado como BORRADOR MARCADO (forma_invalida) con id ' + String(id).slice(0, 8) + '… en client_historical_outputs · NO siguió a la jefatura, al PDF ni al brief'
  : '🔴 NO se pudo guardar (' + g.statusCode + ') · el texto está SOLO en esta corrida de n8n (nodo «¿Llegó la vuelta?») · cópialo antes de que caduque el historial (~4 h)'
return [{ json: { texto: ':rotating_light: *Plan sin forma* — el redactor devolvió el plan sin la forma pedida DOS veces; la corrida de planeación se detuvo.\\n' +
  '• cliente: \`' + String(v.client_name || v.client_id || '?') + '\`\\n' +
  '• plan: ' + v.caracteres + ' caracteres · ' + dondeEsta + '\\n' +
  '• qué le falta:\\n' + lista + '\\n' +
  '*Qué hacer:* necesita_humano · NO repagues el raspado: reusa el pedido de «Redactor (B4)».', necesita_humano: true, plan_guardado_id: id, hallazgos: v.hallazgos || [] } }]
`

export const CODIGO_RESUMEN_FORMA = `// VALIDAR · RESUMEN · la corrida termina acá: el plan sin forma espera a una persona
const a = $('Validar · armar la alerta').last().json
return [{ json: { parado_en: 'validar_forma', necesita_humano: true, plan_guardado_id: a.plan_guardado_id || null, hallazgos: a.hallazgos || [] } }]
`

function construirValidador(f) {
  const ruta = '={{ $env.ZERO_RISK_API_URL || "https://zero-risk-platform.vercel.app" }}/api/planeacion/validar-plan'
  agregarNodo(f, si('Validar · ¿se pide?', "={{ (function () { try { return $('Webhook · planeacion').first().json.body.validar_forma === true } catch (e) { return false } })() }}"), 'Guardar el plan', -220, 0)
  agregarNodo(f, http('Validar · pedir', ruta, [{ name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }, { name: 'Content-Type', value: 'application/json' }],
    "={{ JSON.stringify({ texto: $('¿Llegó la vuelta?').last().json.texto, workflow_id: $workflow.id, workflow_execution_id: $execution.id }) }}", 30000), 'Guardar el plan', -220, 160)
  agregarNodo(f, codigo('Validar · ¿qué dijo?', CODIGO_VALIDAR), 'Guardar el plan', -220, 320)
  agregarNodo(f, si('Validar · ¿pasó?', '={{ $json.veredicto }}', 'ok', 'equals', 'string'), 'Guardar el plan', -220, 480)
  agregarNodo(f, si('Validar · ¿reintenta?', '={{ $json.veredicto }}', 'reintentar', 'equals', 'string'), 'Guardar el plan', -220, 640)
  // el plan sin forma 2 veces NO se pierde: queda guardado como borrador marcado (la corrida de n8n conserva solo ~4 h)
  const borrador = structuredClone(nodo(f, 'Guardar el plan'))
  delete borrador.id
  delete borrador.position
  borrador.name = 'Validar · guardar borrador'
  const cuerpo = borrador.parameters.jsonBody
  const A = "content: $json.texto, content_text: $json.texto,"
  const B = "provenance_tag: { fuente: 'planeacion',"
  if (cuerpo.split(A).length !== 2 || cuerpo.split(B).length !== 2) throw new Error('«Guardar el plan» ya no tiene la forma esperada')
  borrador.parameters.jsonBody = cuerpo
    .replace('client_id: $json.client_id,', () => "client_id: $('Validar · ¿qué dijo?').last().json.client_id,")
    .replace(A, () => "content: $('¿Llegó la vuelta?').last().json.texto, content_text: $('¿Llegó la vuelta?').last().json.texto,")
    .replace(`producing_agent: '${AGENTE_DE_HOY}'`, () => `producing_agent: ${ELEGIDO}`)
    .replace('registro_interno: $json.registro_interno || null, estado_del_plan: $json.estado_del_plan || null, pendientes: $json.pendientes || null', () => "estado_del_plan: 'forma_invalida'")
    .replace('caracteres: $json.caracteres,', () => "caracteres: $('Validar · ¿qué dijo?').last().json.caracteres,")
    .replace(B, () => "provenance_tag: { forma_invalida: true, necesita_humano: true, hallazgos: $('Validar · ¿qué dijo?').last().json.hallazgos, fuente: 'planeacion',")
  agregarNodo(f, borrador, 'Guardar el plan', -220, 720)
  agregarNodo(f, codigo('Validar · armar la alerta', CODIGO_ALERTA_FORMA), 'Guardar el plan', -220, 800)
  const campana = structuredClone(nodo(f, 'Campana · plan sin PDF'))
  delete campana.id
  delete campana.position
  campana.name = 'Validar · alerta'
  agregarNodo(f, campana, 'Guardar el plan', -220, 960)
  agregarNodo(f, codigo('Validar · resumen', CODIGO_RESUMEN_FORMA), 'Guardar el plan', -220, 1120)
  redirigir(f, '¿Hay plan?', 'Guardar el plan', 'Validar · ¿se pide?')
  conectar(f, 'Validar · ¿se pide?', 'Validar · pedir', 0)
  conectar(f, 'Validar · ¿se pide?', 'Guardar el plan', 1)
  conectar(f, 'Validar · pedir', 'Validar · ¿qué dijo?')
  conectar(f, 'Validar · ¿qué dijo?', 'Validar · ¿pasó?')
  conectar(f, 'Validar · ¿pasó?', 'Guardar el plan', 0)
  conectar(f, 'Validar · ¿pasó?', 'Validar · ¿reintenta?', 1)
  conectar(f, 'Validar · ¿reintenta?', 'Pedir el plan al redactor', 0)
  conectar(f, 'Validar · ¿reintenta?', 'Validar · guardar borrador', 1)
  conectar(f, 'Validar · guardar borrador', 'Validar · armar la alerta')
  conectar(f, 'Validar · armar la alerta', 'Validar · alerta')
  conectar(f, 'Validar · alerta', 'Validar · resumen')
  // el reintento fuerza el reinicio: sin force_restart el corredor devuelve la respuesta vieja
  const pedir = nodo(f, 'Pedir el plan al redactor')
  const fr = 'force_restart: ('
  if (pedir.parameters.jsonBody.split(fr).length !== 2) throw new Error('«Pedir el plan al redactor» ya no trae force_restart una sola vez')
  pedir.parameters.jsonBody = pedir.parameters.jsonBody.replace(fr, () => 'force_restart: ($json.reintento_forma === true) || (')
}

export function construirPlaneacion() {
  const f = leerVivo(ID)
  // A · parar_en
  cambiarCodigo(f, '⓪ Llave · Webhook · planeacion', 'return $input.all()',
    "// T5 · parar_en: el único valor admitido es 'guardar_plan' (parar justo después de guardar el plan); cualquier otro se rechaza ANTES de gastar. Ausente = el flujo de hoy.\nconst pe = w.body && typeof w.body === 'object' ? w.body.parar_en : undefined\nif (pe !== undefined && pe !== null && pe !== 'guardar_plan') throw new Error('PLANEACION_PARAR_EN_INVALIDO · parar_en solo admite \"guardar_plan\" (llegó ' + JSON.stringify(pe).slice(0, 60) + ') · se DETIENE antes de gastar')\n// T5 · con_mercado: pide el informe de mercado (gasta hasta el tope de esa ruta) · solo true/false/ausente; otro valor se rechaza ANTES de gastar\nconst cm = w.body && typeof w.body === 'object' ? w.body.con_mercado : undefined\nif (cm !== undefined && cm !== null && typeof cm !== 'boolean') throw new Error('PLANEACION_CON_MERCADO_INVALIDO · con_mercado solo admite true o false (llegó ' + JSON.stringify(cm).slice(0, 60) + ') · se DETIENE antes de gastar')\n// T5 · validar_forma: pasa el plan por el validador de forma (US$ 0) antes de guardarlo · solo true/false/ausente\nconst vf = w.body && typeof w.body === 'object' ? w.body.validar_forma : undefined\nif (vf !== undefined && vf !== null && typeof vf !== 'boolean') throw new Error('PLANEACION_VALIDAR_FORMA_INVALIDO · validar_forma solo admite true o false (llegó ' + JSON.stringify(vf).slice(0, 60) + ') · se DETIENE antes de gastar')\nreturn $input.all()")
  agregarNodo(f, si('Parar · ¿corta aquí?', "={{ (function () { try { return $('Webhook · planeacion').first().json.body.parar_en } catch (e) { return null } })() }}", 'guardar_plan', 'equals', 'string'), 'Guardar el plan', 220, 0)
  agregarNodo(f, codigo('Parar · resumen', CODIGO_PARADO), 'Guardar el plan', 440, -120)
  redirigir(f, 'Guardar el plan', 'JEF · armar', 'Parar · ¿corta aquí?')
  conectar(f, 'Parar · ¿corta aquí?', 'Parar · resumen', 0)
  conectar(f, 'Parar · ¿corta aquí?', 'JEF · armar', 1)
  // C · el brazo de mercado
  construirMercado(f)
  // D · el validador de forma
  construirValidador(f)
  // B · el redactor es un dato
  agregarNodo(f, structuredClone(LEER_CONFIG), 'Redactor (B4)', 220, 0)
  agregarNodo(f, codigo('Redactor · elegir', CODIGO_ELEGIR), 'Redactor (B4)', 440, 0)
  redirigir(f, 'Redactor (B4)', 'Pedir el plan al redactor', 'Redactor · leer la elección')
  conectar(f, 'Redactor · leer la elección', 'Redactor · elegir')
  conectar(f, 'Redactor · elegir', 'Pedir el plan al redactor')
  // los cuatro nodos con el nombre pegado
  const pedir = nodo(f, 'Pedir el plan al redactor')
  const a = `agent: '${AGENTE_DE_HOY}'`
  if (!pedir.parameters.jsonBody.includes(a)) throw new Error('«Pedir el plan al redactor» ya no trae el nombre pegado: ¿cambió el vivo?')
  pedir.parameters.jsonBody = pedir.parameters.jsonBody.replace(a, 'agent: $json.redactor_elegido')
  const guardar = nodo(f, 'Guardar el plan')
  const b = `producing_agent: '${AGENTE_DE_HOY}'`
  if (!guardar.parameters.jsonBody.includes(b)) throw new Error('«Guardar el plan» ya no trae el nombre pegado')
  guardar.parameters.jsonBody = guardar.parameters.jsonBody.replace(b, `producing_agent: ${ELEGIDO}`)
  for (const n of ['JEF · plan · armar B', 'JEF · plan · armar C']) cambiarCodigo(f, n, b, `producing_agent: ${ELEGIDO}`)
  return f
}

if (process.argv[1] && process.argv[1].endsWith('construir-planeacion.mjs')) console.log(escribirNuevo(construirPlaneacion()))
