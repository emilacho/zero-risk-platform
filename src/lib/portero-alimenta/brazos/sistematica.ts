/**
 * COMPETENCIA SISTEMÁTICA POR SEDE · el SISTEMA descubre (código) y el AGENTE juzga (barato, con tope); el dueño puede vetar o agregar, pero no es requisito.
 *   leer     · `cargarContextoDeBrazos`: sedes con su punto, filas crudas de Mapas, fichas vigentes de los brazos (una lectura de cada cosa; un error de lectura se DICE).
 *   descubrir· `candidatosDeSede` (descubrir.ts): lugares de la corrida de posición de la sede, del rubro, cerca, con reseñas + los del análisis del alta.
 *   juzgar   · `juzgarCompetenciaDeSede` (juez-competencia.ts): un lote por sede, con cita literal; `duda` no entra.
 *   guardar  · fichas `competidor_vigilado` (los que compiten) y `competidor_evaluacion` (los que no o en duda), con motivo y fecha; los que dejaron de competir se RETIRAN con su motivo.
 *   cada mes · una sede se vuelve a evaluar cuando su última evaluación tiene `DIAS_ENTRE_EVALUACIONES` o más.
 */
import { familiasDelRubro } from '../../fuentes-publicas/plan'
import type { Db } from '../alimentar'
import type { RetiroDeBrazo } from './archivo'
import { type Competidor } from './competencia'
import { candidatosDeSede, type ResultadoDeCandidatos } from './descubrir'
import { juzgarCompetenciaDeSede, type ResultadoDelJuicioDeSede } from './juez-competencia'
import { CAMPO_ESTADO_DE_LA_SEDE, radioDe, sedesConPunto, type FilaDeMapas, type SedeConPunto } from './sedes'
import { DIA_EN_MS, slugDe, type FichaDeBrazo } from './tipos'
import type { RespuestaDeLlamada } from '../juez'

export const DIAS_ENTRE_EVALUACIONES = 30
const VIGENCIA_DIAS = 45
type Fila = Record<string, unknown>
const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {})
const txt = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')

export interface ContextoDeBrazos {
  sedes: SedeConPunto[]
  filas: Array<FilaDeMapas & { id?: string }>
  vigentes: Fila[]
  delSistema: Competidor[]
  /** sedes cuya ubicación aproximada se pidió en los últimos 7 días (para no pedirla cada día) */
  ubicadasRecientemente: Set<string>
  errores: string[]
}

/** las fichas vigentes de los brazos que dicen QUIÉN se vigila (de la última evaluación, no retiradas) */
export function competidoresDelSistema(vigentes: Fila[]): Competidor[] {
  const cuentas = new Map<string, string>()
  for (const f of vigentes) {
    if (f.clase !== 'competidor_cuenta') continue
    const d = obj(obj(f.provenance_tag).datos)
    if (txt(d.slug) && txt(d.instagram)) cuentas.set(txt(d.slug), txt(d.instagram))
  }
  const por = new Map<string, Competidor>()
  for (const f of vigentes) {
    if (f.clase !== 'competidor_vigilado' || f.retirada_en) continue
    const d = obj(obj(f.provenance_tag).datos)
    const nombre = txt(d.nombre)
    const slug = txt(d.slug) || slugDe(nombre)
    if (!nombre || !slug) continue
    const web = txt(d.web) || null
    const previo = por.get(slug)
    const sede = txt(d.sede)
    if (previo) { if (sede && !previo.sedes.includes(sede)) previo.sedes.push(sede); continue }
    por.set(slug, { nombre, slug, tipo: txt(d.tipo) || 'direct', web, sitio_propio: txt(d.sitio_propio) || null, instagram: cuentas.get(slug) ?? (txt(d.instagram) || null), sedes: sede ? [sede] : [], origen: 'sistema' })
  }
  return [...por.values()]
}

/** una sola carga de todo lo que los brazos necesitan; un error de lectura se junta y se DICE (nunca «no hay nada») */
export async function cargarContextoDeBrazos(db: Db, clientId: string, cliente: Fila, ahora: Date): Promise<ContextoDeBrazos> {
  const errores: string[] = []
  const sd = await db.from('client_sedes').select('id, ciudad, clave').eq('client_id', clientId)
  if (sd.error) errores.push(`client_sedes: ${sd.error.message}`)
  const ids = lista(sd.data).map((s) => String(s.id)).filter(Boolean)
  const da = ids.length ? await db.from('client_sede_datos').select('sede_id, campo, valor_texto, observado_en').eq('client_id', clientId).in('campo', ['tipo_de_atencion', 'direccion', CAMPO_ESTADO_DE_LA_SEDE]).limit(200) : { data: [], error: null }
  if (da.error) errores.push(`client_sede_datos: ${da.error.message}`)
  const rr = await db.from('apify_raw').select('id, apify_function, params, respuesta, ensayo, created_at').eq('client_id', clientId).eq('ensayo', false).in('apify_function', ['own_google_maps_profile', 'google_maps_scraper', 'competitor_website_scraper', 'instagram_scraper', 'facebook_ads_library_scraper']).order('created_at', { ascending: false }).limit(300)
  if (rr.error) errores.push(`apify_raw: ${rr.error.message}`)
  const fv = await db.from('cerebro_fichas').select('id, ref, clase, atributo, observado_en, creado_en, provenance_tag, retirada_en').eq('client_id', clientId).is('retirada_en', null).limit(5000)
  if (fv.error) errores.push(`cerebro_fichas: ${fv.error.message}`)
  const vigentes = lista(fv.data).filter((f) => typeof f.ref === 'string' && (f.ref as string).startsWith('brazo:'))
  const filas = lista(rr.data) as unknown as ContextoDeBrazos['filas']
  const sedes = sedesConPunto({ nombreDelCliente: txt(cliente.name), sedes: lista(sd.data).map((s) => ({ id: String(s.id), clave: String(s.clave), ciudad: String(s.ciudad) })), datos: lista(da.data).map((d) => ({ sede_id: d.sede_id as string, campo: String(d.campo), valor_texto: (d.valor_texto as string) ?? null, observado_en: (d.observado_en as string) ?? null })), config: cliente.config, filas })
  const hace7 = ahora.getTime() - 7 * DIA_EN_MS
  const ubicadas = new Set<string>()
  for (const f of filas) {
    const m = String(obj(f.params)._brazo ?? '').match(/^sede:([a-z0-9-]+):ubicar$/)
    if (m && new Date(f.created_at).getTime() >= hace7) ubicadas.add(m[1])
  }
  return { sedes, filas, vigentes, delSistema: competidoresDelSistema(vigentes), ubicadasRecientemente: ubicadas, errores }
}

/** ¿esta sede ya se evaluó hace menos de 30 días? (la fecha sale de las fichas de evaluación vigentes) */
export function ultimaEvaluacion(vigentes: Fila[], sede: string): Date | null {
  let max = 0
  for (const f of vigentes) {
    if (f.clase !== 'competidor_vigilado' && f.clase !== 'competidor_evaluacion') continue
    const d = obj(obj(f.provenance_tag).datos)
    if (txt(d.sede) !== sede) continue
    const t = Date.parse(txt(f.observado_en) || txt(f.creado_en))
    if (Number.isFinite(t) && t > max) max = t
  }
  return max ? new Date(max) : null
}
export const debeEvaluarse = (vigentes: Fila[], sede: string, ahora: Date, forzar = false): boolean => {
  if (forzar) return true
  const u = ultimaEvaluacion(vigentes, sede)
  return !u || ahora.getTime() - u.getTime() >= DIAS_ENTRE_EVALUACIONES * DIA_EN_MS
}

export interface EntradaDeSistematica {
  ctx: ContextoDeBrazos
  client_id: string
  nombreDelCliente: string
  rubro: string | null
  config: unknown
  ahora: Date
  llamarModelo?: (instruccion: string, mensaje: string) => Promise<RespuestaDeLlamada>
  /** lo que queda del tope del día para el juez */
  presupuestoUsd: number
  forzar?: boolean
}
export interface ResultadoDeSistematica {
  fichas: FichaDeBrazo[]
  retiros: RetiroDeBrazo[]
  por_sede: Record<string, { estado: 'evaluada' | 'al_dia' | 'sin_candidatos' | 'sin_modelo' | 'no_aplica' | 'fallo'; candidatos: number; competidores: number; costo_usd: number; detalle?: string; descartados?: number }>
  costo_usd: number
  declarado: string[]
}

export async function descubrirYJuzgar(e: EntradaDeSistematica): Promise<ResultadoDeSistematica> {
  const out: ResultadoDeSistematica = { fichas: [], retiros: [], por_sede: {}, costo_usd: 0, declarado: [] }
  const familias = familiasDelRubro(e.rubro)
  const ap = obj(obj(e.config).apify)
  const listaDelAlta = Array.isArray(ap.competitor_list) ? (ap.competitor_list as Array<Record<string, unknown>>) : []
  const iso = e.ahora.toISOString()
  const hasta = new Date(e.ahora.getTime() + VIGENCIA_DIAS * DIA_EN_MS).toISOString()
  let gastado = 0
  if (!e.ctx.sedes.length) out.declarado.push('el cliente no tiene sedes: la competencia por sede no aplica')
  for (const sede of e.ctx.sedes) {
    const radio = radioDe(familias, sede.tipo)
    if (radio === null) { out.por_sede[sede.clave] = { estado: 'no_aplica', candidatos: 0, competidores: 0, costo_usd: 0, detalle: 'el rubro no compite por cercanía en esta sede' }; continue }
    if (!debeEvaluarse(e.ctx.vigentes, sede.clave, e.ahora, e.forzar)) { out.por_sede[sede.clave] = { estado: 'al_dia', candidatos: 0, competidores: 0, costo_usd: 0, detalle: `evaluada hace menos de ${DIAS_ENTRE_EVALUACIONES} días` }; continue }
    const c: ResultadoDeCandidatos = candidatosDeSede({ sede, filas: e.ctx.filas, nombreDelCliente: e.nombreDelCliente, familias, radioKm: radio, listaDelAlta })
    if (!c.candidatos.length) { out.por_sede[sede.clave] = { estado: 'sin_candidatos', candidatos: 0, competidores: 0, costo_usd: 0, descartados: c.descartados.length, detalle: c.corrida ? 'la corrida de posición no dejó candidatos' : 'todavía no hay corrida de posición para esta sede' }; continue }
    if (!e.llamarModelo) { out.por_sede[sede.clave] = { estado: 'sin_modelo', candidatos: c.candidatos.length, competidores: 0, costo_usd: 0, descartados: c.descartados.length, detalle: 'en seco no se llama al modelo: se muestran los candidatos que se juzgarían' }; continue }
    const j: ResultadoDelJuicioDeSede = await juzgarCompetenciaDeSede({ sede, radioKm: radio, negocio: e.nombreDelCliente, rubro: e.rubro, candidatos: c.candidatos, llamar: e.llamarModelo, topeDeGastoUsd: e.presupuestoUsd - gastado })
    gastado += j.costo_usd
    out.costo_usd = Math.round(gastado * 1e6) / 1e6
    const competidores = j.juicios.filter((x) => x.veredicto === 'competidor')
    out.por_sede[sede.clave] = { estado: j.fallo ? 'fallo' : 'evaluada', candidatos: c.candidatos.length, competidores: competidores.length, costo_usd: j.costo_usd, descartados: c.descartados.length, ...(j.fallo ? { detalle: j.fallo } : {}) }
    if (j.fallo) { out.declarado.push(`${sede.clave}: el agente no pudo juzgar (${j.fallo}); no se retiró nada`); continue }
    const decididos = j.juicios.some((x) => x.decidido_por === 'modelo')
    for (const x of j.juicios) {
      const cand = x.candidato
      const vigilado = x.veredicto === 'competidor'
      const datos = { nombre: cand.nombre, slug: cand.slug, sede: sede.clave, web: cand.web, tipo: cand.tipo_del_alta ?? 'direct', place_id: cand.place_id, veredicto: x.veredicto, origen: cand.origen, evaluado_en: iso }
      out.fichas.push({
        brazo: 'competencia', alcance: 'competidor', client_id: e.client_id,
        ref: `brazo:competencia:${cand.slug}:${vigilado ? 'vigilado' : 'evaluacion'}:${sede.clave}:${iso.slice(0, 10)}`, atributo: `competidor:${cand.slug}:${vigilado ? 'vigilado' : 'evaluacion'}:${sede.clave}`,
        clase: vigilado ? 'competidor_vigilado' : 'competidor_evaluacion', titulo: `${vigilado ? 'Competidor vigilado' : 'Evaluado: no compite'} · ${cand.nombre} · sede ${sede.clave}`,
        contenido: vigilado
          ? `«${cand.nombre}» (competidor) compite con la sede ${sede.clave}: ${x.razon || 'sin razón escrita'}${x.cita ? ` (cita: «${x.cita}»)` : ''}. Descubierto por el sistema y juzgado por el agente el ${iso.slice(0, 10)}; se vigila sin esperar al dueño, que puede vetarlo. Dato de un competidor, no del cliente.`
          : `«${cand.nombre}» (posible competidor) ${x.veredicto === 'no' ? 'NO compite' : 'queda en duda'} con la sede ${sede.clave}: ${x.razon || x.degradada_por || 'sin razón escrita'}${x.cita ? ` (cita: «${x.cita}»)` : ''}. Evaluado el ${iso.slice(0, 10)}. Dato de un tercero, no del cliente.`,
        origen: 'tercero', fuente_url: cand.url, fecha_fuente: iso.slice(0, 10), observado_en: iso, vigente_hasta: hasta, decision: 'reemplaza', sobre: cand.nombre, datos,
      })
    }
    // los que dejaron de competir se retiran con su motivo: el agente dijo «no» (con cita), o el filtro de código los descartó por cerrado, lejos o sin reseñas
    if (decididos) {
      const nuevosVigilados = new Set(competidores.map((x) => x.candidato.slug))
      const dijoNo = new Map(j.juicios.filter((x) => x.veredicto === 'no').map((x) => [x.candidato.slug, x.razon]))
      const filtrados = new Map(c.descartados.map((d) => [slugDe(d.nombre), d.por_que]))
      for (const f of e.ctx.vigentes) {
        if (f.clase !== 'competidor_vigilado') continue
        const d = obj(obj(f.provenance_tag).datos)
        if (txt(d.sede) !== sede.clave) continue
        const slug = txt(d.slug)
        if (nuevosVigilados.has(slug)) continue
        const motivo = dijoNo.has(slug) ? `reevaluación ${iso.slice(0, 10)}: el agente dijo que ya no compite (${dijoNo.get(slug) || 'sin razón escrita'})` : filtrados.has(slug) && /cerrado|fuera del radio|menos de/.test(String(filtrados.get(slug))) ? `reevaluación ${iso.slice(0, 10)}: ${filtrados.get(slug)}` : null
        if (motivo) out.retiros.push({ client_id: e.client_id, atributo: `competidor:${slug}:vigilado:${sede.clave}`, motivo })
      }
    }
  }
  return out
}
