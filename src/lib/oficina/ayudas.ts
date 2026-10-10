/**
 * AYUDAS COMPARTIDAS del orquestador de la sala 1 (post con foto) y del de láminas (salas 2 y 3). Puras. Estaban dentro de `orquestador.ts`; se sacaron para no duplicarlas ni importar en círculo.
 */
import type { BriefLeido } from './brief'
import type { FuentesCompletas } from './puertos'
import type { ReglasDeImagen } from './reglas-de-imagen'
import type { Estado, Ficha } from './tipos'

export const datos = (e: Estado, n: string): Record<string, unknown> | undefined => e.artefactos[n]?.datos

export function reglasVisuales(e: Estado, brief: BriefLeido): ReglasDeImagen {
  const rv = (datos(e, 'visual_direction')?.reglas_de_imagen ?? { obligatorio: [], prohibido: [] }) as ReglasDeImagen
  return {
    obligatorio: [...rv.obligatorio, ...brief.visual_obligatorio.map((t, i) => ({ id: `brief-o${i + 1}`, texto: t }))],
    prohibido: [...rv.prohibido, ...brief.visual_prohibido.map((t, i) => ({ id: `brief-p${i + 1}`, texto: t }))],
  }
}
/** para los prompts además se vigilan las palabras prohibidas del manual y del brief */
export function reglasParaPrompts(e: Estado, brief: BriefLeido, F: FuentesCompletas): ReglasDeImagen {
  const v = reglasVisuales(e, brief)
  const palabras = [...F.fuentes.palabras_prohibidas, ...brief.prohibido]
  return { obligatorio: v.obligatorio, prohibido: [...v.prohibido, ...palabras.map((p, i) => ({ id: `txt-p${i + 1}`, texto: `palabra prohibida «${p}»`, claves: [p] }))] }
}

export const fichaNueva = (id: string, origen: Ficha['origen'], donde: string, gravedad: Ficha['gravedad'], que: string, contra_que = 'proceso de la oficina', propuesta = 'revisar'): Ficha => ({ id, origen, donde, gravedad, estado: 'abierta', que, contra_que, propuesta })
