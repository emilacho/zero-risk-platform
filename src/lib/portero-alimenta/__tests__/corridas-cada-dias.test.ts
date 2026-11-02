/** Día de por medio hasta el cierre del ciclo de Apify (2-nov · firma de Emilio): `PORTERO_CORRIDAS_CADA_DIAS` + `PORTERO_CORRIDAS_CADA_DIAS_HASTA`. US$ 0 · sin red. */
import { describe, expect, it } from 'vitest'
import { corridaProgramadaAhora, corridaQueSeRevisa, corridasCadaDiasDelEntorno, corridasDelDia, diaConCorrida } from '../modo'
import { corridaDeLaHora } from '../modo-ruta'

const t = (iso: string) => new Date(iso)
const E = { PORTERO_CORRIDAS_CADA_DIAS: '2', PORTERO_CORRIDAS_CADA_DIAS_HASTA: '2026-11-25' }
const dias = (desde: string, n: number, env: Record<string, string | undefined>) => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${desde}T12:30:00Z`) + i * 86_400_000)).filter((d) => diaConCorrida(d, env)).map((d) => d.toISOString().slice(5, 10))

describe('PORTERO_CORRIDAS_CADA_DIAS', () => {
  it('ausente = todos los días (sin cambio)', () => {
    expect(corridasCadaDiasDelEntorno({})).toMatchObject({ activo: false, cada: 1, aviso: null })
    expect(diaConCorrida(t('2026-11-03T12:30:00Z'), {})).toBe(true)
    expect(corridasCadaDiasDelEntorno({ PORTERO_CORRIDAS_CADA_DIAS: '1' })).toMatchObject({ activo: false, aviso: null })
  })
  it('cada 2 días hasta el 25-nov: 02, 04, …, 24 corren y 03, 05, …, 23 no; desde el 25-nov vuelve SOLA a diaria', () => {
    expect(dias('2026-11-02', 35, E)).toEqual(['11-02', '11-04', '11-06', '11-08', '11-10', '11-12', '11-14', '11-16', '11-18', '11-20', '11-22', '11-24', '11-25', '11-26', '11-27', '11-28', '11-29', '11-30', '12-01', '12-02', '12-03', '12-04', '12-05', '12-06'])
    // del 03 al 24 de nov (lo que queda del ciclo): 11 corridas
    expect(dias('2026-11-03', 22, E)).toHaveLength(11)
  })
  it('cada 3 días cuenta hacia atrás desde el último día antes de HASTA', () => {
    expect(dias('2026-11-17', 9, { PORTERO_CORRIDAS_CADA_DIAS: '3', PORTERO_CORRIDAS_CADA_DIAS_HASTA: '2026-11-25' })).toEqual(['11-18', '11-21', '11-24', '11-25'])
  })
  it('sin HASTA, con HASTA roto o con un número roto: diaria y lo dice (nunca se queda a medias para siempre)', () => {
    for (const env of [{ PORTERO_CORRIDAS_CADA_DIAS: '2' }, { PORTERO_CORRIDAS_CADA_DIAS: '2', PORTERO_CORRIDAS_CADA_DIAS_HASTA: 'pronto' }, { PORTERO_CORRIDAS_CADA_DIAS: '2', PORTERO_CORRIDAS_CADA_DIAS_HASTA: '2026-13-45' }]) {
      const r = corridasCadaDiasDelEntorno(env); expect(r.activo).toBe(false); expect(r.aviso).toMatch(/HASTA/); expect(diaConCorrida(t('2026-11-03T12:30:00Z'), env)).toBe(true)
    }
    for (const v of ['0', '-2', '2.5', 'dos', '9']) { const r = corridasCadaDiasDelEntorno({ PORTERO_CORRIDAS_CADA_DIAS: v, PORTERO_CORRIDAS_CADA_DIAS_HASTA: '2026-11-25' }); expect(r.activo).toBe(false); expect(r.aviso).toMatch(/no se entiende/) }
  })
  it('en un día sin corrida la puerta no abre: ni la hora programada, ni la lista del día, ni lo que los vigías revisan', () => {
    expect(corridaProgramadaAhora('construccion', t('2026-11-03T12:30:05Z'), 20, { ...E, PORTERO_CORRIDAS_POR_DIA: '1' })).toBeNull()
    expect(corridaProgramadaAhora('construccion', t('2026-11-04T12:30:05Z'), 20, { ...E, PORTERO_CORRIDAS_POR_DIA: '1' })).not.toBeNull()
    expect(corridasDelDia('construccion', t('2026-11-03T15:00:00Z'), E)).toEqual([])
    expect(corridasDelDia('construccion', t('2026-11-04T15:00:00Z'), { ...E, PORTERO_CORRIDAS_POR_DIA: '1' })).toHaveLength(1)
    const UNA = { ...E, PORTERO_CORRIDAS_POR_DIA: '1' }
    expect(corridaQueSeRevisa('construccion', t('2026-11-03T14:15:00Z'), 60, 180, UNA)).toBeNull()
    expect(corridaQueSeRevisa('construccion', t('2026-11-04T14:15:00Z'), 60, 180, UNA)?.toISOString()).toBe('2026-11-04T12:30:00.000Z')
  })
  it('la corrida de las 00:30 pertenece al día en que empieza (con tres al día)', () => {
    // 00:30 del 04-nov es día con corrida; 00:30 del 03-nov no
    expect(corridaProgramadaAhora('construccion', t('2026-11-04T00:31:00Z'), 20, E)).not.toBeNull()
    expect(corridaProgramadaAhora('construccion', t('2026-11-03T00:31:00Z'), 20, E)).toBeNull()
  })
  it('la ruta del modo informa el ritmo y que hoy no toca, y nunca toca el dinero', async () => {
    const env = { PORTERO_MODO: 'construccion', PORTERO_CORRIDAS_POR_DIA: '1', ...E }
    const sin = await corridaDeLaHora({ env, ahora: t('2026-11-03T12:30:30Z') })
    expect(sin).toMatchObject({ corre_ahora: false, forzar: false, hoy_toca_corrida: false, cada_dias: 2, cada_dias_hasta: '2026-11-25', tope_diario_por_cliente_usd: 3, corridas_por_dia: 1 })
    const con = await corridaDeLaHora({ env, ahora: t('2026-11-04T12:30:30Z') })
    expect(con).toMatchObject({ corre_ahora: true, forzar: true, hoy_toca_corrida: true })
    const nuevo = await corridaDeLaHora({ env, ahora: t('2026-11-25T12:30:30Z') })
    expect(nuevo).toMatchObject({ corre_ahora: true, cada_dias: 2 })
    const roto = await corridaDeLaHora({ env: { PORTERO_CORRIDAS_CADA_DIAS: '2' }, ahora: t('2026-11-03T12:30:30Z') })
    expect(roto.aviso_cada_dias).toMatch(/HASTA/); expect(roto.corre_ahora).toBe(true)
  })
})
