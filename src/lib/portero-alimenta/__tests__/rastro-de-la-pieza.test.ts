/**
 * Encargo 9 · el rastro de la pieza llega de verdad a `cerebro_consultas`: el registrador real y el cableado de las dos rutas.
 */
import fs from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

const escrito: Array<{ tabla: string; fila: unknown; columnas: string }> = []
let respuesta: { data: unknown; error: unknown } = { data: [{ id: 'c-123' }], error: null }
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: (tabla: string) => ({
      insert: (fila: unknown) => ({ select: (columnas: string) => ({ limit: async () => { escrito.push({ tabla, fila, columnas }); return respuesta } }) }),
    }),
  }),
}))
const { registrarEnLaBase } = await import('../rastro-de-la-pieza')

describe('el registrador real del rastro', () => {
  it('escribe UNA fila en cerebro_consultas y devuelve su id', async () => {
    escrito.length = 0
    expect(await registrarEnLaBase({ client_id: 'x', ruta: 'indice' })).toEqual({ id: 'c-123' })
    expect(escrito).toEqual([{ tabla: 'cerebro_consultas', fila: { client_id: 'x', ruta: 'indice' }, columnas: 'id' }])
  })
  it('si la base contesta error, lo devuelve como error (no como id)', async () => {
    respuesta = { data: null, error: { message: 'column "ruta" does not exist' } }
    expect(await registrarEnLaBase({})).toEqual({ error: 'cerebro_consultas: column "ruta" does not exist' })
    respuesta = { data: [{ id: 'c-123' }], error: null }
  })
  it('el error de la base llega ENTERO (sin recorte: G9 · sin-cortes-nuevos)', async () => {
    const largo = 'x'.repeat(500)
    respuesta = { data: null, error: { message: largo } }
    expect(await registrarEnLaBase({})).toEqual({ error: `cerebro_consultas: ${largo}` })
    respuesta = { data: [{ id: 'c-123' }], error: null }
  })
})

describe('las dos rutas pasan el registrador real', () => {
  for (const ruta of ['indice', 'entregar']) {
    it(ruta, () => {
      const src = fs.readFileSync(new URL(`../../../app/api/brain/portero/${ruta}/route.ts`, import.meta.url), 'utf-8')
      expect(src).toMatch(/import \{ registrarEnLaBase \} from '@\/lib\/portero-alimenta\/rastro-de-la-pieza'/)
      expect(src).toMatch(ruta === 'indice' ? /armarIndice\(consultaDelEntorno\(\), cuerpo, \{ registrar: registrarEnLaBase \}\)/ : /entregarContenido\(consultaDelEntorno\(\), cuerpo, \{ registrar: registrarEnLaBase \}\)/)
    })
  }
})
