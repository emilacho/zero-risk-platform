/**
 * Sprint 2 · S2-6 · LA ÚNICA PUERTA de la mesa de video al cerebro (Lenovo 17-nov, versión «estrecha»): solo LEE, siempre por `client_id` y con columnas nombradas.
 * - `client_videos`: los reels de afuera ya guardados (competidor/referencia, bajados); con más de 500 entran los 500 más NUEVOS (hoy son decenas).
 * - `cerebro_tendencias`: el nivel, la red, las vistas y los me gusta de cada video.
 * - `client_social_images`: lo que nuestra visión vio en sus capturas.
 * No escribe nada. Un error se lanza; el turno lo toma como «sin referencias» con aviso (nunca frena la pieza).
 */
import type { Db } from '../almacen-supabase'

type Fila = Record<string, unknown>
const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])

export async function leerReferenciasDeVideo(db: Db, clientId: string): Promise<{ videos: Fila[]; tendencias: Fila[]; capturas: Fila[] }> {
  const [v, t, c] = await Promise.all([
    db.from('client_videos').select('id,owner_role,handle,tipo,estado,duracion_s,caption,transcripcion,metricas').eq('client_id', clientId).in('owner_role', ['competidor', 'referencia']).eq('estado', 'ok').order('created_at', { ascending: false }).limit(500),
    db.from('cerebro_tendencias').select('video_id,nivel,red,vistas,me_gusta').eq('client_id', clientId).not('video_id', 'is', null).limit(2000),
    db.from('client_social_images').select('video_id,posicion,estado,que_muestra,tipo_de_toma,texto_visible,producto_visto,con_personas').eq('client_id', clientId).eq('tipo', 'video_captura').limit(3000),
  ])
  if (v.error) throw new Error(`videos de referencia: ${v.error.message}`)
  if (t.error) throw new Error(`tendencias de los videos: ${t.error.message}`)
  if (c.error) throw new Error(`momentos de los videos: ${c.error.message}`)
  return { videos: lista(v.data), tendencias: lista(t.data), capturas: lista(c.data) }
}
