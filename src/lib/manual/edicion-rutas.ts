/**
 * Las rutas de «editar y validar el manual desde el dashboard» (30-oct). Las dos hacen primero lo del manual y DESPUÉS lo del cerebro; si el cerebro falla, el manual ya quedó y el pendiente se dice.
 *   PATCH /api/manual/{client_id}/campos   cuerpo: { campos:{<clave del borrador o del tablero>: texto, o vacío o null para retirarlo}, comentario?, reviewer, origen:'dashboard' }
 *   POST  /api/tablero/manual-validar      cuerpo: { client_id, reviewer, origen:'dashboard' } · aprobar el manual es lo que pide el plan (firma de Emilio, 3-nov)
 */
import { hayBorrador } from './borrador-del-dueno'
import { cerrarFirmasDelPlanAnterior } from './manual-primero'
import type { PedidoDePlan, ResultadoDelPedidoDePlan } from './pedir-plan'
import { decidirPalabraDelDueno, editarManualDelDueno, empujarCamposAlCerebro, validarCampoDelManual, validarManualDelDueno, type Db, type DepsDelCerebro } from './edicion-del-dueno'

type Fila = Record<string, unknown>
export interface DepsDeEdicion {
  db: Db
  cerebro: DepsDelCerebro
  /** re-indexa la versión nueva en el cerebro (retira los trozos de las anteriores); en producción es `empujarManualAlCerebro` */
  empujarManual: (x: { client_id: string; source_id: string }) => { estado: string; detalle?: string }
  ahora?: () => Date
  /** aprobar el manual pide el plan; en producción es `pedirPlanDelManual` */
  pedirPlan?: (p: PedidoDePlan) => Promise<ResultadoDelPedidoDePlan>
}
export interface SalidaDeEdicion { status: number; body: Fila; toca: { client_id: string | null; comentario?: string | null } }

const esObjeto = (x: unknown): x is Fila => typeof x === 'object' && x !== null && !Array.isArray(x)

export async function rutaEditarManual(d: DepsDeEdicion, client_id: string, cuerpo: unknown, reviewerPorOmision = 'emilio'): Promise<SalidaDeEdicion> {
  const b = esObjeto(cuerpo) ? cuerpo : {}
  const reviewer = typeof b.reviewer === 'string' && b.reviewer.trim() && b.reviewer.length <= 80 ? b.reviewer.trim() : reviewerPorOmision
  const comentario = typeof b.comentario === 'string' && b.comentario.trim() ? b.comentario.trim() : null
  const toca = { client_id, comentario }
  if (!esObjeto(b.campos)) return { status: 400, body: { ok: false, error: 'entrada_invalida', detalle: 'faltan los campos que cambian' }, toca }
  const ahora = (d.ahora ?? (() => new Date()))()
  const r = await editarManualDelDueno(d.db, { client_id, campos: b.campos, comentario, reviewer, ahora })
  if (!r.ok) return { status: r.status, body: { ok: false, error: r.error, detalle: r.detalle }, toca }
  // el manual ya quedó: ahora, como consecuencia, el cerebro (re-indexado de la versión + cada campo por la puerta del dueño)
  const indice = d.empujarManual({ client_id, source_id: r.source_id })
  const cerebro = await empujarCamposAlCerebro(d.cerebro, { client_id, version: r.version_nueva, cambios: r.cambios, reviewer, en: ahora.toISOString() })
  return {
    status: 200,
    toca,
    body: {
      ok: true, version_nueva: r.version_nueva, cambios: r.cambios.map((c) => ({ campo: c.clave_del_tablero, etiqueta: c.etiqueta, valor: c.valor, escrito_por: 'dueno', ...(c.retirado ? { retirado: true } : {}) })),
      completo: r.completo, huecos: r.huecos,
      cerebro: { indice: indice.estado, enviados: cerebro.enviados, pendientes: cerebro.pendientes },
      ...(cerebro.pendientes.length ? { aviso: 'El manual quedó guardado, pero el cerebro no recibió todos los campos todavía: queda pendiente.' } : {}),
    },
  }
}

/** POST /api/tablero/manual-palabra · cuerpo: { client_id, texto, decision:'prohibir'|'contexto'|'quitar', comentario?, reviewer, origen:'dashboard' } */
export async function rutaDecidirPalabra(d: DepsDeEdicion, cuerpo: Fila, reviewer: string): Promise<SalidaDeEdicion> {
  const client_id = typeof cuerpo.client_id === 'string' ? cuerpo.client_id : ''
  const comentario = typeof cuerpo.comentario === 'string' && cuerpo.comentario.trim() ? cuerpo.comentario.trim() : null
  const toca = { client_id: client_id || null, comentario }
  const r = await decidirPalabraDelDueno(d.db, { client_id, texto: cuerpo.texto, decision: cuerpo.decision, comentario, reviewer, ahora: (d.ahora ?? (() => new Date()))() })
  if (!r.ok) return { status: r.status, body: { ok: false, error: r.error, detalle: r.detalle }, toca }
  const indice = d.empujarManual({ client_id, source_id: r.source_id })
  return { status: 200, toca, body: { ok: true, version_nueva: r.version_nueva, decision: r.decision, texto: r.texto, prohibidas: r.duras, cerebro: { indice: indice.estado } } }
}

/** POST /api/tablero/manual-validar-campo · cuerpo: { client_id, campo, validado?: boolean (true por omisión), reviewer, origen:'dashboard' } · sin versión nueva */
export async function rutaValidarCampo(d: Pick<DepsDeEdicion, 'db' | 'ahora'>, cuerpo: Fila, reviewer: string): Promise<SalidaDeEdicion> {
  const client_id = typeof cuerpo.client_id === 'string' ? cuerpo.client_id : ''
  const toca = { client_id: client_id || null }
  if (cuerpo.validado !== undefined && typeof cuerpo.validado !== 'boolean') return { status: 400, body: { ok: false, error: 'entrada_invalida', detalle: '`validado` debe ser verdadero o falso' }, toca }
  const r = await validarCampoDelManual(d.db, { client_id, campo: cuerpo.campo, validado: cuerpo.validado !== false, reviewer, ahora: (d.ahora ?? (() => new Date()))() })
  if (!r.ok) return { status: r.status, body: { ok: false, error: r.error, detalle: r.detalle }, toca }
  return { status: 200, toca, body: { ...r } }
}

/** lo que impide aprobar ahora: un manual que se está regenerando, o un plan que ya está corriendo. Un error de lectura también frena: no se aprueba a ciegas */
async function queImpideAprobar(db: Db, client_id: string): Promise<{ status: number; error: string; detalle: string } | null> {
  const c = (await db.from('plan_cambios').select('id, manual_id').eq('client_id', client_id).in('estado', ['pendiente', 'en_reescritura'])) as { data: Fila[] | null; error: { message: string } | null }
  if (c.error) return { status: 502, error: 'no_se_pudo_leer', detalle: `no pude leer los pedidos de cambios: ${c.error.message}` }
  if ((c.data ?? []).some((f) => f.manual_id)) return { status: 409, error: 'regeneracion_en_curso', detalle: 'El manual se está regenerando. Podrás aprobarlo cuando termine.' }
  const p = (await db.from('plan_corridas').select('id').eq('client_id', client_id).in('estado', ['esperando', 'corriendo'])) as { data: Fila[] | null; error: { message: string } | null }
  if (p.error) return { status: 502, error: 'no_se_pudo_leer', detalle: `no pude leer las corridas del plan: ${p.error.message}` }
  if ((p.data ?? []).length) return { status: 409, error: 'plan_en_curso', detalle: 'Ya hay un plan en marcha para este cliente. Podrás aprobar cuando termine.' }
  // 3-nov · lo que marcó y no pidió debe contar antes de seguir con el plan
  const b = await hayBorrador(db, client_id, 'manual')
  if (b.error) return { status: 502, error: 'no_se_pudo_leer', detalle: `no pude leer el borrador: ${b.error}` }
  if (b.hay) return { status: 409, error: 'borrador_pendiente', detalle: 'Tienes cambios sin pedir en el manual. Pídelos o descártalos antes de aprobar.' }
  return null
}

export async function rutaValidarManual(d: DepsDeEdicion, client_id: string, reviewer: string): Promise<SalidaDeEdicion> {
  const toca = { client_id }
  const ahora = (d.ahora ?? (() => new Date()))()
  if (d.pedirPlan) {
    const impide = await queImpideAprobar(d.db, client_id)
    if (impide) return { status: impide.status, body: { ok: false, ...impide }, toca }
  }
  const r = await validarManualDelDueno(d.db, { client_id, reviewer, ahora })
  if (!r.ok) return { status: r.status, body: { ok: false, error: r.error, detalle: r.detalle }, toca }
  const indice = r.sin_cambios ? { estado: 'sin_cambios' } : d.empujarManual({ client_id, source_id: r.source_id })
  const plan = d.pedirPlan ? await d.pedirPlan({ client_id, manual_id: r.source_id }) : null
  // un pedido repetido no cierra nada: el plan que hay puede ser ya el nuevo
  if (plan?.pedido && !plan.repetido) await cerrarFirmasDelPlanAnterior(d.db, client_id, ahora)
  return {
    status: 200,
    toca,
    body: {
      ok: true, validado_por: 'dueno', version_nueva: r.version_nueva, sin_cambios: r.sin_cambios, aceptados_por_el_dueno: r.aceptados, cerebro: { indice: indice.estado },
      ...(plan ? { plan } : {}),
      ...(plan && !plan.pedido ? { aviso: 'El manual quedó aprobado, pero el plan no se pudo pedir. Vuelve a aprobar para reintentar.' } : {}),
    },
  }
}
