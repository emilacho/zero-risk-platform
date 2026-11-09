/**
 * 06-nov · 🟡 de CC7 sobre #939: si el dueño contesta por el buzón una pregunta que ya estaba cerrada
 * (p. ej. la contestó en Tu oficina), su palabra igual llega al cerebro: el buzón reintenta SIN la fila.
 */
import { describe, expect, it } from 'vitest'
import { cerebroDelDueno } from '../src/lib/buzon-dueno/cerebro-dueno'

const C = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const PID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function fetchFalso(primera: { status: number; error: string }) {
  const llamadas: Array<Record<string, unknown>> = []
  const f = async (_url: string, init?: { body?: string }) => {
    const cuerpo = JSON.parse(init?.body ?? '{}') as Record<string, unknown>
    llamadas.push(cuerpo)
    const r = llamadas.length === 1 ? { status: primera.status, j: { ok: false, error: primera.error } } : { status: 200, j: { ok: true, guardada: true, preguntas_cerradas: 0 } }
    return { status: r.status, json: async () => r.j } as unknown as Response
  }
  return { f, llamadas }
}

const RESP = { client_id: C, pregunta_id: PID, tema: 'costos fijos', pregunta: '¿cuánto pagas al mes?', respuesta: 'US$ 2.800', decidido_por: 'Emilio' }

describe('buzón · respuesta a una pregunta ya cerrada', () => {
  for (const [status, error] of [[409, 'ya_cerrada'], [404, 'pregunta_inexistente']] as const) {
    it(`${status} ${error}: reintenta sin \`pregunta_id\` y la respuesta llega al cerebro`, async () => {
      const k = fetchFalso({ status, error })
      const c = cerebroDelDueno({ base: 'https://x.test', llave: 'k', workflow_id: 'wf', workflow_execution_id: 'e1', fetch: k.f as never })
      expect(await c.registrarRespuesta(RESP as never)).toEqual({ ok: true })
      expect(k.llamadas).toHaveLength(2)
      expect(k.llamadas[0]).toMatchObject({ accion: 'responder', pregunta_id: PID })
      expect(k.llamadas[1]).toMatchObject({ accion: 'responder', respuesta: 'US$ 2.800', pregunta: '¿cuánto pagas al mes?' })
      expect(k.llamadas[1]).not.toHaveProperty('pregunta_id')
    })
  }
  it('409 con `guardada_en_cerebro: true` (otro cerró la fila después de guardar): es «ok» y NO se reintenta (no se duplica)', async () => {
    const llamadas: unknown[] = []
    const f = async (_u: string, init?: { body?: string }) => { llamadas.push(JSON.parse(init?.body ?? '{}')); return { status: 409, json: async () => ({ ok: false, error: 'ya_cerrada', guardada_en_cerebro: true, ficha_ref: 'f1' }) } as unknown as Response }
    const c = cerebroDelDueno({ base: 'https://x.test', llave: 'k', workflow_id: 'wf', workflow_execution_id: 'e1', fetch: f as never })
    expect(await c.registrarRespuesta(RESP as never)).toEqual({ ok: true })
    expect(llamadas).toHaveLength(1)
  })
  it('otro error (502) no se reintenta ni se lee como «ok»', async () => {
    const k = fetchFalso({ status: 502, error: 'cerebro_caido' })
    const c = cerebroDelDueno({ base: 'https://x.test', llave: 'k', workflow_id: 'wf', workflow_execution_id: 'e1', fetch: k.f as never })
    expect((await c.registrarRespuesta(RESP as never)).ok).toBe(false)
    expect(k.llamadas).toHaveLength(1)
  })
})
