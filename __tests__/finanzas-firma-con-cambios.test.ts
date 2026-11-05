/**
 * Firmar con cifras cambiadas (05-nov · boceto 2): el dueño cambia una cifra y el código recalcula el resto. Puro, US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { calcular } from '../src/lib/finanzas/calculadora'
import { huellaDe, numerosDelBloque } from '../src/lib/finanzas/firma'
import { CIFRAS_EDITABLES, entradaReproduceElTablero, esEditable, FUENTE_DEL_DUENO, FUENTE_DESPEJADA, recalcularConCambios } from '../src/lib/finanzas/firma-con-cambios'
import type { Bloque, Entrada } from '../src/lib/finanzas/tipos'

const ENTRADA: Entrada = {
  meta_por_semana: 10, dias_activos_por_semana: 5, pasos: [{ tasa: 0.5 }], ticket: 40, margen: 0.5, periodos: 1, costo_entrega: 2,
  referencia: { min: 2, max: 4, base: 3, tipo: 'supuesto', fuente: 'mercado', fecha: '2026-11-01' } as Entrada['referencia'], marca: 0.2,
  produccion: { monto: 100, origen: 'plan' },
}
const tablero = (e: Entrada = ENTRADA): Bloque => { const r = calcular(e); if (!r.ok) throw new Error(r.errores.join()); return r }
const valor = (b: Bloque, k: string) => b.cifras[k].valor as number
const B = tablero()
const total = valor(B, 'total_mes')
const cambio = (clave: string, firmado: number, propuesto = valor(B, clave)) => ({ clave, propuesto, firmado })

describe('cambiar la meta', () => {
  const r = recalcularConCambios(ENTRADA, B, [cambio('meta_por_semana', 14)])
  it('🔴 recalcula lo que depende', () => {
    if (!r.ok) throw new Error(r.detalle)
    expect(r.meta_por_semana).toBe(14); expect(valor(r.bloque, 'meta_por_semana')).toBe(14)
    expect(r.total_mes).toBeGreaterThan(total); expect(valor(r.bloque, 'pauta_diaria')).toBeGreaterThan(valor(B, 'pauta_diaria'))
  })
  it('🔴 da lo mismo que calcular esa meta desde cero: nada se edita a mano', () => {
    if (!r.ok) throw new Error(r.detalle)
    const directo = tablero({ ...ENTRADA, meta_por_semana: 14 })
    for (const k of Object.keys(directo.cifras)) expect(r.bloque.cifras[k].valor).toBe(directo.cifras[k].valor)
  })
  it('🔴 la cifra dice que la cambió el dueño; las demás no', () => {
    if (!r.ok) throw new Error(r.detalle)
    expect(r.bloque.cifras.meta_por_semana).toMatchObject({ fuente: FUENTE_DEL_DUENO, tipo: 'dato' })
    expect(r.bloque.cifras.total_mes.fuente).not.toBe(FUENTE_DEL_DUENO)
  })
  it('🔴 la huella y los números son los del bloque nuevo', () => {
    if (!r.ok) throw new Error(r.detalle)
    expect(r.huella).toBe(huellaDe(r.bloque)); expect(r.huella).not.toBe(huellaDe(B)); expect(r.numeros).toEqual(numerosDelBloque(r.bloque))
    expect(r.numeros.find((n) => n.clave === 'meta_por_semana')?.fuente).toBe(FUENTE_DEL_DUENO)
  })
  it('🔴 la entrada nueva lleva la meta, sin tocar la que recibió', () => {
    if (!r.ok) throw new Error(r.detalle)
    expect(r.entrada.meta_por_semana).toBe(14); expect(ENTRADA.meta_por_semana).toBe(10)
    expect(r.cambios).toEqual([cambio('meta_por_semana', 14)])
  })
})

describe('cambiar el presupuesto', () => {
  it('🔴 da exactamente lo que firmó y busca la meta que ese dinero paga', () => {
    const r = recalcularConCambios(ENTRADA, B, [cambio('total_mes', Math.round(total * 0.6))])
    if (!r.ok) throw new Error(r.detalle)
    expect(r.total_mes).toBe(Math.round(total * 0.6)); expect(r.meta_por_semana).toBeLessThan(10); expect(r.meta_por_semana).toBeGreaterThan(0)
    expect(valor(r.bloque, 'pauta_diaria')).toBeLessThan(valor(B, 'pauta_diaria'))
  })
  it('🔴 con más dinero la meta sube', () => {
    const r = recalcularConCambios(ENTRADA, B, [cambio('total_mes', Math.round(total * 5))])
    if (!r.ok) throw new Error(r.detalle)
    expect(r.total_mes).toBe(Math.round(total * 5)); expect(r.meta_por_semana).toBeGreaterThan(10)
  })
  it('🔴 también por encima de varias veces la meta original: la búsqueda se amplía', () => {
    const r = recalcularConCambios(ENTRADA, B, [cambio('total_mes', Math.round(total * 100))])
    if (!r.ok) throw new Error(r.detalle)
    expect(r.total_mes).toBe(Math.round(total * 100))
  })
  it('🔴 la meta deja de ser un dato: es un supuesto, y lo dice', () => {
    const r = recalcularConCambios(ENTRADA, B, [cambio('total_mes', Math.round(total * 0.6))])
    if (!r.ok) throw new Error(r.detalle)
    expect(r.bloque.cifras.meta_por_semana).toMatchObject({ tipo: 'supuesto', fuente: FUENTE_DESPEJADA }); expect(r.bloque.cifras.total_mes.fuente).toBe(FUENTE_DEL_DUENO)
    expect(r.bloque.confianza).toEqual(expect.anything()); expect(r.bloque.confianza).not.toEqual(B.confianza)
  })
  it('🔴 con poco dinero la producción se recorta: sigue cuadrando y avisa', () => {
    const r = recalcularConCambios(ENTRADA, B, [cambio('total_mes', 50)])
    if (!r.ok) throw new Error(r.detalle)
    expect(r.total_mes).toBe(50); expect(r.bloque.alertas.length).toBeGreaterThan(0)
  })
  it('🔴 a una cifra que el reparto no alcanza no la redondea a otra: lo dice', () => {
    const conPiso: Entrada = { ...ENTRADA, canales: [{ canal: 'TikTok', peso: 0.3, piso_diario: 5 }] }
    const b = tablero(conPiso), t = valor(b, 'total_mes')
    // el canal entra con su mínimo: hay un salto en el presupuesto al subir la meta
    const pruebas = Array.from({ length: 400 }, (_, i) => Math.round(t * (0.05 + i * 0.005)))
    const rechazos = pruebas.map((p) => recalcularConCambios(conPiso, b, [{ clave: 'total_mes', propuesto: t, firmado: p }])).filter((x) => !x.ok)
    expect(rechazos.length).toBeGreaterThan(0)
    expect(rechazos[0]).toMatchObject({ error: 'presupuesto_no_cuadra', alcanzable: expect.any(Number) })
  })
  it('🔴 con línea base: la meta nunca baja de lo que el negocio ya vende si hay dinero que la pague', () => {
    const conBase: Entrada = { ...ENTRADA, base_por_semana: 4 }, b = tablero(conBase), t = valor(b, 'total_mes')
    const r = recalcularConCambios(conBase, b, [{ clave: 'total_mes', propuesto: t, firmado: Math.round(t * 0.5) }])
    if (!r.ok) throw new Error(r.detalle)
    expect(r.meta_por_semana).toBeGreaterThan(4); expect(r.total_mes).toBe(Math.round(t * 0.5))
  })
})

describe('lo que no se acepta', () => {
  const error = (e: Entrada, b: Bloque, c: Parameters<typeof recalcularConCambios>[2]) => { const r = recalcularConCambios(e, b, c); return r.ok ? 'ok' : r.error }
  it('🔴 una cifra que sale del cálculo no se cambia', () => { expect(error(ENTRADA, B, [cambio('costo_por_venta', 1)])).toBe('cifra_no_editable'); expect(CIFRAS_EDITABLES).toEqual(['meta_por_semana', 'total_mes']); expect(esEditable('pauta_diaria')).toBe(false) })
  it('🔴 cero, negativo o texto no valen', () => {
    for (const v of [0, -5, NaN, Infinity]) expect(error(ENTRADA, B, [cambio('total_mes', v)])).toBe('valor_invalido')
    expect(error(ENTRADA, B, [{ clave: 'total_mes', propuesto: total, firmado: '5' as unknown as number }])).toBe('valor_invalido')
    expect(error(ENTRADA, B, [{ clave: 'total_mes', propuesto: 'x' as unknown as number, firmado: 5 }])).toBe('valor_invalido')
  })
  it('🔴 si la cifra ya no vale lo que vio, no firma otra cosa', () => { expect(error(ENTRADA, B, [cambio('total_mes', 200, total + 1)])).toBe('cifras_cambiaron') })
  it('🔴 sin cambios reales, no hay nada que recalcular', () => {
    expect(error(ENTRADA, B, [])).toBe('sin_cambios'); expect(error(ENTRADA, B, [cambio('total_mes', total)])).toBe('sin_cambios'); expect(error(ENTRADA, B, [cambio('total_mes', total + 0.001)])).toBe('sin_cambios')
  })
  it('🔴 meta y presupuesto a la vez no tienen una sola respuesta', () => { expect(error(ENTRADA, B, [cambio('total_mes', 500), cambio('meta_por_semana', 5)])).toBe('una_cifra_a_la_vez') })
  it('🔴 la misma cifra dos veces tampoco', () => { expect(error(ENTRADA, B, [cambio('total_mes', 500), cambio('total_mes', 600)])).toBe('una_cifra_a_la_vez') })
  it('🔴 una cifra igual y otra cambiada sí vale: la igual no cuenta', () => {
    const r = recalcularConCambios(ENTRADA, B, [cambio('total_mes', total), cambio('meta_por_semana', 12)])
    expect(r.ok && r.cambios.map((c) => c.clave)).toEqual(['meta_por_semana'])
  })
  it('🔴 si la entrada guardada no da el tablero, no recalcula: cambiaría cifras que nadie tocó', () => {
    const otra = { ...ENTRADA, marca: 0.4 }
    expect(entradaReproduceElTablero(otra, B)).toBe(false); expect(error(otra, B, [cambio('total_mes', 500)])).toBe('no_se_puede_recalcular')
  })
  it('🔴 una entrada que ya no calcula, tampoco', () => { expect(entradaReproduceElTablero({ ...ENTRADA, referencia: null }, B)).toBe(false) })
  it('🔴 la entrada íntegra sí reproduce su tablero', () => { expect(entradaReproduceElTablero(ENTRADA, B)).toBe(true) })
})
