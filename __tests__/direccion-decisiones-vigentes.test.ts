// 01-nov · firma de Emilio: solo lo vigente pide firma; los títulos al dueño van claros y en tuteo.
import { describe, expect, it } from 'vitest'
import { tituloParaElDueno } from '@/lib/direccion/decisiones'
import { motivoDeReemplazo, planesVigentes } from '@/lib/direccion/decisiones-reemplazadas'
import { cerrarDecisionesReemplazadas } from '@/lib/oficina/cerrar-decisiones-reemplazadas'

const C = 'cliente-1'
const AHORA = new Date('2026-11-01T22:00:00Z')
const plan = (id: string, created_at: string, tag: Record<string, unknown> = {}, status = 'draft') => ({ id, client_id: C, status, provenance_tag: tag, created_at })
const PLANES = [plan('viejo', '2026-10-30T00:00:00Z'), plan('v1', '2026-11-01T16:00:00Z', { vigente: false, superseded_por: 'v2' }), plan('copia', '2026-11-01T19:33:00Z', { vigente: false, superseded_por: 'v2' }), plan('v2', '2026-11-01T19:49:00Z', { vigente: true })]
const vig = planesVigentes(PLANES)
const fila = (x: Record<string, unknown>) => ({ id: 'h', client_id: C, created_at: '2026-11-01T20:00:00Z', ...x })

describe('cuál plan es el vigente', () => {
  it('🔴 el más nuevo sin marca de reemplazado, aunque otro marcado sea posterior', () => {
    const v = planesVigentes([...PLANES, plan('marcado', '2026-11-01T20:00:00Z', { vigente: false })])
    expect(v.get(C)?.id).toBe('v2')
  })
  it('🔴 un plan con solo la marca de reemplazado (sin vigente:false) tampoco es vigente', () => {
    expect(planesVigentes([plan('a', '2026-10-01'), plan('b', '2026-10-02', { superseded_por: 'a' })]).get(C)?.id).toBe('a')
  })
  it('🔴 un plan rechazado o de ensayo no es vigente', () => {
    expect(planesVigentes([plan('a', '2026-10-01'), plan('b', '2026-10-02', {}, 'rejected'), plan('c', '2026-10-03', { dry_run: true })]).get(C)?.id).toBe('a')
  })
  it('con un solo plan no hay anteriores', () => {
    expect(planesVigentes([plan('a', '2026-10-01')]).get(C)?.hay_anteriores).toBe(false)
    expect(vig.get(C)?.hay_anteriores).toBe(true)
  })
})

describe('qué decisión sigue viva', () => {
  it('🔴 un plan viejo con pendientes se cierra, aun sin marca en su etiqueta; el vigente sigue', () => {
    expect(motivoDeReemplazo(fila({ type: 'plan_con_pendientes', output_id: 'viejo' }), vig)).toMatch(/reemplazado/)
    expect(motivoDeReemplazo(fila({ type: 'plan_con_pendientes', output_id: 'v1' }), vig)).toMatch(/reemplazado/)
    expect(motivoDeReemplazo(fila({ type: 'plan_con_pendientes', output_id: 'v2' }), vig)).toBeNull()
  })
  it('🔴 una pieza anterior al plan vigente se cierra; una posterior sigue', () => {
    expect(motivoDeReemplazo(fila({ type: 'content_piece_review', created_at: '2026-10-31T00:00:00Z' }), vig)).toMatch(/plan anterior/)
    expect(motivoDeReemplazo(fila({ type: 'content_piece_review', created_at: '2026-11-01T21:00:00Z' }), vig)).toBeNull()
  })
  it('🔴 la gran idea anterior al plan vigente también se cierra', () => {
    expect(motivoDeReemplazo(fila({ type: 'concepto_review', created_at: '2026-10-31T00:00:00Z' }), vig)).toMatch(/plan anterior/)
  })
  it('🔴 si el cliente tuvo un solo plan, la pieza anterior a él no se toca: nada se reemplazó', () => {
    const uno = planesVigentes([plan('unico', '2026-10-20T00:00:00Z')])
    expect(motivoDeReemplazo(fila({ type: 'content_piece_review', created_at: '2026-10-01T00:00:00Z' }), uno)).toBeNull()
  })
  it('🔴 una pieza posterior a su único plan sigue viva aunque su campaña esté en pausa: pausar no es reemplazar', () => {
    const uno = planesVigentes([plan('unico', '2026-10-20T00:00:00Z')])
    expect(motivoDeReemplazo(fila({ type: 'content_piece_review', created_at: '2026-10-28T00:00:00Z' }), uno)).toBeNull()
  })
  it('🔴 otros tipos no se cierran por esto', () => {
    expect(motivoDeReemplazo(fila({ type: 'confirm_competitor_list', created_at: '2026-10-01T00:00:00Z' }), vig)).toBeNull()
    expect(motivoDeReemplazo(fila({ type: 'editor_escalation', created_at: '2026-10-01T00:00:00Z' }), vig)).toBeNull()
  })
  it('🔴 sin plan leído del cliente, sigue viva', () => {
    expect(motivoDeReemplazo(fila({ type: 'plan_con_pendientes', output_id: 'viejo', client_id: 'otro' }), vig)).toBeNull()
  })
})

function dbFalsa(t: { hitl?: unknown[]; planes?: unknown[]; errorEn?: string }) {
  const escrituras: Array<{ valores: Record<string, unknown>; filtros: Array<[string, unknown]> }> = []
  const db = {
    from(tabla: string) {
      const filtros: Array<[string, unknown]> = []
      let valores: Record<string, unknown> | null = null
      const q = {
        select: () => q,
        update: (v: Record<string, unknown>) => { valores = v; return q },
        eq: (c: string, v: unknown) => { filtros.push([c, v]); return q },
        in: () => q,
        limit: () => q,
        then: (ok: (r: unknown) => unknown) => {
          if (t.errorEn === tabla) return Promise.resolve({ data: null, error: { message: 'caída' } }).then(ok)
          if (valores) { escrituras.push({ valores, filtros }); return Promise.resolve({ data: null, error: null }).then(ok) }
          const data = tabla === 'hitl_queue' ? t.hitl : t.planes
          return Promise.resolve({ data: data ?? [], error: null }).then(ok)
        },
      }
      return q
    },
  }
  return { db, escrituras }
}
const VIEJO = fila({ id: 'h1', type: 'plan_con_pendientes', output_id: 'viejo' })
const VIVO = fila({ id: 'h2', type: 'plan_con_pendientes', output_id: 'v2' })

describe('el barrido del reloj', () => {
  it('🔴 cierra lo reemplazado con su motivo, como vencida, solo si sigue pendiente, y no toca lo vivo', async () => {
    const { db, escrituras } = dbFalsa({ hitl: [VIEJO, VIVO], planes: PLANES })
    const r = await cerrarDecisionesReemplazadas(db, AHORA)
    expect(r.cerradas.map((x) => x.id)).toEqual(['h1'])
    expect(escrituras).toHaveLength(1)
    expect(escrituras[0].filtros).toEqual([['id', 'h1'], ['status', 'pending']])
    expect(escrituras[0].valores).toMatchObject({ status: 'rejected', decision: { vencida: true, reemplazada: true, motivo: expect.stringMatching(/reemplazado/) } })
  })
  it('🔴 en seco cuenta y no escribe', async () => {
    const { db, escrituras } = dbFalsa({ hitl: [VIEJO], planes: PLANES })
    expect((await cerrarDecisionesReemplazadas(db, AHORA, { dry_run: true })).cerradas).toHaveLength(1)
    expect(escrituras).toHaveLength(0)
  })
  it('🔴 una fila de ensayo marcada no se toca', async () => {
    const { db, escrituras } = dbFalsa({ hitl: [{ ...VIEJO, payload: { dry_run: true } }], planes: PLANES })
    await cerrarDecisionesReemplazadas(db, AHORA)
    expect(escrituras).toHaveLength(0)
  })
  it('🔴 una fila de ensayo marcada en metadata tampoco se toca', async () => {
    const { db, escrituras } = dbFalsa({ hitl: [{ ...VIEJO, metadata: { dry_run: true } }], planes: PLANES })
    await cerrarDecisionesReemplazadas(db, AHORA)
    expect(escrituras).toHaveLength(0)
  })
  it('🔴 si falla la escritura, se detiene, dice cuál y no lanza', async () => {
    const llamadas: string[] = []
    const db = { from: (t: string) => {
      const q: Record<string, unknown> = {
        select: () => q, eq: () => q, in: () => q, limit: () => q,
        update: () => ({ eq: () => ({ eq: async () => { llamadas.push('escribe'); return { error: { message: 'sin permiso' } } } }) }),
        then: (ok: (r: unknown) => unknown) => Promise.resolve({ data: t === 'hitl_queue' ? [VIEJO, { ...VIEJO, id: 'h9' }] : PLANES, error: null }).then(ok),
      }
      return q
    } }
    const r = await cerrarDecisionesReemplazadas(db, AHORA)
    expect(r.error).toBe('sin permiso')
    expect(r.cerradas).toEqual([])
    expect(llamadas).toHaveLength(1)
  })
  it('🔴 si no se leen los planes, no cierra nada y lo dice', async () => {
    const { db, escrituras } = dbFalsa({ hitl: [VIEJO, fila({ id: 'p', type: 'content_piece_review' })], planes: PLANES, errorEn: 'client_historical_outputs' })
    const r = await cerrarDecisionesReemplazadas(db, AHORA)
    expect(r.error).toBeTruthy()
    expect(escrituras).toHaveLength(0)
  })
  it('🔴 nunca lanza', async () => {
    const r = await cerrarDecisionesReemplazadas({ from() { throw new Error('caída total') } }, AHORA)
    expect(r.error).toMatch(/caída total/)
  })
})

describe('el título que lee el dueño', () => {
  it.each([
    ['Aprobación · Kit BRF-0002 · instagram · 2 láminas · versión 1 · Cliente', 'Kit · instagram · 2 láminas · Cliente'],
    ['⚠️ REVISIÓN INCOMPLETA · Aprobación · Carrusel BRF-0001 · instagram · 7 láminas · versión 2 · Cliente', 'Revisión incompleta · Carrusel · instagram · 7 láminas · Cliente'],
    ['Plan de 90 días de Cliente con pendientes: P3 · lleva nombres internos · P4 · presupuesto incompleto', 'Plan de Marketing de Cliente con pendientes: lleva nombres internos · presupuesto incompleto'],
    ['Plan de 90 días, versión 2: espera tu decisión', 'Plan de Marketing: espera tu decisión'],
    ['Plan de Marketing, versión 3: espera tu decisión', 'Plan de Marketing: espera tu decisión'],
    ['Revisa el plan de 90 dias antes de aprobar', 'Revisa el Plan de Marketing antes de aprobar'],
    ['Un plan de 90 díasx no es el plan', 'Un plan de 90 díasx no es el plan'],
    ['Tablero financiero, versión 1: espera tu firma', 'Tablero Financiero: espera tu firma'],
    ['Tablero Financiero, versión 4: espera tu firma', 'Tablero Financiero: espera tu firma'],
    ['El TABLERO FINANCIERO de Uno y el tablero financiero de Dos', 'El Tablero Financiero de Uno y el Tablero Financiero de Dos'],
    ['Plan de 90 días y plan de 90 dias', 'Plan de Marketing y Plan de Marketing'],
    ['Kit del plan v2 listo', 'Kit del plan listo'],
  ])('%s', (crudo, esperado) => { expect(tituloParaElDueno(crudo)).toBe(esperado) })
  it('🔴 corrige el voseo con pronombre pegado', () => {
    expect(tituloParaElDueno('¿Cuál es el monto? Separalo en dos: equipo nuevo y recarga.')).toBe('¿Cuál es el monto? Sepáralo en dos: equipo nuevo y recarga.')
  })
  it('🔴 no daña palabras ni precios que parecen códigos', () => {
    for (const t of ['Tu Business Manager de Meta y la página PYME', '¿Cuánto cuesta el P100 en tu tienda?', 'Un regalo y un intervalo de tiempo']) expect(tituloParaElDueno(t)).toBe(t)
  })
})
