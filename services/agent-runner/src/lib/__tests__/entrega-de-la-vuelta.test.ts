/**
 * ARQ 2026-09-30 · EL CORREDOR ENTREGA LA VUELTA · pruebas (CC#1 · quien construye no certifica).
 *
 * 🔴 Lo que se demuestra, no se describe:
 *   ③ un `callback_url` que NO es de nuestro n8n ⇒ el corredor NO llama (se cuenta contra un servidor real), y lo dice
 *   ④ n8n recibe UNA vuelta (no dos) y con el marcador de quién la entregó
 *   ② el trabajo corto se comporta igual: la misma vuelta, el libro cerrado
 *   y la regla del libro: NO se cierra en verde lo que nadie recibió (lo verá el reconciliador)
 * ① («cruza la pared de 800 s») no se prueba acá: es la prueba del rojo con espera real de ~15 min contra producción.
 */
import { describe, it, expect, vi } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  validarDireccionDeVuelta,
  entregarLaVuelta,
  cuerpoDeLaVuelta,
  esperaForzadaMs,
  hostsPermitidos,
  HOST_N8N_POR_DEFECTO,
  ESPERA_FORZADA_MAX_MS,
} from '../entrega-de-la-vuelta'
import { correrYEntregar } from '../correr-y-entregar'

const ENV = {} as Record<string, string | undefined>
const N8N = `https://${HOST_N8N_POR_DEFECTO}/webhook-waiting/157555?signature=abc`

describe('🔴 ③ la guardia: sólo se llama a NUESTRO n8n', () => {
  it('acepta la dirección de reanudación de nuestro n8n', () => {
    const r = validarDireccionDeVuelta(N8N, ENV)
    expect(r.ok).toBe(true)
  })
  it.each([
    ['otro host', 'https://evil.example.com/webhook-waiting/1?signature=x'],
    ['host que CONTIENE el nuestro (sufijo engañoso)', `https://${HOST_N8N_POR_DEFECTO}.evil.com/webhook-waiting/1`],
    ['host nuestro como usuario (userinfo)', `https://${HOST_N8N_POR_DEFECTO}@evil.com/webhook-waiting/1`],
    ['http en claro', `http://${HOST_N8N_POR_DEFECTO}/webhook-waiting/1`],
    ['usuario/clave en la dirección', `https://user:pw@${HOST_N8N_POR_DEFECTO}/webhook-waiting/1`],
    ['IP interna', 'https://169.254.169.254/webhook-waiting/1'],
    ['localhost', 'https://localhost/webhook-waiting/1'],
    ['nuestro host pero otra ruta (no es reanudación)', `https://${HOST_N8N_POR_DEFECTO}/rest/workflows`],
    ['nuestro host, webhook de producción (no es una espera)', `https://${HOST_N8N_POR_DEFECTO}/webhook/zero-risk/algo`],
    ['no es una dirección', 'no-es-url'],
    ['vacía', ''],
  ])('RECHAZA · %s', (_n, url) => {
    const r = validarDireccionDeVuelta(url, ENV)
    expect(r.ok).toBe(false)
  })
  it('CALLBACK_ALLOWED_HOSTS y N8N_BASE_URL amplían la lista, una N8N_BASE_URL rota no', () => {
    expect(hostsPermitidos({ CALLBACK_ALLOWED_HOSTS: 'a.test, B.test' })).toEqual(expect.arrayContaining([HOST_N8N_POR_DEFECTO, 'a.test', 'b.test']))
    expect(hostsPermitidos({ N8N_BASE_URL: 'https://otro-n8n.test' })).toContain('otro-n8n.test')
    expect(hostsPermitidos({ N8N_BASE_URL: 'no-url' })).toEqual([HOST_N8N_POR_DEFECTO])
  })
})

/** un «n8n» de verdad · cuenta cuántas veces lo llaman y con qué */
function n8nDeMentira(respuestas: number[] = [200]) {
  const llamadas: Array<{ url: string; cuerpo: unknown; origen: string | undefined }> = []
  const srv = http.createServer((req, res) => {
    let b = ''
    req.on('data', (c) => (b += c))
    req.on('end', () => {
      llamadas.push({ url: req.url ?? '', cuerpo: JSON.parse(b || 'null'), origen: req.headers['x-zr-async-callback'] as string | undefined })
      res.statusCode = respuestas[Math.min(llamadas.length - 1, respuestas.length - 1)]
      res.end('{}')
    })
  })
  return new Promise<{ base: string; llamadas: typeof llamadas; cerrar: () => Promise<void> }>((resolve) =>
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as AddressInfo
      resolve({ base: `http://127.0.0.1:${port}`, llamadas, cerrar: () => new Promise((r) => srv.close(() => r())) })
    }),
  )
}
const sinEspera = async () => {}

describe('el POST de la vuelta', () => {
  it('🔴 ④ n8n recibe UNA vuelta, con el marcador de quién la entregó', async () => {
    const n8n = await n8nDeMentira([200])
    const r = await entregarLaVuelta({ url: new URL(`${n8n.base}/webhook-waiting/9?signature=z`), cuerpo: { success: true, x: 1 }, esperar: sinEspera })
    await n8n.cerrar()
    expect(r.ok).toBe(true)
    expect(n8n.llamadas).toHaveLength(1)
    expect(n8n.llamadas[0].origen).toBe('agent-runner')
    expect(n8n.llamadas[0].cuerpo).toEqual({ success: true, x: 1 })
  })
  it('reintenta sólo lo transitorio (5xx) y con tope de 3 · UNA vuelta si el 2º intento entra', async () => {
    const n8n = await n8nDeMentira([503, 200])
    const r = await entregarLaVuelta({ url: new URL(`${n8n.base}/webhook-waiting/9`), cuerpo: {}, esperar: sinEspera })
    await n8n.cerrar()
    expect(r.ok).toBe(true)
    expect(r.intentos.map((i) => i.status)).toEqual(['non_2xx', 'ok'])
  })
  it('tope de 3 intentos · 5xx permanente ⇒ falla con los 3 registrados (nunca reintento indefinido)', async () => {
    const n8n = await n8nDeMentira([500])
    const r = await entregarLaVuelta({ url: new URL(`${n8n.base}/webhook-waiting/9`), cuerpo: {}, esperar: sinEspera })
    await n8n.cerrar()
    expect(r.ok).toBe(false)
    expect(n8n.llamadas).toHaveLength(3)
  })
  it('un 4xx es definitivo: 409 (ya se reanudó) o 404 (la espera ya no existe) NO se reintenta ⇒ no hay vuelta doble', async () => {
    const n8n = await n8nDeMentira([409])
    const r = await entregarLaVuelta({ url: new URL(`${n8n.base}/webhook-waiting/9`), cuerpo: {}, esperar: sinEspera })
    await n8n.cerrar()
    expect(r.ok).toBe(false)
    expect(n8n.llamadas).toHaveLength(1)
    expect(r.intentos[0]).toMatchObject({ status: 'non_2xx', http_status_code: 409 })
  })
  it('red caída ⇒ fetch_threw en cada intento, 3 como tope', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const r = await entregarLaVuelta({ url: new URL(N8N), cuerpo: {}, fetcher, esperar: sinEspera })
    expect(r.ok).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(r.intentos.every((i) => i.status === 'fetch_threw')).toBe(true)
  })
  it('cada intento se informa (para agent_callback_attempts) y un registro que falla NO frena la entrega', async () => {
    const vistos: string[] = []
    const n8n = await n8nDeMentira([200])
    const r = await entregarLaVuelta({
      url: new URL(`${n8n.base}/webhook-waiting/9`), cuerpo: {}, esperar: sinEspera,
      alIntentar: (i) => { vistos.push(i.status); throw new Error('el registro se cayó') },
    })
    await n8n.cerrar()
    expect(r.ok).toBe(true)
    expect(vistos).toEqual(['ok'])
  })
})

describe('el cuerpo de la vuelta', () => {
  const ok = { success: true, response: 'hola', sessionId: 's1', model: 'm', inputTokens: 1, outputTokens: 2, costUsd: 0.5, durationMs: 9, brainEnrichment: { brain_hit: true } }
  it('éxito: mismos campos que la vuelta de Vercel + marca de quién entregó y la clave del despacho', () => {
    expect(cuerpoDeLaVuelta(ok, { agentName: 'campaign-brief-agent', dispatchKey: 'dispatch:W:a:1' })).toMatchObject({
      success: true, agent: 'campaign-brief-agent', response: 'hola', session_id: 's1', cost_usd: 0.5, duration_ms: 9,
      brain_enrichment: { brain_hit: true }, delivered_by: 'runner', dispatch_key: 'dispatch:W:a:1',
    })
  })
  it('🔴 un fallo viaja MARCADO success:false con su error (nunca un cuerpo que se parezca a un dato · E87)', () => {
    expect(cuerpoDeLaVuelta({ success: false, error: 'saldo agotado' }, { agentName: 'a', dispatchKey: null })).toEqual({
      success: false, agent: 'a', error: 'saldo agotado', error_kind: 'runner_run_failed', delivered_by: 'runner', dispatch_key: null,
    })
  })
})

describe('correrYEntregar · el trabajo en segundo plano', () => {
  const base = { url: new URL(N8N), agentName: 'campaign-brief-agent', dispatchKey: 'dispatch:W:a:1', dryRun: false }
  const okRes = { success: true, response: 'listo', costUsd: 0.3 }
  const mk = (over: Record<string, unknown> = {}) => {
    const cerrados: string[] = []
    const avisos: string[] = []
    const intentos: string[] = []
    const entregados: unknown[] = []
    const deps = {
      ejecutar: vi.fn().mockResolvedValue(okRes),
      entregar: vi.fn(async (_u: URL, cuerpo: unknown, al: (i: never) => void) => {
        entregados.push(cuerpo)
        const i = { attempt_number: 1, status: 'ok', http_status_code: 200, error_message: null, attempted_at: 'x' }
        al(i as never)
        return { ok: true, intentos: [i] } as never
      }),
      registrarIntento: (i: { status: string }) => intentos.push(i.status),
      cerrarDespacho: async (e: 'completed' | 'error') => { cerrados.push(e) },
      avisarFallo: (m: string) => avisos.push(m),
      ...over,
    }
    return { deps, cerrados, avisos, intentos, entregados }
  }
  it('② trabajo corto: corre, entrega UNA vuelta, registra el intento y cierra el libro en completed', async () => {
    const m = mk()
    const r = await correrYEntregar(base, m.deps as never)
    expect(r).toEqual({ entregada: true, estadoCerrado: 'completed' })
    expect(m.entregados).toHaveLength(1)
    expect(m.cerrados).toEqual(['completed'])
    expect(m.intentos).toEqual(['ok'])
    expect(m.avisos).toEqual([])
  })
  it('un fallo del empleado (saldo agotado…) se ENTREGA como error y el libro cierra en error', async () => {
    const m = mk({ ejecutar: vi.fn().mockResolvedValue({ success: false, error: 'credit balance too low' }) })
    const r = await correrYEntregar(base, m.deps as never)
    expect(r).toEqual({ entregada: true, estadoCerrado: 'error' })
    expect(m.entregados[0]).toMatchObject({ success: false, error: 'credit balance too low', error_kind: 'runner_run_failed' })
  })
  it('un empleado que LANZA una excepción también se entrega como error (n8n no se queda esperando)', async () => {
    const m = mk({ ejecutar: vi.fn().mockRejectedValue(new Error('boom')) })
    const r = await correrYEntregar(base, m.deps as never)
    expect(r.estadoCerrado).toBe('error')
    expect(m.entregados[0]).toMatchObject({ success: false, error: 'boom' })
  })
  it('🔴 si la vuelta NO se pudo entregar: NO se cierra el libro (huella «terminó y no entregó» para el reconciliador) y se avisa fuerte', async () => {
    const m = mk({ entregar: vi.fn().mockResolvedValue({ ok: false, intentos: [{ status: 'fetch_threw' }, { status: 'fetch_threw' }, { status: 'fetch_threw' }] }) })
    const r = await correrYEntregar(base, m.deps as never)
    expect(r).toEqual({ entregada: false, estadoCerrado: null })
    expect(m.cerrados).toEqual([])
    expect(m.avisos).toEqual(['runner_callback_all_retries_failed'])
  })
  it('el gancho de espera forzada sólo actúa con dry_run: en una corrida real NO retrasa NADA', async () => {
    const dormir = vi.fn().mockResolvedValue(undefined)
    await correrYEntregar({ ...base, dryRun: false, esperaForzada: 900_000 }, mk({ dormir }).deps as never)
    expect(dormir).not.toHaveBeenCalled()
    await correrYEntregar({ ...base, dryRun: true, esperaForzada: 900_000 }, mk({ dormir }).deps as never)
    expect(dormir).toHaveBeenCalledWith(900_000)
  })
  it('esperaForzadaMs: sólo dry_run · topa en 25 min · basura ⇒ 0', () => {
    expect(esperaForzadaMs(false, 5000)).toBe(0)
    expect(esperaForzadaMs(true, 5000)).toBe(5000)
    expect(esperaForzadaMs(true, 99_999_999)).toBe(ESPERA_FORZADA_MAX_MS)
    expect(esperaForzadaMs(true, 'abc')).toBe(0)
    expect(esperaForzadaMs(true, -5)).toBe(0)
    expect(esperaForzadaMs(true, undefined)).toBe(0)
  })
})
