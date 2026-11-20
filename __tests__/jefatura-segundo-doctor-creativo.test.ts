/**
 * 20-nov · el segundo doctor CREATIVO (PLAN v3 de CC4) · la regla de la cita y de la parte (verificar exacto = código) y la lectura del informe.
 * Condiciones: CC7 1 (normalización + largo mínimo), CC7 detalles (a) y (b), CC6 4, 5 y 7.
 */
import { describe, expect, it } from 'vitest'
import {
  bloqueParaElCreativo, CARACTERES_MINIMOS_DE_UNA_CITA, estadoDeLaCita, huella, LA_OPINION_SOLA_HACE_VOLVER, leerInformeCreativo, MARCA_DE_FIN_DEL_INFORME, MARCA_DE_INICIO_DEL_INFORME,
  normalizarParaCitar, PALABRAS_MINIMAS_DE_UNA_CITA, parteQueToca, resumenDelDoctor, TEXTO_HONESTO_AL_CREATIVO, verificarCita, type MaterialDelDoctor,
} from '../src/lib/jefatura/revision/segundo-doctor'

const relleno = Array.from({ length: 400 }, (_, i) => `Párrafo ${i} del manual con indicaciones generales de la marca.`).join('\n')
const MANUAL = `${relleno}\nAl final: la luz de la tarde debe sentirse cálida y dorada, nunca fría ni azulada en las fotos.`
const MATERIAL: MaterialDelDoctor = {
  contexto: [
    { titulo: 'Manual de marca del cliente', funcion: 'lo vigente', texto: MANUAL },
    { titulo: 'El brief de este entregable', funcion: 'el encargo', texto: 'Un atardecer en la terraza con el plato estrella servido sobre la mesa de madera.' },
  ],
  version_a: 'Ven a ver el atardecer desde la terraza: el plato estrella te espera en la mesa de madera.',
  imagenes: ['https://x/a.png', 'https://x/b.png'],
}
const informe = (cuerpo: unknown, antes = 'Mi lectura: el color se ve liviano.') => `${antes}\n${MARCA_DE_INICIO_DEL_INFORME}\n${JSON.stringify(cuerpo)}\n${MARCA_DE_FIN_DEL_INFORME}`

describe('la normalización (la misma en la cita y en el original)', () => {
  it('quita tildes y diéresis', () => expect(normalizarParaCitar('Cálida pingüino')).toBe('calida pinguino'))
  it('pasa a minúsculas', () => expect(normalizarParaCitar('LUZ Dorada')).toBe('luz dorada'))
  it('las comillas tipográficas y rectas desaparecen', () => expect(normalizarParaCitar('«hola» “mundo” ‘a’ "b" \'c\'')).toBe('hola mundo a b c'))
  it('los guiones largos pasan a guion', () => expect(normalizarParaCitar('a—b–c')).toBe('a-b-c'))
  it('todo espacio o salto seguido es un espacio, sin bordes', () => expect(normalizarParaCitar('  a \n\n  b\t c  ')).toBe('a b c'))
})

describe('la regla de la cita', () => {
  it('una cita real con comillas curvas, otro espaciado y sin tildes cuenta', () => {
    expect(estadoDeLaCita('“la luz de la tarde  debe sentirse calida y DORADA”', MANUAL)).toBe('cita_encontrada')
  })
  it(`una de 2 palabras no cuenta aunque aparezca (mínimo ${PALABRAS_MINIMAS_DE_UNA_CITA} palabras y ${CARACTERES_MINIMOS_DE_UNA_CITA} caracteres)`, () => {
    expect(estadoDeLaCita('la marca', MANUAL)).toBe('corta')
  })
  it('5 palabras no bastan aunque pasen los 30 caracteres; 6 sí', () => {
    expect(normalizarParaCitar('indicaciones generales de la marca').length).toBeGreaterThanOrEqual(30)
    expect(estadoDeLaCita('indicaciones generales de la marca', MANUAL)).toBe('corta')
    expect(estadoDeLaCita('con indicaciones generales de la marca', MANUAL)).toBe('cita_encontrada')
  })
  it('6 palabras pero menos de 30 caracteres no cuenta', () => expect(estadoDeLaCita('a b c d e f', 'a b c d e f g')).toBe('corta'))
  it('una inventada no cuenta', () => expect(estadoDeLaCita('la luz de la mañana debe ser siempre azul y fría', MANUAL)).toBe('no_encontrada'))
  it('se busca en la fuente que nombra: real pero atribuida a otra fuente no cuenta', () => {
    expect(verificarCita('El brief de este entregable', 'la luz de la tarde debe sentirse cálida y dorada', MATERIAL)).toBe('no_encontrada')
    expect(verificarCita('Manual de marca del cliente', 'la luz de la tarde debe sentirse cálida y dorada', MATERIAL)).toBe('cita_encontrada')
  })
  it('una cita del FINAL del manual cuenta (se busca en el material entero que recibió GPT)', () => {
    expect(MANUAL.length).toBeGreaterThan(20_000)
    expect(verificarCita('«Manual de marca del cliente»', 'nunca fría ni azulada en las fotos', MATERIAL)).toBe('cita_encontrada')
  })
  it('una fuente que no se envió no cuenta; una foto queda sin verificar; sin cita, sin_cita', () => {
    expect(verificarCita('El plan', 'la luz de la tarde debe sentirse cálida y dorada', MATERIAL)).toBe('no_encontrada')
    expect(verificarCita('foto 2', 'la luz de la tarde debe sentirse cálida y dorada', MATERIAL)).toBe('sin_verificar')
    expect(verificarCita('', '', MATERIAL)).toBe('sin_cita')
  })
})

describe('la parte que toca', () => {
  it('un texto se busca en la versión A con la misma regla', () => {
    expect(parteQueToca('«el plato estrella te espera en la mesa»', MATERIAL).estado).toBe('encontrada')
    expect(parteQueToca('el plato estrella te espera junto al mar', MATERIAL).estado).toBe('no_encontrada')
  })
  it('«imagen n» existe entre las que recibió GPT, con su dirección (CC6 7)', () => {
    expect(parteQueToca('imagen 2', MATERIAL)).toEqual({ texto: 'imagen 2', estado: 'imagen', imagen: { n: 2, url: 'https://x/b.png' } })
    expect(parteQueToca('Imagen 3', MATERIAL).estado).toBe('imagen_inexistente')
    expect(parteQueToca('', MATERIAL).estado).toBe('sin_parte')
  })
})

describe('la lectura del informe', () => {
  it('lee observaciones creativas y deja los datos aparte', () => {
    const inf = leerInformeCreativo(informe({
      observaciones: [
        { que: 'El color está muy liviano', por_que: 'resta apetito', parte: 'imagen 1', fuente: 'Manual de marca del cliente', cita: 'la luz de la tarde debe sentirse cálida y dorada' },
        { que: 'Es atardecer: el sol debería estar más bajo', por_que: 'la hora no cuadra', parte: 'Ven a ver el atardecer desde la terraza', fuente: '', cita: '' },
      ],
      datos: [{ que: 'el precio no coincide', paso_de_origen: 'brief', parte: 'imagen 1' }],
    }), MATERIAL)
    expect(inf.legible).toBe(true)
    expect(inf.observaciones.map((o) => [o.id, o.estado_de_la_cita, o.parte.estado])).toEqual([['O1', 'cita_encontrada', 'imagen'], ['O2', 'sin_cita', 'encontrada']])
    expect(inf.datos).toEqual([{ que: 'el precio no coincide', paso_de_origen: 'brief', parte: { texto: 'imagen 1', estado: 'imagen', imagen: { n: 1, url: 'https://x/a.png' } } }])
  })
  it('un bloque ilegible NO frena: el texto entero queda como una observación sin cita', () => {
    const inf = leerInformeCreativo(`Me gusta la idea, pero el color está liviano.\n${MARCA_DE_INICIO_DEL_INFORME}\n{esto no es json\n${MARCA_DE_FIN_DEL_INFORME}`, MATERIAL)
    expect(inf.legible).toBe(false)
    expect(inf.observaciones).toEqual([expect.objectContaining({ id: 'O1', que: 'Me gusta la idea, pero el color está liviano.', estado_de_la_cita: 'sin_cita' })])
    expect(inf.datos).toEqual([])
  })
  it('sin bloque, igual: una observación con todo el texto', () => {
    expect(leerInformeCreativo('Solo texto libre.', MATERIAL).observaciones.map((o) => o.que)).toEqual(['Solo texto libre.'])
  })
})

describe('al creativo: sin firma ni peso, y nunca los datos', () => {
  const inf = leerInformeCreativo(informe({
    observaciones: [{ que: 'El color está muy liviano', por_que: 'resta apetito', parte: 'imagen 1', fuente: 'Manual de marca del cliente', cita: 'la luz de la tarde debe sentirse cálida y dorada' }],
    datos: [{ que: 'EL PRECIO NO COINCIDE CON LA FICHA', paso_de_origen: 'brief', parte: '' }],
  }), MATERIAL)
  const bloque = bloqueParaElCreativo(inf.observaciones).join('\n')
  it('lleva el texto honesto, la observación con su cita y el pedido de respuesta', () => {
    expect(bloque).toContain(TEXTO_HONESTO_AL_CREATIVO)
    expect(bloque).toContain('[O1] El color está muy liviano — resta apetito · en: imagen 1 · Manual de marca del cliente: «la luz de la tarde debe sentirse cálida y dorada»')
    expect(bloque).toContain('RESPUESTA A LA JEFATURA O1:')
  })
  it('no dice quién la hizo ni cuánto pesa', () => expect(bloque).not.toMatch(/gpt|openai|modelo|externo|peso|doctor/i))
  it('los datos NUNCA viajan al creativo', () => expect(bloque).not.toContain('PRECIO'))
  it('sin observaciones, no hay bloque', () => expect(bloqueParaElCreativo([])).toEqual([]))
})

describe('el resumen para medir', () => {
  it('cuenta y dice si fue otro proveedor (CC6 3)', () => {
    const inf = leerInformeCreativo(informe({ observaciones: [{ que: 'x', parte: 'imagen 1', fuente: 'Manual de marca del cliente', cita: 'la luz de la tarde debe sentirse cálida y dorada' }], datos: [{ que: 'y', paso_de_origen: 'guion' }] }), MATERIAL)
    expect(resumenDelDoctor(inf, 'gpt-5.5-2026-01-01')).toEqual({ observaciones: 1, citas_encontradas: 1, partes_encontradas: 1, datos: 1, modelo_efectivo: 'gpt-5.5-2026-01-01', otro_proveedor: true })
    expect(resumenDelDoctor(inf, 'claude-sonnet-4-6').otro_proveedor).toBe(false)
    expect(resumenDelDoctor(inf, null).otro_proveedor).toBeNull()
  })
  it('la huella es sha256 del texto enviado', () => expect(huella('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'))
})

it('la vuelta solo por GPT nace APAGADA (se enciende solo con la firma de Emilio)', () => expect(LA_OPINION_SOLA_HACE_VOLVER).toBe(false))
