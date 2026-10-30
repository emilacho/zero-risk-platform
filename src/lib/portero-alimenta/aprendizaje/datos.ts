/**
 * EL APRENDIZAJE DEL DUEÑO · datos y espacios (29-oct · firma de Emilio «DALE», RAG reutilizando el del cerebro).
 * Las notas destiladas son fichas de clase `aprendizaje_del_dueno` en `cerebro_fichas`, en espacios propios que ningún lector por cliente recorre
 * (así no entran al resumen vivo, a la planeación ni al índice que el corredor inyecta solo; la jefatura y GPT quedan fuera):
 *   · `aprendizaje:<client_id>`  lo que el dueño dijo de ESE cliente;  · `industria:<rubro>`  lo que vale para un rubro;  · `general`  lo que vale para todos (y para un formato).
 * TODO lo ajustable es dato: el catálogo de atributos y destinatarios vive en la tabla `cerebro_aprendizaje_catalogo` (estos son solo los de arranque) y los parámetros de peso
 * se leen de `APRENDIZAJE_PARAMS` (JSON). Puro: sin red ni base.
 */
import { normalizar } from '../../manual/texto'

export const CLASE_DEL_APRENDIZAJE = 'aprendizaje_del_dueno'
export const ESPACIO_GENERAL = 'general'
export const PREFIJO_DE_CLIENTE = 'aprendizaje:'
export const PREFIJO_DE_INDUSTRIA = 'industria:'
export type Alcance = 'cliente' | 'industria' | 'formato' | 'general'
export type Direccion = 'hacer' | 'evitar'
/** más específica = pesa más al chocar y va primero al entregar */
export const ESPECIFICIDAD: Record<Alcance, number> = { cliente: 4, formato: 3, industria: 2, general: 1 }
export const ALCANCES: Alcance[] = ['cliente', 'formato', 'industria', 'general']

/** el catálogo de arranque (la tabla manda; si está vacía o no se puede leer, se usa este) */
export const CATALOGO_DE_ARRANQUE: { destinatarios: string[]; atributos: string[] } = {
  destinatarios: ['texto', 'diseno', 'imagen', 'direccion'],
  atributos: ['tono', 'longitud', 'color', 'tipografia', 'composicion', 'producto', 'personas', 'texto_en_imagen', 'llamada_a_la_accion', 'precio_y_oferta', 'marca', 'otro'],
}
export interface Catalogo { destinatarios: string[]; atributos: string[] }

export interface ParametrosDeAprendizaje {
  /** semivida del peso de una nota que no se usa (días) */
  semivida_dias: number
  piso_de_peso: number
  /** parecido mínimo (palabras compartidas / palabras del menor) para decir que dos notas hablan de lo mismo */
  parecido_minimo: number
  /** cuántos rubros distintos tienen que repetir una idea para subirla a «general» */
  industrias_para_general: number
  /** cuántas notas crudas se desmenuzan por pasada (cada una es una llamada al modelo) */
  notas_por_pasada: number
  /** las notas crudas anteriores a esta fecha no se procesan («desde hoy») */
  desde: string
  /** consultas que NO pueden leer el aprendizaje: la jefatura y la segunda mirada GPT (vara dura / criterio independiente) */
  consultantes_excluidos: string[]
  /** parecido mínimo con la tarea (coseno) para entregar una nota */
  similitud_minima: number
  limite_por_omision: number
  limite_maximo: number
  /** frases con que el dueño sube una idea de alcance (una evidencia sin ninguna de ellas no sube: «siempre» solo no es «todos mis negocios») · dato ampliable */
  marcas_de_alcance: { general: string[]; industria: string[] }
  /** cuántas ideas vigentes del cliente se le muestran al desmenuzador para que diga cuáles contradice la idea nueva */
  vigentes_a_comparar: number
}
export const PARAMETROS_POR_OMISION: ParametrosDeAprendizaje = {
  semivida_dias: 60, piso_de_peso: 0.05, parecido_minimo: 0.67, industrias_para_general: 2, notas_por_pasada: 12, desde: '2026-10-29',
  consultantes_excluidos: ['jefatura', 'jefe', 'camino', 'gpt', 'revisor', 'qa-reviewer', 'reality', 'brand_strategist', 'editor_en_jefe', 'jefe_client_success'],
  similitud_minima: 0.12, limite_por_omision: 10, limite_maximo: 10,
  marcas_de_alcance: {
    general: ['todos mis negocios', 'todas mis marcas', 'todos mis clientes', 'cualquier cliente', 'cualquier negocio', 'cualquiera de mis negocios', 'mis otros negocios', 'en todos mis', 'en todas mis', 'para todos mis', 'para todas mis', 'sea del rubro que sea', 'en cualquier rubro', 'en cualquier industria'],
    industria: ['este rubro', 'mi rubro', 'mi industria', 'este sector', 'mi sector', 'este tipo de negocio', 'negocios como este', 'negocios del mismo giro', 'todos los negocios de', 'todas las empresas de'],
  },
  vigentes_a_comparar: 40,
}
export function parametrosDelEntorno(env: Record<string, string | undefined> = process.env): ParametrosDeAprendizaje {
  const base = { ...PARAMETROS_POR_OMISION }
  try {
    const j = env.APRENDIZAJE_PARAMS ? (JSON.parse(env.APRENDIZAJE_PARAMS) as Partial<ParametrosDeAprendizaje>) : {}
    for (const k of Object.keys(base) as Array<keyof ParametrosDeAprendizaje>) if (j[k] !== undefined && typeof j[k] === typeof base[k]) (base as Record<string, unknown>)[k] = j[k]
  } catch { /* un JSON roto no apaga el aprendizaje: valen los de arranque */ }
  return base
}

export const rubroNormal = (rubro: unknown): string => normalizar(String(rubro ?? '')).replace(/[^a-z0-9ñ]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
/** formato / atributo en una sola palabra con guion bajo (el desmenuzador y la consulta deben escribirlo igual) */
export const slugNormal = (s: unknown): string => normalizar(String(s ?? '')).replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
export const espacioDeCliente = (clientId: string): string => `${PREFIJO_DE_CLIENTE}${clientId}`
export const espacioDeIndustria = (rubro: unknown): string | null => { const r = rubroNormal(rubro); return r ? `${PREFIJO_DE_INDUSTRIA}${r}` : null }
/** el espacio donde vive una nota según su alcance (formato vive en `general` con su formato en el rastro) */
export function espacioDeAlcance(alcance: Alcance, o: { client_id: string; rubro?: unknown }): string {
  if (alcance === 'cliente') return espacioDeCliente(o.client_id)
  if (alcance === 'industria') return espacioDeIndustria(o.rubro) ?? espacioDeCliente(o.client_id)
  return ESPACIO_GENERAL
}
/** los tres espacios que lee un especialista de este cliente */
export const espaciosDeLectura = (clientId: string, rubro: unknown): string[] => [espacioDeCliente(clientId), ...(espacioDeIndustria(rubro) ? [espacioDeIndustria(rubro) as string] : []), ESPACIO_GENERAL]
export const esConsultanteExcluido = (oficina: string, agente: string, p: ParametrosDeAprendizaje = PARAMETROS_POR_OMISION): boolean => {
  const t = normalizar(`${oficina} ${agente}`)
  return p.consultantes_excluidos.some((x) => t.includes(normalizar(x)))
}
