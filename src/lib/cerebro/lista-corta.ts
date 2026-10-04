/**
 * LA LISTA CORTA de un cliente · paso 1 del tramo 1 · una línea por cada cosa que hay de él.
 *
 * Solo lectura (ver `consulta.ts`). Origen, fecha, estado y vigencia salen DERIVADOS al leer. Una fuente que falla queda como
 * `error_de_lectura` y la lista como `parcial`: nunca se lee un error como «no hay nada».
 * El que atiende (tramo 2) razona sobre ESTA lista completa; el código no decide qué sirve.
 */
import type { Consulta } from './consulta'
import {
  type Contexto, type Salida, leerCompetencia, leerDecisionesDeLaCola, leerFichaDelCliente, leerFotos, leerManual, leerPerfilDeClienteIdeal,
  leerSedes, leerSitio, leerTrabajosHechos, leerTrozosSinLector,
} from './lectores'
import { PLAZOS_EN_DIAS, type Plazos } from './plazos'
import { type EstadoDeFuente, type Ficha, type ListaCorta, NOMBRES_DE_FUENTE, type NombreDeFuente } from './tipos'

export interface OpcionesListaCorta { ahora?: Date; plazos?: Partial<Plazos> }

const vacia = (detalle?: string): EstadoDeFuente => ({ estado: 'sin_material', n: 0, ...(detalle ? { detalle } : {}) })

/** une los estados de una misma fuente que leen dos lectores (por ejemplo, las decisiones salen de dos tablas) */
function unir(a: EstadoDeFuente | undefined, b: EstadoDeFuente | undefined): EstadoDeFuente | undefined {
  if (!a) return b
  if (!b) return a
  if (a.estado === 'error_de_lectura' || b.estado === 'error_de_lectura') {
    return { estado: 'error_de_lectura', n: a.n + b.n, detalle: [a, b].filter((x) => x.estado === 'error_de_lectura').map((x) => x.detalle).join(' · ') }
  }
  const n = a.n + b.n
  return n > 0 ? { estado: 'ok', n } : { estado: 'sin_material', n: 0 }
}

export async function construirListaCorta(consulta: Consulta, clienteId: string, opciones: OpcionesListaCorta = {}): Promise<ListaCorta> {
  const ahora = opciones.ahora ?? new Date()
  const plazos: Plazos = { ...PLAZOS_EN_DIAS, ...(opciones.plazos ?? {}) } as Plazos
  const ctx: Contexto = { consulta, cliente: clienteId, ahora, plazos }
  const base = { cliente_id: clienteId, generada_en: ahora.toISOString() }
  const todasEn = (e: EstadoDeFuente): Record<NombreDeFuente, EstadoDeFuente> => Object.fromEntries(NOMBRES_DE_FUENTE.map((f) => [f, e])) as Record<NombreDeFuente, EstadoDeFuente>

  const ficha = await leerFichaDelCliente(ctx)
  if (ficha.salida.fallidas > 0) {
    const detalle = ficha.salida.fuentes.ficha_del_cliente?.detalle ?? 'no se pudo leer la ficha del cliente'
    return { ...base, estado: 'error_de_lectura', fuentes: todasEn({ estado: 'error_de_lectura', n: 0, detalle: `no se leyó: ${detalle}` }), lineas: [] }
  }
  if (!ficha.existe) return { ...base, estado: 'cliente_inexistente', fuentes: todasEn(vacia('cliente_inexistente')), lineas: [] }

  const salidas: Salida[] = [ficha.salida, ...(await Promise.all([
    leerManual(ctx), leerPerfilDeClienteIdeal(ctx), leerCompetencia(ctx), leerSitio(ctx), leerSedes(ctx), leerFotos(ctx),
    leerTrabajosHechos(ctx), leerDecisionesDeLaCola(ctx), leerTrozosSinLector(ctx),
  ]))]

  const fuentes = todasEn(vacia())
  const unidas: Partial<Record<NombreDeFuente, EstadoDeFuente>> = {}
  for (const s of salidas) for (const [k, v] of Object.entries(s.fuentes) as Array<[NombreDeFuente, EstadoDeFuente]>) unidas[k] = unir(unidas[k], v)
  for (const k of NOMBRES_DE_FUENTE) if (unidas[k]) fuentes[k] = unidas[k] as EstadoDeFuente

  const lecturas = salidas.reduce((s, x) => s + x.lecturas, 0)
  const fallidas = salidas.reduce((s, x) => s + x.fallidas, 0)
  const orden = (f: Ficha): string => `${f.estante}|${f.clase}|${f.ref}`
  const lineas = salidas.flatMap((s) => s.lineas).sort((a, b) => (orden(a) < orden(b) ? -1 : 1))
  const estado: ListaCorta['estado'] = fallidas === 0 ? 'ok' : fallidas >= lecturas ? 'error_de_lectura' : 'parcial'
  return { ...base, estado, fuentes, lineas }
}
