/** La frecuencia del portero es un dato aparte del modo (2-nov · firma de Emilio, opción B): `PORTERO_CORRIDAS_POR_DIA`. US$ 0 · sin red. */
import { describe, expect, it } from 'vitest'
import { corridaForzada, corridaProgramadaAhora, corridaQueSeRevisa, corridasDelDia, corridasPorDiaDelEntorno, eldineroFrena, horasDeCorrida, topeDiarioPorClienteUsd } from '../modo'
import { corridaDeLaHora } from '../modo-ruta'

const t = (iso: string) => new Date(iso)
const UNA = { PORTERO_CORRIDAS_POR_DIA: '1' }

describe('PORTERO_CORRIDAS_POR_DIA', () => {
  it('ausente → las del modo (hoy 3 en construcción, 1 en campaña): nada cambia hasta que se ponga', () => {
    expect(corridasPorDiaDelEntorno('construccion', {})).toMatchObject({ n: 3, origen: 'por_modo', aviso: null })
    expect(corridasPorDiaDelEntorno('campana', {})).toMatchObject({ n: 1, origen: 'por_modo' })
    expect(corridasPorDiaDelEntorno('construccion', { PORTERO_CORRIDAS_POR_DIA: '  ' }).origen).toBe('por_modo')
  })
  it('1, 2 o 3 recortan la lista; más de las que tiene el modo se queda en el tope del modo', () => {
    expect(horasDeCorrida('construccion', UNA).map((c) => c.hhmm)).toEqual(['12:30'])
    expect(horasDeCorrida('construccion', { PORTERO_CORRIDAS_POR_DIA: '2' }).map((c) => c.hhmm)).toEqual(['12:30', '18:30'])
    expect(horasDeCorrida('construccion', { PORTERO_CORRIDAS_POR_DIA: '3' }).map((c) => c.hhmm)).toEqual(['12:30', '18:30', '00:30'])
    expect(horasDeCorrida('construccion', { PORTERO_CORRIDAS_POR_DIA: '9' })).toHaveLength(3)
    expect(horasDeCorrida('campana', { PORTERO_CORRIDAS_POR_DIA: '3' })).toHaveLength(1)
  })
  it('un valor roto cae a 1 y lo dice', () => {
    for (const v of ['0', '-1', '1.5', 'tres', 'NaN']) {
      const r = corridasPorDiaDelEntorno('construccion', { PORTERO_CORRIDAS_POR_DIA: v })
      expect(r).toMatchObject({ n: 1, origen: 'valor_roto' }); expect(r.aviso).toMatch(/1 corrida al día/)
    }
  })
  it('con 1 al día en construcción: solo toca a las 12:30; las 18:30 y 00:30 no corren', () => {
    expect(corridaProgramadaAhora('construccion', t('2026-11-03T12:30:05Z'), 20, UNA)).not.toBeNull()
    expect(corridaProgramadaAhora('construccion', t('2026-11-03T18:30:05Z'), 20, UNA)).toBeNull()
    expect(corridaProgramadaAhora('construccion', t('2026-11-04T00:30:05Z'), 20, UNA)).toBeNull()
    expect(corridasDelDia('construccion', t('2026-11-03T15:00:00Z'), UNA).map((d) => d.toISOString().slice(11, 16))).toEqual(['12:30'])
  })
  it('los vigías solo revisan la de las 12:30', () => {
    expect(corridaQueSeRevisa('construccion', t('2026-11-03T14:15:00Z'), 60, 180, UNA)?.toISOString()).toBe('2026-11-03T12:30:00.000Z')
    expect(corridaQueSeRevisa('construccion', t('2026-11-03T20:15:00Z'), 60, 180, UNA)).toBeNull()
    expect(corridaQueSeRevisa('construccion', t('2026-11-04T02:15:00Z'), 60, 180, UNA)).toBeNull()
  })
  it('la ruta del modo lo informa y NO toca el dinero: sigue sin frenar y el tope de construcción no cambia', async () => {
    const env = { PORTERO_MODO: 'construccion', ...UNA }
    const a = await corridaDeLaHora({ env, ahora: t('2026-11-03T18:30:30Z') })
    expect(a).toMatchObject({ modo: 'construccion', corre_ahora: false, forzar: false, corridas_utc: ['12:30'], corridas_por_dia: 1, origen_de_las_corridas: 'variable', tope_diario_por_cliente_usd: 3 })
    const b = await corridaDeLaHora({ env, ahora: t('2026-11-03T12:30:30Z') })
    expect(b).toMatchObject({ corre_ahora: true, forzar: true, corridas_por_dia: 1 })
    expect(eldineroFrena('construccion')).toBe(false); expect(topeDiarioPorClienteUsd('construccion')).toBe(3); expect(corridaForzada('construccion')).toBe(true)
  })
  it('un valor roto sale como aviso en la ruta', async () => {
    const r = await corridaDeLaHora({ env: { PORTERO_CORRIDAS_POR_DIA: 'tres' }, ahora: t('2026-11-03T12:30:30Z') })
    expect(r.aviso_corridas).toMatch(/PORTERO_CORRIDAS_POR_DIA/); expect(r.corridas_por_dia).toBe(1)
  })
})
