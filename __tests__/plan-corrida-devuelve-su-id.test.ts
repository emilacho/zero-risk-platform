/** 04-nov · la ruta de la corrida del plan devuelve `corrida_id` = `plan_corridas.id` cuando la respuesta trae la fila (firma de Lenovo: abrir y correr). */
import { describe, expect, it, vi } from 'vitest'

const fila = { id: 'uuid-1', client_id: 'c', corrida: 'r', estado: 'esperando', espera_desde: '2026-11-04T10:00:00Z', vence_en: '2026-11-04T11:00:00Z', intentos: 0, motivo: null, dry_run: true, actualizado_en: '2026-11-04T10:00:00Z' }
vi.mock('@/lib/finanzas/ruta', () => ({ checkInternalKey: () => ({ ok: true }) }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({}) }))
vi.mock('@/lib/planeacion/corridas-supabase', () => ({
  almacenDeCorridas: () => ({
    ahora: () => new Date('2026-11-04T10:00:00Z'),
    leer: async (_c: string, corrida: string) => (corrida === 'r' ? fila : null),
    activaDe: async () => fila,
    avanzarSi: async () => ({ ...fila, estado: 'corriendo' }),
  }),
}))
import { POST } from '@/app/api/planeacion/corrida/route'

const pide = (b: Record<string, unknown>) => POST(new Request('https://x.test/api/planeacion/corrida', { method: 'POST', body: JSON.stringify(b) }))

describe('la ruta de la corrida', () => {
  it('🔴 `abrir` y `correr` devuelven el id', async () => {
    const a = await pide({ accion: 'abrir', client_id: 'c', corrida: 'r', dry_run: true })
    expect((await a.json()).corrida_id).toBe('uuid-1')
    const c = await pide({ accion: 'correr', client_id: 'c', corrida: 'r' })
    expect((await c.json()).corrida_id).toBe('uuid-1')
  })
  it('🔴 sin fila no inventa uno, ni se lo da de otra corrida', async () => {
    const r = await pide({ accion: 'abrir', client_id: 'c', corrida: 'otra', dry_run: true })
    expect(r.status).toBe(409)
    expect(await r.json()).not.toHaveProperty('corrida_id')
  })
})
