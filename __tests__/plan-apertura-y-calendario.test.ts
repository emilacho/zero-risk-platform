/**
 * 04-nov · ADENDA 2 del GO de Lenovo: la oficina financiera recibe lo que sirve para números (punto 7) y el sistema calcula las semanas del plan (punto 10).
 */
import { describe, expect, it } from 'vitest'
import { aProcedencia, armarSemillaCompacta, sirveParaNumeros } from '../src/lib/planeacion/dato-v1/semilla-compacta'
import type { DatoV1 } from '../src/lib/planeacion/dato-v1/tipos'
import { calendarioDesde, hoyEnElPais } from '../src/lib/planeacion/calendario-del-plan'

const dato = (n: number, o: Record<string, unknown>): DatoV1 => ({ id: 'D' + n, tipo_id: 'texto_sitio', origen: 'medido', fuente_id: 'f', estado: 'trajo', valor: { texto_corto: 'x'.repeat(300) }, identidad: { estado: 'confirmada' }, frescura: { edad_h: 1 }, periodo: { tipo: 'puntual' }, alcance: 'cliente', confianza: 'alta', marcas: [], ...o }) as unknown as DatoV1
const textos = Array.from({ length: 200 }, (_, i) => dato(i + 1, {}))
const numeros = [dato(301, { tipo_id: 'ventas_mes', origen: 'supuesto', valor: { numero: 4530 } }), dato(302, { tipo_id: 'ticket_promedio', origen: 'supuesto', valor: { numero: 10.63 } }), dato(303, { tipo_id: 'dato_del_dueno', origen: 'supuesto', valor: { texto_corto: '200 por semana' } })]

describe('7 · lo que sirve para números entra siempre', () => {
  const s = armarSemillaCompacta([...textos, ...numeros])
  it('🔴 ventas, ticket y lo que dijo el dueño viajan aunque el presupuesto se llene de textos', () => {
    for (const id of ['D301', 'D302', 'D303']) expect(s.datos.map((d) => d.id)).toContain(id)
  })
  it('🔴 los textos siguen con su presupuesto y lo que no cabe se declara', () => {
    expect(s.datos_omitidos).toBeGreaterThan(0)
    expect(s.omitidos).not.toContain('D301')
    expect(JSON.stringify(s.datos.filter((d) => !['D301', 'D302', 'D303'].includes(String(d.id)))).length).toBeLessThanOrEqual(24_000)
  })
  it('🔴 muchos números no sacan a nadie: entran todos', () => {
    const muchos = Array.from({ length: 300 }, (_, i) => dato(i + 1000, { tipo_id: 'precio', valor: { numero: i } }))
    expect(armarSemillaCompacta(muchos).datos).toHaveLength(300)
  })
  it('🔴 un hueco no cuenta como número, aunque traiga cifra', () => {
    expect(sirveParaNumeros(aProcedencia(dato(1, { origen: 'hueco', valor: { numero: 1 } })))).toBe(false)
  })
  it('🔴 lo que dijo el dueño entra aunque los textos llenen todo antes', () => {
    const largos = Array.from({ length: 300 }, (_, i) => dato(i + 1, { valor: { texto_corto: 'x'.repeat(600) } }))
    const del = dato(999, { tipo_id: 'dato_del_dueno', origen: 'supuesto', valor: { texto_corto: 'y'.repeat(600) } })
    expect(armarSemillaCompacta([...largos, del]).datos.map((d) => d.id)).toContain('D999')
  })
  it('🔴 un cero es una cifra: «0 ventas» entra', () => {
    const largos = Array.from({ length: 300 }, (_, i) => dato(i + 1, { valor: { texto_corto: 'x'.repeat(600) } }))
    const cero = dato(998, { tipo_id: 'ventas_mes', origen: 'supuesto', valor: { numero: 0 } })
    expect(sirveParaNumeros(aProcedencia(cero))).toBe(true)
    expect(armarSemillaCompacta([...largos, cero]).datos.map((d) => d.id)).toContain('D998')
  })
  it('🔴 los ids y el orden no cambian: las citas siguen sirviendo', () => {
    const ids = s.datos.map((d) => Number(String(d.id).slice(1)))
    expect(ids).toEqual([...ids].sort((a, b) => a - b))
  })
})

describe('10 · el calendario', () => {
  it('🔴 12 semanas seguidas de 7 días, desde el arranque', () => {
    const c = calendarioDesde('2026-11-04')
    expect(c.semanas).toHaveLength(12)
    expect(c.semanas[0]).toEqual({ semana: 1, desde: '2026-11-04', hasta: '2026-11-10' })
    expect(c.semanas[11]).toEqual({ semana: 12, desde: '2027-01-20', hasta: '2027-01-26' })
    expect(c.termina).toBe('2027-01-26')
    c.semanas.slice(1).forEach((s, i) => expect(Date.parse(s.desde) - Date.parse(c.semanas[i].hasta)).toBe(86_400_000))
  })
  it('🔴 cruza año bisiesto sin saltos', () => {
    expect(calendarioDesde('2028-02-25').semanas[0].hasta).toBe('2028-03-02')
  })
  it('🔴 el día es el del país, no el de UTC', () => {
    const noche = new Date('2026-11-05T02:00:00Z')
    expect(hoyEnElPais(noche, 'EC')).toBe('2026-11-04')
    expect(hoyEnElPais(noche, 'ec')).toBe('2026-11-04')
    expect(hoyEnElPais(noche, null)).toBe('2026-11-05')
    expect(hoyEnElPais(noche, 'ZZ')).toBe('2026-11-05')
  })
})
