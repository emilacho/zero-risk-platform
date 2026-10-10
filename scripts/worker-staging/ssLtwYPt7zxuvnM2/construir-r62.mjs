// Relevo 62 · el MANUAL en el ORIGEN (Lenovo, firma «tras la prueba desde cero (tramo 1)»). Desde la raíz del repo:
//   node scripts/worker-staging/ssLtwYPt7zxuvnM2/construir-r62.mjs
// Parte de los respaldos ANTES (el flujo vivo del 10-oct a las 18:5x) y escribe los ARREGLADOS · NO toca n8n (eso lo hace n8n-flujo.mjs restaurar --ejecutar).
//   CIMIENTO ssLtwYPt7zxuvnM2
//     1) «[BB] Fan-out prep»: las tres lentes reciben las REGLAS DE EVIDENCIA (las mismas del descubridor) y la lente del eslogan (editor-en-jefe)
//        recibe además la FRASE PROPIA que halló el código, con la orden de ponerla TAL CUAL como primera opción de `tagline_opciones`.
//        El tope del pedido sube lo MISMO que crecen las reglas y la frase: la evidencia que cede (apify_sources → materia_cliente → …) no cede ni un carácter más.
//     2) nodo NUEVO «[BB] Sacar lo sin fuente (antes del Promote)» entre «Piso visual» y «Promote prep»: llama a /api/manual/recomprobar (la puerta de M2, sin duplicarla)
//        con `sin_manual_previo` y `sin_eslogan`; lo que no tiene fuente SALE del manual antes de guardarlo y lo sacado va SOLO al registro interno
//        (client_historical_outputs · provenance_tag.registro_interno · NUNCA bandeja ni Slack). Si la ruta no contesta, el manual sigue y lo DECLARA (`_sacar`).
//   LAZO A kSSAvCbEfHs2Hoa0
//     3) «[BBA] Re-síntesis prep» (el que reescribe positioning/icp_summary) recibe las mismas reglas; el tope sube lo mismo.
// NO escribe el eslogan por código · NO enciende nada (los dos flujos siguen inactivos).
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
export const FANOUT = '[BB] Fan-out prep'
export const PISO = '[BB] Piso visual (antes del Promote · CC#1)'
export const PROMOTE_PREP = '[BB] Promote prep'
export const SACAR = '[BB] Sacar lo sin fuente (antes del Promote)'
export const RESINTESIS = '[BBA] Re-síntesis prep'

/** las reglas del descubridor (relevo 51), en español y con «único» · texto de la tarea, no identidad · agnóstico de industria */
export const REGLAS_EVIDENCIA =
  '\n\nREGLAS DE EVIDENCIA (obligatorias): ' +
  '(1) Cada afirmación sobre el cliente lleva su cita literal y de dónde salió; si no hay cita, NO la escribas. Lo que el cliente dice de sí mismo se escribe «el cliente dice: «cita»», NUNCA como hecho comprobado. ' +
  '(2) Las palabras que suben la certeza (origen, verificable, trazabilidad, denominación, certificado, garantizado, único, primero, mejor, ningún competidor) solo pueden aparecer si esa misma palabra o su verificación está en una fuente primaria (el sitio del cliente, su propio perfil social, su propia ficha de mapas). ' +
  '(3) Separa cada lugar por su PAPEL: sede, zona de reparto, origen del producto, mercado. Un lugar que es solo donde está el negocio NUNCA es el origen del producto. ' +
  '(4) No inventes cifras, locales, facturación ni comparaciones con competidores que no estén en la EVIDENCIA; si falta el dato, déjalo fuera o escríbelo «PENDIENTE: …». ' +
  '(5) Un resumen de agente es una síntesis, no una fuente: no lo cites como evidencia.'

/** tope de la frase propia que viaja en la tarea (una frase de marca; lo demás se corta y se declara arriba, en la materia) */
export const TOPE_FRASE = 300

const lf = (s) => String(s ?? '').replace(/\r\n/g, '\n')
function cambia(codigo, a, b, donde) {
  const c = lf(codigo)
  const n = c.split(a).length - 1
  if (n !== 1) throw new Error(`${donde}: el ancla aparece ${n} veces (esperaba 1): ${a.slice(0, 80)}`)
  return c.replace(a, b)
}
const nodo = (f, nombre) => { const n = f.nodes.find((x) => x.name === nombre); if (!n) throw new Error(`no encontré «${nombre}»`); return n }

// ───────────────────────── 1 · Fan-out prep
export function construirFanout(codigoAntes) {
  if (lf(codigoAntes).includes('REGLAS_EVIDENCIA_R62')) throw new Error('Fan-out prep ya trae r62 · no construir dos veces')
  let c = codigoAntes
  // las constantes, ANTES de _PROSA (grounding ya existe en ese punto)
  c = cambia(c, 'const _PROSA =',
    `// r62 (CC#1 2026-10-10) · REGLAS DE EVIDENCIA + FRASE PROPIA al cimiento (tramo 1: el origen fabricado y el eslogan perdido volvían en cada cliente nuevo).
// Las reglas viajan en la PROSA que comparten las tres lentes; la frase propia solo a la lente dueña de la casilla del eslogan (editor-en-jefe).
// El tope del pedido sube EXACTAMENTE lo que suman: la evidencia no cede un carácter más por esto (y queda bajo el techo de 16.000 del corredor).
const REGLAS_EVIDENCIA_R62 = ${JSON.stringify(REGLAS_EVIDENCIA)};
const _mc62 = (grounding.materia_cliente && typeof grounding.materia_cliente === 'object') ? grounding.materia_cliente : {};
const _frase62 = (_mc62.estado_frase_propia === 'hallado' && typeof _mc62.frase_propia === 'string') ? _mc62.frase_propia.replace(/\\s+/g, ' ').trim().slice(0, ${TOPE_FRASE}) : '';
const _FRASE_EJ_R62 = _frase62
  ? '\\n\\nFRASE PROPIA DEL CLIENTE (la halló el código, literal, en su sitio y su perfil social): «' + _frase62 + '». Escríbela TAL CUAL, sin cambiar una letra, como PRIMERA opción de \`tagline_opciones\` (la casilla del eslogan del manual). Las demás opciones son propuestas tuyas.'
  : '';
const _PROSA =`, 'Fan-out prep · constantes r62')
  c = cambia(c, "  'Grounding cada afirmación en la evidencia.';", "  'Grounding cada afirmación en la evidencia.' + REGLAS_EVIDENCIA_R62;", 'Fan-out prep · prosa')
  c = cambia(c, 'const TOPE_TASK = 14000;', 'const TOPE_TASK = 14000 + REGLAS_EVIDENCIA_R62.length + _FRASE_EJ_R62.length;   // r62 · el tope sube lo que suman las reglas y la frase · la evidencia no cede más', 'Fan-out prep · tope')
  c = cambia(c, "+ ' + mensajes_clave[] (3-5 · desde los dolores/objetivos del ICP + el positioning).';", "+ ' + mensajes_clave[] (3-5 · desde los dolores/objetivos del ICP + el positioning).' + _FRASE_EJ_R62;", 'Fan-out prep · lente del eslogan')
  return c
}

// ───────────────────────── 2 · el nodo que SACA
export const CODIGO_SACAR = `// r62 (CC#1 2026-10-10) · SACAR lo que no tiene fuente ANTES de guardar el manual · el chequeo de hechos deja de MARCAR para SACAR.
// Usa la puerta de M2 (/api/manual/recomprobar · código puro · US$ 0 · sin modelo) y NO la duplica: la ruta quita SOLO la cláusula sin cita (el resto de la frase creativa se respeta)
// y escribe lo que el cliente dice de sí mismo como «el cliente dice: «…»». NO escribe el eslogan por código (sin_eslogan) · NO exige manual previo (sin_manual_previo).
// Lo sacado va SOLO al registro interno (client_historical_outputs · provenance_tag.registro_interno) · NUNCA a la bandeja ni a Slack.
// Si la ruta no contesta, el manual sigue SIN revisar y lo DECLARA en \`_sacar\` (nunca en silencio, y no para el alta por un fallo de una ruta pura).
const j = $json
const draft = j.brand_book_draft || {}
const clientId = $('Validate Deal Data').first().json.client_id
const api = ($env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app')
const base = 'https://ordaeyxvvvdqsznsecjx.supabase.co'
const authDb = { apikey: $env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + $env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
const declarar = (estado, motivo) => [{ json: Object.assign({}, j, { brand_book_draft: Object.assign({}, draft, { _sacar: { estado: estado, motivo: String(motivo || '').slice(0, 200) } }) }) }]

if (!draft || typeof draft !== 'object' || Object.keys(draft).length === 0) return declarar('no_se_pudo', 'sin borrador que revisar')
if (!clientId) return declarar('no_se_pudo', 'sin client_id')

let r = null, error = ''
for (let intento = 0; intento < 2 && !r; intento++) {
  try {
    const x = await this.helpers.httpRequest({
      url: api + '/api/manual/recomprobar', method: 'POST', json: true, timeout: 55000,
      headers: { 'Content-Type': 'application/json', 'x-api-key': $env.INTERNAL_API_KEY },
      body: { client_id: clientId, despues: draft, sin_manual_previo: true, sin_eslogan: true },
    })
    if (x && x.manual && typeof x.manual === 'object' && !Array.isArray(x.manual) && Array.isArray(x.retirados)) r = x
    else error = 'la ruta contestó sin manual: ' + JSON.stringify(x || {}).slice(0, 120)
  } catch (e) { error = String((e && e.message) || e) }
}
if (!r) return declarar('no_se_pudo', error || 'la ruta no contestó')

// el registro interno · si no se puede escribir, el manual igual sale limpio y se DECLARA (lo sacado queda solo en esta ejecución)
let registro = 'sin_nada_que_registrar'
if (r.retirados.length || (Array.isArray(r.cambios) && r.cambios.length)) {
  try {
    await this.helpers.httpRequest({
      url: base + '/rest/v1/client_historical_outputs', method: 'POST', json: true, timeout: 15000, headers: authDb,
      body: {
        client_id: clientId, title: 'Manual de marca · lo sacado por no tener fuente (antes de guardar la versión)', output_type: 'manual_sacado_en_origen',
        content: JSON.stringify({ retirados_n: r.retirados.length, cambios_n: (r.cambios || []).length }), content_text: 'Registro interno: ' + r.retirados.length + ' cláusulas sin fuente salieron del manual antes de guardarlo.',
        producing_agent: 'cimiento · sacar en el origen', status: 'draft',
        provenance_tag: { fuente: 'cimiento_sacar_en_origen', workflow_execution_id: String($execution.id), registro_interno: { retirados: r.retirados, cambios: r.cambios || [] } },
      },
    })
    registro = 'guardado'
  } catch (e) { registro = 'no_se_pudo · ' + String((e && e.message) || e).slice(0, 120) }
}

const limpio = Object.assign({}, r.manual, { _sacar: { estado: r.retirados.length ? 'sacado' : 'limpio', retirados_n: r.retirados.length, cambios_n: (r.cambios || []).length, registro: registro } })
return [{ json: Object.assign({}, j, { brand_book_draft: limpio }) }]`

// ───────────────────────── 3 · Lazo A · re-síntesis
export function construirResintesis(codigoAntes) {
  if (lf(codigoAntes).includes('REGLAS_EVIDENCIA_R62')) throw new Error('Re-síntesis prep ya trae r62 · no construir dos veces')
  let c = codigoAntes
  c = cambia(c, "const task = (\n  'Sos el consolidador", `// r62 (CC#1 2026-10-10) · las REGLAS DE EVIDENCIA también llegan al que REESCRIBE (positioning/icp_summary): sin ellas el Lazo A podía reintroducir lo que el cimiento ya no inventa.
const REGLAS_EVIDENCIA_R62 = ${JSON.stringify(REGLAS_EVIDENCIA)};
const task = (
  'Sos el consolidador`, 'Re-síntesis · constantes')
  c = cambia(c, "'campos nuevos · mantené la estructura.\\n' +", "'campos nuevos · mantené la estructura.' + REGLAS_EVIDENCIA_R62 + '\\n' +", 'Re-síntesis · reglas')
  c = cambia(c, ').slice(0, 7900);', ').slice(0, 7900 + REGLAS_EVIDENCIA_R62.length);   // r62 · el tope sube lo que suman las reglas · la evidencia no cede más', 'Re-síntesis · tope')
  return c
}

// ───────────────────────── el flujo entero
export function construirCimiento(flujoAntes) {
  const f = JSON.parse(JSON.stringify(flujoAntes))
  const fan = nodo(f, FANOUT)
  fan.parameters.jsCode = construirFanout(fan.parameters.jsCode)
  fan.notes = ((fan.notes || '') + '\nr62 · las tres lentes reciben las reglas de evidencia; la lente del eslogan, la frase propia (primera opción de tagline_opciones). El tope sube lo que suman.').trim()
  if (f.nodes.some((n) => n.name === SACAR)) throw new Error('el nodo Sacar ya existe')
  const piso = nodo(f, PISO)
  const prom = nodo(f, PROMOTE_PREP)
  f.nodes.push({
    parameters: { jsCode: CODIGO_SACAR }, type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [Math.round((piso.position[0] + prom.position[0]) / 2), piso.position[1] + 140],
    id: '5d3a6b62-0c0e-4f4a-9a52-62a2c7b1e062', name: SACAR, onError: 'continueRegularOutput',
    notes: 'r62 · el chequeo de hechos SACA lo sin fuente antes de guardar (ruta /api/manual/recomprobar de M2 · sin_manual_previo · sin_eslogan) · lo sacado va solo al registro interno.',
  })
  const out = f.connections[PISO]
  if (!out || !out.main || !out.main[0] || out.main[0].length !== 1 || out.main[0][0].node !== PROMOTE_PREP) throw new Error('Piso visual ya no va solo a Promote prep · PARO')
  f.connections[PISO] = { main: [[{ node: SACAR, type: 'main', index: 0 }]] }
  f.connections[SACAR] = { main: [[{ node: PROMOTE_PREP, type: 'main', index: 0 }]] }
  return f
}
export function construirLazoA(flujoAntes) {
  const f = JSON.parse(JSON.stringify(flujoAntes))
  const n = nodo(f, RESINTESIS)
  n.parameters.jsCode = construirResintesis(n.parameters.jsCode)
  n.notes = ((n.notes || '') + '\nr62 · el reescritor recibe las reglas de evidencia; el tope sube lo que suman.').trim()
  return f
}

if (process.argv[1] && process.argv[1].endsWith('construir-r62.mjs')) {
  const cim = JSON.parse(readFileSync(join(aqui, 'cimiento-ANTES-2026-10-10-r62.json'), 'utf8'))
  const lazo = JSON.parse(readFileSync(join(aqui, 'lazoA-ANTES-2026-10-10-r62.json'), 'utf8'))
  writeFileSync(join(aqui, 'cimiento-ARREGLADO-2026-10-10-r62.json'), JSON.stringify(construirCimiento(cim), null, 1) + '\n')
  writeFileSync(join(aqui, 'lazoA-ARREGLADO-2026-10-10-r62.json'), JSON.stringify(construirLazoA(lazo), null, 1) + '\n')
  console.log('construidos · cimiento (+1 nodo) y Lazo A (re-síntesis)')
}
