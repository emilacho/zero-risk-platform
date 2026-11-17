/**
 * 17-nov · GO Lenovo «quitar rejas» (Emilio 09:08: «apruebo todo, que se corrija; un sistema agnóstico tiene que tener la libertad de trabajar como tal») · parte CC3, tramo 1: textos de la cadena.
 * Una prueba por regla quitada: si la regla vuelve, la prueba cae. Lo que se queda (LEY, DATO, FIRMA) también se prueba, para que quitar la reja no se lleve la ley.
 * US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import { clienteA, contextoDe } from '../__fixtures__/clientes'
import { tareaDeCalendario, tareaDeEstrategia } from '../indicaciones'
import { METODO_CALENDARIO_POR_OMISION, METODO_GANCHO_POR_OMISION, METODO_PIEZA_POR_OMISION, tareaDeGanchoDeVideo } from '../metodos'

const A = clienteA()
const ctx = contextoDe(A)
const estrategia = () => tareaDeEstrategia({ ctx, formatosPermitidos: { instagram: ['post'] }, version: 1 })
const calendario = () => tareaDeCalendario({ ctx, estrategia: A.estrategia, tanda: 1, semanas: [1, 2, 3, 4], filasPrevias: [] } as never)
const gancho = () => tareaDeGanchoDeVideo({ ctx: { registro: 'tu' as const, idioma: null }, idea: { id: 'C1-I01', idea: 'x', mensaje: 'm', gancho: 'g', red: 'instagram', formato: 'reel' }, red: 'instagram', formato: 'reel', objetivo: 'guardar' as const, duracion_s: 20, referencias: [] } as never)

describe('A·1 · reseñas en estrategia y calendario: con su ficha, sí', () => {
  it('ya no dice «No cites reseñas ni testimonios de personas» (ni en estrategia ni en calendario)', () => {
    for (const t of [estrategia(), calendario()]) expect(t).not.toMatch(/No cites reseñas/)
  })
  it('se queda la regla del dato: una reseña solo con la `ref` de su ficha; sin ficha, no se cita (LEY de no inventar)', () => {
    expect(calendario()).toMatch(/Si el tema cita una reseña, un testimonio o la opinión de una persona, agrega en `datos` un dato `resena` con la `ref` de su ficha\. Si no hay ficha, no lo cites\./)
    expect(estrategia()).toMatch(/Todo dato concreto \(precio, medida, horario, dirección, cantidad, reseña\) necesita una referencia/)
  })
})

describe('A·2 · el gancho de video puede nombrar a una persona que el manual presenta', () => {
  it('ya no dice «No cites reseñas ni testimonios de personas. No nombres personas.»', () => {
    expect(gancho()).not.toMatch(/No cites reseñas/)
    expect(gancho()).not.toMatch(/No nombres personas/)
  })
  it('queda la LEY: reseña solo con su ficha, persona real solo si el manual, el plan o el material la presentan, nunca inventada', () => {
    expect(gancho()).toMatch(/Una reseña o un testimonio solo con la `ref` de su ficha, citado tal cual y atribuido\./)
    expect(gancho()).toMatch(/Una persona real se nombra solo si el manual, el plan o el material la presentan; nunca inventes una\./)
  })
})

describe('C2 · fechas que importan: sin «lo normal es vacía»', () => {
  it('ya no empuja a la lista vacía; sigue sin inventar', () => {
    expect(estrategia()).not.toMatch(/Lo normal es la lista VACÍA/)
    expect(estrategia()).toMatch(/No inventes tipos «por si acaso»/)
  })
})

describe('C10 · una pieza puede depender de un video', () => {
  it('el pedido del calendario ya no dice «nunca dependas de una pieza de video»', () => {
    expect(calendario()).not.toMatch(/nunca dependas de una pieza de video/)
    expect(calendario()).toMatch(/pon el id de la antecesora en `depende_de`/)
  })
})

describe('C5 · las frases absolutas de los métodos firmados pasan a «supuesto de partida» (la firma dice «guía, no formato»)', () => {
  it('calendario: la pieza que pide «suele» ir al final; ya no «nunca abre un capítulo»', () => {
    expect(METODO_CALENDARIO_POR_OMISION).not.toMatch(/nunca abre un capítulo/)
    expect(METODO_CALENDARIO_POR_OMISION).toMatch(/suele ir al final de una secuencia y no abrir un capítulo \(supuesto de partida\)/)
  })
  it('pieza: el mismo texto en dos redes y la lista negativa son supuesto de partida; las normas de cada red mandan', () => {
    expect(METODO_PIEZA_POR_OMISION).not.toMatch(/nunca pegues/)
    expect(METODO_PIEZA_POR_OMISION).toMatch(/supuesto de partida: no pegues el mismo texto en dos redes/)
    expect(METODO_PIEZA_POR_OMISION).toMatch(/Lista negativa \(supuesto de partida; las normas de cada red y la ficha mandan\)/)
  })
  it('gancho: el formato y la duración los da el pedido; 9:16 es solo el supuesto de partida', () => {
    expect(METODO_GANCHO_POR_OMISION).not.toMatch(/'?Formato: vertical 9:16;/)
    expect(METODO_GANCHO_POR_OMISION).toMatch(/Formato y duración objetivo: los da el pedido \(supuesto de partida: vertical 9:16\)/)
  })
})
