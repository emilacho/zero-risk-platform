/**
 * 03-nov · orden de Emilio: un revisor caído por una falla técnica no llega a su bandeja. Solo escala lo que un revisor encontró de verdad.
 * Se prueba con la conversación real del editor: las respuestas de los revisores llegan por `fetch`, la bandeja y el registro son falsos.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { avisarRevisoresCaidos, CLAVE_AVISO_REVISORES_CAIDOS, runDualReviewMiddleware } from '../src/lib/editor-middleware'
import { getEditorConfig } from '../src/lib/editor-routing'

type Fila = Record<string, unknown>
function bdFalsa(ajustes: Fila = {}) {
  const hitl: Fila[] = []
  const ajustesGuardados = { ...ajustes }
  const db = {
    hitl,
    ajustes: ajustesGuardados,
    from(tabla: string) {
      if (tabla === 'settings') {
        return {
          select: () => ({ eq: (_c: string, k: string) => ({ maybeSingle: async () => ({ data: k in ajustesGuardados ? { value: ajustesGuardados[k] } : null, error: null }) }) }),
          upsert: async (f: { key: string; value: string }) => { ajustesGuardados[f.key] = f.value; return { error: null } },
        }
      }
      return { insert: (f: Fila) => { hitl.push(f); return { select: () => ({ single: async () => ({ data: { id: 'h1' }, error: null }) }) } } }
    },
  }
  return db
}
const VOTO = (status: string, severity = 'low', issues: string[] = []) => ({ ok: true, json: async () => ({ success: true, response: JSON.stringify({ status, severity, issues, feedback: 'nota' }) }) })
const CAIDO = { ok: false, status: 403, json: async () => ({ error: 'forbidden' }) }
const ILEGIBLE = { ok: true, json: async () => ({ success: true, response: 'no puedo revisar esto ahora' }) }
const quien = (cuerpo: unknown) => String((JSON.parse(String((cuerpo as { body: string }).body)) as { agent: string }).agent)

let guion: Record<string, unknown[]>
let llamadas: string[]
beforeEach(() => {
  llamadas = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn(async (url: string, cuerpo: unknown) => {
    if (String(url).includes('slack.com')) return { ok: true, json: async () => ({ ok: true }) }
    const a = quien(cuerpo)
    llamadas.push(a)
    const lista = guion[a]
    return lista.length > 1 ? lista.shift() : lista[0]
  }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
const correr = (db: ReturnType<typeof bdFalsa>) => runDualReviewMiddleware({ agentSlug: 'content-creator', content: 'Caliente, fresco, tuyo', task: 't', context: { workflow_id: 'w' }, config: getEditorConfig('content-creator')!, supabase: db as never, baseUrl: 'https://x', clientId: 'c-1' })

describe('revisores que no contestan', () => {
  it.each([['403', CAIDO], ['respuesta ilegible', ILEGIBLE]])('🔴 %s en los tres: nada llega a la bandeja y el texto sigue', async (_n, r) => {
    guion = { 'editor-en-jefe': [r], 'brand-strategist': [r], 'jefe-client-success': [r] }
    const db = bdFalsa()
    const s = await correr(db)
    expect(db.hitl).toEqual([])
    expect(s.escalated_to_hitl).toBeUndefined()
    expect(s.editor_review).toMatchObject({ verdict: 'revision_no_disponible', sin_responder: ['editor-en-jefe', 'brand-strategist', 'jefe-client-success'] })
    expect(s.response).toBeUndefined()
  })

  it('🔴 cada uno tiene un reintento, y solo uno', async () => {
    guion = { 'editor-en-jefe': [CAIDO], 'brand-strategist': [CAIDO], 'jefe-client-success': [CAIDO] }
    await correr(bdFalsa())
    expect(llamadas.sort()).toEqual(['brand-strategist', 'brand-strategist', 'editor-en-jefe', 'editor-en-jefe', 'jefe-client-success', 'jefe-client-success'])
  })

  it('🔴 el que contesta en el reintento cuenta', async () => {
    guion = { 'editor-en-jefe': [CAIDO, VOTO('approved')], 'brand-strategist': [VOTO('approved')], 'jefe-client-success': [VOTO('approved')] }
    const db = bdFalsa()
    const s = await correr(db)
    expect(s.editor_review.verdict).toBe('approved')
    expect(s.editor_review.sin_responder).toBeUndefined()
    expect(db.hitl).toEqual([])
  })

  it('🔴 uno caído no vuelve «escalado» lo que los otros aprobaron', async () => {
    guion = { 'editor-en-jefe': [CAIDO], 'brand-strategist': [VOTO('approved')], 'jefe-client-success': [VOTO('approved')] }
    const db = bdFalsa()
    const s = await correr(db)
    expect(s.editor_review).toMatchObject({ verdict: 'approved', sin_responder: ['editor-en-jefe'] })
    expect(db.hitl).toEqual([])
  })
})

describe('lo que sí llega a Emilio', () => {
  it('🔴 un problema real de un revisor escala, aunque otro esté caído', async () => {
    guion = { 'editor-en-jefe': [CAIDO], 'brand-strategist': [VOTO('escalated', 'high', ['promete algo que el cliente no ofrece'])], 'jefe-client-success': [VOTO('approved')] }
    const db = bdFalsa()
    const s = await correr(db)
    expect(s.escalated_to_hitl).toBe(true)
    expect(db.hitl).toHaveLength(1)
    expect(s.editor_review.sin_responder).toEqual(['editor-en-jefe'])
  })

  it('🔴 si en la revisión del texto corregido ya nadie contesta, sale el texto corregido y no escala', async () => {
    guion = {
      'editor-en-jefe': [VOTO('revision_needed', 'low', ['x']), CAIDO],
      'brand-strategist': [VOTO('approved'), CAIDO],
      'jefe-client-success': [VOTO('approved'), CAIDO],
      'content-creator': [{ ok: true, json: async () => ({ success: true, response: 'texto corregido' }) }],
    }
    const db = bdFalsa()
    const s = await correr(db)
    expect(db.hitl).toEqual([])
    expect(s.editor_review).toMatchObject({ verdict: 'revision_no_disponible', revisions: 1 })
    expect(s.response).toBe('texto corregido')
  })
})

describe('el aviso a #alertas', () => {
  const base = { agentSlug: 'content-creator', clientId: 'c-1', sinResponder: ['editor-en-jefe'] }
  const AHORA = new Date('2026-11-03T12:00:00Z')

  it('🔴 uno por incidente: no se repite en 24 h, y después sí', async () => {
    const avisar = vi.fn(async () => {})
    const db = bdFalsa()
    await avisarRevisoresCaidos({ ...base, supabase: db as never, avisar, ahora: AHORA })
    await avisarRevisoresCaidos({ ...base, supabase: db as never, avisar, ahora: new Date('2026-11-04T11:59:00Z') })
    expect(avisar).toHaveBeenCalledTimes(1)
    await avisarRevisoresCaidos({ ...base, supabase: db as never, avisar, ahora: new Date('2026-11-04T12:00:00Z') })
    expect(avisar).toHaveBeenCalledTimes(2)
    expect(db.ajustes[CLAVE_AVISO_REVISORES_CAIDOS]).toBe('2026-11-04T12:00:00.000Z')
  })

  it('🔴 nunca lanza: un aviso que falla no frena al empleado', async () => {
    const roto = { from: () => { throw new Error('base caída') } }
    await expect(avisarRevisoresCaidos({ ...base, supabase: roto as never, avisar: async () => {} })).resolves.toBeUndefined()
  })

  it('🔴 el aviso no es una decisión: no toca la bandeja', async () => {
    guion = { 'editor-en-jefe': [CAIDO], 'brand-strategist': [CAIDO], 'jefe-client-success': [CAIDO] }
    const db = bdFalsa()
    await correr(db)
    expect(db.ajustes[CLAVE_AVISO_REVISORES_CAIDOS]).toBeTruthy()
    expect(db.hitl).toEqual([])
  })
})
