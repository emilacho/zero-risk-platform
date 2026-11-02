/**
 * 02-nov · SEÑAL-LENOVO 13:27Z punto (d) · `content-creator` ESCRIBE LA VOZ del manual; `editor-en-jefe` la REVISA (no la escribe).
 * Hoy la casilla de la voz («Lente · editor-en-jefe», «pedir la voz otra vez») la escribe el `editor-en-jefe`. Pasa a:
 *   · ESCRIBE (y reescribe cuando se le pide la voz otra vez): `content-creator`. Los nodos conservan su NOMBRE (otros constructores y pruebas los nombran;
 *     la casilla sigue llamándose «editor-en-jefe» por dentro: es la casilla, no el empleado). Cambia quién contesta y cómo se rotula en el borrador (`lente: 'content-creator'`).
 *   · REVISA: el `editor-en-jefe`, UNA vez, en la primera pasada, ANTES de «¿usó lo disponible?». Asesora, no reescribe ni vota: su respuesta son observaciones con severidad.
 *     Solo `blocker`/`major` (la voz contradice la evidencia, le atribuye al cliente algo que no dijo, o falta habiendo evidencia) piden UNA vuelta al escritor, por el mismo camino
 *     de «pedir la voz otra vez» (tope 1: ya existe); el escritor integra o no (ADR-020 §7: la vara decide y los críticos asesoran; lo estilístico es `minor` y no obliga).
 *     Si la revisión falla o no se entiende, la corrida SIGUE y lo declara (`_voz_revision.corrio:false`): sin rejas nuevas.
 * Red de rescate: la sección de la casilla se busca ahora por `agent_name = content-creator` y el reintento llama a `content-creator`.
 * DEPENDENCIA DE CC1 (plataforma): `content-creator` debe estar en `BRAND_SECTION_ALLOW` y en el enum `lens` ANTES de aplicar esto (RESPUESTA-CC1 02-nov punto 1).
 */
import { agregarNodo, cambiarCodigo, codigo, conectar, nodo, redirigir } from './lib.mjs'

const CAJA = '[BB] Consolidador'
const USO = '[BB] Uso · ¿usó lo disponible?'
const REPETIR_SI = '[BB] Uso · ¿hay que repetir la voz?'
const REPETIR_HTTP = '[BB] Uso · pedir la voz otra vez (editor-en-jefe)'
const MEZCLAR = '[BB] Uso · mezclar la voz'
export const LENTE_VOZ = 'Lente · editor-en-jefe'
export const REVISION = { pedido: '[BB] Voz · pedido de revisión', si: '[BB] Voz · ¿se revisa?', http: '[BB] Voz · revisión (editor-en-jefe)', anotar: '[BB] Voz · anotar la revisión' }

/** cambia un texto de un parámetro (url, jsonBody…) de un nodo: el fragmento debe aparecer UNA vez */
function cambiarParametro(f, nombreNodo, clave, viejo, nuevo) {
  const n = nodo(f, nombreNodo)
  const c = String(n.parameters[clave])
  const i = c.indexOf(viejo)
  if (i < 0 || c.indexOf(viejo, i + 1) >= 0) throw new Error(`«${nombreNodo}».${clave}: el fragmento a cambiar no aparece exactamente una vez: ${viejo.slice(0, 70)}`)
  n.parameters[clave] = c.replace(viejo, () => nuevo)
}

// ── el pedido de revisión: el editor ve la voz propuesta y la evidencia, y SOLO asesora ──────────────────────────────
const CODIGO_PEDIDO = String.raw`// (d) 02-nov · REVISIÓN DE LA VOZ por el editor-en-jefe. Ya no la escribe (la escribe content-creator): la revisa y ASESORA. Una vez, en la primera pasada.
const j = $json;
const draft = j.brand_book_draft || {};
const primeraPasada = (Number(j._fidelity_cycle) || 1) <= 1;
const voz = String(draft.voice_description == null ? '' : draft.voice_description).trim();
const CAMPOS = ['voice_description', 'personalidad', 'tagline_opciones', 'mensajes_clave', 'forbidden_words', 'required_terminology', 'palabras_con_intencion'];
const propuesta = {};
CAMPOS.forEach((k) => { if (draft[k] !== undefined) propuesta[k] = draft[k]; });
const grounding = j._grounding_refs || {};
// la evidencia entra ENTERA POR CLAVE o no entra (nunca un JSON partido); lo que no cabe se declara
const ORDEN = ['discovery_summary', 'icp_signals', 'competitors', 'materia_cliente', 'apify_sources'];
const PRESUPUESTO = 9000;
let evidencia = {}; const omitidas = [];
ORDEN.concat(Object.keys(grounding).filter((k) => ORDEN.indexOf(k) === -1)).forEach((k) => {
  if (!(k in grounding)) return;
  const prueba = Object.assign({}, evidencia, { [k]: grounding[k] });
  if (JSON.stringify(prueba).length <= PRESUPUESTO) evidencia = prueba; else omitidas.push(k);
});
const revisar = primeraPasada && voz.length > 0 && Object.keys(evidencia).length > 0;
let pedido = '';
if (revisar) {
  pedido = 'Eres el REVISOR de la voz de un manual de marca. NO la escribes ni la reescribes: la REVISAS y ASESORAS. Quien la escribió (content-creator) decide qué integra.\n' +
    'Compara la VOZ PROPUESTA con la EVIDENCIA del cliente. Responde SOLO un JSON, sin texto antes ni después:\n' +
    '{"veredicto":"ok"|"ajustar","observaciones":[{"campo":"<campo de la voz>","severidad":"blocker"|"major"|"minor","observacion":"<qué ves>","sugerencia":"<opcional · qué mirarías>"}]}\n' +
    'Reglas: marca blocker o major SOLO si la voz contradice la evidencia, le atribuye al cliente algo que no dijo, presenta como voz del cliente algo copiado de otro lado, o falta o está vacía habiendo evidencia. ' +
    'Lo estilístico, de gusto o de preferencia es minor: se anota y NO obliga. No impongas fórmulas, palabras ni un tono: la creatividad es libre y la decisión es de quien escribe. Máximo 6 observaciones. Si está bien: {"veredicto":"ok","observaciones":[]}.\n\n' +
    'VOZ PROPUESTA:\n' + JSON.stringify(propuesta) + '\n\nEVIDENCIA' + (omitidas.length ? ' (no cupo: ' + omitidas.join(', ') + ')' : '') + ':\n' + JSON.stringify(evidencia);
}
return [{ json: Object.assign({}, j, { _voz_revisar: revisar, _voz_revision_pedido: pedido }) }];`

// ── anotar lo que volvió: se entiende o se declara; nunca detiene la corrida ──────────────────────────────────────────
const CODIGO_ANOTAR = String.raw`// (d) 02-nov · lo que volvió de la revisión de la voz. Asesora: no escribe nada en el borrador. Si no se entiende, la corrida SIGUE y lo declara.
const prev = $('[BB] Voz · pedido de revisión').first().json;
const r = $json || {};
const body = (r.body && typeof r.body === 'object') ? r.body : r;
let texto = typeof body.response === 'string' ? body.response : (typeof body.result === 'string' ? body.result : '');
let rev = (body.revision && typeof body.revision === 'object') ? body.revision : null;
if (!rev && texto) { const m = texto.match(/\{[\s\S]*\}/); if (m) { try { rev = JSON.parse(m[0]); } catch (e) { rev = null; } } }
const SEV = ['blocker', 'major', 'minor'];
const lista = (rev && Array.isArray(rev.observaciones)) ? rev.observaciones : null;
let salida;
if (!lista) {
  salida = { corrio: false, motivo: texto ? 'la respuesta no se entendió como JSON de observaciones' : 'no volvió respuesta', observaciones: [], bloquea: [] };
} else {
  const obs = lista.filter((o) => o && typeof o === 'object').slice(0, 6).map((o) => ({
    campo: String(o.campo == null ? '' : o.campo).slice(0, 60),
    severidad: SEV.indexOf(o.severidad) !== -1 ? o.severidad : 'minor',
    observacion: String(o.observacion == null ? '' : o.observacion).slice(0, 400),
    sugerencia: String(o.sugerencia == null ? '' : o.sugerencia).slice(0, 300),
  })).filter((o) => o.observacion.trim());
  salida = { corrio: true, veredicto: rev.veredicto === 'ajustar' ? 'ajustar' : 'ok', observaciones: obs, bloquea: obs.filter((o) => o.severidad === 'blocker' || o.severidad === 'major') };
}
return [{ json: Object.assign({}, prev, { _voz_revisar: false, _voz_revision: salida }) }];`

// ── el pedido de repetir la voz: lo de hoy + las observaciones del revisor (solo la cola del nodo; el bloque de CC1 queda idéntico) ──
const VIEJO_1 = String.raw`const repetir = !!voz && primeraPasada;
let pedido = '';
if (repetir) {`
const NUEVO_1 = String.raw`// (d) 02-nov · las observaciones graves (blocker/major) del REVISOR de la voz también piden la vuelta al escritor (content-creator); él decide qué integra.
const _rev = (j._voz_revision && Array.isArray(j._voz_revision.bloquea)) ? j._voz_revision.bloquea : [];
const repetir = (!!voz || _rev.length > 0) && primeraPasada;
const _bloqueRev = _rev.length ? '\n\nOBSERVACIONES DEL REVISOR (el editor-en-jefe asesora; tú decides qué integrar y qué no, y puedes dejar una si no estás de acuerdo):\n' + _rev.map((o) => '- ' + o.campo + ' [' + o.severidad + ']: ' + o.observacion + (o.sugerencia ? ' · ' + o.sugerencia : '')).join('\n') : '';
let pedido = '';
if (repetir) {`

const VIEJO_2 = String.raw`  const largo = '\n\nREPARO (la vara de uso de lo disponible):`
const NUEVO_2 = String.raw`  const largo = !voz ? '' : '\n\nREPARO (la vara de uso de lo disponible):`

const VIEJO_3 = String.raw`  const corto = '\n\nREPARO: ' + voz.campo`
const NUEVO_3 = String.raw`  const corto = !voz ? '' : '\n\nREPARO: ' + voz.campo`

const VIEJO_4 = String.raw`  pedido = (original + largo).length <= 15900 ? original + largo : original.slice(0, 15900 - corto.length) + corto;`
const NUEVO_4 = String.raw`  pedido = (original + largo + _bloqueRev).length <= 15900 ? original + largo + _bloqueRev : original.slice(0, 15900 - (corto + _bloqueRev).length) + corto + _bloqueRev;`

export function construirVozConContentCreator(f) {
  // ① quién escribe la voz: content-creator (la lente de la casilla y el pedido de repetirla)
  cambiarParametro(f, LENTE_VOZ, 'jsonBody', '"agent": "editor-en-jefe",', '"agent": "content-creator",')
  cambiarParametro(f, LENTE_VOZ, 'jsonBody', '"lens": "editor-en-jefe" }', '"lens": "content-creator" }')
  cambiarParametro(f, REPETIR_HTTP, 'jsonBody', '"agent": "editor-en-jefe",', '"agent": "content-creator",')
  cambiarParametro(f, REPETIR_HTTP, 'jsonBody', '"lens": "editor-en-jefe", "motivo"', '"lens": "content-creator", "motivo"')
  cambiarCodigo(f, '[BB] Fan-out prep', "{ lens: 'editor-en-jefe', agent: 'editor-en-jefe',", "{ lens: 'editor-en-jefe', agent: 'content-creator',")
  // ② cómo se rotula en el borrador (solo el rótulo; el borrador y su forma no cambian)
  for (const k of ['personalidad,       ', 'tagline_opciones,   ', 'mensajes_clave,      ']) {
    const re = new RegExp(`_nuevo\\(editor, '${k.trim().replace(',', '')}',\\s+'editor-en-jefe',`)
    const n = nodo(f, CAJA)
    const m = n.parameters.jsCode.match(re)
    if (!m) throw new Error(`«${CAJA}»: no hallé la línea de ${k.trim()}`)
    cambiarCodigo(f, CAJA, m[0], m[0].replace("'editor-en-jefe'", "'content-creator'"))
  }
  cambiarCodigo(f, MEZCLAR, "lente: 'editor-en-jefe', reintento_uso: true", "lente: 'content-creator', reintento_uso: true")
  // ③ la red de rescate busca y reintenta al empleado real de la casilla (la casilla conserva su nombre)
  cambiarParametro(f, '[BB] Rescate · leer invocaciones', 'url', 'agent_name=in.(brand-strategist,editor-en-jefe,jefe-client-success)', 'agent_name=in.(brand-strategist,content-creator,jefe-client-success)')
  cambiarCodigo(f, '[BB] Rescate · red 1 · triaje', "if (f && f.agent_name === slug && f.metadata && f.metadata.brand_section) return f.metadata.brand_section;", "if (f && f.agent_name === (slug === 'editor-en-jefe' ? 'content-creator' : slug) && f.metadata && f.metadata.brand_section) return f.metadata.brand_section;")
  cambiarParametro(f, '[BB] Rescate · red 2 · leer lo ya pagado', 'jsonBody', '"agent": "{{ $json._lente }}",', `"agent": "{{ $json._lente === 'editor-en-jefe' ? 'content-creator' : $json._lente }}",`)
  const R3 = '[BB] Rescate · red 3 · fusionar o PARAR'
  cambiarCodigo(f, R3, "const SLUGS = LENTES.map((l) => l[0]);", "const SLUGS = LENTES.map((l) => l[0]);\nconst slotDe = (a) => (a === 'content-creator' ? 'editor-en-jefe' : a);   // (d) la casilla de la voz la contesta content-creator")
  cambiarCodigo(f, R3, "if (typeof agente === 'string' && SLUGS.includes(agente)) lente = agente;", "if (typeof agente === 'string' && SLUGS.includes(slotDe(agente))) lente = slotDe(agente);")
  cambiarCodigo(f, R3, "if (!lente && typeof s.lens === 'string' && SLUGS.includes(s.lens)) lente = s.lens;", "if (!lente && typeof s.lens === 'string' && SLUGS.includes(slotDe(s.lens))) lente = slotDe(s.lens);")

  // ④ la revisión del editor-en-jefe: pedido → ¿se revisa? → llamada → anotar → «¿usó lo disponible?»
  agregarNodo(f, codigo(REVISION.pedido, CODIGO_PEDIDO), CAJA, 160, 520)
  const si = JSON.parse(JSON.stringify(nodo(f, REPETIR_SI)))
  si.name = REVISION.si; si.id = 'voz-rev-si'
  si.parameters.conditions.conditions[0].id = 'voz-rev-c'
  si.parameters.conditions.conditions[0].leftValue = '={{ $json._voz_revisar === true }}'
  agregarNodo(f, si, CAJA, 340, 520)
  const pedir = JSON.parse(JSON.stringify(nodo(f, REPETIR_HTTP)))
  pedir.name = REVISION.http; pedir.id = 'voz-rev-http'
  pedir.parameters.jsonBody = pedir.parameters.jsonBody
    .replace('"agent": "content-creator",', '"agent": "editor-en-jefe",')
    .replace('"step_name": "bb-lens-editor-en-jefe-uso"', '"step_name": "bb-voz-revision"')
    .replace('JSON.stringify($json._uso_pedido_voz)', 'JSON.stringify($json._voz_revision_pedido)')
    .replace('"context": { "role": "brand_book_lens", "lens": "content-creator", "motivo": "uso_de_lo_disponible" }', '"context": { "role": "brand_book_voice_review", "motivo": "revision_de_la_voz" }')
  if (pedir.parameters.jsonBody.indexOf('bb-voz-revision') < 0 || pedir.parameters.jsonBody.indexOf('_voz_revision_pedido') < 0 || pedir.parameters.jsonBody.indexOf('brand_book_voice_review') < 0 || pedir.parameters.jsonBody.indexOf('"agent": "editor-en-jefe"') < 0) throw new Error('la llamada de revisión no quedó como se esperaba: ¿cambió el nodo de repetir la voz?')
  agregarNodo(f, pedir, CAJA, 520, 520)
  agregarNodo(f, codigo(REVISION.anotar, CODIGO_ANOTAR), CAJA, 700, 520)
  redirigir(f, CAJA, USO, REVISION.pedido)
  conectar(f, REVISION.pedido, REVISION.si)
  conectar(f, REVISION.si, REVISION.http, 0)
  conectar(f, REVISION.si, USO, 1)
  conectar(f, REVISION.http, REVISION.anotar)
  conectar(f, REVISION.anotar, USO)

  // ⑤ lo que dice el revisor llega al escritor por el MISMO camino de repetir la voz (tope 1, solo primera pasada)
  cambiarCodigo(f, USO, VIEJO_1, NUEVO_1)
  cambiarCodigo(f, USO, VIEJO_2, NUEVO_2)
  cambiarCodigo(f, USO, VIEJO_3, NUEVO_3)
  cambiarCodigo(f, USO, VIEJO_4, NUEVO_4)
}
