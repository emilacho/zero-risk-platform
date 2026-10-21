/** Envoltorio del vigía de la prueba real: la alarma del tope no puede decir «apagado» si el apagado falló, y la suma de fichas del mismo nombre llega al vigía certificado. Puro, sin red. */
import { describe, expect, it } from 'vitest'
import { alarmaDelTope, argumentosBase, CLAVE_DE_LA_ALARMA } from '../scripts/ops/vigilar-prueba-real.mjs'

const CLI = '41dd3d62-d6de-4c9a-9996-6df78c1da118'
const P = { cliente: CLI, desde: '2026-10-20T19:22:00Z', tope: '13', aviso: '10.4', env: '/ruta/.env.local' }

describe('alarma del tope', () => {
  it('con el código 20 (apagado y leído de vuelta) dice que los módulos están apagados', () => {
    const a = alarmaDelTope({ status: 20, tope: '13' })
    expect(a.titulo).toContain('módulos apagados'); expect(a.titulo).not.toContain('NO se pudo')
    expect(a.detalle).toContain('US$ 13'); expect(a.detalle).toContain('leídos de vuelta')
  })
  it.each([[4], [2], [null], [undefined], [1], [0]])('con el código %s NO afirma que esté apagado y manda a apagar a mano', (status) => {
    const a = alarmaDelTope({ status: status as never, tope: '13' })
    expect(a.titulo).toContain('NO se pudo confirmar el apagado')
    expect(a.titulo).not.toContain('y módulos apagados')
    expect(a.detalle).toContain('APAGAR A MANO'); expect(a.detalle).toContain(String(status ?? 'sin código'))
    expect(a.detalle).not.toContain('leídos de vuelta')
  })
  it('el código 4 explica qué significa', () => {
    expect(alarmaDelTope({ status: 4, tope: '13' }).detalle).toContain('no se pudo leer de vuelta')
  })
  it('aviso y tope comparten la clave del incidente (el tope va en el hilo del aviso)', () => { expect(CLAVE_DE_LA_ALARMA).toBe('gasto-prueba-real') })
})

describe('argumentos que recibe el vigía certificado', () => {
  it('sin --mismo-nombre mide solo la ficha pedida', () => {
    const a = argumentosBase(P)
    expect(a).toEqual(['--cliente', CLI, '--desde', P.desde, '--tope', '13', '--aviso', '10.4', '--una-vez', '--env', '/ruta/.env.local'])
    expect(a).not.toContain('--mismo-nombre')
  })
  it('con --mismo-nombre se lo reenvía al vigía (suma las fichas con el mismo nombre)', () => {
    expect(argumentosBase({ ...P, mismoNombre: true })).toContain('--mismo-nombre')
  })
  it('--una-vez va siempre (el envoltorio es quien repite la vuelta)', () => { expect(argumentosBase(P)).toContain('--una-vez') })
})
