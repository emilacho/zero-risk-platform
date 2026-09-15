/**
 * 🔴 E36 · LA PRUEBA EN ROJO · la casilla «qué es el negocio» sobrevive de punta a punta.
 *
 * CC#2 midió en E31 que el contrato del descubridor NO rechaza una casilla
 * desconocida: la BORRA EN SILENCIO y devuelve éxito. Las 78 pruebas que ya
 * existen sobre esta pieza no miran eso — ninguna. Ésta sí.
 *
 * El recorrido que se exige, entero:
 *   ① el esquema del EMISOR (agent-runner · zod)      no la borra
 *   ② el filtro de la PLATAFORMA (parse.ts)           la copia
 *   ③ el guardado                                     la escribe en la ficha
 *   ④ 🔴 el guarda: una casilla de verdad desconocida SÍ se borra
 *      (sin esto la prueba podría pasar por accidente y sería un espejo)
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import {
  validateDiscoveryShape,
  populateClientConfigFromDiscovery,
  type DiscoveryOutput,
} from '@/lib/discovery-output'

const require_ = createRequire(import.meta.url)
const { DISCOVERY_INPUT_SCHEMA } = require_(
  '../services/agent-runner/src/lib/mcp/discovery-output-server.js',
) as { DISCOVERY_INPUT_SCHEMA: Record<string, unknown> }
/** Tipo mínimo · `zod` no es dependencia de la raíz · sólo se usa `z.object().safeParse`. */
type ZodLike = {
  object: (shape: Record<string, unknown>) => {
    safeParse: (v: unknown) => { success: boolean; data?: unknown }
  }
}
const z = require_('../services/agent-runner/node_modules/zod') as ZodLike

const CLIENTE = 'a7ad4331-b7d6-48c8-8846-c53063495bd3'
const LA_RESPUESTA =
  'Plataforma de reservas: terceros (escuelas de esquí, empresas de parapente) prestan el servicio, ' +
  'el viajero paga la reserva en línea y el proveedor la confirma. Hay dos lados.'

/** Lo mismo que arma el SDK de MCP con un shape crudo · objectFromShape → z.object(). */
const esquemaDelEmisor = z.object(DISCOVERY_INPUT_SCHEMA)

const BASE = {
  client_id: CLIENTE,
  own_handles: { instagram: '@goeuropeadventure' },
  competitors: [{ name: 'Zermatters' }],
}

describe('🔴 E36 · ① el esquema del EMISOR no borra la casilla', () => {
  it('acepta business_model y lo DEVUELVE (no lo descarta)', () => {
    const r = esquemaDelEmisor.safeParse({ ...BASE, business_model: LA_RESPUESTA })
    expect(r.success).toBe(true)
    expect(r.success && (r.data as Record<string, unknown>).business_model).toBe(LA_RESPUESTA)
  })

  it('sigue siendo opcional · sin la casilla el contrato NO se rompe', () => {
    expect(esquemaDelEmisor.safeParse(BASE).success).toBe(true)
  })
})

describe('🔴 E36 · ② el filtro de la PLATAFORMA la copia', () => {
  it('validateDiscoveryShape la conserva en el objeto resultante', () => {
    const r = validateDiscoveryShape({ ...BASE, business_model: LA_RESPUESTA }, CLIENTE)
    expect(r.kind).toBe('ok')
    expect(r.kind === 'ok' && r.value.business_model).toBe(LA_RESPUESTA)
  })

  it('una casilla vacía o en blanco no viaja como si fuera una respuesta', () => {
    const r = validateDiscoveryShape({ ...BASE, business_model: '   ' }, CLIENTE)
    expect(r.kind).toBe('ok')
    expect(r.kind === 'ok' && r.value.business_model).toBeUndefined()
  })

  it('si NO es texto, el contrato lo dice en vez de tragárselo', () => {
    const r = validateDiscoveryShape({ ...BASE, business_model: 42 }, CLIENTE)
    expect(r.kind).toBe('malformed')
    expect(r.kind === 'malformed' && r.reason).toBe('business_model_not_string')
  })
})

describe('🔴 E36 · ③ queda ESCRITA en la ficha', () => {
  it('se guarda en la configuración sin pisar lo que ya había', async () => {
    const { fake, storedConfig } = fakeFicha({ apify: { own_handles: { tiktok: '@ya-estaba' } } })
    const discovery: DiscoveryOutput = {
      ...BASE,
      business_model: LA_RESPUESTA,
    } as DiscoveryOutput
    const r = await populateClientConfigFromDiscovery({
      supabase: fake,
      discovery,
      enabled: true,
    })
    expect(r.errors).toEqual([])
    const cfg = storedConfig()
    expect((cfg.business_model as Record<string, unknown> | undefined)?.text).toBe(LA_RESPUESTA)
    // no pisó lo de antes
    expect(
      ((cfg.apify as Record<string, unknown>).own_handles as Record<string, string>).tiktok,
    ).toBe('@ya-estaba')
  })

  it('sin casilla, NO borra la que ya estaba escrita', async () => {
    const { fake, storedConfig } = fakeFicha({
      apify: {},
      business_model: { text: 'lo que dijo la corrida anterior', source: 'auto_discovery_agent' },
    })
    await populateClientConfigFromDiscovery({
      supabase: fake,
      discovery: BASE as DiscoveryOutput,
      enabled: true,
    })
    expect((storedConfig().business_model as Record<string, unknown>).text).toBe(
      'lo que dijo la corrida anterior',
    )
  })
})

describe('🔴 E36 · ④ EL GUARDA · el arnés todavía discrimina', () => {
  it('una casilla de VERDAD desconocida se sigue borrando en los dos espejos', () => {
    const conBasura = { ...BASE, cualquier_casilla_inventada: 'xxx' }
    const emisor = esquemaDelEmisor.safeParse(conBasura)
    expect(emisor.success).toBe(true)
    expect(emisor.success && 'cualquier_casilla_inventada' in (emisor.data as object)).toBe(false)

    const plataforma = validateDiscoveryShape(conBasura, CLIENTE)
    expect(plataforma.kind).toBe('ok')
    expect(
      plataforma.kind === 'ok' && 'cualquier_casilla_inventada' in (plataforma.value as object),
    ).toBe(false)
  })
})

function fakeFicha(initial: Record<string, unknown>) {
  let stored = initial
  const from = () => ({
    select: () => ({
      eq: () => ({ maybeSingle: () => Promise.resolve({ data: { config: stored }, error: null }) }),
    }),
    update: (row: Record<string, unknown>) => {
      stored = (row.config as Record<string, unknown>) ?? {}
      return { eq: () => Promise.resolve({ error: null }) }
    },
  })
  return { fake: { from } as never, storedConfig: () => stored }
}
