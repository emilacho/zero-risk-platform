/**
 * La llamada real al modelo y el registrador, con `fetch` SIMULADO (no se hace ninguna llamada de verdad).
 * Escritas para matar una mutación que sobrevivió: sin `signal`, el límite de 25 s no se hacía cumplir.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { llamarAlModelo } from '../modelo'
import { crearRegistrador } from '../registro'
import { SinLlave, type PeticionAlModelo } from '../razonar'

const peticion = (timeoutMs = 25_000): PeticionAlModelo => ({
  model: 'claude-sonnet-5-5', max_tokens: 1500, thinking: { type: 'between_tools' }, system: 'instrucción', messages: [{ role: 'user', content: 'pedido y lista' }], timeoutMs,
})

describe('llamarAlModelo', () => {
  const original = process.env.CLAUDE_API_KEY
  beforeEach(() => { process.env.CLAUDE_API_KEY = 'llave-secreta-de-prueba' })
  afterEach(() => { vi.unstubAllGlobals(); if (original === undefined) delete process.env.CLAUDE_API_KEY; else process.env.CLAUDE_API_KEY = original })

  it('hace UNA petición POST al destino único, con la llave en el encabezado y el cuerpo exacto, sin temperatura', async () => {
    const f = vi.fn(async (_u: unknown, _i?: RequestInit) => new Response(JSON.stringify({ content: [{ type: 'text', text: '{"entregar":[1]}' }], usage: { input_tokens: 7000, output_tokens: 600 } }), { status: 200 }))
    vi.stubGlobal('fetch', f)
    const r = await llamarAlModelo(peticion())
    expect(r).toEqual({ texto: '{"entregar":[1]}', usage: { input_tokens: 7000, output_tokens: 600 } })
    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('llave-secreta-de-prueba')
    expect((init.headers as Record<string, string>)['anthropic-version']).toBe('2023-06-01')
    const cuerpo = JSON.parse(String(init.body))
    expect(cuerpo).toEqual({ model: 'claude-sonnet-5-5', max_tokens: 1500, thinking: { type: 'between_tools' }, system: 'instrucción', messages: [{ role: 'user', content: 'pedido y lista' }] })
    expect(cuerpo).not.toHaveProperty('temperature')
  })

  it('junta solo los bloques de texto (el razonamiento no es la respuesta)', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ content: [{ type: 'thinking', thinking: 'x', text: 'NO ES LA RESPUESTA' }, { type: 'text', text: 'a' }, { type: 'text', text: 'b' }], usage: {} }), { status: 200 }))
    expect((await llamarAlModelo(peticion())).texto).toBe('ab')
  })

  it('el límite de tiempo SE HACE CUMPLIR: la petición lleva su señal y, vencido el plazo, se corta con AbortError', async () => {
    const f = vi.fn((_u: unknown, init?: RequestInit) => new Promise<Response>((_ok, no) => {
      expect(init?.signal, 'la petición no lleva señal de corte').toBeDefined()
      init?.signal?.addEventListener('abort', () => no(Object.assign(new Error('abortado'), { name: 'AbortError' })))
    }))
    vi.stubGlobal('fetch', f)
    await expect(llamarAlModelo(peticion(30))).rejects.toMatchObject({ name: 'AbortError' })
    expect(f).toHaveBeenCalledTimes(1) // sin reintentos
  })

  it('sin llave: SinLlave y no sale ninguna petición', async () => {
    delete process.env.CLAUDE_API_KEY
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    await expect(llamarAlModelo(peticion())).rejects.toBeInstanceOf(SinLlave)
    expect(f).not.toHaveBeenCalled()
  })

  it('un error del modelo se informa sin reintentar y SIN mostrar la llave', async () => {
    const f = vi.fn(async () => new Response('{"error":"sobrecargado"}', { status: 529 }))
    vi.stubGlobal('fetch', f)
    const e = await llamarAlModelo(peticion()).catch((x: Error) => x)
    expect(e).toBeInstanceOf(Error)
    expect((e as Error).message).toMatch(/529/)
    expect((e as Error).message).not.toContain('llave-secreta-de-prueba')
    expect(f).toHaveBeenCalledTimes(1)
  })
})

describe('crearRegistrador', () => {
  it('hace POST a log-invocation con la llave interna y el cuerpo tal cual', async () => {
    const f = vi.fn(async (_u: string, _i?: RequestInit) => new Response('{}', { status: 200 }))
    const r = await crearRegistrador({ origen: 'https://app.example/', llaveInterna: 'interna', fetchImpl: f })({ workflow_id: 'w', agent_name: 'portero-del-cerebro' })
    expect(r).toEqual({ ok: true })
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://app.example/api/agents/log-invocation')
    expect(init?.method).toBe('POST')
    expect((init?.headers as Record<string, string>)['x-api-key']).toBe('interna')
    expect(JSON.parse(String(init?.body))).toEqual({ workflow_id: 'w', agent_name: 'portero-del-cerebro' })
  })
  it('un estado de error o una caída de red vuelve como {ok:false} con su motivo; nunca revienta', async () => {
    expect(await crearRegistrador({ origen: 'https://x', llaveInterna: 'k', fetchImpl: async () => new Response('', { status: 403 }) })({})).toEqual({ ok: false, detalle: 'log-invocation respondió 403' })
    const r = await crearRegistrador({ origen: 'https://x', llaveInterna: 'k', fetchImpl: async () => { throw new Error('sin red') } })({})
    expect(r).toEqual({ ok: false, detalle: 'sin red' })
  })
})
