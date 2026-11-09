/**
 * El cableado REAL de la alarma del retiro (mutantes vivos de CC6 en #930): las dos rutas web que corren el retiro le pasan
 * el aviso y el cierre de incidentes de verdad (`avisarPorIncidente` / `resolverIncidente` con la base). Si alguien los quita, esta prueba avisa.
 * US$ 0 · sin red: las alertas y la base están simuladas; se mira qué recibe la ruta del portero.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const AVISO = vi.fn(), CIERRE = vi.fn()
const recibido: Record<string, Record<string, unknown>> = {}
vi.mock('@/lib/portero-alimenta/alertas', () => ({ avisarPorIncidente: vi.fn(() => AVISO), resolverIncidente: vi.fn(() => CIERRE) }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ from: () => { throw new Error('la prueba no lee la base') } }) }))
vi.mock('@/lib/portero-alimenta/rutas', () => ({
  rutaAlimentar: vi.fn(async (deps: Record<string, unknown>) => { recibido.procesar = deps; return { status: 200, body: { ok: true } } }),
  rutaPuente: vi.fn(async (deps: Record<string, unknown>) => { recibido.puente = deps; return { status: 200, body: { ok: true } } }),
}))

const pedir = (url: string) => new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'llave-de-prueba' }, body: JSON.stringify({ client_id: '55555555-5555-4555-8555-555555555555', dry_run: false, workflow_id: 'wf', workflow_execution_id: 'ex' }) })

describe('las rutas que corren el retiro cablean la alarma de verdad', () => {
  beforeEach(() => { process.env.INTERNAL_API_KEY = 'llave-de-prueba'; for (const k of Object.keys(recibido)) delete recibido[k] })
  it('/alimentar/procesar (cada corrida de cada cliente): aviso y cierre', async () => {
    const { POST } = await import('../../../app/api/brain/alimentar/procesar/route')
    const r = await POST(pedir('https://x.example/api/brain/alimentar/procesar'))
    expect(r.status).toBe(200)
    expect(recibido.procesar.avisarIncidente).toBe(AVISO)
    expect(recibido.procesar.resolverIncidente).toBe(CIERRE)
  })
  it('/alimentar/puente: aviso y cierre', async () => {
    const { POST } = await import('../../../app/api/brain/alimentar/puente/route')
    const r = await POST(pedir('https://x.example/api/brain/alimentar/puente'))
    expect(r.status).toBe(200)
    expect(recibido.puente.avisarIncidente).toBe(AVISO)
    expect(recibido.puente.resolverIncidente).toBe(CIERRE)
  })
})
