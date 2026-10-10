/**
 * LISTO PARA ENTREGAR (paso 5) · las oportunidades como DATOS para la cadena. NUNCA crea piezas ni publica. PURO.
 * De las reseñas y los comentarios solo salen SEÑALES AGREGADAS (sin nombre ni texto citable).
 */
import type { Diferencia } from './comparar'
import { frasePorComentarios, frasePorSenales, type SenalesDeComentarios, type SenalesDeResenas } from './resenas'

export type ClaseDeOportunidad = 'precio_cambio' | 'horario_cambio' | 'texto_nuevo' | 'senal_de_resenas' | 'senal_de_comentarios'
export interface Oportunidad { clase: ClaseDeOportunidad; titulo: string; dato: string; cita: string | null; fuente: string; vence_en: string | null }
export const MAX_TEXTOS_NUEVOS_POR_FUENTE = 10
const DIA = 86_400_000

export function oportunidadesDeCambios(fuente: string, d: Diferencia, ahora: Date): Oportunidad[] {
  const vence = (dias: number) => new Date(ahora.getTime() + dias * DIA).toISOString()
  const out: Oportunidad[] = []
  let textos = 0
  for (const l of d.nuevas) {
    if (l.clase === 'transitorio') continue
    if (l.clase === 'precio') out.push({ clase: 'precio_cambio', titulo: 'Precio nuevo o cambiado', dato: l.linea, cita: l.linea, fuente, vence_en: vence(7) })
    else if (l.clase === 'horario') out.push({ clase: 'horario_cambio', titulo: 'Horario nuevo o cambiado', dato: l.linea, cita: l.linea, fuente, vence_en: vence(7) })
    else if (textos++ < MAX_TEXTOS_NUEVOS_POR_FUENTE) out.push({ clase: 'texto_nuevo', titulo: 'Texto nuevo del cliente', dato: l.linea, cita: l.linea, fuente, vence_en: vence(14) })
  }
  return out
}

export function oportunidadDeResenas(s: SenalesDeResenas, ahora: Date): Oportunidad | null {
  if (!s.total) return null
  return { clase: 'senal_de_resenas', titulo: 'Señal de las reseñas', dato: frasePorSenales(s), cita: null, fuente: 'resenas', vence_en: new Date(ahora.getTime() + 7 * DIA).toISOString() }
}
export function oportunidadDeComentarios(s: SenalesDeComentarios, ahora: Date): Oportunidad | null {
  if (!s.total) return null
  return { clase: 'senal_de_comentarios', titulo: 'Señal de los comentarios', dato: frasePorComentarios(s), cita: null, fuente: 'comentarios', vence_en: new Date(ahora.getTime() + 7 * DIA).toISOString() }
}
