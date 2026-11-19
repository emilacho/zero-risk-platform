/**
 * 19-nov · ADENDA 1 · P1b · el corrector de lengua también lleva el molde (b)+(e) (CC5):
 * lo revisado y los documentos ARRIBA, la línea del tipo después, y el pedido CIERRA con el objetivo.
 * Nace de dos sabotajes que sobrevivían (b4: lo revisado al final · b5: sin cierre). Sin red, US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { tareaDeRevisionDeLengua } from '../pedidos'
import type { PayloadDeRevision } from '../contrato'

const payload = { contexto: [{ titulo: 'Manual de marca', funcion: 'la voz sale de él', texto: 'TEXTO DEL MANUAL' }] } as unknown as PayloadDeRevision
const { task } = tareaDeRevisionDeLengua({ payload, tipo: 'pieza' as never, texto: 'LA PIEZA A REVISAR', duenos: [] })

describe('ADENDA 1 · P1b · el pedido del corrector de lengua', () => {
  it('🔴 lo revisado va primero, en su <documento>, y después el contexto y la línea del tipo', () => {
    const revisado = task.indexOf('LA PIEZA A REVISAR')
    expect(task.slice(0, revisado)).toMatch(/<documento fuente="lo que revisas: [^"]+">\n$/)
    expect(revisado).toBeLessThan(task.indexOf('<documento fuente="Manual de marca — la voz sale de él">\nTEXTO DEL MANUAL\n</documento>'))
    expect(task.indexOf('TEXTO DEL MANUAL')).toBeLessThan(task.indexOf('Revisas SOLO la lengua'))
  })
  it('🔴 el pedido cierra con el objetivo: sin errores de lengua, con el mismo contenido, voz y trato', () => {
    expect(task.trimEnd()).toMatch(/## Lo que importa\nEl objetivo: que .+ quede sin errores de lengua, con el mismo contenido, voz y trato\.$/)
  })
})
