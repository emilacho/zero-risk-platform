/**
 * Flujo NUEVO «Manual · propuesta del agente» (ronda 75 · CC#1). Lo que falta en el manual lo propone un agente, rotulado, y se guarda como versión nueva; los agentes solo se invocan por flujos.
 *   Pedir propuesta (webhook) → Preparar → Armar pedidos → ¿Seguir? → Llamar al agente (de a uno · sin reintento: un reintento se cobra dos veces) → Reunir → Aplicar → ¿Guardar? → Guardar versión nueva → PDF a Drive → Recibo → Avisar
 * Con `dry_run: true` se queda en «Armar pedidos» (no llama a ningún agente: US$ 0) y devuelve lo que pediría.
 * Uso: node construir-propuesta-flujo.mjs → escribe scripts/worker-staging/propuesta-del-agente/propuesta-NUEVO-2026-10-12.json (el flujo se crea en n8n con crear-propuesta-flujo.mjs)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
export const DIR = path.join(AQUI, 'propuesta-del-agente')
export const RUTA_WEBHOOK = 'zero-risk/manual-proponer-campos'
const API = "$env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app'"

export const ARMAR = `// Armar los pedidos · un ítem por agente · con dry_run NO se llama a ningún agente (queda dicho lo que se pediría).
const entrada = $('Pedir propuesta').first().json.body || $('Pedir propuesta').first().json || {};
const prep = $json.body || $json || {};
const dry = entrada.dry_run === true;
if (prep.ok !== true) return [{ json: { _parar: true, motivo: 'preparar falló: ' + [prep.error, prep.detail || prep.detalle].filter(Boolean).join(' · ') } }];
const pedidos = Array.isArray(prep.pedidos) ? prep.pedidos : [];
if (!pedidos.length) return [{ json: { _parar: true, motivo: 'no hay campos que proponer' + ((prep.rechazados || []).length ? ': ' + prep.rechazados.map(function (r) { return r.campo + ' → ' + r.motivo; }).join(' · ') : ''), faltantes: prep.faltantes || [] } }];
if (dry) return [{ json: { _parar: true, dry_run: true, motivo: 'dry_run: no se llamó a ningún agente', pedidos: pedidos.map(function (p) { return { agente: p.agente, campos: p.campos, largo_del_pedido: String(p.task).length }; }), faltantes: prep.faltantes || [] } }];
return pedidos.map(function (p) {
  return { json: { client_id: prep.client_id, client_name: prep.client_name, agente: p.agente, campos: p.campos, task: p.task, version_base: prep.version_base, huella_base: prep.huella_base, dry_run: false, campos_pedidos: entrada.campos || null } };
});
`

export const REUNIR = `// Reunir lo que contestó cada agente · una respuesta por pedido, en el mismo orden.
const pedidos = $('Armar pedidos').all().map(function (x) { return x.json; });
const respuestas = $input.all().map(function (x, i) {
  const b = (x.json && (x.json.body || x.json)) || {};
  const texto = typeof b.response === 'string' ? b.response : (typeof b.result === 'string' ? b.result : JSON.stringify(b));
  return { agente: (pedidos[i] || {}).agente, response: texto, ok: b.success !== false && !b.error };
});
const p0 = pedidos[0] || {};
return [{ json: { client_id: p0.client_id, client_name: p0.client_name, dry_run: false, campos: pedidos.reduce(function (a, p) { return a.concat(p.campos || []); }, []), version_base: p0.version_base, huella_base: p0.huella_base, respuestas: respuestas.filter(function (r) { return r.ok; }), agentes_sin_respuesta: respuestas.filter(function (r) { return !r.ok; }).map(function (r) { return r.agente; }) } }];
`

export const RECIBO = `// El recibo · dice lo que SUCEDIÓ (no lo que se pidió): versión nueva guardada o no, campos aplicados, rechazados, y el PDF.
const ap = $('Aplicar').first().json.body || $('Aplicar').first().json || {};
let guardada = null;
try { guardada = $('Guardar versión nueva').first().json; } catch (e) { guardada = null; }
const g = guardada ? (guardada.body || guardada) : null;
const persistio = !!(g && (g.persisted === true || g.version || g.id));
return [{ json: {
  client_id: ap.client_id || null, aplicado: ap.aplicado === true, guardado: persistio, version_base: ap.version_base || null,
  version_nueva: g ? (g.version || null) : null, campos_aplicados: ap.aplicadas || [], rechazadas: ap.rechazadas || [], sin_leer: ap.sin_leer || [],
  diferencias: (ap.diferencias || []).map(function (d) { return d.campo; }),
  motivo: ap.aplicado === true ? (persistio ? null : 'se aplicó pero la versión nueva no se guardó') : (ap.motivo || ap.error || 'no se aplicó nada'),
} }];
`

const http = (id, name, pos, url, cuerpo, extra = {}) => ({
  id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos, ...(extra.nodo || {}),
  parameters: { method: 'POST', url, sendHeaders: true, headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] }, sendBody: true, specifyBody: 'json', jsonBody: cuerpo, options: { response: { response: { neverError: true } }, timeout: extra.timeout || 60000, ...(extra.opciones || {}) } },
})
const codigo = (id, name, pos, jsCode, extra = {}) => ({ id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos, parameters: { jsCode }, ...extra })
const si = (id, name, pos, izquierda, op) => ({ id, name, type: 'n8n-nodes-base.if', typeVersion: 2, position: pos, parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: izquierda, rightValue: op === 'false' ? false : true, operator: { type: 'boolean', operation: op } }] } } })

export function construirFlujo() {
  const x = (i) => [i * 240, 0]
  const nodes = [
    { id: 'p-wh', name: 'Pedir propuesta', webhookId: '5b1f0c2e-7a64-4d3b-9c1e-2f4a6d8e0b13', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: x(0), parameters: { httpMethod: 'POST', path: RUTA_WEBHOOK, responseMode: 'onReceived', options: {} } },
    http('p-prep', 'Preparar', x(1), `={{ ${API} }}/api/manual/propuesta/preparar`, "={{ JSON.stringify({ client_id: $json.body.client_id, campos: $json.body.campos || undefined }) }}"),
    codigo('p-armar', 'Armar pedidos', x(2), ARMAR),
    si('p-seguir', '¿Seguir?', x(3), '={{ $json._parar }}', 'false'),
    http('p-agente', 'Llamar al agente', x(4), `={{ ${API} }}/api/agents/run-sdk`,
      '={\n  "agent": "{{ $json.agente }}",\n  "client_id": "{{ $json.client_id }}",\n  "workflow_id": "{{ $execution.id }}",\n  "workflow_execution_id": "{{ $execution.id }}",\n  "step_name": "manual_propuesta_{{ $json.campos.join(\'+\') }}",\n  "task": {{ JSON.stringify($json.task) }},\n  "context": { "role": "proponer_campos_del_manual" }\n}',
      { timeout: 800000, nodo: { retryOnFail: false, notes: 'SIN reintento: un reintento se cobra dos veces. Un pedido por agente, de a uno.' }, opciones: { batching: { batch: { batchSize: 1, batchInterval: 0 } } } }),
    codigo('p-reunir', 'Reunir', x(5), REUNIR),
    http('p-aplicar', 'Aplicar', x(6), `={{ ${API} }}/api/manual/propuesta/aplicar`, '={{ JSON.stringify({ client_id: $json.client_id, dry_run: false, campos: $json.campos, version_base: $json.version_base, huella_base: $json.huella_base, respuestas: $json.respuestas }) }}'),
    si('p-guardar', '¿Guardar?', x(7), '={{ (($json.body || $json).aplicado === true) }}', 'true'),
    http('p-save', 'Guardar versión nueva', x(8), `={{ ${API} }}/api/brand-book/{{ ($('Aplicar').first().json.body || $('Aplicar').first().json).client_id }}`, "={{ JSON.stringify(($('Aplicar').first().json.body || $('Aplicar').first().json).promote_body) }}", { timeout: 800000 }),
    http('p-drive', 'PDF a Drive', x(9), 'https://n8n-production-72be.up.railway.app/webhook/zero-risk/manual-a-drive', "={{ JSON.stringify({ client_id: ($('Aplicar').first().json.body || $('Aplicar').first().json).client_id }) }}", { timeout: 15000, nodo: { onError: 'continueRegularOutput' } }),
    codigo('p-recibo', 'Recibo', x(10), RECIBO, { alwaysOutputData: true }),
    { id: 'p-slack', name: 'Avisar', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, onError: 'continueRegularOutput', position: x(11), parameters: { method: 'POST', url: '={{ $env.SLACK_WEBHOOK_URL_EQUIPO }}', sendBody: true, specifyBody: 'json', jsonBody: "={{ JSON.stringify({ text: ($json.guardado ? ':sparkles: *Manual con propuesta del agente guardado* — ' : ':warning: *Propuesta del agente: no se guardó nada* — ') + ($json.guardado ? 'versión ' + $json.version_nueva + ' (sobre la ' + $json.version_base + ')' : ($json.motivo || '')) + '\\n• cliente `' + $json.client_id + '`\\n• campos propuestos: ' + (($json.campos_aplicados || []).join(', ') || 'ninguno') + '\\n• rechazados/sin leer: ' + (($json.rechazadas || []).concat($json.sin_leer || []).map(function (r) { return r.campo + ' → ' + r.motivo; }).join(' · ') || 'ninguno') }) }}", options: { response: { response: { neverError: true } }, timeout: 15000 } } },
  ]
  const enlaza = (a, b, rama = 0) => ({ [a]: { main: [...Array.from({ length: rama }, () => []), [{ node: b, type: 'main', index: 0 }]] } })
  const connections = {
    ...enlaza('Pedir propuesta', 'Preparar'), ...enlaza('Preparar', 'Armar pedidos'), ...enlaza('Armar pedidos', '¿Seguir?'),
    '¿Seguir?': { main: [[{ node: 'Llamar al agente', type: 'main', index: 0 }], []] },
    ...enlaza('Llamar al agente', 'Reunir'), ...enlaza('Reunir', 'Aplicar'), ...enlaza('Aplicar', '¿Guardar?'),
    '¿Guardar?': { main: [[{ node: 'Guardar versión nueva', type: 'main', index: 0 }], [{ node: 'Recibo', type: 'main', index: 0 }]] },
    ...enlaza('Guardar versión nueva', 'PDF a Drive'), ...enlaza('PDF a Drive', 'Recibo'), ...enlaza('Recibo', 'Avisar'),
  }
  return { name: 'Zero Risk — Manual · propuesta del agente (lo que falta lo propone un agente, rotulado)', nodes, connections, settings: { executionOrder: 'v1' } }
}

if (process.argv[1] && process.argv[1].endsWith('construir-propuesta-flujo.mjs')) {
  fs.mkdirSync(DIR, { recursive: true })
  fs.writeFileSync(path.join(DIR, 'propuesta-NUEVO-2026-10-12.json'), JSON.stringify(construirFlujo(), null, 2))
  console.log('ok')
}
