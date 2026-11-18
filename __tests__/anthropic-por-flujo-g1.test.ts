/** 18-nov · G1 «nada se recorta» (CC5): las llamadas directas sin SDK van al techo del modelo y por flujo continuo */
import { describe, expect, it } from 'vitest'
import { leerFlujo, pedirMensajePorFlujo, techoDeRespuestaDelModelo } from '@/lib/anthropic-por-flujo'
import { techoDeSalidaDelModelo } from '../services/agent-runner/src/lib/forced-emit-messages'

const SSE = [
  'event: message_start',
  'data: {"type":"message_start","message":{"usage":{"input_tokens":120,"output_tokens":1}}}',
  '',
  'event: content_block_start',
  'data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"pienso"}}',
  'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"{\\"a\\":"}}',
  'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"1}"}}',
  'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":345}}',
  'data: {"type":"message_stop"}',
].join('\n')

describe('anthropic-por-flujo', () => {
  it('el techo es el máximo de cada modelo · igual que el de la salida forzada del corredor', () => {
    for (const m of ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5-20251001', 'claude-sonnet-4-5', 'claude-opus-4-1']) {
      expect(techoDeRespuestaDelModelo(m), m).toBe(techoDeSalidaDelModelo(m))
    }
    expect(techoDeRespuestaDelModelo('claude-opus-5-5')).toBe(128000)
    expect(techoDeRespuestaDelModelo('claude-haiku-4-5-20251001')).toBe(64000)
  })
  it('junta solo el texto del flujo (no el pensamiento) y los tokens', () => {
    expect(leerFlujo(SSE)).toEqual({ text: '{"a":1}', inputTokens: 120, outputTokens: 345, stopReason: 'end_turn' })
  })
  it('un error dentro del flujo no se traga: lanza', () => {
    expect(() => leerFlujo('data: {"type":"error","error":{"type":"overloaded_error","message":"x"}}')).toThrow(/overloaded_error/)
  })
  it('pide stream:true con el techo del modelo y lee el flujo', async () => {
    let cuerpo: Record<string, unknown> = {}
    const fetchFn = (async (_u: string, init: { body: string }) => {
      cuerpo = JSON.parse(init.body)
      return new Response(SSE, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }) as unknown as typeof fetch
    const r = await pedirMensajePorFlujo({ apiKey: 'k', model: 'claude-opus-5-5', system: 's', userMessage: 'u', fetchFn })
    expect(cuerpo).toMatchObject({ stream: true, max_tokens: 128000, model: 'claude-opus-5-5' })
    expect(r.text).toBe('{"a":1}')
  })
  it('si la respuesta llega como JSON, toma el bloque de texto aunque el primero sea pensamiento (antes leía content[0] y daba «{}»)', async () => {
    const fetchFn = (async () => new Response(JSON.stringify({ content: [{ type: 'thinking', thinking: 'x' }, { type: 'text', text: 'hola' }], usage: { input_tokens: 3, output_tokens: 4 } }), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch
    expect(await pedirMensajePorFlujo({ apiKey: 'k', model: 'claude-sonnet-4-6', system: 's', userMessage: 'u', fetchFn })).toMatchObject({ text: 'hola', inputTokens: 3, outputTokens: 4 })
  })
  it('un error HTTP lanza con el estado', async () => {
    const fetchFn = (async () => new Response('caído', { status: 529 })) as unknown as typeof fetch
    await expect(pedirMensajePorFlujo({ apiKey: 'k', model: 'claude-opus-5-5', system: 's', userMessage: 'u', fetchFn })).rejects.toThrow(/529/)
  })
})
