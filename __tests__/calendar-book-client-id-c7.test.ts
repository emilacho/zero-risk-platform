/**
 * C7 · la reunión de arranque tiene que quedar ATADA al cliente.
 *
 * ── EL ROJO ───────────────────────────────────────────────────────────────
 * Contra el estado de HOY estas dos afirmaciones tienen que FALLAR:
 *   1. «una reserva SIN `client_id` en el cuerpo, con `contact_name` que
 *      coincide exactamente con una ficha, queda atada a esa ficha»
 *      → hoy: `client_id: body.client_id ?? null` ⇒ NULL.
 *   2. «el título de la reunión sirve para atarla cuando no hay contact_name»
 *      → hoy: NULL.
 *
 * ── EL CONTROL POSITIVO ───────────────────────────────────────────────────
 * «cuando el cuerpo SÍ trae `client_id`, se usa tal cual» tiene que dar VERDE
 * hoy y después. Si diera rojo hoy, el instrumento está roto y ningún rojo vale.
 *
 * ── EL CASO REAL QUE LO ORIGINA ───────────────────────────────────────────
 * Corrida real GoEuropeAdventure · 2026-09-01 20:29 UTC · fila `0f26f698` ·
 * reserva REAL en Cal.com `pRSJHjKFKPqYEj8GSXaViE`, `client_id` NULL. El caso
 * 4 replica el cuerpo EXACTO que mandó el flujo `wu1DUAXIuEG5nNTX`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  buildClientNameCandidates,
  clientNameFromEventTitle,
  resolveCalendarClientId,
} from '../src/lib/calendar-client-resolver'

// ─── mock de Supabase · insert (reserva) + select/eq/ilike/limit (lookup) ───
let clientRowsByName: Record<string, Array<{ id: string }>> = {}
let lookupShouldFail = false

// 2026-09-03 · la ruta escribe en DOS tablas: la reserva y el intento (una fila por
// llamada a Cal.com). Se anota la tabla de cada insert para que las afirmaciones
// sigan mirando la fila de la RESERVA.
const filasInsertadas: Array<{ tabla: string; fila: Record<string, unknown> }> = []
let tablaEnCurso = ''
const insertChain = {
  insert: vi.fn((fila: Record<string, unknown>) => {
    filasInsertadas.push({ tabla: tablaEnCurso, fila })
    return insertChain
  }),
  select: vi.fn().mockReturnThis(),
  single: vi.fn(),
}
/** La fila que se mandó a `calendar_bookings`, ignorando las de intentos. */
type FilaDeReserva = Record<string, unknown> & {
  metadata: { client_id_resolution: { source: string } }
}
const filaDeLaReserva = () =>
  filasInsertadas.find((f) => f.tabla === 'calendar_bookings')?.fila as FilaDeReserva

function clientsQuery() {
  const state: { name?: string } = {}
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn((_col: string, val: string) => {
      state.name = val
      return chain
    }),
    ilike: vi.fn((_col: string, val: string) => {
      state.name = val
      return chain
    }),
    limit: vi.fn(async () => {
      if (lookupShouldFail) return { data: null, error: { message: 'boom' } }
      const key = (state.name ?? '').toLowerCase()
      const hit = Object.entries(clientRowsByName).find(([k]) => k.toLowerCase() === key)
      return { data: hit ? hit[1] : [], error: null }
    }),
  }
  return chain
}

const supabaseMock = {
  from: vi.fn((table: string) => {
    tablaEnCurso = table
    return table === 'clients' ? clientsQuery() : insertChain
  }),
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => supabaseMock,
}))

const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  filasInsertadas.length = 0
  clientRowsByName = {}
  lookupShouldFail = false
  process.env.INTERNAL_API_KEY = 'test-internal-key'
  process.env.CALCOM_API_KEY = 'cal_live_test'
  process.env.CALCOM_EVENT_TYPE_ID = '6157933'
  global.fetch = fetchMock as unknown as typeof fetch
  supabaseMock.from.mockImplementation((table: string) => {
    tablaEnCurso = table
    return table === 'clients' ? clientsQuery() : insertChain
  })
  insertChain.insert.mockImplementation((fila: Record<string, unknown>) => {
    filasInsertadas.push({ tabla: tablaEnCurso, fila })
    return insertChain
  })
  insertChain.select.mockReturnThis()
  insertChain.single.mockResolvedValue({ data: { id: 'row-uuid' }, error: null })
})

afterEach(() => {
  delete process.env.CALCOM_API_KEY
  delete process.env.CALCOM_EVENT_TYPE_ID
  vi.restoreAllMocks()
})

async function loadRoute() {
  vi.resetModules()
  return await import('../src/app/api/calendar/book/route')
}

function req(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/calendar/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': 'test-internal-key' },
    body: JSON.stringify(body),
  })
}

function calOk() {
  return Promise.resolve({
    ok: true,
    status: 201,
    json: async () => ({
      status: 'success',
      data: {
        uid: 'pRSJHjKFKPqYEj8GSXaViE',
        status: 'accepted',
        start: '2026-09-04T20:29:16.000Z',
        end: '2026-09-04T20:59:16.000Z',
        meetingUrl: 'https://app.cal.com/video/pRSJHjKFKPqYEj8GSXaViE',
      },
    }),
  } as unknown as Response)
}

const GOEURO = '534362db-29d9-4c7d-9b88-95d1ba89fb7b'

describe('C7 · el título de la reunión (función pura · sin base)', () => {
  it('saca el nombre de los prefijos medidos en producción', () => {
    expect(clientNameFromEventTitle('Kickoff Call: GoEuropeAdventure')).toBe('GoEuropeAdventure')
    expect(clientNameFromEventTitle('Kickoff Call entre Zero Risk y GoEuropeAdventure')).toBe(
      'GoEuropeAdventure',
    )
    expect(clientNameFromEventTitle('Llamada de arranque con el cliente Peniche Surf Escape')).toBe(
      'Peniche Surf Escape',
    )
  })

  it('NO inventa un nombre cuando el título tiene forma desconocida', () => {
    expect(clientNameFromEventTitle('Reunión trimestral')).toBeNull()
    expect(clientNameFromEventTitle('Kickoff Call:')).toBeNull()
    expect(clientNameFromEventTitle('')).toBeNull()
    expect(clientNameFromEventTitle(null)).toBeNull()
  })

  it('los candidatos van en orden de confianza y sin repetidos', () => {
    expect(
      buildClientNameCandidates({
        contact_name: 'GoEuropeAdventure',
        event_title: 'Kickoff Call: GoEuropeAdventure',
      }),
    ).toEqual([{ name: 'GoEuropeAdventure', source: 'contact_name' }])

    expect(
      buildClientNameCandidates({ contact_name: '  ', event_title: 'Kickoff Call: Náufrago' }),
    ).toEqual([{ name: 'Náufrago', source: 'event_title' }])
  })
})

describe('C7 · resolver aislado', () => {
  it('el cuerpo manda · con client_id NO consulta la base', async () => {
    const spy = vi.fn()
    const r = await resolveCalendarClientId(
      { from: spy } as never,
      { client_id: GOEURO, contact_name: 'Otro Nombre' },
    )
    expect(r).toEqual({ client_id: GOEURO, source: 'body', candidates_tried: [], ambiguous: false })
    expect(spy).not.toHaveBeenCalled()
  })

  it('dos fichas con el mismo nombre ⇒ NULL + ambiguous · nunca elige', async () => {
    clientRowsByName = { 'Peniche Surf Escape': [{ id: 'e388a370' }, { id: '53b05ecb' }] }
    const r = await resolveCalendarClientId(supabaseMock as never, {
      contact_name: 'Peniche Surf Escape',
    })
    expect(r.client_id).toBeNull()
    expect(r.ambiguous).toBe(true)
    expect(r.source).toBe('none')
  })

  it('un fallo de consulta NO lanza · devuelve none (§148 fail-open)', async () => {
    lookupShouldFail = true
    const r = await resolveCalendarClientId(supabaseMock as never, {
      contact_name: 'GoEuropeAdventure',
    })
    expect(r.client_id).toBeNull()
    expect(r.source).toBe('none')
    expect(r.detail).toMatch(/fail-open/)
  })
})

describe('C7 · POST /api/calendar/book · la reserva queda atada', () => {
  it('🔴 ROJO 1 · sin client_id en el cuerpo, contact_name ata la reserva', async () => {
    clientRowsByName = { GoEuropeAdventure: [{ id: GOEURO }] }
    fetchMock.mockReturnValueOnce(calOk())
    const { POST } = await loadRoute()
    const res = await POST(
      req({
        contact_email: 'emilacho@hotmail.com',
        contact_name: 'GoEuropeAdventure',
        event_title: 'Kickoff Call: GoEuropeAdventure',
        scheduled_at: '2026-09-04T20:29:16.000Z',
      }),
    )
    expect(res.status).toBe(200)
    const inserted = filaDeLaReserva()
    expect(inserted.client_id).toBe(GOEURO)
    expect(inserted.metadata.client_id_resolution.source).toBe('contact_name')
  })

  it('🔴 ROJO 2 · sin contact_name, el título de la reunión la ata', async () => {
    clientRowsByName = { GoEuropeAdventure: [{ id: GOEURO }] }
    fetchMock.mockReturnValueOnce(calOk())
    const { POST } = await loadRoute()
    const res = await POST(
      req({
        contact_email: 'emilacho@hotmail.com',
        event_title: 'Kickoff Call entre Zero Risk y GoEuropeAdventure',
        scheduled_at: '2026-09-04T20:29:16.000Z',
      }),
    )
    expect(res.status).toBe(200)
    const inserted = filaDeLaReserva()
    expect(inserted.client_id).toBe(GOEURO)
    expect(inserted.metadata.client_id_resolution.source).toBe('event_title')
  })

  // 🟢 CONTROL POSITIVO · tiene que dar VERDE **hoy y después**. Sólo afirma lo
  // que ya es cierto sin el arreglo: cuando el cuerpo trae `client_id`, la fila
  // sale atada. Si esto diera rojo hoy, el instrumento está roto y los dos rojos
  // de arriba no valdrían nada. Por eso NO toca `metadata.client_id_resolution`,
  // que es campo nuevo — eso se afirma en el caso 4, que es rojo a propósito.
  it('🟢 CONTROL POSITIVO · con client_id en el cuerpo se usa tal cual', async () => {
    fetchMock.mockReturnValueOnce(calOk())
    const { POST } = await loadRoute()
    const res = await POST(
      req({
        client_id: 'client-1',
        contact_email: 'lead@example.com',
        contact_name: 'Lead Uno',
        event_title: 'Kickoff',
        scheduled_at: '2026-09-04T20:29:16.000Z',
      }),
    )
    expect(res.status).toBe(200)
    const inserted = filaDeLaReserva()
    expect(inserted.client_id).toBe('client-1')
    expect(inserted.provider).toBe('cal_com')
  })

  it('🟢 CONTROL POSITIVO 2 · el camino que ya funciona no se toca · nada nuevo se afirma', async () => {
    clientRowsByName = {}
    fetchMock.mockReturnValueOnce(calOk())
    const { POST } = await loadRoute()
    const res = await POST(
      req({
        client_id: 'client-1',
        contact_email: 'lead@example.com',
        scheduled_at: '2026-09-04T20:29:16.000Z',
      }),
    )
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.mode).toBe('cal-com-cloud')
    expect(json.cal).toEqual({ uid: 'pRSJHjKFKPqYEj8GSXaViE', status: 'accepted' })
  })

  it('4 · el cuerpo EXACTO de la corrida real del 01-sep queda atado', async () => {
    clientRowsByName = { GoEuropeAdventure: [{ id: GOEURO }] }
    fetchMock.mockReturnValueOnce(calOk())
    const { POST } = await loadRoute()
    // Copia literal de lo que arma el nodo "Schedule Kickoff Call (Cal.com)"
    // en wu1DUAXIuEG5nNTX · exec 118859 · sin `client_id`, como en producción.
    const res = await POST(
      req({
        contact_id: 'stub-contact-1788999999999',
        event_title: 'Kickoff Call: GoEuropeAdventure',
        contact_email: 'emilacho@hotmail.com',
        contact_name: 'GoEuropeAdventure',
        duration_minutes: 60,
        scheduled_at: '2026-09-04T20:29:16.000Z',
        description: 'Welcome to Zero Risk! Success plan alignment + team intro.',
      }),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.client_id_resolution.client_id).toBe(GOEURO)
    const inserted = filaDeLaReserva()
    expect(inserted.client_id).toBe(GOEURO)
    // la reserva en Cal.com no cambia · sigue siendo la misma llamada de hoy
    expect(inserted.provider).toBe('cal_com')
    expect(inserted.provider_booking_id).toBe('pRSJHjKFKPqYEj8GSXaViE')
  })

  it('5 · nombre desconocido ⇒ NULL · la reserva se persiste igual (no rompe)', async () => {
    clientRowsByName = {}
    fetchMock.mockReturnValueOnce(calOk())
    const { POST } = await loadRoute()
    const res = await POST(
      req({
        contact_email: 'emilacho@hotmail.com',
        contact_name: 'Cliente Que No Existe',
        scheduled_at: '2026-09-04T20:29:16.000Z',
      }),
    )
    expect(res.status).toBe(200)
    const inserted = filaDeLaReserva()
    expect(inserted.client_id).toBeNull()
    expect(inserted.provider_booking_id).toBe('pRSJHjKFKPqYEj8GSXaViE')
  })

  it('6 · un fallo de la consulta NO rompe la reserva · queda NULL como hoy', async () => {
    lookupShouldFail = true
    fetchMock.mockReturnValueOnce(calOk())
    const { POST } = await loadRoute()
    const res = await POST(
      req({
        contact_email: 'emilacho@hotmail.com',
        contact_name: 'GoEuropeAdventure',
        scheduled_at: '2026-09-04T20:29:16.000Z',
      }),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    const inserted = filaDeLaReserva()
    expect(inserted.client_id).toBeNull()
  })
})
