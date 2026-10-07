/** Lo que devuelve un lector de archivo: el texto leído (o por qué no se pudo), con su huella y sus avisos. Seguro de guardar: no trae los bytes. */
export type TipoDeArchivo = 'pdf' | 'word' | 'hoja' | 'csv' | 'texto' | 'imagen'

export type EstadoDeLecturaDeArchivo =
  | 'ok'
  | 'vacio'
  | 'escaneado'
  | 'ilegible'
  | 'protegido'
  | 'sobre_el_tope'
  | 'tipo_no_admitido'

export interface LecturaDeArchivo {
  estado: EstadoDeLecturaDeArchivo
  tipo: TipoDeArchivo | null
  /** solo una etiqueta: nunca se usa como ruta */
  nombre: string
  mime?: string
  /** SHA-256 del contenido original (hex); nulo si ni siquiera se pudo decodificar */
  huella: string | null
  bytes: number
  /** el texto leído; vacío salvo estado «ok» (en «escaneado» y «vacío» NO se inventa nada) */
  texto: string
  paginas?: number
  /** páginas que parecen imágenes y no traen texto (documento escaneado) */
  paginas_sin_texto?: number[]
  hojas?: string[]
  filas?: number
  /** lo que NO se leyó o se cortó, dicho en palabras */
  avisos: string[]
  /** por qué falló, si falló */
  motivo?: string
}
