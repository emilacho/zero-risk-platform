/**
 * 03-nov · decisión de Emilio traída por Lenovo: el texto del manual va limpio y «es una propuesta» se declara aparte, en `_meta.<campo>.fuente`.
 * El bloque del 20-oct queda intacto porque el flujo de esa fecha se reconstruye con él. El flujo nuevo lleva el del 03-nov. Esta prueba ejecuta ese texto.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const D = path.resolve(__dirname, '../scripts/worker-staging/ssLtwYPt7zxuvnM2')
const leerBloque = (f: string) => new Function(fs.readFileSync(path.join(D, f), 'utf8') + '\nreturn { usoDeLoDisponible }')() as { usoDeLoDisponible: (d: unknown, g: unknown) => { ok: boolean; sin_usar: Array<{ campo: string; motivo: string; rotulo?: boolean }> } }
const { usoDeLoDisponible } = leerBloque('bloque-uso-de-lo-disponible-2026-11-03.js')

const SIN_TEXTO_PROPIO = { icp_signals: { segments: ['a', 'b'] }, competitors: [{ name: 'x' }], discovery_summary: 'y'.repeat(120) }
const CON_TEXTO_PROPIO = { ...SIN_TEXTO_PROPIO, materia_cliente: { sitio_estado: 'trajo', sitio_texto: 'z'.repeat(300) } }
const VOZ = 'Cercana, técnica y directa, pensada para empresas medianas.'
const BASE = { positioning: 'p'.repeat(60), icp_summary: 'i'.repeat(60), voice_description: VOZ }

describe('la declaración aparte', () => {
  it.each([
    ['en _meta', { _meta: { voice_description: { fuente: 'propuesta' } } }],
    ['en _field_meta, ya consolidada', { _field_meta: { voice_description: { fuente: 'propuesta inferida de las señales del público' } } }],
    ['con mayúscula', { _meta: { voice_description: { fuente: 'Propuesta' } } }],
  ])('🔴 %s: basta, y el texto va limpio', (_n, decl) => {
    expect(usoDeLoDisponible({ ...BASE, ...decl }, SIN_TEXTO_PROPIO)).toMatchObject({ ok: true, sin_usar: [] })
  })

  it.each([
    ['sin declarar', {}],
    ['otra fuente', { _meta: { voice_description: { fuente: 'sitio del cliente' } } }],
    ['declarada en otro campo', { _meta: { positioning: { fuente: 'propuesta' } } }],
    ['sin fuente', { _meta: { voice_description: {} } }],
    ['con meta nula', { _meta: null }],
    ['con meta de otra forma', { _field_meta: 'propuesta' }],
    ['la palabra en medio', { _meta: { voice_description: { fuente: 'no es propuesta' } } }],
  ])('🔴 %s: sigue faltando, y el motivo pide declararlo, no escribirlo en el texto', (_n, decl) => {
    const r = usoDeLoDisponible({ ...BASE, ...decl }, SIN_TEXTO_PROPIO)
    expect(r.ok).toBe(false)
    expect(r.sin_usar[0]).toMatchObject({ campo: 'voice_description', rotulo: true })
    expect(r.sin_usar[0].motivo).toContain('_meta.voice_description.fuente')
    expect(r.sin_usar[0].motivo).not.toContain('PROPUESTA (no es dato')
  })

  it('🔴 la declaración no tapa una voz vacía', () => {
    expect(usoDeLoDisponible({ ...BASE, voice_description: 'PENDIENTE', _meta: { voice_description: { fuente: 'propuesta' } } }, SIN_TEXTO_PROPIO).ok).toBe(false)
  })

  it('🔴 un manual viejo con el rótulo en el texto no cae', () => {
    expect(usoDeLoDisponible({ ...BASE, voice_description: 'PROPUESTA (no es dato del cliente): ' + VOZ }, SIN_TEXTO_PROPIO).ok).toBe(true)
  })

  it('con texto propio no hace falta declarar nada', () => {
    expect(usoDeLoDisponible(BASE, CON_TEXTO_PROPIO).ok).toBe(true)
  })
})

describe('el bloque nuevo solo cambia eso', () => {
  it('🔴 fuera de la declaración, da lo mismo que el del 20-oct', () => {
    const viejo = leerBloque('bloque-uso-de-lo-disponible-2026-10-20.js').usoDeLoDisponible
    const casos = [
      [BASE, CON_TEXTO_PROPIO], [{ ...BASE, voice_description: 'PENDIENTE' }, SIN_TEXTO_PROPIO], [{ ...BASE, positioning: '' }, CON_TEXTO_PROPIO],
      [{ ...BASE, icp_summary: 'corto' }, SIN_TEXTO_PROPIO], [{ positioning: '', icp_summary: '', voice_description: '' }, {}], [{ ...BASE, voice_description: 'PROPUESTA (no es dato del cliente): ' + VOZ }, SIN_TEXTO_PROPIO],
    ]
    for (const [d, g] of casos) expect(usoDeLoDisponible(d, g)).toEqual(viejo(d, g))
  })
})
