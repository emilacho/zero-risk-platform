/**
 * 04-nov · ENCARGO Lenovo «el plan como se diseñó» punto 1 · flujo del plan `X9F0zp6LQ2xGEYVS` · US$ 0.
 * Traza de CC1: «① GUARDA» devolvía del manual solo 6 datos (id, aprobado, registro, colores, tipografías) y el redactor recibía 1.682 de 46.511 caracteres de la v5.
 *   · «① GUARDA»: además devuelve `contenido_del_manual` = TODOS los campos de la fila vigente (voz, tono, estilo, eslogan, posicionamiento, terminología, texto completo…),
 *     sin claves internas (`provenance_tag`, `id`, `client_id`, fechas). «armar el paquete» ya pasa la salida de la guarda como `manual` → llega a «Redactor (B4)» sin tocar nada más.
 *   · «Redactor (B4)»: `_V3_LIMITE` 110.000 → 590.000 (el tope real del pedido es 600.000 · `TOPE_REAL_DEL_PEDIDO`) y la estimación del largo base SUMA el manual
 *     (antes no lo contaba: con el manual entero la tabla de procedencia se habría recortado sola).
 */
import { cambiarCodigo } from './lib.mjs'

export const LIMITE_V3 = 590000
const G = '① GUARDA · sin manual aprobado se DETIENE'
const B4 = 'Redactor (B4)'

const VIEJO_RETORNO = 'identidad_del_manual: { primary_colors:'
const NUEVO_RETORNO = "contenido_del_manual: (function () { const o = {}; Object.keys(m).forEach(function (k) { if (['id', 'client_id', 'provenance_tag', 'created_at', 'gate_outcome', 'human_validated', 'version'].indexOf(k) < 0 && m[k] !== null && m[k] !== undefined && m[k] !== '') o[k] = m[k]; }); return o; })(), identidad_del_manual: { primary_colors:"

export function construirPlanManualCompleto(f) {
  // 04-nov · el manual ENTERO viaja al redactor (antes: 6 datos)
  cambiarCodigo(f, G, VIEJO_RETORNO, NUEVO_RETORNO)
  cambiarCodigo(f, B4, 'var _V3_LIMITE = 110000', `var _V3_LIMITE = ${LIMITE_V3}`)
  cambiarCodigo(f, B4, "{ base_chars: String((ent && ent.referencia) || '').length + 12000 +",
    "{ base_chars: String((ent && ent.referencia) || '').length + 12000 + String(JSON.stringify((ent && ent.manual) || {})).length +")
}
