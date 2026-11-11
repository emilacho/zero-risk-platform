/**
 * 11-nov · colaterales 2d pieza B · el abridor de revisiones de la cadena acepta OTRA ruta de vuelta: la revisión `colateral` vuelve a colaterales y la de registro sigue
 * volviendo a la cadena. Se reemplaza la jefatura (su `abrirRevision`) para ver el cuerpo exacto que recibe.
 */
import { describe, it, expect, vi } from 'vitest'

const abrirRevision = vi.fn(async (_P: unknown, _cuerpo: Record<string, unknown>) => ({ status: 200, cuerpo: { accion: 'esperar', revision_id: 'rev-1' } }))
vi.mock('../../jefatura/revision/orquestador', async (orig) => ({ ...(await orig<typeof import('../../jefatura/revision/orquestador')>()), abrirRevision }))
vi.mock('../../jefatura/revision/adaptadores', async (orig) => ({ ...(await orig<typeof import('../../jefatura/revision/adaptadores')>()), crearPuertos: () => ({}), entornoDeProceso: () => ({}) }))

describe('abrirRevisionConVuelta', () => {
  it('la vuelta va a la ruta pedida; la de registro sigue yendo a la cadena', async () => {
    const { abrirRevisionConVuelta, abrirRevisionDeRegistroReal, RUTA_DE_VUELTA_DE_LA_CADENA } = await import('../almacen-supabase')
    const { VERCEL_DE_LA_PLATAFORMA } = await import('../../jefatura/revision/contrato')
    const entrada = { artifact_type: 'colateral', artifact_id: 'ed-1', client_id: 'c', journey_id: null, payload: { texto: 't', dry_run: false } }
    expect(await abrirRevisionConVuelta({}, entrada, 'api/jefatura/colaterales-vuelta', {})).toEqual({ estado: 'esperando', revision_id: 'rev-1' })
    expect(abrirRevision.mock.calls[0][1]).toEqual({ ...entrada, payload: { texto: 't', dry_run: false, devolver_a: { tipo: 'webhook', destino: `${VERCEL_DE_LA_PLATAFORMA}api/jefatura/colaterales-vuelta` } } })
    await abrirRevisionDeRegistroReal({}, { artifact_type: 'registro', artifact_id: 'r', client_id: 'c', journey_id: null, payload: { texto: 't', dry_run: false, version: 1 } } as never, {})
    expect((abrirRevision.mock.calls[1][1].payload as { devolver_a: { destino: string } }).devolver_a.destino).toBe(`${VERCEL_DE_LA_PLATAFORMA}${RUTA_DE_VUELTA_DE_LA_CADENA}`)
  })
})
