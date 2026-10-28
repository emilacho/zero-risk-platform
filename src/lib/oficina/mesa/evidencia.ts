/**
 * EL OBSERVADOR DE IMAGEN Y EL COTEJO MÍNIMO · puro. Condiciones 4 y 5 de CC#3:
 *  · el observador (un modelo de OTRO proveedor) mira cada imagen generada FUERA de la mesa: no aporta ni opina sobre la pieza, solo dice qué texto se ve y qué marcas aparecen;
 *  · el cotejo mínimo lo hace el CÓDIGO: todo texto visible que la pieza no pidió es un hallazgo que BLOQUEA esa imagen (no se elige) — sin listas de palabras.
 */
import type { ObservacionDeImagen } from '../reglas-de-imagen'

export const PEDIDO_DEL_OBSERVADOR = (descripcion: string): string => [
  'Mira la imagen. NO la evalúes ni opines: solo describe lo que se VE, en este formato exacto:',
  'TEXTO_VISIBLE: <cada texto legible en la imagen entre comillas, separados por " | "; si no hay ninguno, escribe: ninguno>',
  'MARCAS: <logotipos o marcas reconocibles, separados por " | "; si no hay, escribe: ninguna>',
  'PERSONAS: <número de personas visibles>',
  `La imagen se pidió así: ${descripcion.slice(0, 600)}`,
].join('\n')

export interface LecturaDelObservador { texto_leido: string[]; marcas: string[]; personas: number; leido: boolean }

const lista = (s: string): string[] => s.split('|').map((x) => x.trim().replace(/^["“”«»']+|["“”«»']+$/g, '').trim()).filter((x) => x && !/^(ninguno|ninguna|n\/a|-)$/i.test(x))

export function leerObservador(texto: string): LecturaDelObservador {
  const t = String(texto ?? '')
  const campo = (k: string) => new RegExp(`${k}\\s*:\\s*(.*)`, 'i').exec(t)?.[1] ?? null
  const tv = campo('TEXTO_VISIBLE'), mc = campo('MARCAS'), ps = campo('PERSONAS')
  if (tv === null) return { texto_leido: [], marcas: [], personas: 0, leido: false }
  return { texto_leido: lista(tv), marcas: mc ? lista(mc) : [], personas: ps ? Math.max(0, parseInt(ps, 10) || 0) : 0, leido: true }
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ]+/g, ' ').trim()

/**
 * Texto que se ve y la pieza no pidió. «Permitido» = el texto de la pieza (títulos, textos, llamados) + el usuario de la marca. Un texto visible pasa si sus palabras están todas en lo permitido.
 * Cotejo mínimo: no juzga estilo ni calidad, solo evita que una imagen entregue un texto, sello o dato que nadie escribió.
 */
export function cotejoDeTexto(visibles: string[], permitido: string[]): { sobrante: string[] } {
  const bolsa = new Set(norm(permitido.join(' ')).split(' ').filter(Boolean))
  const sobrante = visibles.filter((v) => {
    const palabras = norm(v).split(' ').filter(Boolean)
    if (!palabras.length) return false
    return !palabras.every((w) => bolsa.has(w))
  })
  return { sobrante }
}

/** la observación con la forma que ya consume la elección de versiones (`aceptadas` por ref) */
export function observacionDeLaMesa(o: { items: Array<{ indice: number; ref: string }>; lecturas: Record<number, LecturaDelObservador>; permitido: string[]; marcasPropias?: string[] }): {
  observaciones: ObservacionDeImagen[]; aceptadas: Record<string, number[]>; rechazadas: Array<{ indice: number; ref: string; motivo: string }>; sin_lectura: number[]
} {
  const aceptadas: Record<string, number[]> = {}
  const rechazadas: Array<{ indice: number; ref: string; motivo: string }> = []
  const sin_lectura: number[] = []
  const observaciones: ObservacionDeImagen[] = []
  const propias = new Set((o.marcasPropias ?? []).map(norm))
  for (const it of o.items) {
    const l = o.lecturas[it.indice]
    if (!l?.leido) { sin_lectura.push(it.indice); continue } // sin lectura no se decide: el observador no contestó → se acepta con aviso (no se bloquea por falta de ojos)
    const ajenas = l.marcas.filter((m) => !propias.has(norm(m)))
    const { sobrante } = cotejoDeTexto(l.texto_leido, o.permitido)
    observaciones.push({ indice: it.indice, reglas: [], texto_en_imagen: l.texto_leido, marcas: l.marcas, personas: l.personas })
    if (sobrante.length || ajenas.length) {
      rechazadas.push({ indice: it.indice, ref: it.ref, motivo: [sobrante.length ? `texto que la pieza no pidió: ${sobrante.slice(0, 3).join(' | ')}` : '', ajenas.length ? `marca ajena: ${ajenas.slice(0, 3).join(' | ')}` : ''].filter(Boolean).join(' · ') })
    } else (aceptadas[it.ref] ??= []).push(it.indice)
  }
  for (const it of o.items) if (sin_lectura.includes(it.indice)) (aceptadas[it.ref] ??= []).push(it.indice)
  return { observaciones, aceptadas, rechazadas, sin_lectura }
}
