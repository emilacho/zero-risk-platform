/**
 * LOS NUEVOS BRAZOS · punto de entrada (15-oct). Dos cosas, ambas detrás de interruptores APAGADOS:
 *   1. `accionesDeBrazos`  · lo que los brazos PIDEN a Apify hoy (se suma al plan del portero, que lo recorta al tope y a las 16 corridas);
 *   2. `correrBrazos`      · lo que los brazos ARCHIVAN con lo que ya llegó a `apify_raw` (y con las llaves del cliente): se llama desde `alimentar`.
 * Con todos apagados no hace nada: ni lee ni escribe.
 */
import type { Db } from '../alimentar'
import { paisIsoDe } from '../../cerebro/zona'
import { archivarFichasDeBrazos, type ResultadoDeArchivo } from './archivo'
import { accionesDeCompetencia, competidoresConfirmados, fichasDeCompetencia } from './competencia'
import { fichasDeContexto } from './contexto'
import { accionDeDemanda, fichasDeDemanda, terminosDeDemanda, type FilaCrudaDeBrazo } from './demanda'
import { brazoDePropios, type Fetch } from './propios'
import { hayBrazoActivo, type AccionDeBrazo, type BrazosActivos, type FichaDeBrazo, type NombreDeBrazo, type ResultadoDeUnBrazo } from './tipos'

export * from './tipos'
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {})
const txt = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')

/** país ISO-2 (minúscula) de la ficha: acepta el código o el nombre; sin dato no se adivina */
export const paisDeLaFicha = (cliente: Record<string, unknown>): string | null => paisIsoDe(cliente.country ?? cliente.pais, cliente.market)

export interface EntradaDeAccionesDeBrazos {
  brazos: BrazosActivos
  cliente: { id: string; name?: string | null; config?: unknown; industry?: string | null; country?: string | null; market?: string | null }
  rubro?: string | null
  ciudad?: string | null
  familias?: string[]
  ahora: Date
}
/** lo que los brazos piden hoy · cada acción lleva `_brazo` en `params` para reconocerla al archivar */
export function accionesDeBrazos(e: EntradaDeAccionesDeBrazos): { acciones: AccionDeBrazo[]; no_cubiertas: Array<{ fuente: string; por_que: string }> } {
  const acciones: AccionDeBrazo[] = []
  const no_cubiertas: Array<{ fuente: string; por_que: string }> = []
  const mercado = txt(e.cliente.market)
  if (e.brazos.demanda) {
    const t = terminosDeDemanda({ rubro: e.rubro ?? e.cliente.industry, config: e.cliente.config, familias: e.familias })
    const d = accionDeDemanda({ ahora: e.ahora, terminos: t, ciudad: e.ciudad, mercado })
    if (d.accion) acciones.push(d.accion)
    else if (d.no_cubierta) no_cubiertas.push({ fuente: 'demanda', por_que: d.no_cubierta })
  }
  if (e.brazos.competencia) {
    const c = competidoresConfirmados(e.cliente.config)
    if (c.motivo) no_cubiertas.push({ fuente: 'competencia', por_que: c.motivo })
    else acciones.push(...accionesDeCompetencia({ vigilados: c.vigilados, ahora: e.ahora, ciudad: e.ciudad, mercado, pais: paisDeLaFicha(e.cliente as Record<string, unknown>) }))
  }
  return { acciones, no_cubiertas }
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
}
export interface ResultadoDeBrazos {
  activos: NombreDeBrazo[]
  por_brazo: Partial<Record<NombreDeBrazo, { estado: ResultadoDeUnBrazo['estado']; fichas: number; declarado: string[]; detalle?: string }>>
  archivo: ResultadoDeArchivo | null
  errores: string[]
}

export async function correrBrazos(e: EntradaDeCorrerBrazos): Promise<ResultadoDeBrazos> {
  const salida: ResultadoDeBrazos = { activos: [], por_brazo: {}, archivo: null, errores: [] }
  if (!hayBrazoActivo(e.brazos)) return salida
  const cfg = e.cliente.config
  const fichas: FichaDeBrazo[] = []
  const poner = (r: ResultadoDeUnBrazo) => {
    salida.activos.push(r.brazo)
    salida.por_brazo[r.brazo] = { estado: r.estado, fichas: r.fichas.length, declarado: r.declarado, ...(r.detalle ? { detalle: r.detalle } : {}) }
    fichas.push(...r.fichas)
  }
  const nombre = txt(e.cliente.name)
  if (e.brazos.contexto) {
    const pais = paisDeLaFicha(e.cliente)
    poner(pais ? fichasDeContexto({ pais, ahora: e.ahora }) : { brazo: 'contexto', estado: 'sin_material', detalle: 'la ficha no dice el país: no se adivina', fichas: [], declarado: ['contexto: la ficha del cliente no trae país'] })
  }
  if (e.brazos.demanda) {
    const conocidos = [nombre, ...(Array.isArray(obj(obj(cfg).apify).competitor_list) ? (obj(obj(cfg).apify).competitor_list as unknown[]).map((c) => txt(obj(c).name)) : [])]
    poner(fichasDeDemanda({ client_id: e.client_id, nombreDelCliente: nombre, filas: e.filas, ahora: e.ahora, yaConocidos: conocidos, ciudad: e.ciudad }))
  }
  if (e.brazos.competencia) {
    const c = competidoresConfirmados(cfg)
    if (c.motivo) poner({ brazo: 'competencia', estado: 'sin_material', detalle: c.motivo, fichas: [], declarado: [c.motivo] })
    else poner(fichasDeCompetencia({ client_id: e.client_id, vigilados: c.vigilados, filas: e.filas }))
  }
  if (e.brazos.propios) {
    try {
      poner(await brazoDePropios({ client_id: e.client_id, slug: txt(e.cliente.slug) || nombre, config: cfg, ahora: e.ahora, env: e.env ?? process.env, fetch: e.fetch ?? (globalThis.fetch as unknown as Fetch) }))
    } catch (x) {
      poner({ brazo: 'propios', estado: 'fallo', detalle: String((x as Error).message).slice(0, 160), fichas: [], declarado: [] })
    }
  }
  if (fichas.length) {
    salida.archivo = await archivarFichasDeBrazos({ db: e.db, fichas, ahora: e.ahora, dry_run: e.dry_run, workflow_id: e.workflow_id, workflow_execution_id: e.workflow_execution_id, nuevoId: e.nuevoId })
    salida.errores.push(...salida.archivo.errores)
  }
  return salida
}
