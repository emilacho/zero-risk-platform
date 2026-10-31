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
 * NO incluye el validador de forma del plan (`validador-plan.ts`, de CC1 · todavía no entregado).
 */
import { agregarNodo, cambiarCodigo, codigo, conectar, escribirNuevo, leerVivo, nodo, redirigir, si } from './lib.mjs'

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

export function construirPlaneacion() {
  const f = leerVivo(ID)
  // A · parar_en
  cambiarCodigo(f, '⓪ Llave · Webhook · planeacion', 'return $input.all()',
    "// T5 · parar_en: el único valor admitido es 'guardar_plan' (parar justo después de guardar el plan); cualquier otro se rechaza ANTES de gastar. Ausente = el flujo de hoy.\nconst pe = w.body && typeof w.body === 'object' ? w.body.parar_en : undefined\nif (pe !== undefined && pe !== null && pe !== 'guardar_plan') throw new Error('PLANEACION_PARAR_EN_INVALIDO · parar_en solo admite \"guardar_plan\" (llegó ' + JSON.stringify(pe).slice(0, 60) + ') · se DETIENE antes de gastar')\n// T5 · con_mercado: pide el informe de mercado (gasta hasta el tope de esa ruta) · solo true/false/ausente; otro valor se rechaza ANTES de gastar\nconst cm = w.body && typeof w.body === 'object' ? w.body.con_mercado : undefined\nif (cm !== undefined && cm !== null && typeof cm !== 'boolean') throw new Error('PLANEACION_CON_MERCADO_INVALIDO · con_mercado solo admite true o false (llegó ' + JSON.stringify(cm).slice(0, 60) + ') · se DETIENE antes de gastar')\nreturn $input.all()")
  agregarNodo(f, si('Parar · ¿corta aquí?', "={{ (function () { try { return $('Webhook · planeacion').first().json.body.parar_en } catch (e) { return null } })() }}", 'guardar_plan', 'equals', 'string'), 'Guardar el plan', 220, 0)
  agregarNodo(f, codigo('Parar · resumen', CODIGO_PARADO), 'Guardar el plan', 440, -120)
  redirigir(f, 'Guardar el plan', 'JEF · armar', 'Parar · ¿corta aquí?')
  conectar(f, 'Parar · ¿corta aquí?', 'Parar · resumen', 0)
  conectar(f, 'Parar · ¿corta aquí?', 'JEF · armar', 1)
  // C · el brazo de mercado
  construirMercado(f)
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
