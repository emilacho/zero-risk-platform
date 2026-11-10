/**
 * 10-nov · cada decisión es también una ALERTA con un solo camino: Nueva → Revisada → Resuelta (Emilio 09-nov 23:45Z ·
 * `raw/tasks/2026-11-10-RESPUESTA-LENOVO-a-CC4-CC1-CC6-310-aprobado-con-ajustes.md` · boceto `raw/evidencia/2026-11-10-alertas/APROBADO-alertas-un-solo-camino.png`).
 * - «Revisada» solo cuando Emilio toca «✓ Revisar»: abrirla no cuenta. La marca vive en la MISMA libreta de «ya lo vi» que usan las demás alertas
 *   del tablero (`alertas_vistas`, escrita por su `POST /api/alertas/visto`). Aquí solo se LEE: un solo camino para todas.
 * - «Resuelta» no se guarda: la decisión sale de la lista cuando se decide.
 * - Si la decisión volvió a abrirse después de la marca (`desde` posterior), vuelve a ser Nueva, como las demás alertas.
 * - Si la libreta no se puede leer, el estado no se inventa: `estado: null`.
 */
import { leer, type Db, type Fuente } from './comun'
import { DIAS_DEL_REGISTRO } from './decisiones-registro'

export type EstadoDeAlerta = 'nueva' | 'revisada'
export interface AlertaDeDecision { clave: string; estado: EstadoDeAlerta | null; revisada_en?: string }

/** la clave con la que el tablero marca «✓ Revisar»: `decision:<fuente>:<id>` */
export const claveDeAlerta = (d: { fuente: string; id: string }): string => `decision:${d.fuente}:${d.id}`

const POR_LOTE = 100

/** lee las marcas de estas claves. null = no se pudo leer (lo dice `fuentes`) */
export async function leerRevisadas(db: Db, claves: string[], fuentes: Fuente[]): Promise<Map<string, string> | null> {
  const marcas = new Map<string, string>()
  const unicas = [...new Set(claves)]
  for (let i = 0; i < unicas.length; i += POR_LOTE) {
    const antes = fuentes.length
    const lote = unicas.slice(i, i + POR_LOTE)
    const filas = await leer(fuentes, 'alertas_vistas', db.from('alertas_vistas').select('clave, visto_en').in('clave', lote))
    if (fuentes.slice(antes).some((f) => f.estado !== 'ok')) return null
    for (const f of filas) if (typeof f.clave === 'string' && typeof f.visto_en === 'string') marcas.set(f.clave, f.visto_en)
  }
  return marcas
}

export function alertaDe(d: { fuente: string; id: string; desde: string | null }, marcas: Map<string, string> | null): AlertaDeDecision {
  const clave = claveDeAlerta(d)
  if (!marcas) return { clave, estado: null }
  const vista = marcas.get(clave)
  if (!vista) return { clave, estado: 'nueva' }
  const volvio = !!d.desde && Date.parse(d.desde) > Date.parse(vista)
  return volvio ? { clave, estado: 'nueva' } : { clave, estado: 'revisada', revisada_en: vista }
}

/**
 * 10-nov · los tres contadores del boceto, ya contados (pedido de CC4): Nuevas · Revisadas · Resueltas.
 * - Nuevas y Revisadas: las decisiones pendientes según su marca. Sin libreta legible: null (el tablero pone «sin dato»), nunca 0.
 * - Resueltas: lo decidido en los últimos `DIAS_DEL_REGISTRO` días según el registro. Hoy el registro cuenta las preguntas
 *   contestadas o descartadas y las firmas del tablero financiero (`resueltas_cuenta`; corrección 10-nov, lo vio CC4); con el registro incompleto o recortado: null.
 */
export interface ContadoresDeAlertas { nuevas: number | null; revisadas: number | null; resueltas: number | null; resueltas_ventana_dias: number; resueltas_cuenta: 'preguntas_y_firmas' }
export function contadoresDeAlertas(decisiones: { alerta?: AlertaDeDecision }[], marcasLegibles: boolean, resueltas: number, registroCompleto: boolean): ContadoresDeAlertas {
  const cuenta = (e: EstadoDeAlerta) => (marcasLegibles ? decisiones.filter((d) => d.alerta?.estado === e).length : null)
  return { nuevas: cuenta('nueva'), revisadas: cuenta('revisada'), resueltas: registroCompleto ? resueltas : null, resueltas_ventana_dias: DIAS_DEL_REGISTRO, resueltas_cuenta: 'preguntas_y_firmas' }
}
