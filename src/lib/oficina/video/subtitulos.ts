/**
 * SUBTÍTULOS PALABRA POR PALABRA · Sprint 3 · T5 (CC4 · GO Lenovo 17-nov 11:54 · US$ 0).
 *
 * Las palabras con su tiempo (las da la transcripción local del servicio de render, o la voz cuando T3 traiga sus tiempos) se limpian y se
 * agrupan en subtítulos cortos; la plantilla del video (`htmlDeVideo`) dibuja cada grupo en sus segundos con la palabra que suena resaltada.
 * Reglas tomadas de la guía de hyperframes `captions` (heygen-com/hyperframes, Apache-2.0):
 *  · la transcripción FALLÓ si más del 20 % son símbolos (♪, �) o nada legible: entonces no hay subtítulos (aviso), nunca se inventan;
 *  · Whisper inventa frases sobre el silencio final: se descartan las palabras que empiezan después de que la voz terminó (si se sabe);
 *  · grupos de 2–3 palabras con energía alta, 3–5 en conversación, 4–6 en calma (DATO de la pieza); se corta al final de frase,
 *    en una pausa de 150 ms o más, o al llegar al máximo;
 *  · un grupo no abre en el segundo 0 exacto (parece que ya estaba): entra a los 0,1 s como mínimo;
 *  · las palabras se emparejan por POSICIÓN, nunca por texto (una palabra repetida no toma el tiempo de otra).
 * Puro: sin red, sin base, sin modelo. Agnóstico: no sabe de idiomas ni de clientes.
 */
import type { GrupoDeSubtitulo, PalabraConTiempo } from '../../../../packages/carousel-engine/src/video-html'

export type { GrupoDeSubtitulo, PalabraConTiempo }
export type EnergiaDeSubtitulos = 'alta' | 'conversacion' | 'calma'

/** cuántas palabras caben en un grupo según la energía de la pieza (guía de hyperframes) */
export const PALABRAS_POR_GRUPO: Record<EnergiaDeSubtitulos, { min: number; max: number }> = {
  alta: { min: 2, max: 3 },
  conversacion: { min: 3, max: 5 },
  calma: { min: 4, max: 6 },
}
/** una pausa así de larga entre dos palabras corta el grupo */
export const PAUSA_QUE_CORTA_S = 0.15
/** el primer grupo no abre antes de esto */
export const ENTRADA_MINIMA_S = 0.1
/** más de esta fracción de símbolos (♪, �) o basura = la transcripción falló */
export const FRACCION_MAXIMA_DE_SIMBOLOS = 0.2

const SIMBOLO = /^[\s♪♫��*·.,;:!?¡¿…\-–—"'«»()[\]]*$/
const FIN_DE_FRASE = /[.!?…]["'»)\]]*$/

/** lo que trae el transcriptor, tal cual: se acepta `texto|text|word` y `desde|start` / `hasta|end` (segundos) */
export type PalabraCruda = Record<string, unknown>

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
const textoDe = (p: PalabraCruda): string => String(p.texto ?? p.text ?? p.word ?? '').replace(/\s+/g, ' ').trim()

export type LecturaDePalabras =
  | { ok: true; palabras: PalabraConTiempo[]; descartadas: number }
  | { ok: false; motivo: string }

/**
 * limpia lo que devolvió el transcriptor: fuera los símbolos y las palabras sin tiempo válido; en orden; el final nunca antes del inicio;
 * con `finDeVoz` (segundo en que termina la voz real), fuera lo que empieza después. Si más del 20 % era basura, la transcripción falló.
 */
export function leerPalabras(crudas: unknown, o: { segundos: number; finDeVoz?: number | null }): LecturaDePalabras {
  if (!Array.isArray(crudas)) return { ok: false, motivo: 'la transcripción no trae una lista de palabras' }
  const lista = crudas.filter((p): p is PalabraCruda => !!p && typeof p === 'object')
  if (!lista.length) return { ok: false, motivo: 'la transcripción vino vacía (no hay voz que subtitular)' }
  const simbolos = lista.filter((p) => SIMBOLO.test(textoDe(p))).length
  if (simbolos / lista.length > FRACCION_MAXIMA_DE_SIMBOLOS) return { ok: false, motivo: `la transcripción falló: ${simbolos} de ${lista.length} palabras son símbolos o ruido` }
  const fin = Math.min(o.segundos, o.finDeVoz != null && Number.isFinite(o.finDeVoz) ? o.finDeVoz : o.segundos)
  const palabras: PalabraConTiempo[] = []
  for (const p of lista) {
    const texto = textoDe(p)
    const desde = num(p.desde ?? p.start)
    const hasta = num(p.hasta ?? p.end)
    if (!texto || SIMBOLO.test(texto) || desde === null || hasta === null || desde < 0 || desde >= fin) continue
    palabras.push({ texto, desde, hasta: Math.min(o.segundos, Math.max(desde, hasta)) })
  }
  // el orden de llegada manda si dos empiezan igual (sort estable): se empareja por posición, no por texto
  palabras.sort((a, b) => a.desde - b.desde)
  if (!palabras.length) return { ok: false, motivo: 'la transcripción no trae ninguna palabra con tiempo dentro del video' }
  return { ok: true, palabras, descartadas: lista.length - palabras.length }
}

/** agrupa las palabras en subtítulos: corta al final de frase, en una pausa ≥ 150 ms o al máximo de la energía; nunca dos grupos a la vez */
export function agruparPalabras(palabras: PalabraConTiempo[], energia: EnergiaDeSubtitulos = 'conversacion'): GrupoDeSubtitulo[] {
  const { max } = PALABRAS_POR_GRUPO[energia] ?? PALABRAS_POR_GRUPO.conversacion
  const grupos: GrupoDeSubtitulo[] = []
  let actual: PalabraConTiempo[] = []
  const cerrar = () => {
    if (!actual.length) return
    grupos.push({ desde: actual[0].desde, hasta: actual[actual.length - 1].hasta, palabras: actual })
    actual = []
  }
  for (const p of palabras) {
    const previa = actual[actual.length - 1]
    if (previa && (FIN_DE_FRASE.test(previa.texto) || Math.round((p.desde - previa.hasta) * 1000) >= Math.round(PAUSA_QUE_CORTA_S * 1000) || actual.length >= max)) cerrar()
    actual.push(p)
  }
  cerrar()
  // un grupo abre a los 0,1 s como mínimo y nunca antes de que cierre el anterior; cierra cuando termina su última palabra
  let ultimo = 0
  for (const g of grupos) {
    g.desde = Math.max(g.desde, ENTRADA_MINIMA_S, ultimo)
    g.hasta = Math.max(g.hasta, g.desde)
    ultimo = g.hasta
  }
  return grupos
}

/** la energía de los subtítulos como dato de la pieza: lo que no se reconoce queda en conversación */
export function energiaDe(v: unknown): EnergiaDeSubtitulos {
  return v === 'alta' || v === 'calma' || v === 'conversacion' ? v : 'conversacion'
}
