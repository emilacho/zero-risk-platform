/**
 * Tests · el 409 de Cal.com · la puerta escucha la FAMILIA y el aviso LEE el resultado.
 *
 * 🔴 EL ROJO · medido en producción el 2026-09-03 (hallazgo
 * `raw/findings/2026-09-03-CC1-el-409-de-Calcom-y-el-aviso-falso.md`):
 *
 *   corrida 121013 · 10:25:19Z · alta de GOEUROPEADVENTURE
 *     Cal.com respondió  409 · ConflictException
 *       "User either already has booking at this time or is not available"
 *     el rescate NO corrió · la puerta sólo escucha `=== 400` (route.ts:215)
 *     10:25:34Z · se emitió «fase de agenda COMPLETADA» · 9 s después del rechazo
 *     reservas creadas: 0 · la corrida quedó marcada `success`
 *
 * La frase del 409 es IDÉNTICA a la que el propio código atribuye al 400
 * (`route.ts:192-199`, arreglo del 05-jul). Misma condición, otra etiqueta:
 * por eso la puerta tiene que escuchar «me rechazaron ese horario», no un número.
 *
 * NO toca producción · el flujo vivo se lee de un RETRATO CONGELADO · sin red.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
// Los flujos · retrato congelado (VIVO) vs el construido
// ─────────────────────────────────────────────────────────────────────────────
type Flujo = {
  nodes: Array<{ name: string; type: string; onError?: string; parameters: Record<string, unknown> }>
  connections: Record<string, { main?: Array<Array<{ node: string }> | null> }>
}
const leer = (carpeta: string, f: string) =>
  JSON.parse(readFileSync(join(process.cwd(), 'scripts/worker-staging', carpeta, f), 'utf8')) as Flujo

const SEGUNDA_HOY = leer('wu1DUAXIuEG5nNTX', 'segunda-fase-VIVO-2026-09-03.json')
const SEGUNDA = leer('wu1DUAXIuEG5nNTX', 'segunda-fase-construida.json')
const ALTA_HOY = leer('LyVoKcrypS5uLyuu', 'alta-VIVO-2026-09-03.json')
const ALTA = leer('LyVoKcrypS5uLyuu', 'alta-construida.json')

const RESERVA = 'Schedule Kickoff Call (Cal.com)'
const AVISO = '[MODELB] Phase-boundary Emit · kickoff_scheduled'

const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)
const cuerpo = (f: Flujo, n: string) =>
  String((nodo(f, n)?.parameters as { jsonBody?: string } | undefined)?.jsonBody ?? '')

/** El aviso de agenda tiene que decidir su estado con el resultado de la reserva. */
function avisoHonesto(f: Flujo) {
  const b = cuerpo(f, AVISO)
  expect(b, `falta el cuerpo de ${AVISO}`).toBeTruthy()
  // (1) tiene que LEER el nodo que reserva · hoy no lo nombra siquiera
  expect(b, 'el aviso no lee el resultado de la reserva').toContain(RESERVA)
  // (2) no puede afirmar «completada» como literal fijo
  expect(
    /"phase_state"\s*:\s*"completed"/.test(b),
    'el aviso afirma «completada» sin condición · se emite aunque la reserva falle',
  ).toBe(false)
  // (3) los dos estados tienen que estar contemplados
  expect(b, 'el aviso no contempla el caso de que la reserva NO se haya hecho').toMatch(/started/)
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 ROJO · hoy la fase se marca completada aunque Cal.com haya rechazado
// ─────────────────────────────────────────────────────────────────────────────
describe('🔴 ROJO · hoy el aviso de agenda no mira si se reservó', () => {
  it('hoy falla · la segunda fase afirma «completada» sin leer la reserva', () => {
    expect(() => avisoHonesto(SEGUNDA_HOY)).toThrow()
  })
  it('hoy falla · el alta tiene el MISMO cableado', () => {
    expect(() => avisoHonesto(ALTA_HOY)).toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 🟢 VERDE · el aviso construido lee el resultado
// ─────────────────────────────────────────────────────────────────────────────
describe('🟢 el aviso de agenda dice la verdad', () => {
  it('segunda fase · el aviso lee la reserva y contempla los dos casos', () => avisoHonesto(SEGUNDA))
  it('alta · idem', () => avisoHonesto(ALTA))
})

describe('lo que NO debe romper · los dos flujos', () => {
  it('no se agrega ni se borra ningún nodo', () => {
    expect(SEGUNDA.nodes.length).toBe(SEGUNDA_HOY.nodes.length)
    expect(ALTA.nodes.length).toBe(ALTA_HOY.nodes.length)
  })
  it('el cableado queda igual · nadie cambia de padre', () => {
    expect(JSON.stringify(SEGUNDA.connections)).toBe(JSON.stringify(SEGUNDA_HOY.connections))
    expect(JSON.stringify(ALTA.connections)).toBe(JSON.stringify(ALTA_HOY.connections))
  })
  it('la reserva sigue sin matar la corrida · seguir-aunque-falle intacto', () => {
    expect(nodo(SEGUNDA, RESERVA)?.onError).toBe('continueRegularOutput')
    expect(nodo(ALTA, RESERVA)?.onError).toBe('continueRegularOutput')
  })
  it('el nodo que reserva no se toca', () => {
    expect(JSON.stringify(nodo(SEGUNDA, RESERVA)?.parameters)).toBe(
      JSON.stringify(nodo(SEGUNDA_HOY, RESERVA)?.parameters),
    )
    expect(JSON.stringify(nodo(ALTA, RESERVA)?.parameters)).toBe(
      JSON.stringify(nodo(ALTA_HOY, RESERVA)?.parameters),
    )
  })
  it('el aviso conserva el resto del contrato de entrada', () => {
    for (const f of [SEGUNDA, ALTA]) {
      const b = cuerpo(f, AVISO)
      expect(b).toContain('"event_type": "phase_boundary"')
      expect(b).toContain('SCHEDULING')
      expect(b).toContain('_sala_correlation_id')
      expect(b).toContain('_journey_id')
      expect(b).toContain('worker_id')
      expect(b).toContain('tenant_id')
    }
  })
  it('el aviso de Slack no se toca · nunca prometió una reunión', () => {
    expect(JSON.stringify(nodo(SEGUNDA, 'Alert Slack: Onboarding Initiated')?.parameters)).toBe(
      JSON.stringify(nodo(SEGUNDA_HOY, 'Alert Slack: Onboarding Initiated')?.parameters),
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// La puerta · familia, no un código
// ─────────────────────────────────────────────────────────────────────────────
const insertadas: Array<{ tabla: string; fila: Record<string, unknown> }> = []
const insertSingle = vi.fn()
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: (tabla: string) => ({
      insert: (fila: Record<string, unknown>) => {
        insertadas.push({ tabla, fila })
        return {
          select: () => ({ single: insertSingle }),
          then: (r: (v: { error: null }) => unknown) => r({ error: null }),
        }
      },
    }),
  }),
}))

const mod = await import('../src/app/api/calendar/book/route')
const { POST, esRechazoDeHorario } = mod as typeof mod & {
  esRechazoDeHorario?: (status: number, detail?: unknown) => boolean
}

const CONFLICTO = {
  code: 'ConflictException',
  message: 'User either already has booking at this time or is not available',
}
const req = (body: unknown) =>
  new Request('http://x/api/calendar/book', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': 'test-key' },
    body: JSON.stringify(body),
  })
const CUERPO = {
  client_id: 'a7ad4331-b7d6-48c8-8846-c53063495bd3',
  contact_email: 'cliente@ejemplo.com',
  contact_name: 'Cliente',
  scheduled_at: '2026-09-06T10:25:00.000Z',
}

const NO_AUTORIZADO = { code: 'UnauthorizedException', message: 'Invalid Access Token' }

/**
 * Simula Cal.com · 1er intento rechaza con `status`, /slots ofrece hueco, 2do reserva.
 * El CUERPO acompaña al código, como en la vida real: un 401 no dice «ya tiene reserva».
 */
function calcomQueRechazaCon(status: number, cuerpoError: unknown = CONFLICTO) {
  const llamadas: string[] = []
  const fake = vi.fn(async (url: unknown, init?: { method?: string }) => {
    const u = String(url)
    llamadas.push(`${init?.method ?? 'GET'} ${u.split('?')[0]}`)
    if (u.includes('/slots')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 'success', data: { '2026-09-08': [{ start: '2026-09-08T14:00:00.000Z' }] } }),
      }
    }
    // POST /bookings · el primero rechaza, el segundo (tras el hueco) acepta
    const yaRechazado = llamadas.filter((l) => l.endsWith('/bookings')).length > 1
    if (!yaRechazado) {
      return { ok: false, status, json: async () => ({ error: cuerpoError }) }
    }
    return {
      ok: true,
      status: 201,
      json: async () => ({
        status: 'success',
        data: { uid: 'uid-rescatado', status: 'accepted', start: '2026-09-08T14:00:00.000Z' },
      }),
    }
  })
  return { fake, llamadas }
}

beforeEach(() => {
  insertadas.length = 0
  insertSingle.mockReset()
  insertSingle.mockResolvedValue({ data: { id: 'fila-1' }, error: null })
  process.env.INTERNAL_API_KEY = 'test-key'
  process.env.CALCOM_API_KEY = 'llave-de-prueba'
  process.env.CALCOM_EVENT_TYPE_ID = '6157933'
  // sin campana en los casos que miden la puerta · el aviso se prueba aparte
  delete process.env.SLACK_WEBHOOK_URL_EQUIPO
})
afterEach(() => {
  delete process.env.INTERNAL_API_KEY
  delete process.env.CALCOM_API_KEY
  delete process.env.CALCOM_EVENT_TYPE_ID
  vi.unstubAllGlobals()
})

describe('🔴→🟢 la puerta escucha la familia, no un código', () => {
  it('409 · el rescate corre y la reserva sale en el próximo hueco', async () => {
    const { fake, llamadas } = calcomQueRechazaCon(409)
    vi.stubGlobal('fetch', fake)
    const res = await POST(req(CUERPO))
    const j = (await res.json()) as Record<string, unknown>
    expect(llamadas.some((l) => l.includes('/slots')), 'con 409 nunca se buscó el próximo hueco').toBe(true)
    expect(j.ok, 'con 409 la reserva se perdió · el rescate no corrió').toBe(true)
    expect(j.slot_adjusted).toBe(true)
  })

  it('400 · sigue rescatando igual que antes (no se rompe lo que andaba)', async () => {
    const { fake, llamadas } = calcomQueRechazaCon(400)
    vi.stubGlobal('fetch', fake)
    const res = await POST(req(CUERPO))
    const j = (await res.json()) as Record<string, unknown>
    expect(llamadas.some((l) => l.includes('/slots'))).toBe(true)
    expect(j.ok).toBe(true)
  })

  it('401 · NO se rescata · otro horario no arregla una llave mala', async () => {
    const { fake, llamadas } = calcomQueRechazaCon(401, NO_AUTORIZADO)
    vi.stubGlobal('fetch', fake)
    const res = await POST(req(CUERPO))
    expect(llamadas.some((l) => l.includes('/slots')), 'buscó hueco ante un problema de credencial').toBe(false)
    expect(res.status).toBe(502)
  })

  it('la clasificación por familia · sin HTTP', () => {
    expect(typeof esRechazoDeHorario, 'no existe el clasificador de la familia').toBe('function')
    const f = esRechazoDeHorario as (s: number, d?: unknown) => boolean
    // la familia «ese horario no se puede reservar»
    expect(f(400, CONFLICTO)).toBe(true)
    expect(f(409, CONFLICTO)).toBe(true)
    expect(f(422, {})).toBe(true)
    // lo que NO es de la familia
    expect(f(401, {})).toBe(false)
    expect(f(403, {})).toBe(false)
    expect(f(404, {})).toBe(false)
    expect(f(429, {})).toBe(false)
    expect(f(500, {})).toBe(false)
    expect(f(502, {})).toBe(false)
    expect(f(0, {})).toBe(false)
    // la frase manda por encima del número · si Cal.com inventa otro código, igual se rescata
    expect(f(418, CONFLICTO), 'la frase de Cal.com no se tiene en cuenta').toBe(true)
  })
})

describe('🔴→🟢 cada intento deja su código escrito', () => {
  it('el rechazo y el rescate quedan registrados con su código', async () => {
    const { fake } = calcomQueRechazaCon(409)
    vi.stubGlobal('fetch', fake)
    await POST(req(CUERPO))
    const intentos = insertadas.filter((i) => i.tabla === 'calendar_booking_attempts')
    expect(intentos.length, 'ningún intento quedó registrado · la pregunta «desde cuándo» sigue sin respuesta').toBe(2)
    expect(intentos[0].fila.upstream_status).toBe(409)
    expect(intentos[0].fila.outcome).toBe('rechazado')
    expect(String(intentos[0].fila.upstream_message)).toContain('already has booking')
    expect(intentos[1].fila.outcome).toBe('reservado')
    expect(intentos[1].fila.rescatado).toBe(true)
    expect(intentos[0].fila.client_id).toBe(CUERPO.client_id)
  })

  it('el registro del intento NUNCA rompe la reserva', async () => {
    const { fake } = calcomQueRechazaCon(409)
    vi.stubGlobal('fetch', fake)
    insertSingle.mockResolvedValue({ data: { id: 'fila-1' }, error: null })
    const res = await POST(req(CUERPO))
    expect((await res.json()).ok).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// La expresión del aviso · se EVALÚA con los dos resultados posibles
// (certifica la lógica · no el evaluador de n8n, que sólo corre al publicar)
// ─────────────────────────────────────────────────────────────────────────────
describe('la expresión del aviso decide bien en los dos casos', () => {
  /** Saca la expresión `{{ … }}` del valor de phase_state del cuerpo del aviso. */
  const expresionDe = (f: Flujo) => {
    const b = cuerpo(f, AVISO)
    const m = b.match(/"phase_state":\s*"\{\{([\s\S]*?)\}\}"/)
    expect(m, 'no se encontró la expresión de phase_state').toBeTruthy()
    return (m as RegExpMatchArray)[1]
  }
  /** Evalúa la expresión con un `$()` de mentira que devuelve la respuesta dada. */
  const evaluar = (expr: string, respuesta: unknown) =>
    new Function('$', `return (${expr})`)(() => ({ item: { json: respuesta } })) as string

  for (const [nombre, f] of [['segunda fase', SEGUNDA], ['alta', ALTA]] as const) {
    it(`${nombre} · reserva real ⇒ completed`, () => {
      expect(evaluar(expresionDe(f), { ok: true, booking: { id: 'fila-1' }, cal: { uid: 'u1' } })).toBe('completed')
    })
    it(`${nombre} · rechazo 409 (el ítem de error de n8n) ⇒ started`, () => {
      expect(evaluar(expresionDe(f), { error: { message: '502 - cal_com_upstream_failed 409' } })).toBe('started')
    })
    it(`${nombre} · respuesta ok:false ⇒ started`, () => {
      expect(evaluar(expresionDe(f), { ok: false, error: 'cal_com_upstream_failed', upstream_status: 409 })).toBe('started')
    })
    it(`${nombre} · reserva sin fila (503 tabla ausente) ⇒ started`, () => {
      expect(evaluar(expresionDe(f), { ok: false, cal: { uid: 'u1' } })).toBe('started')
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// 🔴→🟢 que el ATASCO suene · pedido de Emilio al firmar (03-sep)
// ─────────────────────────────────────────────────────────────────────────────
import { avisarAtascoDeAgenda, construirMensajeAgenda } from '../src/lib/calendar/aviso-agenda'

describe('la agenda atascada toca la campana de #equipo', () => {
  it('el mensaje dice qué pasó, con quién y que la fase queda EN CURSO', () => {
    const { text } = construirMensajeAgenda({
      motivo: 'sin_hueco',
      client_id: 'a7ad4331-b7d6-48c8-8846-c53063495bd3',
      contact_email: 'cliente@ejemplo.com',
      requested_start: '2026-09-06T10:25:00.000Z',
      upstream_status: 409,
      upstream_code: 'ConflictException',
      upstream_message: 'User either already has booking at this time or is not available',
      se_busco_hueco: true,
    })
    expect(text).toContain('NO quedó agendada')
    expect(text).toContain('a7ad4331')
    expect(text).toContain('409')
    expect(text).toContain('ConflictException')
    expect(text).toContain('en curso')
    expect(text).toContain('próximo hueco libre')
  })

  it('sin campana configurada NO se inventa un canal · y no rompe', async () => {
    const r = await avisarAtascoDeAgenda({
      motivo: 'proveedor_inalcanzable',
      client_id: null,
      contact_email: 'x@y.z',
      requested_start: '2026-09-06T10:25:00.000Z',
      upstream_status: 0,
      se_busco_hueco: false,
      webhookUrl: undefined,
    })
    expect(r.avisado).toBe(false)
    expect(r.razon).toBe('sin_campana')
  })

  it('si el envío falla, se declara · NUNCA lanza', async () => {
    const rompe = vi.fn(async () => { throw new Error('red caída') })
    const r = await avisarAtascoDeAgenda({
      motivo: 'sin_hueco',
      client_id: 'c1',
      contact_email: 'x@y.z',
      requested_start: '2026-09-06T10:25:00.000Z',
      upstream_status: 409,
      se_busco_hueco: true,
      webhookUrl: 'https://hooks.slack.test/equipo',
      fetchImpl: rompe as unknown as typeof fetch,
    })
    expect(r).toEqual({ avisado: false, razon: 'excepcion' })
  })

  it('cuando el rescate TAMPOCO consigue hueco · la campana suena de verdad', async () => {
    const campana: string[] = []
    const fake = vi.fn(async (url: unknown, init?: { method?: string; body?: string }) => {
      const u = String(url)
      if (u.includes('hooks.slack')) {
        campana.push(String(init?.body ?? ''))
        return { ok: true, status: 200, json: async () => ({}) }
      }
      if (u.includes('/slots')) return { ok: true, status: 200, json: async () => ({ status: 'success', data: {} }) }
      return { ok: false, status: 409, json: async () => ({ error: CONFLICTO }) }
    })
    vi.stubGlobal('fetch', fake)
    process.env.SLACK_WEBHOOK_URL_EQUIPO = 'https://hooks.slack.test/equipo'
    const res = await POST(req(CUERPO))
    expect(res.status).toBe(502)
    expect(campana.length, 'la agenda se atascó y nadie tocó la campana').toBe(1)
    expect(campana[0]).toContain('NO qued')
    expect(campana[0]).toContain('409')
    delete process.env.SLACK_WEBHOOK_URL_EQUIPO
  })

  it('cuando la reserva SÍ sale, la campana NO suena', async () => {
    const campana: string[] = []
    const { fake } = calcomQueRechazaCon(409)
    const conCampana = vi.fn(async (url: unknown, init?: { method?: string; body?: string }) => {
      if (String(url).includes('hooks.slack')) { campana.push(String(init?.body ?? '')); return { ok: true, status: 200, json: async () => ({}) } }
      return fake(url, init)
    })
    vi.stubGlobal('fetch', conCampana)
    process.env.SLACK_WEBHOOK_URL_EQUIPO = 'https://hooks.slack.test/equipo'
    const res = await POST(req(CUERPO))
    expect((await res.json()).ok).toBe(true)
    expect(campana.length, 'sonó la campana con la reserva hecha · ruido falso').toBe(0)
    delete process.env.SLACK_WEBHOOK_URL_EQUIPO
  })
})
