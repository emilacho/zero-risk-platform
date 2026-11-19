/**
 * 19-nov · ADENDA 1 · P1c · el molde común en las tareas de la cadena (CC5 · GO Lenovo 05:17Z · firma de Emilio, Lenovo 15:32Z):
 * estrategia, fichas, calendario y fechas: los documentos ARRIBA (el plan y el manual en <documento fuente>), la instrucción después,
 * el alcance y lo que se conserva antes del cierre, y el cierre con el objetivo. Más un recorte que se quita (P2): las piezas de tandas anteriores, todas.
 * Sin red, sin modelo, US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { clienteA, contextoDe } from '../__fixtures__/clientes'
import { MOLDE_DE_LA_CADENA, documentoDeLaCadena, tareaDeCalendario, tareaDeEstrategia, tareaDeFechas, tareaDeFichas } from '../indicaciones'
import type { Fila } from '../tipos'

const A = clienteA()
const ctx = { ...contextoDe(A), planTexto: 'EL-PLAN-ENTERO', manualTexto: 'EL-MANUAL-ENTERO' }
const TAREAS: Array<[string, string, string]> = [
  ['estrategia', tareaDeEstrategia({ ctx, formatosPermitidos: { instagram: ['post'] }, version: 1 }), 'la estrategia de redes que el PLAN pide'],
  ['fichas', tareaDeFichas({ ctx, version: 1, hoy: '2026-11-19', hechosDelCerebro: [] }), 'una ficha de HECHOS por oferta'],
  ['calendario', tareaDeCalendario({ ctx, estrategia: A.estrategia, tanda: 1, semanas: [1, 2], filasPrevias: [] } as never), 'las piezas de esta tanda'],
]

describe('ADENDA 1 · P1c · el molde en la cadena', () => {
  it.each(TAREAS)('🔴 %s: el plan va en su <documento fuente> y ARRIBA de «# Qué te pido»', (_, t) => {
    expect(t).toContain(documentoDeLaCadena('el plan', 'EL-PLAN-ENTERO'))
    expect(t.indexOf('<documento fuente="el plan">')).toBeLessThan(t.indexOf('# Qué te pido'))
    expect(t.indexOf('# REFERENCIAS')).toBeLessThan(t.indexOf('# Qué te pido'))
  })
  it.each(TAREAS.filter(([n]) => n !== 'calendario'))('🔴 %s: el manual también, en su <documento fuente>, arriba', (_, t) => {
    expect(t).toContain(documentoDeLaCadena('el manual de marca', 'EL-MANUAL-ENTERO'))
    expect(t.indexOf('<documento fuente="el manual de marca">')).toBeLessThan(t.indexOf('# Qué te pido'))
  })
  it.each(TAREAS)('🔴 %s: el alcance y lo que se conserva van DESPUÉS de la instrucción, y el pedido cierra con el objetivo', (_, t, objetivo) => {
    expect(t.indexOf(MOLDE_DE_LA_CADENA)).toBeGreaterThan(t.indexOf('# Reglas'))
    expect(t.trimEnd().endsWith(`El objetivo: ${objetivo}`) || t.trimEnd().includes(`# Lo que importa\nEl objetivo: ${objetivo}`)).toBe(true)
    expect(t.lastIndexOf('# Lo que importa')).toBeGreaterThan(t.indexOf(MOLDE_DE_LA_CADENA))
  })
  it('el alcance nombra zona, canal, público y oferta, y lo que se conserva nombra los datos vitales y los pendientes', () => {
    for (const k of ['zona', 'canal', 'público', 'oferta', 'cifras', 'precios', 'horarios', 'direcciones', 'sedes', 'nombres propios', 'lo prohibido del manual', 'pendiente']) expect(MOLDE_DE_LA_CADENA, k).toContain(k)
  })
  it('🔴 con corrección, la corrección queda al final, antes del cierre (no arriba de los documentos)', () => {
    const t = tareaDeEstrategia({ ctx, formatosPermitidos: { instagram: ['post'] }, version: 2, correccion: [{ donde: 'pilares', que: 'no suman 100', propuesta: 'ajustar' } as never] })
    expect(t.indexOf('# CORRECCIÓN')).toBeGreaterThan(t.indexOf('# Qué te pido'))
    expect(t.indexOf('# CORRECCIÓN')).toBeLessThan(t.lastIndexOf('# Lo que importa'))
  })
  it('🔴 las fechas: las páginas arriba, la instrucción después', () => {
    const t = tareaDeFechas({ tipo: 'feriados', ambito: 'nacional', anio: 2026, paginas: [{ url: 'https://ejemplo.test', texto: 'TEXTO-DE-LA-PAGINA' }] })
    expect(t.indexOf('TEXTO-DE-LA-PAGINA')).toBeLessThan(t.indexOf('# Qué te pido'))
    expect(t).toContain('# Lo que importa\nEl objetivo: las fechas que las páginas dicen explícitamente')
  })
})

describe('ADENDA 1 · P2 · el calendario ve TODAS las piezas de tandas anteriores (antes las últimas 24)', () => {
  it('🔴 40 piezas previas: llegan las 40', () => {
    const filasPrevias = Array.from({ length: 40 }, (_, i) => ({ id: `s1-d1-p${i + 1}`, tema: `TEMA-${i + 1}.` }) as unknown as Fila)
    const t = tareaDeCalendario({ ctx, estrategia: A.estrategia, tanda: 2, semanas: [5], filasPrevias } as never)
    for (let i = 1; i <= 40; i++) expect(t, `pieza ${i}`).toContain(`- s1-d1-p${i}: TEMA-${i}.`)
  })
})
