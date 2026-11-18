/**
 * 18-nov · #1147 · EL CABLE: los puertos reales de la oficina traen `hechosPorOferta`, la MISMA lectura de los hechos del negocio que usa la hoja de la cadena
 * (por el almacén de la cadena). Sin este cable D1 en la jefatura no leería nunca el cerebro de hoy: el puerto es opcional y se apagaría en silencio.
 * US$ 0, sin red. La prueba no nombra tablas: el almacén de la cadena es un doble.
 */
import { describe, expect, it, vi } from 'vitest'

const PEDIDOS: string[] = []
let RESPUESTA: unknown = []
vi.mock('../../cadena/almacen-supabase', () => ({
  almacenDeSupabase: () => ({
    hechosDelNegocio: async (clientId: string) => { PEDIDOS.push(clientId); return RESPUESTA },
  }),
}))

import { crearPuertos } from '../adaptadores'

describe('el puerto real de la oficina lee los hechos por oferta por el almacén de la cadena', () => {
  const HECHO = { oferta: 'oferta-a', tipo: 'cierre_retiro', valor: 'se suspende', vigente_desde: '2026-11-18', fuente: 'dueno:chat' }
  it('trae `hechosPorOferta` y devuelve lo que lee el almacén de la cadena, para ESE cliente', async () => {
    const P = crearPuertos({} as never, { baseUrl: 'http://x', internalKey: 'k' } as never)
    expect(typeof P.hechosPorOferta).toBe('function')
    RESPUESTA = [HECHO]
    expect(await P.hechosPorOferta!('cliente-1')).toEqual([HECHO])
    expect(PEDIDOS).toEqual(['cliente-1'])
  })
  it('si el almacén no pudo leer (null), el puerto dice null: D1 lo declara «sin verificar» y no lo lee como «abierta»', async () => {
    const P = crearPuertos({} as never, { baseUrl: 'http://x', internalKey: 'k' } as never)
    RESPUESTA = null
    expect(await P.hechosPorOferta!('cliente-2')).toBeNull()
  })
})
