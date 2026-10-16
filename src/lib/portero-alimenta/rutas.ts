/**
 * LAS RUTAS DEL PORTERO QUE ALIMENTA (`/api/brain/portero/{descubrir,alimentar}`) · la lógica vive aquí para probarla con una base falsa y un modelo simulado.
 * Guardas (todas ANTES de leer o escribir): llave interna → 401 (en el archivo de ruta); `dry_run` OBLIGATORIO y booleano → 400; con `dry_run: false`,
 * `workflow_id` y `workflow_execution_id` → 403; interruptor `PORTERO_ALIMENTAR` apagado → 200 `{apagado:true}` sin leer ni escribir.
 * `descubrir` solo LEE (y, con su interruptor, pide al modelo hasta 3 búsquedas). `alimentar` escribe SOLO sin `dry_run`.
 */
import { PRESUPUESTO_DE_RUTA_MS, PRESUPUESTO_DEL_PUENTE_EN_ALIMENTAR_MS, PRESUPUESTO_DEL_PUENTE_PROPIO_MS } from './tandas'
import { alimentarCliente, contextoDelCliente, type Db, type ResultadoDeAlimentar } from './alimentar'
import { coincidePorPalabra } from '../texto/coincidencia'
import { fichaPropiaDeMapas } from './mapas-propia'
import { articulosParaLeer, descubrir, MAX_RESENAS_POR_CORRIDA, type AccionDelPortero, type PlanDelPortero } from './plan'
import { armarMensajeDePropuestas, INSTRUCCION_DE_PROPUESTAS, validarBusquedas, type ResultadoDePropuestas } from './propuestas'
import { COSTO_MAXIMO_POR_FUNCION, FLUJO_DEL_PORTERO, gastoDelDia, invocacionDelPortero, soloLoDelPortero, VIDEO_DE_INSTAGRAM_USD, type FilaDeRaspadoDeOrigen, type FilaDelLibro } from './gasto'
import { TOPE_DEL_PORTERO_USD, type Interruptores } from './datos'
import type { BrazosActivos } from './brazos'
import { cargarContextoDeBrazos } from './brazos/sistematica'
import type { RespuestaDeLlamada } from './juez'
import type { PuenteDeIndice } from './archivar'
import { clientesActivos } from './clientes'
import { COBERTURA_DEL_ALTA_HORAS, sinLoYaRaspado, type FilaDeRaspadoParaCubrir } from './cobertura'
import { MAX_TROZOS_A_ESCRIBIR_POR_PASADA, MAX_TROZOS_A_SACAR_POR_PASADA, reconciliarPuente, type FichaParaPuente } from './puente'
import { leerTodas } from './paginar'

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
  const inv = await db.from('agent_invocations').select('cost_usd, created_at, agent_name, workflow_id').eq('client_id', clientId).gte('created_at', dia0.toISOString()).limit(1000)
  if (inv.error) return { ok: false as const, detalle: `agent_invocations: ${inv.error.message}` }
  // SOLO lo del portero (prerrequisito del plan v3): el crudo dice quién llamó; el libro no. Un plan, el alta o una corrida a mano del mismo día no apagan ni frenan al portero
  const flujo = process.env.PORTERO_WORKFLOW_ID || FLUJO_DEL_PORTERO
  const cr = await db.from('apify_raw').select('apify_function, created_at, metadata').eq('client_id', clientId).eq('ensayo', false).gte('created_at', new Date(dia0.getTime() - 600_000).toISOString()).limit(1000)
  if (cr.error) return { ok: false as const, detalle: `apify_raw: ${cr.error.message}` }
  const origen = soloLoDelPortero(lista(c.data) as unknown as FilaDelLibro[], lista(cr.data) as unknown as FilaDeRaspadoDeOrigen[], clientId, flujo)
  // H3 · una corrida de Mapas = una búsqueda por sede: sin importe en el libro vale (búsquedas de hoy ÷ corridas de hoy) × el máximo por búsqueda
  const mp = await db.from('apify_raw').select('params').eq('client_id', clientId).eq('ensayo', false).eq('apify_function', 'own_google_maps_profile').gte('created_at', dia0.toISOString()).limit(50)
  if (mp.error) return { ok: false as const, detalle: `apify_raw: ${mp.error.message}` }
  const filasMapas = lista(mp.data)
  const busquedas = filasMapas.reduce((s, f) => s + Math.max(1, Array.isArray((f.params as { searchStringsArray?: unknown } | null)?.searchStringsArray) ? ((f.params as { searchStringsArray: unknown[] }).searchStringsArray.length) : 1), 0)
  // la corrida de videos vale POR VIDEO pedido (`resultsLimit`), no el máximo de 10 (medido 15-oct: 1 video pedido contó US$ 0,56 y no 0,056)
  const vi = await db.from('apify_raw').select('params').eq('client_id', clientId).eq('ensayo', false).eq('apify_function', 'videos_instagram').gte('created_at', dia0.toISOString()).limit(50)
  if (vi.error) return { ok: false as const, detalle: `apify_raw: ${vi.error.message}` }
  const filasVideos = lista(vi.data)
  const videosPedidos = filasVideos.reduce((s, f) => { const n = Number((f.params as { resultsLimit?: unknown } | null)?.resultsLimit); return s + (Number.isFinite(n) && n > 0 ? n : 10) }, 0)
  const maximoPorLlamada: Record<string, number> | undefined = filasMapas.length || filasVideos.length ? {
    ...(filasMapas.length ? { own_google_maps_profile: Math.round(COSTO_MAXIMO_POR_FUNCION.own_google_maps_profile.usd * (busquedas / filasMapas.length) * 1e6) / 1e6 } : {}),
    ...(filasVideos.length ? { videos_instagram: Math.round(VIDEO_DE_INSTAGRAM_USD * (videosPedidos / filasVideos.length) * 1e6) / 1e6 } : {}),
  } : undefined
  const modeloDelPortero = lista(inv.data).filter((f) => invocacionDelPortero(f, flujo))
  const fueraUsd = gastoDelDia({ clientId, ahora, libro: origen.fuera_del_portero, invocacionesUsd: lista(inv.data).filter((f) => !invocacionDelPortero(f, flujo)).map((f) => Number(f.cost_usd) || 0), maximoPorLlamada }).total_usd
  return { ok: true as const, gasto: gastoDelDia({ clientId, ahora, libro: origen.libro, invocacionesUsd: modeloDelPortero.map((f) => Number(f.cost_usd) || 0), maximoPorLlamada }), fuera_del_portero_usd: fueraUsd, llamadas_sin_origen: origen.sin_origen }
}

/**
 * ¿El cliente DESPERTÓ con el raspado del alta hace poco? (una fila de `cerebro_portero_corridas` con `resumen.tipo = 'despertar'`, creada dentro de la ventana de cobertura).
 * Solo mientras dure esa ventana, lo que el alta ya raspó (y es fresco) no se vuelve a pedir. Una falla de lectura se DICE.
 */
export async function despertoHace(db: Db, clientId: string, ahora: Date): Promise<{ ok: true; activo: boolean; desde: Date } | { ok: false; detalle: string }> {
  const desde = new Date(ahora.getTime() - COBERTURA_DEL_ALTA_HORAS * 3_600_000)
  const q = await db.from('cerebro_portero_corridas').select('dia, resumen, creado_en').eq('client_id', clientId).gte('creado_en', desde.toISOString()).limit(10)
  if (q.error) return { ok: false, detalle: `cerebro_portero_corridas: ${q.error.message}` }
  const activo = lista(q.data).some((f) => esObjeto(f.resumen) && f.resumen.tipo === 'despertar')
  return { ok: true, activo, desde }
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
  /** el agente del roster que pule el resumen vivo (15-oct); ausente = por código */
  pulirResumen?: (tarea: string, opciones?: { topeUsd?: number }) => Promise<{ texto: string; costo_usd: number }>
  /** escribe los trozos del índice (puente) y saca los de las fichas reemplazadas; en pruebas es un registro */
  puente?: (p: { escribir: PuenteDeIndice[]; sacar: string[]; client_id: string; hasta?: number }) => Promise<{ escritos: number; sacados: number; errores: string[] }>
  ahora?: Date
  /** los nuevos brazos (15-oct): todos APAGADOS si falta; las rutas los leen del entorno */
  brazos?: BrazosActivos
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
  // las CIUDADES de las sedes (no sus claves: «norte» o «centro» no son ciudades y gastaban las búsquedas de Mapas); sin sedes, lo que dice la ficha
  const ciudadesDeSedes = lista(sd.data).map((s) => String(s.ciudad ?? '').trim()).filter(Boolean)
  const ciudades = ciudadesDeSedes.length ? ciudadesDeSedes : ctx.ubicacion
  const ciudad = ciudades[0] ?? ''
  const rubro = typeof cliente.industry === 'string' ? cliente.industry : null
  // los nuevos brazos de demanda y competencia miran POR SEDE: sus puntos, los competidores ya juzgados y las ubicaciones ya pedidas (una lectura; un error se DICE y se cae a lo de siempre)
  let brazosCtx: Awaited<ReturnType<typeof cargarContextoDeBrazos>> | undefined
  let brazosCtxError: string | null = null
  if (deps.brazos && (deps.brazos.demanda || deps.brazos.competencia)) {
    brazosCtx = await cargarContextoDeBrazos(deps.db, v.client_id, cliente, ahora)
    if (brazosCtx.errores.length) { brazosCtxError = brazosCtx.errores.join(' · '); brazosCtx = undefined }
  }
  const forzarPosicion = v.cuerpo.forzar_posicion === true
  const base = { forzar_posicion: forzarPosicion, cliente: { id: v.client_id, name: cliente.name as string | null, website_url: cliente.website_url as string | null, config: cfg }, rubro, pais: ((cliente.country ?? cliente.pais) as string | null) ?? null, ciudad, ciudades, redes: redesPropias(cfg), publicaciones_propias: publicaciones, gastado_hoy_usd: g.gasto.total_usd, interruptores: deps.interruptores, brazos: deps.brazos, ahora, brazosCtx }

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
  let plan: PlanDelPortero = descubrir({ ...base, gastado_hoy_usd: g.gasto.total_usd + costoPropuestas, busquedas_propuestas: propuestas.aceptadas.map((p) => p.texto) })
  // lo que el ALTA ya raspó (y es fresco) no se vuelve a pedir; solo mientras dure la ventana del despertar
  let cubierto_por_el_alta: ReturnType<typeof sinLoYaRaspado> | null = null
  const dsp = await despertoHace(deps.db, v.client_id, ahora)
  if (!dsp.ok) return err(502, 'lectura_fallida', dsp.detalle)
  // `cubrir_con_el_alta: true` lo pide el despertar (en seco todavía no hay fila de despertar): calcula lo que falta como si ya hubiera despertado
  if (dsp.activo || v.cuerpo.cubrir_con_el_alta === true) {
    const raw = await deps.db.from('apify_raw').select('apify_function, params, created_at').eq('client_id', v.client_id).eq('ensayo', false).gte('created_at', dsp.desde.toISOString()).limit(400)
    if (raw.error) return err(502, 'lectura_fallida', `apify_raw: ${raw.error.message}`)
    cubierto_por_el_alta = sinLoYaRaspado(plan, lista(raw.data) as unknown as FilaDeRaspadoParaCubrir[], ahora)
    plan = { ...plan, hacer: cubierto_por_el_alta.hacer, costo_maximo_del_plan_usd: Math.round(cubierto_por_el_alta.hacer.reduce((x, a) => x + a.usd_max, 0) * 1e6) / 1e6 }
  }
  return { status: 200, body: { dry_run: v.dry_run, tope_por_cliente_usd: TOPE_DEL_PORTERO_USD, plan, cubierto_por_el_alta, gasto_de_hoy: g.gasto, propuestas, modelos_llamados: costoPropuestas > 0 || propuestas.aceptadas.length ? 1 : 0, costo_modelo_usd: costoPropuestas, ...(brazosCtxError ? { brazos_lectura_fallida: brazosCtxError } : {}) } }
}

/**
 * H4 · LECTOR DEL BUSCADOR, TOLERANTE y marcado «VERIFICAR CON SALIDA REAL»: la forma de salida de `google_serp_scraper` se ASUMIÓ (no hay una salida real grabada;
 * la grabación real es aparte, con «dale»). Acepta, en cualquier mezcla: una lista de páginas de resultados con `organicResults` / `results` / `searchResults` / `items` / `organic`,
 * o resultados planos; y por resultado `url` | `link` | `href` y `title` | `name` y `description` | `snippet` | `text`. Lo que no entiende NO se inventa: se cuenta en `ilegibles`.
 */
export const LECTOR_DE_BUSQUEDA = { verificado_con_salida_real: true, nota: 'verificado el 14-oct con una salida real grabada: respuesta = [ {organicResults:[{url,type,title,position,description,…}], paidResults, peopleAlsoAsk, relatedQueries, …} ]; `queries` como texto o como lista da lo mismo' } as const
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

/**
 * TANDA 2 (`fase: 'tanda2'`) · lo que necesita algo que la tanda 1 trajo. Solo LEE; devuelve acciones con la forma de `plan.hacer`.
 *  · RESEÑAS: con la dirección de la ficha de Mapas que trajo la tanda 1 (≤ 100 reseñas). Solo se usa una ficha que SEA del cliente (`esSobreElCliente` sobre título, dirección,
 *    sitio y teléfono de la propia ficha): un homónimo de Mapas no abre reseñas ajenas. Una vez por día.
 *  · VIDEOS DE INSTAGRAM: se REVISA todos los días, pero solo se bajan si hay publicaciones NUEVAS (no vistas) que sean videos; se piden tantos como videos nuevos (≤ 10).
 */
const CODIGO_DE_PUBLICACION = (p: Record<string, unknown>): string => String(p.shortCode ?? p.id ?? '')
const esVideo = (p: Record<string, unknown>): boolean => /video|clip|reel/i.test(String(p.type ?? p.productType ?? '')) || typeof p.videoUrl === 'string'
export async function rutaTanda2(deps: DepsDeRutas, cuerpo: unknown): Promise<Respuesta> {
  const v = validar(cuerpo); if (esRespuesta(v)) return v
  if (!deps.interruptores.alimentar) return { status: 200, body: { apagado: true, detalle: 'PORTERO_ALIMENTAR está apagado: no se leyó ni se escribió nada', acciones: [], modelos_llamados: 0 } }
  const ahora = deps.ahora ?? new Date()
  const cl = await deps.db.from('clients').select('*').eq('id', v.client_id).limit(1)
  if (cl.error) return err(502, 'lectura_fallida', `clients: ${cl.error.message}`)
  const cliente = lista(cl.data)[0]
  if (!cliente) return err(404, 'cliente_inexistente', 'no existe la ficha del cliente')
  const sd = await deps.db.from('client_sedes').select('ciudad, clave').eq('client_id', v.client_id)
  if (sd.error) return err(502, 'lectura_fallida', `client_sedes: ${sd.error.message}`)
  const dia0 = new Date(ahora); dia0.setUTCHours(0, 0, 0, 0)
  const ctx = contextoDelCliente(cliente, lista(sd.data))
  const g = await gastoDeHoy(deps.db, v.client_id, ahora)
  if (!g.ok) return err(502, 'lectura_fallida', g.detalle)
  let acumulado = g.gasto.total_usd
  const acciones: AccionDelPortero[] = []
  const omitidas: Array<{ fuente: string; por_que: string }> = []
  const poner = (a: AccionDelPortero) => {
    if (acumulado + a.usd_max > TOPE_DEL_PORTERO_USD) { omitidas.push({ fuente: a.fuente, por_que: `no cabe en el tope del día (US$ ${acumulado.toFixed(4)} + ${a.usd_max} > ${TOPE_DEL_PORTERO_USD.toFixed(2)})` }); return }
    acumulado += a.usd_max; acciones.push(a)
  }

  // ── reseñas de la ficha de Mapas
  const mp = await deps.db.from('apify_raw').select('respuesta, created_at').eq('client_id', v.client_id).eq('ensayo', false).eq('apify_function', 'own_google_maps_profile').order('created_at', { ascending: false }).limit(3)
  if (mp.error) return err(502, 'lectura_fallida', `apify_raw: ${mp.error.message}`)
  const dsp = await despertoHace(deps.db, v.client_id, ahora)
  if (!dsp.ok) return err(502, 'lectura_fallida', dsp.detalle)
  const desdeYa = dsp.activo ? dsp.desde : dia0
  const ya = await deps.db.from('apify_raw').select('params, created_at').eq('client_id', v.client_id).eq('ensayo', false).eq('apify_function', 'resenas_google_maps').gte('created_at', desdeYa.toISOString()).limit(5)
  if (ya.error) return err(502, 'lectura_fallida', `apify_raw: ${ya.error.message}`)
  const fichas = lista(mp.data).flatMap((f) => lista(f.respuesta))
  const sel = fichaPropiaDeMapas(fichas, ctx)
  const descartadas = sel.descartadas
  const ficha: Record<string, unknown> | null = sel.ficha
  const ambigua = sel.ambigua
  const candidatas = { size: sel.candidatas }
  const url = ficha ? String(ficha.url ?? '').trim() : ''
  if (lista(ya.data).length) omitidas.push({ fuente: 'resenas', por_que: dsp.activo ? 'ya se pidieron con el raspado del alta (despertar reciente)' : 'ya se pidieron hoy' })
  else if (!fichas.length) omitidas.push({ fuente: 'resenas', por_que: 'la corrida de Mapas no dejó una ficha' })
  else if (ambigua) omitidas.push({ fuente: 'resenas', por_que: `hay ${candidatas.size} fichas de Mapas que podrían ser del cliente: es ambiguo y no se piden reseñas (posible homónimo)` })
  else if (!ficha || !/^https?:\/\//i.test(url)) omitidas.push({ fuente: 'resenas', por_que: 'la ficha de Mapas no se pudo confirmar como del cliente (posible homónimo): no se piden reseñas ajenas' })
  else poner({ fuente: 'resenas', funcion: 'resenas_google_maps', params: { startUrls: [{ url }], maxReviews: MAX_RESENAS_POR_CORRIDA }, metadata: { target_kind: 'own', llamado_por: 'portero-alimentar' }, usd_max: COSTO_MAXIMO_POR_FUNCION.resenas_google_maps.usd, medido: true, objetivo: url })

  // ── videos de Instagram solo si hay publicaciones nuevas
  const handles = new Set(ctx.handles.map((h) => h.toLowerCase()))
  const ig = await deps.db.from('apify_raw').select('respuesta, created_at').eq('client_id', v.client_id).eq('ensayo', false).eq('apify_function', 'instagram_scraper').order('created_at', { ascending: false }).limit(1)
  if (ig.error) return err(502, 'lectura_fallida', `apify_raw: ${ig.error.message}`)
  // los videos que YA se bajaron (por id o código): una publicación vista por el despertar no es un video descargado
  const vd = await deps.db.from('apify_raw').select('respuesta').eq('client_id', v.client_id).eq('ensayo', false).eq('apify_function', 'videos_instagram').limit(50)
  if (vd.error) return err(502, 'lectura_fallida', `apify_raw: ${vd.error.message}`)
  const conVideoYa = new Set(lista(vd.data).flatMap((f) => lista(f.respuesta)).flatMap((it) => [String(it.shortCode ?? ''), String(it.id ?? '')]).filter(Boolean))
  const vi = await leerTodas(() => deps.db.from('cerebro_unidades_vistas').select('unidad_ref').eq('client_id', v.client_id).eq('fuente', 'instagram').order('id', { ascending: true }))
  if (vi.error) return err(502, 'lectura_fallida', `cerebro_unidades_vistas: ${vi.error.message}`)
  const vistas = new Set(lista(vi.data).map((x) => String(x.unidad_ref)))
  const perfiles = lista(lista(ig.data)[0]?.respuesta).filter((p) => handles.has(String(p.username ?? '').toLowerCase()))
  const posts = perfiles.flatMap((p) => lista(p.latestPosts))
  const nuevas = posts.filter((p) => CODIGO_DE_PUBLICACION(p) && !vistas.has(CODIGO_DE_PUBLICACION(p)))
  // dentro de la ventana del despertar, «vista» no basta: el despertar vio las publicaciones del alta pero nunca bajó sus videos (ni su transcripción)
  const nuevasVideo = posts.filter((p) => CODIGO_DE_PUBLICACION(p) && esVideo(p) && !conVideoYa.has(CODIGO_DE_PUBLICACION(p)) && (dsp.activo || !vistas.has(CODIGO_DE_PUBLICACION(p))))
  const handle = [...handles][0] ?? ''
  const revision = { publicaciones_leidas: posts.length, publicaciones_nuevas: nuevas.length, videos_nuevos: nuevasVideo.length }
  if (!handle) omitidas.push({ fuente: 'videos', por_que: 'el alta no trae la cuenta propia de Instagram' })
  else if (!nuevasVideo.length) omitidas.push({ fuente: 'videos', por_que: 'sin publicaciones nuevas que sean videos: no se bajan' })
  else {
    const n = Math.min(10, nuevasVideo.length)
    poner({ fuente: 'videos', funcion: 'videos_instagram', params: { username: [handle], resultsLimit: n, includeTranscript: true }, metadata: { target_kind: 'own', llamado_por: 'portero-alimentar' }, usd_max: Math.round(VIDEO_DE_INSTAGRAM_USD * n * 1e6) / 1e6, medido: true, objetivo: `@${handle} · ${n} video(s) nuevo(s)` })
  }
  return { status: 200, body: { dry_run: v.dry_run, acciones, omitidas, revision_de_publicaciones: revision, fichas_de_mapas_descartadas: descartadas, gasto_de_hoy: g.gasto, modelos_llamados: 0 } }
}

/**
 * EL PUENTE POR PASADAS · lee las fichas y los trozos del cliente, reconcilia (idempotente) y envía a lo más `MAX_TROZOS_A_ESCRIBIR_POR_PASADA` trozos y saca a lo más
 * `MAX_TROZOS_A_SACAR_POR_PASADA`; `quedan` dice cuánto falta (el flujo repite hasta 0). En seco solo cuenta. Una falla de lectura se DICE.
 */
export async function reconciliarYEnviar(deps: DepsDeRutas, clientId: string, dryRun: boolean, presupuestoMs: number = PRESUPUESTO_DEL_PUENTE_PROPIO_MS): Promise<{ puente: Record<string, unknown>; errores: string[] }> {
  const fi = await leerTodas(() => deps.db.from('cerebro_fichas').select('id, client_id, ref, clase, titulo, contenido, fecha_fuente, observado_en, creado_en, propiedad, origen, descartada, retirada_en, prueba, huella').eq('client_id', clientId).order('id', { ascending: true }))
  const ch = await leerTodas(() => deps.db.from('client_brain_chunks').select('source_id').eq('client_id', clientId).eq('source_table', 'cerebro_fichas').order('id', { ascending: true }))
  if (fi.error || ch.error) return { puente: { lectura_fallida: true }, errores: [`puente: lectura fallida (${(fi.error ?? ch.error)!.message})`] }
  const rec = reconciliarPuente(lista(fi.data) as unknown as FichaParaPuente[], lista(ch.data).map((x) => String(x.source_id)))
  const lote = { escribir: rec.escribir.slice(0, MAX_TROZOS_A_ESCRIBIR_POR_PASADA), sacar: rec.sacar.slice(0, MAX_TROZOS_A_SACAR_POR_PASADA) }
  let puente: Record<string, unknown> = { pendientes: rec.escribir.length, a_sacar: rec.sacar.length, ya_buscables: rec.ya_buscables, repetidas: rec.duplicadas, esta_pasada: { escribir: lote.escribir.length, sacar: lote.sacar.length } }
  const errores: string[] = []
  let quedan = rec.escribir.length + rec.sacar.length
  // sin presupuesto no se escribe nada (todo queda como `quedan` para la pasada propia del puente); con presupuesto, no se arranca nada pasada la hora límite
  if (!dryRun && deps.puente && presupuestoMs > 0 && (lote.escribir.length || lote.sacar.length)) {
    const p = await deps.puente({ escribir: lote.escribir, sacar: lote.sacar, client_id: clientId, hasta: Date.now() + presupuestoMs })
    puente = { ...puente, ...p }
    quedan = Math.max(0, rec.escribir.length - p.escritos) + Math.max(0, rec.sacar.length - p.sacados)
    if (p.errores.length) errores.push(...p.errores.map((m) => `puente: ${m}`))
  }
  return { puente: { ...puente, quedan }, errores }
}

// ───────────────────────── /puente · solo la reconciliación (el flujo la repite hasta terminar)
export async function rutaPuente(deps: DepsDeRutas, cuerpo: unknown): Promise<Respuesta> {
  const v = validar(cuerpo); if (esRespuesta(v)) return v
  if (!deps.interruptores.alimentar || !deps.interruptores.puente_al_indice) return { status: 200, body: { apagado: true, detalle: 'el puente al índice está apagado: no se leyó ni se escribió nada', modelos_llamados: 0 } }
  const x = await reconciliarYEnviar(deps, v.client_id, v.dry_run)
  const mal = x.errores.length > 0 || x.puente.lectura_fallida === true
  return { status: mal ? 502 : 200, body: { ok: !mal, dry_run: v.dry_run, puente: x.puente, errores: x.errores, modelos_llamados: 0 } }
}

// ───────────────────────── /clientes · a quién atiende el portero hoy (solo lectura)
export async function rutaClientes(deps: DepsDeRutas, cuerpo: unknown): Promise<Respuesta> {
  if (!esObjeto(cuerpo)) return err(400, 'entrada_invalida', 'el cuerpo debe ser un objeto')
  if (typeof cuerpo.dry_run !== 'boolean') return err(400, 'dry_run_obligatorio', '`dry_run` es obligatorio y debe ser true o false')
  if (!deps.interruptores.alimentar) return { status: 200, body: { apagado: true, detalle: 'PORTERO_ALIMENTAR está apagado: no se leyó ni se escribió nada', clientes: [], excluidos: [], modelos_llamados: 0 } }
  const r = await clientesActivos(deps.db)
  if (!r.ok) return err(502, 'lectura_fallida', r.detalle)
  const solo = typeof cuerpo.client_id === 'string' && UUID.test(cuerpo.client_id) ? cuerpo.client_id : null
  const datos = solo ? { clientes: r.datos.clientes.filter((c) => c.client_id === solo), excluidos: r.datos.excluidos.filter((c) => c.client_id === solo) } : r.datos
  return { status: 200, body: { dry_run: cuerpo.dry_run, ...datos, modelos_llamados: 0 } }
}

// ───────────────────────── /alimentar · filtrar → razonar → archivar con lo que ya se trajo
export async function rutaAlimentar(deps: DepsDeRutas, cuerpo: unknown): Promise<Respuesta> {
  const v = validar(cuerpo); if (esRespuesta(v)) return v
  if (!deps.interruptores.alimentar) return { status: 200, body: { apagado: true, detalle: 'PORTERO_ALIMENTAR está apagado: no se leyó ni se escribió nada', modelos_llamados: 0 } }
  const ahora = deps.ahora ?? new Date()
  const inicio = Date.now()
  const g = await gastoDeHoy(deps.db, v.client_id, ahora)
  if (!g.ok) return err(502, 'lectura_fallida', g.detalle)
  const r: ResultadoDeAlimentar = await alimentarCliente({
    db: deps.db, client_id: v.client_id, dry_run: v.dry_run, interruptores: deps.interruptores, brazos: deps.brazos, llamarModelo: deps.llamarModelo, pulirResumen: deps.pulirResumen, ahora, forzar: v.cuerpo.forzar === true,
    gasto_de_hoy_usd: g.gasto.total_usd, workflow_id: v.workflow_id || undefined, workflow_execution_id: v.workflow_execution_id || undefined,
  })
  const status = r.estado === 'cliente_inexistente' ? 404 : r.estado === 'lectura_fallida' ? 502 : 200
  // H1 · el puente se RECONCILIA en cada pasada (idempotente, con tope por pasada): ver `reconciliarYEnviar`
  let puente: Record<string, unknown> | null = null
  if (deps.interruptores.puente_al_indice && r.ok) {
    // el puente de ESTA llamada solo usa lo que sobra del presupuesto de la ruta; lo demás lo drena el nodo ④ bis por pasadas propias
    const sobra = PRESUPUESTO_DE_RUTA_MS - (Date.now() - inicio)
    const x = await reconciliarYEnviar(deps, v.client_id, v.dry_run, Math.max(0, Math.min(PRESUPUESTO_DEL_PUENTE_EN_ALIMENTAR_MS, sobra)))
    puente = x.puente
    r.errores.push(...x.errores)
  }
  // una falla del puente se DICE en el estado (no queda «hecha» con errores escondidos)
  if (r.errores.length && r.estado === 'hecha') { r.estado = 'con_errores'; r.ok = false }
  return { status, body: { ...r, puente, gasto_de_hoy: g.gasto, modelos_llamados: r.juez.llamadas } }
}
