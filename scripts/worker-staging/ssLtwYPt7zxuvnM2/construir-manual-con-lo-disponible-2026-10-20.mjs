// CC#1 · 20-oct · EL MANUAL TRABAJA CON LO QUE HAYA DISPONIBLE (firma de Emilio 15:22; señal de Lenovo 15:30; rehace #661).
//   node construir-manual-con-lo-disponible-2026-10-20.mjs        → ANTES (respaldo del vivo) → ARREGLADO
//   import { construirFlujo } y pasarle el flujo                   → lo que prueba __tests__/cimiento-manual-con-lo-disponible.test.ts
// Qué hace (Cimiento `ssLtwYPt7zxuvnM2`; NADA se aplica en vivo hasta que otro empleado certifique):
//  1. «[BB] Fan-out prep»: regla para el que escribe: NUNCA un campo PENDIENTE si la evidencia trae con qué armarlo; sin texto propio del cliente, lo armado desde el público ideal, los competidores y las
//     prácticas del rubro se rotula «PROPUESTA (no es dato del cliente): …». El tope del pedido sube EXACTAMENTE lo que suma la regla (la evidencia no cede un carácter más).
//  2. NODOS NUEVOS entre el Consolidador y el juez: «[BB] Uso · ¿usó lo disponible?» (código) → «¿hay que repetir la voz?» (IF) → «pedir la voz otra vez» (UNA sola vez, al editor-en-jefe, dueño de la voz) → «mezclar la voz».
//     Es la CORRECCIÓN que «vuelve»: el Lazo A solo reescribe los campos gateados (ADR-020 §7), así que la voz no tiene otro camino para corregirse. Una vez; no es un lazo.
//  3. «[BB] Faithfulness judge»: la vara es fidelidad Y uso de lo disponible (`pass`); el progreso cuenta también que el uso mejore. NO existe ningún estado «sin contenido propio»: el manual nunca para la cadena por falta de contenido.
//  4. «[BB] Promote prep» y «Return scores a parent»: dejan REGISTRADO el uso (qué había, qué no se usó) y la razón `no_uso_lo_disponible`. `gate_outcome` sigue siendo solo `paso_la_vara` | `salio_al_tope`.
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const N = {
  fanout: '[BB] Fan-out prep', consolidador: '[BB] Consolidador', judgePrep: '[BB] Judge prep', juez: '[BB] Faithfulness judge', promote: '[BB] Promote prep', retorno: 'Return scores a parent (grade-cimiento gate)',
  uso: '[BB] Uso · ¿usó lo disponible?', siRepetir: '[BB] Uso · ¿hay que repetir la voz?', pedir: '[BB] Uso · pedir la voz otra vez (editor-en-jefe)', mezclar: '[BB] Uso · mezclar la voz',
}
const aqui = dirname(fileURLToPath(import.meta.url))
const CR = String.fromCharCode(13), LF = String.fromCharCode(10)
export const BLOQUE = fs.readFileSync(join(aqui, 'bloque-uso-de-lo-disponible-2026-10-20.js'), 'utf8').split(CR + LF).join(LF).trim()

const unaVez = (s, viejo, nuevo, que) => {
  const n = s.split(viejo).length - 1
  if (n !== 1) throw new Error(`${que}: el ancla aparece ${n} veces (debe ser 1) · rehacer desde el vivo`)
  return s.replace(viejo, () => nuevo)
}
const enLF = (c) => ({ crlf: c.includes(CR + LF), s: c.split(CR + LF).join(LF) })
const devolver = (crlf, s) => (crlf ? s.split(LF).join(CR + LF) : s)

// la regla que lee el que ESCRIBE (viaja en la prosa que comparten las tres lentes)
export const REGLA_CON_LO_DISPONIBLE = '\n\nCON LO DISPONIBLE (regla del dueño): el manual SIEMPRE se arma con lo que haya; NUNCA dejes un campo en PENDIENTE si la evidencia trae con qué armarlo. ' +
  'Si el cliente NO tiene texto propio (ni sitio, ni perfil, ni frase), propón la voz, la personalidad y los mensajes desde el público ideal, los competidores y las prácticas habituales del rubro, ' +
  'y escribe cada campo así armado EMPEZANDO por «PROPUESTA (no es dato del cliente): …» (en `_meta.<campo>.fuente` pon «propuesta»). Lo que SÍ viene del cliente lleva su cita literal. ' +
  'Esta es la única excepción a «sin cita no lo escribas»: una PROPUESTA rotulada.'

// ───────────────────────── 1 · «[BB] Fan-out prep»
export function cambiarFanout(codigo) {
  const { crlf, s: s0 } = enLF(codigo)
  if (s0.includes('REGLA_CON_LO_DISPONIBLE')) throw new Error('«Fan-out prep» ya trae la regla de lo disponible · no construir dos veces')
  let s = unaVez(s0, 'const _PROSA =\n', `// 🔴 CON LO DISPONIBLE (firma de Emilio 20-oct): el manual trabaja con lo que haya; sin texto propio, lo armado es una PROPUESTA rotulada. La regla viaja al que escribe.
const REGLA_CON_LO_DISPONIBLE = ${JSON.stringify(REGLA_CON_LO_DISPONIBLE)};
const _PROSA =
`.replace(/\n$/, '\n'), 'prosa')
  s = unaVez(s, "  'Grounding cada afirmación en la evidencia.' + REGLAS_EVIDENCIA_R62;", "  'Grounding cada afirmación en la evidencia.' + REGLAS_EVIDENCIA_R62 + REGLA_CON_LO_DISPONIBLE;", 'fin de la prosa')
  s = unaVez(s, 'const TOPE_TASK = 14000 + REGLAS_EVIDENCIA_R62.length + _FRASE_EJ_R62.length;', 'const TOPE_TASK = 14000 + REGLAS_EVIDENCIA_R62.length + _FRASE_EJ_R62.length + REGLA_CON_LO_DISPONIBLE.length;', 'tope')
  return devolver(crlf, s)
}

// ───────────────────────── 2 · nodos nuevos
export const CODIGO_USO = `// ${'🔴'} EL USO DE LO DISPONIBLE (20-oct · firma de Emilio): ¿el borrador USÓ lo que había? Si no usó la voz habiendo evidencia, se pide UNA vez más al dueño de la voz (el editor-en-jefe): es la corrección que «vuelve».
// El Lazo A solo reescribe los campos gateados (ADR-020 §7), así que la voz no tiene otro camino. Una sola vez, y solo en la primera pasada: no es un lazo.
${BLOQUE}

const j = $json;                                // salida del Consolidador
const draft = j.brand_book_draft || {};
const grounding = j._grounding_refs || {};
const uso = usoDeLoDisponible(draft, grounding);
const voz = uso.sin_usar.filter((x) => x.campo === 'voice_description')[0] || null;
const primeraPasada = (Number(j._fidelity_cycle) || 1) <= 1;
const repetir = !!voz && primeraPasada;
let pedido = '';
if (repetir) {
  let original = '';
  try { original = String($('[BB] Fan-out prep').first().json.tasks['editor-en-jefe'] || ''); } catch (e) { original = ''; }
  const largo = '\\n\\nREPARO (la vara de uso de lo disponible): tu respuesta anterior dejó ' + voz.campo + ' ' + (voz.rotulo ? 'sin rotular como PROPUESTA' : 'vacía o PENDIENTE') + ' habiendo evidencia (' + voz.fuente + '). ' +
    'Vuelve a emitir tu sección COMPLETA con emit_brand_section usando esa evidencia. Si el cliente tiene texto propio, la voz sale de él con su cita literal; si NO lo tiene, es una PROPUESTA y empieza por «PROPUESTA (no es dato del cliente): …». NUNCA PENDIENTE habiendo evidencia.';
  const corto = '\\n\\nREPARO: ' + voz.campo + ' ' + (voz.rotulo ? 'sin rotular PROPUESTA' : 'PENDIENTE') + ' habiendo evidencia. Vuelve a emitir tu sección con emit_brand_section; sin texto propio, empieza por «PROPUESTA (no es dato del cliente): …».';
  pedido = (original + largo).length <= 15900 ? original + largo : original.slice(0, 15900 - corto.length) + corto;
}
return [{ json: Object.assign({}, j, { _uso: uso, _uso_repetir_voz: repetir, _uso_pedido_voz: pedido }) }];
`

export const CODIGO_MEZCLAR = `// ${'🔴'} MEZCLAR LA VOZ (20-oct): lo que volvió del editor-en-jefe reemplaza SOLO los campos de la voz que trae con contenido; el resto del borrador queda IGUAL. Si no volvió nada útil, el borrador sigue como estaba (la vara lo dirá).
const prev = $('${N.uso}').first().json;
const r = $json || {};
const body = r.body || r;
let st = body.brand_section || body.structured || null;
if (!st && typeof body.response === 'string') {
  const m = body.response.match(/\\{[\\s\\S]*\\}/);
  if (m) { try { st = JSON.parse(m[0]); } catch (e) { st = null; } }
}
const draft = Object.assign({}, prev.brand_book_draft || {});
const meta = Object.assign({}, draft._field_meta || {});
const CAMPOS = ['voice_description', 'personalidad', 'tagline_opciones', 'mensajes_clave'];
const mezclados = [];
if (st && typeof st === 'object' && !Array.isArray(st)) {
  for (const k of CAMPOS) {
    let raw = st[k];
    let m = {};
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && ('valor' in raw)) { m = raw; raw = raw.valor; }
    const top = (st._field_meta && typeof st._field_meta === 'object' && st._field_meta[k]) || (st._meta && typeof st._meta === 'object' && st._meta[k]) || {};
    const fuente = typeof m.fuente === 'string' && m.fuente ? m.fuente : (typeof top.fuente === 'string' ? top.fuente : '');
    const conf = Number(m.confianza !== undefined ? m.confianza : top.confianza);
    const vacio = raw === undefined || raw === null || (Array.isArray(raw) ? raw.length === 0 : !String(raw).trim());
    if (vacio) continue;
    draft[k] = raw;
    meta[k] = { estado: 'provisional', provisional: true, gateado: false, fuente: fuente.slice(0, 200), confianza: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : null, lente: 'editor-en-jefe', reintento_uso: true };
    mezclados.push(k);
  }
}
draft._field_meta = meta;
return [{ json: Object.assign({}, prev, { brand_book_draft: draft, _uso_repetir_voz: false, _uso_reintento: { corrio: true, mezclados: mezclados, voz_nueva: mezclados.indexOf('voice_description') !== -1 } }) }];
`

// ───────────────────────── 3 · el juez
export function cambiarJuez(codigo) {
  const { crlf, s: s0 } = enLF(codigo)
  if (s0.includes('usoDeLoDisponible')) throw new Error('«Faithfulness judge» ya trae el uso de lo disponible · no construir dos veces')
  let s = unaVez(s0, `const improved = gated_mean > prev_best;
const pass = !judge_incomplete && lowFields.length === 0;
`, `// 🔴 EL USO DE LO DISPONIBLE (20-oct · firma de Emilio): la vara mide «¿usó lo que había?», no «¿había mucho?». Un manual fiel pero que dejó la voz PENDIENTE habiendo evidencia NO pasa; uno corto que usó todo lo que había, SÍ.
${BLOQUE}
const _uso = usoDeLoDisponible(draft, prep._grounding_refs || {});
let prev_uso_n = null;
try { const lpu = $('[BB] Lazo A prep').first().json || {}; if (lpu.best_uso_n !== undefined && lpu.best_uso_n !== null) prev_uso_n = Number(lpu.best_uso_n); } catch (e) { /* 1ª pasada */ }
const uso_mejoro = prev_uso_n !== null && _uso.sin_usar.length < prev_uso_n;
const improved = gated_mean > prev_best || uso_mejoro;
const pass = !judge_incomplete && lowFields.length === 0 && _uso.ok;
// la voz ya tuvo su UNA corrección antes del juez (nodos «Uso»): si lo único que falla es la voz, otra vuelta del Lazo A (que solo reescribe lo gateado) gastaría sin poder arreglar nada ⇒ se agota aquí y sale MARCADO.
const _solo_voz = !_uso.ok && _uso.sin_usar.every(function (x) { return x.campo === 'voice_description' });
`, 'pass')
  s = unaVez(s, `      low_fields: lowFields, // campos GATEADOS bajo umbral (los que bloquean)
`, `      low_fields: lowFields, // campos GATEADOS bajo umbral (los que bloquean)
      uso: _uso,             // ¿usó lo disponible? { ok, sin_usar[], disponibles }
`, 'salida')
  s = unaVez(s, 'exhausted: !pass && fidelityCycle >= MAX_FIDELITY_CYCLES,', 'exhausted: !pass && (fidelityCycle >= MAX_FIDELITY_CYCLES || (!judge_incomplete && lowFields.length === 0 && _solo_voz)),', 'exhausted')
  return devolver(crlf, s)
}

// ───────────────────────── 4 · Lazo A prep (lleva la cuenta del uso para el progreso) · Promote prep · Return scores
export function cambiarLazoPrep(codigo) {
  const { crlf, s: s0 } = enLF(codigo)
  if (s0.includes('best_uso_n')) throw new Error('«Lazo A prep» ya trae best_uso_n · no construir dos veces')
  const s = unaVez(s0, `  best_gated_mean: Number(j.best_gated_mean) || 0,
`, `  best_gated_mean: Number(j.best_gated_mean) || 0,
  best_uso_n: ((fid.uso && fid.uso.sin_usar) || []).length,   // cuántos campos quedaron sin usar lo disponible (el progreso también cuenta que baje)
`, 'best_uso_n')
  return devolver(crlf, s)
}
export function cambiarPromote(codigo) {
  const { crlf, s: s0 } = enLF(codigo)
  if (s0.includes('uso_de_lo_disponible')) throw new Error('«Promote prep» ya registra el uso · no construir dos veces')
  let s = unaVez(s0, `    provisional: !!$('Validate Deal Data').first().json._sin_web,
`, `    provisional: !!$('Validate Deal Data').first().json._sin_web,
    uso_de_lo_disponible: fidelity.uso || null,   // qué había y qué NO se usó: queda registrado dentro del manual
`, 'registro')
  s = unaVez(s, `  gate_nota: fidelity.pass ? null : 'salió al tope, no alcanzó la vara',
`, `  gate_nota: fidelity.pass ? null : (((fidelity.uso && !fidelity.uso.ok) ? 'no usó lo disponible (' + fidelity.uso.sin_usar.map(function (x) { return x.campo + ': ' + x.motivo }).join(' · ') + ') · ' : '') + 'salió al tope, no alcanzó la vara'),
`, 'nota')
  return devolver(crlf, s)
}
export function cambiarRetorno(codigo) {
  const { crlf, s: s0 } = enLF(codigo)
  if (s0.includes('no_uso_lo_disponible')) throw new Error('«Return scores» ya trae la razón del uso · no construir dos veces')
  let s = unaVez(s0, `(fid.exhausted ? 'ciclos_agotados' : 'fidelidad_baja')`, `((fid.uso && !fid.uso.ok && !(fid.low_fields || []).length) ? 'no_uso_lo_disponible' : (fid.exhausted ? 'ciclos_agotados' : 'fidelidad_baja'))`, 'razón')
  s = unaVez(s, `  lazo_a: (fid._lazo || null),
`, `  lazo_a: (fid._lazo || null),
  uso_de_lo_disponible: (fid.uso || null),
`, 'registro')
  return devolver(crlf, s)
}

// ───────────────────────── armar el flujo
export function construirFlujo(flujo) {
  const copia = JSON.parse(JSON.stringify(flujo))
  const nodo = (n) => { const x = copia.nodes.find((y) => y.name === n); if (!x) throw new Error('falta el nodo ' + n); return x }
  if (copia.nodes.some((x) => x.name === N.uso)) throw new Error('el flujo ya trae el uso de lo disponible · no construir dos veces')
  nodo(N.fanout).parameters.jsCode = cambiarFanout(nodo(N.fanout).parameters.jsCode)
  nodo(N.juez).parameters.jsCode = cambiarJuez(nodo(N.juez).parameters.jsCode)
  nodo('[BB] Lazo A prep').parameters.jsCode = cambiarLazoPrep(nodo('[BB] Lazo A prep').parameters.jsCode)
  nodo(N.promote).parameters.jsCode = cambiarPromote(nodo(N.promote).parameters.jsCode)
  nodo(N.retorno).parameters.jsCode = cambiarRetorno(nodo(N.retorno).parameters.jsCode)

  const cons = nodo(N.consolidador), [cx, cy] = cons.position || [1000, 400]
  const lenteEditor = nodo('Lente · editor-en-jefe')
  const code = (nombre, id, jsCode, x, y) => ({ id, name: nombre, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x, y], parameters: { jsCode } })
  const nUso = code(N.uso, 'uso-1-usar', CODIGO_USO, cx + 160, cy + 140)
  const nSi = {
    id: 'uso-2-si', name: N.siRepetir, type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [cx + 340, cy + 140],
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 1 }, conditions: [{ id: 'uso-2-c', leftValue: '={{ $json._uso_repetir_voz === true }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} },
  }
  const nPedir = {
    id: 'uso-3-pedir', name: N.pedir, type: 'n8n-nodes-base.httpRequest', typeVersion: lenteEditor.typeVersion || 4.2, position: [cx + 520, cy + 240],
    notes: 'La vara de uso (20-oct): UNA sola vez, solo si el borrador dejó la voz vacía/PENDIENTE (o sin rotular como PROPUESTA) habiendo evidencia. Sin reintento: una llamada que arrancó y se reintenta se paga dos veces. Si falla, el borrador sigue y la vara lo dirá.',
    parameters: JSON.parse(JSON.stringify(lenteEditor.parameters)),
  }
  nPedir.parameters.jsonBody = '={\n  "agent": "editor-en-jefe",\n  "client_id": "{{ $(\'Validate Deal Data\').first().json.client_id }}",\n  "workflow_id": "{{ $execution.id }}",\n  "workflow_execution_id": "{{ $execution.id }}",\n  "step_name": "bb-lens-editor-en-jefe-uso",\n  "task": {{ JSON.stringify($json._uso_pedido_voz) }},\n  "context": { "role": "brand_book_lens", "lens": "editor-en-jefe", "motivo": "uso_de_lo_disponible" }\n}'
  if (nPedir.parameters.retryOnFail) delete nPedir.parameters.retryOnFail
  const nMezclar = code(N.mezclar, 'uso-4-mezclar', CODIGO_MEZCLAR, cx + 700, cy + 240)
  copia.nodes.push(nUso, nSi, nPedir, nMezclar)

  const c = copia.connections
  const aJuez = c[N.consolidador] && c[N.consolidador].main && c[N.consolidador].main[0]
  if (!aJuez || aJuez.length !== 1 || aJuez[0].node !== N.judgePrep) throw new Error('el Consolidador ya no apunta solo al «Judge prep» · rehacer desde el vivo')
  c[N.consolidador] = { main: [[{ node: N.uso, type: 'main', index: 0 }]] }
  c[N.uso] = { main: [[{ node: N.siRepetir, type: 'main', index: 0 }]] }
  c[N.siRepetir] = { main: [[{ node: N.pedir, type: 'main', index: 0 }], [{ node: N.judgePrep, type: 'main', index: 0 }]] }
  c[N.pedir] = { main: [[{ node: N.mezclar, type: 'main', index: 0 }]] }
  c[N.mezclar] = { main: [[{ node: N.judgePrep, type: 'main', index: 0 }]] }
  return copia
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const w = JSON.parse(fs.readFileSync(join(aqui, 'ssLtwYPt7zxuvnM2-ANTES-manual-con-lo-disponible-2026-10-20.json'), 'utf8'))
  const salida = join(aqui, 'ssLtwYPt7zxuvnM2-ARREGLADO-manual-con-lo-disponible-2026-10-20.json')
  const nuevo = construirFlujo(w)
  fs.writeFileSync(salida, JSON.stringify(nuevo, null, 2))
  console.log('escrito', salida, '· nodos', nuevo.nodes.length)
}
