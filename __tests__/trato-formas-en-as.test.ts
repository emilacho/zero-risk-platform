/**
 * 10-nov · RESPUESTA de Lenovo por Emilio (decisión 3): el detector compartido de trato no veía «necesitás», «continuás», «ajustás», «parás», «etiquetá»,
 * «descargá» ni «configurá» (las 7 que el Plan de Marketing del cliente piloto traía y nadie marcaba). Se suman SOLO como formas de voseo:
 * en tuteo y usted esos verbos chocan con sustantivos comunes («las descargas», «el ajuste», «para»), así que no se generan y nada que hoy pasa empieza a marcarse.
 */
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const T = require('../src/lib/trato/trato-logica.js') as {
  formasDeTrato: (t: string) => { vos: string[]; tu: string[]; usted: string[] }
  chequearTrato: (r: { trato: string }, t: string, donde?: string) => Array<{ detalle: string }>
}

describe('el detector ve las formas de voseo que faltaban', () => {
  it('🔴 las 7 del plan (con y sin mayúscula) son voseo', () => {
    for (const w of ['necesitás', 'Continuás', 'Ajustás', 'Parás', 'etiquetá', 'Descargá', 'configurá', 'continuás', 'descargá']) {
      expect(T.formasDeTrato(`Hoy ${w} esto.`).vos, w).toEqual([w.toLowerCase()])
    }
  })
  it('🔴 en una pieza de un cliente en tuteo, se marcan', () => {
    expect(T.chequearTrato({ trato: 'tu' }, 'Si ya no necesitás más, parás y ajustás el pedido.', 'la pieza').length).toBeGreaterThan(0)
  })
  it('🔴 lo que no es voseo sigue sin marcarse: tuteo de esos verbos y sustantivos comunes', () => {
    for (const t of ['las descargas del mes', 'el ajuste de precios', 'para ti', 'necesitas, continúas, ajustas, paras', 'descarga y configura', 'el paro']) {
      expect(T.formasDeTrato(t), t).toEqual({ vos: [], tu: [], usted: [] })
    }
  })
  it('los verbos de antes siguen igual (pedí · pagá · entrá · elegí)', () => {
    expect(T.formasDeTrato('pedí, pagá, entrá y elegí').vos).toEqual(['pedí', 'pagá', 'entrá', 'elegí'])
  })
})
