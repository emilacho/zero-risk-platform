// 01-nov · firma de Emilio: el tope del pedido es el real. Por encima, un 400 gratis que dice el motivo; hasta el tope, pasa.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { TOPE_REAL_DEL_PEDIDO } from '@/lib/limites-de-tamano'

const insert = vi.fn(async () => ({ error: { message: 'la prueba termina aquí' } }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ from: () => ({ insert }) }) }))
vi.mock('@/lib/internal-auth', () => ({ checkInternalKey: () => ({ ok: true }) }))

import { POST } from '@/app/api/agents/pipeline/route'

const pedir = (task: string) => POST(new NextRequest('http://localhost/api/agents/pipeline', { method: 'POST', body: JSON.stringify({ task }) }))

describe('el tope del pedido en la ruta pipeline', () => {
  beforeEach(() => insert.mockClear())
  it('🔴 un carácter por encima del tope: 400 con el motivo y sin escribir nada', async () => {
    const r = await pedir('x'.repeat(TOPE_REAL_DEL_PEDIDO + 1))
    expect(r.status).toBe(400)
    expect(await r.json()).toMatchObject({ code: 'E-INPUT-TOO-LONG' })
    expect(insert).not.toHaveBeenCalled()
  })
  it('🔴 justo en el tope pasa la puerta', async () => {
    const r = await pedir('x'.repeat(TOPE_REAL_DEL_PEDIDO))
    expect(((await r.json()) as { code?: string }).code).not.toBe('E-INPUT-TOO-LONG')
    expect(insert).toHaveBeenCalledTimes(1)
  })
})
