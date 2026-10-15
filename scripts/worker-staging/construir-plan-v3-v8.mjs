// PLAN v3 · V8 (parte del Servicio de Apify `3lyknrP3PoS2KzUf`) · CC#2 · 15-oct · TODO APAGADO, ADITIVO, COMPATIBLE HACIA ATRÁS con el `portero`.
// Lo nuevo es opcional en el cuerpo del pedido; AUSENTE ⇒ comportamiento de hoy (mismas salidas, misma fila de libro salvo `origen: 'sin_origen'`).
//   · `origen`  (texto corto) → la fila de la libreta lo lleva (`description.origen`; sin él = `sin_origen`) y la respuesta lo devuelve. Permite que el gasto del día distinga plan / portero / alta.
//   · `workflow_execution_id` (texto) → idem, para cruzar el pedido con la corrida del plan.
//   · `tope_usd` (número 0 < x ≤ 5) → tope de costo POR LLAMADA al actor: se manda a Apify como `maxTotalChargeUsd` (aplica a todos los modelos de precio, doc de Apify run-sync). Ausente = sin tope, como hoy.
// El importe real y el id de la corrida ya viven en la fila de la libreta (`description.run_id`, `importe_exacto_usd`, ronda 68/76); no se mueven a la respuesta porque se estabilizan ≥ 45 s DESPUÉS de responder.
//   node scripts/worker-staging/construir-plan-v3-v8.mjs
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/')
const DIR = RAIZ + 'scripts/worker-staging/3lyknrP3PoS2KzUf/'
export const ANTES = DIR + 'servicio-apify-ANTES-planv3-v8-2026-10-15.json'
export const ARREGLADO = DIR + 'servicio-apify-ARREGLADO-planv3-v8-2026-10-15.json'
export const TOPE_MAXIMO_USD = 5
export const ORIGEN_RE = '^[a-z][a-z0-9_]{0,31}$'

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

const LEE = "($('Validate Body').first().json.body || {})"
/** sufijo de dirección: añade `maxTotalChargeUsd` solo cuando el pedido trae un `tope_usd` válido */
const sufijo = (conInterrogacion) =>
  `{{ (Number(${LEE}.tope_usd) > 0 && Number(${LEE}.tope_usd) <= ${TOPE_MAXIMO_USD}) ? '${conInterrogacion ? '?' : '&'}maxTotalChargeUsd=' + Number(${LEE}.tope_usd) : '' }}`

export function servicioConOrigenYTope(flujo) {
  const f = JSON.parse(JSON.stringify(flujo))
  const por = (n) => { const x = f.nodes.filter((m) => m.name === n); if (x.length !== 1) throw new Error(`${x.length} nodos «${n}»`); return x[0] }
  if (JSON.stringify(f).includes('maxTotalChargeUsd')) throw new Error('el Servicio ya lleva el tope por llamada')

  // 1 · validar lo nuevo (solo si viene)
  const vb = por('Validate Body')
  vb.parameters.jsCode = conFinDeLinea(vb.parameters.jsCode, (c) => cambiar(c,
    "if (typeof body.dry_run !== 'boolean') errors.push('dry_run required · true o false explícito · no se asume');",
    "if (typeof body.dry_run !== 'boolean') errors.push('dry_run required · true o false explícito · no se asume');\n" +
      '// PLAN v3 · V8 (15-oct) · ADITIVO y opcional: ausente = comportamiento de hoy\n' +
      `if (body.origen !== undefined && body.origen !== null && !/${ORIGEN_RE}/.test(String(body.origen))) errors.push('origen invalid · texto corto en minúsculas (a-z, 0-9, _)');\n` +
      "if (body.workflow_execution_id !== undefined && body.workflow_execution_id !== null && (typeof body.workflow_execution_id !== 'string' || body.workflow_execution_id.length > 64)) errors.push('workflow_execution_id invalid · texto de hasta 64 caracteres');\n" +
      `if (body.tope_usd !== undefined && body.tope_usd !== null && !(typeof body.tope_usd === 'number' && body.tope_usd > 0 && body.tope_usd <= ${TOPE_MAXIMO_USD})) errors.push('tope_usd invalid · número mayor que 0 y hasta ${TOPE_MAXIMO_USD}');`,
    'validar'))

  // 2 · la fila de la libreta lleva el origen
  const fl = por('Armar la fila de la libreta')
  fl.parameters.jsCode = conFinDeLinea(fl.parameters.jsCode, (c) => {
    c = cambiar(c, 'const ensayo = ctx.dry_run === true;',
      'const ensayo = ctx.dry_run === true;\n' +
        "// PLAN v3 · V8 · de dónde vino el pedido (opcional; sin él = 'sin_origen', igual que hoy)\n" +
        "let _pedido = {};\ntry { _pedido = $('Validate Body').first().json.body || {}; } catch (e) { _pedido = {}; }\n" +
        `const _origen = typeof _pedido.origen === 'string' && new RegExp('${ORIGEN_RE}').test(_pedido.origen) ? _pedido.origen : 'sin_origen';`, 'origen')
    return cambiar(c, '    funcion: ctx.apify_function,\n',
      '    funcion: ctx.apify_function,\n' +
        '    origen: _origen,\n' +
        "    ...(typeof _pedido.workflow_execution_id === 'string' && _pedido.workflow_execution_id ? { workflow_execution_id: _pedido.workflow_execution_id.slice(0, 64) } : {}),\n" +
        '    ...(typeof _pedido.tope_usd === \'number\' && _pedido.tope_usd > 0 ? { tope_usd: _pedido.tope_usd } : {}),\n', 'fila')
  })

  // 3 · la respuesta devuelve el origen
  const fr = por('final-response-ok')
  fr.parameters.jsCode = conFinDeLinea(fr.parameters.jsCode, (c) => cambiar(c, '    dry_run: ctx.dry_run === true,\n    brain_rag_result: brainResult,',
    "    dry_run: ctx.dry_run === true,\n    // PLAN v3 · V8 · eco del origen del pedido (aditivo)\n    origen: (($('Validate Body').first().json.body || {}).origen) || 'sin_origen',\n    brain_rag_result: brainResult,", 'respuesta'))

  // 4 · el tope viaja a Apify en cada llamada al actor
  let tocados = 0
  for (const n of f.nodes) {
    if (n.type !== 'n8n-nodes-base.httpRequest' || !/^apify-/.test(n.name)) continue
    const u = String(n.parameters.url || '')
    if (/\/run-sync-get-dataset-items\?timeout=\d+$/.test(u)) { n.parameters.url = u + sufijo(false); tocados++ }
    else if (/\/acts\/[^/]+\/runs$/.test(u)) { n.parameters.url = u + sufijo(true); tocados++ }
  }
  if (tocados !== 19) throw new Error(`se esperaban 19 nodos de llamada al actor y se tocaron ${tocados}`)
  return f
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const antes = JSON.parse(fs.readFileSync(ANTES, 'utf8'))
  fs.writeFileSync(ARREGLADO, JSON.stringify(servicioConOrigenYTope(antes), null, 2))
  console.log('escrito', ARREGLADO)
}
