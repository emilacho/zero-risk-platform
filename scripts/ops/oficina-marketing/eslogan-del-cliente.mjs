/**
 * 01-nov · ADENDA 1 del equipo del manual · EL ESLOGAN REAL DEL CLIENTE ES UN HECHO, no una opción (reparto de CC1: AVANCE-CC1-a-CC2-eslogan-real-reparto + LISTO CC1 #817).
 * Dos piezas mías:
 *   · PLANEACIÓN (`X9F0zp6LQ2xGEYVS` · «Redactor (B4)»): B4 NO pasaba la carpeta entera, elegía piezas (resumen vivo e informes) y no leía `eslogan`. Ahora, si `contexto_del_cliente.eslogan = {texto, fuente, regla}`
 *     trae texto, el pedido lleva un bloque «ESLOGAN QUE EL CLIENTE YA USA (activo de marca EXISTENTE)» con su fuente, la regla de la plataforma y la del plan: se usa; si el plan propone otro, lo dice, explica por qué
 *     y lo rotula PROPUESTA (nunca lo cambia en silencio). Sin eslogan, el pedido queda IDÉNTICO a hoy, byte por byte. El texto pasa por `limpio` (personas protegidas).
 *   · MANUAL (`ssLtwYPt7zxuvnM2` · «[BB] Consolidador»): la frase propia que el código halló LITERAL (`materia_cliente.estado_frase_propia === 'hallado'`) llega también como `tagline` del borrador, con
 *     `_field_meta.tagline = { estado:'hecho', fuente, confianza:1, lente:'codigo' }` (la fuente que lee CC1). La escribe el CÓDIGO, no una lente: el modelo no la reescribe. Sin frase hallada, no hay `tagline`.
 *     `tagline_opciones` sigue siendo solo para propuestas del editor. La plataforma nunca pisa un eslogan del dueño ni uno ya guardado (lo cubre CC1).
 */
import { cambiarCodigo } from './lib.mjs'

export const FUENTE_FRASE_HALLADA = 'Frase propia del cliente hallada en su sitio y su perfil social — literal'

const B4_ANCLA_PEDIDO = "const pedido = [\n'Eres el redactor de planes de campana de esta agencia."
const B4_BLOQUE = `// 01-nov · EL ESLOGAN QUE EL CLIENTE YA USA (activo de marca EXISTENTE) · viene en contexto_del_cliente.eslogan = { texto, fuente, regla }. Sin texto, el pedido queda idéntico a hoy.
const bloqueEslogan = (function () {
  const e = carpeta && carpeta.eslogan && typeof carpeta.eslogan === 'object' && !Array.isArray(carpeta.eslogan) ? carpeta.eslogan : null;
  const t = e ? String(e.texto == null ? '' : e.texto).replace(/\\s+/g, ' ').trim().slice(0, 300) : '';
  if (!t) return [];
  const fu = String(e.fuente == null ? '' : e.fuente).replace(/\\s+/g, ' ').trim().slice(0, 300);
  const rg = String(e.regla == null ? '' : e.regla).replace(/\\s+/g, ' ').trim().slice(0, 600);
  return [
    '══════ ESLOGAN QUE EL CLIENTE YA USA (activo de marca EXISTENTE) ══════',
    '«' + limpio(t) + '»',
    'Fuente: ' + (fu || 'no declarada'),
    ...(rg ? ['Regla de la plataforma: ' + rg] : []),
    'REGLA DEL PLAN: este eslogan es un HECHO de la marca, no una opción. Úsalo como eslogan o hilo de la campaña. Si propones otra idea de marca o de eslogan, dilo con todas sus letras, explica por qué y déjala rotulada como PROPUESTA (el eslogan real sigue siendo el de arriba). No lo cambies en silencio.',
    '',
  ];
})();
`
const B4_ANCLA_ARREGLO = '...bloqueDeRegistro(registroDelCliente),\n'
const B4_ARREGLO_NUEVO = '...bloqueDeRegistro(registroDelCliente),\n...bloqueEslogan,\n'

export function construirEsloganEnPlan(f) {
  cambiarCodigo(f, 'Redactor (B4)', B4_ANCLA_PEDIDO, B4_BLOQUE + B4_ANCLA_PEDIDO)
  cambiarCodigo(f, 'Redactor (B4)', B4_ANCLA_ARREGLO, B4_ARREGLO_NUEVO)
}

const C_ANCLA_BORRADOR = 'const brandBookDraft = {'
const C_BLOQUE = `// 01-nov · EL ESLOGAN REAL ES UN HECHO (ADENDA 1 del manual) · la frase propia que el CÓDIGO halló literal en el sitio y el perfil social llega como tagline, con su fuente. Sin frase hallada, no hay tagline.
let _fp = '';
try {
  const _mcE = ($('[BB] Fan-out prep').first().json._grounding_refs || {}).materia_cliente || {};
  if (_mcE.estado_frase_propia === 'hallado' && typeof _mcE.frase_propia === 'string') _fp = _mcE.frase_propia.replace(/\\s+/g, ' ').trim().slice(0, 300);
} catch (e) { _fp = ''; }
if (_fp) _meta.tagline = { estado: 'hecho', provisional: false, gateado: false, fuente: ${JSON.stringify(FUENTE_FRASE_HALLADA)}, confianza: 1, lente: 'codigo' };

`
const C_ANCLA_META = '  _field_meta: _meta,\n'
const C_META_NUEVO = '  ...(_fp ? { tagline: _fp } : {}),\n  _field_meta: _meta,\n'

export function construirEsloganEnManual(f) {
  cambiarCodigo(f, '[BB] Consolidador', C_ANCLA_BORRADOR, C_BLOQUE + C_ANCLA_BORRADOR)
  cambiarCodigo(f, '[BB] Consolidador', C_ANCLA_META, C_META_NUEVO)
}
