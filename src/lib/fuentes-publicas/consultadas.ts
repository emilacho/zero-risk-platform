/**
 * Fuentes públicas · «en qué se basó el manual»: cuenta, desde lo crudo guardado, cuántas reseñas, publicaciones y VIDEOS se miraron de verdad (y de cuántos se leyó lo que dicen).
 * PURO. Un ensayo, una corrida que devolvió un error o una fila vacía no cuentan como «mirado». Las líneas salen en lenguaje llano, listas para el manual en limpio.
 */
import { FUNCIONES_DE_FUENTES_PUBLICAS, subtitulosComoTexto, textosDeResenas, type FilaDeRaspado } from '../manual/materia'

const NOMBRE_RESENAS: Record<string, string> = { resenas_google_maps: 'Google Maps', resenas_tripadvisor: 'Tripadvisor', resenas_booking: 'Booking', resenas_facebook: 'Facebook', resenas_app_store: 'App Store', resenas_trustpilot: 'Trustpilot', trustpilot_scraper: 'Trustpilot', software_review_scraper: 'directorios de software' }
const NOMBRE_RED: Record<string, string> = { videos_instagram: 'Instagram', videos_tiktok: 'TikTok', videos_youtube: 'YouTube', publicaciones_facebook: 'Facebook' }
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {})
const texto = (it: Record<string, unknown>, ks: string[]): string => { for (const k of ks) { const v = it[k]; if (typeof v === 'string' && v.trim()) return v.trim() } return '' }

export interface FuentesConsultadas {
  resenas: { total: number; por_plataforma: Record<string, number> }
  publicaciones: { total: number; por_red: Record<string, number> }
  videos: { vistos: number; con_transcripcion: number; por_red: Record<string, { vistos: number; con_transcripcion: number }> }
}

export function fuentesConsultadas(filas: Array<Pick<FilaDeRaspado, 'apify_function' | 'respuesta' | 'ensayo'>>): FuentesConsultadas {
  const r: FuentesConsultadas = { resenas: { total: 0, por_plataforma: {} }, publicaciones: { total: 0, por_red: {} }, videos: { vistos: 0, con_transcripcion: 0, por_red: {} } }
  for (const f of filas) {
    if (f.ensayo || !FUNCIONES_DE_FUENTES_PUBLICAS.test(f.apify_function)) continue
    const items = Array.isArray(f.respuesta) ? f.respuesta : []
    if (f.apify_function.startsWith('resenas_')) {
      let n = 0
      for (const it of items) n += textosDeResenas(obj(it)).length
      if (n) { const k = NOMBRE_RESENAS[f.apify_function] ?? f.apify_function; r.resenas.por_plataforma[k] = (r.resenas.por_plataforma[k] ?? 0) + n; r.resenas.total += n }
    } else if (f.apify_function === 'publicaciones_facebook') {
      const n = items.filter((it) => texto(obj(it), ['text', 'message', 'caption', 'postText'])).length
      if (n) { r.publicaciones.por_red.Facebook = (r.publicaciones.por_red.Facebook ?? 0) + n; r.publicaciones.total += n }
    } else if (f.apify_function.startsWith('videos_')) {
      const red = NOMBRE_RED[f.apify_function] ?? f.apify_function
      for (const raw of items) {
        const it = obj(raw)
        if (it.error || it.errorDescription) continue
        const pie = texto(it, ['caption', 'text', 'description', 'title'])
        const dicho = texto(it, ['transcript', 'transcription', 'videoTranscript', 'subtitle']) || subtitulosComoTexto(it.subtitles)
        if (!pie && !dicho) continue
        const e = (r.videos.por_red[red] ??= { vistos: 0, con_transcripcion: 0 })
        e.vistos++; r.videos.vistos++
        if (dicho) { e.con_transcripcion++; r.videos.con_transcripcion++ }
      }
    }
  }
  return r
}

/** las líneas que lleva el manual en limpio · vacío si no se miró nada (el manual no cambia) */
export function lineasDeFuentesConsultadas(c: FuentesConsultadas): string[] {
  const l: string[] = []
  if (c.resenas.total) l.push(`Reseñas públicas leídas: ${c.resenas.total} (${Object.entries(c.resenas.por_plataforma).map(([k, v]) => `${k} ${v}`).join(' · ')}).`)
  if (c.videos.vistos) l.push(`Videos mirados: ${c.videos.vistos}, de los que se leyó lo que dicen en ${c.videos.con_transcripcion} (${Object.entries(c.videos.por_red).map(([k, v]) => `${k} ${v.vistos}`).join(' · ')}).`)
  if (c.publicaciones.total) l.push(`Publicaciones leídas: ${c.publicaciones.total} (${Object.entries(c.publicaciones.por_red).map(([k, v]) => `${k} ${v}`).join(' · ')}).`)
  return l
}

/** para el chequeo de «las fuentes de este rubro»: cuántas filas de fuentes públicas hay (de cualquier tipo) */
export const hayFuentesPublicas = (filas: Array<Pick<FilaDeRaspado, 'apify_function' | 'ensayo'>>): boolean => filas.some((f) => !f.ensayo && FUNCIONES_DE_FUENTES_PUBLICAS.test(f.apify_function))
