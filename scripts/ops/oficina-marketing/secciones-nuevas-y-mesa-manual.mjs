/**
 * 02-nov · ADENDA 1 (firmada por Emilio 13:42Z; topología confirmada por Lenovo 14:15Z) · SECCIONES NUEVAS DEL MANUAL + MESA CREATIVA + REGLA DE PROPONER.
 * Contrato de la forma del dato: `2026-11-02-CONTRATO-CC1-a-CC6-CC2-secciones-nuevas-del-manual.md` (listas de textos y un texto; `_field_meta.<clave>.estado = 'propuesta_del_agente'`;
 * el texto termina en « [propuesta del agente — razón]»). Los 11 campos nuevos o con dueño nuevo llegan al borrador por tres nodos nuevos:
 *
 *   ANTES DEL JUEZ (entre «¿hay que repetir la voz?»/«mezclar la voz» y «Judge prep»):
 *     1 · «[BB] Equipo · aportes de los dueños»: dos llamadas EN PARALELO con la evidencia entera por clave:
 *           content-creator → tono_por_canal · reglas_de_escritura · valores · nunca_hace      brand-strategist → historia_y_origen
 *     2 · «[BB] Equipo · mesa creativa»: UNA llamada a `creative-director-mesa` (dirige): escribe direccion_de_fotografia y deja APORTES a las partes creativas
 *           (para content-creator y para el piso visual). Lo estratégico y los datos NO pasan por la mesa. La mesa no reescribe: aporta.
 *     3 · «[BB] Equipo · integración y guarda de datos duros»: si hubo aportes para content-creator, él decide qué integra (el creador integra); después la GUARDA POR CÓDIGO de datos duros
 *           y el estampado (`propuesta_del_agente`) de cada campo. Sin aportes no hay llamada.
 *   DESPUÉS DEL PISO VISUAL (firma de Lenovo 14:15Z: logo y tipografía van en el piso, con lo que se vio en las fotos):
 *     4 · «[BB] Equipo · logo y tipografía»: design-visual-storyteller escribe uso_del_logo y jerarquia_tipografica a partir de lo que el piso OBSERVÓ + los aportes de la mesa; lo revisa
 *           style-consistency-reviewer (la revisión de estilo ya existente lee estos dos campos).
 *
 * REGLA DE EMILIO en cada llamada: si algo no existe, se PROPONE razonando con lo disponible, rotulado; teléfonos, direcciones, horarios, precios, fechas y cifras NUNCA se inventan → PENDIENTE.
 * SIN REJAS a los agentes: lo único que el código quita es un DATO DURO que no está en lo que se sabe del cliente (veracidad, no estilo); todo se declara en `_equipo`.
 * Nada de esto bloquea: una llamada caída o ilegible se DECLARA y la corrida sigue con lo que hay. Sin campo nuevo, el manual sale como hoy.
 * COSTO (ESTIMADO por medianas; nada ha corrido): +aportes ~0,5 · +mesa ~0,25 · +integración ~0,35 (solo con aportes) · +logo/tipografía ~0,2.
 */
import { agregarNodo, cambiarCodigo, codigo, conectar, nodo, redirigir } from './lib.mjs'
import { ESTILO } from './piso-visual-equipo-manual.mjs'

const PISO = '[BB] Piso visual (antes del Promote · CC#1)'
const JUEZ_PREP = '[BB] Judge prep'
const USO_REPETIR = '[BB] Uso · ¿hay que repetir la voz?'
const USO_MEZCLAR = '[BB] Uso · mezclar la voz'
export const EQUIPO = {
  aportes: '[BB] Equipo · aportes de los dueños',
  mesa: '[BB] Equipo · mesa creativa',
  integra: '[BB] Equipo · integración y guarda de datos duros',
  logo: '[BB] Equipo · logo y tipografía',
}

/** los 11 campos y quién los escribe (la tabla del contrato de CC1 + valores/nunca_hace de content-creator) */
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
  'EXCEPCIÓN: teléfonos, direcciones, horarios, precios, fechas y cifras NUNCA se inventan: si faltan, escribe PENDIENTE (en una lista, un renglón «PENDIENTE — falta <el dato>»). No dejes un campo vacío por no tener el dato duro: propón todo lo demás.';
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
// una llamada a un empleado: NUNCA lanza; devuelve { ok, seccion, texto, aportes, error }
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
// pone en un resultado { clave: valor } lo que el dueño entregó de SUS campos (nada más), con su estampado
const tomar = (res, campos, lente) => {
  const out = {}; const meta = {};
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

/** la guarda de DATOS DUROS por código + el estampado (se pega en «integración» y en «logo y tipografía») */
export const GUARDA = String.raw`
// ── GUARDA DE DATOS DUROS (veracidad, no estilo): un teléfono, precio, horario, año o cifra que NO está en lo que se sabe del cliente no puede quedar como hecho ──
const corrido = (s) => String(s == null ? '' : s).replace(/[.,:]/g, '');
const CONOCIDO = (() => {
  const fuente = JSON.stringify(grounding) + ' ' + JSON.stringify(Object.assign({}, draft, { tono_por_canal: undefined, reglas_de_escritura: undefined, historia_y_origen: undefined, direccion_de_fotografia: undefined, uso_del_logo: undefined, jerarquia_tipografica: undefined, valores: undefined, nunca_hace: undefined, _field_meta: undefined, _equipo: undefined }));
  const s = new Set(); const re = /\d+(?:[.,:]\d+)*/g; let m;
  while ((m = re.exec(fuente))) s.add(corrido(m[0]));
  return s;
})();
const PATRONES = [
  /\+?\d[\d\s().-]{6,}\d/g,                                  // teléfono
  /[$€]\s?\d[\d.,]*|\d[\d.,]*\s?(?:usd|dólares|dolares|euros)\b/gi,   // precio
  /\b(?:19|20)\d{2}\b/g,                                     // año
  /\b\d{1,2}\s?(?:[:h]\s?\d{2}|h\b|am\b|pm\b|hrs?\b|horas\b)/gi,   // hora
  /\b\d{1,2}\s*(?:a|-|–|hasta)\s*\d{1,2}\s?(?:h\b|hrs?\b|horas\b|am\b|pm\b)/gi,   // rango de horas («de 8 a 20h»)
  /\b(?:calle|av\.?|avenida|km|carrera)\s+[^.;,]*\d+/gi,    // dirección
];
const duros = (txt) => {
  const fuera = String(txt).replace(/\[propuesta del agente[^\]]*\]?/gi, ' ');
  const hallados = [];
  PATRONES.forEach((re) => { const r = new RegExp(re.source, re.flags); let m; while ((m = r.exec(fuera))) { (m[0].match(/\d+(?:[.,:]\d+)*/g) || []).forEach((d) => hallados.push(corrido(d))); } });
  return hallados.filter((d) => d.length > 0 && !CONOCIDO.has(d));
};
// en historia_y_origen TODA cifra es un hecho del negocio (años, socios, locales): no basta el patrón
const cifras = (txt) => (String(txt).replace(/\[propuesta del agente[^\]]*\]?/gi, ' ').match(/\d+(?:[.,:]\d+)*/g) || []).map(corrido).filter((d) => !CONOCIDO.has(d));
const ESTRICTOS = { historia_y_origen: true };
const quitados = [];
const guardar = (clave, valor) => {
  const sin = ESTRICTOS[clave] ? cifras : duros;
  const falta = 'PENDIENTE — falta el dato duro (' + clave + '): no está en lo que se sabe del cliente';
  if (Array.isArray(valor)) {
    const buenos = valor.filter((it) => { const x = sin(it); if (x.length) { quitados.push({ campo: clave, texto: t(it, 120), dato: x.slice(0, 3) }); return false; } return true; });
    return buenos.length ? buenos : [falta];
  }
  const rot = (String(valor).match(/\s*\[propuesta del agente[^\]]*\]?\s*$/i) || [''])[0];
  const cuerpo = String(valor).slice(0, String(valor).length - rot.length);
  const frases = cuerpo.split(/(?<=[.!?])\s+/).filter(Boolean);
  const buenas = frases.filter((fr) => { const x = sin(fr); if (x.length) { quitados.push({ campo: clave, texto: t(fr, 120), dato: x.slice(0, 3) }); return false; } return true; });
  return buenas.length ? buenas.join(' ').trim() + rot : falta;
};
const tienePropuesta = (v) => JSON.stringify(v == null ? '' : v).toLowerCase().indexOf('[' + ROTULO) !== -1;
// el estampado: el campo que el agente declaró propuesta (o que lleva el rótulo) queda « propuesta_del_agente »; el PENDIENTE es « ausente »; el rótulo se completa si faltaba
const estampar = (clave, valor, m) => {
  const vacio = Array.isArray(valor) ? valor.every((x) => /^\s*pendiente/i.test(x)) : /^\s*pendiente/i.test(valor);
  if (vacio) return { v: valor, meta: { estado: 'ausente', fuente: '', razon: m.razon || 'falta el dato duro', lente: m.lente } };
  const declarada = tienePropuesta(valor);
  return { v: valor, meta: { estado: declarada ? 'propuesta_del_agente' : 'provisional', fuente: declarada ? ROTULO : (m.fuente || ''), razon: m.razon || null, lente: m.lente } };
};
`

// ───────────────────────── nodo 1 · aportes de los dueños ─────────────────────────
export const CODIGO_APORTES = String.raw`// (adenda 1) 02-nov · APORTES DE LOS DUEÑOS: content-creator (tono por canal · reglas de escritura · valores · lo que nunca hace) y brand-strategist (historia y origen), EN PARALELO. Nunca bloquea.
` + COMUN + String.raw`
if (j._equipo && j._equipo.corrio) return [{ json: j }];
const { ev, omitidas } = evidenciaHasta(7500);
const cuerpoBorrador = JSON.stringify(elegir(draft, BORRADOR));
const armar = (campos, rol, ayudaTxt) => {
  const base = 'Eres el DUEÑO de estas secciones del manual de marca de un cliente: ' + campos.join(', ') + '. ' + ayudaTxt + ' Emite SOLO esos campos con emit_brand_section (y su _field_meta: estado, fuente, razon), en español, sin inventar lo que la evidencia no dice. ' + REGLA + '\n\n';
  const cola = '\n\nBORRADOR DEL MANUAL (lo que ya está escrito; sé coherente con él):\n';
  const ev2 = '\n\nEVIDENCIA' + (omitidas.length ? ' (no cupo: ' + omitidas.join(', ') + ')' : '') + ':\n' + JSON.stringify(ev);
  const falta = PRESUPUESTO_TAREA - (base.length + cola.length + ev2.length);
  return base + ev2.slice(0, ev2.length) + cola + (falta > 0 ? cuerpoBorrador.slice(0, falta) : '');
};
const PEDIDO_CC = armar(['tono_por_canal', 'reglas_de_escritura', 'valores', 'nunca_hace'], 'content-creator',
  'tono_por_canal: una lista, un renglón por canal que el cliente USA (Instagram, WhatsApp, atención de reclamos, correo…), «Canal: cómo suena y por qué». reglas_de_escritura: lista de reglas concretas de redacción (largo de frase, trato, uso de emojis, mayúsculas, palabras de la marca). valores: lista de valores de la marca con su razón. nunca_hace: lista de lo que la marca nunca dice ni hace.');
const PEDIDO_BS = armar(['historia_y_origen'], 'brand-strategist',
  'historia_y_origen: un texto breve (3 a 6 frases) con cómo y por qué nació el negocio y lo que lo mueve. Solo hechos de la evidencia; lo que falte se propone rotulado, y las fechas, cifras y nombres de personas que no estén en la evidencia NO se escriben.');
const [rcc, rbs] = await Promise.all([
  llamar('content-creator', 'bb-equipo-aportes-voz', PEDIDO_CC, 'brand_book_aportes_content_creator', 8, 240000),
  llamar('brand-strategist', 'bb-equipo-aportes-estrategia', PEDIDO_BS, 'brand_book_aportes_brand_strategist', 8, 240000),
]);
const a = tomar(rcc, { tono_por_canal: 'lista', reglas_de_escritura: 'lista', valores: 'lista', nunca_hace: 'lista' }, 'content-creator');
const b = tomar(rbs, { historia_y_origen: 'texto' }, 'brand-strategist');
const aportes = { valores: Object.assign({}, a.valores, b.valores), meta: Object.assign({}, a.meta, b.meta) };
const declarado = [];
if (!rcc.ok) declarado.push(rcc.error); else if (a.falto.length) declarado.push('content-creator no entregó: ' + a.falto.join(', '));
if (!rbs.ok) declarado.push(rbs.error); else if (b.falto.length) declarado.push('brand-strategist no entregó: ' + b.falto.join(', '));
return [{ json: Object.assign({}, j, { _equipo: Object.assign({}, j._equipo || {}, { aportes: aportes, declarado: declarado, evidencia_omitida: omitidas }) }) }];`

// ───────────────────────── nodo 2 · mesa creativa ─────────────────────────
export const CODIGO_MESA = String.raw`// (adenda 1) 02-nov · MESA CREATIVA: creative-director-mesa DIRIGE. Escribe direccion_de_fotografia y deja APORTES a las partes creativas (content-creator · piso visual). No reescribe nada ajeno; lo estratégico y los datos no pasan por ella.
` + COMUN + String.raw`
if (j._equipo && j._equipo.corrio) return [{ json: j }];
const eq = j._equipo || {};
const previo = (eq.aportes && eq.aportes.valores) || {};
const { ev, omitidas } = evidenciaHasta(6500);
const creativo = Object.assign(elegir(draft, ['voice_description', 'personalidad', 'tagline_opciones', 'mensajes_clave']), elegir(previo, ['tono_por_canal', 'reglas_de_escritura']));
const base = 'Eres quien DIRIGE la mesa creativa del manual de marca de un cliente. Hace falta: (1) emitir con emit_brand_section SOLO direccion_de_fotografia (lista de renglones: luz, encuadre, escenarios, qué mostrar y qué evitar, cómo retratar a la gente y al producto) con su _field_meta; ' +
  '(2) después responder SOLO un JSON {"aportes":[{"para":"content-creator"|"piso_visual","campo":"<tono_por_canal|reglas_de_escritura|uso_del_logo|jerarquia_tipografica>","texto":"<tu aporte concreto>"}]} con lo que tu mirada creativa le suma a la VOZ (para content-creator) o al LOGO y la TIPOGRAFÍA (para piso_visual). ' +
  'Eres un aporte, no una orden: no reescribes ni apruebas nada de otros, y no tocas lo estratégico ni los datos. Máximo 6 aportes, cada uno de una o dos frases. ' + REGLA + '\n\n';
const ev2 = '\n\nEVIDENCIA' + (omitidas.length ? ' (no cupo: ' + omitidas.join(', ') + ')' : '') + ':\n' + JSON.stringify(ev);
const cola = '\n\nPARTES CREATIVAS YA ESCRITAS:\n';
const resto = PRESUPUESTO_TAREA - (base.length + ev2.length + cola.length);
const tarea = base + ev2 + cola + (resto > 0 ? JSON.stringify(creativo).slice(0, resto) : '');
const r = await llamar('creative-director-mesa', 'bb-equipo-mesa-creativa', tarea, 'brand_book_mesa_creativa', 8, 240000);
const m = tomar(r, { direccion_de_fotografia: 'lista' }, 'creative-director-mesa');
const crudos = (r.ok && ((r.extra && Array.isArray(r.extra.aportes)) ? r.extra.aportes : ((r.seccion && Array.isArray(r.seccion.aportes)) ? r.seccion.aportes : []))) || [];
const aportesMesa = crudos.filter((x) => x && typeof x === 'object' && typeof x.texto === 'string' && x.texto.trim()).slice(0, 6).map((x) => ({ para: x.para === 'content-creator' ? 'content-creator' : 'piso_visual', campo: t(x.campo, 40), texto: t(x.texto, 400) }));
const declarado = (eq.declarado || []).slice();
if (!r.ok) declarado.push(r.error); else if (m.falto.length) declarado.push('la mesa no entregó direccion_de_fotografia');
const valores = Object.assign({}, previo, m.valores);
const meta = Object.assign({}, (eq.aportes && eq.aportes.meta) || {}, m.meta);
return [{ json: Object.assign({}, j, { _equipo: Object.assign({}, eq, { aportes: { valores: valores, meta: meta }, mesa: { corrio: r.ok, aportes: aportesMesa }, declarado: declarado }) }) }];`

// ───────────────────────── nodo 3 · integración + guarda ─────────────────────────
export const CODIGO_INTEGRA = String.raw`// (adenda 1) 02-nov · INTEGRACIÓN: si la mesa dejó aportes para la voz, content-creator (el creador) decide qué integra; después la GUARDA de datos duros y el estampado, y todo entra al borrador. Sin aportes no hay llamada.
` + COMUN + GUARDA + String.raw`
if (j._equipo && j._equipo.corrio) return [{ json: j }];
const eq = j._equipo || {};
const ap = eq.aportes || { valores: {}, meta: {} };
const valores = Object.assign({}, ap.valores);
const meta = Object.assign({}, ap.meta);
const declarado = (eq.declarado || []).slice();
const paraVoz = ((eq.mesa && eq.mesa.aportes) || []).filter((x) => x.para === 'content-creator');
let integro = 'sin_aportes';
if (paraVoz.length && (valores.tono_por_canal || valores.reglas_de_escritura)) {
  const { ev, omitidas } = evidenciaHasta(5500);
  const base = 'Eres el DUEÑO de tono_por_canal y reglas_de_escritura del manual de marca. La mesa creativa te deja APORTES: son aportes, no órdenes. Integra los que mejoren tu trabajo, descarta los que no, y vuelve a emitir con emit_brand_section tus dos campos COMPLETOS (tono_por_canal y reglas_de_escritura, con _field_meta). ' + REGLA + '\n\n';
  const cuerpo = '\n\nTUS CAMPOS ACTUALES:\n' + JSON.stringify(elegir(valores, ['tono_por_canal', 'reglas_de_escritura'])) + '\n\nAPORTES DE LA MESA:\n' + JSON.stringify(paraVoz);
  const ev2 = '\n\nEVIDENCIA' + (omitidas.length ? ' (no cupo: ' + omitidas.join(', ') + ')' : '') + ':\n' + JSON.stringify(ev);
  const r = await llamar('content-creator', 'bb-equipo-integracion', (base + cuerpo + ev2).slice(0, 15900), 'brand_book_integracion', 8, 240000);
  const i = tomar(r, { tono_por_canal: 'lista', reglas_de_escritura: 'lista' }, 'content-creator');
  if (!r.ok) { declarado.push('integración: ' + r.error); integro = 'no_se_pudo'; }
  else { Object.keys(i.valores).forEach((k) => { valores[k] = i.valores[k]; meta[k] = Object.assign({}, meta[k] || {}, i.meta[k]); }); integro = Object.keys(i.valores).length ? 'integrado' : 'sin_cambios'; if (i.falto.length) declarado.push('integración: content-creator dejó sin cambios ' + i.falto.join(', ')); }
}
const nuevo = Object.assign({}, draft);
const metaCampos = Object.assign({}, draft._field_meta || {});
const conPropuesta = (Array.isArray(draft.campos_con_propuesta_del_agente) ? draft.campos_con_propuesta_del_agente : []).slice();
Object.keys(valores).forEach((k) => {
  const g = guardar(k, valores[k]);
  const e = estampar(k, g, meta[k] || {});
  nuevo[k] = e.v; metaCampos[k] = e.meta;
  if (e.meta.estado === 'propuesta_del_agente' && conPropuesta.indexOf(k) === -1) conPropuesta.push(k);
});
nuevo._field_meta = metaCampos;
if (conPropuesta.length) nuevo.campos_con_propuesta_del_agente = conPropuesta;
const sal = Object.assign({}, eq, { corrio: true, integracion: integro, declarado: declarado, guarda_datos_duros: quitados, aportes_piso: ((eq.mesa && eq.mesa.aportes) || []).filter((x) => x.para === 'piso_visual') });
delete sal.aportes;
return [{ json: Object.assign({}, j, { brand_book_draft: nuevo, _equipo: sal }) }];`

// ───────────────────────── nodo 4 · logo y tipografía (después del piso visual) ─────────────────────────
export const CODIGO_LOGO = String.raw`// (adenda 1) 02-nov · LOGO Y TIPOGRAFÍA en el PISO VISUAL (firma de Lenovo): design-visual-storyteller las escribe con lo que el piso OBSERVÓ en las fotos (colores, letras, logo) + los aportes de la mesa. Nunca bloquea.
` + COMUN + GUARDA + String.raw`
const eq = j._equipo || {};
const visual = (draft.visual && typeof draft.visual === 'object') ? draft.visual : null;
const observado = visual ? elegir(visual, ['capa_grafica', 'reglas', 'capa_producto', 'muestra']) : {};
const hayObservado = Object.keys(observado).length > 0;
const { ev, omitidas } = evidenciaHasta(5000);
const base = 'Eres el DUEÑO de uso_del_logo y jerarquia_tipografica del manual de marca. uso_del_logo: lista de reglas de uso del logo (versiones, fondos, márgenes, tamaño mínimo, qué no hacer). jerarquia_tipografica: lista de niveles (título, subtítulo, cuerpo, destacados) con la letra y el peso que la marca usa. ' +
  (hayObservado ? 'PARTE DE LO QUE EL PISO VISUAL OBSERVÓ en las fotos del cliente (colores, letras y logo reales): eso manda sobre cualquier suposición. ' : 'El piso visual no trajo lo observado de las fotos: propón con la evidencia y rotula. ') +
  'Emite SOLO esos dos campos con emit_brand_section (y su _field_meta). ' + REGLA + '\n\n';
const obs = '\n\nLO QUE EL PISO VISUAL OBSERVÓ:\n' + JSON.stringify(observado);
const aportesMesa = (eq.aportes_piso || []).length ? '\n\nAPORTES DE LA MESA CREATIVA (aportes, no órdenes; integra los que sirvan):\n' + JSON.stringify(eq.aportes_piso) : '';
const ev2 = '\n\nEVIDENCIA' + (omitidas.length ? ' (no cupo: ' + omitidas.join(', ') + ')' : '') + ':\n' + JSON.stringify(ev);
const r = await llamar('design-visual-storyteller', 'bb-equipo-logo-tipografia', (base + aportesMesa + ev2 + obs).slice(0, 15900), 'brand_book_logo_tipografia', 8, 240000);
const g = tomar(r, { uso_del_logo: 'lista', jerarquia_tipografica: 'lista' }, 'design-visual-storyteller');
const declarado = (eq.declarado || []).slice();
if (!r.ok) declarado.push('logo y tipografía: ' + r.error); else if (g.falto.length) declarado.push('design-visual-storyteller no entregó: ' + g.falto.join(', '));
const nuevo = Object.assign({}, draft);
const metaCampos = Object.assign({}, draft._field_meta || {});
const conPropuesta = (Array.isArray(draft.campos_con_propuesta_del_agente) ? draft.campos_con_propuesta_del_agente : []).slice();
Object.keys(g.valores).forEach((k) => {
  const x = guardar(k, g.valores[k]);
  const e = estampar(k, x, g.meta[k] || {});
  nuevo[k] = e.v; metaCampos[k] = e.meta;
  if (e.meta.estado === 'propuesta_del_agente' && conPropuesta.indexOf(k) === -1) conPropuesta.push(k);
});
nuevo._field_meta = metaCampos;
if (conPropuesta.length) nuevo.campos_con_propuesta_del_agente = conPropuesta;
const sal = Object.assign({}, eq, { declarado: declarado, guarda_datos_duros: (eq.guarda_datos_duros || []).concat(quitados), logo_corrio: r.ok });
return [{ json: Object.assign({}, j, { brand_book_draft: nuevo, _equipo: sal }) }];`

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
}
