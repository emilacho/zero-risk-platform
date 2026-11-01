/**
 * Acciones del tablero, CICLO DEL PLAN (01-nov · ORDEN Lenovo 12:36Z firmada por Emilio · tramo 2 · CC1):
 *   plan-cambios  (GASTA) · el dueño pide cambios sobre el plan vigente: queda en `plan_cambios` (tabla propia, no la bandeja) y se despierta la planeación
 *                 con `plan_base_id` + `cambios_del_dueno`; el redactor reescribe SOBRE el plan anterior y sale una VERSIÓN nueva (version · reemplaza_a en el tag).
 *                 Tope de 3 vueltas: después el plan se decide a mano (aprobar así o hablar con la agencia).
 *   plan-aprobar  (US$ 0 aquí) · el dueño aprueba el plan vigente: el plan pasa a `approved`, la compuerta (`plan_aprobaciones`) queda `aprobado` y se despierta
 *                 la SEGUNDA MITAD (PDF → cable → brief) con el sobre que el flujo guardó en el corte `plan_revisado`. Un plan de antes de la compuerta se aprueba
 *                 sin reanudar nada (su segunda mitad ya corrió sola).
 * Vigente = la última versión guardada del cliente que ningún tag marca como reemplazada. La versión y «reemplaza a» viven en `provenance_tag` (cero DDL).
 */
import { confirmarGasto, esObjeto, rechazo, textoEntre, UUID, type Db, type Fila, type Manejador, type Salida } from './comun'

/** vueltas de reescritura que admite un plan (la versión 1 + 3 reescrituras = versión 4 es la última) */
export const TOPE_DE_VUELTAS = 3
/** lo máximo que puede gastar UNA reescritura (redactor + jefatura) · el tablero lo muestra y lo confirma */
export const TOPE_REESCRITURA_USD = 8
export const CAMINO_PLANEACION = 'zero-risk/planeacion'
export const CAMINO_PLAN_APROBADO = 'zero-risk/plan-aprobado'
export const TIPO_PLAN = 'campaign_plan_90d'
const ABIERTOS = ['pendiente', 'en_reescritura']

type Plan = { id: string; client_id: string; status: string; tag: Fila; version: number; vigente: boolean; por_que_no: string | null }

/** la versión del plan según su tag (ausente = 1) */
export const versionDelPlan = (tag: unknown): number => (esObjeto(tag) && Number.isInteger(tag.version) && (tag.version as number) >= 1 ? (tag.version as number) : 1)

async function leerPlan(db: Db, planId: string): Promise<{ ok: true; plan: Plan } | { ok: false; salida: Salida }> {
  const r = await db.from('client_historical_outputs').select('id, client_id, output_type, status, provenance_tag, created_at').eq('id', planId).limit(1)
  if (r.error) return { ok: false, salida: rechazo(500, 'planes_error', r.error.message) }
  const f = ((r.data as Fila[] | null) ?? [])[0]
  if (!f || f.output_type !== TIPO_PLAN) return { ok: false, salida: rechazo(404, 'plan_inexistente', 'no existe ese plan de 90 días') }
  const tag = esObjeto(f.provenance_tag) ? f.provenance_tag : {}
  const client_id = String(f.client_id)
  // vigente: el tag no lo marca como reemplazado Y es la última versión guardada del cliente (sin contar las rechazadas)
  let por_que_no: string | null = tag.vigente === false || tag.superseded_por ? 'ese plan ya fue reemplazado por una versión más nueva' : null
  if (!por_que_no) {
    const u = await db.from('client_historical_outputs').select('id').eq('client_id', client_id).eq('output_type', TIPO_PLAN).neq('status', 'rejected').order('created_at', { ascending: false }).limit(1)
    if (u.error) return { ok: false, salida: rechazo(500, 'planes_error', u.error.message, { client_id }) }
    const ultimo = ((u.data as Fila[] | null) ?? [])[0]
    if (ultimo && String(ultimo.id) !== planId) por_que_no = 'hay un plan más nuevo de este cliente: el vigente es el último'
  }
  return { ok: true, plan: { id: planId, client_id, status: String(f.status), tag, version: versionDelPlan(tag), vigente: por_que_no === null, por_que_no } }
}

/** ¿hay un pedido de cambios abierto (pendiente o en reescritura) sobre este plan? */
async function cambioAbierto(db: Db, planId: string): Promise<{ ok: true; fila: Fila | null } | { ok: false; mensaje: string }> {
  const r = await db.from('plan_cambios').select('id, estado, creado_en').eq('plan_id', planId).in('estado', ABIERTOS).limit(1)
  if (r.error) return { ok: false, mensaje: r.error.message }
  return { ok: true, fila: ((r.data as Fila[] | null) ?? [])[0] ?? null }
}

/** las guardas comunes a las dos puertas: el plan existe, es el vigente, no está rechazado ni aprobado y no tiene reescritura en curso */
async function planDecidible(db: Db, planId: string, toca: Salida['toca']): Promise<{ ok: true; plan: Plan; t: NonNullable<Salida['toca']> } | { ok: false; salida: Salida }> {
  const p = await leerPlan(db, planId)
  if (!p.ok) return { ok: false, salida: { ...p.salida, toca: { ...toca, ...(p.salida.toca ?? {}) } } }
  const t = { ...toca, client_id: p.plan.client_id, output_id: planId }
  if (p.plan.status === 'rejected') return { ok: false, salida: rechazo(409, 'plan_rechazado', 'ese plan está rechazado: no se decide sobre él', t) }
  if (!p.plan.vigente) return { ok: false, salida: rechazo(409, 'no_es_el_vigente', p.plan.por_que_no ?? 'ese plan no es el vigente', t) }
  if (p.plan.status === 'approved') return { ok: false, salida: rechazo(409, 'plan_ya_aprobado', 'ese plan ya está aprobado: su siguiente fase ya arrancó', t) }
  const a = await cambioAbierto(db, planId)
  if (!a.ok) return { ok: false, salida: rechazo(500, 'planes_error', a.mensaje, t) }
  if (a.fila) return { ok: false, salida: rechazo(409, 'reescritura_en_curso', `ya hay un pedido de cambios ${a.fila.estado === 'en_reescritura' ? 'en reescritura' : 'pendiente'} sobre este plan: espera la versión nueva`, t) }
  return { ok: true, plan: p.plan, t }
}

// ───────────────────────── plan-cambios (GASTA: el redactor reescribe y la jefatura revisa)
export const planCambios: Manejador = async ({ db, ahora }, { cuerpo, reviewer }) => {
  if (typeof cuerpo.plan_id !== 'string' || !UUID.test(cuerpo.plan_id)) return rechazo(400, 'entrada_invalida', '`plan_id` debe ser un uuid')
  const texto = textoEntre(cuerpo.texto, 5, 4000)
  const toca = { output_id: cuerpo.plan_id, comentario: texto }
  if (!texto) return rechazo(400, 'entrada_invalida', '`texto` (qué debe cambiar) debe tener de 5 a 4000 caracteres', toca)
  const g = confirmarGasto(cuerpo, TOPE_REESCRITURA_USD)
  if (!g.ok) return { ...g.salida, toca }
  const d = await planDecidible(db, cuerpo.plan_id, toca)
  if (!d.ok) return d.salida
  const { plan, t } = d
  if (plan.version > TOPE_DE_VUELTAS) return rechazo(409, 'tope_de_vueltas', `este plan ya se reescribió ${TOPE_DE_VUELTAS} veces (versión ${plan.version}): se decide a mano, apruébalo así o habla con la agencia`, t)
  const hora = ahora().toISOString()
  const ins = await db.from('plan_cambios').insert({ client_id: plan.client_id, plan_id: plan.id, vuelta: plan.version, texto, pedido_por: reviewer, tope_usd: g.tope, estado: 'pendiente', creado_en: hora, actualizado_en: hora }).select('id').single()
  if (ins.error || !ins.data) return rechazo(500, 'planes_error', ins.error?.message ?? 'no se guardó el pedido de cambios', t)
  const cambioId = String((ins.data as Fila).id)
  // la compuerta de ESTA versión queda «cambios pedidos» (si existe: los planes de antes de la compuerta no la tienen)
  const c = await db.from('plan_aprobaciones').update({ estado: 'cambios_pedidos', decidido_por: reviewer, decidido_en: hora, comentario: texto, actualizado_en: hora }).eq('plan_id', plan.id).eq('estado', 'pendiente').select('id')
  if (c.error) return rechazo(500, 'planes_error', c.error.message, t)
  return {
    status: 200,
    cuerpo: { ok: true, plan_cambio_id: cambioId, plan_id: plan.id, vuelta: plan.version, version_nueva: plan.version + 1, vueltas_restantes: TOPE_DE_VUELTAS - plan.version, tope_usd: g.tope, estado: 'pendiente' },
    toca: t,
    despertar_flujo: {
      camino: CAMINO_PLANEACION,
      cuerpo: { client_id: plan.client_id, plan_base_id: plan.id, cambios_del_dueno: texto, plan_cambio_id: cambioId, forzar: true, con_analisis: false, con_mercado: false, tope_reescritura_usd: g.tope, origen: 'tablero/plan-cambios', pedido_por: reviewer },
      registrar: { tabla: 'plan_cambios', id: cambioId },
    },
  }
}

// ───────────────────────── plan-aprobar (US$ 0 aquí · reanuda PDF → brief, que gasta lo de siempre)
export const planAprobar: Manejador = async ({ db, ahora }, { cuerpo, reviewer }) => {
  if (typeof cuerpo.plan_id !== 'string' || !UUID.test(cuerpo.plan_id)) return rechazo(400, 'entrada_invalida', '`plan_id` debe ser un uuid')
  const comentario = cuerpo.comentario === undefined || cuerpo.comentario === null || cuerpo.comentario === '' ? null : textoEntre(cuerpo.comentario, 1, 1000)
  const toca = { output_id: cuerpo.plan_id, comentario }
  if (cuerpo.comentario && !comentario) return rechazo(400, 'entrada_invalida', '`comentario` debe tener hasta 1000 caracteres', toca)
  const d = await planDecidible(db, cuerpo.plan_id, toca)
  if (!d.ok) return d.salida
  const { plan, t } = d
  const hora = ahora().toISOString()
  const u = await db.from('client_historical_outputs').update({ status: 'approved', updated_at: hora }).eq('id', plan.id).neq('status', 'approved').select('id')
  if (u.error) return rechazo(500, 'planes_error', u.error.message, t)
  if (((u.data as Fila[] | null) ?? []).length === 0) return rechazo(409, 'plan_ya_aprobado', 'otra decisión se tomó mientras tanto', t)
  // la nota «plan con pendientes» de la bandeja (si la hay) queda resuelta con la misma decisión · nunca frena
  try { await db.from('hitl_queue').update({ status: 'approved', reviewer, resolved_by: reviewer, decided_at: hora, resolved_at: hora, decision: { via: 'tablero', tipo: 'plan_con_pendientes', decision: 'aprobar', resultado: 'aprobado así', origen: 'plan-aprobar' } }).eq('output_id', plan.id).eq('type', 'plan_con_pendientes').eq('status', 'pending') } catch { /* la bandeja no frena la aprobación */ }
  const a = await db.from('plan_aprobaciones').select('id, estado, sobre_de_reanudacion').eq('plan_id', plan.id).limit(1)
  if (a.error) return rechazo(500, 'planes_error', a.error.message, t)
  const comp = ((a.data as Fila[] | null) ?? [])[0]
  const base = { ok: true, plan_id: plan.id, version: plan.version, estado: 'approved', aprobado_por: reviewer }
  if (!comp || (comp.estado !== 'pendiente' && comp.estado !== 'cambios_pedidos')) {
    return { status: 200, cuerpo: { ...base, reanuda: false, motivo: comp ? `la compuerta de este plan está «${String(comp.estado)}»: no hay segunda mitad que reanudar` : 'este plan salió antes de la compuerta: su segunda mitad (PDF y brief) ya corrió sola' }, toca: t }
  }
  const c = await db.from('plan_aprobaciones').update({ estado: 'aprobado', decidido_por: reviewer, decidido_en: hora, ...(comentario ? { comentario } : {}), actualizado_en: hora }).eq('id', comp.id).in('estado', ['pendiente', 'cambios_pedidos']).select('id')
  if (c.error) return rechazo(500, 'planes_error', c.error.message, t)
  if (((c.data as Fila[] | null) ?? []).length === 0) return rechazo(409, 'plan_ya_aprobado', 'otra decisión se tomó mientras tanto', t)
  const sobre = esObjeto(comp.sobre_de_reanudacion) ? comp.sobre_de_reanudacion : {}
  const aprobacionId = String(comp.id)
  return {
    status: 200,
    cuerpo: { ...base, reanuda: true, aprobacion_id: aprobacionId },
    toca: t,
    despertar_flujo: { camino: CAMINO_PLAN_APROBADO, cuerpo: { ...sobre, aprobacion_id: aprobacionId, plan_id: plan.id, client_id: plan.client_id, aprobado_por: reviewer, origen: 'tablero/plan-aprobar' }, registrar: { tabla: 'plan_aprobaciones', id: aprobacionId } },
  }
}
