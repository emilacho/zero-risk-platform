/**
 * Todo lo que espera tiene reloj (V21) · condiciones 2 y 5 de CC#3. Funciones puras, US$ 0.
 */
import { describe, it, expect } from 'vitest'
import { calcularReloj, escalonQueToca, expiresInHours, invarianteDeReloj, type EstadoParaInvariante, type PlazoCfg } from '../esperas'

const plazo = (p: Partial<PlazoCfg> & { tipo: string }): PlazoCfg => ({ recordatorio_horas: null, alerta_horas: null, vence_horas: null, vence_regla: null, accion_al_vencer: 'x', ...p })
const AHORA = '2026-10-12T12:00:00Z'

describe('calcularReloj · una espera sin plazo no existe', () => {
  it('por horas: recordatorio, alerta y vencimiento ordenados', () => {
    const r = calcularReloj(plazo({ tipo: 'necesita_humano', recordatorio_horas: 24, alerta_horas: 0, vence_horas: 168 }), AHORA)
    expect(r.recordatorio_en).toBe('2026-10-13T12:00:00.000Z')
    expect(r.alerta_en).toBe('2026-10-12T12:00:00.000Z')
    expect(r.vence_en).toBe('2026-10-19T12:00:00.000Z')
  })
  it('la bandeja vence al final del día de la pieza; una pieza que ya perdió su fecha vence YA (no en el pasado)', () => {
    const p = plazo({ tipo: 'aprobacion_bandeja', recordatorio_horas: 24, alerta_horas: 72, vence_regla: 'fecha_de_la_pieza', accion_al_vencer: 'perdio_su_fecha' })
    expect(calcularReloj(p, AHORA, { fechaPieza: '2026-10-30' }).vence_en).toBe('2026-10-30T23:59:59.000Z')
    const vieja = calcularReloj(p, AHORA, { fechaPieza: '2026-10-01' })
    expect(vieja.vence_en).toBe('2026-10-12T12:00:00.000Z')
    expect(Date.parse(vieja.recordatorio_en!)).toBeLessThanOrEqual(Date.parse(vieja.vence_en))
  })
  it('el video vence a fecha − lead; la fecha de inicio, un día antes; la pausada, en el resumen semanal', () => {
    expect(calcularReloj(plazo({ tipo: 'espera_video', vence_regla: 'fecha_menos_lead_dias_video' }), AHORA, { fechaPieza: '2026-11-10', leadDiasVideo: 5 }).vence_en).toBe('2026-11-05T00:00:00.000Z')
    expect(calcularReloj(plazo({ tipo: 'fecha_inicio_propuesta', vence_regla: 'fecha_inicio_menos_1_dia' }), AHORA, { fechaInicio: '2026-10-19' }).vence_en).toBe('2026-10-18T00:00:00.000Z')
    expect(calcularReloj(plazo({ tipo: 'campana_pausada', vence_regla: 'resumen_semanal' }), AHORA).vence_en).toBe('2026-10-19T12:00:00.000Z')
  })
  it('si faltan los datos para calcular el plazo, NO crea una espera sin reloj: falla fuerte', () => {
    expect(() => calcularReloj(plazo({ tipo: 'aprobacion_bandeja', vence_regla: 'fecha_de_la_pieza' }), AHORA)).toThrow(/sin reloj/)
    expect(() => calcularReloj(plazo({ tipo: 'x' }), AHORA)).toThrow()
    expect(() => calcularReloj(plazo({ tipo: 'x', vence_horas: 1 }), 'no es fecha')).toThrow()
  })
})

describe('condición 5 · la bandeja no caduca a la vez que sale la alerta', () => {
  it('expires_in_hours es al menos 1 h más que la alerta de 72 h, aunque la pieza sea inmediata', () => {
    expect(expiresInHours(AHORA, '2026-10-12')).toBeGreaterThanOrEqual(73)
    expect(expiresInHours(AHORA, '2026-10-13')).toBeGreaterThanOrEqual(73)
  })
  it('para una pieza lejana, dura hasta el final del día de la pieza', () => {
    const h = expiresInHours(AHORA, '2026-11-12')
    expect(h).toBe(Math.ceil((Date.parse('2026-11-12T23:59:59Z') - Date.parse(AHORA)) / 3_600_000))
    expect(h).toBeGreaterThan(72)
  })
})

describe('escalones: cada uno una sola vez', () => {
  const e = { id: 1, estado: 'viva', objeto_tipo: 'aprobacion_bandeja', objeto_id: 'x', recordatorio_en: '2026-10-13T12:00:00Z', alerta_en: '2026-10-15T12:00:00Z', vence_en: '2026-10-20T00:00:00Z', rung_enviado: 0 }
  it('antes de nada, ninguno; luego recordatorio, alerta, vencida, en orden y sin repetir', () => {
    expect(escalonQueToca(e, '2026-10-12T13:00:00Z')).toBeNull()
    expect(escalonQueToca(e, '2026-10-13T12:00:01Z')).toBe(1)
    expect(escalonQueToca({ ...e, rung_enviado: 1 }, '2026-10-13T13:00:00Z')).toBeNull() // el recordatorio ya salió
    expect(escalonQueToca({ ...e, rung_enviado: 1 }, '2026-10-15T12:00:01Z')).toBe(2)
    expect(escalonQueToca({ ...e, rung_enviado: 2 }, '2026-10-20T00:00:01Z')).toBe(3)
    expect(escalonQueToca({ ...e, rung_enviado: 3 }, '2026-10-21T00:00:00Z')).toBeNull()
  })
  it('si el vigía estuvo parado y se saltó escalones, manda el que corresponde ahora, no todos juntos', () => {
    expect(escalonQueToca(e, '2026-10-25T00:00:00Z')).toBe(3)
  })
  it('una espera resuelta o cancelada no escala', () => {
    expect(escalonQueToca({ ...e, estado: 'resuelta' }, '2026-10-25T00:00:00Z')).toBeNull()
  })
})

describe('V21 · el invariante de reloj (condición 2: el reloj que vigila a los relojes no puede ser circular)', () => {
  const sano: EstadoParaInvariante = {
    ahora: AHORA, esperas: [], campanasEnEspera: [], filasEnEspera: [], esperasPorCampana: [], corridasEnCurso: [],
    ultimoLatido: '2026-10-12T06:00:00Z', latidoMaxHoras: 18,
  }
  it('un estado sano no tiene violaciones', () => {
    expect(invarianteDeReloj(sano)).toEqual([])
  })
  it('el vigía parado (sin latido o con latido viejo) es una violación', () => {
    expect(invarianteDeReloj({ ...sano, ultimoLatido: null }).map((v) => v.tipo)).toEqual(['vigia_sin_latido'])
    expect(invarianteDeReloj({ ...sano, ultimoLatido: '2026-10-11T12:00:00Z' }).map((v) => v.tipo)).toEqual(['vigia_parado'])
    expect(invarianteDeReloj({ ...sano, ultimoLatido: '2026-10-11T19:00:00Z' })).toEqual([]) // 17 h: dentro del margen
  })
  it('una llamada de agente colgada pasado su plazo, o sin plazo, se ve (un agente de más de 13 min nunca vuelve)', () => {
    expect(invarianteDeReloj({ ...sano, corridasEnCurso: [{ id: 7, plazo_en: '2026-10-12T11:00:00Z' }] }).map((v) => v.tipo)).toEqual(['llamada_colgada'])
    expect(invarianteDeReloj({ ...sano, corridasEnCurso: [{ id: 8, plazo_en: null }] }).map((v) => v.tipo)).toEqual(['llamada_sin_plazo'])
    expect(invarianteDeReloj({ ...sano, corridasEnCurso: [{ id: 9, plazo_en: '2026-10-12T12:10:00Z' }] })).toEqual([])
  })
  it('una campaña necesita_humano o PAUSADA sin espera viva es una violación (la pausada también tiene reloj)', () => {
    expect(invarianteDeReloj({ ...sano, campanasEnEspera: [{ id: 'c1', estado: 'pausada' }] }).map((v) => v.tipo)).toEqual(['campana_sin_reloj'])
    expect(invarianteDeReloj({ ...sano, campanasEnEspera: [{ id: 'c1', estado: 'necesita_humano' }], esperasPorCampana: [{ campana_id: 'c1', objeto_tipo: 'necesita_humano', objeto_id: 'c1' }] })).toEqual([])
    expect(invarianteDeReloj({ ...sano, campanasEnEspera: [{ id: 'c1', estado: 'pausada' }], esperasPorCampana: [{ campana_id: 'c1', objeto_tipo: 'necesita_humano', objeto_id: 'c1' }] })).toHaveLength(1) // el reloj equivocado no vale
  })
  it('una fila en investigación o esperando video sin su espera es una violación', () => {
    const f = [{ id: 's1-d1-a', estado: 'en_investigacion', campana_id: 'c1' }, { id: 's1-d3-r', estado: 'espera_video', campana_id: 'c1' }]
    expect(invarianteDeReloj({ ...sano, filasEnEspera: f }).map((v) => v.tipo)).toEqual(['fila_sin_reloj', 'fila_sin_reloj'])
    const con = [{ campana_id: 'c1', objeto_tipo: 'dato_en_investigacion', objeto_id: 's1-d1-a' }, { campana_id: 'c1', objeto_tipo: 'espera_video', objeto_id: 's1-d3-r' }]
    expect(invarianteDeReloj({ ...sano, filasEnEspera: f, esperasPorCampana: con })).toEqual([])
  })
  it('una espera viva sin vence_en es una violación', () => {
    expect(invarianteDeReloj({ ...sano, esperas: [{ id: 1, estado: 'viva', vence_en: null, recordatorio_en: null, alerta_en: null, rung_enviado: 0, objeto_tipo: 'x', objeto_id: 'y' }] }).map((v) => v.tipo)).toEqual(['espera_sin_plazo'])
  })
})
