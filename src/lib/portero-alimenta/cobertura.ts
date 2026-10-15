/**
 * LO QUE EL ALTA YA RASPÓ NO SE VUELVE A PAGAR (15-oct · firma de Emilio: «el cerebro despierte con ese primer raspado … y continúe su trabajo a partir de eso»).
 * PURO · sin red ni base. Una acción del plan diario queda CUBIERTA si en `apify_raw` (solo `ensayo = false`, lo decide quien lee) hay una corrida de la MISMA función,
 * lo bastante fresca, que ya pidió TODOS sus objetivos (direcciones, cuentas, búsquedas). Sin objetivos reconocibles ⇒ cubre la función. No cubre: lo que cambió de parámetros
 * (otra búsqueda, otra dirección) ni lo que quedó más viejo que la frescura: eso se pide como siempre. El corte es SOLO por frescura y solo mientras dure la ventana del despertar.
 */
import type { AccionDelPortero, PlanDelPortero } from './plan'

/** cuántas horas vale el raspado del alta para no repetirlo (cubre la primera corrida diaria, ~26 h después de un alta de la mañana; la siguiente ya paga) */
export const COBERTURA_DEL_ALTA_HORAS = 36

export interface FilaDeRaspadoParaCubrir { apify_function: string; params?: unknown; created_at: string }

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const normalizarObjetivo = (s: string) => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/^@/, '').replace(/\/+$/, '').replace(/\s+/g, ' ')

/** los objetivos que una llamada pidió: direcciones, cuentas, búsquedas y lugares, normalizados */
export function objetivosDeParams(params: unknown): string[] {
  if (!esObjeto(params)) return []
  const out = new Set<string>()
  const poner = (v: unknown) => { if (typeof v === 'string' && v.trim()) for (const parte of v.split('\n')) if (parte.trim()) out.add(normalizarObjetivo(parte)) }
  const lista = (v: unknown) => { if (Array.isArray(v)) for (const x of v) { if (esObjeto(x)) poner(x.url); else poner(x) } else poner(v) }
  lista(params.startUrls); lista(params.directUrls)
  lista(params.usernames); lista(params.username)
  lista(params.queries); lista(params.searchStringsArray); lista(params.placeIds)
  return [...out]
}

export function accionCubierta(a: AccionDelPortero, filas: FilaDeRaspadoParaCubrir[], desdeMs: number): boolean {
  const pedidos = objetivosDeParams(a.params)
  for (const f of filas) {
    if (f.apify_function !== a.funcion) continue
    if (Date.parse(f.created_at) < desdeMs) continue
    if (!pedidos.length) return true
    const tuvo = new Set(objetivosDeParams(f.params))
    if (pedidos.every((p) => tuvo.has(p))) return true
  }
  return false
}

export interface PlanSinLoYaRaspado {
  hacer: AccionDelPortero[]
  cubiertas: Array<{ fuente: string; funcion: string; objetivo: string; usd_max: number }>
  /** lo que habría costado, como máximo declarado (no es gasto medido) */
  ahorro_usd: number
}

export function sinLoYaRaspado(plan: Pick<PlanDelPortero, 'hacer'>, filas: FilaDeRaspadoParaCubrir[], ahora: Date, horas = COBERTURA_DEL_ALTA_HORAS): PlanSinLoYaRaspado {
  const desde = ahora.getTime() - horas * 3_600_000
  const hacer: AccionDelPortero[] = []
  const cubiertas: PlanSinLoYaRaspado['cubiertas'] = []
  for (const a of plan.hacer) {
    if (accionCubierta(a, filas, desde)) cubiertas.push({ fuente: a.fuente, funcion: a.funcion, objetivo: a.objetivo, usd_max: a.usd_max })
    else hacer.push(a)
  }
  return { hacer, cubiertas, ahorro_usd: Math.round(cubiertas.reduce((s, c) => s + c.usd_max, 0) * 1e6) / 1e6 }
}
