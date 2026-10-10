/** bordes del chequeo de hechos que las mutaciones dejaron vivos: la cita del autor, el literal de 3 palabras, el contexto compartido de 2, las cifras */
import { describe, expect, it } from 'vitest'
import { evaluarHechos } from '..'
import { F } from './apoyo'

const propio = (id: string, t: string) => F(id, 'primaria_propia', t)
const sint = (id: string, t: string) => F(id, 'sintesis', t, 'otro')
const ev = (manual: Record<string, unknown>, fuentes: ReturnType<typeof F>[], citas?: Parameters<typeof evaluarHechos>[0]['citas']) => evaluarHechos({ manual, fuentes, citas })

describe('la cita del autor se ata a SU frase (igual a la frase, igual a la cláusula, o contenida si es larga) y no a otra', () => {
  const fuentes = [propio('s', 'Implantes certificados y con garantía en nuestro consultorio.')]
  const manual = { positioning: 'Una clínica cercana, con implantes certificados' }
  it('igual a la frase entera', () => {
    expect(ev(manual, fuentes, [{ frase: 'Una clínica cercana, con implantes certificados', literal: 'Implantes certificados', fuente_id: 's' }]).hechos[0].estado).toBe('afirmacion_del_cliente')
  })
  it('igual a la cláusula', () => {
    expect(ev(manual, fuentes, [{ frase: 'con implantes certificados', literal: 'Implantes certificados', fuente_id: 's' }]).hechos[0].estado).toBe('afirmacion_del_cliente')
  })
  it('contenida en la frase si tiene ≥ 8 caracteres; si es más corta o de otra frase, NO se usa (se busca solo)', () => {
    expect(ev(manual, fuentes, [{ frase: 'clínica cercana', literal: 'Implantes certificados', fuente_id: 's' }]).hechos[0].cita_literal).toBe('Implantes certificados')
    expect(ev(manual, [propio('t', 'Algo sin relación')], [{ frase: 'clínica cercana', literal: 'Algo sin relación', fuente_id: 't' }]).hechos[0].motivo).toBe('la_cita_no_dice_la_palabra')
    // frase de otra parte del manual: la cita NO se aplica (si se aplicara, diría «la_cita_no_dice_la_palabra»)
    const otra = ev(manual, [propio('t', 'Algo sin relación')], [{ frase: 'una frase de otro campo completamente', literal: 'Algo sin relación', fuente_id: 't' }])
    expect(otra.hechos[0].motivo).toBeNull(); expect(otra.hechos[0].estado).toBe('sin_cita')
    expect(ev(manual, [propio('t', 'Algo sin relación')], [{ frase: 'clín', literal: 'Algo sin relación', fuente_id: 't' }]).hechos[0].motivo).toBeNull() // < 8 caracteres: no se ata por contención
  })
})

describe('cifras: con cita del autor, por presencia, y qué fuente se muestra', () => {
  it('la cita tiene que existir Y traer la cifra; la fuente que se muestra es la MEJOR (la propia antes que el resumen)', () => {
    const manual = { customer_angle: 'Tiene 1,231 seguidores en su perfil' }
    const fuentes = [sint('x', 'Se habla de 1231 seguidores'), propio('p', 'Perfil con 1.231 seguidores')]
    const frase = 'Tiene 1,231 seguidores en su perfil'
    expect(ev(manual, fuentes).hechos[0].fuente!.id).toBe('p')
    expect(ev(manual, fuentes, [{ frase, literal: 'Perfil con', fuente_id: 'p' }]).hechos[0].motivo).toBe('la_cita_no_trae_la_cifra')
    expect(ev(manual, fuentes, [{ frase, literal: 'Perfil con 1.231 seguidores', fuente_id: 'p' }]).hechos[0].estado).toBe('verificado')
    expect(ev(manual, fuentes, [{ frase, literal: 'Perfil con 1.231 seguidores', fuente_id: 'nope' }]).hechos[0].estado).toBe('sin_cita')
  })
  it('un porcentaje se respalda por presencia del número aunque la fuente no ponga el signo (límite declarado)', () => {
    expect(ev({ mision: 'Crecemos 15% cada año' }, [propio('s', 'Hace 15 años abrimos')]).hechos[0].estado).toBe('verificado')
    expect(ev({ mision: 'Crecemos 15% cada año' }, []).hechos[0].estado).toBe('sin_cita')
  })
  it('una cifra de 2 dígitos es un dato; de 1 dígito sin signo no; con signo sí', () => {
    expect(ev({ a: 'Tenemos 10 sedes' }, []).hechos).toHaveLength(1)
    expect(ev({ a: 'Tenemos 5 sedes' }, []).hechos).toEqual([])
    expect(ev({ a: 'Tenemos 5% más' }, []).hechos).toHaveLength(1)
    expect(ev({ a: 'Cuesta $5' }, []).hechos).toHaveLength(1)
  })
})

describe('lugar con cita del autor', () => {
  const fuentes = [propio('s', 'Traemos los insumos de Playa Azul. Nuestro local está en Playa Azul.')]
  const manual = { propuestas_de_valor: ['Los insumos vienen de Playa Azul'] }
  it('la cita debe decir que es el ORIGEN del producto; una cita que solo dice «sede» no basta', () => {
    expect(ev(manual, fuentes, [{ frase: 'Los insumos vienen de Playa Azul', literal: 'Traemos los insumos de Playa Azul', fuente_id: 's' }]).hechos[0].estado).toBe('verificado')
    expect(ev(manual, fuentes, [{ frase: 'Los insumos vienen de Playa Azul', literal: 'Nuestro local está en Playa Azul', fuente_id: 's' }]).hechos[0].motivo).toBe('la_cita_no_dice_que_es_el_origen')
  })
})

describe('límites del literal de 3 palabras y del contexto compartido de 2', () => {
  it('una cláusula de 3 palabras reproducida literal es afirmación del cliente; de 2, no basta', () => {
    expect(ev({ a: 'Somos los mejores' }, [propio('s', 'Hola. Somos los mejores. Ven.')]).hechos[0].estado).toBe('afirmacion_del_cliente')
    expect(ev({ a: 'El mejor' }, [propio('s', 'Hola. El mejor. Ven.')]).hechos[0].estado).toBe('sin_cita')
  })
  it('un literal que solo está en un RESUMEN de agente no es afirmación del cliente: es solo síntesis', () => {
    expect(ev({ a: 'Somos los mejores del barrio' }, [sint('x', 'Hola. Somos los mejores del barrio. Ven.')]).hechos[0].estado).toBe('solo_sintesis')
    expect(ev({ propuestas_de_valor: ['Los insumos vienen de Playa Azul'] }, [sint('x', 'Hola. Los insumos vienen de Playa Azul. Ven.')]).hechos[0].estado).toBe('sin_cita')
  })
  it('el contexto compartido: con 2 palabras de contenido (sin contar la certeza) el respaldo vale; con 1, no', () => {
    expect(ev({ a: 'Atendemos implantes certificados hoy' }, [propio('s', 'Hacemos implantes certificados hoy mismo.')]).hechos[0].estado).toBe('afirmacion_del_cliente')
    expect(ev({ a: 'Atendemos implantes certificados siempre' }, [propio('s', 'Hacemos implantes certificados hoy mismo.')]).hechos[0].estado).toBe('sin_cita')
  })
})

describe('el manual puede traer campos nulos o numéricos sin romper el chequeo', () => {
  it('ignora lo que no es texto', () => {
    expect(ev({ a: null, b: 5, c: { d: null, e: ['x', null, 7] } }, []).hechos).toEqual([])
  })
})
