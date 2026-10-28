/**
 * LA MESA · el dibujo se ajusta al texto (condición 7 de CC#3): una lámina larga NUNCA se rechaza; el cuerpo baja de tamaño hasta un PISO legible.
 * Se prueba con la lámina de 400 caracteres (la que pidió CC#3) y con las extremas; y que lo corto quede EXACTAMENTE como antes (los árboles congelados de carousel-brazo siguen verdes).
 */
import { describe, expect, it } from 'vitest'
import { TEMPLATES, PLATFORM_SPECS, type CarouselPlatform } from '../packages/carousel-engine/src'
import { bodyOverflows, fitBodySize } from '../packages/carousel-engine/src/templates/shared'
import { naufragoBrandV1, naufragoSlidesV1 } from '../packages/carousel-engine/src/fixtures'

const PLATAFORMAS = Object.keys(PLATFORM_SPECS) as CarouselPlatform[]
const TEXTO = (n: number) => ('palabra '.repeat(Math.ceil(n / 8))).slice(0, n)

/** el tamaño de letra del nodo cuyo contenido es exactamente `texto` */
function tamanoDe(nodo: unknown, texto: string): number | null {
  if (!nodo || typeof nodo !== 'object') return null
  const n = nodo as { props?: { children?: unknown; style?: { fontSize?: number } } }
  const hijos = n.props?.children
  if (hijos === texto) return n.props?.style?.fontSize ?? null
  for (const h of Array.isArray(hijos) ? hijos : [hijos]) { const t = tamanoDe(h, texto); if (t !== null) return t }
  return null
}
const arbol = (p: CarouselPlatform, body: string) => TEMPLATES[p]({ brand: naufragoBrandV1, content: { ...naufragoSlidesV1[0], body }, slide_index: 1, total_slides: 5 })

describe('fitBodySize · puro', () => {
  const o = { canvasWidth: 880, availableHeight: 420, maxSize: 32, minSize: 22 }
  it('texto corto o vacío: el tamaño máximo de siempre', () => {
    expect(fitBodySize('', o)).toBe(32)
    expect(fitBodySize('Pídelo hoy.', o)).toBe(32)
  })
  it('una lámina de 400 caracteres cabe sin bajar del piso y NUNCA se rechaza', () => {
    const s = fitBodySize(TEXTO(400), o)
    expect(s).toBeGreaterThanOrEqual(22); expect(s).toBeLessThanOrEqual(32)
    expect(bodyOverflows(TEXTO(400), o)).toBe(false)
  })
  it('más largo ⇒ nunca MÁS grande (monótono) y el piso se respeta aunque el texto desborde', () => {
    let previo = Infinity
    for (const n of [50, 200, 400, 700, 1000, 3000, 20000]) {
      const s = fitBodySize(TEXTO(n), o)
      expect(s).toBeLessThanOrEqual(previo); expect(s).toBeGreaterThanOrEqual(22)
      previo = s
    }
    expect(fitBodySize(TEXTO(20000), o)).toBe(22)
    expect(bodyOverflows(TEXTO(20000), o)).toBe(true)
  })
  it('D03 · una línea que se pasa por UN carácter cuenta como línea nueva (se redondea hacia arriba): el tamaño baja justo lo necesario', () => {
    // a tamaño 32 caben floor(900 / (32 × 0,55)) = 51 caracteres por línea; a 30, 54. Alto disponible 60: una línea de 32 (44,8) cabe, dos (89,6) no.
    const o2 = { canvasWidth: 900, availableHeight: 60, maxSize: 32, minSize: 22 }
    expect(fitBodySize('a'.repeat(51), o2)).toBe(32) // justo una línea
    expect(fitBodySize('a'.repeat(52), o2)).toBe(30) // se pasa por uno: son dos líneas a 32, así que baja a 30 (una línea de 54)
    // un salto de línea con texto corto en cada lado = dos líneas aunque el texto sea corto
    expect(fitBodySize('a\na', { canvasWidth: 900, availableHeight: 60, maxSize: 32, minSize: 22 })).toBeLessThan(32)
    // y el desborde usa la misma cuenta: 2 líneas × 22 × 1,4 = 61,6 > 60
    expect(bodyOverflows('a'.repeat(52 * 4), { canvasWidth: 900, availableHeight: 60, minSize: 22 })).toBe(true)
    expect(bodyOverflows('a'.repeat(40), { canvasWidth: 900, availableHeight: 60, minSize: 22 })).toBe(false)
  })
  it('los saltos de línea cuentan: muchas líneas cortas bajan el tamaño igual que un párrafo largo', () => {
    const lineas = Array.from({ length: 30 }, () => 'ok').join('\n')
    expect(fitBodySize(lineas, o)).toBeLessThan(32)
  })
})

describe('las plantillas usan el ajuste', () => {
  for (const p of PLATAFORMAS) {
    it(`${p}: el cuerpo de 400 caracteres se dibuja (no lanza) y baja o iguala el tamaño del cuerpo corto; el de 20 000 queda en el piso`, () => {
      const corto = tamanoDe(arbol(p, 'Pídelo hoy.'), 'Pídelo hoy.')
      const largo = TEXTO(400), enorme = TEXTO(20000)
      const t400 = tamanoDe(arbol(p, largo), largo)
      const tMax = tamanoDe(arbol(p, enorme), enorme)
      expect(corto).not.toBeNull(); expect(t400).not.toBeNull(); expect(tMax).not.toBeNull()
      expect(t400!).toBeLessThanOrEqual(corto!)
      expect(tMax!).toBeLessThanOrEqual(t400!)
      expect(tMax!).toBeGreaterThanOrEqual(15) // piso legible en la plantilla más chica
    })
  }
})
