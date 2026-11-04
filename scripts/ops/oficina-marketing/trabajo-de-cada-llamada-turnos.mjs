/**
 * 04-nov · «cada llamada a un empleado guarda de qué trabajo es» · TURNOS GENÉRICOS (`Oficina · un turno` bTbWL9lUvQCfStAz y `Jefatura · un turno` o8qaF7bI0PKv2XGZ).
 * Firma de Lenovo: «quien los llama manda el trabajo raíz en el sobre; si alguno no lo manda, "sin dato"». Estos turnos NO inventan nada: si el sobre (o el pedido) trae
 * `trabajo_tipo` + `trabajo_id` los pasan tal cual a `run-sdk` junto con `paso` (el del sobre o «turno-<n>»); si falta uno de los dos no agregan nada. Solo se AGREGA una línea al cuerpo.
 */
import { cambiarCodigo } from './lib.mjs'

export const LINEA_TRABAJO = "  ...(function () { const g = (k) => String((p && p[k]) || (e && e[k]) || '').trim(); const ti = g('trabajo_tipo'), id = g('trabajo_id'); return ti && id ? { trabajo_tipo: ti, trabajo_id: id, paso: g('paso') || ('turno-' + (t && t.n)) } : {}; })(),"

export function construirTrabajoDeCadaLlamadaTurnos(f) {
  const ancla = "  thinking_mode: p.thinking_mode || 'disabled',"
  cambiarCodigo(f, '② Armar el pedido', ancla, ancla + '\n' + LINEA_TRABAJO)
}
