/**
 * Seguimiento de #499 (CC#3 §A.4-a), sobre lo que sigue vivo tras la decisión de Emilio del 03-nov: el corte de oraciones del anotador, las listas de términos y el largo mínimo de una palabra declarada.
 */
import { describe, expect, it } from 'vitest'
import { palabrasDeclaradasEnUso, palabrasProhibidasDelManual, usaPalabraProhibida } from '../palabras-anotadas'
// 01-nov · firma de Emilio: solo se anota lo declarado
const dura = (...p: string[]) => ({ forbidden_words: p, palabras_con_intencion: p.map((texto) => ({ texto, intencion: 'legal', fuente: { cita: 'la norma' } })) })
const anotada = (voz: string) => palabrasDeclaradasEnUso({ ...dura('gas'), voz }).map((a) => a.texto)

describe('la oración que se anota', () => {
  it('un punto dentro de «…» no parte la oración', () => {
    expect(anotada('Dice «hola. adiós» a gas. Otra frase sana.')).toEqual(['Dice «hola. adiós» a gas.'])
  })
  it('una cita sin cerrar no rompe el anotador', () => {
    expect(anotada('Abre «cita abierta a gas. Otra frase.')).toEqual(['Abre «cita abierta a gas. Otra frase.'])
  })
  it('abreviaturas y números con punto no cortan: «vs.», «etc.», «3.»', () => {
    expect(anotada('Cuesta menos vs. la cocina a gas. Otra.')).toEqual(['Cuesta menos vs. la cocina a gas.'])
    expect(anotada('Hay pan, etc. y cocina a gas. Fin.')).toEqual(['Hay pan, etc. y cocina a gas.'])
    expect(anotada('Son 3. y cocina a gas. Fin.')).toEqual(['Son 3. y cocina a gas.'])
  })
  it('signos distintos de punto también cortan: ! ? …', () => {
    expect(anotada('¡Hola! A gas todo. Sana.')).toEqual(['A gas todo.'])
    expect(anotada('¿Listo? A gas todo. Sana.')).toEqual(['A gas todo.'])
    expect(anotada('Bien… A gas todo. Sana.')).toEqual(['A gas todo.'])
  })
  it('cada línea se trata aparte', () => {
    expect(anotada('Línea sana uno.\nLínea a gas\nLínea tres sana.')).toEqual(['Línea a gas'])
  })
})

describe('las listas de términos NO son prosa', () => {
  it('forbidden_words, required_terminology y tagline_opciones no se anotan', () => {
    expect(palabrasDeclaradasEnUso({ ...dura('artesanal'), required_terminology: ['pan artesanal'], tagline_opciones: ['Lo artesanal'], voz: 'Cercana y cálida.' })).toEqual([])
  })
})

describe('palabras declaradas: largo mínimo', () => {
  it('una "palabra" de 2 letras no se toma (de, la, el marcarían todo el manual)', () => {
    expect(palabrasProhibidasDelManual(dura('de', 'la', 'ab'))).toEqual([])
    expect(palabrasDeclaradasEnUso({ ...dura('de'), voz: 'Cocina de la casa de siempre.' })).toEqual([])
  })
  it('una de 3 letras SÍ se toma (borde): «gas» declarada anota la oración que la usa', () => {
    expect(palabrasProhibidasDelManual(dura('gas'))).toEqual(['gas'])
    expect(palabrasDeclaradasEnUso({ ...dura('gas'), voz: 'Cocina a gas. Cercana y cálida.' })).toEqual([{ ruta: 'voz', palabra: 'gas', texto: 'Cocina a gas.' }])
  })
  it('acepta frases ("calidad garantizada") y tolera el plural simple', () => {
    expect(usaPalabraProhibida('Ofrecemos calidad garantizada hoy', ['calidad garantizada'])).toBe('calidad garantizada')
    expect(usaPalabraProhibida('Los platos premiums', ['premium'])).toBe('premium')
  })
})

describe('rutas profundas', () => {
  it('visual.reglas.debe[1] con una palabra declarada se anota con su ruta', () => {
    const m = { ...dura('artesanal'), visual: { reglas: { debe: ['Buena regla uno', 'Mostrar lo artesanal', 'Buena regla tres'] } } }
    expect(palabrasDeclaradasEnUso(m).map((a) => a.ruta)).toEqual(['visual.reglas.debe[1]'])
  })
  it('una ruta que atraviesa un nulo no rompe el anotador', () => {
    expect(() => palabrasDeclaradasEnUso({ visual: { reglas: null }, forbidden_words: ['gas'], voz: 'Cálida.' })).not.toThrow()
  })
})

