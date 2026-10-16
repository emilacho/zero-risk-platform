/**
 * ALIMENTAR UN CLIENTE · el ciclo del portero con lo que YA se trajo de Apify (`apify_raw`): unidades → filtrar → razonar → archivar. Recibe la base y el modelo por parámetro
 * (se prueba con una base falsa y un modelo simulado, US$ 0).
 *  · `dry_run` OBLIGATORIO: con true se calcula y se muestra todo y NO se escribe NADA (ni el rastro); sin dry_run exige `workflow_id` + `workflow_execution_id`;
 *  · APAGADO por interruptor (`PORTERO_ALIMENTAR`): sin él devuelve `apagado` y no lee ni escribe;
 *  · el modelo solo juzga lo que tiene algo vigente con qué reemplazarse; lo demás se SUMA por código (no hay nada que reemplazar ⇒ no hace falta pagar);
 *  · un error de lectura se DICE: nunca se lee como «no hay nada».
 */
import { enTandas } from './tandas'
import { propiosDeFicha } from '../manual/cliente'
import { TRANSITORIOS_COMUNES, transitoriosDe, varianteDelCliente, type Interruptores } from './datos'
import { MAX_LLAMADAS_DEL_JUEZ_POR_DIA, TOPE_DE_GASTO_DEL_JUEZ_POR_LLAMADA_USD, TOPE_DEL_PORTERO_USD } from './datos'
import { filtrar, type ContextoDelCliente } from './filtro'
import { fichaPropiaDeMapas } from './mapas-propia'
import { juzgar, type DecisionDelJuez, type ItemParaJuzgar, type RespuestaDeLlamada } from './juez'
import { planDeArchivo, type PlanDeArchivo } from './archivar'
import { unidadesDeRaspados, type FilaCruda, type Unidad } from './unidades'
import { correrBrazos, hayBrazoActivo, type BrazosActivos, type ResultadoDeBrazos } from './brazos'
import { archivarFichasDeBrazos } from './brazos/archivo'
import { cargarEntradaDelResumen, fichasDeResumen } from './resumen-vivo'
import { pulirResumen, topeDelPulido } from './resumen-pulido'
import { idDeZona, paisIsoDe } from '../cerebro/zona'
import { leerTodas } from './paginar'
import { claveDeAlcance, sedesDeFicha, sedesDeLaFuente, tipoDeFuenteDeUnidad } from './sedes-fuentes'

/** las fichas de zona (`zona:ec`) que le tocan al cliente por su país */
const zonasDelCliente = (c: Record<string, unknown>): string[] => { const iso = paisIsoDe(c.country ?? c.pais, c.market); return iso ? [idDeZona(iso)] : [] }

export type Db = { from(tabla: string): any }
type Fila = Record<string, unknown>
const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])
const esObjeto = (v: unknown): v is Fila => typeof v === 'object' && v !== null && !Array.isArray(v)
const MAX_FILAS_DE_RASPADO = 400
const hostDe = (u: string): string => { try { return new URL(u.includes('://') ? u : `https://${u}`).host.replace(/^www\./, '').toLowerCase() } catch { return '' } }

export interface EntradaDeAlimentar {
  db: Db
  client_id: string
  dry_run: boolean
  interruptores: Interruptores
  /** (instrucción, mensaje) → respuesta del modelo con su costo; se inyecta (simulado en pruebas) */
  llamarModelo?: (instruccion: string, mensaje: string) => Promise<RespuestaDeLlamada>
  /** el agente del roster que pule el resumen vivo (15-oct): (tarea) → texto + costo; ausente = el resumen queda por código */
  pulirResumen?: (tarea: string, opciones?: { topeUsd?: number }) => Promise<{ texto: string; costo_usd: number }>
  ahora?: Date
  forzar?: boolean
  /** el despertar con el raspado del alta (15-oct): procesa lo que ya hay en `apify_raw` hasta `ahora`, deja el rastro como tipo «despertar» y NO bloquea la corrida diaria del mismo día */
  despertar?: boolean
  gasto_de_hoy_usd?: number
  workflow_id?: string
  workflow_execution_id?: string
  nuevoId?: () => string
  /** los nuevos brazos (15-oct): APAGADOS por omisión; con alguno encendido archivan SUS fichas aparte (sin modelo) y lo dicen en `brazos` */
  brazos?: BrazosActivos
  /** variables del servidor (las llaves del cliente); por omisión `process.env` */
  env?: Record<string, string | undefined>
  /** `fetch` para los lectores de las llaves del cliente (se simula en pruebas) */
  fetch?: Parameters<typeof correrBrazos>[0]['fetch']
}
export interface ResultadoDeAlimentar {
  ok: boolean
  estado: 'apagado' | 'hecha' | 'con_errores' | 'ya_corrio_hoy' | 'cliente_inexistente' | 'lectura_fallida'
  dry_run: boolean
  detalle?: string
  unidades: number
  filtro: { propias: number; sin_confirmar: number; ajenas: number; ruido: number; repetidas: number }
  juez: { items: number; llamadas: number; costo_usd: number; omitidos_por_tope: number; fallas: string[]; sumadas_por_codigo: number }
  plan: PlanDeArchivo | null
  decisiones: Array<{ fuente: string; unidad: string; decision: string; razon: string; cita: string | null; decidido_por: string; degradada_por?: string }>
  gasto: { modelo_usd: number; hoy_antes_usd: number; tope_usd: number; supero_el_tope: boolean }
  escrituras: { fichas: number; retiradas: number; vistas: number; corrida: number }
  errores: string[]
  /** lo que hicieron los nuevos brazos (ausente = ninguno encendido) */
  brazos?: ResultadoDeBrazos
  /** asignaciones de fuente a sede que no corresponden a ninguna sede del cliente (se dicen; la fuente queda en «todas») */
  declarado_sedes?: string[]
  /** el resumen vivo (ausente = apagado) */
  resumen_vivo?: { secciones: Record<string, number>; huecos: string[]; escritas: number; iguales: number; retiradas: number; pulido?: { usado: boolean; motivo: string; agente: string; costo_usd: number; lineas_originales: number; lineas_conservadas: number; descartadas: number; citas_originales: number; citas_conservadas: number; tope_usd: number; tope_subido: boolean; paso_del_tope_base: boolean } }
}

const vacio = (dry_run: boolean): ResultadoDeAlimentar => ({
  ok: false, estado: 'lectura_fallida', dry_run, unidades: 0, filtro: { propias: 0, sin_confirmar: 0, ajenas: 0, ruido: 0, repetidas: 0 },
  juez: { items: 0, llamadas: 0, costo_usd: 0, omitidos_por_tope: 0, fallas: [], sumadas_por_codigo: 0 }, plan: null, decisiones: [],
  gasto: { modelo_usd: 0, hoy_antes_usd: 0, tope_usd: TOPE_DEL_PORTERO_USD, supero_el_tope: false }, escrituras: { fichas: 0, retiradas: 0, vistas: 0, corrida: 0 }, errores: [],
})

/** el contexto del cliente para reconocerlo: nombre entero, ubicación, cuentas, dominios y teléfonos de SU ficha */
const SIN_VALOR = new Set(['para', 'con', 'del', 'las', 'los', 'una', 'uno', 'por', 'sus', 'que', 'sin', 'desde', 'entre', 'sobre', 'cerca', 'bien'])
/** las palabras con sentido del rubro de la ficha (≥ 4 letras, sin conectores): contexto para confirmar un nombre común, nunca identidad */
export function palabrasDelRubro(industria: unknown): string[] {
  const t = typeof industria === 'string' ? industria : ''
  return [...new Set(t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !SIN_VALOR.has(w)))]
}

export function contextoDelCliente(c: Fila, sedes: Fila[]): ContextoDelCliente {
  const cfg = (c.config && typeof c.config === 'object' ? c.config : {}) as Record<string, unknown>
  const ap = (cfg.apify && typeof cfg.apify === 'object' ? cfg.apify : {}) as Record<string, unknown>
  const own = (ap.own_handles && typeof ap.own_handles === 'object' ? ap.own_handles : {}) as Record<string, unknown>
  const handles = Object.values(own).filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.replace(/^@/, '').replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, ''))
  const ubic = new Set<string>()
  for (const s of sedes) { for (const k of ['ciudad', 'clave']) if (typeof s[k] === 'string' && (s[k] as string).trim()) ubic.add(String(s[k]).trim()) }
  for (const k of ['city', 'ciudad', 'location']) if (typeof c[k] === 'string' && (c[k] as string).trim()) ubic.add(String(c[k]).trim())
  const dominios = [typeof c.website_url === 'string' ? hostDe(c.website_url) : ''].filter(Boolean)
  const tel = [cfg.phone, cfg.telefono, c.phone].filter((v): v is string => typeof v === 'string')
  return { nombre: String(c.name ?? '').trim(), ubicacion: [...ubic], handles, dominios, telefonos: tel, rubro: palabrasDelRubro(c.industry ?? c.rubro) }
}

/** escrituras a la base a la vez (cada una es un viaje de ~0,1 s) */
const ESCRITURAS_A_LA_VEZ = 12

export async function alimentarCliente(e: EntradaDeAlimentar): Promise<ResultadoDeAlimentar> {
  const r = vacio(e.dry_run)
  if (!e.interruptores.alimentar) return { ...r, ok: true, estado: 'apagado', detalle: 'PORTERO_ALIMENTAR está apagado: no se leyó ni se escribió nada' }
  const ahora = e.ahora ?? new Date()
  const dia = ahora.toISOString().slice(0, 10)
  const falla = (que: string, m: string): ResultadoDeAlimentar => ({ ...r, estado: 'lectura_fallida', detalle: `${que}: ${m}` })

  const cl = await e.db.from('clients').select('*').eq('id', e.client_id).limit(1)
  if (cl.error) return falla('clients', cl.error.message)
  const cliente = lista(cl.data)[0]
  if (!cliente) return { ...r, estado: 'cliente_inexistente', detalle: 'no existe la ficha del cliente' }

  const ya = await e.db.from('cerebro_portero_corridas').select('id, resumen').eq('client_id', e.client_id).eq('dia', dia).limit(1)
  if (ya.error) return falla('cerebro_portero_corridas', ya.error.message)
  const corridaDeHoy = lista(ya.data)[0]
  // una fila de hoy que es solo el DESPERTAR no cuenta como la corrida diaria: esa sigue pudiendo correr y la reemplaza
  const esDelDespertar = !!corridaDeHoy && !!corridaDeHoy.resumen && typeof corridaDeHoy.resumen === 'object' && (corridaDeHoy.resumen as Fila).tipo === 'despertar'
  if (corridaDeHoy && !e.forzar && !esDelDespertar) return { ...r, ok: true, estado: 'ya_corrio_hoy', detalle: 'ya hay una corrida de hoy para este cliente (forzar la repite)' }

  let consultaRaspado = e.db.from('apify_raw').select('id, apify_function, params, respuesta, ensayo, metadata, created_at').eq('client_id', e.client_id).eq('ensayo', false)
  if (e.despertar) consultaRaspado = consultaRaspado.lte('created_at', ahora.toISOString()) // el despertar mira el raspado que YA existe a esa hora
  const rr = await consultaRaspado.order('created_at', { ascending: false }).limit(MAX_FILAS_DE_RASPADO)
  if (rr.error) return falla('apify_raw', rr.error.message)
  const sd = await e.db.from('client_sedes').select('ciudad, clave').eq('client_id', e.client_id)
  if (sd.error) return falla('client_sedes', sd.error.message)
  const vv = await leerTodas(() => e.db.from('cerebro_unidades_vistas').select('fuente, unidad_ref, huella, veredicto').eq('client_id', e.client_id).order('id', { ascending: true }))
  if (vv.error) return falla('cerebro_unidades_vistas', vv.error.message)
  const fv = await leerTodas(() => e.db.from('cerebro_fichas').select('id, atributo, contenido, fecha_fuente, observado_en, creado_en, retirada_en, prueba, provenance_tag, sede').eq('client_id', e.client_id).is('retirada_en', null).order('id', { ascending: true }))
  if (fv.error) return falla('cerebro_fichas', fv.error.message)

  const cfg = (cliente.config ?? {}) as { registro?: string; idioma?: { registro?: string }; apify?: { url_reparto?: unknown } }
  const variante = varianteDelCliente({ registro: cfg.registro ?? cfg.idioma?.registro, pais: ((cliente.country ?? cliente.pais) as string | null) ?? null })
  const patrones = transitoriosDe(variante) ?? TRANSITORIOS_COMUNES
  const reparto = Array.isArray(cfg.apify?.url_reparto) ? (cfg.apify!.url_reparto as unknown[]).filter((u): u is string => typeof u === 'string') : []
  const propios = propiosDeFicha(cliente as never)
  const ctx = contextoDelCliente(cliente, lista(sd.data))

  const unidades = unidadesDeRaspados(lista(rr.data) as unknown as FilaCruda[], { propios, hostsDeReparto: reparto.map(hostDe).filter(Boolean), transitorios: patrones, fichaDeMapas: (items) => fichaPropiaDeMapas(items, ctx).ficha })
  r.unidades = unidades.length
  // las cifras (fuente «metrica») NO se descartan por «ya vista»: si el valor vuelve a uno anterior (26 → 50 → 26) tiene que reemplazar al vigente; lo que no cambió lo ve «mismo dato» más abajo
  const vistas = new Set(lista(vv.data).filter((v) => v.fuente !== 'metrica').map((v) => `${v.fuente}|${v.unidad_ref}|${v.huella}`))
  const f = filtrar(unidades, ctx, vistas, patrones)
  r.filtro = { propias: f.propias.length, sin_confirmar: f.sin_confirmar.length, ajenas: f.descartadas.filter((d) => d.estado === 'ajeno').length, ruido: f.descartadas.filter((d) => d.estado === 'ruido').length, repetidas: f.descartadas.filter((d) => d.estado === 'repetida').length }

  // la SEDE de cada unidad (dato `config.apify.fuentes_por_sede`): un cliente de una sola sede, o una fuente sin asignación, queda en «todas» y todo funciona como antes
  const clavesDeSedes = lista(sd.data).map((s) => String(s.clave ?? '')).filter(Boolean)
  const declaradoSedes = new Set<string>()
  for (const u of f.propias) {
    const t = tipoDeFuenteDeUnidad(u)
    if (!t) continue
    const a = sedesDeLaFuente(cliente.config, t.tipo, t.detalle, clavesDeSedes)
    if (a.sedes) u.sedes = a.sedes
    a.declarado.forEach((d) => declaradoSedes.add(d))
  }
  r.declarado_sedes = [...declaradoSedes]

  // lo vigente de cada atributo, DENTRO de su sede (la ficha viva más nueva de ese atributo en esa sede; sin sede = todas las sedes)
  const vigentePorAtributo = new Map<string, { ficha_id: string; texto: string; fecha: string | null; atributo: string | null }>()
  for (const x of lista(fv.data).filter((v) => v.prueba !== true).sort((a, b) => (String(a.creado_en) < String(b.creado_en) ? -1 : 1))) {
    if (typeof x.atributo === 'string' && x.atributo) vigentePorAtributo.set(`${claveDeAlcance(sedesDeFicha(x.provenance_tag) ?? (typeof x.sede === 'string' && x.sede ? x.sede.split(',') : null))}|${x.atributo}`, { ficha_id: String(x.id), texto: String(x.contenido ?? ''), fecha: (x.fecha_fuente ?? x.observado_en ?? x.creado_en ?? null) as string | null, atributo: x.atributo })
  }
  // una ficha de otra sede NUNCA es «lo vigente» de esta; la que no tiene sede (anterior a la asignación) sí la adopta la primera lectura con sede
  const vigenteDe = (u: Unidad) => (u.atributo ? vigentePorAtributo.get(`${claveDeAlcance(u.sedes)}|${u.atributo}`) ?? (u.sedes?.length ? vigentePorAtributo.get(`|${u.atributo}`) : undefined) ?? null : null)

  const aJuzgar: Array<{ unidad: Unidad; item: ItemParaJuzgar }> = []
  const porCodigo: Array<{ unidad: Unidad; item: ItemParaJuzgar }> = []
  f.propias.forEach((u, i) => {
    const item: ItemParaJuzgar = { n: i + 1, unidad_clave: `${u.fuente}|${u.unidad_ref}`, fuente: u.fuente, autoria: u.autoria, clase_dato: u.clase_dato, atributo: u.atributo, texto: u.texto, fecha: u.fecha_fuente ?? u.observado_en, vigente: vigenteDe(u) }
    // mismo dato que lo vigente ⇒ no hay cambio: se renueva, no se juzga
    if (item.vigente && item.vigente.texto === u.texto) return
    // algo vigente con qué reemplazarse ⇒ el modelo razona; si no hay nada que reemplazar ⇒ se SUMA por código; las CIFRAS (puntaje, seguidores…) se reemplazan por código, sin modelo
    ;(item.vigente && u.clase_dato === 'atributo' && u.fuente !== 'metrica' ? aJuzgar : porCodigo).push({ unidad: u, item })
  })

  const gastoAntes = Math.max(0, e.gasto_de_hoy_usd ?? 0)
  let decisionesDelJuez: DecisionDelJuez[] = []
  if (aJuzgar.length) {
    const llamar = e.llamarModelo
    const j = await juzgar(aJuzgar.map((x) => x.item), llamar ?? (async () => { throw new Error('no hay modelo configurado') }), {
      maxLlamadas: llamar ? MAX_LLAMADAS_DEL_JUEZ_POR_DIA : 0,
      topeDeGastoUsd: Math.max(0, Math.min(TOPE_DE_GASTO_DEL_JUEZ_POR_LLAMADA_USD * MAX_LLAMADAS_DEL_JUEZ_POR_DIA, TOPE_DEL_PORTERO_USD - gastoAntes)),
    })
    decisionesDelJuez = j.decisiones
    r.juez = { items: aJuzgar.length, llamadas: j.llamadas, costo_usd: j.costo_usd, omitidos_por_tope: j.omitidos_por_tope, fallas: j.fallas, sumadas_por_codigo: porCodigo.length }
  } else r.juez.sumadas_por_codigo = porCodigo.length

  // orden final: primero lo juzgado, luego lo sumado por código (decisión de sistema/regla)
  const items = [...aJuzgar, ...porCodigo]
  const decisiones: DecisionDelJuez[] = [
    ...decisionesDelJuez,
    // una cifra con valor nuevo REEMPLAZA a la vigente por código (la vieja queda archivada con su fecha: sirve para la tendencia)
    ...porCodigo.map(({ item }): DecisionDelJuez => item.fuente === 'metrica' && item.vigente ? { n: item.n, decision: 'reemplaza', reemplaza_ficha: item.vigente.ficha_id, razon: 'cifra: el valor nuevo reemplaza al anterior', cita: null, decidido_por: 'sistema' } : { n: item.n, decision: 'suma', reemplaza_ficha: null, razon: item.vigente ? 'sin cambio de atributo' : 'dato nuevo: no hay nada vigente que reemplazar', cita: null, decidido_por: 'sistema' }),
  ]
  const plan = planDeArchivo({ client_id: e.client_id, items, decisiones, descartadas: f.descartadas, sin_confirmar: f.sin_confirmar, ahora, puente_al_indice: e.interruptores.puente_al_indice, nuevoId: e.nuevoId })
  r.plan = plan
  r.decisiones = items.map(({ unidad }, i) => ({ fuente: unidad.fuente, unidad: unidad.unidad_ref.slice(0, 80), decision: decisiones[i].decision, razon: decisiones[i].razon, cita: decisiones[i].cita, decidido_por: decisiones[i].decidido_por, ...(decisiones[i].degradada_por ? { degradada_por: decisiones[i].degradada_por } : {}) }))
  r.gasto = { modelo_usd: r.juez.costo_usd, hoy_antes_usd: gastoAntes, tope_usd: TOPE_DEL_PORTERO_USD, supero_el_tope: gastoAntes + r.juez.costo_usd > TOPE_DEL_PORTERO_USD }

  // ───── los nuevos brazos (apagados por omisión): archivan SUS fichas aparte, por código; sus errores no tumban el ciclo normal pero SE DICEN
  if (hayBrazoActivo(e.brazos)) {
    r.brazos = await correrBrazos({
      db: e.db, brazos: e.brazos as BrazosActivos, cliente, client_id: e.client_id, filas: lista(rr.data) as never, ahora, dry_run: e.dry_run, env: e.env, fetch: e.fetch,
      ciudad: (lista(sd.data)[0]?.ciudad as string | undefined) ?? null, workflow_id: e.workflow_id, workflow_execution_id: e.workflow_execution_id, nuevoId: e.nuevoId,
      llamarModelo: e.llamarModelo, presupuestoUsd: Math.max(0, Math.min(0.16, TOPE_DEL_PORTERO_USD - gastoAntes - r.juez.costo_usd)),
    })
    r.errores.push(...r.brazos.errores.map((m) => `brazos: ${m}`))
    // el modelo de los brazos (el juez de competencia por sede) cuenta en el gasto del portero
    if (r.brazos.costo_modelo_usd) r.gasto = { ...r.gasto, modelo_usd: Math.round((r.gasto.modelo_usd + r.brazos.costo_modelo_usd) * 1e6) / 1e6 }
  }

  // ───── el resumen vivo (apagado por omisión): se reescribe por CÓDIGO desde las fichas vivas, sin modelo; sus errores se DICEN
  if (e.interruptores.resumen_vivo) {
    try {
      const ent = await cargarEntradaDelResumen(e.db, { client_id: e.client_id, nombre: (cliente.name as string | null) ?? null, rubro: (cliente.industry as string | null) ?? null, ahora, zonas: zonasDelCliente(cliente), sedes: lista(sd.data).map((s) => ({ clave: String(s.clave ?? ''), ciudad: (s.ciudad as string | null) ?? null })).filter((s) => s.clave) })
      if (!ent.ok) r.errores.push(`resumen vivo: ${ent.detalle}`)
      else {
        const sal = fichasDeResumen(ent.entrada)
        // el pulido (apagado por omisión): DESPUÉS del armado, sin agregar hechos; cualquier falla deja el armado por código
        let pulido: NonNullable<ResultadoDeAlimentar['resumen_vivo']>['pulido']
        if (e.interruptores.resumen_pulido && e.pulirResumen && !e.dry_run) {
          const tope = await topeDelPulido(e.db, e.client_id, ahora)
          // el agente ve los CANDIDATOS de «Quién es»; si no sirve, queda el armado por código (el respaldo)
          const pr = await pulirResumen(sal.texto_para_el_agente, { llamarAgente: e.pulirResumen, topeUsd: tope.tope_usd }, sal.cliente.contenido)
          pulido = { usado: pr.usado, motivo: pr.motivo, agente: pr.agente, costo_usd: pr.costo_usd, lineas_originales: pr.lineas_originales, lineas_conservadas: pr.lineas_conservadas, descartadas: pr.descartadas.length, citas_originales: pr.citas_originales, citas_conservadas: pr.citas_conservadas, tope_usd: tope.tope_usd, tope_subido: tope.subido, paso_del_tope_base: pr.paso_del_tope_base === true }
          if (pr.usado) { sal.cliente.contenido = pr.texto; sal.cliente.datos = { ...(sal.cliente.datos ?? {}), pulido_por: pr.agente } }
          if (pr.costo_usd) r.gasto = { ...r.gasto, modelo_usd: Math.round((r.gasto.modelo_usd + pr.costo_usd) * 1e6) / 1e6 }
        }
        const ar = await archivarFichasDeBrazos({ db: e.db, fichas: [sal.cliente, ...sal.sedes], ahora, dry_run: e.dry_run, workflow_id: e.workflow_id, workflow_execution_id: e.workflow_execution_id, nuevoId: e.nuevoId })
        r.resumen_vivo = { secciones: sal.secciones, huecos: sal.huecos, escritas: ar.escritas, iguales: ar.iguales, retiradas: ar.retiradas, ...(pulido ? { pulido } : {}) }
        r.errores.push(...ar.errores.map((m) => `resumen vivo: ${m}`))
      }
    } catch (err) { r.errores.push(`resumen vivo: ${err instanceof Error ? err.message.slice(0, 120) : 'falló'}`) }
  }

  if (e.dry_run) return { ...r, ok: true, estado: 'hecha' }

  // ───── escribir (sin dry_run). Un error de escritura se junta y se DICE; no se esconde.
  const w = async (p: Promise<{ error: { message: string } | null }>, que: string) => { const x = await p; if (x.error) r.errores.push(`${que}: ${x.error.message}`); return !x.error }
  const origenes = [...new Set(plan.fichas.map((x) => x.origen))]
  const ingresoDe = new Map<string, string>()
  for (const o of origenes) {
    const id = (e.nuevoId ?? (() => crypto.randomUUID()))()
    const ok = await w(e.db.from('cerebro_ingresos').insert({ id, client_id: e.client_id, origen: o, fuente_ref: 'portero-alimentar', es_completa: false, huella: `${dia}:${o}`, material: null, estado: 'fichado', workflow_id: e.workflow_id ?? null, workflow_execution_id: e.workflow_execution_id ?? null }), `ingreso ${o}`)
    if (ok) ingresoDe.set(o, id)
  }
  await enTandas(plan.fichas, ESCRITURAS_A_LA_VEZ, async (x) => {
    const ingreso = ingresoDe.get(x.origen)
    if (!ingreso) return
    const fila = {
      id: x.id, client_id: x.client_id, ingreso_id: ingreso, ref: x.ref, clase: x.clase, titulo: x.titulo, que_es: x.que_es, contenido: x.contenido, origen: x.origen, fecha_fuente: x.fecha_fuente,
      reconfirmado_en: x.reconfirmado_en, plazo: x.plazo, vigente_hasta: x.vigente_hasta, version_de: x.version_de, huella: x.huella, propiedad: x.propiedad, porque: x.porque, juzgado_por: x.juzgado_por,
      provenance_tag: x.provenance_tag, fuente_url: x.fuente_url, observado_en: x.observado_en, atributo: x.atributo, sede: x.sede, decision: x.decision, razon_de_decision: x.razon_de_decision,
      // lo que no se pudo decidir o confirmar se archiva pero NO se entrega
      descartada: !x.entregable, motivo_descarte: x.entregable ? null : x.porque || 'sin confirmar',
    }
    if (await w(e.db.from('cerebro_fichas').insert(fila), `ficha ${x.ref}`)) r.escrituras.fichas++
  })
  await enTandas(plan.retiros, ESCRITURAS_A_LA_VEZ, async (t) => {
    if (await w(e.db.from('cerebro_fichas').update({ retirada_en: ahora.toISOString(), motivo_retirada: t.motivo_retirada, reemplazada_por: t.reemplazada_por }).eq('id', t.id).eq('client_id', e.client_id), `retiro ${t.id}`)) r.escrituras.retiradas++
  })
  // las vistas son una fila por unidad de TODO el historial leído: crecen con los meses y una por una (2 viajes cada una) pasó de 120 s. En paralelo acotado y sin claves repetidas (si no, dos escritores a la vez insertarían dos veces).
  const vistasUnicas = [...new Map(plan.vistas.map((v) => [`${v.fuente}|${v.unidad_ref}|${v.huella}`, v])).values()]
  await enTandas(vistasUnicas, ESCRITURAS_A_LA_VEZ, async (v) => {
    const ex = await e.db.from('cerebro_unidades_vistas').select('id').eq('client_id', v.client_id).eq('fuente', v.fuente).eq('unidad_ref', v.unidad_ref).eq('huella', v.huella).limit(1)
    if (ex.error) { r.errores.push(`vistas: ${ex.error.message}`); return }
    const hay = lista(ex.data)[0]
    const ok = hay ? await w(e.db.from('cerebro_unidades_vistas').update({ ultima_vez: v.ultima_vez, veredicto: v.veredicto }).eq('id', String(hay.id)), 'vista') : await w(e.db.from('cerebro_unidades_vistas').insert({ ...v, ficha_id: v.ficha_id }), 'vista')
    if (ok) r.escrituras.vistas++
  })
  const estado = r.errores.length ? 'con_errores' : 'hecha'
  // la corrida que reemplaza al despertar CIERRA lo que el despertar dejó pendiente (qué pidió y desde cuándo) para que `listo` pueda declarar los huecos
  const previo = corridaDeHoy && esObjeto(corridaDeHoy.resumen) ? (corridaDeHoy.resumen as Fila).despertar : null
  const arrastreDelDespertar = !e.despertar && esObjeto(previo) ? { despertar: { ...previo, completado_en: ahora.toISOString() } } : {}
  const rastro = { client_id: e.client_id, dia, estado, resumen: { ...(e.despertar ? { tipo: 'despertar' } : {}), ...arrastreDelDespertar, ...(r.declarado_sedes?.length ? { declarado_sedes: r.declarado_sedes } : {}), unidades: r.unidades, filtro: r.filtro, juez: r.juez, plan: plan.resumen, escrituras: r.escrituras, errores: r.errores, ...(r.resumen_vivo ? { resumen_vivo: r.resumen_vivo } : {}), ...(r.brazos ? { brazos: { activos: r.brazos.activos, por_brazo: r.brazos.por_brazo, archivo: r.brazos.archivo ? { escritas: r.brazos.archivo.escritas, iguales: r.brazos.archivo.iguales, retiradas: r.brazos.archivo.retiradas } : null } } : {}) }, gasto_apify_usd: 0, gasto_modelo_usd: r.gasto.modelo_usd, workflow_id: e.workflow_id ?? null, workflow_execution_id: e.workflow_execution_id ?? null }
  const log = corridaDeHoy ? await e.db.from('cerebro_portero_corridas').update(rastro).eq('id', String(corridaDeHoy.id)) : await e.db.from('cerebro_portero_corridas').insert(rastro)
  if (log.error) r.errores.push(`rastro: ${log.error.message}`); else r.escrituras.corrida = 1
  return { ...r, ok: r.errores.length === 0, estado: r.errores.length ? 'con_errores' : 'hecha' }
}
