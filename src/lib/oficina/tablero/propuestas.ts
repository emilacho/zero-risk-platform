/**
 * Acciones del tablero · 16-nov · Sprint 2 · S2-1 parte B (CC1) · la tarjeta «Propuestas» (CC5): el dueño aprueba una propuesta del video o pide cambios.
 * Contrato: ADENDA 1 de `2026-11-16-RESPUESTA-CC1-a-CC2-CC3-CC5-sprint2-hoja-fase-y-propuestas.md`.
 *  · `propuestas-aprobar` `{ encargo_id, ronda, propuesta_id }` → la elegida pasa a ser el guion y el encargo sigue solo (imagen final, clips y lo demás, sin otra parada);
 *  · `propuestas-cambios` `{ encargo_id, ronda, observaciones }` → la mesa corrige y vuelve a presentar con la ronda siguiente.
 * Ninguna pide confirmación de gasto aparte: el encargo ya tiene su tope fijado al abrirse y la aprobación es el «dale» de esa pieza (lo que se fabrica no pasa de ese tope).
 */
import { recibirDecisionDelDueno } from '../orquestador'
import { OBSERVACIONES_MAX, type DecisionDelDueno } from '../video/aprobacion'
import { esObjeto, rechazo, textoEntre, UUID, type Fila, type Manejador, type Salida } from './comun'

const RE_PROPUESTA = /^P\d{1,2}$/

function leerEntrada(cuerpo: Fila): { ok: true; encargo_id: string; ronda: number } | { ok: false; salida: Salida } {
  if (typeof cuerpo.encargo_id !== 'string' || !UUID.test(cuerpo.encargo_id)) return { ok: false, salida: rechazo(400, 'entrada_invalida', '`encargo_id` debe ser un uuid') }
  if (typeof cuerpo.ronda !== 'number' || !Number.isInteger(cuerpo.ronda) || cuerpo.ronda < 1) return { ok: false, salida: rechazo(400, 'entrada_invalida', '`ronda` debe ser un entero desde 1 (la que muestra la tarjeta)', { encargo_id: cuerpo.encargo_id }) }
  return { ok: true, encargo_id: cuerpo.encargo_id, ronda: cuerpo.ronda }
}

async function decidirDesdeElTablero(c: Parameters<Manejador>[0], encargo_id: string, d: DecisionDelDueno, toca: NonNullable<Salida['toca']>): Promise<Salida> {
  const s = await recibirDecisionDelDueno(c.puertos(), encargo_id, d)
  if (s.status !== 200) return { status: s.status, cuerpo: { ok: false, error: String(s.cuerpo.error ?? 'no_se_pudo'), detalle: String(s.cuerpo.detalle ?? '') }, toca }
  const dec = esObjeto(s.cuerpo.decision) ? s.cuerpo.decision : {}
  const turno = esObjeto(s.cuerpo.turno) ? s.cuerpo.turno : null
  const cuerpo: Fila = d.decision === 'aprobar'
    ? { ok: true, encargo_id, propuesta_id: dec.propuesta_id ?? d.propuesta_id, estado: 'aprobada' }
    : { ok: true, encargo_id, estado: 'observaciones', ronda_siguiente: d.ronda + 1 }
  // lo que sigue es un turno de agente (la mesa corrige, o un paso que pide un agente): la ruta despierta al flujo de la oficina, como al rehacer una pieza
  return { status: 200, cuerpo, toca, ...(s.cuerpo.accion === 'esperar' && turno ? { despertar: { encargo_id, turno } } : {}) }
}

// ───────────────────────── propuestas-aprobar (fabrica la elegida dentro del tope del encargo)
export const propuestasAprobar: Manejador = async (c, { cuerpo }) => {
  const e = leerEntrada(cuerpo)
  if (!e.ok) return e.salida
  const toca = { encargo_id: e.encargo_id }
  if (typeof cuerpo.propuesta_id !== 'string' || !RE_PROPUESTA.test(cuerpo.propuesta_id)) return rechazo(400, 'entrada_invalida', '`propuesta_id` debe ser «P1», «P2»… (el de la tarjeta)', toca)
  return decidirDesdeElTablero(c, e.encargo_id, { decision: 'aprobar', ronda: e.ronda, propuesta_id: cuerpo.propuesta_id }, toca)
}

// ───────────────────────── propuestas-cambios (la mesa corrige y vuelve a presentar)
export const propuestasCambios: Manejador = async (c, { cuerpo }) => {
  const e = leerEntrada(cuerpo)
  if (!e.ok) return e.salida
  const observaciones = textoEntre(cuerpo.observaciones, 1, OBSERVACIONES_MAX)
  const toca = { encargo_id: e.encargo_id, comentario: observaciones }
  if (!observaciones) return rechazo(400, 'entrada_invalida', `\`observaciones\` debe tener de 1 a ${OBSERVACIONES_MAX} caracteres`, { encargo_id: e.encargo_id })
  return decidirDesdeElTablero(c, e.encargo_id, { decision: 'cambios', ronda: e.ronda, observaciones }, toca)
}
