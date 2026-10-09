/**
 * OFICINA DE CREATIVOS v1.1 · SALA 1 · tipos del motor genérico. Diseño: docs/DISENO-2026-10-09-oficina-v1-1-sala-1-post-con-foto.md (+ §16) y docs/DISENO-2026-10-09-oficina-salas-2-3-4.md §1.
 * Nada aquí conoce una familia (post, carrusel, historia): una plantilla es DATO. Sin base, sin red, sin modelo. Nadie lo llama todavía.
 */

/** vocabulario CERRADO de pasos (lo único que el código conoce) */
export const TIPOS_DE_PASO = ['portero', 'agente', 'codigo', 'externo', 'brazo'] as const
export type TipoDePaso = (typeof TIPOS_DE_PASO)[number]

export const TIPOS_DE_CONDICION = ['siempre', 'si_artefacto', 'si_fichas_abiertas', 'si_cambio'] as const

export type OrigenDeFicha = 'chequeo' | 'jefe' | 'externa'
export type Gravedad = 'bloquea' | 'sugerencia'

export type Condicion =
  | { tipo: 'siempre' }
  | { tipo: 'si_artefacto'; artefacto: string; campo: string; igual: unknown }
  | { tipo: 'si_fichas_abiertas'; origen?: OrigenDeFicha; donde?: string; gravedad?: Gravedad }
  | { tipo: 'si_cambio'; artefacto: string }

/** vuelta acotada: tras ejecutar el paso, si `si` se cumple y quedan vueltas, se regresa al paso `paso` (clave) */
export interface VueltaA { paso: string; max: number; si: Condicion }

export interface ContratoDeSalida { esquema: string; reintento_formato: number }

export interface Paso {
  /** clave única dentro de la plantilla (el orden es el de la lista) */
  clave: string
  tipo: TipoDePaso
  /** agente (nombre en `agents`) · o `sala` / `portero` / `GPT` */
  quien: string
  /** solo `codigo`: función de la lista cerrada */
  funcion?: string
  condicion: Condicion
  entrada: string[]
  salida_artefacto: string
  /** tope de gasto del paso (US$); 0 = sin modelo */
  tope_usd: number
  /** ronda de crítica a la que pertenece (1 = jefe, 2 = externo); las vueltas no la cruzan */
  ronda?: 1 | 2
  /** solo `agente`/`externo`: contrato de formato que hace cumplir el CÓDIGO */
  salida?: ContratoDeSalida
  /** validadores de código sobre la salida, ANTES de usarla */
  valida?: string[]
  vuelve_a?: VueltaA
}

export interface ReglaDeIndicacion { regla: string; aplica: string }
export interface Limites {
  /** pasos extra permitidos por encima del largo de la plantilla (reintentos y vueltas) */
  margen: number
  tope_encargo_usd: number
  max_rondas: number
  imagenes_generadas_max?: number
  reuso_dias?: number
  [otro: string]: unknown
}
export interface Plantilla {
  tipo: string
  familia: string
  pasos: Paso[]
  limites: Limites
  /** agente → reglas con su aplicador (código | jefe | gpt | guia) */
  indicaciones: Record<string, ReglaDeIndicacion[]>
}

export interface Ficha {
  id: string
  origen: OrigenDeFicha
  donde: string
  gravedad: Gravedad
  estado: 'abierta' | 'tomada' | 'no_tomada'
  que?: string
  contra_que?: string
  propuesta?: string
  razon?: string
}

export interface Artefacto {
  version: number
  /** última versión que consumió algún paso (para `si_cambio`) */
  version_consumida: number
  datos: Record<string, unknown>
}

export interface Estado {
  /** índice del último paso ejecutado en la lista (-1 = ninguno) */
  ultimo: number
  /** cuántos pasos se ejecutaron (incluye repeticiones por vuelta) */
  pasos_ejecutados: number
  gasto_usd: number
  vueltas: Record<string, number>
  artefactos: Record<string, Artefacto>
  fichas: Ficha[]
}

export const estadoInicial = (): Estado => ({ ultimo: -1, pasos_ejecutados: 0, gasto_usd: 0, vueltas: {}, artefactos: {}, fichas: [] })

export type Siguiente =
  | { accion: 'ejecutar'; indice: number; paso: Paso; vuelta?: string }
  | { accion: 'fin' }
  | { accion: 'cierre_por_tope'; razon: 'tope_de_pasos' | 'tope_de_gasto'; detalle: string }
