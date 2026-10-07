/** PASO 7 · la ruta `recibir` exige la llave interna: sin ella 401 y nada se ejecuta. */
import { describe, expect, it } from 'vitest'
import { POST } from '@/app/api/brain/portero/recibir/route'

describe('POST /api/brain/portero/recibir', () => {
  it('sin la llave interna → 401 (no lee el cuerpo, no toca la base ni el modelo)', async () => {
    const r = await POST(new Request('http://localhost/api/brain/portero/recibir', { method: 'POST', body: JSON.stringify({ cliente: 'x' }) }))
    expect(r.status).toBe(401)
    expect((await r.json()).code).toBe('E-AUTH-001')
  })
  it('con una llave equivocada → 401', async () => {
    const r = await POST(new Request('http://localhost/api/brain/portero/recibir', { method: 'POST', headers: { 'x-api-key': 'no-es' }, body: '{}' }))
    expect(r.status).toBe(401)
  })
})
