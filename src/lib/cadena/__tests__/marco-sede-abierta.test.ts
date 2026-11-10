/**
 * 10-nov · RESPUESTA de Lenovo por Emilio («marco de la mesa con sede abierta»): cuando la ficha tiene una sede ABIERTA, el marco de la mesa
 * (brief y gran idea) lo dice con su fecha: «ABIERTA desde <fecha>: la pre-apertura ya pasó». Genérico para cualquier cliente y sede.
 * Caso real (anonimizado en la clave): la sede tenía «por abrir» del 15-oct y ahora «abierta» observada el 09-nov; la mesa leía «POR ABRIR» y proponía pre-apertura.
 */
import { describe, expect, it } from 'vitest'
import { aperturaDeLasSedes, contextoDeEstado, contextoDeLaMesa, estadoDeLasSedes } from '../../sedes/por-abrir'
import { clienteA, contextoDe } from '../__fixtures__/clientes'
import { marcoDelBrief, marcoDelConcepto } from '../mesas'

const A = clienteA()
const ctx = contextoDe(A)
const clave = A.sedes[0].clave
const dato = (valor: string, en: string, c = clave, campo = 'estado_de_la_sede') => ({ clave: c, campo, valor_texto: valor, observado_en: en })
const REAL = [dato('por abrir', '2026-10-15T22:13:16.421+00:00'), dato('abierta', '2026-11-09T05:00:00+00:00')]

describe('desde cuándo está abierta cada sede', () => {
  it('🔴 caso real: «por abrir» del 15-oct y «abierta» del 09-nov → abierta desde 2026-11-09', () => {
    expect(estadoDeLasSedes({ datosDeSede: REAL }).get(clave)).toBe('abierta')
    expect(aperturaDeLasSedes({ datosDeSede: REAL }).get(clave)).toBe('2026-11-09')
  })
  it('🔴 si lo más nuevo es «por abrir», no hay fecha de apertura (aunque antes haya dicho abierta)', () => {
    const vuelta = [dato('abierta', '2026-10-01T00:00:00Z'), dato('por abrir', '2026-10-20T00:00:00Z')]
    expect(aperturaDeLasSedes({ datosDeSede: vuelta }).size).toBe(0)
  })
  it('🔴 con dos observaciones «abierta», manda la más nueva; otra sede u otro campo no cuentan', () => {
    const d = [dato('abierta', '2026-11-01T00:00:00Z'), dato('abierto', '2026-11-05T00:00:00Z'), dato('abierta', '2026-12-01T00:00:00Z', 'otra'), dato('abierta', '2026-12-02T00:00:00Z', clave, 'horario')]
    const m = aperturaDeLasSedes({ datosDeSede: d })
    expect(m.get(clave)).toBe('2026-11-05')
    expect(m.get('otra')).toBe('2026-12-01')
  })
  it('🔴 la ficha del cliente dice abierta y hay un «por abrir» más nuevo: la fecha sale de la observación «abierta», nunca del «por abrir»', () => {
    const e = { config: { apify: { sedes_estado: { [clave]: 'abierta' } } }, datosDeSede: [dato('abierta', '2026-11-01T00:00:00Z'), dato('por abrir', '2026-11-05T00:00:00Z')] }
    expect(estadoDeLasSedes(e).get(clave)).toBe('abierta')
    expect(aperturaDeLasSedes(e).get(clave)).toBe('2026-11-01')
  })
  it('abierta solo por la ficha del cliente (sin dato de la sede): abierta, pero sin fecha', () => {
    const e = { config: { apify: { sedes_estado: { [clave]: 'abierta' } } } }
    expect(estadoDeLasSedes(e).get(clave)).toBe('abierta')
    expect(aperturaDeLasSedes(e).size).toBe(0)
  })
})

describe('lo que dice el marco de la mesa', () => {
  it('🔴 abierta con fecha / sin fecha; por abrir y cerrada dicen lo de siempre; sin dato, nada', () => {
    expect(contextoDeLaMesa('abierta', '2026-11-09')).toBe('ABIERTA desde 2026-11-09: la pre-apertura ya pasó. No propongas expectativa ni preinauguración; la apertura se cuenta como hecho, no como promesa')
    expect(contextoDeLaMesa('abierta')).toMatch(/^ABIERTA: la pre-apertura ya pasó/)
    expect(contextoDeLaMesa('por_abrir', '2026-11-09')).toBe(contextoDeEstado('por_abrir'))
    expect(contextoDeLaMesa('cerrada')).toBe(contextoDeEstado('cerrada'))
    expect(contextoDeLaMesa(undefined)).toBeNull()
  })
  it('🔴 brief y gran idea: la sede abierta sale con su fecha, junto a su sede, una sola vez', () => {
    const c = { ...ctx, sedes: ctx.sedes.map((s, i) => (i === 0 ? { ...s, estado: 'abierta' as const, abierta_desde: '2026-11-09' } : s)) }
    for (const t of [
      marcoDelBrief({ ctx: c, estrategia: A.estrategia, version: 1, devolucion: null, nota: null }),
      marcoDelConcepto({ ctx: c, estrategia: A.estrategia, briefTexto: 'brief', version: 1, nota: null }),
    ]) {
      const linea = t.split('\n').find((l) => l.includes('ABIERTA desde 2026-11-09: la pre-apertura ya pasó'))
      expect(linea).toContain(clave)
      expect(t.split('ABIERTA desde').length).toBe(2)
      expect(t).not.toContain('POR ABRIR')
    }
  })
})
