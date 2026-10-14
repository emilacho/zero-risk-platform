/**
 * LAS RUTAS DEL PORTERO QUE ALIMENTA (`/api/brain/portero/{descubrir,alimentar}`) · la lógica vive aquí para probarla con una base falsa y un modelo simulado.
 * Guardas (todas ANTES de leer o escribir): llave interna → 401 (en el archivo de ruta); `dry_run` OBLIGATORIO y booleano → 400; con `dry_run: false`,
 * `workflow_id` y `workflow_execution_id` → 403; interruptor `PORTERO_ALIMENTAR` apagado → 200 `{apagado:true}` sin leer ni escribir.
 * `descubrir` solo LEE (y, con su interruptor, pide al modelo hasta 3 búsquedas). `alimentar` escribe SOLO sin `dry_run`.
 */
import { alimentarCliente, contextoDelCliente, type Db, type ResultadoDeAlimentar } from './alimentar'
import { coincidePorPalabra } from '../texto/coincidencia'
import { articulosParaLeer, descubrir, type AccionDelPortero, type PlanDelPortero } from './plan'
import { armarMensajeDePropuestas, INSTRUCCION_DE_PROPUESTAS, validarBusquedas, type ResultadoDePropuestas } from './propuestas'
import { COSTO_MAXIMO_POR_FUNCION, gastoDelDia, type FilaDelLibro } from './gasto'
import { TOPE_DEL_PORTERO_USD, type Interruptores } from './datos'
import type { RespuestaDeLlamada } from './juez'
import type { PuenteDeIndice } from './archivar'
import { reconciliarPuente, type FichaParaPuente } from './puente'

export interface Respuesta { status: number; body: Record<string, unknown> }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const err = (status: number, error: string, detalle: string): Respuesta => ({ status, body: { error, detalle } })
const lista = (x: unknown): Array<Record<string, unknown>> => (Array.isArray(x) ? (x as Array<Record<string, unknown>>) : [])

export function validar(cuerpo: unknown): Respuesta | { cuerpo: Record<string, unknown>; client_id: string; dry_run: boolean; workflow_id: string; workflow_execution_id: string } {
  if (!esObjeto(cuerpo)) return err(400, 'entrada_invalida', 'el cuerpo debe ser un objeto')
  if (typeof cuerpo.dry_run !== 'boolean') return err(400, 'dry_run_obligatorio', '`dry_run` es obligatorio y debe ser true o false')
  if (typeof cuerpo.client_id !== 'string' || !UUID.test(cuerpo.client_id)) return err(400, 'entrada_invalida', '`client_id` debe ser un uuid')
  const wf = typeof cuerpo.workflow_id === 'string' ? cuerpo.workflow_id.trim() : ''
  const ex = typeof cuerpo.workflow_execution_id === 'string' ? cuerpo.workflow_execution_id.trim() : ''
  if (!cuerpo.dry_run && (!wf || !ex)) return err(403, 'workflow_requerido', 'con dry_run=false hacen falta `workflow_id` y `workflow_execution_id`: el portero solo corre desde un flujo')
  return { cuerpo, client_id: cuerpo.client_id, dry_run: cuerpo.dry_run, workflow_id: wf, workflow_execution_id: ex }
}
const esRespuesta = (x: unknown): x is Respuesta => esObjeto(x) && typeof (x as { status?: unknown }).status === 'number' && esObjeto((x as { body?: unknown }).body)

/** el gasto de hoy del cliente que el tope TIENE que ver: libro de Apify (con el máximo declarado donde el libro marca 0/nulo) + modelo (libro de invocaciones) */
export async function gastoDeHoy(db: Db, clientId: string, ahora: Date) {
  const dia0 = new Date(ahora); dia0.setUTCHours(0, 0, 0, 0)
  const c = await db.from('costs').select('service, amount_usd, created_at, description').like('service', 'apify:%').gte('created_at', dia0.toISOString()).limit(1000)
  if (c.error) return { ok: false as const, detalle: `costs: ${c.error.message}` }
  const inv = await db.from('agent_invocations').select('cost_usd, created_at').eq('client_id', clientId).gte('created_at', dia0.toISOString()).limit(1000)
  if (inv.error) return { ok: false as const, detalle: `agent_invocations: ${inv.error.message}` }
  // H3 · una corrida de Mapas = una búsqueda por sede: sin importe en el libro vale (búsquedas de hoy ÷ corridas de hoy) × el máximo por búsqueda
  const mp = await db.from('apify_raw').select('params').eq('client_id', clientId).eq('ensayo', false).eq('apify_function', 'own_google_maps_profile').gte('created_at', dia0.toISOString()).limit(50)
  if (mp.error) return { ok: false as const, detalle: `apify_raw: ${mp.error.message}` }
  const filasMapas = lista(mp.data)
  const busquedas = filasMapas.reduce((s, f) => s + Math.max(1, Array.isArray((f.params as { searchStringsArray?: unknown } | null)?.searchStringsArray) ? ((f.params as { searchStringsArray: unknown[] }).searchStringsArray.length) : 1), 0)
  const maximoPorLlamada = filasMapas.length ? { own_google_maps_profile: Math.round(COSTO_MAXIMO_POR_FUNCION.own_google_maps_profile.usd * (busquedas / filasMapas.length) * 1e6) / 1e6 } : undefined
  return { ok: true as const, gasto: gastoDelDia({ clientId, ahora, libro: lista(c.data) as unknown as FilaDelLibro[], invocacionesUsd: lista(inv.data).map((f) => Number(f.cost_usd) || 0), maximoPorLlamada }) }
}

/** las redes propias que el alta declaró (`config.apify.own_handles`: usuario o dirección por red) */
function redesPropias(cfg: Record<string, unknown>): Record<string, string> {
  const ap = esObjeto(cfg.apify) ? cfg.apify : {}
  const own = esObjeto(ap.own_handles) ? ap.own_handles : {}
  const out: Record<string, string> = {}
  for (const red of ['instagram', 'facebook', 'tiktok', 'youtube']) if (typeof own[red] === 'string' && (own[red] as string).trim()) out[red] = (own[red] as string).trim()
  return out
}

export interface DepsDeRutas {
  db: Db
  interruptores: Interruptores
  /** llama al modelo (instrucción, mensaje) y devuelve texto + costo; en pruebas es un molde simulado */
  llamarModelo?: (instruccion: string, mensaje: string) => Promise<RespuestaDeLlamada>
  /** escribe los trozos del índice (puente) y saca los de las fichas reemplazadas; en pruebas es un registro */
  puente?: (p: { escribir: PuenteDeIndice[]; sacar: string[]; client_id: string }) => Promise<{ escritos: number; sacados: number; errores: string[] }>
  ahora?: Date
}

// ───────────────────────── /descubrir · qué pide hoy el portero (solo lectura; el modelo solo para proponer búsquedas)
export async function rutaDescubrir(deps: DepsDeRutas, cuerpo: unknown): Promise<Respuesta> {
  const v = validar(cuerpo); if (esRespuesta(v)) return v
  if (!deps.interruptores.alimentar) return { status: 200, body: { apagado: true, detalle: 'PORTERO_ALIMENTAR está apagado: no se leyó ni se escribió nada', modelos_llamados: 0 } }
  const ahora = deps.ahora ?? new Date()
  const cl = await deps.db.from('clients').select('*').eq('id', v.client_id).limit(1)
  if (cl.error) return err(502, 'lectura_fallida', `clients: ${cl.error.message}`)
  const cliente = lista(cl.data)[0]
  if (!cliente) return err(404, 'cliente_inexistente', 'no existe la ficha del cliente')
  const sd = await deps.db.from('client_sedes').select('ciudad, clave').eq('client_id', v.client_id)
  if (sd.error) return err(502, 'lectura_fallida', `client_sedes: ${sd.error.message}`)
  // las publicaciones propias salen de lo último que se raspó de Instagram (sirve desde el primer día, antes de que haya nada archivado)
  const vg = await deps.db.from('apify_raw').select('respuesta, created_at').eq('client_id', v.client_id).eq('ensayo', false).eq('apify_function', 'instagram_scraper').order('created_at', { ascending: false }).limit(3)
  if (vg.error) return err(502, 'lectura_fallida', `apify_raw: ${vg.error.message}`)
  const g = await gastoDeHoy(deps.db, v.client_id, ahora)
  if (!g.ok) return err(502, 'lectura_fallida', g.detalle)

  const ctx = contextoDelCliente(cliente, lista(sd.data))
  const cfg = (cliente.config ?? {}) as Record<string, unknown>
  const usuariosPropios = new Set(ctx.handles.map((h) => h.toLowerCase()))
  const publicaciones = [...new Set(lista(vg.data).flatMap((f) => lista(f.respuesta)).filter((p) => usuariosPropios.has(String(p.username ?? '').toLowerCase())).flatMap((p) => lista(p.latestPosts)).map((p) => String(p.shortCode ?? p.id ?? '')).filter(Boolean))]
  const ciudad = ctx.ubicacion[0] ?? ''
  const rubro = typeof cliente.industry === 'string' ? cliente.industry : null
  const base = { cliente: { id: v.client_id, name: cliente.name as string | null, website_url: cliente.website_url as string | null, config: cfg }, rubro, pais: ((cliente.country ?? cliente.pais) as string | null) ?? null, ciudad, ciudades: ctx.ubicacion, redes: redesPropias(cfg), publicaciones_propias: publicaciones, gastado_hoy_usd: g.gasto.total_usd, interruptores: deps.interruptores }

  // las búsquedas propias: el modelo PROPONE, el código decide
  let propuestas: ResultadoDePropuestas = { aceptadas: [], rechazadas: [] }
  let costoPropuestas = 0
  const primero = descubrir(base)
  if (deps.interruptores.proponer_busquedas && deps.llamarModelo && ciudad && String(cliente.name ?? '').trim()) {
    const yaBuscadas = primero.hacer.filter((a) => a.fuente === 'prensa').map((a) => a.objetivo)
    try {
      const r = await deps.llamarModelo(INSTRUCCION_DE_PROPUESTAS, armarMensajeDePropuestas({ nombre: String(cliente.name), ciudad, rubro: rubro ?? '(sin rubro)', trajo_hoy: [...new Set(primero.hacer.map((a) => a.fuente))], ya_buscadas: yaBuscadas }))
      costoPropuestas = r.costo_usd
      propuestas = validarBusquedas(r.texto, { nombre: String(cliente.name), ciudad, ya_buscadas: yaBuscadas })
    } catch { /* una falla del modelo no frena el plan: sin propuestas */ }
  }
  const plan: PlanDelPortero = descubrir({ ...base, gastado_hoy_usd: g.gasto.total_usd + costoPropuestas, busquedas_propuestas: propuestas.aceptadas.map((p) => p.texto) })
  return { status: 200, body: { dry_run: v.dry_run, tope_por_cliente_usd: TOPE_DEL_PORTERO_USD, plan, gasto_de_hoy: g.gasto, propuestas, modelos_llamados: costoPropuestas > 0 || propuestas.aceptadas.length ? 1 : 0, costo_modelo_usd: costoPropuestas } }
}

/**
 * H4 · LECTOR DEL BUSCADOR, TOLERANTE y marcado «VERIFICAR CON SALIDA REAL»: la forma de salida de `google_serp_scraper` se ASUMIÓ (no hay una salida real grabada;
 * la grabación real es aparte, con «dale»). Acepta, en cualquier mezcla: una lista de páginas de resultados con `organicResults` / `results` / `searchResults` / `items` / `organic`,
 * o resultados planos; y por resultado `url` | `link` | `href` y `title` | `name` y `description` | `snippet` | `text`. Lo que no entiende NO se inventa: se cuenta en `ilegibles`.
 */
export const LECTOR_DE_BUSQUEDA = { verificado_con_salida_real: false, nota: 'forma asumida (organicResults o plana); verificar con una salida real grabada antes de encender prensa' } as const
const CLAVES_DE_LISTA = ['organicResults', 'results', 'searchResults', 'organic', 'items']
const primero = (o: Record<string, unknown>, claves: string[]): string | undefined => { for (const k of claves) if (typeof o[k] === 'string' && (o[k] as string).trim()) return (o[k] as string).trim(); return undefined }
export interface ResultadoDeBusqueda { url?: unknown; title?: unknown; description?: unknown }
export function leerBusqueda(filas: Array<Record<string, unknown>>): { resultados: ResultadoDeBusqueda[]; ilegibles: number } {
  const out: ResultadoDeBusqueda[] = []
  let ilegibles = 0
  const poner = (r: Record<string, unknown>) => {
    const url = primero(r, ['url', 'link', 'href'])
    if (!url || !/^https?:\/\//i.test(url)) { ilegibles++; return }
    out.push({ url, title: primero(r, ['title', 'name']), description: primero(r, ['description', 'snippet', 'text']) })
  }
  const recorrer = (nodo: unknown, prof = 0): void => {
    if (prof > 3) return
    for (const it of lista(nodo)) {
      const anidada = CLAVES_DE_LISTA.find((k) => Array.isArray((it as Record<string, unknown>)[k]))
      if (anidada) recorrer((it as Record<string, unknown>)[anidada], prof + 1)
      else poner(it)
    }
  }
  for (const f of filas) {
    const r = f.respuesta
    if (esObjeto(r)) { const k = CLAVES_DE_LISTA.find((c) => Array.isArray(r[c])); if (k) recorrer(r[k], 1); else poner(r) } else recorrer(r)
  }
  return { resultados: out, ilegibles }
}
export const resultadosDeBusqueda = (filas: Array<Record<string, unknown>>): ResultadoDeBusqueda[] => leerBusqueda(filas).resultados

/**
 * SEGUNDA TANDA (`fase: 'articulos'`) · de lo que trajo la búsqueda de hoy, las ≤ 3 páginas que vale leer (nunca el sitio propio, ni redes, ni lo ya leído, y solo si nombran al cliente).
 * Solo LEE. Devuelve acciones con la misma forma que `plan.hacer` para que el flujo las ejecute con el mismo nodo del Servicio.
 */
export async function rutaArticulos(deps: DepsDeRutas, cuerpo: unknown): Promise<Respuesta> {
  const v = validar(cuerpo); if (esRespuesta(v)) return v
  if (!deps.interruptores.alimentar) return { status: 200, body: { apagado: true, detalle: 'PORTERO_ALIMENTAR está apagado: no se leyó ni se escribió nada', acciones: [], modelos_llamados: 0 } }
  const ahora = deps.ahora ?? new Date()
  const cl = await deps.db.from('clients').select('id, name, website_url').eq('id', v.client_id).limit(1)
  if (cl.error) return err(502, 'lectura_fallida', `clients: ${cl.error.message}`)
  const cliente = lista(cl.data)[0]
  if (!cliente) return err(404, 'cliente_inexistente', 'no existe la ficha del cliente')
  const dia0 = new Date(ahora); dia0.setUTCHours(0, 0, 0, 0)
  const busq = await deps.db.from('apify_raw').select('id, respuesta, metadata, created_at').eq('client_id', v.client_id).eq('ensayo', false).eq('apify_function', 'google_serp_scraper').gte('created_at', dia0.toISOString()).limit(20)
  if (busq.error) return err(502, 'lectura_fallida', `apify_raw: ${busq.error.message}`)
  const leidas = await deps.db.from('apify_raw').select('params, metadata').eq('client_id', v.client_id).eq('ensayo', false).eq('apify_function', 'website_content_scraper').limit(400)
  if (leidas.error) return err(502, 'lectura_fallida', `apify_raw: ${leidas.error.message}`)
  const yaVistas = new Set<string>()
  for (const f of lista(leidas.data)) { const p = (f.params ?? {}) as { startUrls?: Array<{ url?: unknown }> }; for (const s of lista(p.startUrls)) if (typeof s.url === 'string') yaVistas.add(s.url) }
  const g = await gastoDeHoy(deps.db, v.client_id, ahora)
  if (!g.ok) return err(502, 'lectura_fallida', g.detalle)
  const nombre = String(cliente.name ?? '').trim()
  const urls = nombre ? articulosParaLeer(leerBusqueda(lista(busq.data)).resultados, { sitioPropio: cliente.website_url as string | null, yaVistas, nombreCoincide: (t) => coincidePorPalabra(t, nombre) }) : []
  const acciones: AccionDelPortero[] = []
  let acumulado = g.gasto.total_usd
  const omitidas: Array<{ url: string; por_que: string }> = []
  for (const url of urls) {
    const usd = 0.0536
    if (acumulado + usd > TOPE_DEL_PORTERO_USD) { omitidas.push({ url, por_que: `no cabe en el tope del día (US$ ${acumulado.toFixed(4)} + ${usd} > ${TOPE_DEL_PORTERO_USD.toFixed(2)})` }); continue }
    acumulado += usd
    acciones.push({ fuente: 'prensa', funcion: 'website_content_scraper', params: { startUrls: [{ url }], maxCrawlPages: 1, maxCrawlDepth: 0 }, metadata: { target_kind: 'third_party', llamado_por: 'portero-articulo' }, usd_max: usd, medido: true, objetivo: url })
  }
  const leidos = leerBusqueda(lista(busq.data))
  return { status: 200, body: { dry_run: v.dry_run, acciones, omitidas, resultados_de_busqueda: leidos.resultados.length, resultados_ilegibles: leidos.ilegibles, filas_de_busqueda: lista(busq.data).length, lector_de_busqueda: LECTOR_DE_BUSQUEDA, modelos_llamados: 0 } }
}

// ───────────────────────── /alimentar · filtrar → razonar → archivar con lo que ya se trajo
export async function rutaAlimentar(deps: DepsDeRutas, cuerpo: unknown): Promise<Respuesta> {
  const v = validar(cuerpo); if (esRespuesta(v)) return v
  if (!deps.interruptores.alimentar) return { status: 200, body: { apagado: true, detalle: 'PORTERO_ALIMENTAR está apagado: no se leyó ni se escribió nada', modelos_llamados: 0 } }
  const ahora = deps.ahora ?? new Date()
  const g = await gastoDeHoy(deps.db, v.client_id, ahora)
  if (!g.ok) return err(502, 'lectura_fallida', g.detalle)
  const r: ResultadoDeAlimentar = await alimentarCliente({
    db: deps.db, client_id: v.client_id, dry_run: v.dry_run, interruptores: deps.interruptores, llamarModelo: deps.llamarModelo, ahora, forzar: v.cuerpo.forzar === true,
    gasto_de_hoy_usd: g.gasto.total_usd, workflow_id: v.workflow_id || undefined, workflow_execution_id: v.workflow_execution_id || undefined,
  })
  const status = r.estado === 'cliente_inexistente' ? 404 : r.estado === 'lectura_fallida' ? 502 : 200
  // H1 · el puente se RECONCILIA en cada pasada (idempotente): fichas entregables sin trozo ⇒ se reenvían; trozos de fichas retiradas/descartadas ⇒ salen.
  // Una falla de ayer se repara hoy sin duplicar nada. En seco solo se CUENTA (lectura).
  let puente: Record<string, unknown> | null = null
  if (deps.interruptores.puente_al_indice && r.ok) {
    const fi = await deps.db.from('cerebro_fichas').select('id, client_id, ref, clase, titulo, contenido, fecha_fuente, observado_en, creado_en, propiedad, origen, descartada, retirada_en, prueba').eq('client_id', v.client_id).limit(5000)
    const ch = await deps.db.from('client_brain_chunks').select('source_id').eq('client_id', v.client_id).eq('source_table', 'cerebro_fichas').limit(5000)
    if (fi.error || ch.error) {
      r.errores.push(`puente: lectura fallida (${(fi.error ?? ch.error)!.message})`)
      puente = { lectura_fallida: true }
    } else {
      const rec = reconciliarPuente(lista(fi.data) as unknown as FichaParaPuente[], lista(ch.data).map((x) => String(x.source_id)))
      puente = { pendientes: rec.escribir.length, a_sacar: rec.sacar.length, ya_buscables: rec.ya_buscables }
      if (!v.dry_run && deps.puente && (rec.escribir.length || rec.sacar.length)) {
        const p = await deps.puente({ escribir: rec.escribir, sacar: rec.sacar, client_id: v.client_id })
        puente = { ...puente, ...p }
        if (p.errores.length) r.errores.push(...p.errores.map((m) => `puente: ${m}`))
      }
    }
  }
  // una falla del puente se DICE en el estado (no queda «hecha» con errores escondidos)
  if (r.errores.length && r.estado === 'hecha') { r.estado = 'con_errores'; r.ok = false }
  return { status, body: { ...r, puente, gasto_de_hoy: g.gasto, modelos_llamados: r.juez.llamadas } }
}
