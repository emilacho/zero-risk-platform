/**
 * 04-nov · GO de Lenovo 17:02Z, aprobados por Emilio: la jefatura lee lo que marcó el código (6, 9, 11), el sistema pone la versión y la letra (13), y el redactor evalúa las redes que faltan (5).
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { bloqueDeLoMarcado, tareaDeRevisionDeFondo } from '../src/lib/jefatura/revision/pedidos'
import { armarQueCambio } from '../src/lib/jefatura/revision/plan'

const MARCAS = ['el presupuesto trae cifras que no son las firmadas: $10,63', 'horarios: abre el sabado']
const fondo = (tipo: string, marcas?: string[]) => tareaDeRevisionDeFondo({ politica: { contra_que: [] } as never, payload: { chequeos_previos: marcas ? { pasaron: false, necesita_humano: false, marcas } : undefined, contexto: [] } as never, tipo: tipo as never, texto: 'el plan', duenos: [] }).task

describe('al jefe le llega lo que marcó el código', () => {
  it('🔴 en un plan, con cada marca y lo que debe hacer', () => {
    const t = fondo('plan', MARCAS)
    for (const m of MARCAS) expect(t).toContain(m)
    expect(t).toContain('Compruébalo')
    expect(t).toContain('a la firmada')
    expect(t).toContain('Si no es real, no le pongas ficha')
    // «bloquea» decide si hay corrección: como sugerencia, nadie la corregiría
    expect(t).toContain('ponle tu ficha con «bloquea»')
  })
  it('🔴 sin marcas el pedido queda como antes', () => { expect(fondo('plan')).not.toContain('chequeo por código') })
  it('🔴 solo en el plan', () => {
    expect(bloqueDeLoMarcado('pieza' as never, MARCAS)).toBe('')
    expect(fondo('pieza', MARCAS)).not.toContain('chequeo por código')
  })
})

describe('la versión la pone el sistema', () => {
  const ciclo = { version: 1, pedido_del_dueno: null }
  it('🔴 la B dice que es la B', () => { expect(armarQueCambio({ ciclo, fichas: [], etiqueta: 'B' })).toMatch(/^## QUÉ CAMBIÓ EN ESTA VERSIÓN \(v1 · B\)/) })
  it('🔴 sin versión, solo la letra; sin nada, sin paréntesis', () => {
    expect(armarQueCambio({ ciclo: { version: null, pedido_del_dueno: null }, fichas: [], etiqueta: 'C' })).toMatch(/^## QUÉ CAMBIÓ EN ESTA VERSIÓN \(C\)/)
    expect(armarQueCambio({ ciclo: { version: null, pedido_del_dueno: null }, fichas: [] })).toMatch(/^## QUÉ CAMBIÓ EN ESTA VERSIÓN\n/)
  })
  it('🔴 el que guarda la versión le pasa su letra', () => {
    expect(fs.readFileSync('src/lib/jefatura/revision/orquestador.ts', 'utf8')).toContain("etiqueta: g.etiqueta as 'B' | 'C'")
  })
})
