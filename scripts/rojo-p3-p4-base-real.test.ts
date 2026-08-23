/**
 * ROJO de P3 y P4 · CONTRA LA BASE REAL · cliente DESCARTABLE
 *
 * NO corre en la suite: vive fuera de `__tests__/`, así que el patrón de inclusión de
 * vitest no lo toma. Se corre a mano:
 *   npx vitest run scripts/rojo-p3-p4-base-real.test.ts
 *
 * Por qué en proceso y no por HTTP contra producción: producción corre `main`, que NO
 * tiene el arreglo. Un POST a producción daría el ROJO pero **nunca el VERDE** hasta
 * publicar — y publicar antes de probar es exactamente lo que no se hace. Llamando al
 * manejador en proceso, con la base REAL, se miden las dos mitades hoy.
 *
 * ⚠️ Escribe en la base · SIEMPRE contra el cliente descartable de
 *    evidence/tres-productores-2026-08-23/CLIENTE-DESCARTABLE.txt · nunca uno real.
 * ⚠️ Centinelas DISTINTOS · con el mismo texto el bug daría el mismo resultado que el arreglo.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const raiz = join(__dirname, '..')

// credenciales desde .env.local (el proceso de vitest no las carga solo)
function env(clave: string): string {
  const linea = readFileSync(join(raiz, '.env.local'), 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`${clave}=`))
  if (!linea) throw new Error(`falta ${clave} en .env.local`)
  return linea.slice(clave.length + 1).trim().replace(/^["']|["']$/g, '')
}

const CLIENTE = readFileSync(
  join(raiz, 'evidence/tres-productores-2026-08-23/CLIENTE-DESCARTABLE.txt'),
  'utf8',
).trim()

const CENTINELA_P = 'CENTINELA-P-2026-08-23'
const CENTINELA_E = 'CENTINELA-E-2026-08-23'

const SUPA = env('NEXT_PUBLIC_SUPABASE_URL')
const SRV = env('SUPABASE_SERVICE_ROLE_KEY')

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPA
  process.env.SUPABASE_SERVICE_ROLE_KEY = SRV
  process.env.INTERNAL_API_KEY = env('INTERNAL_API_KEY')
  // guarda dura: si el id no es el descartable, no se escribe nada
  if (!CLIENTE.startsWith('00000000-dead-')) {
    throw new Error(`ABORTA · el id ${CLIENTE} no parece descartable`)
  }
})

const leerFicha = async () => {
  const r = await fetch(
    `${SUPA}/rest/v1/client_brand_books?client_id=eq.${CLIENTE}&select=id,positioning,elevator_pitch&order=version.desc&limit=1`,
    { headers: { apikey: SRV, Authorization: `Bearer ${SRV}` } },
  )
  const filas = (await r.json()) as Array<Record<string, unknown>>
  return filas[0] ?? null
}

const borrarFichas = async () => {
  await fetch(`${SUPA}/rest/v1/client_brand_books?client_id=eq.${CLIENTE}`, {
    method: 'DELETE',
    headers: { apikey: SRV, Authorization: `Bearer ${SRV}` },
  })
}

describe('P3 · clients/upsert escribe `positioning` con su nombre', () => {
  it('la fila queda con los dos centinelas, DISTINTOS entre sí', async () => {
    await borrarFichas()

    const { POST } = await import('../src/app/api/clients/upsert/route')
    const req = new Request('http://local/api/clients/upsert', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.INTERNAL_API_KEY! },
      body: JSON.stringify({
        name: 'ZZZ-DESCARTABLE-prueba-productores',
        client_id: CLIENTE,
        brand_book: {
          positioning: CENTINELA_P,
          elevator_pitch: CENTINELA_E,
          voice_description: 'tono de prueba',
        },
      }),
    })

    const res = await POST(req)
    expect(res.status, `el endpoint respondió ${res.status}`).toBeLessThan(400)

    const fila = await leerFicha()
    expect(fila, 'no se escribió ninguna ficha').toBeTruthy()

    // LA afirmación · el bug deja positioning en NULL
    expect(fila?.positioning, 'positioning quedó vacío · el productor no lo escribe').toBe(CENTINELA_P)
    expect(fila?.elevator_pitch).toBe(CENTINELA_E)
    expect(fila?.positioning).not.toBe(fila?.elevator_pitch)
  }, 60_000)
})

describe('P4 · brand-analyzer escribe `positioning` con su nombre', () => {
  it('la escritura de la rama 3 acepta un analysis inyectado y guarda los dos centinelas', async () => {
    await borrarFichas()

    // [DESCONOCIDO] del diseño · RESUELTO por lectura del código:
    // `writeBrandBookToDB` es un método SEPARADO de `analyzeBrand`, recibe el analysis
    // como argumento, y el constructor no llama a ningún modelo (sólo guarda la llave).
    // ⇒ el ROJO de P4 SÍ se fuerza gratis. Sin corrida paga.
    const { BrandAnalyzer } = await import('../src/lib/brand-analyzer')
    const { createClient } = await import('@supabase/supabase-js')
    const analizador = new BrandAnalyzer(createClient(SUPA, SRV))

    const analysis = {
      brand_purpose: 'prueba', brand_vision: 'prueba', brand_mission: 'prueba',
      brand_values: [], brand_personality: 'prueba', voice_description: 'tono de prueba',
      tone_guidelines: {}, writing_style: 'prueba', tagline: 'prueba',
      positioning: CENTINELA_P,
      elevator_pitch: CENTINELA_E,
      key_messages: [], value_propositions: [], primary_colors: [], imagery_style: 'prueba',
      detected_industry: 'prueba', detected_market: 'B2B',
      suggested_forbidden_words: [], suggested_required_terminology: [],
      competitor_mentions_policy: 'never_mention',
    }

    await analizador.writeBrandBookToDB(CLIENTE, analysis as never, 'prueba-descartable')

    const fila = await leerFicha()
    expect(fila, 'no se escribió ninguna ficha').toBeTruthy()
    expect(fila?.positioning, 'positioning quedó vacío · la rama 3 no lo escribe').toBe(CENTINELA_P)
    expect(fila?.elevator_pitch).toBe(CENTINELA_E)
    expect(fila?.positioning).not.toBe(fila?.elevator_pitch)
  }, 60_000)
})
