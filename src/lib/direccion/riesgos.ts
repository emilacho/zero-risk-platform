/**
 * GET /api/direccion/riesgos · incidentes, fallas recientes, topes cerca del límite, saldos, pausas y credenciales que el sistema puede saber. Gravedad: 3 = grave · 2 = atender · 1 = a la vista.
 * Lee la base y, solo de lectura, las cuentas de n8n y Apify. Un servicio que rechaza nuestra credencial ES un riesgo (credencial caducada) y se dice; lo demás de credenciales no tiene fuente.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { consultasDeDireccion } from '../cadena/almacen-supabase'
import { consultaEstadoDeLaOficina } from '../oficina/lectura-de-direccion'
import { decidirPlanApify, leerUsoDelPlan, pctMaximoDelPlan } from '../portero-alimenta/plan-apify'
import { resolveClientCapContext, resolveClientFamily, resolveRunSpendCapUsd, techoDelCliente, techoGenericoDeArranque } from '../run-sdk-spend-gate'
import { esObjeto, estaCompleto, leer, leerClientes, numero, redondear, sinSecretos, texto, type Contexto, type Fila, type Fuente } from './comun'
import { vidaDelPaso, type DespachoLeido } from '../plazo-de-vida'
import { TIPO_PLAN } from '../oficina/tablero/plan'

/** los pedidos de cambios son de la misma tabla: el título dice de qué documento */
const delDocumento = (k: { documento?: unknown }, titulo: string): string => (k.documento === 'manual' ? titulo.replace('al plan', 'al manual') : titulo)

const RECIENTE_MS = 7 * 24 * 60 * 60 * 1000
/** la primera fila de cada cliente, en una lista que viene de más nueva a más vieja */
const primeraDeCadaCliente = (filas: Fila[]): Fila[] => { const vistos = new Set<string>(); return filas.filter((f) => { const c = String(f.client_id); if (vistos.has(c)) return false; vistos.add(c); return true }) }

export type Gravedad = 1 | 2 | 3
export type Categoria = 'incidente' | 'falla' | 'tope' | 'saldo' | 'pausa' | 'credencial' | 'servicio'
export interface Riesgo { id: string; gravedad: Gravedad; categoria: Categoria; titulo: string; detalle: string | null; client_id: string | null; cliente: string | null; desde: string | null; fuente: string }

const DIA = 86_400_000
const HORA = 3_600_000
const TOPE = 200
/** un despacho en `running` más viejo que esto no está trabajando: nadie vuelve después de ese plazo */
/** 11-nov · #21 · el PISO de «atascado»: lo decide la regla única (`plazo-de-vida.ts`); `updated_at` ahora es el último latido */
export const ATASCADO_MS = HORA
export const TOPE_AVISO_PCT = 80
export const SALDO_AVISO_PCT = 75
/** el vigilante de costos corre cada hora: sin correr 3 horas, está ciego */
export const VIGILANTE_CIEGO_MS = 3 * HORA
export const REESCRITURA_ATASCADA_MS = HORA

export const SIN_FUENTE_RIESGOS = [
  { que: 'credenciales por vencer', motivo: 'ninguna tabla guarda fechas de caducidad; solo se detecta la que un servicio ya rechaza (n8n, Apify)' },
  { que: 'credencial de Google de n8n', motivo: 'vive dentro de n8n y su API no expone su estado; se ve solo cuando un flujo falla' },
  { que: 'saldo de Anthropic y demás proveedores', motivo: 'solo Apify tiene una lectura de saldo en la plataforma' },
  { que: 'fallas del corredor de agentes', motivo: 'una invocación fallida suele no dejar fila: esos errores van a Sentry y Braintrust; aquí se ven por sus despachos' },
]

const UUID_EN_TEXTO = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const gravedadDelTitulo = (t: string): Gravedad => (t.includes('🔴') ? 3 : t.includes('🟡') ? 1 : 2)
const gravedadDeSeveridad = (s: unknown): Gravedad => (/alta|high|critic|p0/i.test(String(s)) ? 3 : /info|baja|low|p[3-9]/i.test(String(s)) ? 1 : 2)
const COSTO_PCT = (usado: number, techo: number): number => (techo > 0 ? Math.round((usado / techo) * 1000) / 10 : 0)

export interface Saldo { proveedor: string; plan: string; usado_usd: number; credito_usd: number; pct: number; ciclo_hasta: string | null }
export interface Tope { client_id: string; cliente: string; gastado_24h_usd: number; techo_usd: number; pct: number }

/** la hora de la última ejecución sana de cada proceso (solo lectura); sin respuesta, vacío: la falla se sigue mostrando */
async function ultimasEjecucionesSanas(base: string, llave: string, f: typeof fetch): Promise<Map<string, string>> {
  const sanas = new Map<string, string>()
  try {
    const r = await f(`${base.replace(/\/+$/, '')}/api/v1/executions?status=success&limit=100`, { headers: { 'X-N8N-API-KEY': llave, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) })
    if (!r.ok) return sanas
    const j = await r.json() as { data?: Fila[] }
    for (const e of Array.isArray(j.data) ? j.data : []) {
      const id = String(e.workflowId), t = String(e.startedAt)
      if (t > (sanas.get(id) ?? '')) sanas.set(id, t)
    }
  } catch { /* sin lectura: no se cierra nada */ }
  return sanas
}

/** un proceso que alguien apagó a propósito no es una falla abierta; si no se puede saber, se sigue mostrando */
async function procesoApagado(base: string, llave: string, flujo: string, f: typeof fetch): Promise<boolean> {
  try {
    const r = await f(`${base.replace(/\/+$/, '')}/api/v1/workflows/${encodeURIComponent(flujo)}`, { headers: { 'X-N8N-API-KEY': llave, Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) })
    if (!r.ok) return false
    const j = await r.json() as { active?: unknown }
    return j.active === false
  } catch { return false }
}

async function leerFallasDeN8n(fuentes: Fuente[], riesgos: Omit<Riesgo, 'cliente'>[], c: Contexto): Promise<void> {
  const env = c.env ?? process.env
  const base = texto(env.N8N_BASE_URL), llave = texto(env.N8N_API_KEY)
  if (!base || !llave) { fuentes.push({ fuente: 'n8n', estado: 'sin_credencial', filas: 0, detalle: 'este entorno no tiene la dirección o la llave de n8n' }); return }
  const f = c.fetchImpl ?? fetch
  try {
    const r = await f(`${base.replace(/\/+$/, '')}/api/v1/executions?status=error&limit=100`, { headers: { 'X-N8N-API-KEY': llave, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) })
    if (r.status === 401 || r.status === 403) {
      fuentes.push({ fuente: 'n8n', estado: 'error', filas: 0, detalle: `n8n rechazó la llave (HTTP ${r.status})` })
      riesgos.push({ id: 'credencial:n8n', gravedad: 3, categoria: 'credencial', titulo: 'n8n rechaza nuestra llave: caducada o inválida', detalle: `HTTP ${r.status}. Sin ella no se ven las fallas de los procesos.`, client_id: null, desde: c.ahora().toISOString(), fuente: 'n8n' })
      return
    }
    if (!r.ok) { fuentes.push({ fuente: 'n8n', estado: 'error', filas: 0, detalle: `n8n respondió HTTP ${r.status}` }); return }
    const j = await r.json() as { data?: Fila[] }
    const desde = c.ahora().getTime() - DIA
    const recientes = (Array.isArray(j.data) ? j.data : []).filter((e) => Date.parse(String(e.startedAt)) >= desde)
    fuentes.push({ fuente: 'n8n', estado: 'ok', filas: recientes.length, detalle: 'n8n conserva pocas horas de ejecuciones: esto no es el historial completo de 24 h' })
    const porFlujo = new Map<string, Fila[]>()
    const sanasPorFlujo = await ultimasEjecucionesSanas(base, llave, f)
    for (const e of recientes) porFlujo.set(String(e.workflowId), [...(porFlujo.get(String(e.workflowId)) ?? []), e])
    for (const [flujo, ex] of porFlujo) {
      const ultima = ex.map((e) => String(e.startedAt)).sort().pop() ?? null
      // un riesgo se cierra cuando su fuente dice que ya está bien: el proceso se apagó a propósito, o corrió sano después de la última falla
      if (await procesoApagado(base, llave, flujo, f)) continue
      if (ultima && (sanasPorFlujo.get(flujo) ?? '') > ultima) continue
      riesgos.push({ id: `n8n:${flujo}`, gravedad: 2, categoria: 'falla', titulo: `Proceso operativo con ${ex.length} ${ex.length === 1 ? 'ejecución fallida' : 'ejecuciones fallidas'}`, detalle: `flujo ${flujo}`, client_id: null, desde: ultima, fuente: 'n8n' })
    }
  } catch (e) {
    fuentes.push({ fuente: 'n8n', estado: 'error', filas: 0, detalle: sinSecretos(e instanceof Error ? e.message : String(e)) ?? 'error' })
  }
}

async function leerSaldoDeApify(fuentes: Fuente[], riesgos: Omit<Riesgo, 'cliente'>[], saldos: Saldo[], c: Contexto): Promise<void> {
  const env = c.env ?? process.env
  const token = texto(env.APIFY_API_TOKEN) ?? texto(env.APIFY_TOKEN)
  if (!token) { fuentes.push({ fuente: 'apify', estado: 'sin_credencial', filas: 0, detalle: 'este entorno no tiene la llave de Apify' }); return }
  const r = await leerUsoDelPlan({ token, ...(c.fetchImpl ? { fetchImpl: c.fetchImpl } : {}) })
  if (!r.ok) {
    fuentes.push({ fuente: 'apify', estado: 'error', filas: 0, detalle: sinSecretos(r.detalle) ?? 'error' })
    if (/\b(401|403)\b/.test(String(r.detalle))) riesgos.push({ id: 'credencial:apify', gravedad: 3, categoria: 'credencial', titulo: 'Apify rechaza nuestra llave: caducada o inválida', detalle: sinSecretos(r.detalle), client_id: null, desde: c.ahora().toISOString(), fuente: 'apify' })
    return
  }
  fuentes.push({ fuente: 'apify', estado: 'ok', filas: 1 })
  const u = r.uso
  const d = decidirPlanApify(u, pctMaximoDelPlan(env))
  saldos.push({ proveedor: 'Apify', plan: u.plan, usado_usd: u.usado_usd, credito_usd: u.credito_usd, pct: d.pct_usado, ciclo_hasta: u.ciclo_hasta })
  if (!d.permitido || d.pct_usado >= SALDO_AVISO_PCT) riesgos.push({ id: 'saldo:apify', gravedad: d.permitido ? 2 : 3, categoria: 'saldo', titulo: `Apify lleva ${d.pct_usado} % del crédito del mes`, detalle: `US$ ${u.usado_usd} de US$ ${u.credito_usd}. El raspado se frena al ${d.pct_max} %.`, client_id: null, desde: u.ciclo_desde, fuente: 'apify' })
}

/** el mismo criterio del freno de gasto: techo de la ficha o general/arranque, gastado por la familia del cliente en 24 h */
async function leerTopes(fuentes: Fuente[], riesgos: Omit<Riesgo, 'cliente'>[], topes: Tope[], c: Contexto, vivos: { id: string; nombre: string }[]): Promise<void> {
  const db = c.db
  const ahora = c.ahora()
  const desde = new Date(ahora.getTime() - DIA).toISOString()
  let fallas = 0, primera: string | null = null
  for (const cli of vivos) {
    try {
      const { family } = await resolveClientFamily(db as unknown as SupabaseClient, cli.id, (async () => ({})) as never)
      const base = db.from('agent_invocations').select('cost_usd').gte('started_at', desde)
      const r = await (family.length > 1 ? base.in('client_id', family) : base.eq('client_id', cli.id))
      if (r.error) throw new Error(r.error.message)
      const gastado = (Array.isArray(r.data) ? (r.data as Fila[]) : []).reduce((s, f) => s + numero(f.cost_usd), 0)
      const ficha = await resolveClientCapContext(db as unknown as SupabaseClient, cli.id)
      const techo = techoDelCliente(techoGenericoDeArranque({ status: ficha.status, createdAt: ficha.createdAt, nowMs: ahora.getTime(), generico: resolveRunSpendCapUsd() }).cap, ficha.override)
      const pct = COSTO_PCT(gastado, techo)
      topes.push({ client_id: cli.id, cliente: cli.nombre, gastado_24h_usd: redondear(gastado), techo_usd: techo, pct })
      if (pct >= TOPE_AVISO_PCT) riesgos.push({ id: `tope:${cli.id}`, gravedad: pct >= 100 ? 3 : 2, categoria: 'tope', titulo: `Gasto de 24 h al ${pct} % del techo`, detalle: `US$ ${redondear(gastado)} de US$ ${techo}. Al llegar, el freno detiene los agentes de este cliente.`, client_id: cli.id, desde: null, fuente: 'agent_invocations' })
    } catch (e) { fallas++; primera ??= sinSecretos(e instanceof Error ? e.message : String(e)) }
  }
  fuentes.push(fallas ? { fuente: 'topes_por_cliente', estado: 'error', filas: topes.length, detalle: `${fallas} cliente(s) sin leer: ${primera}` } : { fuente: 'topes_por_cliente', estado: 'ok', filas: topes.length })
}

export async function leerRiesgos(c: Contexto) {
  const { db, ahora } = c
  const fuentes: Fuente[] = []
  const clientes = await leerClientes(db, fuentes)
  const now = ahora()
  const hace7d = new Date(now.getTime() - 7 * DIA).toISOString()
  const riesgos: Omit<Riesgo, 'cliente'>[] = []
  const saldos: Saldo[] = []
  const topes: Tope[] = []
  const [alertas, reconciliaciones, despachos, invocaciones, errores, caidas, monitor, pausas, campanas, cfgOficina, cfgFinanzas, cfgJefatura, cfgCadena, cambios, compuertas, ultimosPedidos, ultimosPlanes] = await Promise.all([
    leer(fuentes, 'cerebro_alertas', db.from('cerebro_alertas').select('clave, titulo, ultimo_detalle, abierto_en, ultima_en').is('cerrado_en', null).limit(TOPE), TOPE),
    leer(fuentes, 'agent_dispatch_reconciliations', db.from('agent_dispatch_reconciliations').select('dispatch_key, agente, cliente, clasificacion, severidad, que, primera_vez').is('resuelta_el', null).limit(TOPE), TOPE),
    leer(fuentes, 'agent_dispatches', db.from('agent_dispatches').select('dispatch_key, agent_name, client_id, status, created_at, running_at, updated_at').in('status', ['error', 'running']).limit(TOPE), TOPE),
    leer(fuentes, 'agent_invocations', db.from('agent_invocations').select('id, agent_name, client_id, status, error_message, started_at').neq('status', 'completed').gte('started_at', hace7d).limit(TOPE), TOPE),
    leer(fuentes, 'error_events', db.from('error_events').select('id, severity, title, source, created_at').gte('created_at', hace7d).limit(TOPE), TOPE),
    leer(fuentes, 'uptime_incidents', db.from('uptime_incidents').select('id, monitor_name, monitor_url, alert_details, created_at').gte('created_at', hace7d).limit(TOPE), TOPE),
    leer(fuentes, 'cost_monitor_runs', db.from('cost_monitor_runs').select('ran_at, aggregate_24h_usd, threshold_daily_aggregate_usd, is_breach, breach_count, error_message').order('ran_at', { ascending: false }).limit(1)),
    leer(fuentes, 'cerebro_portero_pausas', db.from('cerebro_portero_pausas').select('id, client_id, motivo, desde').is('levantada_en', null).limit(TOPE), TOPE),
    leer(fuentes, 'cadena_campanas', consultasDeDireccion(db).campanasDetenidas(TOPE), TOPE),
    leer(fuentes, 'interruptor_de_la_oficina', consultaEstadoDeLaOficina(db)),
    leer(fuentes, 'finanzas_config', db.from('finanzas_config').select('estado').eq('id', 1).limit(1)),
    leer(fuentes, 'jefatura_config', db.from('jefatura_config').select('estado').eq('id', 1).limit(1)),
    leer(fuentes, 'cadena_config', consultasDeDireccion(db).estadoDeLaCadena()),
    leer(fuentes, 'plan_cambios', db.from('plan_cambios').select('id, client_id, plan_id, documento, estado, despertado, despertar_detalle, actualizado_en').in('estado', ['pendiente', 'en_reescritura']).limit(TOPE), TOPE),
    leer(fuentes, 'plan_aprobaciones', db.from('plan_aprobaciones').select('id, client_id, plan_id, despertar_detalle, actualizado_en').eq('estado', 'aprobado').eq('despertado', false).limit(TOPE), TOPE),
    leer(fuentes, 'plan_cambios_ultimos', db.from('plan_cambios').select('id, client_id, documento, estado, despertar_detalle, actualizado_en').gte('actualizado_en', new Date(now.getTime() - RECIENTE_MS).toISOString()).order('actualizado_en', { ascending: false }).limit(TOPE), TOPE),
    leer(fuentes, 'planes_ultimos', db.from('client_historical_outputs').select('id, client_id, provenance_tag, created_at').eq('output_type', TIPO_PLAN).gte('created_at', new Date(now.getTime() - RECIENTE_MS).toISOString()).order('created_at', { ascending: false }).limit(TOPE), TOPE),
  ])
  for (const a of alertas) {
    const titulo = String(a.titulo ?? a.clave)
    riesgos.push({ id: `alerta:${String(a.clave)}:${String(a.abierto_en)}`, gravedad: gravedadDelTitulo(titulo), categoria: 'incidente', titulo: sinSecretos(titulo, 300) ?? 'Alerta abierta', detalle: sinSecretos(a.ultimo_detalle), client_id: String(a.clave).match(UUID_EN_TEXTO)?.[0] ?? null, desde: texto(a.ultima_en) ?? texto(a.abierto_en), fuente: 'cerebro_alertas' })
  }
  const yaContados = new Set(reconciliaciones.map((r) => String(r.dispatch_key)))
  for (const r of reconciliaciones) riesgos.push({ id: `reconciliacion:${String(r.dispatch_key)}`, gravedad: gravedadDeSeveridad(r.severidad), categoria: 'falla', titulo: sinSecretos(r.que, 300) ?? 'Un trabajo de un empleado tuvo un problema', detalle: `Empleado: ${String(r.agente ?? 'sin dato')} (${String(r.clasificacion)})`, client_id: texto(r.cliente), desde: texto(r.primera_vez), fuente: 'agent_dispatch_reconciliations' })
  for (const d of despachos) {
    if (yaContados.has(String(d.dispatch_key))) continue
    const cuando = Date.parse(String(d.created_at))
    const esError = d.status === 'error'
    if (esError ? cuando < now.getTime() - 7 * DIA : vidaDelPaso({ inicio: texto(d.created_at), pisoMs: ATASCADO_MS, duraciones: null, despacho: { ok: true, valor: d as unknown as DespachoLeido } }, now).estado !== 'muerto') continue
    riesgos.push({ id: `despacho:${String(d.dispatch_key)}`, gravedad: 2, categoria: 'falla', titulo: esError ? `Trabajo de ${String(d.agent_name)} terminó en error` : `Trabajo de ${String(d.agent_name)} atascado: sigue «en curso» sin volver`, detalle: String(d.dispatch_key), client_id: texto(d.client_id), desde: texto(d.created_at), fuente: 'agent_dispatches' })
  }
  for (const i of invocaciones) riesgos.push({ id: `invocacion:${String(i.id)}`, gravedad: 2, categoria: 'falla', titulo: `Invocación de ${String(i.agent_name)}: ${String(i.status)}`, detalle: sinSecretos(i.error_message), client_id: texto(i.client_id), desde: texto(i.started_at), fuente: 'agent_invocations' })
  for (const e of errores) riesgos.push({ id: `error:${String(e.id)}`, gravedad: gravedadDeSeveridad(e.severity), categoria: 'falla', titulo: sinSecretos(e.title, 300) ?? 'Error registrado', detalle: `origen ${String(e.source ?? 'sin dato')}`, client_id: null, desde: texto(e.created_at), fuente: 'error_events' })
  for (const u of caidas) riesgos.push({ id: `caida:${String(u.id)}`, gravedad: 2, categoria: 'servicio', titulo: `Caída registrada: ${sinSecretos(u.monitor_name ?? u.monitor_url, 200) ?? 'servicio'}`, detalle: 'El monitor no registra la recuperación: no se sabe si sigue caído.', client_id: null, desde: texto(u.created_at), fuente: 'uptime_incidents' })
  const m = monitor[0]
  if (m) {
    const techo = numero(m.threshold_daily_aggregate_usd), gasto = numero(m.aggregate_24h_usd), pct = COSTO_PCT(gasto, techo)
    if (m.is_breach === true || pct >= TOPE_AVISO_PCT) riesgos.push({ id: 'tope:agregado', gravedad: m.is_breach === true || pct >= 100 ? 3 : 2, categoria: 'tope', titulo: `Gasto total de 24 h al ${pct} % del umbral`, detalle: `US$ ${gasto} de US$ ${techo}.`, client_id: null, desde: texto(m.ran_at), fuente: 'cost_monitor_runs' })
    if (texto(m.error_message)) riesgos.push({ id: 'vigilante:error', gravedad: 2, categoria: 'servicio', titulo: 'El vigilante de costos corrió con error', detalle: sinSecretos(m.error_message), client_id: null, desde: texto(m.ran_at), fuente: 'cost_monitor_runs' })
    if (Date.parse(String(m.ran_at)) < now.getTime() - VIGILANTE_CIEGO_MS) riesgos.push({ id: 'vigilante:ciego', gravedad: 2, categoria: 'servicio', titulo: 'El vigilante de costos lleva horas sin correr', detalle: null, client_id: null, desde: texto(m.ran_at), fuente: 'cost_monitor_runs' })
  }
  for (const p of pausas) riesgos.push({ id: `pausa:${String(p.id)}`, gravedad: 2, categoria: 'pausa', titulo: 'El portero del cerebro está en pausa para este cliente', detalle: sinSecretos(p.motivo), client_id: texto(p.client_id), desde: texto(p.desde), fuente: 'cerebro_portero_pausas' })
  for (const k of campanas) {
    if (k.seco === true) continue
    riesgos.push({ id: `campana:${String(k.id)}`, gravedad: k.estado === 'necesita_humano' ? 2 : 1, categoria: 'pausa', titulo: k.estado === 'necesita_humano' ? 'Campaña detenida: necesita a una persona' : 'Campaña en pausa', detalle: sinSecretos(k.estado_motivo), client_id: texto(k.client_id), desde: texto(k.actualizada_en), fuente: 'cadena_campanas' })
  }
  for (const [nombre, filas] of [['creativa', cfgOficina], ['financiera', cfgFinanzas], ['jefatura', cfgJefatura]] as const) {
    const estado = filas[0]?.estado
    if (filas[0] && estado !== 'encendida') riesgos.push({ id: `interruptor:${nombre}`, gravedad: 2, categoria: 'pausa', titulo: `La oficina ${nombre} está ${String(estado)}`, detalle: null, client_id: null, desde: null, fuente: 'interruptores' })
  }
  if (cfgCadena[0] && cfgCadena[0].valor !== 'encendida') riesgos.push({ id: 'interruptor:planeacion', gravedad: 2, categoria: 'pausa', titulo: `La planeación está ${String(cfgCadena[0].valor)}`, detalle: null, client_id: null, desde: null, fuente: 'interruptores' })
  for (const k of cambios) {
    const noDesperto = k.despertado === false
    if (!noDesperto && Date.parse(String(k.actualizado_en)) > now.getTime() - REESCRITURA_ATASCADA_MS) continue
    riesgos.push({ id: `cambios:${String(k.id)}`, gravedad: 2, categoria: 'falla', titulo: delDocumento(k, noDesperto ? 'Pedido de cambios al plan: no se pudo despertar la reescritura' : 'Pedido de cambios al plan atascado: no ha vuelto la versión nueva'), detalle: sinSecretos(k.despertar_detalle), client_id: texto(k.client_id), desde: texto(k.actualizado_en), fuente: 'plan_cambios' })
  }
  // 01-nov · adenda 5: el dueño pidió cambios y no salió versión nueva. Solo cuenta el último pedido de cada cliente: si después salió bien, ya no es un riesgo.
  for (const k of [...primeraDeCadaCliente(ultimosPedidos.filter((x) => x.documento !== 'manual')), ...primeraDeCadaCliente(ultimosPedidos.filter((x) => x.documento === 'manual'))]) {
    if (k.estado !== 'fallido') continue
    const sinCambios = /^sin cambios reales/i.test(String(k.despertar_detalle ?? ''))
    riesgos.push({ id: `cambios-sin-version:${String(k.id)}`, gravedad: 2, categoria: 'falla', titulo: delDocumento(k, sinCambios ? 'Pediste cambios al plan y el redactor devolvió el mismo texto: no se guardó ninguna versión nueva' : 'Pediste cambios al plan y no salió la versión nueva'), detalle: sinSecretos(k.despertar_detalle), client_id: texto(k.client_id), desde: texto(k.actualizado_en), fuente: 'plan_cambios' })
  }
  // lo más nuevo de cada cliente: si no se pudo comparar con el anterior, puede ser una copia y se dice
  for (const k of primeraDeCadaCliente(ultimosPlanes)) {
    if (esObjeto(k.provenance_tag) && k.provenance_tag.comparacion_fallo === true) riesgos.push({ id: `plan-sin-comparar:${String(k.id)}`, gravedad: 2, categoria: 'falla', titulo: 'No se pudo comprobar que la versión nueva del plan sea distinta de la anterior', detalle: null, client_id: texto(k.client_id), desde: texto(k.created_at), fuente: 'client_historical_outputs' })
  }
  for (const k of compuertas) riesgos.push({ id: `compuerta:${String(k.id)}`, gravedad: 3, categoria: 'falla', titulo: 'Plan aprobado cuya siguiente fase no arrancó', detalle: sinSecretos(k.despertar_detalle), client_id: texto(k.client_id), desde: texto(k.actualizado_en), fuente: 'plan_aprobaciones' })

  const vivos = [...clientes.values()].filter((x) => !x.practica && !x.de_baja)
  await Promise.all([leerFallasDeN8n(fuentes, riesgos, c), leerSaldoDeApify(fuentes, riesgos, saldos, c), leerTopes(fuentes, riesgos, topes, c, vivos)])

  const omitidos = { clientes_de_practica: 0, clientes_de_baja: 0 }
  const salida: Riesgo[] = []
  for (const r of riesgos) {
    const cli = r.client_id ? clientes.get(r.client_id) : undefined
    if (cli?.practica) { omitidos.clientes_de_practica++; continue }
    if (cli?.de_baja) { omitidos.clientes_de_baja++; continue }
    salida.push({ ...r, cliente: cli?.nombre ?? null })
  }
  salida.sort((a, b) => b.gravedad - a.gravedad || String(b.desde ?? '').localeCompare(String(a.desde ?? '')))
  return { ok: true, generado_en: now.toISOString(), completo: estaCompleto(fuentes), total: salida.length, por_gravedad: { 3: salida.filter((r) => r.gravedad === 3).length, 2: salida.filter((r) => r.gravedad === 2).length, 1: salida.filter((r) => r.gravedad === 1).length }, riesgos: salida, saldos, topes, omitidos, fuentes, sin_fuente: SIN_FUENTE_RIESGOS }
}

