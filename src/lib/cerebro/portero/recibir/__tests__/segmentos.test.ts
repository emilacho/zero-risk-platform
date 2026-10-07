/**
 * PASO 7 · cortar el material en SEGMENTOS, firmar cada uno y numerarlos. Pruebas escritas ANTES del código.
 * Lo esencial: cada segmento es un tramo EXACTO del original (con su posición), la firma no depende de la numeración ni de los espacios, y no se pierde nada.
 */
import { describe, expect, it } from 'vitest'
import { LARGO_MAXIMO_DE_SEGMENTO, cortarEnSegmentos, firmaDe, numerarSegmentos } from '../segmentos'

const sinEspacios = (t: string): string => t.replace(/\s+/g, '')
const MATERIALES: Array<[string, string]> = [
  ['dos párrafos', 'Primer párrafo del material.\n\nSegundo párrafo, con otra idea.'],
  ['con saltos de Windows, tabuladores y líneas en blanco de más', '  Uno\r\n\r\n\r\n\tDos con tab\r\n\r\n   \r\nTres  \r\n'],
  ['un solo párrafo con varias líneas', 'línea uno\nlínea dos\nlínea tres'],
  ['con emojis y tildes', 'Cerramos la semana 🍽️ con un plato nuevo ñandú.\n\n👨‍👩‍👧 Reservas abiertas hasta el viernes.'],
  ['precios y fechas', 'Repuesto X\n\nPrecio: 40 USD\n\nGarantía: 12 meses desde el 12 de mayo de 2026'],
  ['sin nada', '   \n\n \t \n'],
  ['vacío', ''],
]

describe('cortar en segmentos', () => {
  it.each(MATERIALES)('%s: cada segmento es un tramo EXACTO del original, en orden y sin solaparse', (_n, material) => {
    const s = cortarEnSegmentos(material)
    let fin = 0
    for (const x of s) {
      expect(material.slice(x.inicio, x.fin), `segmento ${x.n}`).toBe(x.texto)
      expect(x.texto.trim()).toBe(x.texto)
      expect(x.texto.length).toBeGreaterThan(0)
      expect(x.inicio).toBeGreaterThanOrEqual(fin)
      fin = x.fin
    }
    expect(s.map((x) => x.n)).toEqual(s.map((_x, i) => i + 1))
  })
  it.each(MATERIALES)('%s: no se pierde NI se inventa ningún carácter (sin contar espacios)', (_n, material) => {
    expect(sinEspacios(cortarEnSegmentos(material).map((x) => x.texto).join(''))).toBe(sinEspacios(material))
  })
  it('corta por líneas en blanco; una línea sola dentro de un párrafo NO corta', () => {
    expect(cortarEnSegmentos('uno\ndos\n\ntres').map((x) => x.texto)).toEqual(['uno\ndos', 'tres'])
    expect(cortarEnSegmentos('uno\n\n\n\ndos').map((x) => x.texto)).toEqual(['uno', 'dos'])
  })
  it('un material vacío o solo de espacios no da ningún segmento', () => {
    expect(cortarEnSegmentos('')).toEqual([])
    expect(cortarEnSegmentos('  \n\n\t ')).toEqual([])
  })
  it('un párrafo largo se corta cada ~600 caracteres: en un salto de línea si lo hay, si no en el fin de una frase, si no en un espacio', () => {
    expect(LARGO_MAXIMO_DE_SEGMENTO).toBe(600)
    const frase = 'Esta es una frase de prueba con varias palabras para llenar espacio. '
    const conFrases = frase.repeat(30).trim()
    for (const x of cortarEnSegmentos(conFrases)) expect(x.texto.length).toBeLessThanOrEqual(600)
    expect(cortarEnSegmentos(conFrases).length).toBeGreaterThan(2)
    expect(cortarEnSegmentos(conFrases).every((x) => /[.]$/.test(x.texto))).toBe(true) // cortó en fin de frase
    const conLineas = Array.from({ length: 40 }, (_, i) => `línea número ${i} con algo de texto`).join('\n')
    const partes = cortarEnSegmentos(conLineas)
    expect(partes.length).toBeGreaterThan(1)
    expect(partes.every((x) => x.texto.length <= 600)).toBe(true)
    expect(partes.slice(0, -1).every((x) => /\d con algo de texto$/.test(x.texto))).toBe(true) // cortó en un salto de línea: ninguna línea partida
    const sinNada = 'palabra '.repeat(200).trim()
    expect(cortarEnSegmentos(sinNada).every((x) => x.texto.length <= 600 && !x.texto.endsWith(' '))).toBe(true)
  })
  it('un texto de 5.000 letras sin ningún espacio se corta a la fuerza en 600 sin perder nada', () => {
    const t = 'x'.repeat(5000)
    const s = cortarEnSegmentos(t)
    expect(s.every((x) => x.texto.length <= 600)).toBe(true)
    expect(s.map((x) => x.texto).join('')).toBe(t)
  })
  it('es determinista', () => {
    const m = MATERIALES[0][1] + '\n\n' + MATERIALES[4][1]
    expect(cortarEnSegmentos(m)).toEqual(cortarEnSegmentos(m))
  })
})

describe('la firma de un segmento', () => {
  it('no depende de los espacios, tabuladores ni saltos de línea de más (normalización mínima)', () => {
    expect(firmaDe('Precio:  40   USD')).toBe(firmaDe('Precio: 40 USD'))
    expect(firmaDe('Precio:\t40\nUSD')).toBe(firmaDe(' Precio: 40 USD '))
  })
  it('SÍ cambia si cambia un contador, un precio o una fecha (no se descartan: un precio nuevo es contenido nuevo)', () => {
    expect(firmaDe('Stock: 5 unidades')).not.toBe(firmaDe('Stock: 4 unidades'))
    expect(firmaDe('Precio: 40 USD')).not.toBe(firmaDe('Precio: 45 USD'))
    expect(firmaDe('Abierto hasta el 12 de mayo')).not.toBe(firmaDe('Abierto hasta el 13 de mayo'))
    expect(firmaDe('hola')).not.toBe(firmaDe('Hola')) // las mayúsculas cuentan
  })
  it('es un texto hexadecimal fijo de 24 caracteres', () => {
    expect(firmaDe('algo')).toMatch(/^[0-9a-f]{24}$/)
    expect(firmaDe('')).toMatch(/^[0-9a-f]{24}$/)
  })
  it('INSERTAR un párrafo al principio cambia TODA la numeración pero NINGUNA firma de lo que ya estaba', () => {
    const base = 'Repuesto uno\n\nPrecio: 40 USD\n\nGarantía: 12 meses'
    const con = 'Aviso nuevo al inicio de la página\n\n' + base
    const a = cortarEnSegmentos(base), b = cortarEnSegmentos(con)
    expect(b).toHaveLength(a.length + 1)
    expect(a.map((x) => x.n)).toEqual([1, 2, 3])
    expect(b.map((x) => x.n)).toEqual([1, 2, 3, 4])
    expect(b.slice(1).map((x) => x.firma)).toEqual(a.map((x) => x.firma))
    expect(b.slice(1).every((x, i) => x.n !== a[i].n)).toBe(true)
  })
  it('cada segmento trae su firma', () => {
    for (const x of cortarEnSegmentos('uno\n\ndos')) expect(x.firma).toBe(firmaDe(x.texto))
  })
})

describe('numerar para el modelo: «[n] texto»', () => {
  it('cada segmento va como «[n] texto» (el texto exacto, también con varias líneas), separados por una línea en blanco', () => {
    const s = cortarEnSegmentos('uno\ndos\n\ntres')
    expect(numerarSegmentos(s)).toBe('[1] uno\ndos\n\n[2] tres')
  })
  it('conserva los números originales aunque se pase solo una parte de los segmentos', () => {
    const s = cortarEnSegmentos('a\n\nb\n\nc')
    expect(numerarSegmentos([s[0], s[2]])).toBe('[1] a\n\n[3] c')
  })
  it('un segmento que parezca un número entre corchetes no se confunde: se numera igual', () => {
    expect(numerarSegmentos(cortarEnSegmentos('[7] falso número\n\nreal'))).toBe('[1] [7] falso número\n\n[2] real')
  })
  it('sin segmentos, texto vacío', () => { expect(numerarSegmentos([])).toBe('') })
})
