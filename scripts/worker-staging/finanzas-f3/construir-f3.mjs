// F3 · EL FLUJO `finanzas · bloque` (CC#1 · 2026-10-14) · diseño v2 rev. 8 §6b · NACE INACTIVO, NUEVO (no toca ningún flujo vivo) · NO SE IMPORTA NI SE ACTIVA (lo hace CC#3 con respaldo y n8n 0/0).
//   node construir-f3.mjs [--salida=<carpeta>]   → escribe NUEVO-finanzas-bloque-2026-10-14.json · NO toca n8n
// Qué hace: recibe `{ client_id, dry_run (booleano), entrada, workflow_execution_id? }`, llama UNA vez a `/api/finanzas/bloque` (llave INTERNA por variable de entorno) y devuelve
// `{ ok, finanzas_id, estado, huella, motivo }`. NUNCA lanza ni reintenta (cada llamada paga o escribe): un fallo devuelve `sin_bloque` y el plan sigue como hoy.
// La FIRMA no la hace este flujo: la hace la revisión (F8) con la ruta `/api/finanzas/tablero` (acción `firmar`); sin ella el tablero queda `borrador` y el plan NO lo usa.
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
export const NOMBRE = 'Zero Risk — finanzas · bloque (oficina financiera · F3 · INACTIVO)'
export const N = { webhook: 'Webhook · finanzas bloque', validar: 'FIN · validar el sobre', llamarSi: 'FIN · ¿se llama a la ruta?', llamar: 'FIN · calcular el bloque', resultado: 'FIN · resultado' }
export const RUTA_WEBHOOK = 'zero-risk/finanzas-bloque'
const VERCEL = "($env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app')"

const VALIDAR = [
  '// F3 · valida el sobre ANTES de llamar a la ruta. `dry_run` OBLIGATORIO y booleano (ausente o no booleano = no se llama, como la sala). Nunca lanza.',
  '// R-F3 de CC#3 · el webhook EXIGE la llave interna (cabecera `x-api-key` = la variable del propio n8n) ANTES de mirar nada; sin ella, o equivocada, o sin variable: no se llama a la ruta.',
  'const entrada = $input.first().json || {}',
  "const cab = entrada.headers && typeof entrada.headers === 'object' ? entrada.headers : {}",
  "const dada = String(cab['x-api-key'] || '')",
  "const esperada = String($env.INTERNAL_API_KEY || '')",
  'let autorizado = esperada.length > 0 && dada.length === esperada.length',
  'if (autorizado) { let d = 0; for (let i = 0; i < esperada.length; i++) d |= dada.charCodeAt(i) ^ esperada.charCodeAt(i); autorizado = d === 0 }',
  'if (!autorizado) return [{ json: { llamar: false, no_autorizado: true, errores: [] } }]',
  'const b = entrada.body || entrada',
  'const errores = []',
  "if (typeof b.dry_run !== 'boolean') errores.push('`dry_run` es obligatorio y debe ser booleano')",
  "if (typeof b.client_id !== 'string' || !b.client_id.trim()) errores.push('`client_id` es obligatorio')",
  "if (!b.entrada || typeof b.entrada !== 'object' || Array.isArray(b.entrada)) errores.push('`entrada` es obligatoria y debe ser un objeto')",
  'if (errores.length) return [{ json: { llamar: false, errores } }]',
  "return [{ json: { llamar: true, cuerpo: { client_id: b.client_id.trim(), dry_run: b.dry_run, entrada: b.entrada, workflow_execution_id: typeof b.workflow_execution_id === 'string' ? b.workflow_execution_id : $execution.id } } }]",
].join('\n')

const RESULTADO = [
  '// F3 · normaliza lo que contestó la ruta. NUNCA lanza: cualquier cosa que no sea un bloque devuelve `sin_bloque` con el motivo y el plan sigue como hoy.',
  'let v = null',
  "try { v = $('" + N.validar + "').first().json } catch (x) { v = null }",
  "if (v && v.no_autorizado === true) return [{ json: { ok: false, sin_bloque: true, motivo: 'no_autorizado' } }]",
  'if (!v || v.llamar !== true) return [{ json: { ok: false, sin_bloque: true, motivo: \'sobre_invalido\', errores: (v && v.errores) || [] } }]',
  'const r = $input.first().json || {}',
  'const status = Number(r.statusCode)',
  'const b = r.body && typeof r.body === \'object\' && !Array.isArray(r.body) ? r.body : {}',
  "if (status === 409) return [{ json: { ok: false, sin_bloque: true, motivo: b.error || 'oficina_apagada' } }]",
  "if (status === 200 && b.huella) return [{ json: { ok: true, sin_bloque: false, dry_run: b.dry_run === true, finanzas_id: b.finanzas_id || null, version: b.version || null, estado: b.finanzas_id ? 'borrador' : null, huella: b.huella, escribio: b.escribio === true } }]",
  "return [{ json: { ok: false, sin_bloque: true, motivo: b.error || ('http_' + (isFinite(status) ? status : 'sin_respuesta')), errores: b.errores || [] } }]",
].join('\n')

export function construirFlujo() {
  const nodes = [
    { parameters: { httpMethod: 'POST', path: RUTA_WEBHOOK, responseMode: 'lastNode' }, name: N.webhook, type: 'n8n-nodes-base.webhook', typeVersion: 1.1, position: [0, 0], webhookId: 'finanzas-bloque-0001' },
    { parameters: { jsCode: VALIDAR }, name: N.validar, type: 'n8n-nodes-base.code', typeVersion: 2, position: [240, 0] },
    {
      parameters: {
        method: 'POST', url: `={{ ${VERCEL} + '/api/finanzas/bloque' }}`, sendHeaders: true,
        headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] },
        sendBody: true, specifyBody: 'json', jsonBody: `={{ JSON.stringify($json.cuerpo || {}) }}`,
        options: { timeout: 60000, response: { response: { fullResponse: true, neverError: true } } },
      },
      // sin reintentos: la llamada escribe; un fallo se dice y el plan sigue
      name: N.llamar, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [720, 0], onError: 'continueRegularOutput',
    },
    { parameters: { jsCode: RESULTADO }, name: N.resultado, type: 'n8n-nodes-base.code', typeVersion: 2, position: [960, 0] },
  ]
  // el IF va ANTES de la llamada: un sobre inválido NO llama a la ruta (verdadero: se llama · falso: directo al resultado, que dice «sobre_invalido»)
  nodes.splice(2, 0, {
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: '={{ $json.llamar === true }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }] }, options: {} },
    name: N.llamarSi, type: 'n8n-nodes-base.if', typeVersion: 2, position: [480, 0],
  })
  const connections = {
    [N.webhook]: { main: [[{ node: N.validar, type: 'main', index: 0 }]] },
    [N.validar]: { main: [[{ node: N.llamarSi, type: 'main', index: 0 }]] },
    [N.llamarSi]: { main: [[{ node: N.llamar, type: 'main', index: 0 }], [{ node: N.resultado, type: 'main', index: 0 }]] },
    [N.llamar]: { main: [[{ node: N.resultado, type: 'main', index: 0 }]] },
  }
  return { name: NOMBRE, active: false, nodes, connections, settings: { executionOrder: 'v1' } }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = process.argv.find((a) => a.startsWith('--salida='))
  const ruta = join(arg ? arg.slice('--salida='.length) : aqui, 'NUEVO-finanzas-bloque-2026-10-14.json')
  fs.writeFileSync(ruta, JSON.stringify(construirFlujo(), null, 2))
  console.log('escrito', ruta)
}
