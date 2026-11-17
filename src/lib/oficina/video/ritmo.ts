/**
 * MONTAJE AL RITMO · Sprint 3 · T5 (CC4 · GO Lenovo 17-nov 11:54 · US$ 0).
 *
 * Hoy cada plano dura lo que dice el guion. Cuando la pieza lleva música (la pista de T4, o la que dé el cliente), el corte entre dos planos se
 * corre al GOLPE de la música más cercano: el mapa de golpes lo saca el servicio de render (`hyperframes beats`, local, gratis).
 * Reglas (guía de hyperframes `music-to-video` / «On music»):
 *  · solo se confía en los golpes cuando el tempo es claro (`confianza: 'high'`); con música tranquila el detector inventa un metrónomo:
 *    entonces NO se mueve nada y queda el aviso (el corte por frases es otra pieza);
 *  · un corte se corre como mucho `tolerancia_s` (por omisión 0,6 s) y nunca deja un plano más largo que su clip ni más corto que `minimo_s`;
 *  · el largo total se conserva (el último plano termina donde terminaba), salvo que su clip no alcance.
 * Un corte que no tiene golpe cerca se queda donde estaba. Puro: sin red, sin base. Agnóstico: no sabe de rubros ni de clientes.
 */

export interface PlanoParaElRitmo {
  n: number
  /** lo que dura el plano en el video unido (el guion) */
  cortar_a_s: number
  /** lo que dura el clip generado: el plano nunca puede durar más */
  segundos: number
}
export type ConfianzaDelTempo = 'high' | 'low' | 'uncertain'
export interface MapaDeGolpes { golpes: number[]; confianza: ConfianzaDelTempo; bpm?: number | null }

export const TOLERANCIA_POR_OMISION_S = 0.6
export const MINIMO_POR_OMISION_S = 1

export type MontajeAlRitmo =
  | { movido: true; planos: Array<{ n: number; cortar_a_s: number }>; cortes_movidos: number; total_s: number }
  | { movido: false; planos: Array<{ n: number; cortar_a_s: number }>; motivo: string; total_s: number }

const ms = (x: number) => Math.round(x * 1000) / 1000

/** corre cada corte entre planos al golpe más cercano de la música, dentro de los límites de cada clip */
export function montarAlRitmo(planos: PlanoParaElRitmo[], mapa: MapaDeGolpes | null | undefined, o: { tolerancia_s?: number; minimo_s?: number } = {}): MontajeAlRitmo {
  const tal = planos.map((p) => ({ n: p.n, cortar_a_s: p.cortar_a_s }))
  const total = ms(planos.reduce((s, p) => s + p.cortar_a_s, 0))
  const quieto = (motivo: string): MontajeAlRitmo => ({ movido: false, planos: tal, motivo, total_s: total })
  if (planos.length < 2) return quieto('un solo plano: no hay cortes que mover')
  if (!mapa) return quieto('la pieza no tiene mapa de golpes (sin música)')
  if (mapa.confianza !== 'high') return quieto(`el tempo de la música no es claro (${mapa.confianza}): los cortes quedan donde los puso el guion`)
  const golpes = [...new Set((mapa.golpes ?? []).filter((g) => typeof g === 'number' && Number.isFinite(g) && g > 0))].sort((a, b) => a - b)
  if (!golpes.length) return quieto('la música no trae golpes')
  const tol = o.tolerancia_s ?? TOLERANCIA_POR_OMISION_S
  const minimo = o.minimo_s ?? MINIMO_POR_OMISION_S

  const salida: Array<{ n: number; cortar_a_s: number }> = []
  let previo = 0
  let plan = 0
  let movidos = 0
  for (let i = 0; i < planos.length - 1; i++) {
    const p = planos[i]
    plan += p.cortar_a_s
    // lo que falta después de este corte tiene que caber en los planos que quedan (cada uno al menos el mínimo)
    const techo = total - minimo * (planos.length - 1 - i)
    const dentro = (c: number) => c - previo >= Math.min(minimo, p.cortar_a_s) && c - previo <= p.segundos && c <= techo
    const candidatos = golpes.filter((g) => Math.abs(g - plan) <= tol && dentro(g))
    let corte: number
    if (candidatos.length) {
      corte = candidatos.reduce((a, b) => (Math.abs(b - plan) < Math.abs(a - plan) ? b : a))
      if (Math.abs(corte - plan) > 1e-6) movidos++
    } else {
      // sin golpe cerca, el corte queda donde estaba; si el corte anterior se adelantó, el plano no puede pasar de su clip
      // (y si el anterior se atrasó, este no queda más corto que el mínimo)
      corte = Math.max(previo + Math.min(minimo, p.cortar_a_s, p.segundos), Math.min(plan, previo + p.segundos))
    }
    salida.push({ n: p.n, cortar_a_s: ms(corte - previo) })
    previo = corte
  }
  const ultimo = planos[planos.length - 1]
  salida.push({ n: ultimo.n, cortar_a_s: ms(Math.min(total - previo, ultimo.segundos)) })
  const nuevoTotal = ms(salida.reduce((s, p) => s + p.cortar_a_s, 0))
  if (!movidos) return { movido: false, planos: tal, motivo: 'ningún corte tenía un golpe de la música cerca', total_s: total }
  return { movido: true, planos: salida, cortes_movidos: movidos, total_s: nuevoTotal }
}
