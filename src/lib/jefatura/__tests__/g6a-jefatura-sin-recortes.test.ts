/**
 * 19-nov · G6a · jefatura y revisores sin recortes (firma de Emilio «nada se recorta», 18-nov · GO Lenovo 15:52Z, G6). Puras o con el fetch falso, US$ 0.
 *  · los 3 revisores de calidad (`editor-middleware`) reciben la pieza y la tarea ENTERAS (antes 8000 y 500, sin aviso); al rehacer, el productor recibe su texto anterior entero (antes 2000)
 *  · la mesa recibe TODOS los desacuerdos de la jefatura, enteros (antes 8 de 400, sin aviso)
 *  · el jefe de fondo recibe TODAS las cifras y la ficha de hechos entera (antes 60 cifras y 20.000 caracteres, con aviso)
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { escalateToHITL, parseEditorVerdict, runDualReviewMiddleware } from '../../editor-middleware'
import { avisoDeLaJefaturaALaMesa } from '../../oficina/paso-jefatura'
import { bloqueDeCifrasParaElJefe, cifrasParaElJefe, trazaDeLaFicha, type FichaDeHechos } from '../ficha-de-hechos'

const largo = (marca: string, n: number) => `${marca}-INICIO ${'x'.repeat(n)} ${marca}-FINAL`

describe('G6a · los 3 revisores de calidad leen todo', () => {
  afterEach(() => { vi.unstubAllGlobals() })
  const correr = async (veredictos: string[]) => {
    const cuerpos: Array<{ agent: string; task: string }> = []
    let i = 0
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      const b = JSON.parse(init.body) as { agent: string; task: string }
      cuerpos.push(b)
      const esRevisor = b.task.includes('## Content to Review')
      const response = esRevisor ? veredictos[Math.min(i++, veredictos.length - 1)] : largo('REHECHO', 3000)
      return new Response(JSON.stringify({ success: true, response }), { status: 200 })
    }))
    const r = await runDualReviewMiddleware({
      agentSlug: 'creative-director', content: largo('PIEZA', 20_000), task: largo('TAREA', 5000), context: {},
      config: { max_revisions: 1, escalate_on: ['critical'] }, supabase: {} as never, baseUrl: 'http://local', clientId: null,
    })
    return { r, cuerpos }
  }
  const aprobado = JSON.stringify({ status: 'approved', severity: 'low', issues: [], feedback: '' })
  it('🔴 la pieza y la tarea llegan enteras a los 3 revisores', async () => {
    const { cuerpos } = await correr([aprobado])
    const revisores = cuerpos.filter((c) => c.task.includes('## Content to Review'))
    expect(revisores.length).toBe(3)
    for (const c of revisores) {
      expect(c.task, c.agent).toContain('PIEZA-FINAL')
      expect(c.task, c.agent).toContain('TAREA-FINAL')
    }
  })
  it('🔴 (m1 de CC6) una respuesta ilegible del revisor se guarda entera en el veredicto (antes 500)', async () => {
    // la respuesta ilegible no vota (falla técnica, se reintenta y queda fuera): su texto solo vive en el veredicto que arma el lector
    const v = parseEditorVerdict(largo('ILEGIBLE', 2000))
    expect(v.falla_tecnica).toBe(true)
    expect(v.feedback).toContain('ILEGIBLE-FINAL')
  })
  it('🔴 (m2 de CC6) la consulta al cerebro sigue siendo una frase corta: 100 caracteres de la tarea (es búsqueda, no material)', async () => {
    const { cuerpos } = await correr([aprobado])
    const consultas = cuerpos.map((c) => (c as unknown as { context?: { rag_query?: string } }).context?.rag_query).filter((q): q is string => typeof q === 'string')
    expect(consultas.length).toBe(3)
    const tarea = largo('TAREA', 5000)
    for (const q of consultas) {
      expect(q.endsWith(tarea.substring(0, 100)), q).toBe(true)
      expect(q).not.toContain(tarea.substring(0, 101))
    }
  })
  it('🔴 al rehacer, el productor recibe su texto anterior entero', async () => {
    const revisar = JSON.stringify({ status: 'revision_needed', severity: 'medium', issues: ['falta algo'], feedback: 'agrega lo que falta' })
    const { cuerpos } = await correr([revisar, revisar, revisar, aprobado])
    const rehacer = cuerpos.find((c) => c.task.includes('[REVISION'))
    expect(rehacer, JSON.stringify(cuerpos.map((c) => c.task.slice(0, 40)))).toBeDefined()
    expect(rehacer!.task).toContain('PIEZA-FINAL')
  })
})

describe('G6a · la bandeja de Emilio recibe la tarea original entera', () => {
  it('🔴 una escalada del editor guarda la tarea completa (antes 1000) y la pieza entera (m3 de CC6)', async () => {
    const filas: Array<Record<string, unknown>> = []
    const db = { from: () => ({ insert: (f: Record<string, unknown>) => { filas.push(f); return { select: () => ({ single: async () => ({ data: { id: 'h1', expires_at: 'x' }, error: null }) }) } } }) }
    const id = await escalateToHITL({ agentSlug: 'creative-director', finalContent: largo('PIEZA', 20_000), aggregateVerdict: { status: 'escalated', severity: 'high', issues: [], feedback: '' } as never, revisionsAttempted: 0, originalTask: largo('TAREA', 5000), originalContext: {}, supabase: db as never, clientId: null })
    expect(id).toBe('h1')
    expect(JSON.stringify(filas[0])).toContain('TAREA-FINAL')
    expect(JSON.stringify(filas[0])).toContain('PIEZA-FINAL')
  })
})

describe('G6a · la mesa recibe todos los desacuerdos de la jefatura', () => {
  it('🔴 50 desacuerdos de 1000 caracteres: van los 50, enteros (m6 de CC6: con 12 justos un corte en 12 pasaba)', () => {
    const d = Array.from({ length: 50 }, (_, i) => largo(`D${i + 1}`, 1000))
    const t = avisoDeLaJefaturaALaMesa(d)
    for (let i = 1; i <= 50; i++) expect(t).toContain(`D${i}-FINAL`)
  })
})

describe('G6a · el jefe de fondo recibe todas las cifras y la ficha entera', () => {
  const N = 100
  const ficha: FichaDeHechos = {
    hechos: Array.from({ length: 400 }, (_, i) => ({ ref: `h${i + 1}`, atributo: `dato ${i + 1}`, valor: `${'v'.repeat(80)} ${1000 + i}` })),
    incompleta: false, faltan: [],
  } as unknown as FichaDeHechos
  const texto = Array.from({ length: N }, (_, i) => `Cifra ${i + 1}: ${5000 + i} unidades.`).join(' ')
  it('🔴 la ficha de 400 hechos (más de 20.000 caracteres) va entera y sin aviso de recorte', () => {
    const cifras = cifrasParaElJefe(texto, ficha)
    const b = bloqueDeCifrasParaElJefe(ficha, cifras)
    expect(b).toContain('h400')
    expect(b).not.toMatch(/ficha recortada/)
  })
  it('🔴 las 100 cifras se listan todas', () => {
    const cifras = cifrasParaElJefe(texto, ficha)
    expect(cifras.length).toBeGreaterThan(60)
    const b = bloqueDeCifrasParaElJefe(ficha, cifras)
    expect(b).toContain(`c${cifras.length} ·`)
    expect(b).not.toMatch(/cifras más que no se listan/)
    const tr = trazaDeLaFicha(ficha, cifras)
    expect(tr.sin_listar).toBeUndefined()
    expect(tr.ficha_recortada).toBeUndefined()
  })
})
