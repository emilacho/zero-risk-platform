/**
 * El pulido descartaba el 19-oct 12 líneas buenas (precios y ventas) porque la guarda comparaba las cifras como LETRAS: «3 50» → «3,50», «5482,00» → «5.482,00».
 * Ahora se comparan como VALORES. Lo que sigue prohibido: una cifra que la fuente no tiene. US$ 0 · sin red.
 */
import { describe, expect, it } from 'vitest'
import { validarPulido, valoresDeCifras } from '../resumen-pulido'

const L = (txt: string, id: string) => `- ${txt} [ficha:${id} · 2026-10-14]`
const ARMADO = (lineas: string[]) => ['RESUMEN VIVO · X · armado el 2026-10-19', '', '## Qué vende y a qué precio', ...lineas, '', '## Cifras y su tendencia', L('seguidores en Instagram: 1236', 'aaaaaaa1'), L('ventas del mes: 3382,00 en 326 tickets', 'aaaaaaa2')].join('\n')
const base = ARMADO([L('producto ceviche mixto precio 9 00 usd', 'bbbbbbb1'), L('producto encebollado junior precio 3 50 usd', 'bbbbbbb2')])

describe('cifras por valor', () => {
  it('lee «1.236», «1,236» y «1236» como el mismo valor y «3 50» no es una cifra aparte', () => {
    expect(valoresDeCifras('1236')[0]).toContain(1236)
    expect(valoresDeCifras('1.236')[0]).toContain(1236)
    expect(valoresDeCifras('5.482,00')[0]).toContain(5482)
    expect(valoresDeCifras('3,50')[0]).toContain(3.5)
  })

  it('un número bien escrito de otra forma NO descarta la línea', () => {
    const salida = ARMADO([L('ceviche mixto: 9,00 USD', 'bbbbbbb1'), L('encebollado junior: 3,50 USD', 'bbbbbbb2')]).replace('1236', '1.236').replace('3382,00', '3.382,00')
    const v = validarPulido(base, salida)
    expect(v.descartadas.filter((d) => /cifra/.test(d.por_que))).toEqual([])
    expect(v.usado).toBe(true)
  })

  it('una cifra que la ficha citada no tiene SIGUE descartando la línea', () => {
    const salida = ARMADO([L('ceviche mixto: 9,50 USD', 'bbbbbbb1'), L('encebollado junior: 3,50 USD', 'bbbbbbb2')])
    const v = validarPulido(base, salida)
    expect(v.descartadas.some((d) => /cifra que no está/.test(d.por_que) && /9\.5/.test(d.por_que))).toBe(true)
  })

  it('«3 50» no deja pasar «350» ni «3 5» como otro precio', () => {
    const salida = ARMADO([L('ceviche mixto: 9,00 USD', 'bbbbbbb1'), L('encebollado junior: 350 USD', 'bbbbbbb2')])
    const v = validarPulido(base, salida)
    expect(v.descartadas.some((d) => /cifra que no está/.test(d.por_que))).toBe(true)
  })
})
