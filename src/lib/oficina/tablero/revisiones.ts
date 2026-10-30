/**
 * Acciones del tablero, TRAMO 2 (30-oct): resolver una revisión que NO es una pieza y firmar un tablero financiero que el código dejó sin firma.
 * (Las piezas se deciden por `/api/hitl/[id]` y `/api/oficina/cambios`; aquí no.)
 */
import { rechazo, textoEntre, UUID, type Fila, type Manejador } from './comun'

/** tipos de revisión que el tablero sabe resolver · aprobar=approved · rechazar=rejected (la bandeja solo admite pending/approved/rejected/edited) */
export const TIPOS_RESOLUBLES = ['confirm_competitor_list', 'editor_escalation', 'plan_con_pendientes'] as const
const PALABRA: Record<string, { aprobar: string; rechazar: string }> = {
  confirm_competitor_list: { aprobar: 'lista confirmada', rechazar: 'lista rechazada' },
  editor_escalation: { aprobar: 'revisada', rechazar: 'devuelta' },
  plan_con_pendientes: { aprobar: 'aprobado así', rechazar: 'cambios pedidos' },
}

export const revisionResolver: Manejador = async ({ db, ahora }, { cuerpo, reviewer }) => {
  if (typeof cuerpo.hitl_id !== 'string' || !UUID.test(cuerpo.hitl_id)) return rechazo(400, 'entrada_invalida', '`hitl_id` debe ser un uuid')
  if (cuerpo.decision !== 'aprobar' && cuerpo.decision !== 'rechazar') return rechazo(400, 'entrada_invalida', '`decision` debe ser aprobar o rechazar')
  const decision: 'aprobar' | 'rechazar' = cuerpo.decision
  const comentario = cuerpo.comentario === undefined || cuerpo.comentario === null || cuerpo.comentario === '' ? null : textoEntre(cuerpo.comentario, 1, 1000)
  if (cuerpo.comentario && !comentario) return rechazo(400, 'entrada_invalida', '`comentario` debe tener hasta 1000 caracteres')
  const toca = { hitl_id: cuerpo.hitl_id, comentario }
  if (decision === 'rechazar' && !comentario) return rechazo(400, 'falta_el_comentario', 'al rechazar hace falta decir por qué', toca)
  const r = await db.from('hitl_queue').select('id, type, status, client_id').eq('id', cuerpo.hitl_id).limit(1)
  if (r.error) return rechazo(500, 'bandeja_error', r.error.message, toca)
  const fila = ((r.data as Fila[] | null) ?? [])[0]
  if (!fila) return rechazo(404, 'revision_inexistente', 'no existe esa revisión', toca)
  const t = { ...toca, client_id: fila.client_id ? String(fila.client_id) : null }
  const tipo = String(fila.type)
  if (!(TIPOS_RESOLUBLES as readonly string[]).includes(tipo)) return rechazo(409, 'tipo_no_resoluble_aqui', `las revisiones de tipo «${tipo}» no se resuelven desde aquí (las piezas se deciden en su pantalla)`, t)
  if (fila.status !== 'pending') return rechazo(409, 'ya_resuelta', `esa revisión ya está «${String(fila.status)}»`, t)
  const hora = ahora().toISOString()
  const u = await db.from('hitl_queue').update({
    status: decision === 'aprobar' ? 'approved' : 'rejected', reviewer, resolved_by: reviewer, decided_at: hora, resolved_at: hora,
    ...(comentario ? { resolution_notes: comentario } : {}),
    decision: { via: 'tablero', tipo, decision, resultado: PALABRA[tipo][decision], ...(comentario ? { comentario } : {}) },
  }).eq('id', cuerpo.hitl_id).eq('status', 'pending').select('id')
  if (u.error) return rechazo(500, 'bandeja_error', u.error.message, t)
  if (((u.data as Fila[] | null) ?? []).length === 0) return rechazo(409, 'ya_resuelta', 'otra decisión se tomó mientras tanto', t)
  return { status: 200, cuerpo: { ok: true, hitl_id: cuerpo.hitl_id, tipo, estado: decision === 'aprobar' ? 'approved' : 'rejected', resultado: PALABRA[tipo][decision] }, toca: t }
}

/** Firma con nombre y fecha un tablero que el código dejó `sin_firma` (hallazgos críticos abiertos tras la única corrección): es la firma de una persona sobre ese tablero tal cual (su huella no cambia). */
export const firmarTablero: Manejador = async ({ db, ahora }, { cuerpo, reviewer }) => {
  if (typeof cuerpo.tablero_id !== 'string' || !UUID.test(cuerpo.tablero_id)) return rechazo(400, 'entrada_invalida', '`tablero_id` debe ser un uuid')
  const r = await db.from('finanzas_tableros').select('id, client_id, estado, vigente, dry_run, huella').eq('id', cuerpo.tablero_id).limit(1)
  if (r.error) return rechazo(500, 'finanzas_error', r.error.message)
  const f = ((r.data as Fila[] | null) ?? [])[0]
  if (!f) return rechazo(404, 'tablero_inexistente', 'no existe ese tablero')
  const toca = { client_id: String(f.client_id) }
  if (f.estado !== 'sin_firma') return rechazo(409, 'no_esta_sin_firma', `solo se firma un tablero «sin_firma» (este está «${String(f.estado)}»)`, toca)
  if (f.dry_run === true) return rechazo(409, 'es_un_ensayo', 'un tablero de ensayo no se firma', toca)
  if (f.vigente !== true) return rechazo(409, 'no_es_el_vigente', 'solo se firma el tablero vigente del cliente', toca)
  if (!f.huella) return rechazo(409, 'sin_huella', 'el tablero no tiene huella: no se puede firmar', toca)
  const u = await db.from('finanzas_tableros').update({ estado: 'firmado', firmado_por: reviewer, firmado_en: ahora().toISOString() }).eq('id', cuerpo.tablero_id).eq('estado', 'sin_firma').select('id')
  if (u.error) return rechazo(500, 'finanzas_error', u.error.message, toca)
  if (((u.data as Fila[] | null) ?? []).length === 0) return rechazo(409, 'no_esta_sin_firma', 'otra decisión se tomó mientras tanto', toca)
  return { status: 200, cuerpo: { ok: true, tablero_id: cuerpo.tablero_id, estado: 'firmado', firmado_por: reviewer }, toca }
}
