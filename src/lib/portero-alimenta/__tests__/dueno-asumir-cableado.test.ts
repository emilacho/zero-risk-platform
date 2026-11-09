/**
 * PUERTA DEL DUEÑO · el cableado (adenda 06-nov): la ruta web conecta la alarma para los eventos retirados, la lectura ya no pasa filtros de preguntas,
 * y la respuesta del portero que razona acepta el estado «supuesto_aceptado_por_dueno». US$ 0 · sin red: la base y la puerta están simuladas.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { validarRespuesta } from '../../cerebro/conversacion'

const recibido: Record<string, unknown> = {}
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ from: () => { throw new Error('la prueba no lee la base') } }) }))
vi.mock('@/lib/portero-alimenta/alertas', () => ({ avisarPorIncidente: () => async (texto: string, clave: string) => { recibido.alarma = { texto, clave } } }))
vi.mock('@/lib/portero-alimenta/dueno', () => ({
  rutaLeerDueno: vi.fn(async (_deps: unknown, params: Record<string, unknown>) => { recibido.params = params; return { status: 200, body: { ok: true } } }),
  rutaDueno: vi.fn(async (deps: { avisarIncidente?: (t: string, c: string) => Promise<unknown> }) => { await deps.avisarIncidente?.('prueba', 'clave'); return { status: 410, body: { error: 'evento_retirado' } } }),
}))

describe('ruta /api/brain/alimentar/dueno', () => {
  beforeEach(() => { process.env.INTERNAL_API_KEY = 'llave-de-prueba'; process.env.PORTERO_DUENO = 'on'; delete recibido.params; delete recibido.alarma })
  it('POST entrega a la puerta la alarma real (la de incidentes), para avisar si alguien llama a un evento retirado', async () => {
    const { POST } = await import('../../../app/api/brain/alimentar/dueno/route')
    const r = await POST(new Request('https://x.example/api/brain/alimentar/dueno', { method: 'POST', headers: { 'x-api-key': 'llave-de-prueba', 'content-type': 'application/json' }, body: JSON.stringify({ evento: 'pregunta', dry_run: true }) }))
    expect(r.status).toBe(410)
    expect(recibido.alarma).toEqual({ texto: 'prueba', clave: 'clave' })
  })
  it('GET pasa solo los filtros de respuestas (ya no hay filtros de preguntas)', async () => {
    const { GET } = await import('../../../app/api/brain/alimentar/dueno/route')
    const r = await GET(new Request('https://x.example/api/brain/alimentar/dueno?client_id=c&limite=30&asumidas=1&encargo=e', { headers: { 'x-api-key': 'llave-de-prueba' } }))
    expect(r.status).toBe(200)
    expect(recibido.params).toEqual({ client_id: 'c', tema: null, sede_clave: null, canal: null, limite: '30' })
  })
})

describe('la respuesta del portero que razona acepta el estado «supuesto_aceptado_por_dueno»', () => {
  it('un material con ese estado es válido (sin él, el portero descartaría la respuesta)', () => {
    const r = validarRespuesta({ modo: 'conversado', material: [{ ref: 'cerebro_fichas:x', estado: 'supuesto_aceptado_por_dueno', fecha_fuente: null, vencido: false, texto: 't' }], lo_que_no_te_di: [], indice: [], faltantes: [], lectura: {}, errores_de_lectura: [] })
    expect(r).toEqual({ ok: true })
  })
})
