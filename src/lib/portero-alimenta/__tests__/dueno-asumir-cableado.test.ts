/**
 * ASUMIR · el cableado (06-nov): la ruta web pasa los filtros de «supuestos elegidos» a la lectura, y la respuesta del portero que razona acepta el estado nuevo.
 * US$ 0 · sin red: la base y la lectura están simuladas.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { validarRespuesta } from '../../cerebro/conversacion'

const recibido: Record<string, unknown> = {}
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ from: () => { throw new Error('la prueba no lee la base') } }) }))
vi.mock('@/lib/portero-alimenta/dueno', () => ({
  rutaLeerDueno: vi.fn(async (_deps: unknown, params: Record<string, unknown>) => { recibido.params = params; return { status: 200, body: { ok: true } } }),
  rutaDueno: vi.fn(async () => ({ status: 200, body: { ok: true } })),
}))

describe('GET /api/brain/alimentar/dueno pasa los filtros de los supuestos elegidos', () => {
  beforeEach(() => { process.env.INTERNAL_API_KEY = 'llave-de-prueba'; process.env.PORTERO_DUENO = 'on'; delete recibido.params })
  it('asumidas, encargo y pregunta_ids llegan a la lectura', async () => {
    const { GET } = await import('../../../app/api/brain/alimentar/dueno/route')
    const r = await GET(new Request('https://x.example/api/brain/alimentar/dueno?client_id=c&asumidas=1&encargo=ex-plan-1&pregunta_ids=a,b', { headers: { 'x-api-key': 'llave-de-prueba' } }))
    expect(r.status).toBe(200)
    expect(recibido.params).toMatchObject({ client_id: 'c', asumidas: '1', encargo: 'ex-plan-1', pregunta_ids: 'a,b' })
  })
})

describe('la respuesta del portero que razona acepta el estado «supuesto_aceptado_por_dueno»', () => {
  it('un material con ese estado es válido (sin él, el portero descartaría la respuesta)', () => {
    const r = validarRespuesta({ modo: 'conversado', material: [{ ref: 'cerebro_fichas:x', estado: 'supuesto_aceptado_por_dueno', fecha_fuente: null, vencido: false, texto: 't' }], lo_que_no_te_di: [], indice: [], faltantes: [], lectura: {}, errores_de_lectura: [] })
    expect(r).toEqual({ ok: true })
  })
})
