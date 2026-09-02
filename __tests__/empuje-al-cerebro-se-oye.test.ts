/**
 * Que el fallo del empuje al cerebro SE OIGA.
 *
 * ── EL ROJO ───────────────────────────────────────────────────────────────
 * Contra el estado de HOY (que YA tiene el empuje, mergeado en #331) estas
 * afirmaciones tienen que FALLAR:
 *   1. «si la puerta del cerebro rechaza el manual, suena la campana de #equipo»
 *      → hoy: sólo un `console.warn` que no mira nadie.
 *   2. «si no se puede llegar a la puerta, suena la campana»
 *      → hoy: otro `console.warn`.
 *   3. «si falta la llave, suena la campana»
 *      → hoy: se devuelve `sin_configurar` en un recibo que el nodo de n8n que
 *        lo consume NO lee. Silencio absoluto, para TODOS los manuales.
 *
 * ── EL CONTROL POSITIVO ───────────────────────────────────────────────────
 * Verdes hoy y después · si alguno fallara hoy, el instrumento estaría roto:
 *   · cuando el empuje sale bien, NO suena nada
 *   · el empuje sigue sin lanzar nunca
 *   · el empuje sigue sin esperar
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { empujarManualAlCerebro } from '../src/lib/brain/push-al-terminar'
import { avisarFalloDelEmpuje, construirMensaje } from '../src/lib/brain/empuje-alerta'

const CLIENT = '534362db-29d9-4c7d-9b88-95d1ba89fb7b'
const FILA = '5648b126-7b0c-4cb1-b5b4-90a3165c864f'
const WEBHOOK = 'https://hooks.slack.com/services/TEST/EQUIPO'
const PUERTA = 'https://zero-risk-platform.vercel.app/api/brain/reembed-source-row'

const agendadas: Promise<unknown>[] = []
const agendar = (p: Promise<unknown>) => { agendadas.push(p) }
let fetchMock: ReturnType<typeof vi.fn>

/** Sólo las llamadas a la campana de Slack. */
const campanadas = () => fetchMock.mock.calls.filter(c => String(c[0]).includes('hooks.slack.com'))
/** Sólo las llamadas a la puerta del cerebro. */
const toques = () => fetchMock.mock.calls.filter(c => String(c[0]).includes('reembed-source-row'))

beforeEach(() => {
  vi.clearAllMocks()
  agendadas.length = 0
  process.env.INTERNAL_API_KEY = 'test-internal-key'
  process.env.ZERO_RISK_API_URL = 'https://zero-risk-platform.vercel.app'
  process.env.SLACK_WEBHOOK_URL_EQUIPO = WEBHOOK
  delete process.env.BRAIN_PUSH_AL_TERMINAR
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  fetchMock = vi.fn(async (url: string) =>
    String(url).includes('hooks.slack.com')
      ? ({ ok: true, status: 200, text: async () => 'ok' } as unknown as Response)
      : ({ ok: true, status: 200, text: async () => '{"ok":true,"chunks_upserted":3}' } as unknown as Response),
  )
  global.fetch = fetchMock as unknown as typeof fetch
})
afterEach(() => { vi.restoreAllMocks() })

describe('el mensaje · función pura', () => {
  it('dice qué se rompió, para quién, y que el manual SÍ está guardado', () => {
    const m = construirMensaje({ motivo: 'puerta_no_2xx', client_id: CLIENT, source_id: FILA, status: 500, detalle: 'boom' })
    expect(m.text).toContain('El manual no entró al cerebro')
    expect(m.text).toContain('534362db')
    expect(m.text).toContain('5648b126')
    expect(m.text).toContain('500')
    expect(m.text).toContain('el manual *sí* quedó guardado')
    expect(m.text).toContain('barrido diario')
  })

  it('sin campana configurada NO lanza · lo declara', async () => {
    delete process.env.SLACK_WEBHOOK_URL_EQUIPO
    const r = await avisarFalloDelEmpuje({ motivo: 'puerta_inalcanzable', client_id: CLIENT, source_id: FILA })
    expect(r).toEqual({ avisado: false, razon: 'sin_campana' })
  })

  it('si la campana misma falla, NO lanza', async () => {
    const f = vi.fn().mockRejectedValue(new Error('slack caído'))
    const r = await avisarFalloDelEmpuje({ motivo: 'puerta_no_2xx', client_id: CLIENT, source_id: FILA, fetchImpl: f as never, webhookUrl: WEBHOOK })
    expect(r).toEqual({ avisado: false, razon: 'excepcion' })
  })
})

describe('el empuje al cerebro · cuando falla, se oye', () => {
  it('🔴 ROJO 1 · la puerta rechaza el manual ⇒ suena la campana', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('hooks.slack.com')
        ? ({ ok: true, status: 200, text: async () => 'ok' } as unknown as Response)
        : ({ ok: false, status: 500, text: async () => 'boom en la puerta' } as unknown as Response))
    empujarManualAlCerebro({ client_id: CLIENT, source_id: FILA, fetchImpl: fetchMock as never, agendar })
    await Promise.all(agendadas)
    expect(campanadas()).toHaveLength(1)
    const cuerpo = JSON.parse(String(campanadas()[0][1].body))
    expect(cuerpo.text).toContain('El manual no entró al cerebro')
    expect(cuerpo.text).toContain('500')
  })

  it('🔴 ROJO 2 · no se llega a la puerta ⇒ suena la campana', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('hooks.slack.com')) return { ok: true, status: 200, text: async () => 'ok' } as unknown as Response
      throw new Error('ECONNREFUSED')
    })
    empujarManualAlCerebro({ client_id: CLIENT, source_id: FILA, fetchImpl: fetchMock as never, agendar })
    await Promise.all(agendadas)
    expect(campanadas()).toHaveLength(1)
    expect(JSON.parse(String(campanadas()[0][1].body)).text).toContain('ECONNREFUSED')
  })

  it('🔴 ROJO 3 · falta la llave ⇒ suena la campana (el fallo más silencioso)', async () => {
    delete process.env.INTERNAL_API_KEY
    const r = empujarManualAlCerebro({ client_id: CLIENT, source_id: FILA, fetchImpl: fetchMock as never, agendar })
    expect(r.estado).toBe('sin_configurar')
    await new Promise(res => setTimeout(res, 0))
    expect(campanadas()).toHaveLength(1)
    expect(JSON.parse(String(campanadas()[0][1].body)).text).toContain('no llegó a intentarse')
    expect(toques()).toHaveLength(0)
  })

  // 🟢 CONTROLES POSITIVOS · verdes hoy y después
  it('🟢 cuando el empuje sale bien, NO suena nada', async () => {
    empujarManualAlCerebro({ client_id: CLIENT, source_id: FILA, fetchImpl: fetchMock as never, agendar })
    await Promise.all(agendadas)
    expect(toques()).toHaveLength(1)
    expect(campanadas()).toHaveLength(0)
  })

  it('🟢 el empuje sigue sin lanzar aunque la puerta Y la campana fallen', async () => {
    fetchMock.mockRejectedValue(new Error('todo caído'))
    const r = empujarManualAlCerebro({ client_id: CLIENT, source_id: FILA, fetchImpl: fetchMock as never, agendar })
    expect(r.estado).toBe('agendado')
    await expect(Promise.all(agendadas)).resolves.toBeDefined()
  })

  it('🟢 el empuje sigue sin esperar · devuelve antes de tocar la puerta', () => {
    let resolver: (v: unknown) => void = () => {}
    fetchMock.mockImplementation(() => new Promise(r => { resolver = r }))
    const r = empujarManualAlCerebro({ client_id: CLIENT, source_id: FILA, fetchImpl: fetchMock as never, agendar })
    expect(r.estado).toBe('agendado')   // si esperara, esto no llegaría
    resolver({ ok: true, status: 200, text: async () => '{}' })
  })

  it('🟢 apagado por env · ni empuja ni suena', async () => {
    process.env.BRAIN_PUSH_AL_TERMINAR = 'false'
    const r = empujarManualAlCerebro({ client_id: CLIENT, source_id: FILA, fetchImpl: fetchMock as never, agendar })
    expect(r.estado).toBe('apagado')
    await Promise.all(agendadas)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
