/** 18-nov · G2a (c3 de CC7): el `feedback` de 5000 caracteres llega ENTERO a lo que reanuda la cadena; prueba de conducta, no de texto del código */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const recibido: { feedback?: unknown } = {}
vi.mock('@/lib/internal-auth', () => ({ checkInternalOrAdmin: async () => ({ ok: true }) }))
vi.mock('@/lib/posthog', () => ({ capture: () => undefined }))
vi.mock('@/lib/pipeline-orchestrator', () => ({
  PipelineOrchestrator: class {
    async resumeAfterHITL(...args: unknown[]) { recibido.feedback = args[3] /* (pipeline_id, step_index, decision, feedback, edited) */ }
  },
}))
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: (t: string) => {
      const q: any = { select: () => q, eq: () => q, limit: () => q, order: () => q,
        single: async () => (t === 'pipeline_steps' ? { data: { id: 'paso-1', pipeline_id: 'pl-1', step_index: 2, hitl_required: true, hitl_status: 'pending', status: 'waiting' }, error: null } : { data: { id: 'pl-1', status: 'running' }, error: null }),
        maybeSingle: async () => ({ data: { id: 'pl-1', status: 'running' }, error: null }) }
      return q
    },
  }),
}))

import { POST } from '../route'

const pedir = (cuerpo: Record<string, unknown>) => POST(new Request('http://x/api/hitl/resolve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) }))

describe('POST /api/hitl/resolve · el comentario de Emilio entero', () => {
  beforeEach(() => { delete recibido.feedback })
  it('🔴 un feedback de 5000 caracteres llega entero a la reanudación', async () => {
    const largo = 'w'.repeat(5000)
    const r = await pedir({ step_id: 'paso-1', decision: 'approved', feedback: largo })
    expect(r.status).toBeLessThan(300)
    expect(recibido.feedback).toBe(largo)
  })
})
