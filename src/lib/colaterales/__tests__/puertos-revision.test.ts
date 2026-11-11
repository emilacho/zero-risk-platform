/**
 * COLATERALES 2d · pieza B · el puerto REAL que abre la revisión: el abridor de la cadena con la ruta de vuelta de COLATERALES (no la de la cadena),
 * y aplicar = el motor 2c con los escritores que existen hoy. (El abridor se reemplaza aquí: abre la jefatura real.)
 */
import { describe, it, expect, vi } from 'vitest'

const abrirConVuelta = vi.fn(async () => ({ estado: 'esperando' as const, revision_id: 'rev-9' }))
vi.mock('../../cadena/almacen-supabase', async (orig) => ({ ...(await orig<typeof import('../../cadena/almacen-supabase')>()), abrirRevisionConVuelta: abrirConVuelta }))

describe('puerto · abrirRevisionColateral', () => {
  it('abre con la vuelta a api/jefatura/colaterales-vuelta (nunca a la de la cadena) y devuelve lo que dice la jefatura', async () => {
    const { puertosDeSupabase } = await import('../puertos-supabase')
    const { RUTA_DE_VUELTA_DE_COLATERALES } = await import('../vuelta')
    const { RUTA_DE_VUELTA_DE_LA_CADENA } = await import('../../cadena/almacen-supabase')
    const db = { from: () => { throw new Error('no debe leer') } }
    const cadena = { campana: vi.fn(), campanaViva: vi.fn(), ultimaEstrategia: vi.fn(), estrategiaEnVersion: vi.fn(), insertarEstrategiaSiLibre: vi.fn() }
    const P = puertosDeSupabase(db as never, undefined, cadena as never)
    const entrada = { artifact_type: 'colateral' as const, artifact_id: 'ed-1', client_id: 'c', journey_id: null, payload: { texto: 't' } }
    expect(await P.abrirRevisionColateral(entrada)).toEqual({ estado: 'esperando', revision_id: 'rev-9' })
    expect(abrirConVuelta).toHaveBeenCalledWith(db, entrada, RUTA_DE_VUELTA_DE_COLATERALES)
    expect(RUTA_DE_VUELTA_DE_COLATERALES).not.toBe(RUTA_DE_VUELTA_DE_LA_CADENA)
  }, 30_000) // importa los puertos reales (pesado): con la suite entera en paralelo pasa de 5 s
})
