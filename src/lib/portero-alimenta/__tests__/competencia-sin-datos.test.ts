/**
 * UNA EVALUACIÓN HECHA SIN DATOS NO BLOQUEA 30 DÍAS (16-oct) · la de las 00:14 (todo «en duda» por falta de la corrida de posición) dejó la sede «al día» y la primera evaluación CON datos no ocurrió.
 * Regla: si TODOS los veredictos vigentes de la sede son «duda» y llegó material nuevo de esa sede (una corrida `demanda:<sede>` posterior), se evalúa de nuevo; con algún veredicto firme, manda el plazo de 30 días.
 */
import { describe, expect, it } from 'vitest'
import { debeEvaluarse, descubrirYJuzgar, evaluacionSinDatos, type ContextoDeBrazos } from '../brazos/sistematica'
import type { SedeConPunto } from '../brazos/sedes'
import { DIEZ_CLIENTES } from './diez-clientes.fixtures'

const AHORA = new Date('2026-10-17T12:30:00Z')
const evalDe = (sede: string, veredicto: string, cuando = '2026-10-16T00:14:00Z', clase = 'competidor_evaluacion') => ({ clase, atributo: `competidor:x:${clase}:${sede}`, ref: 'brazo:x', observado_en: cuando, provenance_tag: { datos: { slug: 'x', sede, nombre: 'X', veredicto } } })
const demanda = (sede: string, cuando: string, ensayo = false) => ({ apify_function: 'google_maps_scraper', ensayo, created_at: cuando, params: { _brazo: `demanda:${sede}` }, respuesta: [] })

describe('evaluación sin datos', () => {
  it('todo «duda» + posición posterior ⇒ se evalúa; sin posición posterior, o con un ensayo, no', () => {
    const v = [evalDe('olon', 'duda'), evalDe('olon', 'duda')]
    expect(debeEvaluarse(v, 'olon', AHORA)).toBe(false) // sin material nuevo: manda el plazo
    expect(debeEvaluarse(v, 'olon', AHORA, false, [demanda('olon', '2026-10-16T16:05:00Z')])).toBe(true)
    expect(debeEvaluarse(v, 'olon', AHORA, false, [demanda('olon', '2026-10-16T16:05:00Z', true)])).toBe(false) // un ensayo nunca cuenta
    expect(debeEvaluarse(v, 'olon', AHORA, false, [demanda('olon', '2026-10-15T10:00:00Z')])).toBe(false) // anterior a la evaluación
    expect(debeEvaluarse(v, 'olon', AHORA, false, [demanda('guayaquil', '2026-10-16T16:05:00Z')])).toBe(false) // posición de OTRA sede
  })
  it('con un veredicto firme (competidor o no) manda el plazo de 30 días aunque llegue material nuevo', () => {
    for (const firme of ['competidor', 'no']) {
      const v = [evalDe('olon', 'duda'), evalDe('olon', firme)]
      expect(evaluacionSinDatos(v, 'olon', [demanda('olon', '2026-10-16T16:05:00Z')])).toBe(false)
      expect(debeEvaluarse(v, 'olon', AHORA, false, [demanda('olon', '2026-10-16T16:05:00Z')])).toBe(false)
    }
  })
  it('el vigilado cuenta como firme; sin evaluaciones no hay nada que reevaluar por esta regla', () => {
    expect(evaluacionSinDatos([evalDe('olon', 'competidor', undefined, 'competidor_vigilado')], 'olon', [demanda('olon', '2026-10-16T16:05:00Z')])).toBe(false)
    expect(evaluacionSinDatos([], 'olon', [demanda('olon', '2026-10-16T16:05:00Z')])).toBe(false)
  })
  it('a los 30 días y forzar siguen evaluando', () => {
    expect(debeEvaluarse([evalDe('olon', 'competidor')], 'olon', new Date('2026-11-20T00:00:00Z'))).toBe(true)
    expect(debeEvaluarse([evalDe('olon', 'competidor')], 'olon', AHORA, true)).toBe(true)
  })
})

describe('descubrirYJuzgar tras una evaluación sin datos (los diez clientes: cada uno con su sede)', () => {
  for (const c of DIEZ_CLIENTES.filter((x) => x.compitePorCercania && x.sedes.length)) {
    it(`${c.nombre}: la sede con evaluación «duda» y posición nueva se evalúa con el agente`, async () => {
      const clave = c.sedes[0].clave
      const sede: SedeConPunto = { clave, ciudad: c.sedes[0].ciudad, lat: -0.18, lng: -78.48, origen_del_punto: 'config', tipo: 'local', direccion: c.sedes[0].direccion }
      const lugar = { title: 'Competidor Cercano', categoryName: c.rubro, totalScore: 4.4, reviewsCount: 60, location: { lat: -0.181, lng: -78.481 }, placeId: 'p1', address: 'cerca' }
      const ctx: ContextoDeBrazos = { sedes: [sede], filas: [{ id: 'd1', apify_function: 'google_maps_scraper', ensayo: false, created_at: '2026-10-16T16:05:00Z', params: { _brazo: `demanda:${clave}` }, respuesta: [lugar] }] as never, vigentes: [evalDe(clave, 'duda')] as never, delSistema: [], ubicadasRecientemente: new Set(), errores: [] }
      let llamadas = 0
      const r = await descubrirYJuzgar({
        ctx, client_id: c.id, nombreDelCliente: c.nombre, rubro: c.rubro, config: {}, ahora: AHORA, presupuestoUsd: 0.16,
        llamarModelo: async (_i, m) => { llamadas++; const n = (m.match(/^\d+\. «/gm) ?? []).length; return { texto: JSON.stringify({ decisiones: Array.from({ length: n }, (_x, k) => ({ n: k + 1, veredicto: 'competidor', cita: lugar.categoryName, razon: 'mismo rubro y a 150 m' })) }), costo_usd: 0.01, tokens_entrada: 1, tokens_salida: 1 } },
      })
      expect(r.por_sede[clave].estado).not.toBe('al_dia') // se miró de nuevo (si hay candidatos del rubro, el agente los juzga; si no, queda dicho)
      void llamadas
    })
  }
})

describe('el caso real: restaurante con evaluación «duda» de las 00:14 y posición de las 16:05', () => {
  it('el agente juzga a los candidatos de la sede (antes quedaba «al día» 30 días sin juzgar a nadie)', async () => {
    const sede: SedeConPunto = { clave: 'olon', ciudad: 'Olón', lat: -1.7974316, lng: -80.7595412, origen_del_punto: 'ficha_de_mapas', tipo: 'local', direccion: '663R+25G, Olon' }
    const lugar = (title: string) => ({ title, categoryName: 'Marisquería', totalScore: 4.5, reviewsCount: 40, location: { lat: -1.7874, lng: -80.7495 }, placeId: title, address: 'Olón' })
    const ctx: ContextoDeBrazos = { sedes: [sede], filas: [{ id: 'd1', apify_function: 'google_maps_scraper', ensayo: false, created_at: '2026-10-16T16:05:00Z', params: { _brazo: 'demanda:olon' }, respuesta: [lugar('Don Villón'), lugar('Marisquería Sol')] }] as never, vigentes: [evalDe('olon', 'duda')] as never, delSistema: [], ubicadasRecientemente: new Set(), errores: [] }
    let llamadas = 0
    const r = await descubrirYJuzgar({
      ctx, client_id: '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312', nombreDelCliente: 'Náufrago', rubro: 'restaurante de mariscos', config: {}, ahora: AHORA, presupuestoUsd: 0.16,
      llamarModelo: async (_i, m) => { llamadas++; const n = (m.match(/^\d+\. «/gm) ?? []).length; return { texto: JSON.stringify({ decisiones: Array.from({ length: n }, (_x, k) => ({ n: k + 1, veredicto: 'competidor', cita: 'categoría Marisquería', razon: 'mismo rubro y a 1 km' })) }), costo_usd: 0.01, tokens_entrada: 1, tokens_salida: 1 } },
    })
    expect(llamadas).toBe(1)
    expect(r.por_sede.olon).toMatchObject({ estado: 'evaluada', competidores: 2 })
  })
})
