/**
 * PASO 7 · cortar el material en SEGMENTOS, firmar cada uno y numerarlos para el modelo.
 * Todo es mecánico (sin modelo): cada segmento es un tramo EXACTO del original (con su posición), así que nada se inventa ni se pierde.
 * La firma depende solo del texto (sin espacios de más), NO de la numeración: insertar un párrafo no cambia la firma de lo que ya estaba.
 */
import { createHash } from 'node:crypto'

export const LARGO_MAXIMO_DE_SEGMENTO = 600

export interface Segmento { n: number; texto: string; inicio: number; fin: number; firma: string }

export const firmaDe = (texto: string): string =>
  createHash('sha256').update(texto.replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 24)

const ESPACIO = /\s/

/** Parte `[desde, hasta)` (ya recortado) en tramos de a lo más 600: salto de línea, si no fin de frase, si no espacio, si no corte duro. */
function partirParrafo(m: string, desde: number, hasta: number): Array<[number, number]> {
  const salida: Array<[number, number]> = []
  let i = desde
  while (i < hasta) {
    let corte = hasta
    if (hasta - i > LARGO_MAXIMO_DE_SEGMENTO) {
      const limite = i + LARGO_MAXIMO_DE_SEGMENTO
      let porLinea = -1, porFrase = -1, porEspacio = -1
      for (let k = i + 1; k <= limite; k++) {
        const c = m[k]
        if (c === '\n') porLinea = k
        if (ESPACIO.test(c)) {
          porEspacio = k
          if (/[.!?]/.test(m[k - 1])) porFrase = k
        }
      }
      corte = porLinea > i ? porLinea : porFrase > i ? porFrase : porEspacio > i ? porEspacio : limite
    }
    let a = i, b = corte
    while (a < b && ESPACIO.test(m[a])) a++
    while (b > a && ESPACIO.test(m[b - 1])) b--
    if (b > a) salida.push([a, b])
    i = corte
  }
  return salida
}

export function cortarEnSegmentos(material: string): Segmento[] {
  const tramos: Array<[number, number]> = []
  let desde = 0
  const hueco = /\r?\n(?:[ \t]*\r?\n)+/g
  const cortes: Array<[number, number]> = []
  for (let r = hueco.exec(material); r; r = hueco.exec(material)) cortes.push([r.index, r.index + r[0].length])
  cortes.push([material.length, material.length])
  for (const [ini, fin] of cortes) {
    let a = desde, b = ini
    while (a < b && ESPACIO.test(material[a])) a++
    while (b > a && ESPACIO.test(material[b - 1])) b--
    if (b > a) tramos.push(...partirParrafo(material, a, b))
    desde = fin
  }
  return tramos.map(([inicio, fin], i) => {
    const texto = material.slice(inicio, fin)
    return { n: i + 1, texto, inicio, fin, firma: firmaDe(texto) }
  })
}

/** «[n] texto» por segmento, separados por una línea en blanco; conserva el número original. */
export const numerarSegmentos = (segmentos: Segmento[]): string => segmentos.map((s) => `[${s.n}] ${s.texto}`).join('\n\n')
