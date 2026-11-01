/**
 * 01-nov · FIRMA de Emilio (08:42Z) · ORDEN de CC1 a CC2 · la planeación con la MESA DE ANÁLISIS y la CARPETA del cliente. Solo el flujo de planeación (`X9F0zp6LQ2xGEYVS`).
 *   A1 · LA CARPETA ENTERA (punto 2): la puerta `/api/planeacion/brazo/cerebro` (CC1) ya no busca por parecido: devuelve en `datos` la carpeta
 *        (`contexto_del_cliente` = resumen vivo + informes · `material_citado` · `carpeta`). «Redactor (B4)» la saca de `datos` ANTES del recorte de 2.500 y la imprime en su
 *        sección, entera. Sin carpeta en el material el pedido es el de hoy. No hay interruptor propio: la puerta ya contesta así.
 *   A2 · «MESA DE ANÁLISIS» (punto 1): con `con_analisis: true` en el disparo sale UN pedido por tipo (5) a la rama nueva `Mesa de análisis` → `/api/planeacion/mesa-de-analisis`
 *        (`brazo: 'analisis'`, 5.ª entrada de la junta). Solo true/false/ausente; otro valor lo rechaza «⓪ Llave» antes de gastar. Apagado por omisión. Segundo candado en la base
 *        (`cadena_config.mesa_de_analisis`, lo pone CC1): sin él la puerta contesta «mesa apagada» y no llama a nadie. `con_mercado` sigue como alias.
 *        El redactor lee el informe del análisis con tope de 6.000 (no 2.500), igual que la puerta lo recorta.
 */
import { agregarNodo, cambiarCodigo as cambiarCodigoCrudo, codigo, conectar, nodo } from './lib.mjs'

/** el vivo trae algunos nodos con fin de línea CRLF: el fragmento a cambiar y el nuevo se escriben con el MISMO fin de línea del nodo (si no, no coincide o se mezclan) */
function cambiarCodigo(f, nombre, viejo, nuevo) {
  const crlf = nodo(f, nombre).parameters.jsCode.includes('\r\n')
  const eol = (t) => (crlf ? t.replace(/\r?\n/g, '\r\n') : t)
  cambiarCodigoCrudo(f, nombre, eol(viejo), eol(nuevo))
}

export const TIPOS_DE_ANALISIS = [
  ['mercado', 'informe de mercado'],
  ['competencia', 'informe de competencia'],
  ['voz_del_publico', 'informe de la voz del público'],
  ['escucha_x', 'informe de la escucha en X'],
  ['retencion', 'informe de retención'],
]

export const CODIGO_LLAVE_ANALISIS = `// 01-nov · con_analisis: pide la MESA DE ANÁLISIS (un analista por tipo · gasta hasta el tope de la puerta) · solo true/false/ausente; otro valor se rechaza ANTES de gastar
const ca = w.body && typeof w.body === 'object' ? w.body.con_analisis : undefined
if (ca !== undefined && ca !== null && typeof ca !== 'boolean') throw new Error('PLANEACION_CON_ANALISIS_INVALIDO · con_analisis solo admite true o false (llegó ' + JSON.stringify(ca).slice(0, 60) + ') · se DETIENE antes de gastar')
`

export const ANALISIS_PEDIR = `if (con_mercado) pedir('mercado', 'informe_mercado');

// 01-nov · MESA DE ANÁLISIS (equipo Estrategia · paso 0 del plan): UN pedido por tipo, SOLO si el disparo trae con_analisis === true · ausente = el flujo de hoy (no sale pedido ni gasto).
// Los pedidos van a la puerta nueva (brazo 'analisis'); el segundo candado (cadena_config.mesa_de_analisis) lo mira la puerta. idioma/trato los toma la puerta del manual del cliente.
let con_analisis = false;
try { con_analisis = $('Webhook · planeacion').first().json.body.con_analisis === true; } catch (e) { con_analisis = false; }
if (con_analisis) {
  const TIPOS_ANALISIS = ${JSON.stringify(TIPOS_DE_ANALISIS)};
  for (const t of TIPOS_ANALISIS) pedidos.push({ brazo: 'analisis', objetivo: t[1], orden: pedidos.length + 1, params: { tipo: t[0] } });
}`

/** B4 · saca la carpeta del material (antes de que `datos` se recorte) */
export const B4_EXTRAER = `const descartados = Array.isArray(ent.descartados) ? ent.descartados : [];
// 01-nov · LA CARPETA DEL CLIENTE: la puerta del cerebro la entrega en datos.contexto_del_cliente. Sin ella, nada de esto actúa.
let carpeta = null;
for (const m of material) {
  if (m && m.brazo === 'cerebro' && m.datos && typeof m.datos === 'object' && m.datos.contexto_del_cliente && typeof m.datos.contexto_del_cliente === 'object') carpeta = m.datos.contexto_del_cliente;
}
const _rv = carpeta && carpeta.resumen_vivo && typeof carpeta.resumen_vivo === 'object' ? carpeta.resumen_vivo : {};
const _informes = carpeta && Array.isArray(carpeta.informes) ? carpeta.informes.filter((i) => i && typeof i === 'object' && String(i.texto || '').trim()) : [];
const _resumenTexto = String(_rv.texto || '').trim() || (Array.isArray(_rv.sedes) ? _rv.sedes.map((s) => String((s && s.texto) || '').trim()).filter(Boolean).join('\\n\\n') : '');
// vigente = hay algo que leer (resumen vivo o al menos un informe); ilegible o vacía = se conserva lo demás del cerebro y se DECLARA
const carpetaVigente = !!carpeta && ((_rv.estado === 'vigente' && !!_resumenTexto) || _informes.length > 0);
`

export const B4_DATOS_VIEJO = `(m.estado === 'trajo' ? '\\n      datos: ' + JSON.stringify(m.datos || {}).slice(0, 2500) : '');`
export const B4_DATOS_NUEVO = `(m.estado === 'trajo' ? '\\n      datos: ' + datosDe(m) : '');`
export const B4_LINEA_ANTES = `const linea = (m) => '  - ' + (m.objetivo || '?') + '  [' + (m.brazo || '?') + ']' +`
export const B4_DATOS_DE = `// 01-nov · la carpeta NUNCA va dentro del recorte de 2.500 (se imprime aparte y entera) · la mesa de análisis lleva su informe con tope de 6.000 (el de la puerta) · el resto de los brazos, como hoy
const datosDe = (m) => {
  const d = m.datos && typeof m.datos === 'object' ? Object.assign({}, m.datos) : {};
  if (m.brazo === 'cerebro') {
    delete d.contexto_del_cliente; delete d.carpeta;
    if (carpetaVigente) return '[la carpeta del cliente va entera en LA CARPETA DEL CLIENTE de más arriba]' + (d.material_citado ? ' · material citado: ' + JSON.stringify(d.material_citado).slice(0, 800) : '');
  }
  return JSON.stringify(d).slice(0, m.brazo === 'analisis' ? 6000 : 2500);
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

/** la rama nueva «Mesa de análisis»: hermana de «Brazo · mercado» (misma forma, otra puerta y otro nombre de brazo) → su firma → 5.ª entrada de la junta */
function ramaDeAnalisis(f) {
  const base = structuredClone(nodo(f, 'Brazo · mercado'))
  delete base.id
  delete base.position
  base.name = 'Mesa de análisis'
  base.parameters.url = base.parameters.url.replace('/brazo/mercado', '/mesa-de-analisis')
  base.parameters.jsonBody = base.parameters.jsonBody.replaceAll('"mercado"', '"analisis"')
  if (!base.parameters.url.includes('/mesa-de-analisis') || base.parameters.jsonBody.includes('mercado')) throw new Error('«Brazo · mercado» ya no tiene la forma esperada: ¿cambió el constructor?')
  agregarNodo(f, base, 'Brazo · mercado', 0, 100)
  const firma = nodo(f, 'firma de la rama · mercado').parameters.jsCode
  if (!firma.includes("const BRAZO = 'mercado';")) throw new Error('la firma de mercado ya no trae BRAZO fijo')
  agregarNodo(f, codigo('firma de la rama · analisis', firma.replace("const BRAZO = 'mercado';", "const BRAZO = 'analisis';").replace('// firma de la rama · mercado ·', '// firma de la rama · analisis ·')), 'firma de la rama · mercado', 0, 100)
  conectar(f, 'elegir brazos', 'Mesa de análisis')
  conectar(f, 'Mesa de análisis', 'firma de la rama · analisis')
  const junta = nodo(f, 'Junta · esperar los 3 brazos')
  if (junta.parameters.numberInputs !== 4) throw new Error('la junta ya no tiene 4 entradas')
  junta.parameters.numberInputs = 5
  f.connections['firma de la rama · analisis'] = { main: [[{ node: 'Junta · esperar los 3 brazos', type: 'main', index: 4 }]] }
}

export function construirMesaDeAnalisis(f) {
  // A2 · la mesa de análisis
  cambiarCodigo(f, '⓪ Llave · Webhook · planeacion', '// T5 · validar_forma:', CODIGO_LLAVE_ANALISIS + '// T5 · validar_forma:')
  cambiarCodigo(f, 'elegir brazos', "if (con_mercado) pedir('mercado', 'informe_mercado');", ANALISIS_PEDIR)
  ramaDeAnalisis(f)
  // A1 · la carpeta entera en el redactor
  const b4 = 'Redactor (B4)'
  cambiarCodigo(f, b4, 'const descartados = Array.isArray(ent.descartados) ? ent.descartados : [];', B4_EXTRAER)
  cambiarCodigo(f, b4, B4_INSUMOS_VIEJO, B4_INSUMOS_NUEVO)
  cambiarCodigo(f, b4, B4_LINEA_ANTES, B4_DATOS_DE + B4_LINEA_ANTES)
  cambiarCodigo(f, b4, B4_DATOS_VIEJO, B4_DATOS_NUEVO)
  cambiarCodigo(f, b4, 'const pedido = [', B4_BLOQUE + 'const pedido = [')
  cambiarCodigo(f, b4, B4_PEDIDO_ANTES, B4_PEDIDO_NUEVO)
}
