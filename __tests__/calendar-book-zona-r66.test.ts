/**
 * r66 · agnóstico · la zona horaria de una reserva es del CLIENTE (ficha o país), no de un país fijo.
 * Orden: config.timezone de la ficha → zona del país de la ficha (si tiene una sola) → la que mande la reserva → UTC (neutra). Nunca un país.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { codigoDePais, zonaDelPais, zonaDeReserva } from '../src/lib/pais/pais-del-cliente'

let ficha: Record<string, unknown> | null = null
const mock = {
  from: vi.fn((t: string) => {
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = () => q
    q.limit = () => Promise.resolve({ data: t === 'clients' && ficha ? [ficha] : [], error: null })
    q.insert = () => q
    q.single = () => Promise.resolve({ data: { id: 'r', provider: 'cal_com', provider_booking_id: 'u' }, error: null })
    return q
  }),
}
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => mock }))
const fetchMock = vi.fn()
beforeEach(() => {
  vi.clearAllMocks(); ficha = null
  process.env.INTERNAL_API_KEY = 'k'; process.env.CALCOM_API_KEY = 'c'; process.env.CALCOM_EVENT_TYPE_ID = '1'
  global.fetch = fetchMock as unknown as typeof fetch
  fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ status: 'success', data: { uid: 'u', status: 'accepted', start: '2026-06-30T07:00:00.000Z' } }) } as unknown as Response)
})
afterEach(() => { delete process.env.CALCOM_API_KEY; delete process.env.CALCOM_EVENT_TYPE_ID })
async function reservar(extra: Record<string, unknown>) {
  vi.resetModules()
  const { POST } = await import('../src/app/api/calendar/book/route')
  const res = await POST(new Request('http://x/api/calendar/book', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'k' }, body: JSON.stringify({ contact_email: 'a@b.test', scheduled_at: '2026-06-30T07:00:00.000Z', client_id: 'c1', ...extra }) }))
  const enviado = JSON.parse(fetchMock.mock.calls.at(-1)![1].body)
  return { zona: enviado.attendee.timeZone as string, json: await res.json() }
}

describe('la zona horaria de la reserva', () => {
  it('rojo de hoy: sin ficha ni zona en la reserva NO cae a un país fijo (antes: America/Guayaquil)', async () => {
    const r = await reservar({})
    expect(r.zona).toBe('UTC'); expect(r.json.time_zone).toEqual({ zona: 'UTC', origen: 'neutra_utc' })
  })
  it('la ficha manda: config.timezone; luego la zona del país de la ficha; la reserva solo si la ficha no dice', async () => {
    ficha = { country: 'Colombia', config: { timezone: 'America/Mexico_City' } }
    expect((await reservar({ time_zone: 'Europe/Madrid' })).zona).toBe('America/Mexico_City')
    ficha = { country: 'Colombia', config: {} }
    const p = await reservar({ time_zone: 'Europe/Madrid' }); expect(p.zona).toBe('America/Bogota'); expect(p.json.time_zone.origen).toBe('pais_de_la_ficha')
    ficha = { country: 'México', config: {} } // varias zonas: el país NO decide
    const m = await reservar({ time_zone: 'America/Monterrey' }); expect(m.zona).toBe('America/Monterrey'); expect(m.json.time_zone.origen).toBe('reserva')
  })
  it('un cliente de OTRO país reserva en SU hora, no en la de la agencia', async () => {
    ficha = { country: 'Perú', config: {} }
    expect((await reservar({})).zona).toBe('America/Lima')
  })
  it('si la ficha no se puede leer (error de la base) no rompe la reserva: cae a la reserva / UTC', async () => {
    mock.from.mockImplementationOnce(() => { throw new Error('base caída') })
    expect((await reservar({ time_zone: 'Asia/Tokyo' })).zona).toBe('Asia/Tokyo')
  })
})

describe('el país del cliente (dato)', () => {
  it('nombres y códigos, con tildes y mayúsculas', () => {
    expect(codigoDePais(' PERÚ ')).toBe('PE'); expect(codigoDePais('ec')).toBe('EC'); expect(codigoDePais('Atlantis')).toBeNull(); expect(codigoDePais(null)).toBeNull()
  })
  it('solo los países de UNA zona dan zona; los de varias o desconocidos, no', () => {
    expect(zonaDelPais('Colombia')).toBe('America/Bogota'); expect(zonaDelPais('Chile')).toBeNull(); expect(zonaDelPais('Brasil')).toBeNull(); expect(zonaDelPais('x')).toBeNull()
    expect(zonaDeReserva(null, undefined)).toEqual({ zona: 'UTC', origen: 'neutra_utc' })
  })
})
