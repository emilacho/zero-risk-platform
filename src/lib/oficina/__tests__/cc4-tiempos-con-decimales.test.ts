/**
 * 18-nov · GO Lenovo «los creativos ven las fotos» · de paso, hallazgo 1 de la ingeniería inversa del reel de Olón (CC7): la mesa escribió
 * «## Plano 1 · 0–2.5 s … ## Plano 4 · 7.5–10 s». El traductor solo leía enteros: «2.5–5 s» salía 5–5 (descartado), el guion caía al mínimo de 8 s
 * repartido en partes iguales y salían avisos de ritmo falsos. Ahora lee punto o coma decimal y redondea cada corte al segundo (el brazo trabaja en enteros). US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { tiempos, traducirGuion } from '../video/guion'

/** la hoja real de la Propuesta 1 del reel de Olón (A18), con sus tiempos tal cual */
const OLON_P1 = [
  '## Plano 1 · 0–2.5 s', 'Rol: captar', 'Se ve: el bowl de encebollado en macro',
  '## Plano 2 · 2.5–5 s', 'Rol: situar', 'Se ve: la terraza frente al mar',
  '## Plano 3 · 5–7.5 s', 'Rol: ambiente', 'Se ve: el vapor y la cebolla',
  '## Plano 4 · 7.5–10 s', 'Rol: conclusión', 'Se ve: el bowl en la mesa',
].join('\n')

describe('el traductor de tiempos lee medios segundos', () => {
  it('punto o coma decimal, guion largo o corto, «a»; los enteros siguen igual', () => {
    expect(tiempos('Plano 1 · 0–2.5 s')).toEqual({ desde: 0, hasta: 2.5 })
    expect(tiempos('Plano 2 · 2.5–5 s')).toEqual({ desde: 2.5, hasta: 5 })
    expect(tiempos('Plano 3 · 5,5-7,5 s')).toEqual({ desde: 5.5, hasta: 7.5 })
    expect(tiempos('Plano 4 · 7.5 a 10 s')).toEqual({ desde: 7.5, hasta: 10 })
    expect(tiempos('Plano 1 · 0–3 s')).toEqual({ desde: 0, hasta: 3 })
    expect(tiempos('Plano 1 · 5–5 s')).toBeNull()
    expect(tiempos('Plano 1')).toBeNull()
  })
  it('la Propuesta 1 de Olón conserva sus 10 s, sin «se reparten en partes iguales» ni avisos de ritmo falsos; los cortes se redondean al segundo', () => {
    const g = traducirGuion(OLON_P1)
    expect(g.ok).toBe(true)
    expect(g.segundos).toBe(10)
    expect(g.planos.map((p) => [p.desde, p.hasta])).toEqual([[0, 3], [3, 5], [5, 8], [8, 10]])
    expect(g.avisos.join(' | ')).not.toMatch(/partes iguales|vale el guion|se alarga/)
    for (const p of g.planos) { expect(Number.isInteger(p.desde)).toBe(true); expect(Number.isInteger(p.hasta)).toBe(true); expect(p.hasta).toBeGreaterThan(p.desde) }
  })
  it('un corte de medio segundo que se juntaría al redondear deja el plano con 1 s como mínimo', () => {
    const g = traducirGuion(['## Plano 1 · 0–8 s', 'Se ve: la calle', '## Plano 2 · 8–8.4 s', 'Se ve: la puerta', '## Plano 3 · 8.4–10 s', 'Se ve: el cartel'].join('\n'))
    for (const p of g.planos) expect(p.hasta).toBeGreaterThan(p.desde)
  })
  it('un guion con medios segundos más largo que lo aprobado se encaja igual que antes, en enteros', () => {
    const g = traducirGuion(['## Plano 1 · 0–7.5 s', 'Se ve: a', '## Plano 2 · 7.5–20 s', 'Se ve: b'].join('\n'), { segundosMin: 8, segundosMax: 15 })
    expect(g.segundos).toBe(15)
    expect(g.planos.map((p) => [p.desde, p.hasta])).toEqual([[0, 6], [6, 15]])
  })
})
