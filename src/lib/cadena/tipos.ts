/**
 * Tipos de la cadena · contratos de datos (diseño v2 §9.4). Nada de esto sabe de un cliente ni de un rubro.
 */

export type RolCanal = 'principal' | 'replica' | 'no'
export type OrigenFecha = 'plan' | 'estrategia' | 'alta' // «alta» = lo firmado por Emilio; nunca una persona del cliente
export type PedirA = 'portero' | 'sistema' // nunca el dueño: si falta un dato se investiga con fuente o la fila sale

export interface Canal {
  red: string
  rol: RolCanal
  motivo: string
  frecuencia: { feed_semana: number; historias_semana: number; anuncios_semana: number }
  formatos: string[]
}
export interface Pilar { clave: string; nombre: string; pct: number }
export interface Fase { clave: string; dia_desde: number; dia_hasta: number; objetivo: string; cita_plan: string }
export interface Hito { clave: string; dia: number; tipo: 'revision' | 'lanzamiento' | 'corte'; cita_plan: string }
export interface Dependencia { antes: string; despues: string; regla: string; cita_plan: string }
export interface FechaQueImporta { tipo: string; ambito: string; origen: OrigenFecha; cita_plan?: string; motivo: string }
export interface Slot {
  slot: string; dia_semana: number; hora: string; red: string; formato: string; pilar: string
  requiere_abierto: boolean; sede: string
}
export interface PiezaFija { clave: string; semana: number; slot: string; tema: string; refs: string[] }
export interface Pendiente { clave: string; que_falta: string; desbloquea: string[]; pedir_a: PedirA }

export interface Estrategia {
  canales: Canal[]
  excluidos: { red: string; cita_plan: string }[]
  pilares: Pilar[]
  fases: Fase[]
  hitos: Hito[]
  dependencias: Dependencia[]
  fechas_que_importan: FechaQueImporta[]
  patron_semanal: Slot[]
  piezas_fijas: PiezaFija[]
  pendientes: Pendiente[]
  alertas: { texto: string; ref: string }[]
}

export type Clase = 'alto' | 'medio' | 'bajo'
export type Nivel = 'F0' | 'F1' | 'F2' | 'F3'

export interface DatoDeterminado {
  dato: string
  valor: string
  clase: Clase
  ref: string
  nivel: Nivel
  opcional: boolean
}
export interface PiezaAgente {
  semana: number; dia_semana: number; slot: string; hora: string; red: string; formato: string; pilar: string
  tema: string; sede: string; requiere_abierto: boolean; depende_de: string[]; pieza_fija: string
  datos: DatoDeterminado[]; pendientes: string[]
}
export interface Ajuste { semana: number; slot: string; accion: 'omitir' | 'mover' | 'agregar'; motivo: string }
export interface TandaAgente { piezas: PiezaAgente[]; ajustes_al_patron: Ajuste[] }

export type EstadoFila =
  | 'esquema' | 'propuesta' | 'validada' | 'en_investigacion' | 'lista_para_brief' | 'briefeada' | 'en_oficina' | 'aprobada'
  | 'cancelada' | 'espera_video' | 'vencida_sin_brazo' | 'perdio_su_fecha' | 'descartada_sin_fuente'

/** La fila fechada por el CÓDIGO: la unidad de todo lo que sigue. */
export interface Fila {
  id: string
  tanda: number
  semana: number
  dia_semana: number
  fecha: string
  hora: string | null
  red: string
  formato: string
  pilar: string | null
  tema: string | null
  sede: string | null
  requiere_abierto: boolean
  depende_de: string[]
  datos: DatoDeterminado[]
  pendientes: string[]
  pieza_fija: string | null
  origen: 'agente' | 'patron'
  estado: EstadoFila
  avisos: string[]
}

export type Severidad = 'bloquea' | 'aviso'
/** Alcance de la corrección (§10.4): una fila se parchea sola; la frecuencia y el reparto son del conjunto. */
export type Alcance = 'fila' | 'tanda'
export interface Ficha { que: string; donde: string; contra_que: string; gravedad: Severidad; propuesta: string }
export interface Hallazgo { chequeo: string; severidad: Severidad; fila_id: string | null; alcance: Alcance; ficha: Ficha }

/** Red → formatos permitidos (de `cadena_formatos_por_red`). */
export interface FormatoPermitido { formato: string; produccion: 'opera' | 'espera_brazo'; lead_dias: number; max_por_dia: number | null; /** r63 · familia de la oficina que produce este formato (dato de `cadena_formatos_por_red.familia`); ausente/null = sin sala */ familia?: string | null }
export type FormatosPorRed = Record<string, FormatoPermitido[]>

/** Horario de una sede: por día de la semana ISO, tramos [abre, cierra] en HH:MM. Un día sin tramos = cerrado. */
export type HorarioSede = Partial<Record<number, { abre: string; cierra: string }[]>>
export interface SedeInfo { clave: string; nombre?: string; telefono?: string | null; horario: HorarioSede | null }

export type ConfianzaTrozo = 'system_trusted' | 'tenant_trusted' | 'untrusted' | 'unknown'
export type FuenteSede = 'sitio' | 'instagram' | 'mapas'
/** Lo que el código sabe del cliente y puede citar (el flujo lo arma desde la base y se lo pasa; el validador no lee la base). */
export interface Referencia {
  id: string
  client_id: string
  origen: 'ficha' | 'manual' | 'plan' | 'sede_datos' | 'trozo'
  firmada?: boolean
  vigente?: boolean
  confianza?: ConfianzaTrozo
  fuente?: FuenteSede
  sede?: string | null
  texto: string
  observado_en?: string | null
}
