/**
 * El corrector de lengua de la jefatura respeta el idioma y el TRATO del manual del cliente (tú, vos o usted) y no lo cambia (CC3 anexo 2 · firma E3/F de Emilio · 31-oct). US$ 0, puro.
 * Se fija: la tarea nombra los tres tratos, prohíbe cambiar el trato en ambos sentidos, pide marcar solo lo que contradice al manual y propuestas en el mismo trato; no fija ningún idioma ni país (agnóstico); y la tarea no se contradice entre clientes.
 */
import { describe, expect, it } from 'vitest'
import { tareaDeRevisionDeLengua } from '../pedidos'
import type { PayloadDeRevision } from '../contrato'

const payload = { contexto: [] } as unknown as PayloadDeRevision
const tarea = (texto: string) => tareaDeRevisionDeLengua({ payload, tipo: 'pieza' as never, texto, duenos: [] })

describe('tareaDeRevisionDeLengua · trato e idioma del manual', () => {
  it('la regla cubre los tres tratos, en los dos sentidos, y manda marcar solo lo que contradice al manual', () => {
    const t = tarea('Ven a probar el encebollado').task
    expect(t).toContain('(tú, vos o usted)')
    expect(t).toContain('nunca cambies el trato del texto')
    expect(t).toContain('si el manual fija tuteo, no lo corrijas hacia el voseo')
    expect(t).toContain('si fija voseo, no lo corrijas hacia el tuteo')
    expect(t).toContain('Marca como error solo el trato que contradice al del manual')
    expect(t).toContain('Tus propuestas van en el mismo idioma y trato del texto')
  })

  it('es agnóstica: no fija un idioma ni un país ni habla de tildes (propias del español)', () => {
    const { task, indicacion } = tarea('Come and try our ceviche')
    for (const s of [task, indicacion]) {
      expect(s).not.toMatch(/Ecuador|Argentina|español de|tuteo de|tildes/i)
      expect(s).toContain('propias del idioma en que está escrito')
    }
  })

  it('con tuteo, con voseo y con usted la tarea lleva la MISMA regla (el trato lo decide el manual, no la instrucción) y el texto revisado intacto', () => {
    const textos = ['Ven y pruébalo, te va a encantar', 'Vení y probalo, te va a encantar', 'Venga y pruébelo, le va a encantar']
    const reglas = textos.map((x) => {
      const r = tarea(x)
      expect(r.task).toContain(`## Lo que revisas`)
      expect(r.task).toContain(x)
      return r.indicacion
    })
    expect(new Set(reglas).size).toBe(1)
  })

  it('sigue siendo SOLO lengua: no toca contenido, estilo ni voz, y toda ficha bloquea', () => {
    const { task } = tarea('x')
    expect(task).toContain('No cambies el contenido, el estilo ni la voz de la marca')
    expect(task).toContain('Toda ficha tuya lleva "gravedad":"bloquea"')
  })
})
