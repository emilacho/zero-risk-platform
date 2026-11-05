/**
 * QUÉ SE FIRMA (05-nov · corrección de Lenovo: la tarjeta de firma se veía vacía). SOLO LECTURA.
 * Las cifras salen del bloque que calculó el código; los críticos, del acuerdo que usó el cierre de ese tablero. Lo que no conste no viene: el tablero no ofrece firmar sin cifras.
 */
import { dosCostos } from '../finanzas/dos-costos'
import type { Bloque } from '../finanzas/tipos'
import { esObjeto, leer, sinSecretos, texto, type Db, type Fila } from './comun'

export interface CifraDeFirma { clave: string; nombre: string; valor: number; unidad: string | null; nota: string | null }
export interface LoQueSeFirma { abiertos: number | null; criticos: string[]; unidad: string | null }

const TOPE = 200
const TOPE_DE_CRITICO = 400
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** hoy nada espera la firma: el código deja `sin_firma` y el plan sigue (`finanzas/firma.ts`) */
export const DESTRABA_DE_LA_FIRMA = 'El plan no espera esta firma: queda constancia de que diste por buenas estas cifras.'

/** el código también deja sin firma por falta de acuerdo o por no verificar al jefe. Los críticos se nombran solo si constan en el cierre */
export function paraQueDeLaFirma(criticos: number | null | undefined): string {
  if (!criticos || criticos < 1) return 'La oficina financiera no dejó firmado este tablero: tu firma da por buenas sus cifras.'
  return criticos === 1 ? 'La oficina financiera dejó 1 hallazgo crítico abierto: tu firma da por buenas sus cifras.' : `La oficina financiera dejó ${criticos} hallazgos críticos abiertos: tu firma da por buenas sus cifras.`
}

const encargoDelTablero = (t: Fila): string | null => {
  const w = texto(t.workflow_execution_id)
  const id = w?.startsWith('conversa:') ? w.slice('conversa:'.length) : null
  // la columna es uuid: un id de otra forma haría fallar la lectura de todos
  return id && UUID.test(id) ? id : null
}

/** la moneda del encargo; sin ella, solo se afirma donde el país la deja clara (Ecuador usa dólares). Sin saberla, la cifra va sin moneda */
export function unidadDeDinero(moneda: unknown, pais: unknown): string | null {
  const m = texto(moneda)
  if (m) return /^(usd|us\$)$/i.test(m) ? 'US$' : m
  return String(pais ?? '').toUpperCase() === 'EC' ? 'US$' : null
}

const notaDe = (c: Fila, extra?: string): string | null => {
  const partes = [c.tipo === 'supuesto' ? 'Supuesto' : c.tipo === 'dato' ? 'Dato' : null, typeof c.min === 'number' && typeof c.max === 'number' ? `entre ${c.min} y ${c.max}` : null, extra ?? null].filter(Boolean)
  return partes.length ? partes.join(' · ') : null
}

/** las cifras que el dueño lee antes de firmar. Los dos costos por venta van siempre juntos: uno solo hace creer que el plan se paga (`finanzas/dos-costos.ts`) */
export function cifrasDelBloque(bloque: unknown, dinero: string | null): CifraDeFirma[] {
  if (!esObjeto(bloque) || !esObjeto(bloque.cifras)) return []
  const cs = bloque.cifras as Record<string, unknown>
  const salida: CifraDeFirma[] = []
  const poner = (clave: string, nombre: string, unidad: string | null) => {
    const c = cs[clave]
    if (esObjeto(c) && typeof c.valor === 'number' && Number.isFinite(c.valor)) salida.push({ clave, nombre, valor: c.valor, unidad, nota: notaDe(c) })
  }
  poner('meta_por_semana', 'Meta de ventas por semana', 'ventas')
  poner('total_mes', 'Presupuesto total al mes', dinero)
  poner('pauta_diaria', 'Pauta por día', dinero)
  poner('costo_por_venta', 'Costo por venta, solo con la pauta', dinero)
  let completo: number | null = null
  try { completo = dosCostos(bloque as unknown as Bloque).plan_completo } catch { completo = null }
  if (typeof completo === 'number' && Number.isFinite(completo)) salida.push({ clave: 'costo_por_venta_plan_completo', nombre: 'Costo por venta, con todo el plan', valor: completo, unidad: dinero, nota: 'Calculado: el total del mes entre las ventas que se añaden' })
  // 0 es una señal de la calculadora («cualquier meta cubre»), no una cantidad: «0 ventas para pagar el plan» diría que se paga solo (CC7, tableros reales)
  const equilibrio = cs.meta_de_equilibrio_semana
  if (esObjeto(equilibrio) && typeof equilibrio.valor === 'number' && equilibrio.valor > 0) poner('meta_de_equilibrio_semana', 'Ventas por semana para pagar el plan', 'ventas')
  return salida
}

/** críticos abiertos y moneda de cada tablero, por su encargo. Falle lo que falle, devuelve lo que pudo: no afecta a `completo` */
export async function leerLoQueSeFirma(db: Db, tableros: Fila[]): Promise<Map<string, LoQueSeFirma>> {
  const salida = new Map<string, LoQueSeFirma>()
  const delTablero = new Map(tableros.map((t) => [String(t.id), encargoDelTablero(t)]))
  const encargos = [...new Set([...delTablero.values()].filter((x): x is string => !!x))]
  if (!encargos.length) return salida
  const [arts, encs] = await Promise.all([
    leer([], 'finanzas_artefactos', db.from('finanzas_artefactos').select('encargo_id, tipo, version, tablero:contenido->>finanzas_id, abiertos:contenido->criticos_abiertos, ronda:contenido->ronda_2, incompleta:contenido->ronda_2_incompleta, hallazgos:contenido->hallazgos').in('tipo', ['cierre', 'acuerdo', 'acuerdo_2']).in('encargo_id', encargos).order('version', { ascending: false }).limit(TOPE), TOPE),
    leer([], 'finanzas_encargos', db.from('finanzas_encargos').select('id, moneda:semilla->>moneda, pais:semilla->>pais').in('id', encargos).limit(TOPE), TOPE),
  ])
  for (const [tablero, encargo] of delTablero) {
    if (!encargo) continue
    const delEncargo = arts.filter((a) => a.encargo_id === encargo)
    const ultimo = (tipo: string) => delEncargo.find((a) => a.tipo === tipo) ?? null
    const cierre = delEncargo.find((a) => a.tipo === 'cierre' && a.tablero === tablero) ?? null
    const e = encs.find((x) => x.id === encargo)
    // el mismo acuerdo que usó el cierre: la ronda 2 a medias no cuenta (`finanzas/conversa/orquestador.ts`)
    const acuerdo = !cierre ? null : cierre.ronda === true && cierre.incompleta !== true ? ultimo('acuerdo_2') ?? ultimo('acuerdo') : ultimo('acuerdo')
    const hallazgos = acuerdo && Array.isArray(acuerdo.hallazgos) ? (acuerdo.hallazgos as unknown[]).filter(esObjeto) : []
    const criticos = hallazgos.filter((h) => h.severidad === 'critico' && h.estado !== 'resuelto').flatMap((h) => { const q = sinSecretos(h.que, TOPE_DE_CRITICO); return q ? [q] : [] })
    salida.set(tablero, { abiertos: cierre && typeof cierre.abiertos === 'number' ? cierre.abiertos : null, criticos, unidad: unidadDeDinero(e?.moneda, e?.pais) })
  }
  return salida
}
