/**
 * 26-nov · GO Lenovo 12:18Z · el reel del cliente piloto (encargo 2a4bf4b5) cerró por tope sin llegar a propuestas: los dos `integrar` de `creative-director-mesa`
 * duraron 1 036 s y 842 s, la vuelta por Vercel murió a los 800 s y el vigía relanzó el turno (US$ 1,15 de más). Arreglo:
 *  (A) `creative-director-mesa` entrega su vuelta por el corredor (`AGENTES_CON_VUELTA_POR_EL_CORREDOR`);
 *  (B) la dirección de las mesas de pieza reserva US$ 1,80 por turno, con su plazo (40 min) y la espera del flujo (2 700 s).
 */
import { describe, expect, it } from 'vitest'
import { AGENTES_CON_VUELTA_POR_EL_CORREDOR, vueltaPorElCorredorElegible } from '@/app/api/agents/run-sdk/route'
import { requiresEditorReview } from '@/lib/editor-routing'
import {
  COTAS,
  ESPERA_DEL_FLUJO_POR_OMISION_S,
  PLAZO_DEL_TURNO_DE_LA_DIRECCION_DE_PIEZA_MIN,
  PLAZO_DEL_TURNO_DE_LA_GRAN_IDEA_MIN,
  RESERVA_POR_TURNO_DE_LA_DIRECCION_DE_PIEZA_USD,
  RESERVA_POR_TURNO_DE_LA_GRAN_IDEA_USD,
  esperaDelTurnoS,
  pisoDelTurnoMin,
  plazoPropioDelTurnoMin,
  reservaPorTurnoDe,
} from '../mesa/tipos'

const DIR = 'creative-director-mesa'
const PIEZAS = ['carrusel', 'kit', 'video', 'post'] as const
const DE_LA_CADENA = ['brief', 'reubicacion', 'fallidos', 'banco'] as const

describe('(A) la vuelta de la dirección de pieza va por el corredor', () => {
  it('está en la lista y es elegible con la palanca; sin palanca, no', () => {
    expect(AGENTES_CON_VUELTA_POR_EL_CORREDOR).toContain(DIR)
    expect(vueltaPorElCorredorElegible({ agent: DIR, callback_mode: 'runner' } as never)).toEqual({ elegible: true, motivo: 'ok' })
    expect(vueltaPorElCorredorElegible({ agent: DIR } as never).elegible).toBe(false)
  })
  it('no pasa por la revisión editorial (aunque `creative-director` sí): por eso no necesita la cabecera de saltar el editor', () => {
    expect(requiresEditorReview(DIR)).toBe(false)
    expect(requiresEditorReview('creative-director')).toBe(true)
  })
  it('`video-editor` queda fuera: pasa por revisión editorial y no tiene el riesgo medido', () => {
    expect(AGENTES_CON_VUELTA_POR_EL_CORREDOR).not.toContain('video-editor')
    expect(vueltaPorElCorredorElegible({ agent: 'video-editor', callback_mode: 'runner' } as never).elegible).toBe(false)
  })
})

describe('(B) la reserva y el plazo de la dirección de las mesas de pieza', () => {
  it('US$ 1,80 para la dirección de cada mesa de pieza; los demás asientos, 0,60', () => {
    expect(RESERVA_POR_TURNO_DE_LA_DIRECCION_DE_PIEZA_USD).toBe(1.8)
    for (const t of PIEZAS) {
      expect(reservaPorTurnoDe(t, DIR, DIR), t).toBe(1.8)
      expect(reservaPorTurnoDe(t, 'content-creator', DIR), t).toBe(COTAS.RESERVA_POR_TURNO_USD)
    }
  })
  it('las mesas de la cadena siguen con 0,60 aunque sea su dirección; la gran idea sigue con 10', () => {
    for (const t of DE_LA_CADENA) expect(reservaPorTurnoDe(t, 'campaign-brief-agent', 'campaign-brief-agent'), t).toBe(COTAS.RESERVA_POR_TURNO_USD)
    expect(reservaPorTurnoDe('concepto', 'director-gran-idea', 'director-gran-idea')).toBe(RESERVA_POR_TURNO_DE_LA_GRAN_IDEA_USD)
    expect(reservaPorTurnoDe('concepto', 'content-creator', 'director-gran-idea')).toBe(COTAS.RESERVA_POR_TURNO_USD)
  })
  it('sin dirección o sin tipo: 0,60 (nada se adivina)', () => {
    expect(reservaPorTurnoDe('video', DIR, null)).toBe(COTAS.RESERVA_POR_TURNO_USD)
    expect(reservaPorTurnoDe('video', DIR, undefined)).toBe(COTAS.RESERVA_POR_TURNO_USD)
    expect(reservaPorTurnoDe(undefined, DIR, DIR)).toBe(COTAS.RESERVA_POR_TURNO_USD)
  })
  it('el plazo sale de lo medido: 1,80 / 0,069 × 1,5 = 39,1 → 40 min, y cubre el `integrar` más largo medido (1 036 s) con margen', () => {
    expect(PLAZO_DEL_TURNO_DE_LA_DIRECCION_DE_PIEZA_MIN).toBe(40)
    expect(PLAZO_DEL_TURNO_DE_LA_DIRECCION_DE_PIEZA_MIN * 60).toBeGreaterThan(1036 * 1.5)
    expect(plazoPropioDelTurnoMin('video', DIR, DIR)).toBe(40)
    expect(plazoPropioDelTurnoMin('video', 'content-creator', DIR)).toBeNull()
    expect(plazoPropioDelTurnoMin('concepto', 'director-gran-idea', 'director-gran-idea')).toBe(PLAZO_DEL_TURNO_DE_LA_GRAN_IDEA_MIN)
  })
  it('el piso del vigía: 40 min para la dirección de pieza (nunca menos que el de hoy); el de hoy para los demás', () => {
    expect(pisoDelTurnoMin('video', DIR, DIR, 12)).toBe(40)
    expect(pisoDelTurnoMin('video', DIR, DIR, 60)).toBe(60)
    expect(pisoDelTurnoMin('video', 'video-editor', DIR, 12)).toBe(12)
    expect(pisoDelTurnoMin('video', null, DIR, 12)).toBe(12)
  })
  it('la espera del flujo: (40 + 5) × 60 = 2 700 s para la dirección de pieza; nada para los demás (el flujo usa sus 1 800)', () => {
    expect(esperaDelTurnoS('video', DIR, DIR)).toBe(2700)
    expect(esperaDelTurnoS('post', DIR, DIR)).toBe(2700)
    expect(esperaDelTurnoS('video', 'content-creator', DIR)).toBeNull()
    expect(esperaDelTurnoS('brief', 'campaign-brief-agent', 'campaign-brief-agent')).toBeNull()
    expect(2700).toBeGreaterThan(ESPERA_DEL_FLUJO_POR_OMISION_S)
  })
})
