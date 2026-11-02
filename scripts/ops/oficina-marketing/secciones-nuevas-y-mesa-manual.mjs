/**
 * 02-nov · ADENDA 1 (firmada por Emilio 13:42Z; topología confirmada por Lenovo 14:15Z) · SECCIONES NUEVAS DEL MANUAL + MESA CREATIVA + REGLA DE PROPONER.
 * Contrato de la forma del dato: `2026-11-02-CONTRATO-CC1-a-CC6-CC2-secciones-nuevas-del-manual.md` (listas de textos y un texto; `_field_meta.<clave>.estado = 'propuesta_del_agente'`;
 * el texto termina en « [propuesta del agente — razón]»). Los 8 campos nuevos llegan al borrador por nodos nuevos:
 *
 *   ANTES DEL JUEZ (entre «¿hay que repetir la voz?»/«mezclar la voz» y «Judge prep»):
 *     1 · «[BB] Equipo · aportes de los dueños»: dos llamadas EN PARALELO con la evidencia entera por clave:
 *           content-creator → tono_por_canal · reglas_de_escritura · valores · nunca_hace      brand-strategist → historia_y_origen
 *     2 · «[BB] Equipo · mesa creativa»: UNA llamada a `creative-director-mesa` (dirige): escribe direccion_de_fotografia y deja APORTES a las partes creativas
 *           (para content-creator y para el piso visual). Lo estratégico y los datos NO pasan por la mesa. La mesa no reescribe: aporta.
 *     3 · «[BB] Equipo · integración»: si hubo aportes para la voz, content-creator (el creador) decide qué integra; después el estampado (`propuesta_del_agente`) y todo entra al borrador.
 *   DESPUÉS DEL PISO VISUAL (firma de Lenovo 14:15Z: logo y tipografía van en el piso, con lo que se vio en las fotos):
 *     4 · «[BB] Equipo · logo y tipografía»: design-visual-storyteller escribe uso_del_logo y jerarquia_tipografica a partir de lo que el piso OBSERVÓ + los aportes de la mesa; lo revisa
 *           style-consistency-reviewer (la revisión de estilo ya existente lee estos dos campos).
 *   DESPUÉS DE «SACAR LO SIN FUENTE», ANTES DEL PROMOTE:
 *     5 · «[BB] Equipo · el juez anota datos duros sin fuente» (decisión de Emilio, «no rejas»): `market_research_analyst` ANOTA cada teléfono, dirección, horario, precio, fecha o cifra que no
 *           está en la evidencia. La nota queda aparte (`_field_meta.<clave>.notas_del_juez` y `notas_del_juez`); NO borra ni cambia el texto del campo: Emilio la ve y decide al validar.
 *
 * REGLA DE EMILIO en cada llamada (INSTRUCCIÓN, no código): si algo no existe, se PROPONE razonando con lo disponible, rotulado; teléfonos, direcciones, horarios, precios, fechas y cifras NUNCA
 * se inventan: si no están en la evidencia se escribe «falta» (PENDIENTE). Ningún control de código quita ni cambia lo que escriben los agentes.
 * «PEDIR CAMBIOS AL MANUAL» (reparo 1 de CC3): los nodos reciben el pedido del dueño como los lentes, solo corren para los campos que el pedido NOMBRA o LIBERA, y lo que el dueño ya validó
 * (y no liberó ni nombró) no se vuelve a escribir: se conserva el valor del manual vigente. Sin `reescritura` en el sobre, todo es como antes.
 * Nada de esto bloquea: una llamada caída o ilegible se DECLARA y la corrida sigue con lo que hay. Sin campo nuevo, el manual sale como hoy.
 * COSTO (ESTIMADO por medianas; nada ha corrido): +aportes ~0,5 · +mesa ~0,25 · +integración ~0,35 (solo con aportes) · +logo/tipografía ~0,2 · +juez que anota ~0,1–0,25.
 * El tope de gasto de una reescritura se reparte POR LLAMADA (tope ÷ 8), no es un tope total del tramo.
 */
import { agregarNodo, cambiarCodigo, codigo, conectar, nodo, redirigir } from './lib.mjs'
import { ESTILO } from './piso-visual-equipo-manual.mjs'

const PISO = '[BB] Piso visual (antes del Promote · CC#1)'
const JUEZ_PREP = '[BB] Judge prep'
const USO_REPETIR = '[BB] Uso · ¿hay que repetir la voz?'
const USO_MEZCLAR = '[BB] Uso · mezclar la voz'
const SACAR = '[BB] Sacar lo sin fuente (antes del Promote)'
const PROMOTE_PREP = '[BB] Promote prep'
export const EQUIPO = {
  aportes: '[BB] Equipo · aportes de los dueños',
  mesa: '[BB] Equipo · mesa creativa',
  integra: '[BB] Equipo · integración',
  logo: '[BB] Equipo · logo y tipografía',
  notas: '[BB] Equipo · el juez anota datos duros sin fuente',
}

/** los 8 campos y quién los escribe (la tabla del contrato de CC1 + valores/nunca_hace de content-creator) */
export const DUENOS = {
  'content-creator': { tono_por_canal: 'lista', reglas_de_escritura: 'lista', valores: 'lista', nunca_hace: 'lista' },
  'brand-strategist': { historia_y_origen: 'texto' },
  'creative-director-mesa': { direccion_de_fotografia: 'lista' },
  'design-visual-storyteller': { uso_del_logo: 'lista', jerarquia_tipografica: 'lista' },
}

// ───────────────────────── piezas de código que se PEGAN TAL CUAL en los nodos (la prueba EJECUTA este mismo texto) ─────────────────────────
export const COMUN = String.raw`
const j = $json;
const draft = j.brand_book_draft || {};
const grounding = j._grounding_refs || {};
const ayuda = this.helpers;
const API = ($env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app');
const CLIENT = $('Validate Deal Data').first().json.client_id;
const EXEC = String($execution.id);
const ROTULO = 'propuesta del agente';
const t = (v, n) => String(v == null ? '' : v).slice(0, n);
const topeDe = (div) => { try { const r = $('Validate Deal Data').first().json.reescritura; return (r && r.tope_reescritura_usd > 0) ? Math.round(r.tope_reescritura_usd / div * 100) / 100 : 0; } catch (e) { return 0; } };
const REGLA = 'REGLA DEL DUEÑO DEL NEGOCIO: si algo NO existe en la evidencia, no lo dejes vacío: PROPÓNLO razonando con lo disponible (el público ideal, los competidores, el sitio, el perfil, las prácticas del rubro). ' +
  'Todo lo que propongas TERMINA en « [propuesta del agente — razón en una frase]» y lo declaras en _field_meta.<clave>.estado = "propuesta_del_agente". Lo que sí está en la evidencia va sin rótulo y con su cita. ' +
  'EXCEPCIÓN: teléfonos, direcciones, horarios, precios, fechas y cifras NUNCA se inventan: si no están en la evidencia, escribe "falta" (en una lista, un renglón «PENDIENTE — falta <el dato>»). No dejes un campo vacío por no tener el dato duro: propón todo lo demás.';
const seccion = (x) => {
  const b = (x && x.body && typeof x.body === 'object') ? x.body : (x || {});
  let s = b.brand_section || b.structured || null;
  if (!s && typeof b.response === 'string') { const m = b.response.match(/\{[\s\S]*\}/); if (m) { try { s = JSON.parse(m[0]); } catch (e) { s = null; } } }
  return (s && typeof s === 'object' && !Array.isArray(s)) ? s : null;
};
const jsonDeTexto = (x) => {
  const b = (x && x.body && typeof x.body === 'object') ? x.body : (x || {});
  if (b.brand_section && typeof b.brand_section === 'object' && Array.isArray(b.brand_section.aportes)) return b.brand_section;
  if (typeof b.response !== 'string') return null;
  const m = b.response.match(/\{[\s\S]*\}/); if (!m) return null;
  try { const o = JSON.parse(m[0]); return (o && typeof o === 'object') ? o : null; } catch (e) { return null; }
};
const norm = (v, tipo) => {
  let r = v;
  if (r && typeof r === 'object' && !Array.isArray(r) && ('valor' in r)) r = r.valor;
  if (tipo === 'lista') {
    const a = Array.isArray(r) ? r : (typeof r === 'string' && r.trim() ? [r] : []);
    return a.map((x) => (typeof x === 'string' ? x : (x && typeof x === 'object' ? (x.texto || x.valor || '') : String(x == null ? '' : x)))).map((x) => String(x).trim()).filter(Boolean).slice(0, 12).map((x) => x.slice(0, 600));
  }
  return typeof r === 'string' ? r.trim().slice(0, 1800) : '';
};
// la evidencia entra ENTERA POR CLAVE o no entra (nunca un JSON partido); lo que no cupo se declara
const evidenciaHasta = (presupuesto) => {
  const orden = ['materia_cliente', 'discovery_summary', 'icp_signals', 'competitors'].concat(Object.keys(grounding).filter((k) => ['materia_cliente', 'discovery_summary', 'icp_signals', 'competitors'].indexOf(k) === -1));
  let ev = {}; const omitidas = [];
  for (const k of orden) { if (grounding[k] === undefined) continue; const prueba = Object.assign({}, ev, { [k]: grounding[k] }); if (JSON.stringify(prueba).length <= presupuesto) ev = prueba; else omitidas.push(k); }
  return { ev, omitidas };
};
const elegir = (o, claves) => { const r = {}; claves.forEach((k) => { if (o && o[k] !== undefined && o[k] !== null && o[k] !== '' && !(Array.isArray(o[k]) && !o[k].length)) r[k] = o[k]; }); return r; };
const BORRADOR = ['positioning', 'icp_summary', 'vision', 'mision', 'proposito', 'propuestas_de_valor', 'voice_description', 'personalidad', 'tagline_opciones', 'mensajes_clave', 'productos', 'sedes', 'customer_angle'];
const PRESUPUESTO_TAREA = 15500;

// ── «PEDIR CAMBIOS AL MANUAL»: el pedido del dueño llega a estos nodos como a los lentes. Sin reescritura, nada de esto cambia el camino de siempre. ──
const MIOS = ['tono_por_canal', 'reglas_de_escritura', 'valores', 'nunca_hace', 'historia_y_origen', 'direccion_de_fotografia', 'uso_del_logo', 'jerarquia_tipografica'];
const RE = (() => { try { const r = $('Validate Deal Data').first().json.reescritura; return (r && typeof r === 'object' && !Array.isArray(r)) ? r : null; } catch (e) { return null; } })();
const sinTildes = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/_/g, ' ');
const PALABRAS = {
  tono_por_canal: ['tono', 'canal', 'whatsapp', 'instagram', 'facebook', 'tiktok', 'youtube', 'linkedin', 'correo', 'reclamo'],
  reglas_de_escritura: ['regla', 'escritura', 'redaccion', 'redactar', 'emoji', 'mayuscula'],
  valores: ['valores'],
  nunca_hace: ['nunca', 'no dice', 'no hace', 'prohib'],
  historia_y_origen: ['historia', 'origen', 'fundacion', 'fundad'],
  direccion_de_fotografia: ['fotograf', 'foto', 'encuadre', 'video'],
  uso_del_logo: ['logo', 'isotipo'],
  jerarquia_tipografica: ['tipograf', 'tipo de letra', 'letra', 'jerarquia'],
};
const listaDe = (x) => (Array.isArray(x) ? x.map(String).filter(Boolean) : []);
// qué campos de este tramo se escriben: sin reescritura, todos; con ella, los que el pedido NOMBRA o LIBERA; lo validado y no nombrado ni liberado se conserva
const plan = (() => {
  if (!RE) return { reescritura: false, objetivo: MIOS.slice(), protegidos: [], motivo: '' };
  const texto = sinTildes((RE.seccion || '') + ' ' + (RE.cambios_del_dueno || ''));
  const nombrados = MIOS.filter((k) => texto.indexOf(sinTildes(k)) !== -1 || (PALABRAS[k] || []).some((p) => texto.indexOf(p) !== -1));
  const liberados = listaDe(RE.campos_liberados).filter((k) => MIOS.indexOf(k) !== -1);
  const objetivo = MIOS.filter((k) => nombrados.indexOf(k) !== -1 || liberados.indexOf(k) !== -1);
  const protegidos = listaDe(RE.campos_validados).filter((k) => MIOS.indexOf(k) !== -1 && objetivo.indexOf(k) === -1);
  return { reescritura: true, objetivo, protegidos, motivo: objetivo.length ? '' : 'el pedido del dueño no nombra ningún campo de este tramo' };
})();
const vigente = (() => {
  if (!RE) return {};
  let m = RE.manual_vigente;
  if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { m = null; } }
  if (m && typeof m === 'object' && m.brand_book_draft && typeof m.brand_book_draft === 'object') m = m.brand_book_draft;
  return (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
})();
const quiero = (campos) => { const r = {}; Object.keys(campos).forEach((k) => { if (plan.objetivo.indexOf(k) !== -1) r[k] = campos[k]; }); return r; };
// el bloque que se agrega a la tarea (como en los lentes): lo que pidió el dueño y lo que hay hoy en SUS campos
const bloqueRE = (claves) => {
  if (!RE) return '';
  const hoy = elegir(vigente, claves);
  return '\n\n══════ ESTA ES UNA REESCRITURA ══════\nEl dueño pidió cambios sobre el manual vigente. Aplícalos a tus campos; lo que no pidió cambiar, déjalo como está. Lo que pidió el dueño es SU PALABRA: se respeta (si crees que algo no conviene, dilo en tu razón).\n' +
    (RE.seccion ? 'El pedido es sobre la sección «' + t(RE.seccion, 80) + '».\n' : '') + 'LO QUE PIDIÓ EL DUEÑO:\n«' + t(String(RE.cambios_del_dueno == null ? '' : RE.cambios_del_dueno).replace(/\s+/g, ' ').trim(), 2000) + '»\n' +
    'LO QUE HAY HOY EN TUS CAMPOS:\n' + t(JSON.stringify(hoy), 3000) + '\n';
};
// una llamada a un empleado: NUNCA lanza; devuelve { ok, seccion, extra, error }
const llamar = async (agente, paso, tarea, rol, div, espera) => {
  const tope = topeDe(div);
  const cuerpo = Object.assign({ agent: agente, client_id: CLIENT, workflow_id: EXEC, workflow_execution_id: EXEC, step_name: paso, task: String(tarea).slice(0, 15900), context: { role: rol, motivo: 'equipo_del_manual' } }, tope > 0 ? { max_budget_usd: tope } : {});
  try {
    const x = await ayuda.httpRequest({ url: API + '/api/agents/run-sdk', method: 'POST', json: true, timeout: espera || 240000, headers: { 'Content-Type': 'application/json', 'x-api-key': $env.INTERNAL_API_KEY }, body: cuerpo });
    const s = seccion(x);
    const b = (x && x.body && typeof x.body === 'object') ? x.body : (x || {});
    if (!s && !jsonDeTexto(x)) return { ok: false, error: 'la respuesta de ' + agente + ' no se entendió' + (b.error ? ': ' + t(b.error, 100) : ''), seccion: null, extra: null };
    return { ok: true, seccion: s, extra: jsonDeTexto(x), error: '' };
  } catch (e) { return { ok: false, error: 'falló la llamada a ' + agente + ': ' + t((e && e.message) || e, 140), seccion: null, extra: null }; }
};
// de un resultado toma SOLO los campos del dueño que se pidieron (nada más), con su estampado
const tomar = (res, campos, lente) => {
  const out = {}; const meta = {};
  if (res && res.omitida) return { valores: out, meta, falto: [] };
  if (!res || !res.ok) return { valores: out, meta, falto: Object.keys(campos) };
  const fuente = res.seccion || res.extra || {};
  const falto = [];
  for (const k of Object.keys(campos)) {
    const v = norm(fuente[k], campos[k]);
    const vacio = Array.isArray(v) ? v.length === 0 : !v;
    if (vacio) { falto.push(k); continue; }
    out[k] = v;
    const m = (fuente._field_meta && fuente._field_meta[k]) || (fuente._meta && fuente._meta[k]) || {};
    meta[k] = { fuente: t(m.fuente, 200), razon: t(m.razon, 300), lente: lente };
  }
  return { valores: out, meta, falto };
};
`

/** el estampado (se pega en «integración» y en «logo y tipografía»): ningún control quita ni cambia lo que escribió el agente */
export const ESTAMPA = String.raw`
const tienePropuesta = (v) => JSON.stringify(v == null ? '' : v).toLowerCase().indexOf('[' + ROTULO) !== -1;
// el campo que el agente declaró propuesta (o que lleva el rótulo) queda « propuesta_del_agente »; el que dice PENDIENTE es « ausente »
const estampar = (clave, valor, m) => {
  const vacio = Array.isArray(valor) ? valor.every((x) => /^\s*pendiente/i.test(x)) : /^\s*pendiente/i.test(valor);
  if (vacio) return { v: valor, meta: { estado: 'ausente', fuente: '', razon: m.razon || 'falta el dato', lente: m.lente } };
  const declarada = tienePropuesta(valor);
  return { v: valor, meta: { estado: declarada ? 'propuesta_del_agente' : 'provisional', fuente: declarada ? ROTULO : (m.fuente || ''), razon: m.razon || null, lente: m.lente } };
};
`

// ───────────────────────── nodo 1 · aportes de los dueños ─────────────────────────
export const CODIGO_APORTES = String.raw`// (adenda 1) 02-nov · APORTES DE LOS DUEÑOS: content-creator (tono por canal · reglas de escritura · valores · lo que nunca hace) y brand-strategist (historia y origen), EN PARALELO. Nunca bloquea.
// En «Pedir cambios» solo se piden los campos que el pedido nombra o libera.
` + COMUN + String.raw`
if (j._equipo && j._equipo.corrio) return [{ json: j }];
const { ev, omitidas } = evidenciaHasta(plan.reescritura ? 5500 : 7500);
const cuerpoBorrador = JSON.stringify(elegir(draft, BORRADOR));
const DESC = {
  tono_por_canal: 'tono_por_canal: una lista, un renglón por canal que el cliente USA (Instagram, WhatsApp, atención de reclamos, correo…), «Canal: cómo suena y por qué».',
  reglas_de_escritura: 'reglas_de_escritura: lista de reglas concretas de redacción (largo de frase, trato, uso de emojis, mayúsculas, palabras de la marca).',
  valores: 'valores: lista de valores de la marca con su razón.',
  nunca_hace: 'nunca_hace: lista de lo que la marca nunca dice ni hace.',
  historia_y_origen: 'historia_y_origen: un texto breve (3 a 6 frases) con cómo y por qué nació el negocio y lo que lo mueve. Solo hechos de la evidencia; lo que falte se propone rotulado, y las fechas, cifras y nombres de personas que no estén en la evidencia NO se escriben.',
};
const armar = (campos) => {
  const base = 'Eres el DUEÑO de estas secciones del manual de marca de un cliente: ' + campos.join(', ') + '. ' + campos.map((k) => DESC[k]).join(' ') + ' Emite SOLO esos campos con emit_brand_section (y su _field_meta: estado, fuente, razon), en español, sin inventar lo que la evidencia no dice. ' + REGLA + bloqueRE(campos) + '\n\n';
  const cola = '\n\nBORRADOR DEL MANUAL (lo que ya está escrito; sé coherente con él):\n';
  const ev2 = '\n\nEVIDENCIA' + (omitidas.length ? ' (no cupo: ' + omitidas.join(', ') + ')' : '') + ':\n' + JSON.stringify(ev);
  const falta = PRESUPUESTO_TAREA - (base.length + cola.length + ev2.length);
  return base + ev2 + cola + (falta > 0 ? cuerpoBorrador.slice(0, falta) : '');
};
const CAMPOS_CC = quiero({ tono_por_canal: 'lista', reglas_de_escritura: 'lista', valores: 'lista', nunca_hace: 'lista' });
const CAMPOS_BS = quiero({ historia_y_origen: 'texto' });
const omitir = { ok: true, omitida: true, seccion: null, extra: null, error: '' };
const [rcc, rbs] = await Promise.all([
  Object.keys(CAMPOS_CC).length ? llamar('content-creator', 'bb-equipo-aportes-voz', armar(Object.keys(CAMPOS_CC)), 'brand_book_aportes_content_creator', 8, 240000) : omitir,
  Object.keys(CAMPOS_BS).length ? llamar('brand-strategist', 'bb-equipo-aportes-estrategia', armar(Object.keys(CAMPOS_BS)), 'brand_book_aportes_brand_strategist', 8, 240000) : omitir,
]);
const a = tomar(rcc, CAMPOS_CC, 'content-creator');
const b = tomar(rbs, CAMPOS_BS, 'brand-strategist');
const aportes = { valores: Object.assign({}, a.valores, b.valores), meta: Object.assign({}, a.meta, b.meta) };
const declarado = [];
if (plan.reescritura) declarado.push('pedir cambios: este tramo escribe ' + (plan.objetivo.length ? plan.objetivo.join(', ') : 'nada') + (plan.protegidos.length ? ' · conserva lo validado: ' + plan.protegidos.join(', ') : '') + (plan.motivo ? ' · ' + plan.motivo : ''));
if (!rcc.ok) declarado.push(rcc.error); else if (a.falto.length) declarado.push('content-creator no entregó: ' + a.falto.join(', '));
if (!rbs.ok) declarado.push(rbs.error); else if (b.falto.length) declarado.push('brand-strategist no entregó: ' + b.falto.join(', '));
return [{ json: Object.assign({}, j, { _equipo: Object.assign({}, j._equipo || {}, { aportes: aportes, declarado: declarado, evidencia_omitida: omitidas, plan: plan }) }) }];`

// ───────────────────────── nodo 2 · mesa creativa ─────────────────────────
export const CODIGO_MESA = String.raw`// (adenda 1) 02-nov · MESA CREATIVA: creative-director-mesa DIRIGE. Escribe direccion_de_fotografia y deja APORTES a las partes creativas (content-creator · piso visual). No reescribe nada ajeno; lo estratégico y los datos no pasan por ella.
// En «Pedir cambios» solo corre si el pedido nombra o libera la fotografía.
` + COMUN + String.raw`
if (j._equipo && j._equipo.corrio) return [{ json: j }];
const eq = j._equipo || {};
const previo = (eq.aportes && eq.aportes.valores) || {};
const declarado = (eq.declarado || []).slice();
if (plan.objetivo.indexOf('direccion_de_fotografia') === -1) {
  if (plan.reescritura) declarado.push('pedir cambios: la mesa no corre (el pedido no nombra la fotografía)');
  return [{ json: Object.assign({}, j, { _equipo: Object.assign({}, eq, { mesa: { corrio: false, aportes: [] }, declarado: declarado }) }) }];
}
const { ev, omitidas } = evidenciaHasta(plan.reescritura ? 4500 : 6500);
const creativo = Object.assign(elegir(draft, ['voice_description', 'personalidad', 'tagline_opciones', 'mensajes_clave']), elegir(previo, ['tono_por_canal', 'reglas_de_escritura']));
const base = 'Eres quien DIRIGE la mesa creativa del manual de marca de un cliente. Hace falta: (1) emitir con emit_brand_section SOLO direccion_de_fotografia (lista de renglones: luz, encuadre, escenarios, qué mostrar y qué evitar, cómo retratar a la gente y al producto) con su _field_meta; ' +
  '(2) después responder SOLO un JSON {"aportes":[{"para":"content-creator"|"piso_visual","campo":"<tono_por_canal|reglas_de_escritura|uso_del_logo|jerarquia_tipografica>","texto":"<tu aporte concreto>"}]} con lo que tu mirada creativa le suma a la VOZ (para content-creator) o al LOGO y la TIPOGRAFÍA (para piso_visual). ' +
  'Eres un aporte, no una orden: no reescribes ni apruebas nada de otros, y no tocas lo estratégico ni los datos. Máximo 6 aportes, cada uno de una o dos frases. ' + REGLA + bloqueRE(['direccion_de_fotografia']) + '\n\n';
const ev2 = '\n\nEVIDENCIA' + (omitidas.length ? ' (no cupo: ' + omitidas.join(', ') + ')' : '') + ':\n' + JSON.stringify(ev);
const cola = '\n\nPARTES CREATIVAS YA ESCRITAS:\n';
const resto = PRESUPUESTO_TAREA - (base.length + ev2.length + cola.length);
const tarea = base + ev2 + cola + (resto > 0 ? JSON.stringify(creativo).slice(0, resto) : '');
const r = await llamar('creative-director-mesa', 'bb-equipo-mesa-creativa', tarea, 'brand_book_mesa_creativa', 8, 240000);
const m = tomar(r, { direccion_de_fotografia: 'lista' }, 'creative-director-mesa');
const crudos = (r.ok && ((r.extra && Array.isArray(r.extra.aportes)) ? r.extra.aportes : ((r.seccion && Array.isArray(r.seccion.aportes)) ? r.seccion.aportes : []))) || [];
const aportesMesa = crudos.filter((x) => x && typeof x === 'object' && typeof x.texto === 'string' && x.texto.trim()).slice(0, 6).map((x) => ({ para: x.para === 'content-creator' ? 'content-creator' : 'piso_visual', campo: t(x.campo, 40), texto: t(x.texto, 400) }));
if (!r.ok) declarado.push(r.error); else if (m.falto.length) declarado.push('la mesa no entregó direccion_de_fotografia');
const valores = Object.assign({}, previo, m.valores);
const meta = Object.assign({}, (eq.aportes && eq.aportes.meta) || {}, m.meta);
return [{ json: Object.assign({}, j, { _equipo: Object.assign({}, eq, { aportes: { valores: valores, meta: meta }, mesa: { corrio: r.ok, aportes: aportesMesa }, declarado: declarado }) }) }];`

// ───────────────────────── nodo 3 · integración ─────────────────────────
export const CODIGO_INTEGRA = String.raw`// (adenda 1) 02-nov · INTEGRACIÓN: si la mesa dejó aportes para la voz, content-creator (el creador) decide qué integra; después el estampado y todo entra al borrador. Sin aportes no hay llamada.
// En «Pedir cambios» lo validado (y no nombrado ni liberado) vuelve del manual vigente: nunca se pisa.
` + COMUN + ESTAMPA + String.raw`
if (j._equipo && j._equipo.corrio) return [{ json: j }];
const eq = j._equipo || {};
const ap = eq.aportes || { valores: {}, meta: {} };
const valores = Object.assign({}, ap.valores);
const meta = Object.assign({}, ap.meta);
const declarado = (eq.declarado || []).slice();
const paraVoz = ((eq.mesa && eq.mesa.aportes) || []).filter((x) => x.para === 'content-creator');
let integro = 'sin_aportes';
const CAMPOS_VOZ = quiero({ tono_por_canal: 'lista', reglas_de_escritura: 'lista' });
if (paraVoz.length && Object.keys(CAMPOS_VOZ).length && (valores.tono_por_canal || valores.reglas_de_escritura)) {
  const { ev, omitidas } = evidenciaHasta(plan.reescritura ? 3500 : 5500);
  const base = 'Eres el DUEÑO de tono_por_canal y reglas_de_escritura del manual de marca. La mesa creativa te deja APORTES: son aportes, no órdenes. Integra los que mejoren tu trabajo, descarta los que no, y vuelve a emitir con emit_brand_section tus campos COMPLETOS (' + Object.keys(CAMPOS_VOZ).join(' y ') + ', con _field_meta). ' + REGLA + bloqueRE(Object.keys(CAMPOS_VOZ)) + '\n\n';
  const cuerpo = '\n\nTUS CAMPOS ACTUALES:\n' + JSON.stringify(elegir(valores, Object.keys(CAMPOS_VOZ))) + '\n\nAPORTES DE LA MESA:\n' + JSON.stringify(paraVoz);
  const ev2 = '\n\nEVIDENCIA' + (omitidas.length ? ' (no cupo: ' + omitidas.join(', ') + ')' : '') + ':\n' + JSON.stringify(ev);
  const r = await llamar('content-creator', 'bb-equipo-integracion', (base + cuerpo + ev2).slice(0, 15900), 'brand_book_integracion', 8, 240000);
  const i = tomar(r, CAMPOS_VOZ, 'content-creator');
  if (!r.ok) { declarado.push('integración: ' + r.error); integro = 'no_se_pudo'; }
  else { Object.keys(i.valores).forEach((k) => { valores[k] = i.valores[k]; meta[k] = Object.assign({}, meta[k] || {}, i.meta[k]); }); integro = Object.keys(i.valores).length ? 'integrado' : 'sin_cambios'; if (i.falto.length) declarado.push('integración: content-creator dejó sin cambios ' + i.falto.join(', ')); }
}
const nuevo = Object.assign({}, draft);
const metaCampos = Object.assign({}, draft._field_meta || {});
const conPropuesta = (Array.isArray(draft.campos_con_propuesta_del_agente) ? draft.campos_con_propuesta_del_agente : []).slice();
Object.keys(valores).filter((k) => plan.objetivo.indexOf(k) !== -1 && plan.protegidos.indexOf(k) === -1).forEach((k) => {
  const e = estampar(k, valores[k], meta[k] || {});
  nuevo[k] = e.v; metaCampos[k] = e.meta;
  if (e.meta.estado === 'propuesta_del_agente' && conPropuesta.indexOf(k) === -1) conPropuesta.push(k);
});
// pedir cambios: lo que este tramo no escribe vuelve del manual vigente (lo validado nunca se pisa)
const conservados = [];
if (plan.reescritura) {
  const meV = (vigente._field_meta && typeof vigente._field_meta === 'object') ? vigente._field_meta : {};
  MIOS.filter((k) => plan.objetivo.indexOf(k) === -1).forEach((k) => {
    const v = vigente[k];
    const hay = Array.isArray(v) ? v.length > 0 : (typeof v === 'string' && v.trim().length > 0);
    if (!hay) return;
    nuevo[k] = v; if (meV[k]) metaCampos[k] = meV[k]; conservados.push(k);
    if (tienePropuesta(v) && conPropuesta.indexOf(k) === -1) conPropuesta.push(k);
  });
}
nuevo._field_meta = metaCampos;
if (conPropuesta.length) nuevo.campos_con_propuesta_del_agente = conPropuesta;
const sal = Object.assign({}, eq, { corrio: true, integracion: integro, declarado: declarado, conservados: conservados, aportes_piso: ((eq.mesa && eq.mesa.aportes) || []).filter((x) => x.para === 'piso_visual') });
delete sal.aportes;
return [{ json: Object.assign({}, j, { brand_book_draft: nuevo, _equipo: sal }) }];`

// ───────────────────────── nodo 4 · logo y tipografía (después del piso visual) ─────────────────────────
export const CODIGO_LOGO = String.raw`// (adenda 1) 02-nov · LOGO Y TIPOGRAFÍA en el PISO VISUAL (firma de Lenovo): design-visual-storyteller las escribe con lo que el piso OBSERVÓ en las fotos (colores, letras, logo) + los aportes de la mesa. Nunca bloquea.
// En «Pedir cambios» solo corre si el pedido nombra o libera el logo o la tipografía; lo validado no se pisa (ya volvió del manual vigente en la integración).
` + COMUN + ESTAMPA + String.raw`
const eq = j._equipo || {};
const CAMPOS_LOGO = quiero({ uso_del_logo: 'lista', jerarquia_tipografica: 'lista' });
const declarado = (eq.declarado || []).slice();
if (!Object.keys(CAMPOS_LOGO).length) {
  if (plan.reescritura) declarado.push('pedir cambios: logo y tipografía no corren (el pedido no los nombra)');
  return [{ json: Object.assign({}, j, { _equipo: Object.assign({}, eq, { declarado: declarado, logo_corrio: false }) }) }];
}
const visual = (draft.visual && typeof draft.visual === 'object') ? draft.visual : null;
const observado = visual ? elegir(visual, ['capa_grafica', 'reglas', 'capa_producto', 'muestra']) : {};
const hayObservado = Object.keys(observado).length > 0;
const { ev, omitidas } = evidenciaHasta(plan.reescritura ? 3500 : 5000);
const base = 'Eres el DUEÑO de ' + Object.keys(CAMPOS_LOGO).join(' y ') + ' del manual de marca. uso_del_logo: lista de reglas de uso del logo (versiones, fondos, márgenes, tamaño mínimo, qué no hacer). jerarquia_tipografica: lista de niveles (título, subtítulo, cuerpo, destacados) con la letra y el peso que la marca usa. ' +
  (hayObservado ? 'PARTE DE LO QUE EL PISO VISUAL OBSERVÓ en las fotos del cliente (colores, letras y logo reales): eso manda sobre cualquier suposición. ' : 'El piso visual no trajo lo observado de las fotos: propón con la evidencia y rotula. ') +
  'Emite SOLO esos campos con emit_brand_section (y su _field_meta). ' + REGLA + bloqueRE(Object.keys(CAMPOS_LOGO)) + '\n\n';
const obs = '\n\nLO QUE EL PISO VISUAL OBSERVÓ:\n' + JSON.stringify(observado);
const aportesMesa = (eq.aportes_piso || []).length ? '\n\nAPORTES DE LA MESA CREATIVA (aportes, no órdenes; integra los que sirvan):\n' + JSON.stringify(eq.aportes_piso) : '';
const ev2 = '\n\nEVIDENCIA' + (omitidas.length ? ' (no cupo: ' + omitidas.join(', ') + ')' : '') + ':\n' + JSON.stringify(ev);
const r = await llamar('design-visual-storyteller', 'bb-equipo-logo-tipografia', (base + aportesMesa + ev2 + obs).slice(0, 15900), 'brand_book_logo_tipografia', 8, 240000);
const g = tomar(r, CAMPOS_LOGO, 'design-visual-storyteller');
if (!r.ok) declarado.push('logo y tipografía: ' + r.error); else if (g.falto.length) declarado.push('design-visual-storyteller no entregó: ' + g.falto.join(', '));
const nuevo = Object.assign({}, draft);
const metaCampos = Object.assign({}, draft._field_meta || {});
const conPropuesta = (Array.isArray(draft.campos_con_propuesta_del_agente) ? draft.campos_con_propuesta_del_agente : []).slice();
Object.keys(g.valores).filter((k) => plan.protegidos.indexOf(k) === -1).forEach((k) => {
  const e = estampar(k, g.valores[k], g.meta[k] || {});
  nuevo[k] = e.v; metaCampos[k] = e.meta;
  if (e.meta.estado === 'propuesta_del_agente' && conPropuesta.indexOf(k) === -1) conPropuesta.push(k);
});
nuevo._field_meta = metaCampos;
if (conPropuesta.length) nuevo.campos_con_propuesta_del_agente = conPropuesta;
return [{ json: Object.assign({}, j, { brand_book_draft: nuevo, _equipo: Object.assign({}, eq, { declarado: declarado, logo_corrio: r.ok }) }) }];`

// ───────────────────────── nodo 5 · el juez ANOTA los datos duros sin fuente (no borra, no cambia) ─────────────────────────
export const CODIGO_NOTAS = String.raw`// (adenda 1) 02-nov · DECISIÓN DE EMILIO («no rejas, para eso tenemos un gran equipo razonando»): el juez de fidelidad (market_research_analyst) ANOTA cada dato duro
// (teléfono, dirección, horario, precio, fecha o cifra) que NO está en la evidencia. La nota queda APARTE del texto; NO se borra ni se cambia nada del manual. Emilio la ve y decide al validar. Nunca bloquea.
` + COMUN + String.raw`
const eq = j._equipo || {};
const declarado = (eq.declarado || []).slice();
const REVISADOS = ['positioning', 'icp_summary', 'voice_description', 'customer_angle', 'retention_notes', 'vision', 'mision', 'proposito', 'propuestas_de_valor', 'productos', 'sedes'].concat(MIOS);
const cuerpo = elegir(draft, REVISADOS);
if (!Object.keys(cuerpo).length) return [{ json: Object.assign({}, j, { _equipo: Object.assign({}, eq, { datos_duros_juez: { corrio: false, motivo: 'no hay campos que revisar' }, declarado: declarado }) }) }];
const { ev, omitidas } = evidenciaHasta(6500);
const cabeza = 'Eres el evaluador de FIDELIDAD de un manual de marca. ANOTA (no corriges, no borras, no puntúas) cada DATO DURO escrito en los CAMPOS que NO aparece en la EVIDENCIA: teléfonos, direcciones, horarios, precios, fechas o años, y cifras (cantidad de socios, de sedes, de años…). ' +
  'Un dato que sí está en la evidencia (aunque con otro formato: espacios, puntos, mayúsculas) NO se anota. Las frases de estilo («máximo 3 líneas») y las propuestas de redacción no son datos duros. ' +
  'Responde SOLO este JSON: {"notas":[{"campo":"<clave del campo>","dato":"<el dato COPIADO tal cual del campo>","motivo":"<por qué no hay fuente en la evidencia>"}]}. Si todo tiene fuente: {"notas":[]}. Máximo 20 notas.\n\n';
const ev2 = 'EVIDENCIA' + (omitidas.length ? ' (no cupo: ' + omitidas.join(', ') + ')' : '') + ':\n' + JSON.stringify(ev) + '\n\nCAMPOS:\n';
const resto = PRESUPUESTO_TAREA - (cabeza.length + ev2.length);
const r = await llamar('market_research_analyst', 'bb-equipo-juez-datos-duros', cabeza + ev2 + JSON.stringify(cuerpo).slice(0, Math.max(0, resto)), 'brand_book_datos_duros', 8, 240000);
const crudas = (r.ok && r.extra && Array.isArray(r.extra.notas)) ? r.extra.notas : [];
const texto = (v) => sinTildes(JSON.stringify(v == null ? '' : v)).replace(/\s+/g, ' ');
const notas = []; let descartadas = 0;
crudas.slice(0, 20).forEach((n) => {
  const campo = n && typeof n.campo === 'string' ? n.campo : '';
  const dato = n && typeof n.dato === 'string' ? n.dato.trim() : '';
  // una nota solo vale si el dato está TAL CUAL en ese campo (el juez no inventa datos que anotar)
  if (!dato || REVISADOS.indexOf(campo) === -1 || !(campo in cuerpo) || texto(cuerpo[campo]).indexOf(sinTildes(dato).replace(/\s+/g, ' ')) === -1) { descartadas++; return; }
  notas.push({ campo: campo, dato: t(dato, 160), motivo: t(n.motivo, 300) });
});
const nuevo = Object.assign({}, draft);
if (notas.length) {
  const metaCampos = Object.assign({}, draft._field_meta || {});
  notas.forEach((n) => { const m = Object.assign({}, metaCampos[n.campo] || {}); m.notas_del_juez = (m.notas_del_juez || []).concat([{ dato: n.dato, motivo: n.motivo }]); metaCampos[n.campo] = m; });
  nuevo._field_meta = metaCampos;
  nuevo.notas_del_juez = notas;
}
if (!r.ok) declarado.push('el juez de datos duros: ' + r.error);
return [{ json: Object.assign({}, j, { brand_book_draft: nuevo, _equipo: Object.assign({}, eq, { datos_duros_juez: { corrio: r.ok, notas_n: notas.length, descartadas: descartadas, evidencia_omitida: omitidas }, declarado: declarado }) }) }];`

export function construirSeccionesNuevasYMesa(f) {
  // el piso y la revisión de estilo deben existir (esta parte se apoya en (c2))
  nodo(f, ESTILO.pedido)
  // ① tramo antes del juez: aportes → mesa → integración → Judge prep
  agregarNodo(f, codigo(EQUIPO.aportes, CODIGO_APORTES), USO_MEZCLAR, 220, -260)
  agregarNodo(f, codigo(EQUIPO.mesa, CODIGO_MESA), USO_MEZCLAR, 440, -260)
  agregarNodo(f, codigo(EQUIPO.integra, CODIGO_INTEGRA), USO_MEZCLAR, 660, -260)
  redirigir(f, USO_REPETIR, JUEZ_PREP, EQUIPO.aportes, 1)   // «no hay que repetir la voz» (salida 1)
  redirigir(f, USO_MEZCLAR, JUEZ_PREP, EQUIPO.aportes)
  conectar(f, EQUIPO.aportes, EQUIPO.mesa)
  conectar(f, EQUIPO.mesa, EQUIPO.integra)
  conectar(f, EQUIPO.integra, JUEZ_PREP)
  // ② logo y tipografía: después del piso, antes de la revisión de estilo (que ahora los lee también)
  agregarNodo(f, codigo(EQUIPO.logo, CODIGO_LOGO), PISO, 90, 220)
  redirigir(f, PISO, ESTILO.pedido, EQUIPO.logo)
  conectar(f, EQUIPO.logo, ESTILO.pedido)
  cambiarCodigo(f, ESTILO.pedido,
    "  const cuerpoVisual = elegir(visual, ['estado', 'capa_grafica', 'reglas', 'capa_producto', 'muestra']);\n",
    "  const cuerpoVisual = Object.assign(elegir(visual, ['estado', 'capa_grafica', 'reglas', 'capa_producto', 'muestra']), elegir(draft, ['uso_del_logo', 'jerarquia_tipografica']));\n")
  // ③ el juez anota los datos duros sin fuente: después de «Sacar lo sin fuente», antes del Promote
  agregarNodo(f, codigo(EQUIPO.notas, CODIGO_NOTAS), SACAR, 220, 0)
  redirigir(f, SACAR, PROMOTE_PREP, EQUIPO.notas)
  conectar(f, EQUIPO.notas, PROMOTE_PREP)
}
