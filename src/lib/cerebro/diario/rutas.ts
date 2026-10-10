/**
 * LAS RUTAS DEL DIARIO (`/api/brain/diario/{plan,correr}`) · la lógica vive aquí para probarla con una base falsa; los archivos de ruta son finos.
 * Guardas (todas ANTES de leer o escribir): llave interna → 401; `dry_run` OBLIGATORIO y booleano → 400; con `dry_run: false`, `workflow_id` y `workflow_execution_id` → 403 (guardarraíl 6 del canon).
 * `plan` solo LEE. `correr` escribe SOLO sin `dry_run`. Ninguna llama a un modelo (US$ 0).
 */
import { correrDiario, type Db, type ResultadoDeCorrida } from './correr'
import { codigosDePublicaciones } from './observar'
import { planDeAmpliacion, type PlanDeAmpliacion, type FuenteDeAmpliacion } from './plan'
import { TOPE_DIARIO_POR_CLIENTE_USD } from './topes'

export interface Respuesta { status: number; body: Record<string, unknown> }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const err = (status: number, error: string, detalle: string): Respuesta => ({ status, body: { error, detalle } })
const lista = (x: unknown): Array<Record<string, unknown>> => (Array.isArray(x) ? (x as Array<Record<string, unknown>>) : [])

export function validar(cuerpo: unknown, o: { clienteObligatorio: boolean }): Respuesta | { cuerpo: Record<string, unknown>; client_id: string | null; dry_run: boolean; workflow_id: string; workflow_execution_id: string } {
  if (!esObjeto(cuerpo)) return err(400, 'entrada_invalida', 'el cuerpo debe ser un objeto')
  if (typeof cuerpo.dry_run !== 'boolean') return err(400, 'dry_run_obligatorio', '`dry_run` es obligatorio y debe ser true o false')
  const cid = cuerpo.client_id
  if (cid !== undefined && (typeof cid !== 'string' || !UUID.test(cid))) return err(400, 'entrada_invalida', '`client_id` debe ser un uuid')
  if (o.clienteObligatorio && cid === undefined) return err(400, 'entrada_invalida', 'falta `client_id`')
  const wf = typeof cuerpo.workflow_id === 'string' ? cuerpo.workflow_id.trim() : ''
  const ex = typeof cuerpo.workflow_execution_id === 'string' ? cuerpo.workflow_execution_id.trim() : ''
  if (!cuerpo.dry_run && (!wf || !ex)) return err(403, 'workflow_requerido', 'con dry_run=false hacen falta `workflow_id` y `workflow_execution_id`: el diario solo corre desde un flujo')
  return { cuerpo, client_id: (cid as string | undefined) ?? null, dry_run: cuerpo.dry_run, workflow_id: wf, workflow_execution_id: ex }
}
const esRespuesta = (x: unknown): x is Respuesta => esObjeto(x) && typeof (x as { status?: unknown }).status === 'number' && esObjeto((x as { body?: unknown }).body)

/** lo medido por el flujo de la mañana: corridas reales de hoy × su máximo (mismo criterio que su nodo ①; las funciones sin medida usan el máximo del sitio) */
export const MAXIMO_DE_LA_MANANA_USD: Record<string, number> = { website_content_scraper: 0.0536, instagram_scraper: 0.0023, recolectar_sedes: 0 }
const MAXIMO_POR_OMISION_USD = 0.0536
const corridasDe = (filas: Array<Record<string, unknown>>): string[] => {
  const vistas: Record<string, string> = {}
  for (const f of filas) vistas[`${f.apify_function}|${String(f.created_at).slice(0, 19)}`] = String(f.apify_function)
  return Object.values(vistas)
}

async function gastoDeHoy(db: Db, clientId: string, ahora: Date): Promise<{ ok: true; manana_usd: number; diario_usd: number; corridas_de_resenas: number } | { ok: false; detalle: string }> {
  const dia0 = new Date(ahora); dia0.setUTCHours(0, 0, 0, 0)
  const a = await db.from('apify_raw').select('apify_function, created_at').eq('client_id', clientId).eq('ensayo', false).gte('created_at', dia0.toISOString()).limit(500)
  if (a.error) return { ok: false, detalle: `apify_raw: ${a.error.message}` }
  const corridas = corridasDe(lista(a.data))
  const manana = corridas.reduce((s, f) => s + (MAXIMO_DE_LA_MANANA_USD[f] ?? MAXIMO_POR_OMISION_USD), 0)
  const c = await db.from('cerebro_diario_corridas').select('gasto_usd').eq('client_id', clientId).eq('dia', dia0.toISOString().slice(0, 10)).limit(5)
  if (c.error) return { ok: false, detalle: `cerebro_diario_corridas: ${c.error.message}` }
  return { ok: true, manana_usd: Math.round(manana * 1e6) / 1e6, diario_usd: lista(c.data).reduce((s, f) => s + (Number(f.gasto_usd) || 0), 0), corridas_de_resenas: corridas.filter((f) => f === 'own_google_maps_profile').length }
}

// ───────────────────────── /plan · qué llamadas pide la ampliación (solo lectura)
export interface ClienteDelPlan { client_id: string; nombre: string | null; plan: PlanDeAmpliacion; gastado_hoy_usd: number }
export async function rutaPlan(db: Db, cuerpo: unknown, ahora: Date = new Date()): Promise<Respuesta> {
  const v = validar(cuerpo, { clienteObligatorio: false }); if (esRespuesta(v)) return v
  const q = v.client_id ? await db.from('clients').select('id, name, status, archived_at, config').eq('id', v.client_id).limit(1) : await db.from('clients').select('id, name, status, archived_at, config').order('created_at', { ascending: true }).limit(500)
  if (q.error) return err(502, 'lectura_fallida', `clients: ${q.error.message}`)
  const clientes: ClienteDelPlan[] = []
  const excluidos: Array<{ client_id: string; motivos: string[] }> = []
  for (const c of lista(q.data)) {
    const id = String(c.id)
    const motivos: string[] = []
    if (/^prueba/i.test(id) || /^prueba/i.test(String(c.name ?? ''))) motivos.push('cliente de prueba')
    if (c.archived_at) motivos.push('archivado')
    if (['churned', 'archived', 'inactive', 'lost', 'cancelled'].includes(String(c.status))) motivos.push(`dado de baja (${String(c.status)})`)
    const mb = await db.from('client_brand_books').select('id').eq('client_id', id).limit(1)
    if (mb.error) return err(502, 'lectura_fallida', `client_brand_books: ${mb.error.message}`)
    if (!lista(mb.data).length) motivos.push('sin manual de marca')
    // «cliente activo» = ALTA REALIZADA (criterio del flujo de la mañana): manual de marca Y plan de 90 días real (no de prueba)
    const pl = await db.from('client_historical_outputs').select('id, provenance_tag').eq('client_id', id).eq('output_type', 'campaign_plan_90d').limit(5)
    if (pl.error) return err(502, 'lectura_fallida', `client_historical_outputs: ${pl.error.message}`)
    const planReal = lista(pl.data).filter((p) => !(esObjeto(p.provenance_tag) && Object.keys(p.provenance_tag).some((k) => k.startsWith('prueba'))))
    if (!planReal.length) motivos.push('sin plan de 90 días')
    if (motivos.length) { excluidos.push({ client_id: id, motivos }); continue }
    const vg = await db.from('cerebro_vigilancia').select('fuente, ref, contenido, observado_en, reconfirmado_en').eq('client_id', id).is('retirada_en', null)
    if (vg.error) return err(502, 'lectura_fallida', `cerebro_vigilancia: ${vg.error.message}`)
    const vigentes = lista(vg.data)
    const ultima: Partial<Record<FuenteDeAmpliacion, string | null>> = {}
    for (const f of ['mapas', 'comentarios', 'reparto'] as const) {
      const ts = vigentes.filter((x) => x.fuente === f).map((x) => String(x.reconfirmado_en ?? x.observado_en ?? '')).filter(Boolean).sort()
      ultima[f] = ts.length ? ts[ts.length - 1] : null
    }
    const g = await gastoDeHoy(db, id, ahora)
    if (!g.ok) return err(502, 'lectura_fallida', g.detalle)
    const gastado = g.manana_usd + g.diario_usd
    const plan = planDeAmpliacion({ cliente: { id, name: c.name as string | null, config: c.config }, ultima, publicaciones_propias: codigosDePublicaciones(vigentes.filter((x) => x.fuente === 'instagram').map((x) => ({ contenido: x.contenido }))), gastado_hoy_usd: gastado, corridas_de_resenas_hoy: g.corridas_de_resenas, ahora })
    clientes.push({ client_id: id, nombre: (c.name as string | null) ?? null, plan, gastado_hoy_usd: Math.round(gastado * 1e6) / 1e6 })
  }
  return { status: 200, body: { dry_run: v.dry_run, tope_por_cliente_usd: TOPE_DIARIO_POR_CLIENTE_USD, clientes, excluidos, modelos_llamados: 0 } }
}

// ───────────────────────── /correr · pasos 2, 3 y 5 de un cliente
export async function rutaCorrer(db: Db, cuerpo: unknown, ahora: Date = new Date()): Promise<Respuesta> {
  const v = validar(cuerpo, { clienteObligatorio: true }); if (esRespuesta(v)) return v
  const amp = typeof v.cuerpo.gasto_ampliacion_usd === 'number' && Number.isFinite(v.cuerpo.gasto_ampliacion_usd) && v.cuerpo.gasto_ampliacion_usd >= 0 ? v.cuerpo.gasto_ampliacion_usd : 0
  const g = await gastoDeHoy(db, v.client_id!, ahora)
  if (!g.ok) return err(502, 'lectura_fallida', g.detalle)
  const r: ResultadoDeCorrida = await correrDiario({ db, client_id: v.client_id!, dry_run: v.dry_run, ahora, forzar: v.cuerpo.forzar === true, limpiar_fichas: v.cuerpo.limpiar_fichas !== false, gasto_ampliacion_usd: amp, gasto_de_la_manana_usd: g.manana_usd, workflow_id: v.workflow_id || undefined, workflow_execution_id: v.workflow_execution_id || undefined })
  const status = r.estado === 'cliente_inexistente' ? 404 : r.estado === 'lectura_fallida' ? 502 : 200
  return { status, body: { ...r, modelos_llamados: 0 } }
}
