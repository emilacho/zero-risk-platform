/**
 * NUEVOS BRAZOS DEL CEREBRO (15-oct · firma de Emilio «dale si a todo») · TIPOS COMUNES.
 *
 * Cuatro brazos, TODOS APAGADOS por omisión (un interruptor cada uno); sin ellos el portero queda idéntico a hoy:
 *   · contexto    · feriados y temporada por país/zona (catálogo, US$ 0, sin cliente)
 *   · demanda     · posición local en Mapas para búsquedas SIN marca (quien sale primero entra como competidor SUGERIDO)
 *   · competencia · competidores que el dueño CONFIRMÓ, uno por día de semana (alcance = competidor)
 *   · propios     · cifras medidas del cliente: punto de venta (Loyverse) y Meta, con la llave DEL CLIENTE
 *
 * Reglas duras que viven aquí y se prueban:
 *   · una cifra de un competidor o de la zona NUNCA es una cifra del cliente: lleva `alcance` y su nombre en el texto;
 *   · NADA se borra: lo nuevo reemplaza a lo vigente por CÓDIGO (sin modelo) y lo viejo queda retirado con su fecha;
 *   · nada de datos personales de terceros: ni autores de reseñas ni usuarios de publicaciones ajenas.
 */
export type NombreDeBrazo = 'contexto' | 'demanda' | 'competencia' | 'propios'
export type Alcance = 'cliente' | 'competidor' | 'mercado' | 'zona'
/** el `client_id` de las fichas de zona: texto reservado, nunca un uuid de cliente (la tabla guarda `client_id` como texto) */
export { PREFIJO_DE_ZONA } from '../../cerebro/zona'

export interface BrazosActivos { contexto: boolean; demanda: boolean; competencia: boolean; propios: boolean }
export const BRAZOS_APAGADOS: BrazosActivos = { contexto: false, demanda: false, competencia: false, propios: false }
export function brazosDelEntorno(env: Record<string, string | undefined> = process.env): BrazosActivos {
  const on = (k: string) => String(env[k] ?? '').trim().toLowerCase() === 'on'
  return { contexto: on('PORTERO_BRAZO_CONTEXTO'), demanda: on('PORTERO_BRAZO_DEMANDA'), competencia: on('PORTERO_BRAZO_COMPETENCIA'), propios: on('PORTERO_BRAZO_PROPIOS') }
}
export const hayBrazoActivo = (b: BrazosActivos | undefined): boolean => !!b && (b.contexto || b.demanda || b.competencia || b.propios)

/** una ficha que un brazo quiere archivar (todavía sin escribir) */
export interface FichaDeBrazo {
  brazo: NombreDeBrazo
  alcance: Alcance
  client_id: string
  /** único por cliente: es la llave de idempotencia (la misma ficha dos veces no se escribe dos veces) */
  ref: string
  /** clave de la que la ficha nueva REEMPLAZA a la vigente del mismo (client_id, atributo) cuando `decision` = reemplaza */
  atributo: string
  clase: string
  titulo: string
  contenido: string
  origen: 'tercero' | 'plataforma'
  fuente_url: string | null
  fecha_fuente: string | null
  observado_en: string
  vigente_hasta: string | null
  decision: 'suma' | 'reemplaza'
  /** a quién se refiere (competidor, zona…) · solo para mostrar y probar */
  sobre?: string
  /** datos estructurados que otro paso necesita leer de vuelta (van en `provenance_tag.datos`): sede, cuenta de Instagram, web… nunca llaves */
  datos?: Record<string, unknown>
}

/** lo que `data` de un brazo devuelve a quien lo llamó */
export interface ResultadoDeUnBrazo {
  brazo: NombreDeBrazo
  estado: 'apagado' | 'sin_material' | 'listo' | 'fallo'
  detalle?: string
  fichas: FichaDeBrazo[]
  declarado: string[]
}

/** una acción de Apify que un brazo pide (misma forma que las del portero; el plan la recorta al tope y a las 16 corridas) */
export interface AccionDeBrazo {
  fuente: 'demanda' | 'competencia'
  funcion: string
  params: Record<string, unknown>
  metadata: { target_kind: 'own' | 'third_party'; llamado_por: string }
  usd_max: number
  medido: boolean
  objetivo: string
}
/** el marcador que el brazo deja en `params` (el Servicio guarda los params tal cual en `apify_raw` y NO guarda la metadata): con él, el archivo reconoce lo que pidió el brazo */
export const MARCA_DE_BRAZO = '_brazo'
export const slugDe = (t: unknown): string => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
/** quita @usuarios (datos personales de terceros) y recorta */
export const sinUsuarios = (t: unknown, max = 160): string => String(t ?? '').replace(/@[\w.]+/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
export const DIA_EN_MS = 86_400_000
