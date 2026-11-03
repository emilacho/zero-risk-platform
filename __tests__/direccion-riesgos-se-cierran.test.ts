/**
 * Un riesgo de n8n se cierra cuando su fuente dice que ya está bien (CC2 · 03-nov · encargo «riesgos resueltos siguen abiertos»). US$ 0, sin red.
 */
import { describe, expect, it, vi } from 'vitest'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'
import { leerRiesgos } from '../src/lib/direccion/riesgos'

vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => null }))

const AHORA = new Date('2026-11-03T21:00:00Z')
const ENV = { N8N_BASE_URL: 'https://n8n.test', N8N_API_KEY: 'x' }
const fallo = (flujo: string, hora: string) => ({ id: hora, workflowId: flujo, startedAt: hora })

function n8n(opciones: { errores: unknown[]; sanas?: unknown[]; activo?: Record<string, boolean> }) {
  return vi.fn(async (u: string | URL | Request) => {
    const url = String(u)
    if (url.includes('status=error')) return new Response(JSON.stringify({ data: opciones.errores }), { status: 200 })
    if (url.includes('status=success')) return new Response(JSON.stringify({ data: opciones.sanas ?? [] }), { status: 200 })
    const m = /\/workflows\/([^/?]+)/.exec(url)
    if (m) return new Response(JSON.stringify({ id: m[1], active: opciones.activo?.[m[1]] ?? true }), { status: 200 })
    return new Response('{}', { status: 404 })
  }) as unknown as typeof fetch
}
const leer = (fetchImpl: typeof fetch) => leerRiesgos({ db: new DbFalsa() as never, ahora: () => AHORA, env: ENV, fetchImpl })
const ids = (r: Awaited<ReturnType<typeof leer>>) => (r as { riesgos: Array<{ id: string }> }).riesgos.map((x) => x.id)

describe('riesgos de n8n que se cierran solos', () => {
  const errores = [fallo('wfA', '2026-11-03T17:00:00Z'), fallo('wfB', '2026-11-03T18:00:00Z')]
  it('un proceso apagado a propósito deja de ser un riesgo abierto; el activo sigue', async () => {
    const r = await leer(n8n({ errores, activo: { wfA: false } }))
    expect(ids(r)).not.toContain('n8n:wfA')
    expect(ids(r)).toContain('n8n:wfB')
  })
  it('una corrida sana POSTERIOR a la última falla lo cierra; una sana anterior no', async () => {
    const r = await leer(n8n({ errores, sanas: [{ id: 's1', workflowId: 'wfA', startedAt: '2026-11-03T19:00:00Z' }, { id: 's2', workflowId: 'wfB', startedAt: '2026-11-03T12:00:00Z' }] }))
    expect(ids(r)).not.toContain('n8n:wfA')
    expect(ids(r)).toContain('n8n:wfB')
  })
  it('si n8n no deja saber (workflow o ejecuciones sanas sin respuesta) la falla se sigue mostrando', async () => {
    const f = vi.fn(async (u: string | URL | Request) => String(u).includes('status=error') ? new Response(JSON.stringify({ data: errores }), { status: 200 }) : new Response('', { status: 503 })) as unknown as typeof fetch
    const r = await leer(f)
    expect(ids(r)).toEqual(expect.arrayContaining(['n8n:wfA', 'n8n:wfB']))
  })
  it('solo lee: ninguna llamada a n8n usa un método que escribe', async () => {
    const f = n8n({ errores })
    await leer(f)
    for (const [, init] of (f as unknown as { mock: { calls: Array<[unknown, RequestInit | undefined]> } }).mock.calls) expect(init?.method ?? 'GET').toBe('GET')
  })
})
