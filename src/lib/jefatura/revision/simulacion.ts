/**
 * EL SECO (diseño v4 §13.3) · moldes simulados POR ESQUEMA y la respuesta simulada de GPT. Puro. US$ 0: en `dry_run` el orquestador NUNCA llama al revisor real y entrega, junto con cada pedido, el `molde`
 * de lo que el empleado devolvería con las ramas que fuerza `payload.simulacion` (así el seco no depende de un modelo y el flujo de n8n —que mide saltos y minutos— solo tiene que devolver el molde).
 * Un esquema sin molde → `null` + error visible (nunca «corriendo» en silencio).
 * GPT simulado NO VACÍO («(simulado) …») para que `decision` corra (la oficina devuelve vacío en seco y salta `decide`); marcado `simulado`.
 */
import type { ResultadoDelRevisor } from '../../revision-comun'
import type { Simulacion } from './contrato'
import { MARCA_DE_FIN_DE_RESOLUCION, MARCA_DE_INICIO_DE_RESOLUCION } from './formatos'

export const TEXTO_DE_GPT_SIMULADO = '(simulado) Lectura independiente: el enfoque se entiende; yo explicaría mejor el beneficio principal y revisaría el cierre. Esto es una opinión simulada para el ensayo en seco.'

export function simulacionDelRevisor(sim: Simulacion | undefined): ResultadoDelRevisor {
  const g = sim?.gpt ?? 'ok'
  if (g === 'falla_red') return { ok: false, error: 'red (simulado)', costo_usd: 0, intentos: [1, 2, 3, 4].map((n) => ({ n, resultado: 'red', http: null, costo_usd: 0, espera_antes_ms: 0 })) }
  if (g === 'falla_401') return { ok: false, error: 'rechazado_401 (simulado): llave o modelo equivocados; no se reintenta', costo_usd: 0, intentos: [{ n: 1, resultado: 'rechazado_401', http: 401, costo_usd: 0, espera_antes_ms: 0 }] }
  if (g === 'vacio' || g === 'sin_hallazgos') return { ok: true, texto: '', costo_usd: 0, modelo: 'simulado (dry_run)' }
  return { ok: true, texto: TEXTO_DE_GPT_SIMULADO, costo_usd: 0, modelo: 'simulado (dry_run)' }
}

export interface ContextoDeMolde {
  paso: string
  esquema: string
  sim: Simulacion | undefined
  /** ids de las fichas que le tocan al empleado en este paso */
  ids_de_fichas: string[]
  /** `donde` por omisión para las fichas del jefe */
  donde: string
  /** el texto vigente del artefacto */
  texto: string
  /** objeto / filas actuales (estrategia / calendario), si los hay */
  objeto?: Record<string, unknown>
  filas?: Array<Record<string, unknown>>
  esDecision: boolean
  /** `true` si este turno repite un paso por formato roto */
  reintento: boolean
}

const bloque = (respuestas: Array<{ id: string; estado: 'tomada' | 'no_tomada'; razon: string }>): string => `${MARCA_DE_INICIO_DE_RESOLUCION}\n${JSON.stringify({ respuestas })}\n${MARCA_DE_FIN_DE_RESOLUCION}`

/** lo que devolvería el empleado; `null` = el turno murió (sin vuelta) */
export function moldeDelPaso(c: ContextoDeMolde): { texto: string | null; error?: string } {
  const sim = c.sim ?? {}
  if (c.esquema !== 'fichas.v1' && sim.productor === 'muerto') return { texto: null, error: 'el turno murió (simulado): sin vuelta' }
  if (c.esquema !== 'fichas.v1' && (sim.productor === 'formato_roto_siempre' || (sim.productor === 'formato_roto' && !c.reintento))) return { texto: 'esto no cumple el formato (simulado)' }
  if (c.esquema === 'fichas.v1') {
    const f = sim.fichas ?? 'ninguna'
    if (f === 'ninguna') return { texto: '{"fichas":[]}' }
    return { texto: JSON.stringify({ fichas: [{ que: `(simulado) hallazgo de fondo en ${c.donde}`, donde: c.donde, contra_que: 'el manual vigente (simulado)', gravedad: f === 'bloquea' ? 'bloquea' : 'sugerencia', propuesta: '(simulado) ajustar esa parte' }] }) }
  }
  const toma = sim.toma ?? 'todo'
  const respuestas = c.ids_de_fichas.map((id) => ({ id, estado: toma === 'nada' ? ('no_tomada' as const) : ('tomada' as const), razon: toma === 'nada' ? '(simulado) no aplica' : '(simulado) tomado' }))
  const tomoAlgo = toma !== 'nada' && respuestas.length > 0
  switch (c.esquema) {
    case 'plan_texto_y_resolucion.v1': {
      if (!tomoAlgo) return { texto: bloque(respuestas) }
      const vn = sim.version_nueva ?? 'mejora'
      let t = `${c.texto.trim()}\n\n(simulado) ${c.esDecision ? 'versión final' : 'versión corregida'}`
      if (vn === 'empeora') t += '\n\nPresupuesto: A calcular (simulado)'
      if (vn === 'demasiado_corta') t = c.texto.trim().slice(0, Math.max(1000, Math.floor(c.texto.length * 0.4)))
      return { texto: `${t}\n${bloque(respuestas)}` }
    }
    case 'resolucion.v1': return { texto: JSON.stringify({ respuestas, ...(tomoAlgo ? { pieza: { pie_de_foto: '(simulado) pie de foto corregido', hashtags: ['#simulado'] } } : {}) }) }
    case 'resolucion_solo.v1': return { texto: JSON.stringify({ respuestas }) }
    case 'resolucion_objeto.v1': return { texto: JSON.stringify({ respuestas, ...(tomoAlgo ? { objeto: { ...(c.objeto ?? {}), simulado: true } } : {}) }) }
    case 'resolucion_parcial.v1': return { texto: JSON.stringify({ respuestas, ...(tomoAlgo ? { filas: [{ fila_id: String(c.filas?.[0]?.fila_id ?? 'f1'), tema: '(simulado) fila corregida' }] } : {}) }) }
    default: return { texto: null, error: `esquema «${c.esquema}» sin molde simulado (un esquema sin molde es un error visible, nunca «corriendo»)` }
  }
}
