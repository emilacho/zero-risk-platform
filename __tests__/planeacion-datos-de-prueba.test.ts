/**
 * DATOS DE PRUEBA POR CLIENTE (orden Lenovo 01-nov 12:36Z, tramo 1, ítem 4) · CC2. US$ 0, PostHog simulado.
 * Convención única `clients.config.datos_de_prueba` { distinct_ids, rangos, evento_bandera, nota }: el brazo de PostHog la APLICA antes de contar.
 * Fija: ausente ⇒ la consulta es EXACTAMENTE la de hoy; lo malformado se descarta y se declara (no se excluye a medias); no hay inyección por la ficha.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { condicionesHogQL, leerDatosDePrueba, MAX_IDS, MAX_RANGOS, rotuloDeExclusion } from '@/lib/planeacion/datos-de-prueba'

const BUENO = {
  distinct_ids: ['dueno-1', 'agencia-qa'],
  rangos: [{ desde: '2026-10-02', hasta: '2026-10-03', nota: 'ensayo de cobro' }],
  evento_bandera: 'es_prueba',
  nota: 'pruebas del dueño',
}

describe('leerDatosDePrueba', () => {
  it('lee la convención completa (desde config o el objeto mismo)', () => {
    for (const e of [{ datos_de_prueba: BUENO }, BUENO]) {
      const dp = leerDatosDePrueba(e)!
      expect(dp.distinct_ids).toEqual(['dueno-1', 'agencia-qa'])
      expect(dp.rangos).toEqual([{ desde: '2026-10-02', hasta: '2026-10-03', nota: 'ensayo de cobro' }])
      expect(dp.evento_bandera).toBe('es_prueba')
      expect(dp.nota).toBe('pruebas del dueño')
      expect(dp.descartado).toEqual([])
    }
  })
  it.each([[undefined], [null], [{}], [[]], ['x'], [{ datos_de_prueba: {} }], [{ datos_de_prueba: { distinct_ids: [] } }]])('sin nada utilizable (%j) ⇒ null', (e) => {
    expect(leerDatosDePrueba(e)).toBeNull()
  })
  it('🔴 lo malformado se DESCARTA y se declara; lo bueno se conserva', () => {
    const dp = leerDatosDePrueba({
      distinct_ids: ['ok', 7, '', 'ok', { x: 1 }],
      rangos: [{ desde: '2026-10-05', hasta: '2026-10-01' }, { desde: 'ayer', hasta: 'hoy' }, { desde: '2026-10-02', hasta: '2026-10-03' }, null],
      evento_bandera: "es_prueba') or 1=1 --",
    })!
    expect(dp.distinct_ids).toEqual(['ok'])
    expect(dp.rangos).toEqual([{ desde: '2026-10-02', hasta: '2026-10-03' }])
    expect(dp.evento_bandera).toBeNull()
    expect(dp.descartado.length).toBeGreaterThanOrEqual(7)
  })
  it('formas que no son lista se declaran, no revientan', () => {
    const dp = leerDatosDePrueba({ distinct_ids: 'dueno', rangos: { desde: 'x' }, evento_bandera: 5 })!
    expect(dp.distinct_ids).toEqual([])
    expect(dp.descartado).toEqual(expect.arrayContaining(['distinct_ids no es una lista', 'rangos no es una lista']))
    expect(condicionesHogQL(dp)).toBe('')
  })
  it('topes: 50 ids y 10 rangos', () => {
    const dp = leerDatosDePrueba({ distinct_ids: Array.from({ length: 80 }, (_, i) => 'id' + i), rangos: Array.from({ length: 15 }, (_, i) => ({ desde: `2026-01-${String(i + 1).padStart(2, '0')}`, hasta: `2026-02-${String(i + 1).padStart(2, '0')}` })) })!
    expect(dp.distinct_ids.length).toBe(MAX_IDS)
    expect(dp.rangos.length).toBe(MAX_RANGOS)
    expect(dp.descartado.length).toBe(2)
  })
})

describe('condicionesHogQL', () => {
  it('sin datos ⇒ cadena vacía (la consulta es la de hoy)', () => {
    expect(condicionesHogQL(null)).toBe('')
  })
  it('arma las tres exclusiones', () => {
    const q = condicionesHogQL(leerDatosDePrueba(BUENO))
    expect(q).toContain(" and distinct_id not in ('dueno-1', 'agencia-qa')")
    expect(q).toContain(" and not (timestamp >= parseDateTimeBestEffort('2026-10-02') and timestamp < parseDateTimeBestEffort('2026-10-03'))")
    expect(q).toContain("and coalesce(toString(properties.es_prueba), '') not in ('true', '1')")
  })
  it("🔴 una comilla o una barra en un id no rompe la consulta (se escapa)", () => {
    const q = condicionesHogQL(leerDatosDePrueba({ distinct_ids: ["o'brien", 'a\\b'] }))
    expect(q).toContain("'o''brien'")
    expect(q).toContain("'a\\\\b'")
  })
})

describe('rotuloDeExclusion', () => {
  it('dice qué se dejó fuera y que son pruebas, no clientes', () => {
    const r = rotuloDeExclusion(leerDatosDePrueba(BUENO))!
    expect(r).toMatch(/pruebas del dueño o de la agencia, no clientes/)
    expect(r).toContain('2 cuenta(s) interna(s)')
    expect(r).toContain('1 ventana(s) de prueba')
    expect(r).toContain('«es_prueba»')
  })
  it('sin nada que excluir ⇒ null', () => {
    expect(rotuloDeExclusion(null)).toBeNull()
    expect(rotuloDeExclusion(leerDatosDePrueba({ nota: 'solo nota', distinct_ids: ['x'] }) && { distinct_ids: [], rangos: [], evento_bandera: null, nota: 'n', descartado: [] })).toBeNull()
  })
})

describe('el brazo de PostHog aplica la convención', () => {
  let sqls: string[] = []
  beforeEach(() => {
    process.env.INTERNAL_API_KEY = 'k'
    process.env.POSTHOG_PROJECT_ID = '1'
    process.env.POSTHOG_PERSONAL_API_KEY = 'k'
    process.env.POSTHOG_API_URL = 'https://ph.test'
    sqls = []
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: { body: string }) => {
      sqls.push(JSON.parse(init.body).query.query)
      return new Response(JSON.stringify({ results: [['$pageview', 10, 5]] }), { status: 200 })
    }))
  })
  afterEach(() => vi.unstubAllGlobals())
  const pedir = async (params: Record<string, unknown>) => {
    const { POST } = await import('@/app/api/planeacion/brazo/posthog/route')
    const r = await POST(new Request('https://x.test/api/planeacion/brazo/posthog', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'k' },
      body: JSON.stringify({ pedidos: [{ brazo: 'posthog', objetivo: 'analitica_propia', params }] }),
    }))
    const j = await r.json()
    return (Array.isArray(j) ? j[0] : (j.respuestas ?? [j])[0]) as { datos: Record<string, any> }
  }
  it('sin `datos_de_prueba`: la consulta es EXACTAMENTE la de hoy y el dato no lleva rótulo', async () => {
    const r = await pedir({ dominio: 'sitio.ec' })
    expect(sqls[0]).toContain("in ('sitio.ec', 'www.sitio.ec') group by event")
    expect(sqls[0]).not.toMatch(/distinct_id not in|parseDateTime|not in \(/)
    expect(r.datos.pruebas_excluidas).toBeUndefined()
    expect(r.datos.pruebas_descartadas).toBeUndefined()
  })
  it('con la convención: la consulta excluye antes de agrupar y el dato lo declara', async () => {
    const r = await pedir({ dominio: 'sitio.ec', datos_de_prueba: BUENO })
    expect(sqls[0]).toMatch(/in \('sitio\.ec', 'www\.sitio\.ec'\) and distinct_id not in \('dueno-1', 'agencia-qa'\)/)
    expect(sqls[0].indexOf('not in')).toBeLessThan(sqls[0].indexOf('group by'))
    expect(r.datos.pruebas_excluidas).toMatch(/no clientes/)
    expect(r.datos.pruebas_nota).toBe('pruebas del dueño')
  })
  it('🔴 lo malformado no excluye a medias: se descarta, la consulta queda sin esa condición y se declara', async () => {
    const r = await pedir({ dominio: 'sitio.ec', datos_de_prueba: { evento_bandera: "x') or 1=1 --", distinct_ids: ['solo-este'] } })
    expect(sqls[0]).toContain("distinct_id not in ('solo-este')")
    expect(sqls[0]).not.toContain('or 1=1')
    expect(r.datos.pruebas_descartadas).toEqual(['evento_bandera inválida (solo letras, números y _)'])
  })
})
