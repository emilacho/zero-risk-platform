/**
 * Los botones de Slack (Aprobar / Rechazar) deciden la pieza por `PATCH /api/hitl/[id]`. En la prueba viva del 29-oct esa llamada recibía 400 siempre
 * (el cuerpo traía `decision: {origen}` y el contrato `hitl-action` la define como texto de una lista): ningún clic de Slack decidió nunca nada. US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import { validateObject } from '@/lib/input-validator'
import { puertosDeNotas } from '../adaptadores'

const cuerpoQueSeEnvia = async (d: { status: 'approved' | 'rejected'; frase: string | null }) => {
  let enviado: Record<string, unknown> = {}
  const f = (async (_u: string, init: RequestInit) => { enviado = JSON.parse(String(init.body)); return new Response('{}', { status: 200 }) }) as unknown as typeof fetch
  const P = puertosDeNotas({ from: () => ({}) } as never, { baseUrl: 'https://t.test', internalKey: 'k', slackToken: undefined, alCerebro: false }, f)
  const r = await P.decidir('22222222-2222-4222-8222-222222222222', { ...d, reviewer: 'slack:U1' })
  return { r, enviado }
}

describe('decidir desde Slack cumple el contrato de PATCH /api/hitl/[id]', () => {
  it.each([['approved', null], ['rejected', 'Muy formal para la gente de planta']] as const)('%s: el cuerpo pasa la validación del contrato hitl-action', async (status, frase) => {
    const { r, enviado } = await cuerpoQueSeEnvia({ status, frase })
    expect(r).toEqual({ ok: true })
    const v = validateObject<Record<string, unknown>>(enviado, 'hitl-action')
    expect(v.ok, JSON.stringify(enviado)).toBe(true)
    expect(enviado).toMatchObject({ status, reviewer: 'slack:U1' })
    expect(enviado.decision).toBeUndefined()
    if (frase) expect(enviado.frase_del_aprobador).toBe(frase)
  })
})
