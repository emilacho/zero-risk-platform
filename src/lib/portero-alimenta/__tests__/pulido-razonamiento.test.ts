/**
 * El pulido es redacción: se le pide razonamiento acotado (`thinking_mode: low`) para que no pase el plazo ni el tope pensando de más (19-oct: 120–236 s y US$ 0,25–0,36). US$ 0 · sin red.
 */
import { describe, expect, it } from 'vitest'
import { agenteDelRoster } from '../entorno'
import { RAZONAMIENTO_DEL_PULIDO } from '../datos'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const base = { origen: 'https://x.test', llaveInterna: 'k', workflowId: 'w', ejecucionId: 'e', clientId: 'c', agente: 'reporting_agent', topeUsd: 0.3 }
const cuerpoDe = async (extra: Record<string, unknown> = {}) => {
  let visto: Record<string, unknown> = {}
  const f = agenteDelRoster({ ...base, ...extra, fetchImpl: async (_u, i) => { visto = JSON.parse(String(i?.body)); return new Response(JSON.stringify({ response: 'x', cost_usd: 0.1 }), { status: 200 }) } })
  await f('tarea')
  return visto
}

describe('razonamiento del pulido', () => {
  it('el agente del roster manda thinking_mode solo si se lo piden; sin pedirlo, el pedido queda como siempre', async () => {
    expect((await cuerpoDe({ razonamiento: 'low' })).thinking_mode).toBe('low')
    expect('thinking_mode' in (await cuerpoDe())).toBe(false)
  })
  it('el pulido lo pide acotado (low) y lo hace la ruta del pulido, no otra', () => {
    expect(RAZONAMIENTO_DEL_PULIDO).toBe('low')
    const ruta = readFileSync(join(process.cwd(), 'src/app/api/brain/alimentar/pulir/route.ts'), 'utf8')
    expect(ruta).toMatch(/razonamiento: RAZONAMIENTO_DEL_PULIDO/)
    // las demás rutas que usan al agente del roster no cambian de comportamiento
    for (const otra of ['src/lib/portero-alimenta/alimentar.ts']) expect(readFileSync(join(process.cwd(), otra), 'utf8')).not.toMatch(/razonamiento:/)
  })
})
