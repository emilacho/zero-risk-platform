/**
 * ROJO/VERDE · B2 · el contrato común de los brazos (§4.2).
 *
 * 🔴 EL ROJO del encargo, textual: «apagá un brazo ⇒ sin_respuesta y la
 * corrida NO se cae. Vacío legítimo ⇒ sin_dato. Si los dos se ven iguales,
 * el contrato no está.»
 *
 * Contra el estado de hoy esto no puede ni escribirse: NO EXISTE ninguna
 * forma común: cada brazo contesta lo que quiere y un vacío es
 * indistinguible de un fallo. El archivo entero es el rojo.
 */
import { describe, it, expect } from 'vitest'
import {
  campoNoPublicado,
  envolverBrazo,
  resumirRecoleccion,
  sinDato,
  sinRespuesta,
  trajo,
  validarRespuesta,
  type RespuestaBrazo,
} from '@/lib/planeacion/contrato-brazos'
import {
  brazoApify,
  brazoCerebro,
  brazoMetaGastoCompetencia,
  brazoPostHog,
  CAMPOS_META_NO_PUBLICADOS,
} from '@/lib/planeacion/brazos'

const FUENTE = 'apify://actor/xyz'

describe('🟢 ACEPTA SI · todos devuelven la MISMA forma', () => {
  it('los tres brazos comparten las siete claves del §4.2', async () => {
    const rs: RespuestaBrazo[] = [
      await brazoApify({ objetivo: 'competidores', fuente: FUENTE, consultar: async () => [{ a: 1 }] }),
      await brazoPostHog({
        objetivo: 'tráfico', fuente: 'posthog://proj/1',
        clienteConfigurado: true, consultar: async () => ({ visitas: 10 }),
      }),
      await brazoCerebro({
        objetivo: 'conocimiento', fuente: 'cerebro://cliente/x',
        buscar: async () => [{ chunk: 'a' }],
      }),
    ]
    for (const r of rs) {
      expect(Object.keys(r).sort()).toEqual(
        ['brazo', 'datos', 'estado', 'fuente', 'medido_en', 'objetivo'].sort(),
      )
      expect(validarRespuesta(r)).toEqual([])
      expect(r.estado).toBe('trajo')
      expect(r.fuente).not.toBe('') // fuente obligatoria INCLUSO en trajo
      expect(Number.isNaN(Date.parse(r.medido_en))).toBe(false) // ISO-8601
    }
  })
})

describe('🔴 EL ROJO · apagado ≠ vacío · y la corrida NO se cae', () => {
  it('brazo APAGADO → sin_respuesta · no sin_dato', async () => {
    const r = await brazoPostHog({
      objetivo: 'tráfico', fuente: 'posthog://proj/1',
      clienteConfigurado: false, // ← apagado
      consultar: async () => { throw new Error('no debería llamarse') },
    })
    expect(r.estado).toBe('sin_respuesta')
    expect(r.motivo).toMatch(/APAGADO/)
    expect(validarRespuesta(r)).toEqual([])
  })

  // ACTUALIZADA 09-sep por la condición de CC#3 · antes esta prueba pasaba
  // `[]` pelado y esperaba `sin_dato`: encodificaba el defecto — afirmaba una
  // mirada que nadie hizo. Un vacío legítimo exige que el Servicio DECLARE
  // que se miró de verdad.
  it('vacío LEGÍTIMO (el Servicio declara que miró) → sin_dato', async () => {
    const r = await brazoApify({
      objetivo: 'competidores', fuente: FUENTE,
      consultar: async () => ({ clase: 'no_existe', se_miro_de_verdad: true, filas: [] }),
    })
    expect(r.estado).toBe('sin_dato')
    expect(r.motivo).toMatch(/fui, miré y no hay/)
  })

  it('🔴 LOS DOS NO SE VEN IGUALES · es el corazón del encargo', async () => {
    const apagado = await brazoPostHog({
      objetivo: 'tráfico', fuente: 'p://1', clienteConfigurado: false,
      consultar: async () => ({}),
    })
    const vacio = await brazoPostHog({
      objetivo: 'tráfico', fuente: 'p://1', clienteConfigurado: true,
      consultar: async () => ({}),
    })
    expect(apagado.estado).not.toBe(vacio.estado)
    expect(apagado.estado).toBe('sin_respuesta')
    expect(vacio.estado).toBe('sin_dato')
    expect(apagado.motivo).not.toBe(vacio.motivo)
  })

  it('el brazo se ROMPE → sin_respuesta y la corrida NO se cae', async () => {
    const r = await brazoApify({
      objetivo: 'competidores', fuente: FUENTE,
      consultar: async () => { throw new Error('502 del actor') },
    })
    expect(r.estado).toBe('sin_respuesta')
    expect(r.motivo).toMatch(/se rompió.*502/)
    // no se cae: devolvió una respuesta válida en vez de lanzar
    expect(validarRespuesta(r)).toEqual([])
  })

  it('una recolección con un brazo roto sigue entregando las otras', async () => {
    const rs = await Promise.all([
      brazoApify({ objetivo: 'competidores', fuente: FUENTE, consultar: async () => [{ a: 1 }] }),
      brazoApify({ objetivo: 'redes', fuente: FUENTE, consultar: async () => { throw new Error('caído') } }),
      brazoCerebro({ objetivo: 'conocimiento', fuente: 'c://x', buscar: async () => [] }),
    ])
    const resumen = resumirRecoleccion(rs)
    expect(resumen).toMatchObject({ pedidos: 3, trajo: 1, sin_dato: 1, sin_respuesta: 1 })
    expect(resumen.invalidas).toEqual([])
    expect(resumen.huecos[0]?.objetivo).toBe('redes')
    expect(resumen.informacion_de_ausencia[0]?.objetivo).toBe('conocimiento')
  })
})

describe('🔴 EL CASO META · campo presente y vacío NO es sin_dato mudo', () => {
  it('marca sin_dato CON motivo explícito · nunca un cero', () => {
    const r = brazoMetaGastoCompetencia({ fuente: 'meta://ad-library' })
    expect(r.estado).toBe('sin_dato')
    expect(r.motivo).toMatch(/NO PUBLICA/)
    expect(r.motivo).toMatch(/no se puede saber/)
    for (const campo of CAMPOS_META_NO_PUBLICADOS) {
      expect(r.datos[campo]).toBeNull()      // null, explícito
      expect(r.datos[campo]).not.toBe(0)     // 🔴 NUNCA un cero
      expect(r.datos[campo]).not.toBe('')    // 🔴 NUNCA un vacío suelto
    }
    expect(validarRespuesta(r)).toEqual([])
  })

  it('se distingue de un "fui y no hay" corriente', () => {
    const noPublica = brazoMetaGastoCompetencia({ fuente: 'meta://ad-library' })
    const noHay = sinDato({
      brazo: 'apify', objetivo: 'gasto', fuente: 'meta://ad-library',
      motivo: 'fui, miré y no hay: el competidor no tiene anuncios activos',
    })
    expect(noPublica.motivo).not.toBe(noHay.motivo)
    expect(String(noPublica.motivo)).toMatch(/no se puede saber por esta fuente/)
  })
})

describe('🔴 el contrato SE HACE CUMPLIR · no es documentación', () => {
  it('sin_dato / sin_respuesta sin motivo son INVÁLIDOS', () => {
    const malo = { ...sinDato({ brazo: 'apify', objetivo: 'x', fuente: 'f', motivo: 'm' }), motivo: undefined } as RespuestaBrazo
    expect(validarRespuesta(malo)).toContain('motivo obligatorio cuando estado="sin_dato"')
  })
  it('trajo sin fuente es INVÁLIDO · aunque haya datos', () => {
    const malo = { ...trajo({ brazo: 'apify', objetivo: 'x', datos: { a: 1 }, fuente: 'f' }), fuente: '' } as RespuestaBrazo
    expect(validarRespuesta(malo)).toContain('fuente vacía · obligatoria incluso en trajo')
  })
  it('trajo con datos vacíos es INVÁLIDO · eso es sin_dato', () => {
    const malo = trajo({ brazo: 'apify', objetivo: 'x', datos: {}, fuente: 'f' })
    expect(validarRespuesta(malo)[0]).toMatch(/trajo con datos vacíos/)
  })
  it('medido_en tiene que ser ISO-8601', () => {
    const malo = sinRespuesta({ brazo: 'apify', objetivo: 'x', fuente: 'f', motivo: 'm', medido_en: 'ayer' })
    expect(validarRespuesta(malo)[0]).toMatch(/medido_en no es ISO-8601/)
  })
  it('envolverBrazo NUNCA lanza · ni con un rechazo sin Error', async () => {
    const r = await envolverBrazo({
      brazo: 'cerebro', objetivo: 'x', fuente: 'f',
      ejecutar: async () => { throw 'string pelado' },
    })
    expect(r.estado).toBe('sin_respuesta')
    expect(r.motivo).toMatch(/string pelado/)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// CONDICIÓN DE CC#3 · cerrada 2026-09-09 · «el envoltorio dice "miré y no
// hay" cuando nadie miró». Los nombres de campo son los que el Servicio
// emite hoy (medido sobre el flujo vivo 3lyknrP3PoS2KzUf).
// ─────────────────────────────────────────────────────────────────────────
describe('🔴 CONDICIÓN CC#3 · "nadie miró" NO puede salir como "miré y no hay"', () => {
  it('skipped:true (nadie preguntó) → sin_respuesta', async () => {
    const r = await brazoApify({
      objetivo: 'competidores', fuente: FUENTE,
      consultar: async () => ({ skipped: true, motivo: 'el cliente no tiene permiso', filas: [] }),
    })
    expect(r.estado).toBe('sin_respuesta')
    expect(r.motivo).toMatch(/NADIE PREGUNTÓ/)
    expect(r.motivo).not.toMatch(/fui, miré/)
  })

  it('clase "no_pude_ver" → sin_respuesta, con el motivo del Servicio', async () => {
    const r = await brazoApify({
      objetivo: 'redes', fuente: FUENTE,
      consultar: async () => ({ clase: 'no_pude_ver', motivo: 'actor devolvió 403', filas: [] }),
    })
    expect(r.estado).toBe('sin_respuesta')
    expect(r.motivo).toMatch(/NO SE PUDO VER.*403/)
  })

  it('un ENSAYO (dry-run) no es una mirada → sin_respuesta', async () => {
    const r = await brazoApify({
      objetivo: 'competidores', fuente: FUENTE,
      consultar: async () => ({ clase: 'ensayo', se_miro_de_verdad: false, filas: [] }),
    })
    expect(r.estado).toBe('sin_respuesta')
    expect(r.motivo).toMatch(/NO SE MIRÓ DE VERDAD/)
  })

  it('🟢 se_miro_de_verdad + cero filas → AHÍ SÍ es sin_dato', async () => {
    const r = await brazoApify({
      objetivo: 'competidores', fuente: FUENTE,
      consultar: async () => ({
        clase: 'no_existe', se_miro_de_verdad: true, filas: [],
        motivo_cero: 'el raspador terminó sin registros utilizables',
      }),
    })
    expect(r.estado).toBe('sin_dato')
    expect(r.motivo).toMatch(/fui, miré y no hay/)
  })

  it('🔴 los cuatro casos NO se ven iguales', async () => {
    const hacer = (c: Record<string, unknown>) =>
      brazoApify({ objetivo: 'x', fuente: FUENTE, consultar: async () => c })
    const nadie = await hacer({ skipped: true, filas: [] })
    const ciego = await hacer({ clase: 'no_pude_ver', motivo: 'm', filas: [] })
    const ensayo = await hacer({ clase: 'ensayo', se_miro_de_verdad: false, filas: [] })
    const noHay = await hacer({ clase: 'no_existe', se_miro_de_verdad: true, filas: [] })
    expect(noHay.estado).toBe('sin_dato')
    for (const r of [nadie, ciego, ensayo]) expect(r.estado).toBe('sin_respuesta')
    const motivos = new Set([nadie.motivo, ciego.motivo, ensayo.motivo, noHay.motivo])
    expect(motivos.size).toBe(4) // cuatro motivos distintos, no cuatro veces el mismo
  })

  it('filas sueltas sin el sobre · NO se puede afirmar que se miró', async () => {
    const r = await brazoApify({ objetivo: 'x', fuente: FUENTE, consultar: async () => [] })
    expect(r.estado).toBe('sin_respuesta')
    expect(r.motivo).toMatch(/NO alcanza para afirmar que se miró/)
  })
})
