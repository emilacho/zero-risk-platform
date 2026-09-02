/**
 * La advertencia del empleado sale de la prosa y pasa a ser un dato.
 *
 * ── EL ROJO ───────────────────────────────────────────────────────────────
 * Contra el estado de HOY estas afirmaciones tienen que FALLAR:
 *   1. «la columna `voice_description` NO contiene la advertencia interna»
 *      → hoy: `bb.voice_description ?? null` guarda el texto tal cual, con
 *        "ADVERTENCIA DE CONFIANZA BAJA: ... (apify_sources vacío)" adentro.
 *   2. «la advertencia se conserva como dato en `_caveats`»
 *      → hoy: `_caveats` no existe.
 *
 * ── EL CONTROL POSITIVO ───────────────────────────────────────────────────
 * «un manual SIN advertencia sale exactamente igual que hoy» tiene que dar
 * VERDE hoy y después. Si diera rojo hoy, el instrumento está roto.
 *
 * ── EL CASO REAL ──────────────────────────────────────────────────────────
 * Manual `5648b126` · GoEuropeAdventure · 2026-09-01 20:29 UTC. El texto del
 * caso 3 es la copia LITERAL de lo que emitió el editor-en-jefe en exec 118856.
 */
import { describe, it, expect } from 'vitest'
import { buildBrandBookRow } from '../src/app/api/brand-book/[clientId]/route'
import {
  detectInternalTerms,
  extractTrailingCaveat,
  sanitizeProseFields,
} from '../src/lib/brand-book-caveat-extractor'

const CLIENT = '534362db-29d9-4c7d-9b88-95d1ba89fb7b'

// Copia LITERAL de la corrida real · exec 118856 · Lente · editor-en-jefe.
const VOZ_REAL =
  'Voz accesible y directa, sin formalismo institucional. Tono cálido pero ' +
  'profesional, orientado a reducir la fricción en la decisión de compra. ' +
  'Prioriza claridad sobre persuasión: precios explícitos, proceso de reserva ' +
  'sin intermediarios, lenguaje inclusivo que no exige experiencia previa. No ' +
  'compite en credencial histórica (no tiene "desde 1888") — compite en ' +
  'conveniencia y transparencia. ADVERTENCIA DE CONFIANZA BAJA: esta ' +
  'descripción es inferida exclusivamente desde el positioning estratégico y ' +
  'los datos del ICP; no existen muestras directas de copy del cliente en la ' +
  'evidencia (apify_sources vacío).'

describe('extractor · función pura', () => {
  it('corta la advertencia final y la devuelve entera', () => {
    const r = extractTrailingCaveat(VOZ_REAL)
    expect(r.clean.endsWith('conveniencia y transparencia.')).toBe(true)
    expect(r.clean).not.toMatch(/ADVERTENCIA/)
    expect(r.clean).not.toMatch(/apify_sources/)
    expect(r.caveat).toMatch(/^ADVERTENCIA DE CONFIANZA BAJA:/)
    expect(r.caveat).toMatch(/apify_sources vacío/)
  })

  it('un texto SIN marcador no se toca ni un carácter', () => {
    const t = 'Voz cálida y directa. Precios explícitos y reserva sin intermediarios.'
    const r = extractTrailingCaveat(t)
    expect(r.clean).toBe(t)
    expect(r.caveat).toBeNull()
  })

  it('si el campo ERA la advertencia, no se vacía · se deja y se declara', () => {
    const t = 'ADVERTENCIA DE CONFIANZA BAJA: no hay evidencia suficiente.'
    const r = extractTrailingCaveat(t)
    expect(r.clean).toBe(t)
    expect(r.caveat).toBe(t)
  })

  it('detecta identificadores internos sin modificar el texto', () => {
    expect(detectInternalTerms('no existen muestras (apify_sources vacío)')).toEqual([
      'apify_sources',
    ])
    expect(detectInternalTerms('Voz cálida y directa.')).toEqual([])
  })

  it('sanitizeProseFields sólo devuelve lo que cambió', () => {
    const limpio = sanitizeProseFields({
      voice_description: 'Voz cálida.',
      positioning: 'Único operador multi-actividad en Zermatt.',
    })
    expect(limpio.cleaned).toEqual({})
    expect(limpio.caveats).toEqual({})
    expect(limpio.leaked).toEqual({})
  })
})

describe('buildBrandBookRow · la columna sale limpia', () => {
  it('🔴 ROJO 1 · la columna voice_description NO lleva la advertencia', () => {
    const row = buildBrandBookRow(CLIENT, { voice_description: VOZ_REAL }, {})
    expect(String(row.voice_description)).not.toMatch(/ADVERTENCIA DE CONFIANZA BAJA/)
    expect(String(row.voice_description)).not.toMatch(/apify_sources/)
    expect(String(row.voice_description)).toMatch(/conveniencia y transparencia\.$/)
  })

  it('🔴 ROJO 2 · la advertencia se conserva como dato en _caveats', () => {
    const row = buildBrandBookRow(CLIENT, { voice_description: VOZ_REAL }, {})
    const ct = JSON.parse(String(row.content_text))
    expect(ct._caveats).toBeDefined()
    expect(ct._caveats.voice_description).toMatch(/^ADVERTENCIA DE CONFIANZA BAJA:/)
    expect(ct._caveats.voice_description).toMatch(/apify_sources vacío/)
  })

  // No es un rojo: hoy ya se guarda verbatim. Es la GUARDIA de que el arreglo no
  // pierda nada al limpiar la columna · tiene que seguir verde después.
  it('🟢 GUARDIA · el borrador crudo se preserva VERBATIM · no se pierde nada', () => {
    const row = buildBrandBookRow(CLIENT, { voice_description: VOZ_REAL }, {})
    const ct = JSON.parse(String(row.content_text))
    // El registro forense conserva el texto entero, advertencia incluida.
    expect(ct.brand_book_draft.voice_description).toBe(VOZ_REAL)
  })

  // 🟢 CONTROL POSITIVO · verde HOY y después. Un manual sin advertencias no
  // cambia en nada. Si esto fuera rojo hoy, los rojos de arriba no valdrían.
  it('🟢 CONTROL POSITIVO · un manual sin advertencia sale igual que hoy', () => {
    const bb = {
      voice_description: 'Voz cálida y directa. Precios explícitos.',
      positioning: 'Único operador multi-actividad en Zermatt.',
      forbidden_words: ['barato'],
      required_terminology: ['Zermatt'],
    }
    const row = buildBrandBookRow(CLIENT, bb, {})
    expect(row.voice_description).toBe(bb.voice_description)
    expect(row.positioning).toBe(bb.positioning)
    expect(row.forbidden_words).toEqual(['barato'])
    const ct = JSON.parse(String(row.content_text))
    expect(ct._caveats).toBeUndefined()
    expect(ct._leaked_internal_terms).toBeUndefined()
    expect(ct.brand_book_draft).toEqual(bb)
  })

  it('🟢 CONTROL POSITIVO 2 · el resto de la fila no se toca', () => {
    const row = buildBrandBookRow(
      CLIENT,
      { voice_description: VOZ_REAL, forbidden_words: ['barato'] },
      { fidelity_passed: true, gate_outcome: 'paso_la_vara', source: 'onboarding_collaborative_build' },
    )
    expect(row.client_id).toBe(CLIENT)
    expect(row.forbidden_words).toEqual(['barato'])
    expect(row.gate_outcome).toBe('paso_la_vara')
    expect(row.auto_generated).toBe(true)
    expect(row.human_validated).toBe(false)
    expect(row.version).toBe(1)
    const ct = JSON.parse(String(row.content_text))
    expect(ct.fidelity_passed).toBe(true)
  })

  it('un identificador interno que sobreviva queda DECLARADO, no borrado', () => {
    const bb = {
      // sin marcador de advertencia · el texto no se corta, pero el término se declara
      voice_description: 'Voz cálida. No hay muestras porque apify_sources vino vacío.',
    }
    const row = buildBrandBookRow(CLIENT, bb, {})
    expect(row.voice_description).toBe(bb.voice_description)
    const ct = JSON.parse(String(row.content_text))
    expect(ct._leaked_internal_terms.voice_description).toEqual(['apify_sources'])
  })
})
