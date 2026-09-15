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
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  validateDiscoveryShape,
  populateClientConfigFromDiscovery,
  type DiscoveryOutput,
} from '@/lib/discovery-output'

const CLIENTE = 'a7ad4331-b7d6-48c8-8846-c53063495bd3'
const LA_RESPUESTA =
  'Plataforma de reservas: terceros (escuelas de esquí, empresas de parapente) prestan el servicio, ' +
  'el viajero paga la reserva en línea y el proveedor la confirma. Hay dos lados.'

/**
 * 🔴 Los dos espejos se comparan LEYENDO LOS DOS ARCHIVOS · sin ejecutar el
 * servidor y sin sus dependencias.
 *
 * Primero intenté cargar el esquema de verdad y correr `z.object().safeParse`.
 * Pasaba en esta máquina y CAÍA en la integración continua: la integración NO
 * instala las dependencias de `services/agent-runner`, así que
 * `@modelcontextprotocol/sdk` no existe allá («Cannot find module»). Local OK ≠
 * integración OK · la prueba que sólo corre en una máquina no es una prueba.
 *
 * Lo que queda cubierto es lo que importa y es MÁS fuerte que el safeParse:
 * que una casilla declarada de un lado esté declarada del otro. Que `z.object`
 * descarte lo desconocido es conducta de zod, medida una vez en E31; que los
 * dos espejos deriven es el defecto de la casa, y es lo que esto ataja.
 */
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const fuente = (p: string) => readFileSync(join(raiz, p), 'utf8')

function casillasDelEmisor(): string[] {
  const src = fuente('services/agent-runner/src/lib/mcp/discovery-output-server.js')
  const ini = src.indexOf('const DISCOVERY_INPUT_SCHEMA = {')
  const fin = src.indexOf('\n}', ini)
  const bloque = src.slice(ini, fin)
  // Las casillas del esquema viven a DOS espacios de sangría · lo que está más
  // adentro es parte de una casilla, no una casilla nueva.
  return [...bloque.matchAll(/^ {2}([a-z_][a-z0-9_]*):/gm)].map((m) => m[1])
}

function casillasDeLaPlataforma(): string[] {
  const src = fuente('src/lib/discovery-output/types.ts')
  const ini = src.indexOf('export interface DiscoveryOutput {')
  const fin = src.indexOf('\n}', ini)
  const bloque = src.slice(ini, fin)
  return [...bloque.matchAll(/^ {2}readonly ([a-z_][a-z0-9_]*)\??:/gm)].map((m) => m[1])
}

/**
 * 🔴 Huérfana CONOCIDA y declarada · `sources` está en el contrato de la
 * plataforma y NO en el esquema del emisor: el emisor la borra en silencio
 * desde hace semanas. **No se arregla acá** (encargo E36/E39: va aparte).
 * Queda escrita para que la lista NO crezca sin que nadie se entere.
 */
const HUERFANAS_CONOCIDAS = ['sources']

const BASE = {
  client_id: CLIENTE,
  own_handles: { instagram: '@goeuropeadventure' },
  competitors: [{ name: 'Zermatters' }],
}

describe('🔴 E36 · ① la casilla está declarada en LOS DOS espejos', () => {
  it('el esquema del EMISOR la declara', () => {
    expect(casillasDelEmisor()).toContain('business_model')
  })

  it('el contrato de la PLATAFORMA la declara', () => {
    expect(casillasDeLaPlataforma()).toContain('business_model')
  })

  it('🔴 NINGUNA casilla nueva queda declarada de un solo lado', () => {
    const emisor = casillasDelEmisor()
    const plataforma = casillasDeLaPlataforma()
    const soloPlataforma = plataforma.filter((k) => !emisor.includes(k) && !HUERFANAS_CONOCIDAS.includes(k))
    const soloEmisor = emisor.filter((k) => !plataforma.includes(k))
    expect(soloPlataforma, 'declaradas sólo en la plataforma · el emisor las borra en silencio').toEqual([])
    expect(soloEmisor, 'declaradas sólo en el emisor · la plataforma las descarta').toEqual([])
  })

  it('el arnés lee de verdad los dos archivos (y no una lista vacía)', () => {
    expect(casillasDelEmisor()).toEqual(
      expect.arrayContaining(['client_id', 'own_handles', 'competitors', 'icp', 'competitive_landscape_summary']),
    )
    expect(casillasDeLaPlataforma()).toEqual(expect.arrayContaining(['client_id', 'own_handles', 'competitors']))
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
  it('una casilla de VERDAD desconocida se sigue borrando en el filtro', () => {
    const conBasura = { ...BASE, cualquier_casilla_inventada: 'xxx' }
    const plataforma = validateDiscoveryShape(conBasura, CLIENTE)
    expect(plataforma.kind).toBe('ok')
    expect(
      plataforma.kind === 'ok' && 'cualquier_casilla_inventada' in (plataforma.value as object),
    ).toBe(false)
  })

  it('y una huérfana inventada SÍ la caza la comparación de espejos', () => {
    const emisor = ['client_id', 'business_model']
    const plataforma = ['client_id', 'business_model', 'una_huerfana_nueva']
    const soloPlataforma = plataforma.filter((k) => !emisor.includes(k) && !HUERFANAS_CONOCIDAS.includes(k))
    expect(soloPlataforma).toEqual(['una_huerfana_nueva'])
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
