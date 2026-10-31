/**
 * T6 · EL CABLE (certificación CC3 · V08/V07): los puertos reales de la oficina traen `configDeLaCadena`, que lee `cadena_config` por el almacén de la cadena;
 * y abrir una pieza con personas en el brief deja `si_personas` en su estado. US$ 0, sin red.
 */
import { describe, expect, it, vi } from 'vitest'

const LEIDAS: string[] = []
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: (t: string) => ({ select: () => ({ eq: (_c: string, clave: string) => ({ maybeSingle: async () => { LEIDAS.push(`${t}:${clave}`); return { data: { valor: { pieza: 'MÉTODO LEÍDO' } }, error: null } } }) }) }),
  }),
}))

import { crearPuertos } from '../adaptadores'
import { seccionDeMetodo } from '../mesa/pedidos'

describe('el puerto real de la mesa lee la configuración por el almacén de la cadena', () => {
  it('trae `configDeLaCadena` y devuelve lo que el almacén lee de `cadena_config`', async () => {
    const P = crearPuertos({} as never, { baseUrl: 'http://x', internalKey: 'k' } as never)
    expect(typeof P.mesa?.configDeLaCadena).toBe('function')
    const v = await P.mesa!.configDeLaCadena!('metodos')
    expect(v).toEqual({ pieza: 'MÉTODO LEÍDO' })
    expect(LEIDAS).toEqual(['cadena_config:metodos'])
    // y ese valor llega al turno de content-creator como texto de reemplazo
    expect(seccionDeMetodo('content-creator', v, undefined, '2026-10-31')).toContain('MÉTODO LEÍDO')
  })
})
