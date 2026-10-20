/**
 * UN PLAN CON PENDIENTES ESPERA A EMILIO Y, AL APROBARLO, LA CADENA SIGUE SOLA (CC#2 · 20-oct, parte 3 del encargo «limpiar y arreglar»).
 * La planeación, cuando el chequeo marca pendientes, ya NO pide el parte del brief: deja un elemento `plan_con_pendientes` en la bandeja con lo que hace falta para pedirlo después
 * (`journey_id`, `tenant_id`, `dry_run`, `correlation_id`). Al APROBAR ese elemento, este módulo emite el MISMO sobre que la planeación habría emitido (`planeacion/plan-listo` · `briefear`,
 * misma `idempotency_key` `{journey}:briefear`): si ya se había emitido, la sala lo toma por duplicado y no hay doble gasto.
 * Rechazar o editar NO emite. Sin red propia: todo entra por puertos (la prueba usa los de memoria).
 */
export const TIPO_PLAN_CON_PENDIENTES = 'plan_con_pendientes'
export const FUENTE_DEL_SOBRE = 'planeacion/plan-listo'
export const INTENCION_DEL_SOBRE = 'briefear'

export interface ElementoDePlan {
  id: string
  type: string | null
  status: string
  client_id: string | null
  payload: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
}

export interface SobreBriefear {
  source: string
  intent: string
  payload: { client_id: string; plan_id: string | null; dry_run: boolean; desde_worker: string; aprobado_en_la_bandeja: true; hitl_id: string }
  idempotency_key: string
  logical_period: string
  tenant_id: string
  client_id: string
  correlation_id?: string
}

export interface RespuestaDeLaSala { ok: boolean; kind?: string; code?: string; detail?: string; event_id?: string }

export interface PuertosPlanAprobado {
  leerElemento(id: string): Promise<ElementoDePlan | null>
  emitir(sobre: SobreBriefear): Promise<RespuestaDeLaSala>
  guardarMarca(id: string, marca: Record<string, unknown>): Promise<void>
  ahora(): Date
}

export type ResultadoDeAprobar =
  | { ok: true; ya_estaba: boolean; sobre: SobreBriefear; respuesta?: RespuestaDeLaSala }
  | { ok: false; error: 'elemento_inexistente' | 'no_es_un_plan_con_pendientes' | 'no_aprobado' | 'sin_cliente' | 'sin_viaje' | 'sala_no_acepto' | 'sala_no_contesto'; detalle?: string }

const texto = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')

/** arma el sobre a partir de lo que dejó la planeación en el `payload` de la bandeja; sin viaje NO se emite (la llave de idempotencia sería compartida entre clientes) */
export function armarSobre(el: ElementoDePlan): { ok: true; sobre: SobreBriefear } | { ok: false; error: 'sin_cliente' | 'sin_viaje'; detalle: string } {
  const p = el.payload ?? {}
  const client_id = texto(el.client_id)
  if (!client_id) return { ok: false, error: 'sin_cliente', detalle: 'el elemento no tiene client_id' }
  const journey = texto(p.journey_id)
  if (!journey) return { ok: false, error: 'sin_viaje', detalle: 'el elemento no trae journey_id: sin él no se puede repetir la llave de idempotencia del sobre original' }
  const tenant = texto(p.tenant_id) || client_id
  const correlacion = texto(p.correlation_id)
  const plan_id = texto(p.plan_id) || null
  return {
    ok: true,
    sobre: {
      source: FUENTE_DEL_SOBRE,
      intent: INTENCION_DEL_SOBRE,
      payload: { client_id, plan_id, dry_run: p.dry_run === true, desde_worker: 'X9F0zp6LQ2xGEYVS', aprobado_en_la_bandeja: true, hitl_id: el.id },
      idempotency_key: `${journey}:briefear`,
      logical_period: `alta:${journey}`,
      tenant_id: tenant,
      client_id,
      ...(correlacion ? { correlation_id: correlacion } : {}),
    },
  }
}

export async function emitirBriefearAlAprobar(P: PuertosPlanAprobado, a: { hitl_id: string }): Promise<ResultadoDeAprobar> {
  const el = await P.leerElemento(a.hitl_id)
  if (!el) return { ok: false, error: 'elemento_inexistente' }
  if (el.type !== TIPO_PLAN_CON_PENDIENTES) return { ok: false, error: 'no_es_un_plan_con_pendientes' }
  if (el.status !== 'approved') return { ok: false, error: 'no_aprobado', detalle: `estado ${el.status}` }
  const armado = armarSobre(el)
  if (!armado.ok) return { ok: false, error: armado.error, detalle: armado.detalle }
  const previa = (el.metadata ?? {}).briefear_emitido
  if (previa && typeof previa === 'object') return { ok: true, ya_estaba: true, sobre: armado.sobre }
  let r: RespuestaDeLaSala
  try { r = await P.emitir(armado.sobre) } catch (e) { return { ok: false, error: 'sala_no_contesto', detalle: e instanceof Error ? e.message : String(e) } }
  const aceptado = r.ok === true && (r.kind === 'accepted' || r.kind === 'duplicate')
  if (!aceptado) return { ok: false, error: 'sala_no_acepto', detalle: String(r.code ?? r.detail ?? 'sin detalle').slice(0, 200) }
  await P.guardarMarca(el.id, { briefear_emitido: { hora: P.ahora().toISOString(), kind: r.kind, event_id: r.event_id ?? null, idempotency_key: armado.sobre.idempotency_key } })
  return { ok: true, ya_estaba: false, sobre: armado.sobre, respuesta: r }
}
