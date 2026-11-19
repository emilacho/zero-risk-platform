/**
 * 19-nov · ADENDA 1 · P2b (CC5): lo que reunió el portero llega a la mesa como un DOCUMENTO propio (`<documento fuente="el portero">`), entero y con su ref,
 * arriba del tablero; en el tablero queda su lugar y su ref, sin repetir el texto. Sin material, la mesa queda como antes. Sin red, US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { armarTarea, seccionDelPortero, tableroEnTexto, TITULO_DEL_PORTERO } from '../mesa/pedidos'
import type { Aporte, EstadoMesa, TipoDePieza } from '../mesa/tipos'

const est = (tipo: TipoDePieza): EstadoMesa => ({ tipo, directorio_congelado: [], direccion: 'creative-director-mesa', turnos: 0, integraciones: 0, devoluciones_por_citas: 0, libro_visto: 0, preguntas_del_traductor: 0, marcas: {}, fase: 'trabajando', cierre_forzado: false } as unknown as EstadoMesa)
const c = (tipo: TipoDePieza) => ({ cliente_nombre: 'Cliente', tipo, brief_id: 'S4-ig-01', brief_texto: '## S4-ig-01\n- OBJETIVO: que reserven', manual_texto: 'EL-MANUAL', plan_texto: 'EL-PLAN', fotos: [], tope_usd: 5, gasto_usd: 0 })
const MATERIAL = 'HECHOS-DEL-PORTERO ' + 'h'.repeat(20_000) + ' FIN-DEL-PORTERO'
const libro = [
  { n: 1, de: 'creative-director-mesa', tipo: 'dirige', texto: 'La idea rectora.' },
  { n: 2, de: 'portero', tipo: 'material', texto: MATERIAL },
  { n: 3, de: 'content-creator', tipo: 'aporta', texto: 'Un aporte.' },
] as unknown as Aporte[]

describe('ADENDA 1 · P2b · el portero es un documento de la mesa', () => {
  it('🔴 el material va entero en <documento fuente="el portero">, con su ref, ARRIBA del tablero', () => {
    const t = armarTarea({ tipo: 'aportar', agente: 'content-creator', tarjeta: undefined, est: est('carrusel'), libro, c: c('carrusel') })
    const doc = t.indexOf('<documento fuente="el portero">')
    expect(doc).toBeGreaterThan(-1)
    expect(t).toContain(`<documento fuente="el portero">\n**A2** · portero\n${MATERIAL}\n</documento>`)
    expect(doc).toBeLessThan(t.indexOf('## Tablero'))
  })
  it('🔴 en el tablero el material NO se repite: queda su lugar y su ref (el texto sale una sola vez)', () => {
    const t = armarTarea({ tipo: 'aportar', agente: 'content-creator', tarjeta: undefined, est: est('carrusel'), libro, c: c('carrusel') })
    expect(t.split('FIN-DEL-PORTERO').length - 1).toBe(1)
    expect(t).toContain(`(lo que trajo el portero: está arriba, entero, en «${TITULO_DEL_PORTERO}»; cítalo como A2)`)
    // los demás aportes siguen enteros en el tablero
    expect(t).toContain('**A3** · content-creator · aporta\nUn aporte.')
  })
  it('los otros usos del tablero (sin la opción) siguen con el material adentro, como antes', () => {
    expect(tableroEnTexto(libro)).toContain(MATERIAL)
  })
  it('sin material del portero, no hay sección', () => {
    expect(seccionDelPortero(libro.filter((a) => a.tipo !== 'material'))).toEqual([])
  })
})
