/**
 * Fuentes públicas · CABLE EN EL ALTA (ronda 75 · CC#1). Después de «Aggregate Service responses» y ANTES de que sigan el resumen de síntesis y el cimiento:
 *   [FUENTES] Plan  →  [FUENTES] Armar las llamadas  →  [FUENTES] ¿Hay llamadas?  →  [FUENTES] Llamar al Servicio (de 3 en 3)  →  [FUENTES] Resumen  →  (lo que seguía)
 * El plan sale de `/api/fuentes-publicas/plan` (según rubro, país, sitio y redes PROPIOS · nunca inventa direcciones). Cada llamada va al Servicio de Apify con destino `respuesta`
 * (queda en `apify_raw` con su importe en el libro; NO se escribe al cerebro). Un plan que falla o una llamada que falla NO paran el alta: se cuentan y se dicen.
 * Uso: node construir-fuentes-alta.mjs  (lee alta-ANTES-fuentes-2026-10-12.json y escribe alta-ARREGLADA-fuentes-2026-10-12.json)
 */
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const DIR = path.join(AQUI, 'LyVoKcrypS5uLyuu')
export const NOMBRE_AGREGADO = '[APIFY-WIRE] Aggregate Service responses (onboarding_e2e)'
const N = {
  plan: '[FUENTES] Plan de fuentes públicas',
  armar: '[FUENTES] Armar las llamadas',
  hay: '[FUENTES] ¿Hay llamadas?',
  llamar: '[FUENTES] Llamar al Servicio',
  resumen: '[FUENTES] Resumen',
}
const PARSER = '[APIFY-WIRE] Discovery Parser · dynamic targets (lazo)'

export const ARMAR = `// FUENTES PÚBLICAS (ronda 75) · del plan a las llamadas del Servicio. Nunca para el alta: si el plan falló, se declara y sigue.
const cuerpo = ($input.first() || {}).json || {};
const parser = $(${JSON.stringify(PARSER)}).first().json || {};
const client_id = parser.client_id || $('Validate Deal Data').first().json.client_id;
const llamadas = Array.isArray(cuerpo.llamadas) ? cuerpo.llamadas : [];
if (cuerpo.ok !== true || !client_id) {
  return [{ json: { _sin_llamadas: true, _plan_error: [cuerpo.error, cuerpo.detail].filter(Boolean).join(' · ') || 'el plan no devolvió ok'.slice(0, 300), client_id: client_id || null, omitidas: [], estimado_usd: null } }];
}
if (!llamadas.length) {
  return [{ json: { _sin_llamadas: true, client_id, omitidas: cuerpo.omitidas || [], estimado_usd: (cuerpo.estimado || {}).total_usd ?? 0 } }];
}
return llamadas.map(function (l, i) {
  return { json: {
    client_id, apify_function: l.funcion, params: l.params, destination: 'respuesta', dry_run: false,
    _plataforma: l.plataforma, _objetivo: l.objetivo, _tipo: l.tipo,
    metadata: { calling_workflow_id: $workflow.id, calling_workflow_execution_id: $execution.id, scope: 'fuentes_publicas', target_kind: 'own', target_label: 'fuentes:' + l.funcion + ':' + String(l.objetivo).slice(0, 80) },
    _omitidas: i === 0 ? (cuerpo.omitidas || []) : undefined, _estimado_usd: i === 0 ? ((cuerpo.estimado || {}).total_usd ?? null) : undefined,
  } };
});
`

export const RESUMEN = `// FUENTES PÚBLICAS (ronda 75) · resumen de lo pedido. Devuelve el MISMO ítem del resumen del alta (lo que seguía lo lee igual) más \`fuentes_publicas\`.
const base = $(${JSON.stringify(NOMBRE_AGREGADO)}).first().json || {};
const entradas = $input.all().map(function (x) { return x.json || {}; });
const marcador = entradas.find(function (x) { return x._sin_llamadas === true; });
let pedidas = 0, ok = 0, fallidas = [];
let omitidas = [], estimado = null, planError = null;
if (marcador) { omitidas = marcador.omitidas || []; estimado = marcador.estimado_usd; planError = marcador._plan_error || null; }
else {
  for (const r of entradas) {
    pedidas++;
    const rechazada = r.ok === false || r.rechazado === true || r.validation_error === true || (Array.isArray(r.errors) && r.errors.length > 0) || !!r.error;
    const vacia = r.sin_resultados === true;
    if (rechazada) fallidas.push({ funcion: r.apify_function || null, motivo: String((Array.isArray(r.errors) && r.errors.join(' · ')) || r.motivo || (r.error && (r.error.message || r.error)) || 'rechazada').slice(0, 200) });
    else if (vacia) fallidas.push({ funcion: r.apify_function || null, motivo: 'sin resultados' + (r.cero && r.cero.motivo ? ' · ' + r.cero.motivo : '') });
    else ok++;
  }
}
const resumen = { pedidas, con_datos: ok, sin_datos_o_rechazadas: fallidas, omitidas, estimado_usd: estimado, plan_error: planError };
return [{ json: Object.assign({}, base, { fuentes_publicas: resumen }), pairedItem: { item: 0 } }];
`

const clonar = (o) => JSON.parse(JSON.stringify(o))
export function cableDeFuentes(flujo) {
  const f = clonar(flujo)
  const por = (n) => { const x = f.nodes.filter((m) => m.name === n); if (x.length !== 1) throw new Error(`${x.length} nodos «${n}»`); return x[0] }
  if (f.nodes.some((n) => n.name === N.plan)) throw new Error('el cable de fuentes ya está puesto')
  const agregado = por(NOMBRE_AGREGADO)
  const llamador = por('[APIFY-WIRE] Call Apify Service Workflow (onboarding_e2e)')
  const si = por('Poll · Ready?')
  const [x0, y0] = agregado.position
  const pos = (i) => [x0 + 260 * (i + 1), y0 + 0]
  const idDe = (s) => 'fuentes-' + s
  const http = (name, i, cuerpoJson, extra = {}) => ({
    id: idDe(name), name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos(i), onError: 'continueRegularOutput',
    parameters: { method: 'POST', sendHeaders: true, headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }, ...(extra.cabeceras || [])] }, sendBody: true, specifyBody: 'json', jsonBody: cuerpoJson, options: extra.opciones || {} },
    ...(extra.nodo || {}),
  })
  const nuevos = [
    http(N.plan, 0, "={{ JSON.stringify({ client_id: $('" + PARSER + "').first().json.client_id || $('Validate Deal Data').first().json.client_id }) }}", {
      cabeceras: [{ name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }],
      opciones: { response: { response: { neverError: true } }, timeout: 60000 },
      nodo: { notes: 'FUENTES PÚBLICAS (ronda 75) · qué reseñas/textos/videos públicos pedir según el rubro, país, sitio y redes PROPIOS · solo lectura, US$ 0' },
    }),
    { id: idDe('armar'), name: N.armar, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(1), alwaysOutputData: true, parameters: { jsCode: ARMAR } },
    { ...clonar(si), id: idDe('hay'), name: N.hay, position: pos(2), parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'loose', version: 1 }, conditions: [{ id: 'fuentes-hay', leftValue: '={{ $json._sin_llamadas !== true }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} } },
    { ...clonar(llamador), id: idDe('llamar'), name: N.llamar, position: pos(3), notes: 'FUENTES PÚBLICAS (ronda 75) · una llamada al Servicio por fuente pedida · de 3 en 3 · destino `respuesta` (queda en apify_raw con su importe; NO va al cerebro)', retryOnFail: false,
      parameters: { ...clonar(llamador.parameters), jsonBody: "={{ JSON.stringify({ client_id: $json.client_id, apify_function: $json.apify_function, destination: 'respuesta', dry_run: false, params: $json.params || {}, metadata: $json.metadata || {} }) }}", options: { timeout: 320000, batching: { batch: { batchSize: 3, batchInterval: 0 } }, response: { response: { neverError: true } } } } },
    { id: idDe('resumen'), name: N.resumen, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(4), alwaysOutputData: true, parameters: { jsCode: RESUMEN } },
  ]
  f.nodes.push(...nuevos)
  const seguian = f.connections[NOMBRE_AGREGADO].main[0]
  f.connections[NOMBRE_AGREGADO] = { main: [[{ node: N.plan, type: 'main', index: 0 }]] }
  f.connections[N.plan] = { main: [[{ node: N.armar, type: 'main', index: 0 }]] }
  f.connections[N.armar] = { main: [[{ node: N.hay, type: 'main', index: 0 }]] }
  f.connections[N.hay] = { main: [[{ node: N.llamar, type: 'main', index: 0 }], [{ node: N.resumen, type: 'main', index: 0 }]] }
  f.connections[N.llamar] = { main: [[{ node: N.resumen, type: 'main', index: 0 }]] }
  f.connections[N.resumen] = { main: [seguian] }
  return f
}

if (process.argv[1] && process.argv[1].endsWith('construir-fuentes-alta.mjs')) {
  const antes = JSON.parse(fs.readFileSync(path.join(DIR, 'alta-ANTES-fuentes-2026-10-12.json'), 'utf8'))
  fs.writeFileSync(path.join(DIR, 'alta-ARREGLADA-fuentes-2026-10-12.json'), JSON.stringify(cableDeFuentes(antes), null, 2))
  console.log('ok')
}
