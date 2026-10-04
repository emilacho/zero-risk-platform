/**
 * Plazos de vencimiento por clase de dato · UN solo lugar: `plazos.json` (legible, cambiable por Emilio sin tocar lógica).
 * Constante, no tabla: el diseño pidió que si esto exigía una tabla nueva NO se creara.
 */
import crudo from './plazos.json'

export type ClaseDePlazo =
  | 'precio_oferta_horario' | 'catalogo_y_direccion' | 'publicacion_propia' | 'perfil_propio' | 'ficha_mapas_propia'
  | 'anuncio_competencia' | 'sitio_competencia' | 'plan' | 'normativa' | 'configuracion_externa' | 'sin_plazo'

export type Plazos = Record<ClaseDePlazo, number | null>

interface ArchivoDePlazos { unidad?: unknown; plazos?: Record<string, unknown> }

/** Valida el archivo (o un reemplazo parcial) y lo devuelve como mapa clase → días. Un valor roto se RECHAZA con su nombre. */
export function cargarPlazos(archivo: ArchivoDePlazos, sobrescribir: Partial<Plazos> = {}): Plazos {
  if (archivo.unidad !== 'dias') throw new Error(`plazos: la unidad debe ser «dias» (llegó ${JSON.stringify(archivo.unidad)})`)
  const salida: Record<string, number | null> = {}
  const volcar = (origen: Record<string, unknown>): void => {
    for (const [clase, dias] of Object.entries(origen)) {
      if (dias !== null && !(typeof dias === 'number' && Number.isInteger(dias) && dias > 0)) {
        throw new Error(`plazos: «${clase}» debe ser un entero positivo de días o null (llegó ${JSON.stringify(dias)})`)
      }
      salida[clase] = dias as number | null
    }
  }
  volcar(archivo.plazos ?? {})
  volcar(sobrescribir as Record<string, unknown>)
  return salida as Plazos
}

export const PLAZOS_EN_DIAS: Plazos = cargarPlazos(crudo as ArchivoDePlazos)

const DIA_MS = 86_400_000
const dia = (iso: string): string => iso.slice(0, 10)

export interface Vigencia { vigente_hasta: string | null; vencido: boolean; aviso?: string }

/**
 * Vigencia DERIVADA al leer: fecha de la observación + plazo de su clase. No se guarda nada.
 * Lo vencido NO se oculta: sale con su aviso. Sin fecha o sin plazo: no vence (no se sabe más).
 */
export function vigenciaDe(fecha: string | null, plazoEnDias: number | null, ahora: Date): Vigencia {
  if (!fecha || plazoEnDias === null) return { vigente_hasta: null, vencido: false }
  const t = new Date(fecha).getTime()
  if (Number.isNaN(t)) return { vigente_hasta: null, vencido: false }
  const hasta = new Date(t + plazoEnDias * DIA_MS).toISOString()
  const vencido = new Date(hasta).getTime() < ahora.getTime()
  return vencido
    ? { vigente_hasta: hasta, vencido, aviso: `VENCIDO desde ${dia(hasta)} · última verificación ${dia(new Date(t).toISOString())} · verifícalo antes de afirmarlo` }
    : { vigente_hasta: hasta, vencido }
}
