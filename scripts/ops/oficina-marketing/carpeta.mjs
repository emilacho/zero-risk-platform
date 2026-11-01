/**
 * 01-nov · FIRMA de Emilio, punto 2 · LA PLANEACIÓN RECIBE LA CARPETA COMPLETA, NO BUSCA.
 * El portero ya entrega `contexto_del_cliente` (resumen vivo + informes vigentes de la mesa de análisis). La búsqueda por parecido («nombre · rubro», recortada a 2.500) se REEMPLAZA por esa carpeta, sin recorte.
 * Contrato (propuesta de CC2 a CC1, 01-nov):
 *   pedido   · con `con_carpeta: true` en el disparo, «elegir brazos» pide `cerebro_cliente` con `params.con_carpeta: true` y SIN exigir `query`.
 *   respuesta· la ruta del cerebro devuelve la carpeta DENTRO de `datos.contexto_del_cliente` (la junta tira los campos sueltos y deja pasar `datos` entero).
 *   redactor · «Redactor (B4)» saca la carpeta de `datos` ANTES del recorte y la imprime en una sección propia; con carpeta vigente omite los fragmentos por parecido; con la carpeta ilegible o vacía los conserva y lo DECLARA.
 * Sin `con_carpeta` el flujo es el de hoy (la carpeta no existe en el material y nada cambia). Otro valor que true/false/ausente se rechaza en «⓪ Llave» antes de gastar.
 */
import { cambiarCodigo as cambiarCodigoCrudo, nodo } from './lib.mjs'

/** el vivo trae algunos nodos con fin de línea CRLF: el fragmento a cambiar y el nuevo se escriben con el MISMO fin de línea del nodo (si no, no coincide o se mezclan) */
function cambiarCodigo(f, nombre, viejo, nuevo) {
  const crlf = nodo(f, nombre).parameters.jsCode.includes('\r\n')
  const eol = (t) => (crlf ? t.replace(/\r?\n/g, '\r\n') : t)
  cambiarCodigoCrudo(f, nombre, eol(viejo), eol(nuevo))
}

export const CODIGO_LLAVE_CARPETA = `// 01-nov · con_carpeta: la planeación recibe la CARPETA del cliente (resumen vivo + informes) en vez de buscar por parecido · solo true/false/ausente; otro valor se rechaza ANTES de gastar
const cc = w.body && typeof w.body === 'object' ? w.body.con_carpeta : undefined
if (cc !== undefined && cc !== null && typeof cc !== 'boolean') throw new Error('PLANEACION_CON_CARPETA_INVALIDO · con_carpeta solo admite true o false (llegó ' + JSON.stringify(cc).slice(0, 60) + ') · se DETIENE antes de gastar')
`

const ELEGIR_VIEJO = `  if (objetivo === 'cerebro_cliente') {
    const q = [nombre, industria].filter(Boolean).join(' · ');
    if (!q) return { falta: 'la ficha no dice ni el nombre ni el rubro · no hay con qué preguntarle al cerebro' };
    return { params: { query: q } };
  }`

export const ELEGIR_NUEVO = `  if (objetivo === 'cerebro_cliente') {
    // 01-nov · con_carpeta: la carpeta del cliente NO se busca (no necesita nombre ni rubro); sin la señal, la pregunta de hoy
    let con_carpeta = false;
    try { con_carpeta = $('Webhook · planeacion').first().json.body.con_carpeta === true; } catch (e) { con_carpeta = false; }
    const q = [nombre, industria].filter(Boolean).join(' · ');
    if (!q && !con_carpeta) return { falta: 'la ficha no dice ni el nombre ni el rubro · no hay con qué preguntarle al cerebro' };
    return { params: Object.assign({}, q ? { query: q } : {}, con_carpeta ? { con_carpeta: true } : {}) };
  }`

/** B4 · saca la carpeta del material (antes de que `datos` se recorte) */
export const B4_EXTRAER = `const descartados = Array.isArray(ent.descartados) ? ent.descartados : [];
// 01-nov · LA CARPETA DEL CLIENTE: la ruta del cerebro la entrega en datos.contexto_del_cliente (solo si el disparo traía con_carpeta). Sin ella, nada de esto actúa.
let carpeta = null;
for (const m of material) {
  if (m && m.brazo === 'cerebro' && m.datos && typeof m.datos === 'object' && m.datos.contexto_del_cliente && typeof m.datos.contexto_del_cliente === 'object') carpeta = m.datos.contexto_del_cliente;
}
const _rv = carpeta && carpeta.resumen_vivo && typeof carpeta.resumen_vivo === 'object' ? carpeta.resumen_vivo : {};
const _informes = carpeta && Array.isArray(carpeta.informes) ? carpeta.informes.filter((i) => i && typeof i === 'object' && String(i.texto || '').trim()) : [];
const _resumenTexto = String(_rv.texto || '').trim() || (Array.isArray(_rv.sedes) ? _rv.sedes.map((s) => String((s && s.texto) || '').trim()).filter(Boolean).join('\\n\\n') : '');
// vigente = hay algo que leer (resumen vivo o al menos un informe); ilegible o vacía = se conservan los fragmentos y se DECLARA
const carpetaVigente = !!carpeta && ((_rv.estado === 'vigente' && !!_resumenTexto) || _informes.length > 0);
`

export const B4_DATOS_VIEJO = `(m.estado === 'trajo' ? '\\n      datos: ' + JSON.stringify(m.datos || {}).slice(0, 2500) : '');`
export const B4_DATOS_NUEVO = `(m.estado === 'trajo' ? '\\n      datos: ' + datosDe(m) : '');`
export const B4_LINEA_ANTES = `const linea = (m) => '  - ' + (m.objetivo || '?') + '  [' + (m.brazo || '?') + ']' +`
export const B4_DATOS_DE = `// 01-nov · la carpeta NUNCA va dentro del recorte de 2.500 (se imprime aparte y entera); con carpeta vigente la búsqueda por parecido se REEMPLAZA (firma de Emilio)
const datosDe = (m) => {
  if (carpetaVigente && m.brazo === 'cerebro') return '[la búsqueda por parecido se reemplazó por LA CARPETA DEL CLIENTE de más arriba]';
  const d = m.datos && typeof m.datos === 'object' ? Object.assign({}, m.datos) : {};
  delete d.contexto_del_cliente;
  return JSON.stringify(d).slice(0, 2500);
};
`

export const B4_BLOQUE = `// ── 01-nov · LA CARPETA DEL CLIENTE · el resumen vivo y los informes vigentes, ENTEROS (sin recorte) ──
const bloqueCarpeta = (function () {
  if (!carpeta) return null;
  const L = [];
  if (carpeta.informes_estado === 'no_se_pudo_leer' || _rv.estado === 'no_se_pudo_leer') {
    L.push('🔴 LA CARPETA NO SE PUDO LEER (' + String(carpeta.informes_detalle || _rv.detalle || 'sin detalle').slice(0, 160) + '). NO afirmes nada que dependa de ella; lo que sí vino está en los bloques de abajo.');
  }
  if (_rv.estado === 'sin_resumen_vivo') L.push('⚪ Todavía NO hay resumen vivo de este cliente: no inventes uno.');
  if (_resumenTexto) {
    L.push('RESUMEN VIVO' + (_rv.actualizado_en ? ' (actualizado ' + String(_rv.actualizado_en).slice(0, 10) + ')' : '') + ':', _resumenTexto, '');
  }
  if (!_informes.length) L.push('⚪ No hay informes de análisis vigentes para este cliente.');
  for (const i of _informes) {
    const autor = i.autor && typeof i.autor === 'object' ? [i.autor.mesa, i.autor.agente].filter(Boolean).join(' / ') : '';
    L.push('INFORME «' + String(i.tipo || '?') + '»' + (autor ? ' · ' + autor : '') + (i.fecha_de_corte ? ' · corte ' + String(i.fecha_de_corte).slice(0, 10) : ''));
    if (i.hay_material_nuevo_desde_el_corte) L.push('   ⚠️ entró material nuevo al cerebro después de este corte (' + String(i.fichas_nuevas_desde_el_corte) + '): el informe puede estar atrasado.');
    L.push(String(i.texto));
    if (Array.isArray(i.citas) && i.citas.length) L.push('   citas: ' + i.citas.slice(0, 20).map((c) => String(c).slice(0, 120)).join(' | '));
    L.push('');
  }
  return L.join('\\n');
})();
`

export const B4_PEDIDO_ANTES = `'══════ LO QUE SE FUE A BUSCAR Y SI VINO ══════',`
export const B4_PEDIDO_NUEVO = `...(bloqueCarpeta ? ['══════ LA CARPETA DEL CLIENTE (completa, sin recorte) ══════', limpio(bloqueCarpeta), ''] : []),
'══════ LO QUE SE FUE A BUSCAR Y SI VINO ══════',`

export const B4_INSUMOS_VIEJO = `JSON.stringify(ent.hechos_del_dueno || [])].join('\\n');`
export const B4_INSUMOS_NUEVO = `JSON.stringify(ent.hechos_del_dueno || []), JSON.stringify(carpeta || null)].join('\\n');`

export function construirCarpeta(f) {
  cambiarCodigo(f, '⓪ Llave · Webhook · planeacion', '// T5 · validar_forma:', CODIGO_LLAVE_CARPETA + '// T5 · validar_forma:')
  cambiarCodigo(f, 'elegir brazos', ELEGIR_VIEJO, ELEGIR_NUEVO)
  const b4 = 'Redactor (B4)'
  cambiarCodigo(f, b4, 'const descartados = Array.isArray(ent.descartados) ? ent.descartados : [];', B4_EXTRAER)
  cambiarCodigo(f, b4, B4_INSUMOS_VIEJO, B4_INSUMOS_NUEVO)
  cambiarCodigo(f, b4, B4_LINEA_ANTES, B4_DATOS_DE + B4_LINEA_ANTES)
  cambiarCodigo(f, b4, B4_DATOS_VIEJO, B4_DATOS_NUEVO)
  cambiarCodigo(f, b4, 'const pedido = [', B4_BLOQUE + 'const pedido = [')
  cambiarCodigo(f, b4, B4_PEDIDO_ANTES, B4_PEDIDO_NUEVO)
}
