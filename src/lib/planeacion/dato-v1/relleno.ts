/**
 * PLAN v3 · V3 · QUÉ SE VA A BUSCAR AFUERA (rev. 3 §14.1, §16, §17.3). El plan deja de pedir «las 5 funciones de siempre»: pide SOLO lo que falta o venció,
 * una llamada por fuente (cubre varios tipos), con el tope de la fila y dentro del tope del tramo de recolección. PURO: devuelve el pedido, no lo manda.
 *
 * 🔴 NUNCA APIFY EN LUGAR DEL CEREBRO (§16): sin `cerebro_listo === true` no sale NADA (ni siquiera el relleno). Vencida la espera, el plan corre con lo del alta y lo declara.
 * 🔴 LA SEÑAL AUSENTE NO ES «LISTO» (§16.2): `null`/`undefined` (la lectura falló) tampoco autoriza el relleno.
 * 🔴 SIN FILA DE TOPE NO SE GASTA: un catálogo sin el tramo `recoleccion` falla cerrado (tope 0).
 */
import type { CatalogoSnapshot, FilaDeFuente } from './catalogo'

export type MotivoDeFalta = 'sin_ficha' | 'vencida' | 'sin_crudo'
export interface Faltante { tipo_id: string; motivo: MotivoDeFalta }
export interface PedidoDeRelleno {
  fuente_id: string
  brazo: 'apify' | 'posthog'
  funcion: string
  tipos: string[]
  /** tope por llamada (el Servicio lo manda a Apify como `maxTotalChargeUsd`); 0 ⇒ la fuente no cobra y no manda tope */
  tope_usd: number
  plazo_s: number
  reintentos: number
  /** el libro distingue plan / portero / alta por este valor (V8 del Servicio) */
  origen: 'plan'
}
export type MotivoDeOmision = 'cerebro_no_listo' | 'sin_fuente_en_catalogo' | 'tope_recoleccion'
export interface PlanDeRelleno {
  pedidos: PedidoDeRelleno[]
  omitidos: Array<{ tipo_id: string; motivo: MotivoDeOmision }>
  tope_recoleccion_usd: number
  comprometido_usd: number
}

export interface ReglasDeRelleno {
  /** ¿la señal autoriza salir a buscar? */
  autoriza(cerebro_listo: boolean | null | undefined): boolean
}
export const REGLAS: ReglasDeRelleno = { autoriza: (l) => l === true }

export function planificarRelleno(
  e: { snapshot: CatalogoSnapshot; faltantes: Faltante[]; cerebro_listo: boolean | null | undefined; gastado_recoleccion_usd?: number },
  reglas: ReglasDeRelleno = REGLAS,
): PlanDeRelleno {
  const tope = e.snapshot.tope('recoleccion') ?? 0
  const base: PlanDeRelleno = { pedidos: [], omitidos: [], tope_recoleccion_usd: tope, comprometido_usd: 0 }
  const unicos = [...new Map(e.faltantes.map((f) => [f.tipo_id, f])).values()]
  if (!reglas.autoriza(e.cerebro_listo)) return { ...base, omitidos: unicos.map((f) => ({ tipo_id: f.tipo_id, motivo: 'cerebro_no_listo' as const })) }

  // fuente candidata por tipo: la más barata que lo provee y no es el cerebro
  const porFuente = new Map<string, { fuente: FilaDeFuente; tipos: string[]; critico: boolean }>()
  for (const f of unicos) {
    const candidatas = e.snapshot.filas.fuentes
      .filter((x) => x.via !== 'cerebro' && (x.provee ?? []).includes(f.tipo_id))
      .sort((a, b) => a.tope_usd - b.tope_usd || a.fuente_id.localeCompare(b.fuente_id))
    const fuente = candidatas[0]
    if (!fuente) { base.omitidos.push({ tipo_id: f.tipo_id, motivo: 'sin_fuente_en_catalogo' }); continue }
    const g = porFuente.get(fuente.fuente_id) ?? { fuente, tipos: [], critico: false }
    g.tipos.push(f.tipo_id)
    g.critico = g.critico || e.snapshot.tipo(f.tipo_id)?.critico === true
    porFuente.set(fuente.fuente_id, g)
  }
  // lo crítico primero; luego lo más barato: si el tope no alcanza, se cae lo menos importante
  const ordenadas = [...porFuente.values()].sort((a, b) => Number(b.critico) - Number(a.critico) || a.fuente.tope_usd - b.fuente.tope_usd || a.fuente.fuente_id.localeCompare(b.fuente.fuente_id))
  const antes = Math.max(0, e.gastado_recoleccion_usd ?? 0)
  let gastado = antes
  for (const g of ordenadas) {
    if (gastado + g.fuente.tope_usd > tope + 1e-9) { for (const t of g.tipos) base.omitidos.push({ tipo_id: t, motivo: 'tope_recoleccion' }); continue }
    gastado += g.fuente.tope_usd
    base.pedidos.push({
      fuente_id: g.fuente.fuente_id, brazo: g.fuente.proveedor === 'posthog' ? 'posthog' : 'apify', funcion: g.fuente.funcion, tipos: g.tipos,
      tope_usd: g.fuente.tope_usd, plazo_s: g.fuente.plazo_s, reintentos: g.fuente.reintentos ?? 0, origen: 'plan',
    })
  }
  base.comprometido_usd = Math.round((gastado - antes) * 100) / 100
  return base
}
