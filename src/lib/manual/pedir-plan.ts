/**
 * APROBAR EL MANUAL PIDE EL PLAN (firma de Emilio, 3-nov 14:46Z: «que no siga la cadena hasta que yo apruebe el manual»).
 * El sobre es el mismo que antes mandaba el alta al terminar, con la misma regla de la sala. La clave lleva la versión aprobada del manual: un doble clic o un reintento no pide dos planes.
 * Va con `forzar`: quien aprueba un manual nuevo pide el plan de ESE manual, aunque el cliente ya tenga uno. NUNCA lanza: si falla, el manual ya quedó aprobado y se dice.
 */
import { randomUUID } from 'node:crypto'
import { quienValido } from './campos-del-manual'
import { CLAVE_DE_LA_PALANCA, leerPalanca } from '../planeacion/mesa-de-analisis'

export interface PedidoDePlan { client_id: string; manual_id: string }
export type ResultadoDelPedidoDePlan =
  | { pedido: true; repetido: boolean; event_id: string | null }
  | { pedido: false; error: string }

/**
 * 04-nov · aprobar el manual pide un plan NUEVO: sin `force_restart`, el redactor del plan contesta con lo guardado por empleado, escrito con el manual anterior, a US$ 0 y sin avisar.
 * No duplica planes: de eso se encarga la clave de la corrida, una por versión del manual o por alta.
 */
// 05-nov (GO de Lenovo, D1): con análisis y con chequeo de forma. Emilio aprobó el paso 0 el 31-oct: calidad sobre precio. Sin esto, la mesa de análisis no corría y un plan malformado pasaba sin verse
const PEDIDO_COMPLETO = { force_restart: true, con_analisis: true, validar_forma: true } as const
const conPlanNuevo = (sobre: Record<string, unknown>): Record<string, unknown> => ({ ...sobre, payload: { ...((sobre.payload ?? {}) as Record<string, unknown>), ...PEDIDO_COMPLETO } })

export function sobreDelPlan(p: PedidoDePlan, correlation_id: string = randomUUID()): Record<string, unknown> {
  const corrida = `manual:${p.manual_id}:planear`
  return {
    source: 'alta/journey-completed',
    intent: 'planear',
    payload: { pedido: 'plan de 90 dias', dry_run: false, plan_v3: true, corrida, forzar: true, ...PEDIDO_COMPLETO, client_id: p.client_id, desde_worker: 'tablero-aprobar-manual', journey_id: p.manual_id },
    idempotency_key: corrida,
    logical_period: `manual:${p.manual_id}`,
    tenant_id: p.client_id,
    client_id: p.client_id,
    correlation_id,
  }
}

export interface EntornoDelPedido { url?: string; llave?: string; fetchImpl?: typeof fetch; /** lee `cadena_config`; en producción, el almacén de la cadena */ leerConfig?: (clave: string) => Promise<unknown> }

const LIMITE_DE_LA_PALANCA_MS = 5000
const leerConfigDeLaBase = async (clave: string): Promise<unknown> => (await import('../cadena/almacen-supabase')).almacenDeSupabase().leerConfig(clave)

/**
 * 05-nov (GO de Lenovo, «que corra uno solo») · UN solo informe de mercado por corrida. El flujo pide el paso 0 salvo que el disparo traiga `con_mercado: false`, y la mesa de análisis tiene su propio analista de mercado, que es el MISMO empleado.
 * Se queda el de la mesa: lee el material del cerebro y se archiva con sus citas; el paso 0 no trae citas y no se puede archivar.
 * Solo se apaga el paso 0 si la mesa va a correr de verdad para ESTE cliente. Con la palanca apagada, o si no se pudo leer, el sobre sale igual: mejor pagar dos veces que quedarse sin informe de mercado.
 */
export async function conUnSoloMercado(sobre: Record<string, unknown>, leerConfig: (clave: string) => Promise<unknown>): Promise<Record<string, unknown>> {
  const payload = (sobre.payload ?? {}) as Record<string, unknown>
  if (payload.con_analisis !== true || payload.con_mercado !== undefined || typeof payload.client_id !== 'string') return sobre
  try {
    let vencer: ReturnType<typeof setTimeout> | undefined
    const limite = new Promise<never>((_, rechazar) => { vencer = setTimeout(() => rechazar(new Error('la palanca tardó demasiado')), LIMITE_DE_LA_PALANCA_MS) })
    const config = await Promise.race([leerConfig(CLAVE_DE_LA_PALANCA), limite]).finally(() => clearTimeout(vencer))
    return leerPalanca(config, payload.client_id).encendida ? { ...sobre, payload: { ...payload, con_mercado: false } } : sobre
  } catch (err) {
    console.error(`[pedir-plan] no pude leer la palanca de la mesa: el paso 0 de mercado queda pedido · ${err instanceof Error ? err.message.slice(0, 160) : 'error'}`)
    return sobre
  }
}

export async function pedirPlanDelManual(p: PedidoDePlan, e: EntornoDelPedido = {}): Promise<ResultadoDelPedidoDePlan> {
  return mandarSobre(sobreDelPlan(p), e)
}

type Fila = Record<string, unknown>
interface ConsultaDeEsperas extends PromiseLike<{ data: Fila[] | null; error: { message: string } | null }> {
  select(c: string): ConsultaDeEsperas
  eq(c: string, v: unknown): ConsultaDeEsperas
  in(c: string, v: unknown[]): ConsultaDeEsperas
  order(c: string, o?: { ascending?: boolean }): ConsultaDeEsperas
  limit(n: number): ConsultaDeEsperas
  update(v: Fila): ConsultaDeEsperas
}
export interface BaseDeEsperas { from(tabla: string): unknown }
const SOLTADA_ANTES_DE_GUARDAR = 'aprobado_antes_de_guardar'
const detalleDe = (r: ResultadoDelPedidoDePlan) => (r.pedido ? (r.repetido ? 'repetido' : 'aceptado') : r.error)

/**
 * LA PAUSA (ajuste de Emilio, 14:49Z: «pausas que se quitan cuando yo hago las aprobaciones»). El alta deja guardado el sobre del plan; aprobar lo suelta y la cadena sigue con SU sobre y SU clave.
 *   · espera viva              → se suelta y se manda su sobre.
 *   · ya soltada por este manual → se manda el mismo sobre: la clave hace que un doble clic o un reintento no pidan dos planes.
 *   · sin espera, o soltada por otro manual → sobre propio por versión (un cliente cuya alta ya terminó, o un manual nuevo).
 *   · el dueño aprobó antes de que el alta guardara → el plan salió por versión: un reintento repite ESE sobre. El del alta lleva otra clave y pediría un segundo plan.
 * Si la base falla NO se pide nada: leer un error como «no hay espera» mandaría un segundo plan.
 */
export async function soltarEsperaYPedirPlan(db: BaseDeEsperas, p: PedidoDePlan & { reviewer: string; ahora: Date }, e: EntornoDelPedido = {}): Promise<ResultadoDelPedidoDePlan> {
  const esperas = () => db.from('esperas_del_dueno') as ConsultaDeEsperas
  const pedido = { client_id: p.client_id, manual_id: p.manual_id }
  const lectura = await esperas().select('id, estado, manual_id, soltada_por, sobre').eq('client_id', p.client_id).eq('tipo', 'manual').in('estado', ['esperando', 'soltada']).order('creado_en', { ascending: false }).limit(1)
  if (lectura.error) return { pedido: false, error: `no pude leer la espera del manual: ${lectura.error.message.slice(0, 160)}` }
  const espera = lectura.data?.[0]
  const estaViva = espera?.estado === 'esperando'
  if (!espera || (!estaViva && (espera.manual_id !== p.manual_id || espera.soltada_por === SOLTADA_ANTES_DE_GUARDAR))) {
    // el pedido por versión también deja su fila (Lenovo, 15:25Z): si la sala falla y Emilio recarga, el tablero sigue viendo que falta y no esconde el botón
    const sobre = sobreDelPlan(pedido)
    const r = await mandarSobre(sobre, e)
    const hora = p.ahora.toISOString()
    const fila = await (esperas() as ConsultaDeEsperas & { upsert(v: Fila, o: { onConflict: string }): ConsultaDeEsperas }).upsert({ client_id: p.client_id, tipo: 'manual', clave: String(sobre.idempotency_key), sobre, estado: 'soltada', manual_id: p.manual_id, soltada_por: p.reviewer, soltada_en: hora, despertado: r.pedido, despertar_detalle: detalleDe(r), actualizado_en: hora }, { onConflict: 'tipo,clave' })
    if (fila.error) console.error(`[pedir-plan] el pedido salió, pero no pude dejar su fila: ${fila.error.message.slice(0, 160)}`)
    return r
  }

  const hora = p.ahora.toISOString()
  if (estaViva) {
    const toma = await esperas().update({ estado: 'soltada', manual_id: p.manual_id, soltada_por: p.reviewer, soltada_en: hora, actualizado_en: hora }).eq('id', espera.id).eq('estado', 'esperando').select('id')
    if (toma.error) return { pedido: false, error: `no pude soltar la espera del manual: ${toma.error.message.slice(0, 160)}` }
    // otro clic la soltó en este instante: se relee para no mandar el sobre de otro manual
    if (!(toma.data ?? []).length) {
      const otra = await esperas().select('manual_id').eq('id', espera.id)
      if (otra.error || otra.data?.[0]?.manual_id !== p.manual_id) return { pedido: false, error: 'la espera del manual cambió mientras tanto: vuelve a aprobar' }
    }
    // el alta guardó esperas más viejas de este cliente: ya no las suelta nadie
    await esperas().update({ estado: 'reemplazada', actualizado_en: hora }).eq('client_id', p.client_id).eq('tipo', 'manual').eq('estado', 'esperando')
  }
  const r = await mandarSobre(conPlanNuevo(espera.sobre as Record<string, unknown>), e)
  await esperas().update({ despertado: r.pedido, despertar_detalle: detalleDe(r), actualizado_en: new Date().toISOString() }).eq('id', espera.id)
  return r
}

export type ResultadoDeGuardar =
  | { status: 200; cuerpo: { ok: true; kind: 'guardada' | 'duplicate' | 'ya_aprobada'; espera_id?: string } }
  | { status: 400 | 502; cuerpo: { ok: false; code: string; detail: string } }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null)
const rechazo = (status: 400 | 502, code: string, detail: string): ResultadoDeGuardar => ({ status, cuerpo: { ok: false, code, detail: detail.slice(0, 300) } })

/**
 * El alta deja aquí el sobre que antes mandaba a la sala; se queda esperando a que el dueño apruebe el manual. Nada corre mientras espera.
 * Si el dueño ya aprobó antes de que el alta llegara, el botón ya pidió el plan: la espera nace soltada y NO se manda nada, porque mandarla pediría un segundo plan.
 * El orden importa: primero se guarda y después se mira el manual. El botón hace lo contrario (aprueba y después busca la espera), así que al menos uno de los dos ve al otro.
 */
export async function guardarEsperaDelManual(db: BaseDeEsperas, entrada: unknown, ahora: Date = new Date()): Promise<ResultadoDeGuardar> {
  const e = (entrada && typeof entrada === 'object' ? entrada : {}) as Fila
  const client_id = texto(e.client_id)
  if (!client_id || !UUID.test(client_id)) return rechazo(400, 'entrada_invalida', 'falta el cliente')
  if (e.tipo !== 'manual') return rechazo(400, 'entrada_invalida', 'por ahora solo existe la espera del manual')
  const sobre = (e.sobre && typeof e.sobre === 'object' && !Array.isArray(e.sobre) ? e.sobre : null) as Fila | null
  const clave = texto(sobre?.idempotency_key)
  if (!sobre || !clave) return rechazo(400, 'entrada_invalida', 'falta el sobre con su clave')
  if (sobre.client_id !== client_id) return rechazo(400, 'entrada_invalida', 'el sobre es de otro cliente')

  const esperas = () => db.from('esperas_del_dueno') as ConsultaDeEsperas & { insert(v: Fila): ConsultaDeEsperas }
  const hecha = await esperas().insert({ client_id, tipo: 'manual', clave, sobre, estado: 'esperando', workflow_id: texto(e.workflow_id), workflow_execution_id: texto(e.workflow_execution_id) }).select('id')
  if (hecha.error) {
    if ((hecha.error as { code?: string }).code === '23505') return { status: 200, cuerpo: { ok: true, kind: 'duplicate' } }
    return rechazo(502, 'no_se_pudo_guardar', hecha.error.message)
  }
  const id = String(hecha.data?.[0]?.id ?? '')

  const manual = await (db.from('client_brand_books') as ConsultaDeEsperas).select('id, human_validated, provenance_tag').eq('client_id', client_id).order('version', { ascending: false }).limit(1)
  // sin poder leer el manual, la espera se queda viva. Si el dueño ya había aprobado y vuelve a tocar el botón, saldría un segundo plan: exige este fallo y ese clic juntos, y es mejor que perder el pedido
  if (manual.error || !manual.data?.[0] || quienValido(manual.data[0]) !== 'dueno') return { status: 200, cuerpo: { ok: true, kind: 'guardada', espera_id: id } }
  const hora = ahora.toISOString()
  await esperas().update({ estado: 'soltada', manual_id: String(manual.data[0].id), soltada_por: SOLTADA_ANTES_DE_GUARDAR, soltada_en: hora, despertar_detalle: 'el botón ya había pedido el plan', actualizado_en: hora }).eq('tipo', 'manual').eq('clave', clave).eq('estado', 'esperando')
  return { status: 200, cuerpo: { ok: true, kind: 'ya_aprobada', espera_id: id } }
}

async function mandarSobre(sobreBase: Record<string, unknown>, e: EntornoDelPedido): Promise<ResultadoDelPedidoDePlan> {
  const url = e.url ?? process.env.SALA_INTAKE_URL ?? 'https://zero-risk-platform.vercel.app/api/sala/intake'
  const llave = e.llave ?? process.env.SALA_INGRESS_API_KEY ?? process.env.INTERNAL_API_KEY ?? ''
  if (!llave) return { pedido: false, error: 'falta la llave de la sala: no se llamó a nadie' }
  const f = e.fetchImpl ?? fetch
  const sobre = await conUnSoloMercado(sobreBase, e.leerConfig ?? leerConfigDeLaBase)
  try {
    const r = await f(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': llave, 'x-source': 'tablero-aprobar-manual' }, body: JSON.stringify(sobre) })
    const j = (await r.json().catch(() => ({}))) as { ok?: unknown; kind?: unknown; event_id?: unknown; code?: unknown; detail?: unknown }
    // la puerta contesta 200 también cuando rechaza: manda `ok`
    if (!r.ok || j.ok !== true) return { pedido: false, error: `la sala no aceptó el pedido: ${String(j.code ?? r.status)}${j.detail ? ` · ${String(j.detail).slice(0, 160)}` : ''}` }
    return { pedido: true, repetido: j.kind === 'duplicate', event_id: typeof j.event_id === 'string' ? j.event_id : null }
  } catch (err) {
    return { pedido: false, error: `no se pudo llegar a la sala: ${err instanceof Error ? err.message.slice(0, 160) : 'error'}` }
  }
}
