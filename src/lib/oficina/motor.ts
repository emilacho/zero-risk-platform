/**
 * EL MOTOR · `siguientePaso(estado, plantilla)` es PURA y no conoce ninguna familia. Lee la plantilla (dato) y decide: el paso siguiente, `fin` o `cierre_por_tope`.
 *  · salta los pasos cuya condición es falsa (no cuentan);
 *  · `vuelve_a`: tras ejecutar un paso con vuelta, si su condición se cumple y quedan vueltas, regresa al paso indicado; al llegar al máximo SIGUE DE LARGO (no se atasca);
 *  · tope duro de pasos = pasos de la plantilla + `limites.margen`; freno: `gasto + tope del paso > tope del encargo` ⇒ no arranca.
 */
import type { Artefacto, Condicion, Estado, Ficha, Plantilla, Siguiente } from './tipos'

function leer(obj: unknown, ruta: string): unknown {
  let cur: unknown = obj
  for (const k of ruta.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[k]
  }
  return cur
}

export function evaluar(c: Condicion, e: Estado): boolean {
  switch (c.tipo) {
    case 'siempre': return true
    case 'si_artefacto': {
      const a = e.artefactos[c.artefacto]
      return !!a && leer(a.datos, c.campo) === c.igual
    }
    case 'si_cambio': {
      return (Array.isArray(c.artefacto) ? c.artefacto : [c.artefacto]).some((n) => { const a = e.artefactos[n]; return !!a && a.version > a.version_consumida })
    }
    case 'si_fichas_abiertas':
      return e.fichas.some((f) => f.estado === 'abierta' && (!c.origen || f.origen === c.origen) && (!c.donde || (Array.isArray(c.donde) ? c.donde.includes(f.donde) : f.donde === c.donde)) && (!c.gravedad || f.gravedad === c.gravedad))
  }
}

export function siguientePaso(e: Estado, p: Plantilla): Siguiente {
  let desde = e.ultimo + 1
  let vuelta: string | undefined
  if (e.ultimo >= 0) {
    const ult = p.pasos[e.ultimo]
    const v = ult?.vuelve_a
    if (v && evaluar(v.si, e) && (e.vueltas[ult.clave] ?? 0) < v.max) {
      desde = p.pasos.findIndex((x) => x.clave === v.paso)
      vuelta = ult.clave
    }
  }
  let indice = -1
  for (let i = Math.max(desde, 0); i < p.pasos.length; i++) {
    if (evaluar(p.pasos[i].condicion, e)) { indice = i; break }
  }
  if (indice < 0) return { accion: 'fin' }
  if (e.pasos_ejecutados >= p.pasos.length + p.limites.margen) {
    return { accion: 'cierre_por_tope', razon: 'tope_de_pasos', detalle: `${e.pasos_ejecutados} pasos ejecutados (plantilla ${p.pasos.length} + margen ${p.limites.margen})` }
  }
  const paso = p.pasos[indice]
  if (e.gasto_usd + paso.tope_usd > p.limites.tope_encargo_usd) {
    return { accion: 'cierre_por_tope', razon: 'tope_de_gasto', detalle: `gasto ${e.gasto_usd.toFixed(4)} + tope del paso «${paso.clave}» ${paso.tope_usd} > ${p.limites.tope_encargo_usd}` }
  }
  return { accion: 'ejecutar', indice, paso, ...(vuelta ? { vuelta } : {}) }
}

export interface ResultadoDePaso {
  costo_usd: number
  /** datos del artefacto que produce el paso (versión nueva) */
  artefacto?: Record<string, unknown>
  /** fichas nuevas */
  fichas?: Ficha[]
  /** cierra (marca `tomada` con razón) las fichas abiertas de ese origen/donde antes de sumar las nuevas (p. ej. una observación nueva reemplaza la anterior) */
  reemplazar_fichas?: { origen: Ficha['origen']; donde?: string | string[] }
  /** el paso se ejecutó como vuelta de `vuelta` (lo devolvió `siguientePaso`) */
  vuelta?: string
  /** resolución de fichas existentes por id */
  resoluciones?: Array<{ id: string; estado: 'tomada' | 'no_tomada'; razon: string }>
}

/** aplica el resultado de UN paso ejecutado y devuelve el estado nuevo (puro; no muta el de entrada) */
export function registrarPaso(e: Estado, p: Plantilla, indice: number, r: ResultadoDePaso): Estado {
  const paso = p.pasos[indice]
  const artefactos: Record<string, Artefacto> = {}
  for (const [k, a] of Object.entries(e.artefactos)) artefactos[k] = { ...a }
  for (const nombre of paso.entrada) if (artefactos[nombre]) artefactos[nombre].version_consumida = artefactos[nombre].version
  if (r.artefacto) {
    const antes = artefactos[paso.salida_artefacto]
    artefactos[paso.salida_artefacto] = { version: (antes?.version ?? 0) + 1, version_consumida: antes?.version_consumida ?? 0, datos: r.artefacto }
  }
  let fichas = e.fichas.map((f) => ({ ...f }))
  if (r.reemplazar_fichas) {
    const q = r.reemplazar_fichas
    fichas = fichas.map((f) => (f.estado === 'abierta' && f.origen === q.origen && (!q.donde || (Array.isArray(q.donde) ? q.donde.includes(f.donde) : f.donde === q.donde)) ? { ...f, estado: 'tomada' as const, razon: 'reemplazada por una observación nueva' } : f))
  }
  for (const res of r.resoluciones ?? []) fichas = fichas.map((f) => (f.id === res.id ? { ...f, estado: res.estado, razon: res.razon } : f))
  fichas = [...fichas, ...(r.fichas ?? [])]
  const vueltas = { ...e.vueltas }
  if (r.vuelta) vueltas[r.vuelta] = (vueltas[r.vuelta] ?? 0) + 1
  return { ultimo: indice, pasos_ejecutados: e.pasos_ejecutados + 1, gasto_usd: +(e.gasto_usd + r.costo_usd).toFixed(6), vueltas, artefactos, fichas }
}

/** ¿quién puede resolver una ficha? Solo el dueño de su `donde`: el que escribe el texto no toca la imagen, ni al revés. */
export const DUENO_DEL_DONDE: Record<string, string> = {
  texto: 'content-creator',
  hashtags: 'content-creator',
  imagen: 'marketing_instagram_curator',
}
export const duenoDeLaFicha = (f: Pick<Ficha, 'donde'>): string | null => DUENO_DEL_DONDE[f.donde] ?? null
export const puedeResolver = (f: Pick<Ficha, 'donde'>, agente: string): boolean => duenoDeLaFicha(f) === agente
