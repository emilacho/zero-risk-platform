/** últimos bordes del chequeo de hechos: el umbral de 8 caracteres de la cita, fechas y citas atribuidas contra terceros, citas de exactamente 3 palabras */
import { describe, expect, it } from 'vitest'
import { evaluarHechos } from '..'
import { F } from './apoyo'

const propio = (id: string, t: string) => F(id, 'primaria_propia', t)
const ev = (manual: Record<string, unknown>, fuentes: ReturnType<typeof F>[], citas?: Parameters<typeof evaluarHechos>[0]['citas']) => evaluarHechos({ manual, fuentes, citas })

describe('bordes finales', () => {
  it('la cita del autor se ata por contención solo desde 8 caracteres exactos', () => {
    const manual = { positioning: 'Una clínica cercana, con implantes certificados' }
    const fuentes = [propio('s', 'Implantes certificados en nuestro consultorio. Atendemos hoy.')]
    const frase = (f: string) => [{ frase: f, literal: 'Atendemos hoy', fuente_id: 's' }]
    expect(ev(manual, fuentes, frase('con impl')).hechos[0].motivo).toBe('la_cita_no_dice_la_palabra') // 8: se ata
    expect(ev(manual, fuentes, frase('con imp')).hechos[0].motivo).toBeNull() // 7: no
  })
  it('una fecha solo la respalda lo propio o humano o un resumen; un competidor NO habla del cliente; y se muestra la mejor fuente', () => {
    const manual = { mision: 'Atendemos desde 2012 con calidez' }
    expect(ev(manual, [F('t', 'tercero', 'Fundada en 2012 por otros')]).hechos[0].estado).toBe('sin_cita')
    const dos = ev(manual, [F('x', 'sintesis', 'Existe desde 2012', 'otro'), propio('p', 'Fundada en 2012')])
    expect(dos.hechos[0]).toMatchObject({ estado: 'verificado' }); expect(dos.hechos[0].fuente!.id).toBe('p')
    expect(ev(manual, [F('x', 'sintesis', 'Existe desde 2012', 'otro')]).hechos[0].estado).toBe('solo_sintesis')
  })
  it('una cita atribuida de exactamente 3 palabras es un hecho; de 2, no; un competidor no la respalda; se muestra la mejor fuente', () => {
    const si = (txt: string, fuentes: ReturnType<typeof F>[]) => ev({ voice_description: `Según su sitio, dice "${txt}".` }, fuentes).hechos.filter((h) => h.marcas.includes('cita'))
    expect(si('nuestra casa sonríe', [propio('p', 'Hola nuestra casa sonríe siempre')])).toHaveLength(1)
    expect(si('nuestra casa', [propio('p', 'Hola nuestra casa sonríe siempre')])).toHaveLength(0)
    expect(si('nuestra casa sonríe', [F('t', 'tercero', 'nuestra casa sonríe')])[0].estado).toBe('sin_cita')
    const dos = si('nuestra casa sonríe', [F('x', 'sintesis', 'dijo nuestra casa sonríe', 'otro'), propio('p', 'Hola nuestra casa sonríe siempre')])
    expect(dos[0].fuente!.id).toBe('p')
  })
  it('lugar: una cláusula de 3 palabras que repite literal al cliente es afirmación; con varias marcas manda la PEOR y se muestra su cita', () => {
    expect(ev({ a: 'Viene de Cerro' }, [propio('s', 'Hola. Viene de Cerro. Ven.')]).hechos[0].estado).toBe('afirmacion_del_cliente')
    const mixta = ev({ a: 'Con garantía desde 2012' }, [propio('s', 'Fundada en 2012. Todo con garantía de ley.')])
    expect(mixta.hechos[0].detalle.map((d) => d.marca).sort()).toEqual(['certeza', 'fecha'])
    expect(mixta.hechos[0].estado).toBe('sin_cita') // «garantía» sin contexto compartido pesa más que la fecha verificada
    expect(mixta.hechos[0].detalle.find((d) => d.marca === 'fecha')!.estado).toBe('verificado')
  })
})
