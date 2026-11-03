/**
 * 02-nov · decisión de Emilio («no rejas, para eso tenemos un gran equipo razonando»): la puerta del manual no retira fechas ni cifras sin fuente: las anota en el campo y el dueño decide al validar. US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { buildBrandBookRow } from '@/app/api/brand-book/[clientId]/route'
import { recomprobar } from '../firmes'
import { esSoloDatoSinFuente, MOTIVO_DE_DATO_SIN_FUENTE } from '../hechos'
import { fusionarPropuestas } from '../propuesta'

const C = '5c2d2dd5-a49e-4da3-87c3-03b504b734f6'
type Meta = Record<string, { datos_sin_fuente?: Array<{ dato: string; marca: string; motivo: string; clausula: string }>; estado?: string; provisional?: boolean }>
const pasar = (manual: Record<string, unknown>, fuentes: unknown[] = []) => recomprobar(manual, manual, { fuentes, dudas: [] } as never)
const meta = (m: Record<string, unknown>) => m._field_meta as Meta
const PROPIA = (texto: string) => ({ id: 's', tipo: 'primaria_propia', rotulo: 'sitio', canal: 'sitio', texto })

describe('fechas y cifras sin fuente', () => {
  it.each([
    ['fecha con verbo', 'Nació en 2015 en Quito', '2015', 'fecha'],
    ['fecha fundada', 'Fundada en 1998 junto al mar', '1998', 'fecha'],
    ['cifra', 'Atendemos con 200 mesas', '200', 'cifra'],
    ['precio', 'El plato cuesta $4,50', '450', 'cifra'],
  ])('🔴 %s: se queda en el texto, anotada, y no se retira', (_n, texto, dato, marca) => {
    const r = pasar({ historia_y_origen: texto })
    expect(r.manual.historia_y_origen).toBe(texto)
    expect(r.retirados).toEqual([])
    expect(meta(r.manual).historia_y_origen.datos_sin_fuente).toEqual([expect.objectContaining({ dato, marca, clausula: texto, motivo: MOTIVO_DE_DATO_SIN_FUENTE })])
  })

  it('🔴 nada queda PENDIENTE por código, aunque un campo tenga varias', () => {
    const r = pasar({ positioning: 'Desde 2015 con 200 mesas y 40 platos para 1000 clientes' })
    expect(JSON.stringify(r.manual)).not.toContain('PENDIENTE')
    expect(r.manual.positioning).toBe('Desde 2015 con 200 mesas y 40 platos para 1000 clientes')
  })

  it('🔴 en una lista se queda el elemento, y la nota va a su campo', () => {
    const r = pasar({ productos: ['Encebollado de $4,50', 'Ceviche'] })
    expect(r.manual.productos).toEqual(['Encebollado de $4,50', 'Ceviche'])
    expect(meta(r.manual).productos.datos_sin_fuente?.[0]).toMatchObject({ dato: '450' })
  })

  it('🔴 el campo queda provisional hasta que el dueño valide: el que lo lee sabe que hay un dato sin fuente', () => {
    expect(meta(pasar({ historia_y_origen: 'Nació en 2015' }).manual).historia_y_origen).toMatchObject({ estado: 'con_pendientes', provisional: true })
  })

  it('🔴 con fuente no hay nota', () => {
    const r = pasar({ historia_y_origen: 'Nació en 2015' }, [PROPIA('Abrimos en 2015 en la playa.')])
    expect(meta(r.manual).historia_y_origen.datos_sin_fuente).toEqual([])
    expect(r.manual.historia_y_origen).toBe('Nació en 2015')
  })

  it('🔴 la nota se recalcula: si el dato ya no está, la nota vieja se va', () => {
    const r = pasar({ vision: 'Ser recordados', _field_meta: { vision: { datos_sin_fuente: [{ dato: '2015' }] } } })
    expect(meta(r.manual).vision.datos_sin_fuente).toEqual([])
  })

  it('🔴 la nota sobrevive al guardar el manual', () => {
    const fila = buildBrandBookRow(C, pasar({ positioning: 'p', historia_y_origen: 'Nació en 2015' }).manual, {}) as unknown as Record<string, unknown>
    const d = (JSON.parse(String(fila.content_text)) as { brand_book_draft: Record<string, unknown> }).brand_book_draft
    expect(meta(d).historia_y_origen.datos_sin_fuente?.[0]).toMatchObject({ dato: '2015' })
  })
})

describe('lo que informa la puerta', () => {
  it('🔴 lo solo anotado cuenta como limpio y no como introducido', () => {
    const r = pasar({ historia_y_origen: 'Nació en 2015' })
    expect(r.limpio).toBe(true)
    expect(r.introducidos).toEqual([])
  })

  it('🔴 una palabra de certeza sin respaldo no cuenta como limpio, aunque se quede en el texto', () => {
    const r = pasar({ positioning: 'Somos el mejor restaurante de la costa, con buena comida para todos' })
    expect(r.limpio).toBe(false)
    expect(r.introducidos.length).toBeGreaterThan(0)
  })
})

describe('lo que lee el panel (`content_text.brand_book_draft`)', () => {
  it('🔴 llegan las notas de la puerta y del juez, y lo que declaró el equipo', () => {
    const manual = { positioning: 'p', historia_y_origen: 'Nació en 2015', _equipo: { declarado: ['conserva lo validado: tono_por_canal'] }, _field_meta: { historia_y_origen: { notas_del_juez: [{ dato: '2015', motivo: 'sin fuente' }] } } }
    const fila = buildBrandBookRow(C, pasar(manual).manual, {}) as unknown as Record<string, unknown>
    const d = (JSON.parse(String(fila.content_text)) as { brand_book_draft: Record<string, unknown> }).brand_book_draft
    expect(meta(d).historia_y_origen).toMatchObject({ notas_del_juez: [{ dato: '2015' }], datos_sin_fuente: [{ dato: '2015', motivo: MOTIVO_DE_DATO_SIN_FUENTE }] })
    expect(d._equipo).toEqual({ declarado: ['conserva lo validado: tono_por_canal'] })
  })
})

describe('lo demás sigue igual', () => {
  it('🔴 03-nov · una palabra de certeza sin respaldo se queda, no se retira y no se anota como dato', () => {
    const texto = 'Somos el mejor restaurante de la costa, con buena comida para todos'
    const r = pasar({ positioning: texto })
    expect(r.manual.positioning).toBe(texto)
    expect(r.retirados).toEqual([])
    expect(meta(r.manual).positioning.datos_sin_fuente).toEqual([])
    expect(meta(r.manual).positioning.provisional).toBe(false)
  })

  it('🔴 esSoloDatoSinFuente: si en la misma cláusula hay certeza y cifra, no es solo dato', () => {
    const h = { estado: 'sin_cita', detalle: [{ marca: 'cifra', estado: 'sin_cita' }, { marca: 'certeza', estado: 'sin_cita' }] }
    expect(esSoloDatoSinFuente(h as never)).toBe(false)
    expect(esSoloDatoSinFuente({ estado: 'sin_cita', detalle: [{ marca: 'cifra', estado: 'sin_cita' }, { marca: 'fecha', estado: 'solo_sintesis' }] } as never)).toBe(true)
    expect(esSoloDatoSinFuente({ estado: 'verificado', detalle: [{ marca: 'cifra', estado: 'verificado' }] } as never)).toBe(false)
    expect(esSoloDatoSinFuente({ estado: 'con_duda', detalle: [{ marca: 'cifra', estado: 'con_duda' }] } as never)).toBe(false)
  })

  it('🔴 lo verificado no se anota', () => {
    expect(meta(pasar({ positioning: 'Con 200 mesas' }, [PROPIA('Tenemos 200 mesas.')]).manual).positioning.datos_sin_fuente).toEqual([])
  })
})

describe('la propuesta del agente', () => {
  it('🔴 una fecha o una cifra sin fuente ya no frena la propuesta', () => {
    const r = fusionarPropuestas({}, [{ campo: 'historia_y_origen', valor: 'Nació en 2015', razon: 'r' }], [])
    expect(r.aplicadas).toEqual(['historia_y_origen'])
    expect(r.rechazadas).toEqual([])
    expect(String(r.draft.historia_y_origen)).toContain('Nació en 2015')
  })

  it('🔴 03-nov · una palabra de certeza sin respaldo tampoco la frena', () => {
    const r = fusionarPropuestas({}, [{ campo: 'positioning', valor: 'Somos el mejor restaurante de la costa', razon: 'r' }], [])
    expect(r.aplicadas).toEqual(['positioning'])
    expect(r.rechazadas).toEqual([])
    expect(String(r.draft.positioning)).toContain('Somos el mejor restaurante de la costa')
  })
})
