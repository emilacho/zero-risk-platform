/** Tipos de la lista corta (paso 1) · el vocabulario es el del diseño v3: estantes, estados de origen, vigencia derivada. */

export type Estante = 'E1' | 'E2' | 'E3' | 'E4' | 'E5' | 'E6' | 'E7' | 'E8'

/** Quién lo afirmó. Lo fija el ORIGEN, nunca una frase verificada. */
export type Estado =
  | 'dicho_por_dueno' | 'visto_en_su_fuente' | 'medido' | 'de_tercero' | 'inferido'
  | 'borrador sin aprobar' | 'aprobado' | 'rechazado' | 'propiedad_incierta'

export type Origen = 'dueno' | 'su_fuente' | 'plataforma' | 'tercero' | 'producido'

export interface Ficha {
  /** estable: `tabla:id` (más `#suffix` si la cosa sale de dentro de una fila) */
  ref: string
  estante: Estante
  clase: string
  titulo: string
  que_es: string
  resumen?: string
  /** texto completo, solo en lo que el portero entrega SIEMPRE (manual vigente y correcciones del aprobador) */
  contenido?: string
  origen: Origen
  estado: Estado
  fecha_fuente: string | null
  vigente_hasta: string | null
  vencido: boolean
  aviso?: string
  version?: number
  /** solo en lo que se versiona: la versión que manda hoy */
  vigente?: boolean
  reemplazada?: boolean
  versiones_anteriores?: number
  /** solo en lo que se observa en el tiempo: cuántas observaciones anteriores quedaron debajo */
  observaciones_anteriores?: number
  valida?: boolean
  cantidad?: number
  enlace?: string | null
  sede?: string | null
  producto?: string[] | null
  /** de dónde salió el producto de una foto: caption · vision · dueno · conflicto · desconocido (columna de la tabla) */
  producto_fuente?: string | null
  /** cuándo se publicó (no confundir con `fecha_fuente`, que es la última verificación) */
  publicado_en?: string | null
  datos?: { precio?: number | null; moneda?: string | null; familia?: string | null }
  sobre_terceros?: boolean
  /** «tokens» aproximados del contenido (2,8 caracteres por «token», medido por CC#2) */
  peso_estimado: number
}

export type EstadoDeLectura = 'ok' | 'sin_material' | 'error_de_lectura'

export interface EstadoDeFuente { estado: EstadoDeLectura; n: number; detalle?: string }

export const NOMBRES_DE_FUENTE = [
  'ficha_del_cliente', 'manual', 'perfil_cliente_ideal', 'competencia', 'sitio', 'productos', 'sedes',
  'datos_de_sede', 'fotos', 'trabajos_hechos', 'decisiones_del_aprobador', 'trozos_sin_lector',
] as const
export type NombreDeFuente = (typeof NOMBRES_DE_FUENTE)[number]

export interface ListaCorta {
  cliente_id: string
  generada_en: string
  /** `parcial` = alguna lectura falló · `error_de_lectura` = no se pudo leer nada · `cliente_inexistente` NO es «sin material» */
  estado: 'ok' | 'parcial' | 'cliente_inexistente' | 'error_de_lectura'
  fuentes: Record<NombreDeFuente, EstadoDeFuente>
  lineas: Ficha[]
}

/** «tokens» aproximados de un texto (2,8 caracteres por «token»: medido por CC#2 con el contador de Anthropic) */
export const pesoDeTexto = (t: string | null | undefined): number => Math.max(1, Math.ceil((t ?? '').length / 2.8))
