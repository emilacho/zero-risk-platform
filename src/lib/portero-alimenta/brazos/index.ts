/**
 * LOS NUEVOS BRAZOS · punto de entrada (15-oct). Dos cosas, ambas detrás de interruptores APAGADOS:
 *   1. `accionesDeBrazos`  · lo que los brazos PIDEN a Apify hoy (se suma al plan del portero, que lo recorta al tope y a las 16 corridas);
 *   2. `correrBrazos`      · lo que los brazos ARCHIVAN con lo que ya llegó a `apify_raw` (y con las llaves del cliente): se llama desde `alimentar`.
 * Con todos apagados no hace nada: ni lee ni escribe.
 */
import type { Db } from '../alimentar'
import { paisIsoDe } from '../../cerebro/zona'
import { archivarFichasDeBrazos, type ResultadoDeArchivo, type RetiroDeBrazo } from './archivo'
import { accionesDeCompetencia, competidoresConfirmados, competidoresVigilados, fichasDeCompetencia } from './competencia'
import { fichasDeContexto } from './contexto'
import { accionDeDemanda, accionesDeDemandaPorSede, fichasDeDemanda, terminosDeDemanda, type FilaCrudaDeBrazo } from './demanda'
import { familiasDelRubro } from '../../fuentes-publicas/plan'
import { radioDeSede } from './sedes'
import { cargarContextoDeBrazos, descubrirYJuzgar, type ContextoDeBrazos, type ResultadoDeSistematica } from './sistematica'
import type { RespuestaDeLlamada } from '../juez'
import { desfaseDelCliente } from '../zona-horaria'
import { brazoDePropios, leerSnapshot, mesLocalDe, PREFIJO_DE_VENTAS, type Fetch, type SnapshotDeVentas } from './propios'
import { hayBrazoActivo, type AccionDeBrazo, type BrazosActivos, type FichaDeBrazo, type NombreDeBrazo, type ResultadoDeUnBrazo } from './tipos'

export * from './tipos'
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {})
const txt = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')

/** país ISO-2 (minúscula) de la ficha: acepta el código o el nombre; sin dato no se adivina */
export const paisDeLaFicha = (cliente: Record<string, unknown>): string | null => paisIsoDe(cliente.country ?? cliente.pais, cliente.market)

/**
 * tope del PICO de un día de lo que piden los brazos de demanda y competencia. El objetivo firmado (≤ US$ 0,15 por cliente y día) es de PROMEDIO: con los anuncios cada dos semanas y
 * sin cuentas de Instagram ni sitios propios sale ≈ 0,09; con todo (Instagram y sitio en los 10) ≈ 0,19. El pico de un día con dos competidores y anuncios es ≈ 0,36.
 */
export const TOPE_DIARIO_DE_BRAZOS_USD = 0.4

export interface EntradaDeAccionesDeBrazos {
  brazos: BrazosActivos
  cliente: { id: string; name?: string | null; config?: unknown; industry?: string | null; country?: string | null; market?: string | null }
  rubro?: string | null
  ciudad?: string | null
  familias?: string[]
  ahora: Date
  /** sedes con punto, competidores del sistema y ubicaciones ya pedidas (de `cargarContextoDeBrazos`); sin esto, lo de siempre (por ciudad) */
  ctx?: Pick<ContextoDeBrazos, 'sedes' | 'delSistema' | 'ubicadasRecientemente'>
  /** tope del pico del día (por omisión `TOPE_DIARIO_DE_BRAZOS_USD`) */
  topeDiarioUsd?: number
  /** pide la posición por sede AHORA aunque no sea su día (miércoles): una vez, a pedido explícito (`forzar_posicion`) */
  forzarPosicion?: boolean
}
/** lo que los brazos piden hoy · cada acción lleva `_brazo` en `params` para reconocerla al archivar · el total del día no pasa de `TOPE_DIARIO_DE_BRAZOS_USD` */
export function accionesDeBrazos(e: EntradaDeAccionesDeBrazos): { acciones: AccionDeBrazo[]; no_cubiertas: Array<{ fuente: string; por_que: string }> } {
  const acciones: AccionDeBrazo[] = []
  const no_cubiertas: Array<{ fuente: string; por_que: string }> = []
  const mercado = txt(e.cliente.market)
  const familias = e.familias ?? familiasDelRubro(e.rubro ?? e.cliente.industry)
  const sedes = e.ctx?.sedes ?? []
  if (e.brazos.demanda) {
    const t = terminosDeDemanda({ rubro: e.rubro ?? e.cliente.industry, config: e.cliente.config, familias })
    if (sedes.length) {
      const d = accionesDeDemandaPorSede({ ahora: e.ahora, terminos: t, sedes, familias, ubicadasEnLosUltimos7Dias: e.ctx?.ubicadasRecientemente, forzar: e.forzarPosicion === true })
      acciones.push(...d.acciones)
      no_cubiertas.push(...d.no_cubiertas)
    } else {
      const d = accionDeDemanda({ ahora: e.ahora, terminos: t, ciudad: e.ciudad, mercado, forzar: e.forzarPosicion === true })
      if (d.accion) acciones.push(d.accion)
      else if (d.no_cubierta) no_cubiertas.push({ fuente: 'demanda', por_que: d.no_cubierta })
    }
  }
  if (e.brazos.competencia) {
    const c = competidoresVigilados({ config: e.cliente.config, delSistema: e.ctx?.delSistema ?? [] })
    if (c.motivo) no_cubiertas.push({ fuente: 'competencia', por_que: c.motivo })
    else {
      const porSede = Object.fromEntries(sedes.map((s) => [s.clave, { lat: s.lat, lng: s.lng, ciudad: s.ciudad }]))
      const radios = sedes.map((s) => radioDeSede(familias, s)).filter((r): r is number => r !== null)
      acciones.push(...accionesDeCompetencia({ vigilados: c.vigilados, ahora: e.ahora, ciudad: e.ciudad, mercado, pais: paisDeLaFicha(e.cliente as Record<string, unknown>), anunciosCadaSemanas: 2, sedes: porSede, radioKm: radios.length ? Math.max(...radios) : null }))
    }
  }
  // el tope del día: lo que no cabe se DECLARA (el plan del portero lo vuelve a recortar contra su tope y las 16 corridas)
  let suma = 0
  const cabe: AccionDeBrazo[] = []
  for (const a of acciones) {
    const tope = e.topeDiarioUsd ?? TOPE_DIARIO_DE_BRAZOS_USD
    if (suma + a.usd_max > tope + 1e-9) { no_cubiertas.push({ fuente: a.fuente, por_que: `tope diario de los brazos (US$ ${tope.toFixed(2)}): «${a.objetivo}» no cabe hoy` }); continue }
    suma += a.usd_max
    cabe.push(a)
  }
  return { acciones: cabe, no_cubiertas }
}

export interface EntradaDeCorrerBrazos {
  db: Db
  brazos: BrazosActivos
  cliente: Record<string, unknown>
  client_id: string
  filas: FilaCrudaDeBrazo[]
  ahora: Date
  dry_run: boolean
  env?: Record<string, string | undefined>
  fetch?: Fetch
  ciudad?: string | null
  workflow_id?: string
  workflow_execution_id?: string
  nuevoId?: () => string
  /** el modelo del portero (registrado, con workflow): solo lo usa el juez de competencia por sede; sin él (seco) se muestran los candidatos y no se juzga */
  llamarModelo?: (instruccion: string, mensaje: string) => Promise<RespuestaDeLlamada>
  /** lo que queda del tope del día para el juez (por omisión US$ 0,16: dos sedes × el tope de una llamada) */
  presupuestoUsd?: number
  /** vuelve a evaluar las sedes aunque tengan menos de 30 días */
  forzarEvaluacion?: boolean
}
export interface ResultadoDeBrazos {
  activos: NombreDeBrazo[]
  por_brazo: Partial<Record<NombreDeBrazo, { estado: ResultadoDeUnBrazo['estado']; fichas: number; declarado: string[]; detalle?: string }>>
  archivo: ResultadoDeArchivo | null
  errores: string[]
  /** la competencia por sede: qué pasó en cada una (evaluada, al día, sin candidatos, sin modelo…) */
  por_sede?: ResultadoDeSistematica['por_sede']
  costo_modelo_usd?: number
}

export async function correrBrazos(e: EntradaDeCorrerBrazos): Promise<ResultadoDeBrazos> {
  const salida: ResultadoDeBrazos = { activos: [], por_brazo: {}, archivo: null, errores: [] }
  if (!hayBrazoActivo(e.brazos)) return salida
  const cfg = e.cliente.config
  const fichas: FichaDeBrazo[] = []
  const retiros: RetiroDeBrazo[] = []
  const poner = (r: ResultadoDeUnBrazo) => {
    salida.activos.push(r.brazo)
    salida.por_brazo[r.brazo] = { estado: r.estado, fichas: r.fichas.length, declarado: r.declarado, ...(r.detalle ? { detalle: r.detalle } : {}) }
    fichas.push(...r.fichas)
  }
  const nombre = txt(e.cliente.name)
  const familias = familiasDelRubro(txt(e.cliente.industry) || null)
  // una sola carga: sedes con su punto, crudos de Mapas y fichas vigentes de los brazos (solo si hace falta)
  const ctx = e.brazos.demanda || e.brazos.competencia ? await cargarContextoDeBrazos(e.db, e.client_id, e.cliente, e.ahora) : null
  if (ctx?.errores.length) salida.errores.push(...ctx.errores.map((m) => `lectura de los brazos: ${m}`))
  const filas = (ctx && ctx.filas.length ? ctx.filas : e.filas) as unknown as FilaCrudaDeBrazo[]

  if (e.brazos.contexto) {
    const pais = paisDeLaFicha(e.cliente)
    poner(pais ? fichasDeContexto({ pais, ahora: e.ahora }) : { brazo: 'contexto', estado: 'sin_material', detalle: 'la ficha no dice el país: no se adivina', fichas: [], declarado: ['contexto: la ficha del cliente no trae país'] })
  }
  if (e.brazos.demanda) {
    const conocidos = [nombre, ...(Array.isArray(obj(obj(cfg).apify).competitor_list) ? (obj(obj(cfg).apify).competitor_list as unknown[]).map((c) => txt(obj(c).name)) : [])]
    const conSede = (ctx?.sedes ?? []).filter((s) => radioDeSede(familias, s) !== null)
    if (conSede.length) {
      const partes = conSede.map((s) => fichasDeDemanda({ client_id: e.client_id, nombreDelCliente: nombre, filas, ahora: e.ahora, yaConocidos: conocidos, ciudad: s.ciudad, sede: s.clave }))
      const todas = partes.flatMap((p) => p.fichas)
      poner({ brazo: 'demanda', estado: todas.length ? 'listo' : 'sin_material', fichas: todas, declarado: [...new Set(partes.flatMap((p) => p.declarado)), ...conSede.filter((s) => s.lat === null).map((s) => `sede ${s.clave}: sin punto, se miró por el nombre de la ciudad`)], ...(todas.length ? {} : { detalle: 'todavía no hay corrida de posición por sede' }) })
    } else if (ctx?.sedes.length) {
      // tiene sedes pero el rubro no compite por cercanía en ninguna: no aplica por sede (y no se cae a mirar «por ciudad»)
      poner({ brazo: 'demanda', estado: 'sin_material', fichas: [], declarado: ['demanda: el rubro no compite por cercanía en ninguna sede: no aplica por sede'], detalle: 'no aplica por sede' })
    } else poner(fichasDeDemanda({ client_id: e.client_id, nombreDelCliente: nombre, filas, ahora: e.ahora, yaConocidos: conocidos, ciudad: e.ciudad }))
  }
  if (e.brazos.competencia) {
    const sis = ctx
      ? await descubrirYJuzgar({ ctx, client_id: e.client_id, nombreDelCliente: nombre, rubro: txt(e.cliente.industry) || null, config: cfg, ahora: e.ahora, llamarModelo: e.llamarModelo, presupuestoUsd: e.presupuestoUsd ?? 0.16, forzar: e.forzarEvaluacion })
      : null
    if (sis) { salida.por_sede = sis.por_sede; salida.costo_modelo_usd = sis.costo_usd; retiros.push(...sis.retiros) }
    const c = competidoresVigilados({ config: cfg, delSistema: [...(ctx?.delSistema ?? [])] })
    // los recién juzgados se vigilan desde la próxima corrida de su día de la semana (sus fichas aparecen cuando llegan sus datos de Mapas)
    const propias = c.motivo ? { brazo: 'competencia' as const, estado: 'sin_material' as const, fichas: [] as FichaDeBrazo[], declarado: [] as string[], detalle: c.motivo } : fichasDeCompetencia({ client_id: e.client_id, vigilados: c.vigilados, filas })
    const delJuicio = sis?.fichas ?? []
    poner({ brazo: 'competencia', estado: propias.fichas.length || delJuicio.length ? 'listo' : 'sin_material', fichas: [...delJuicio, ...propias.fichas], declarado: [...propias.declarado, ...(sis?.declarado ?? [])], ...(propias.fichas.length || delJuicio.length ? {} : { detalle: propias.detalle ?? 'sin competidores todavía' }) })
  }
  if (e.brazos.propios) {
    try {
      // los meses cerrados ya archivados no se vuelven a pedir (el relleno de 12 meses corre una vez; en régimen solo el mes en curso)
      const q = await e.db.from('cerebro_fichas').select('atributo, provenance_tag').eq('client_id', e.client_id).is('retirada_en', null).like('atributo', `${PREFIJO_DE_VENTAS}ingreso:%`).limit(200)
      if (q.error) throw new Error(`lectura de los meses ya archivados: ${String(q.error.message).slice(0, 100)}`)
      const cerrados = new Set<string>()
      const parciales = new Map<string, SnapshotDeVentas>()
      const desfaseHoras = desfaseDelCliente(e.cliente as Record<string, unknown>, e.ahora)
      const enCurso = mesLocalDe(e.ahora, desfaseHoras.horas)
      for (const f of Array.isArray(q.data) ? (q.data as Array<Record<string, unknown>>) : []) {
        const m = /^metrica:loyverse:ingreso:(\d{4}-\d{2})$/.exec(String(f.atributo ?? ''))
        // solo cuenta como cerrado el mes que se archivó YA cerrado (la parcial del mes que acaba de terminar se reemplaza por la final)
        const datos = obj(obj(f.provenance_tag).datos)
        if (m && m[1] !== enCurso && datos.en_curso === false) cerrados.add(m[1])
        // un mes que ya terminó y solo tiene su lectura parcial: con ella se puede cerrar aunque su comienzo ya no se pueda leer
        else if (m && m[1] < enCurso && datos.en_curso === true) { const sn = leerSnapshot(datos.snapshot); if (sn) parciales.set(m[1], sn) }
      }
      // las sedes solo se leen si el cliente asignó sus tiendas del punto de venta a sedes (un cliente de una sola sede no paga la consulta)
      let clavesDeSedes: string[] = (ctx?.sedes ?? []).map((s) => s.clave)
      if (!clavesDeSedes.length && obj(obj(obj(cfg).apify).fuentes_por_sede).punto_de_venta !== undefined) {
        const sq = await e.db.from('client_sedes').select('clave').eq('client_id', e.client_id)
        if (!sq.error) clavesDeSedes = (Array.isArray(sq.data) ? (sq.data as Array<Record<string, unknown>>) : []).map((s) => txt(s.clave)).filter(Boolean)
      }
      const propios = await brazoDePropios({ client_id: e.client_id, slug: txt(e.cliente.slug) || nombre, config: cfg, ahora: e.ahora, env: e.env ?? process.env, fetch: e.fetch ?? (globalThis.fetch as unknown as Fetch), mesesCerrados: cerrados, parciales, clavesDeSedes, desfaseHoras: desfaseHoras.horas })
      if (desfaseHoras.origen === 'sin_dato' && propios.fichas.length) propios.declarado.push('punto de venta: la zona horaria del cliente no está declarada (ni su país tiene una sola): el mes, el día y la hora de las ventas se leen en UTC; declárala en config.timezone')
      poner(propios)
    } catch (x) {
      poner({ brazo: 'propios', estado: 'fallo', detalle: String((x as Error).message).slice(0, 160), fichas: [], declarado: [] })
    }
  }
  if (fichas.length || retiros.length) {
    salida.archivo = await archivarFichasDeBrazos({ db: e.db, fichas, retiros, ahora: e.ahora, dry_run: e.dry_run, workflow_id: e.workflow_id, workflow_execution_id: e.workflow_execution_id, nuevoId: e.nuevoId })
    salida.errores.push(...salida.archivo.errores)
  }
  return salida
}
