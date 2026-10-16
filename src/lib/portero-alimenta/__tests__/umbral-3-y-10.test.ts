/** Corrección firmada por Emilio (15-oct): avisa pasando de US$ 3, apaga SOLO pasando de US$ 10. Valores reales de producción: PORTERO_GASTO_AVISO_USD=3 y PORTERO_GASTO_APAGAR_USD=10. */
import { describe, expect, it } from 'vitest'
import { umbralesDeGastoDelEntorno } from '../datos'
import { rutaVigilar, type DepsDelVigilante } from '../vigilante'
import { crearBaseFalsa } from './base-falsa'

const C = '99999999-9999-4999-8999-999999999999'
const WF = 'ogfq56oIEoHufFPM'
const HOY = new Date('2026-10-15T13:00:00Z')
const ON = { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: true }
const CIERRE = { fin: 'hecho', clientes: [{ cliente: C, errores: [], puente: { quedan: 0, vueltas: 0, falla: null }, alimentar: 'hecha', plan_fallo: null }] }
const U = umbralesDeGastoDelEntorno({ PORTERO_GASTO_AVISO_USD: '3', PORTERO_GASTO_APAGAR_USD: '10' })
const mundo = (usd: number) => ({
  clients: [{ id: C, name: 'Cliente Zeta', status: 'active', archived_at: null, config: {} }],
  client_brand_books: [{ id: 'mb', client_id: C }],
  client_historical_outputs: [{ id: 'pl', client_id: C, output_type: 'campaign_plan_90d', provenance_tag: {} }],
  cerebro_portero_corridas: [{ id: 'r1', client_id: C, dia: '2026-10-15', estado: 'hecha', resumen: {}, gasto_modelo_usd: 0 }],
  cerebro_fichas: [], client_brain_chunks: [], cerebro_unidades_vistas: [], agent_invocations: [], apify_raw: [],
  costs: usd > 0 ? [{ service: 'apify:instagram', amount_usd: usd, created_at: '2026-10-15T10:00:00Z', description: JSON.stringify({ es: 'detalle_de_llamada', client_id: C, origen: 'portero' }) }] : [],
})
async function pasar(usd: number) {
  const base = crearBaseFalsa(mundo(usd) as never)
  const apagados: string[] = [], avisos: string[] = []
  const deps: DepsDelVigilante = { db: base.db, interruptores: ON, ahora: HOY, esperar: async () => {}, umbrales: U,
    apagar: async (w) => { apagados.push(w); return { ok: true, detalle: 'ok' } }, avisar: async (t) => { avisos.push(t); return { ok: true, detalle: 'ok' } } }
  const r = await rutaVigilar(deps, { dry_run: false, workflow_id: WF, workflow_execution_id: 'ex', cierre: CIERRE })
  return { r, apagados, avisos }
}
describe('umbrales firmados: avisa > 3 · apaga > 10', () => {
  it('10 es un valor válido (no «enorme o incoherente»)', () => {
    expect(U).toEqual({ aviso_usd: 3, apagar_usd: 10 })
    expect(umbralesDeGastoDelEntorno({ PORTERO_GASTO_AVISO_USD: '3', PORTERO_GASTO_APAGAR_USD: '10' })).not.toEqual({ aviso_usd: 1.5, apagar_usd: 3 })
  })
  it.each([0, 1.2, 3])('≤ 3 (US$ %s): silencio', async (usd) => {
    const x = await pasar(usd)
    expect(x.avisos).toEqual([]); expect(x.apagados).toEqual([]); expect(x.r.body.ok).toBe(true)
  })
  it.each([3.5, 7, 10])('3–10 (US$ %s): un aviso, NO apaga', async (usd) => {
    const x = await pasar(usd)
    expect(x.apagados).toEqual([]); expect(x.avisos).toHaveLength(1); expect(x.avisos[0]).toMatch(/sigue encendido/); expect(x.r.body.ok).toBe(true)
  })
  it.each([10.5, 25])('> 10 (US$ %s): apaga y avisa', async (usd) => {
    const x = await pasar(usd)
    expect(x.apagados).toEqual([]); expect(x.avisos[0]).toMatch(/PAUSADO solo para/); expect(x.avisos[0]).toMatch(/> 10\.00/)
  })
})
