/**
 * 09-nov · C (GO de Lenovo, firma de Emilio · CC#2): la campaña que la cadena dejó en `necesita_humano` aparece en Decisiones.
 * Antes no la leía nadie: el pizarrón decía «esperando tu decisión» y en Decisiones no había nada (el cliente piloto, 06-nov → 09-nov).
 * Solo lectura. La tarjeta AVISA (`permite: []`): todavía no hay un botón que reabra desde el tablero, y una acción sin ruta real no se muestra.
 * El motivo de la cadena es texto interno (habla de hitos y días): viaja en `campana.motivo`, nunca en el título.
 */
import { consultasDeDireccion } from '../cadena/almacen-supabase'
import { leer, texto, type Fila, type Fuente } from './comun'

type Db = { from(tabla: string): any }
const TOPE = 50

export const TITULO_CAMPANA_DETENIDA = 'La campaña está detenida: necesita que alguien la destrabe'
export const PARA_QUE_CAMPANA_DETENIDA = 'La cadena no puede seguir sola con esta campaña. Hasta que se destrabe no se escribe el brief, no sesiona la gran idea y no sale ninguna publicación.'
export const DESTRABA_CAMPANA_DETENIDA = 'Reabrirla la vuelve a armar desde la estrategia. Reabrir no gasta; lo que sigue gasta con sus topes de siempre.'
export const AL_VENCER: Record<string, string> = { pausada: 'si nadie la destraba antes, la campaña queda en pausa sola' }

export interface CampanaDetenida {
  id: string
  estado: string
  /** el motivo de la cadena, tal cual (interno) */
  motivo: string | null
  /** la espera que la sostiene: cuándo vence y qué pasa al vencer */
  espera: { vence_en: string | null; al_vencer: string | null; al_vencer_texto: string | null } | null
}

/** las campañas reales (no ensayo, no archivadas) que esperan a una persona, con su espera viva. Una lectura que falla queda en `fuentes` (y `completo` lo dice) */
export async function leerCampanasDetenidas(db: Db, fuentes: Fuente[]): Promise<Array<{ fila: Fila; campana: CampanaDetenida }>> {
  const campanas = await leer(fuentes, 'cadena_campanas', consultasDeDireccion(db).campanasQueEsperanAUnaPersona(TOPE), TOPE)
  if (!campanas.length) return []
  const esperas = await leer(fuentes, 'cadena_esperas', consultasDeDireccion(db).esperasDeUnaPersona(campanas.map((c) => String(c.id)), TOPE), TOPE)
  return campanas.map((c) => {
    const e = esperas.filter((x) => String(x.campana_id) === String(c.id)).sort((a, b) => String(a.vence_en ?? '9').localeCompare(String(b.vence_en ?? '9')))[0]
    const alVencer = e ? texto(e.accion_al_vencer) : null
    return {
      fila: { ...c, desde: e ? texto(e.desde) : null },
      campana: {
        id: String(c.id), estado: String(c.estado), motivo: texto(c.estado_motivo),
        espera: e ? { vence_en: texto(e.vence_en), al_vencer: alVencer, al_vencer_texto: alVencer ? AL_VENCER[alVencer] ?? null : null } : null,
      },
    }
  })
}
