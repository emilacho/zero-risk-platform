/** PASO 7 · tipos compartidos de `recibir`: lo que se guarda (filas de las dos tablas del paso 2) y el almacén que lo guarda. */

export type OrigenDeIngreso = 'dueno' | 'su_fuente' | 'plataforma' | 'tercero'
export const ORIGENES: readonly OrigenDeIngreso[] = ['dueno', 'su_fuente', 'plataforma', 'tercero']
export type Propiedad = 'propia' | 'ajena' | 'incierta'
export type EstadoDeIngreso = 'recibido' | 'fichado' | 'parcial' | 'fallido' | 'bloqueado_por_seguridad'

export interface FilaDeIngreso {
  id: string
  client_id: string
  origen: OrigenDeIngreso
  fuente_ref: string | null
  es_completa: boolean
  huella: string
  material: string | null
  archivo_nombre: string | null
  archivo_tipo: string | null
  archivo_enlace: string | null
  /** el TAMAÑO en bytes: nunca el contenido */
  archivo_bytes: number | null
  segmentos_n: number | null
  segmentos_bloqueados: Array<{ n: number; firma: string; capa: string; severidad: string; texto: string }> | null
  estado: EstadoDeIngreso
  cobertura: number | null
  motivo: string | null
  workflow_id: string
  workflow_execution_id: string
  prueba: boolean
}

export interface FilaDeFicha {
  id: string
  client_id: string
  ingreso_id: string
  ref: string
  clase: string
  titulo: string
  que_es: string
  contenido: string | null
  archivo_nombre: string | null
  archivo_tipo: string | null
  archivo_enlace: string | null
  archivo_bytes: number | null
  firmas: string[]
  origen: OrigenDeIngreso
  fecha_fuente: string | null
  reconfirmado_en: string | null
  plazo: string
  vigente_hasta: string | null
  version_de: string | null
  huella: string
  producto: string[]
  sede: string | null
  propiedad: Propiedad
  porque: string | null
  descartada: boolean
  motivo_descarte: string | null
  juzgado_por: 'modelo' | 'sistema' | 'regla'
  residual: boolean
  provenance_tag: Record<string, unknown>
  prueba: boolean
}

/** una ficha viva ya archivada (lo que se lee para decidir herencia) */
export interface FichaViva { id: string; ref: string; titulo: string; que_es: string; firmas: string[] }

export interface Cambios {
  ingreso_id: string
  client_id: string
  prueba: boolean
  fichas: FilaDeFicha[]
  /** fichas vivas cuyas firmas están TODAS en el material nuevo: solo se renueva `reconfirmado_en` */
  heredadas: string[]
  reconfirmado_en: string
  retiradas: Array<{ id: string; motivo: string }>
  retirada_en: string
  final: { estado: EstadoDeIngreso; cobertura: number | null; motivo: string | null; segmentos_n: number; segmentos_bloqueados: FilaDeIngreso['segmentos_bloqueados'] }
}

export interface ResultadoDeAlmacen { ok: boolean; detalle?: string; id?: string; compensado?: boolean }

export interface Almacen {
  /** guarda el ORIGINAL primero (estado `recibido`) */
  crearIngreso(fila: FilaDeIngreso): Promise<ResultadoDeAlmacen>
  /** todo lo de UN ingreso o nada: fichas nuevas, herencias, retiradas y el estado final del ingreso */
  aplicar(cambios: Cambios): Promise<ResultadoDeAlmacen>
  /** marca el ingreso (fallido, bloqueado…) sin tocar ninguna ficha */
  cerrarIngreso(id: string, final: { estado: EstadoDeIngreso; motivo: string | null; cobertura?: number | null; segmentos_n?: number | null; segmentos_bloqueados?: FilaDeIngreso['segmentos_bloqueados'] }): Promise<ResultadoDeAlmacen>
}
