/**
 * 02-nov · SEÑAL-LENOVO 13:27Z punto (c) · PISO VISUAL del manual: lo escribe `design-visual-storyteller` y lo REVISA `style-consistency-reviewer` (firma de Emilio 01-nov).
 * Hoy «[BB] Piso visual (antes del Promote · CC#1)» (código de CC1) llama a `jefe-marketing` para MIRAR las fotos y derivar las capas visuales. Pasa a:
 *   · ESCRIBE: `design-visual-storyteller`. Solo cambian el empleado y el tiempo de espera de esa llamada (120 s → 300 s: Opus con fotos tarda más; el nodo no bloquea y declara el fallo en `visual.error`).
 *     Sigue SIN client_id (R5 de CC1: ninguna prueba de percepción lleva client_id) y sin la palanca de vuelta por el corredor (callback_mode): contesta directo.
 *   · REVISA: `style-consistency-reviewer`, UNA vez, después del piso y antes de «Sacar lo sin fuente». Es SU oficio (coherencia entre salidas de distintos autores): lee las TRES partes del manual
 *     (estrategia · voz · visual) y dice si se leen y se ven como una sola marca. Asesora: no reescribe, no aprueba ni rechaza, no detiene la corrida. Su hallazgo queda en
 *     `brand_book_draft.visual.revision_de_estilo` (el manual lo guarda con el resto: durable) y en el libro (agent_invocations, step `bb-estilo-revision`).
 *     Sin parte visual o sin voz no hay nada que comparar y no se llama a nadie.
 * Sin reglas duras: el revisor señala deriva que cita literal; lo de gusto o la variación legítima de cada superficie no cuenta.
 * DEPENDENCIA: parte (d) (clona la llamada de revisión de la voz: mismo tope de gasto de «Pedir cambios»).
 */
import { agregarNodo, cambiarCodigo, codigo, conectar, nodo, redirigir } from './lib.mjs'
import { REVISION } from './voz-content-creator-manual.mjs'

const PISO = '[BB] Piso visual (antes del Promote · CC#1)'
const SACAR = '[BB] Sacar lo sin fuente (antes del Promote)'
export const ESTILO = { pedido: '[BB] Estilo · pedido de revisión', si: '[BB] Estilo · ¿se revisa?', http: '[BB] Estilo · revisión (style-consistency-reviewer)', anotar: '[BB] Estilo · anotar la revisión' }

const CODIGO_PEDIDO = String.raw`// (c2) 02-nov · REVISIÓN DE ESTILO del manual por style-consistency-reviewer: ¿las tres partes (estrategia · voz · visual) se leen y se ven como UNA marca? Asesora; una vez.
const j = $json;
const draft = j.brand_book_draft || {};
const visual = (draft.visual && typeof draft.visual === 'object') ? draft.visual : null;
const hayVisual = !!visual && visual.estado !== 'ausente' && !!(visual.capa_grafica || visual.reglas || visual.capa_producto);
const voz = String(draft.voice_description == null ? '' : draft.voice_description).trim();
const elegir = (o, claves) => { const r = {}; claves.forEach((k) => { if (o && o[k] !== undefined && o[k] !== null && o[k] !== '') r[k] = o[k]; }); return r; };
const revisar = hayVisual && voz.length > 0;
let pedido = ''; const omitido = [];
if (revisar) {
  const cuerpoVisual = elegir(visual, ['estado', 'capa_grafica', 'reglas', 'capa_producto', 'muestra']);
  const armar = () => [
    { agent: 'brand-strategist', surface: 'manual-estrategia', language: 'es', body: elegir(draft, ['positioning', 'icp_summary', 'vision', 'mision', 'proposito', 'propuestas_de_valor']) },
    { agent: 'content-creator', surface: 'manual-voz', language: 'es', body: elegir(draft, ['voice_description', 'personalidad', 'tagline_opciones', 'mensajes_clave', 'forbidden_words', 'required_terminology']) },
    { agent: 'design-visual-storyteller', surface: 'manual-visual', language: 'es', body: cuerpoVisual },
  ];
  const PRESUPUESTO = 12000;
  // lo visual entra ENTERO por clave o no entra (nunca un JSON partido); lo que no cupo se declara
  for (const k of ['capa_producto', 'reglas', 'muestra']) { if (JSON.stringify(armar()).length <= PRESUPUESTO) break; if (k in cuerpoVisual) { delete cuerpoVisual[k]; omitido.push(k); } }
  pedido = 'Revisa la COHERENCIA ENTRE LAS TRES PARTES de un manual de marca en construcción: la estrategia (brand-strategist), la voz (content-creator) y lo visual (design-visual-storyteller). ¿Se lee y se ve como UNA marca, o como tres autores sueltos?\n' +
    'ASESORAS: no reescribes nada y no apruebas ni rechazas el manual. Cada hallazgo cita el fragmento literal. Lo de gusto y la variación legítima de cada parte NO es deriva: marca solo lo que una parte contradice de otra ' +
    '(por ejemplo, una voz cálida y familiar frente a reglas visuales frías y corporativas, o una paleta que contradice el posicionamiento). Si algo no se puede juzgar porque falta, dilo en open_questions; no lo inventes. ' +
    'Responde SOLO el JSON de tu formato (el idioma del manual: español).\n\nSALIDAS (' + (omitido.length ? 'no cupo en lo visual: ' + omitido.join(', ') : 'completas') + '):\n' + JSON.stringify(armar());
}
const motivo = revisar ? '' : (!hayVisual ? 'no hay parte visual que comparar' : 'no hay voz que comparar');
return [{ json: Object.assign({}, j, { _estilo_revisar: revisar, _estilo_revision_pedido: pedido, _estilo_omitido: omitido, _estilo_revision: revisar ? undefined : { corrio: false, motivo } }) }];`

const CODIGO_ANOTAR = String.raw`// (c2) 02-nov · lo que volvió de la revisión de estilo. Asesora: no cambia nada del manual salvo dejar su hallazgo en visual.revision_de_estilo. Si no se entiende, la corrida SIGUE y lo declara.
const prev = $('[BB] Estilo · pedido de revisión').first().json;
const r = $json || {};
const body = (r.body && typeof r.body === 'object') ? r.body : r;
const texto = typeof body.response === 'string' ? body.response : (typeof body.result === 'string' ? body.result : '');
let rev = (body.verdict || body.findings) ? body : null;
if (!rev && texto) { const m = texto.match(/\{[\s\S]*\}/); if (m) { try { rev = JSON.parse(m[0]); } catch (e) { rev = null; } } }
const SEV = ['low', 'medium', 'high', 'critical'];
const VER = ['approved', 'revision_needed', 'escalated'];
const t = (v, n) => String(v == null ? '' : v).slice(0, n);
let salida;
if (!rev || typeof rev !== 'object' || (rev.verdict === undefined && !Array.isArray(rev.findings))) {
  salida = { corrio: false, motivo: texto ? 'la respuesta no se entendió como el JSON de la revisión' : 'no volvió respuesta', hallazgos: [] };
} else {
  const hallazgos = (Array.isArray(rev.findings) ? rev.findings : []).filter((o) => o && typeof o === 'object').slice(0, 6).map((o) => ({
    superficie: t(o.surface, 60), eje: t(o.axis, 60), severidad: SEV.indexOf(o.severity) !== -1 ? o.severity : 'low',
    problema: t(o.issue, 400), arreglo: t(o.suggested_fix, 300), evidencia: (Array.isArray(o.evidence) ? o.evidence : []).slice(0, 3).map((e) => t(e, 200)),
  })).filter((o) => o.problema.trim());
  salida = { corrio: true, veredicto: VER.indexOf(rev.verdict) !== -1 ? rev.verdict : 'no_declarado', severidad: SEV.indexOf(rev.severity) !== -1 ? rev.severity : 'no_declarada', resumen: t(rev.cascade_summary, 400), hallazgos: hallazgos, preguntas: (Array.isArray(rev.open_questions) ? rev.open_questions : []).slice(0, 3).map((q) => t(q, 200)) };
}
const draft = Object.assign({}, prev.brand_book_draft || {});
if (draft.visual && typeof draft.visual === 'object') draft.visual = Object.assign({}, draft.visual, { revision_de_estilo: salida });
return [{ json: Object.assign({}, prev, { brand_book_draft: draft, _estilo_revisar: false, _estilo_revision: salida }) }];`

export function construirPisoVisualConEquipo(f) {
  // ① quién escribe lo visual: solo el empleado y la espera de esa llamada (el resto del nodo de CC1 queda letra por letra)
  cambiarCodigo(f, PISO, "        agent: 'jefe-marketing',", "        agent: 'design-visual-storyteller',")
  cambiarCodigo(f, PISO, "method: 'POST', json: true, timeout: 120000,", "method: 'POST', json: true, timeout: 300000,")

  // ② la revisión de estilo: pedido → ¿se revisa? → llamada → anotar → «Sacar lo sin fuente»
  const rev = nodo(f, REVISION.http)   // si falta, falta la parte (d): esta clona su llamada y su tope de gasto
  agregarNodo(f, codigo(ESTILO.pedido, CODIGO_PEDIDO), PISO, 180, 220)
  const si = JSON.parse(JSON.stringify(nodo(f, REVISION.si)))
  si.name = ESTILO.si; si.id = 'estilo-rev-si'; si.parameters.conditions.conditions[0].id = 'estilo-rev-c'
  si.parameters.conditions.conditions[0].leftValue = '={{ $json._estilo_revisar === true }}'
  agregarNodo(f, si, PISO, 360, 220)
  const http = JSON.parse(JSON.stringify(rev))
  http.name = ESTILO.http; http.id = 'estilo-rev-http'
  http.parameters.jsonBody = http.parameters.jsonBody
    .replace('"agent": "editor-en-jefe",', '"agent": "style-consistency-reviewer",')
    .replace('"step_name": "bb-voz-revision"', '"step_name": "bb-estilo-revision"')
    .replace('JSON.stringify($json._voz_revision_pedido)', 'JSON.stringify($json._estilo_revision_pedido)')
    .replace('"context": { "role": "brand_book_voice_review", "motivo": "revision_de_la_voz" }', '"context": { "role": "brand_book_style_review", "motivo": "revision_de_estilo" }')
  const b = http.parameters.jsonBody
  if (!b.includes('"agent": "style-consistency-reviewer"') || !b.includes('bb-estilo-revision') || !b.includes('_estilo_revision_pedido') || !b.includes('brand_book_style_review')) throw new Error('la llamada de revisión de estilo no quedó como se esperaba: ¿cambió la revisión de la voz?')
  agregarNodo(f, http, PISO, 540, 220)
  agregarNodo(f, codigo(ESTILO.anotar, CODIGO_ANOTAR), PISO, 720, 220)
  redirigir(f, PISO, SACAR, ESTILO.pedido)
  conectar(f, ESTILO.pedido, ESTILO.si)
  conectar(f, ESTILO.si, ESTILO.http, 0)
  conectar(f, ESTILO.si, SACAR, 1)
  conectar(f, ESTILO.http, ESTILO.anotar)
  conectar(f, ESTILO.anotar, SACAR)
}
