/**
 * GET /api/direccion/corridas/resumen · la lectura agregada que pidió Observabilidad (CC5 · 02-nov): cifras enteras del período, sin el tope de 200 corridas ni el de 1000 filas.
 * Usa la misma definición de corrida y de estado que la lista. Un renglón por (flujo, cliente). Los días son de Ecuador (UTC−5). No lee prompts, entradas ni salidas.
 */
import { COLUMNAS, ejecucionBase, resumen } from './corridas'
import { estaCompleto, sinSecretos, texto, type Contexto, type Fila, type Fuente } from './comun'

const DIA = /^\d{4}-\d{2}-\d{2}$/
const CLIENTE = /^[A-Za-z0-9_.-]{1,120}$/
export const MAX_DIAS_DEL_RESUMEN = 92
const TAMANO_DE_PAGINA = 1000
const TOPE_DE_PAGINAS = 200
/** una corrida que empezó dentro del período puede tener filas fuera: se leen de más y se cuenta por el día en que empezó */
const MARGEN_MS = 86_400_000
const ECUADOR_MS = 5 * 3_600_000
const diaEcuador = (iso: string): string => new Date(Date.parse(iso) - ECUADOR_MS).toISOString().slice(0, 10)
const inicioDelDia = (dia: string): number => Date.parse(`${dia}T00:00:00Z`) + ECUADOR_MS
const fechaValida = (d: unknown): d is string => {
  if (typeof d !== 'string' || !DIA.test(d)) return false
  const t = Date.parse(`${d}T00:00:00Z`)
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d
}

/** PostgREST no devuelve más de 1000 filas por consulta: se recorre entera, sin perder ni repetir filas. Si no se pudo terminar, se declara */
async function leerTodo(fuentes: Fuente[], fuente: string, armar: () => { order(c: string, o: { ascending: boolean }): { order(c: string, o: { ascending: boolean }): { range(a: number, b: number): PromiseLike<{ data: unknown; error: { message?: string } | null }> } } }, clave: string, columnaDeOrden: string): Promise<Fila[]> {
  const vistas = new Map<string, Fila>()
  for (let p = 0; p < TOPE_DE_PAGINAS; p++) {
    let r: { data: unknown; error: { message?: string } | null }
    try { r = await armar().order(columnaDeOrden, { ascending: true }).order(clave, { ascending: true }).range(p * TAMANO_DE_PAGINA, (p + 1) * TAMANO_DE_PAGINA - 1) } catch (e) { r = { data: null, error: { message: e instanceof Error ? e.message : String(e) } } }
    if (r.error) { fuentes.push({ fuente, estado: 'error', filas: vistas.size, detalle: sinSecretos(r.error.message) ?? 'error sin detalle' }); return [...vistas.values()] }
    const filas = (Array.isArray(r.data) ? r.data : []) as Fila[]
    for (const f of filas) vistas.set(String(f[clave]), f)
    if (filas.length < TAMANO_DE_PAGINA) { fuentes.push({ fuente, estado: 'ok', filas: vistas.size }); return [...vistas.values()] }
  }
  fuentes.push({ fuente, estado: 'ok', filas: vistas.size, truncado: true })
  return [...vistas.values()]
}

const mediana = (v: number[]): number | null => {
  if (!v.length) return null
  const s = [...v].sort((a, b) => a - b), m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

export interface OpcionesDelResumen { desde?: unknown; hasta?: unknown; client_id?: unknown }
export type RespuestaDelResumen = { status: number; cuerpo: Record<string, unknown> }

export async function leerResumenDeCorridas({ db, ahora }: Contexto, o: OpcionesDelResumen): Promise<RespuestaDelResumen> {
  const mal = (detalle: string): RespuestaDelResumen => ({ status: 400, cuerpo: { ok: false, error: 'entrada_invalida', detalle } })
  if (!fechaValida(o.desde) || !fechaValida(o.hasta)) return mal('`desde` y `hasta` deben ser fechas AAAA-MM-DD')
  if (o.desde > o.hasta) return mal('`desde` no puede ser posterior a `hasta`')
  const a = inicioDelDia(o.desde), b = inicioDelDia(o.hasta) + 86_400_000
  if ((b - a) / 86_400_000 > MAX_DIAS_DEL_RESUMEN) return mal(`el período admite hasta ${MAX_DIAS_DEL_RESUMEN} días`)
  const client_id = o.client_id === undefined || o.client_id === null || o.client_id === '' ? null : o.client_id
  if (client_id !== null && (typeof client_id !== 'string' || !CLIENTE.test(client_id))) return mal('`client_id` no es válido')

  const fuentes: Fuente[] = []
  const now = ahora().getTime()
  const desdeIso = new Date(a - MARGEN_MS).toISOString(), hastaIso = new Date(b + MARGEN_MS).toISOString()
  const conCliente = <Q extends { eq(c: string, v: unknown): Q }>(q: Q): Q => (client_id ? q.eq('client_id', client_id) : q)
  const [inv, des] = await Promise.all([
    leerTodo(fuentes, 'agent_invocations', () => conCliente(db.from('agent_invocations').select(COLUMNAS).gte('started_at', desdeIso).lt('started_at', hastaIso)), 'id', 'started_at'),
    leerTodo(fuentes, 'agent_dispatches', () => conCliente(db.from('agent_dispatches').select('dispatch_key, workflow_id, workflow_execution_id, agent_name, client_id, status, created_at, completed_at').gte('created_at', desdeIso).lt('created_at', hastaIso)), 'dispatch_key', 'created_at'),
  ])

  const grupos = new Map<string, { inv: Fila[]; des: Fila[] }>()
  const grupo = (id: string) => { const g = grupos.get(id) ?? { inv: [], des: [] }; grupos.set(id, g); return g }
  let filas_sin_ejecucion = 0
  // la lista lee de lo más nuevo a lo más viejo: una corrida de varios clientes va al mismo renglón si aquí se recorre igual
  inv.reverse(); des.reverse()
  for (const i of inv) { const id = texto(i.workflow_execution_id); if (!id) { filas_sin_ejecucion++; continue } grupo(ejecucionBase(id)).inv.push(i) }
  for (const d of des) { const id = texto(d.workflow_execution_id); if (!id) { filas_sin_ejecucion++; continue } grupo(ejecucionBase(id)).des.push(d) }

  interface Renglon { workflow_id: string | null; client_id: string | null; ejecuciones: number; con_error: number; en_curso: number; atascadas: number; sin_cierre: number; costo_usd: number; duraciones: number[]; dias: Map<string, { ejecuciones: number; con_error: number }> }
  const renglones = new Map<string, Renglon>()
  for (const [base, g] of grupos) {
    const c = resumen(base, g.inv, g.des, now, () => null)
    if (!c.inicio) continue
    const t = Date.parse(c.inicio)
    if (t < a || t >= b) continue
    const clave = JSON.stringify([c.workflow_id, c.client_id])
    const r: Renglon = renglones.get(clave) ?? { workflow_id: c.workflow_id, client_id: c.client_id, ejecuciones: 0, con_error: 0, en_curso: 0, atascadas: 0, sin_cierre: 0, costo_usd: 0, duraciones: [], dias: new Map() }
    renglones.set(clave, r)
    r.ejecuciones++
    r.costo_usd += c.costo_usd
    if (c.estado === 'fallida') r.con_error++
    else if (c.estado === 'en_curso') r.en_curso++
    else if (c.estado === 'atascada') r.atascadas++
    else if (c.estado === 'sin_cierre') r.sin_cierre++
    if (c.duracion_ms !== null) r.duraciones.push(c.duracion_ms)
    const d = diaEcuador(c.inicio)
    const dia = r.dias.get(d) ?? { ejecuciones: 0, con_error: 0 }
    r.dias.set(d, dia)
    dia.ejecuciones++
    if (c.estado === 'fallida') dia.con_error++
  }
  const lista = [...renglones.values()].map((r) => ({
    workflow_id: r.workflow_id, client_id: r.client_id, ejecuciones: r.ejecuciones, con_error: r.con_error, en_curso: r.en_curso, atascadas: r.atascadas, sin_cierre: r.sin_cierre,
    mediana_ms: mediana(r.duraciones), max_ms: r.duraciones.length ? Math.max(...r.duraciones) : null, costo_usd: Math.round(r.costo_usd * 1e6) / 1e6,
    por_dia: [...r.dias.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([d, v]) => ({ d, ...v })),
  })).sort((x, y) => y.ejecuciones - x.ejecuciones || String(x.workflow_id).localeCompare(String(y.workflow_id)))
  return { status: 200, cuerpo: { ok: true, generado_en: new Date(now).toISOString(), desde: o.desde, hasta: o.hasta, completo: estaCompleto(fuentes), grupos: lista, filas_sin_ejecucion, fuentes } }
}
