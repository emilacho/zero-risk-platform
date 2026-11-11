/**
 * GET /api/direccion/corridas (lista) y /api/direccion/corridas/{workflow_execution_id} (árbol). Agrupa por ejecución: `209744` y `209744:analisis-voz` son la MISMA corrida
 * (el sufijo es una rama). NO se agrupa por `workflow_id` solo: en los fire+forget esa columna puede traer un id de despacho. No lee prompts, entradas, salidas ni metadatos.
 */
import { estaCompleto, leer, leerClientes, numero, redondear, sinSecretos, texto, type Contexto, type Fila, type Fuente } from './comun'
import { vidaDelPaso, type DespachoLeido } from '../plazo-de-vida'

export const COLUMNAS = 'id, agent_name, agent_id, model, workflow_id, workflow_execution_id, client_id, started_at, ended_at, duration_ms, cost_usd, tokens_input, tokens_output, tokens_cache_read, tokens_cache_creation, num_turns, status, error_message'
/** PostgREST de Supabase no devuelve más de 1000 filas por consulta: llegar a esto se declara */
const TOPE_FILAS = 1000
/** 11-nov · #21 · el PISO del panel: «atascado» lo decide la regla única (`plazo-de-vida.ts`): un despacho que late no está atascado */
export const ATASCADA_MS = 3_600_000
const atascado = (d: Fila, ahora: number): boolean => vidaDelPaso({ inicio: texto(d.created_at), pisoMs: ATASCADA_MS, duraciones: null, despacho: { ok: true, valor: d as unknown as DespachoLeido } }, new Date(ahora)).estado === 'muerto'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const ID_DE_EJECUCION = /^[A-Za-z0-9_.-]{1,120}(:[A-Za-z0-9_.-]{1,120})?$|^(vercel-cron|dueno)(:[A-Za-z0-9_.-]{1,120}){1,5}$/
export const BRAINTRUST_SIN_ENLACE = { enlace: null, motivo: 'ninguna fila guarda el identificador de la traza: la plataforma todavía no puede armar el enlace a Braintrust' }

/** 01-nov: el mantenimiento y lo que dispara el dueño no tienen número de ejecución: su identificador entero es la corrida (trae la tarea y la hora). Cortarlo en el primer «:» los juntaba todos en una */
const SIN_NUMERO_DE_EJECUCION = /^(vercel-cron|dueno):/
export const ejecucionBase = (id: string): string => (SIN_NUMERO_DE_EJECUCION.test(id) ? id : id.split(':')[0])
export const ramaDe = (id: string): string | null => { if (SIN_NUMERO_DE_EJECUCION.test(id)) return null; const i = id.indexOf(':'); return i < 0 ? null : id.slice(i + 1) }
const flujoDe = (filas: Fila[]): string | null => { const v = filas.map((f) => texto(f.workflow_id)).filter((x): x is string => !!x); return v.find((x) => !UUID.test(x)) ?? v[0] ?? null }
const FALLO = /error|fail|timeout|cancel/i

const tokensDe = (f: Fila) => ({ entrada: numero(f.tokens_input), salida: numero(f.tokens_output), cache_lectura: numero(f.tokens_cache_read), cache_escritura: numero(f.tokens_cache_creation) })
const totalTokens = (t: ReturnType<typeof tokensDe>) => t.entrada + t.salida + t.cache_lectura + t.cache_escritura

export type EstadoCorrida = 'completa' | 'fallida' | 'en_curso' | 'atascada' | 'sin_cierre'
function estadoDe(invocaciones: Fila[], despachos: Fila[], ahora: number): EstadoCorrida {
  if (invocaciones.some((i) => FALLO.test(String(i.status)) || !!texto(i.error_message)) || despachos.some((d) => d.status === 'error')) return 'fallida'
  // un despacho que quedó «running» pero cuyo empleado sí terminó (la vuelta se perdió) no es trabajo en curso: su falla la cuenta la reconciliación, en riesgos
  const terminados = new Set(invocaciones.map((i) => `${String(i.workflow_execution_id)}|${String(i.agent_name)}`))
  const vivos = despachos.filter((d) => (d.status === 'running' || d.status === 'accepted') && !terminados.has(`${String(d.workflow_execution_id)}|${String(d.agent_name)}`))
  if (vivos.length) return vivos.every((d) => atascado(d, ahora)) ? 'atascada' : 'en_curso'
  // el ciclo de vida lo cerró y su empleado nunca dejó fila: no se sabe cómo terminó, y se dice
  if (despachos.some((d) => d.status === 'sin_cierre' && !terminados.has(`${String(d.workflow_execution_id)}|${String(d.agent_name)}`))) return 'sin_cierre'
  return 'completa'
}

export function resumen(base: string, inv: Fila[], des: Fila[], ahora: number, nombre: (id: string | null) => string | null) {
  const tiempos = [...inv.map((i) => texto(i.started_at)), ...des.map((d) => texto(d.created_at))].filter((x): x is string => !!x).sort()
  const fines = [...inv.map((i) => texto(i.ended_at)), ...des.map((d) => texto(d.completed_at))].filter((x): x is string => !!x).sort()
  const inicio = tiempos[0] ?? null
  const fin = fines[fines.length - 1] ?? null
  const client_id = [...inv, ...des].map((f) => texto(f.client_id)).find(Boolean) ?? null
  // una corrida puede tocar a varios clientes: `client_id` sigue siendo el primero, para quien ya lo lee
  const clientes = [...new Set([...inv, ...des].map((f) => texto(f.client_id)).filter((x): x is string => !!x))]
  const estado = estadoDe(inv, des, ahora)
  return {
    workflow_id: flujoDe([...inv, ...des]), workflow_execution_id: base, client_id, cliente: nombre(client_id), clientes, clientes_nombres: clientes.map((c) => nombre(c) ?? c),
    inicio, fin: estado === 'en_curso' || estado === 'atascada' ? null : fin,
    duracion_ms: inicio && fin && estado !== 'en_curso' && estado !== 'atascada' ? Math.max(0, Date.parse(fin) - Date.parse(inicio)) : null,
    costo_usd: redondear(inv.reduce((s, i) => s + numero(i.cost_usd), 0)),
    tokens: inv.reduce((s, i) => s + totalTokens(tokensDe(i)), 0),
    pasos: inv.length, despachos: des.length,
    fallos: inv.filter((i) => FALLO.test(String(i.status)) || !!texto(i.error_message)).length + des.filter((d) => d.status === 'error').length,
    ramas: [...new Set([...inv, ...des].map((f) => ramaDe(String(f.workflow_execution_id ?? ''))).filter((x): x is string => !!x))],
    estado,
  }
}

export interface OpcionesDeLista { dias?: number; limite?: number; client_id?: string | null; workflow_id?: string | null }
export const acotar = (v: unknown, min: number, max: number, porOmision: number): number => { const n = Number(v); return v === null || v === undefined || v === '' || !Number.isFinite(n) ? porOmision : Math.min(max, Math.max(min, Math.floor(n))) }

export async function leerCorridas({ db, ahora }: Contexto, o: OpcionesDeLista = {}) {
  const fuentes: Fuente[] = []
  const dias = acotar(o.dias, 1, 30, 7)
  const limite = acotar(o.limite, 1, 200, 50)
  const now = ahora().getTime()
  const desde = new Date(now - dias * 86_400_000).toISOString()
  const clientes = await leerClientes(db, fuentes)
  let qi = db.from('agent_invocations').select(COLUMNAS).gte('started_at', desde)
  let qd = db.from('agent_dispatches').select('dispatch_key, workflow_id, workflow_execution_id, agent_name, client_id, status, created_at, running_at, updated_at, completed_at').gte('created_at', desde)
  if (o.client_id) { qi = qi.eq('client_id', o.client_id); qd = qd.eq('client_id', o.client_id) }
  if (o.workflow_id) { qi = qi.eq('workflow_id', o.workflow_id); qd = qd.eq('workflow_id', o.workflow_id) }
  const [inv, des] = await Promise.all([
    leer(fuentes, 'agent_invocations', qi.order('started_at', { ascending: false }).limit(TOPE_FILAS), TOPE_FILAS),
    leer(fuentes, 'agent_dispatches', qd.order('created_at', { ascending: false }).limit(TOPE_FILAS), TOPE_FILAS),
  ])
  const grupos = new Map<string, { inv: Fila[]; des: Fila[] }>()
  const grupo = (id: string) => { const g = grupos.get(id) ?? { inv: [], des: [] }; grupos.set(id, g); return g }
  let sinEjecucion = 0
  for (const i of inv) { const id = texto(i.workflow_execution_id); if (!id) { sinEjecucion++; continue } grupo(ejecucionBase(id)).inv.push(i) }
  for (const d of des) { const id = texto(d.workflow_execution_id); if (!id) { sinEjecucion++; continue } grupo(ejecucionBase(id)).des.push(d) }
  const nombre = (id: string | null) => (id ? clientes.get(id)?.nombre ?? null : null)
  const todas = [...grupos.entries()].map(([base, g]) => resumen(base, g.inv, g.des, now, nombre)).sort((a, b) => String(b.inicio ?? '').localeCompare(String(a.inicio ?? '')))
  return { ok: true, generado_en: new Date(now).toISOString(), completo: estaCompleto(fuentes), dias, limite, total: todas.length, corridas: todas.slice(0, limite), filas_sin_ejecucion: sinEjecucion, fuentes, braintrust: BRAINTRUST_SIN_ENLACE }
}

export type RespuestaDeCorrida = { status: number; cuerpo: Record<string, unknown> }
export async function leerCorrida({ db, ahora }: Contexto, id: string): Promise<RespuestaDeCorrida> {
  if (!ID_DE_EJECUCION.test(id)) return { status: 400, cuerpo: { ok: false, error: 'entrada_invalida', detalle: 'el identificador de la ejecución no es válido' } }
  const base = ejecucionBase(id)
  const fuentes: Fuente[] = []
  const now = ahora().getTime()
  const clientes = await leerClientes(db, fuentes)
  const [i1, i2, d1, d2] = await Promise.all([
    leer(fuentes, 'agent_invocations', db.from('agent_invocations').select(COLUMNAS).eq('workflow_execution_id', base).limit(TOPE_FILAS), TOPE_FILAS),
    leer(fuentes, 'agent_invocations:ramas', db.from('agent_invocations').select(COLUMNAS).like('workflow_execution_id', `${base}:%`).limit(TOPE_FILAS), TOPE_FILAS),
    leer(fuentes, 'agent_dispatches', db.from('agent_dispatches').select('dispatch_key, workflow_id, workflow_execution_id, agent_name, client_id, status, created_at, running_at, updated_at, completed_at, metadata').eq('workflow_execution_id', base).limit(TOPE_FILAS), TOPE_FILAS),
    leer(fuentes, 'agent_dispatches:ramas', db.from('agent_dispatches').select('dispatch_key, workflow_id, workflow_execution_id, agent_name, client_id, status, created_at, running_at, updated_at, completed_at, metadata').like('workflow_execution_id', `${base}:%`).limit(TOPE_FILAS), TOPE_FILAS),
  ])
  // en LIKE el «_» es comodín: `a_b:%` también trae `axb:…`. Lo que no sea de esta ejecución se descarta aquí
  const deEsta = (f: Fila) => ejecucionBase(String(f.workflow_execution_id)) === base
  const inv = [...i1, ...i2].filter(deEsta), des = [...d1, ...d2].filter(deEsta)
  if (!inv.length && !des.length) {
    if (!estaCompleto(fuentes)) return { status: 502, cuerpo: { ok: false, error: 'fuentes_no_disponibles', detalle: 'no se pudo leer la corrida: esto no significa que no exista', fuentes } }
    return { status: 404, cuerpo: { ok: false, error: 'corrida_inexistente', detalle: 'no hay invocaciones ni despachos con ese identificador', fuentes } }
  }
  const paso = (i: Fila) => {
    const t = tokensDe(i)
    return { origen: 'invocacion', id: String(i.id), agente: texto(i.agent_name) ?? texto(i.agent_id), modelo: texto(i.model), inicio: texto(i.started_at), fin: texto(i.ended_at), duracion_ms: i.duration_ms === null || i.duration_ms === undefined ? null : numero(i.duration_ms), costo_usd: redondear(numero(i.cost_usd)), tokens: t, tokens_total: totalTokens(t), turnos: i.num_turns === null || i.num_turns === undefined ? null : numero(i.num_turns), estado: String(i.status ?? 'sin_dato'), error: sinSecretos(i.error_message), despacho: null as string | null }
  }
  const usados = new Set<string>()
  const ramas = new Map<string | null, ReturnType<typeof paso>[]>()
  const poner = (r: string | null, p: ReturnType<typeof paso>) => ramas.set(r, [...(ramas.get(r) ?? []), p])
  for (const i of inv) {
    const exec = String(i.workflow_execution_id)
    const p = paso(i)
    const d = des.find((x) => String(x.workflow_execution_id) === exec && x.agent_name === i.agent_name && !usados.has(String(x.dispatch_key)))
    if (d) { usados.add(String(d.dispatch_key)); p.despacho = String(d.dispatch_key) }
    poner(ramaDe(exec), p)
  }
  // un despacho sin invocación es justo lo que no deja fila cuando un agente falla o no vuelve: se muestra como paso, sin costo conocido
  for (const d of des) {
    if (usados.has(String(d.dispatch_key))) continue
    const meta = d.metadata && typeof d.metadata === 'object' ? d.metadata as Fila : {}
    const vivoViejo = d.status === 'running' && atascado(d, now)
    poner(ramaDe(String(d.workflow_execution_id)), { origen: 'despacho', id: String(d.dispatch_key), agente: texto(d.agent_name), modelo: null, inicio: texto(d.running_at) ?? texto(d.created_at), fin: texto(d.completed_at), duracion_ms: null, costo_usd: 0, tokens: tokensDe({}), tokens_total: 0, turnos: null, estado: vivoViejo ? 'atascado' : String(d.status ?? 'sin_dato'), error: sinSecretos(meta.error ?? meta.error_message ?? meta.motivo), despacho: String(d.dispatch_key) })
  }
  const orden = (a: { inicio: string | null }, b: { inicio: string | null }) => String(a.inicio ?? '').localeCompare(String(b.inicio ?? ''))
  const arbol = [...ramas.entries()].map(([rama, pasos]) => ({ rama, costo_usd: redondear(pasos.reduce((s, p) => s + p.costo_usd, 0)), pasos: [...pasos].sort(orden) })).sort((a, b) => (a.rama === null ? -1 : b.rama === null ? 1 : a.rama.localeCompare(b.rama)))
  const nombre = (c: string | null) => (c ? clientes.get(c)?.nombre ?? null : null)
  return { status: 200, cuerpo: { ok: true, generado_en: new Date(now).toISOString(), completo: estaCompleto(fuentes), corrida: resumen(base, inv, des, now, nombre), arbol, fuentes, braintrust: BRAINTRUST_SIN_ENLACE } }
}
