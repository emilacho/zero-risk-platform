/**
 * LA AMPLIACIÓN FALLIDA NO PASA EN SILENCIO (22-oct): ese día el Servicio de Apify contestó 500 en las dos llamadas (llave caducada en n8n), la corrida salió «hecha», 0 de gasto y el vigilante en «ok».
 * Ahora el vigilante lo DICE con un aviso (uno por día y cliente, sin apagar ni pausar). US$ 0 · base falsa.
 */
import { describe, expect, it } from 'vitest'
import { rutaVigilar, type DepsDelVigilante } from '../vigilante'
import { crearBaseFalsa } from './base-falsa'

const C = '99999999-9999-4999-8999-999999999999'
const WF = 'ogfq56oIEoHufFPM'
const HOY = new Date('2026-10-22T13:00:00Z')
const ON = { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: true }
const U = { aviso_usd: 3, apagar_usd: 10 }
const cierre = (ampliacion: Record<string, unknown> | null) => ({ fin: 'hecho', clientes: [{ cliente: C, errores: [], puente: { quedan: 0, vueltas: 0, falla: null }, alimentar: 'hecha', plan_fallo: null, ...(ampliacion ? { ampliacion } : {}) }] })
const mundo = () => ({
  clients: [{ id: C, name: 'Cliente Zeta', status: 'active', archived_at: null, config: {} }],
  client_brand_books: [{ id: 'mb', client_id: C }], client_historical_outputs: [{ id: 'pl', client_id: C, output_type: 'campaign_plan_90d', provenance_tag: {} }],
  cerebro_portero_corridas: [{ id: 'r1', client_id: C, dia: '2026-10-22', estado: 'hecha', resumen: {}, gasto_modelo_usd: 0 }],
  cerebro_fichas: [], client_brain_chunks: [], cerebro_unidades_vistas: [], agent_invocations: [], apify_raw: [], costs: [] as Array<Record<string, unknown>>,
})
async function pasar(amp: Record<string, unknown> | null, t = mundo()) {
  const avisos: Array<{ texto: string; clave?: string }> = [], apagados: string[] = []
  const deps: DepsDelVigilante = { db: crearBaseFalsa(t as never).db, interruptores: ON, ahora: HOY, esperar: async () => {}, umbrales: U, apagar: async (w) => { apagados.push(w); return { ok: true, detalle: 'ok' } }, avisar: async (texto, clave) => { avisos.push({ texto, clave }); return { ok: true, detalle: 'ok' } } }
  const r = await rutaVigilar(deps, { dry_run: false, workflow_id: WF, workflow_execution_id: 'ex', cierre: cierre(amp) })
  return { r, avisos, apagados, t }
}
const FALLA = { hecho: false, llamadas: [{ fuente: 'sitio', funcion: 'website_content_scraper', hecho: false, http: 500, error: 'Error in workflow' }, { fuente: 'instagram', funcion: 'instagram_scraper', hecho: false, http: 500, error: 'Error in workflow' }], gasto_usd: 0.058, parado: 'dos_fallas_seguidas' }

describe('el vigilante avisa cuando la ampliación del día falló', () => {
  it('2 de 2 llamadas fallidas: UN aviso con qué falló, sin apagar ni pausar; el rastro lo anota', async () => {
    const { r, avisos, apagados, t } = await pasar(FALLA)
    expect(r.body.ok).toBe(true) // no es un problema que pause al cliente
    expect(apagados).toEqual([])
    expect(avisos).toHaveLength(1)
    expect(avisos[0].texto).toMatch(/Servicio de Apify falló en 2 de 2 llamada\(s\).*website_content_scraper: http 500 «Error in workflow»/)
    expect(avisos[0].clave).toMatch(/^aviso-del-dia:/)
    expect(((t.cerebro_portero_corridas[0].resumen as { vigilante: { avisos: string[]; aviso_de_gasto_dia: string } }).vigilante).aviso_de_gasto_dia).toBe('2026-10-22')
  })
  it('una pasada igual el mismo día no avisa otra vez (uno por día y cliente)', async () => {
    const t = mundo()
    await pasar(FALLA, t)
    const otra = await pasar(FALLA, t)
    expect(otra.avisos).toEqual([])
  })
  it('sin fallas, o parado solo por tiempo, o fallas sueltas sin parar: silencio', async () => {
    expect((await pasar(null)).avisos).toEqual([])
    expect((await pasar({ hecho: true, llamadas: [{ funcion: 'a', hecho: true }], gasto_usd: 0.05, parado: null })).avisos).toEqual([])
    expect((await pasar({ hecho: false, llamadas: [], gasto_usd: 0, parado: 'tiempo' })).avisos).toEqual([])
    expect((await pasar({ hecho: true, llamadas: [{ funcion: 'a', hecho: true }, { funcion: 'b', hecho: false, http: 500 }], parado: null })).avisos).toEqual([])
  })
  it('junto con un aviso de gasto salen en UN solo mensaje por día (no dos)', async () => {
    const t = { ...mundo(), costs: [{ service: 'apify:instagram', amount_usd: 3.5, created_at: '2026-10-22T10:00:00Z', description: JSON.stringify({ es: 'detalle_de_llamada', client_id: C, origen: 'portero' }) }] }
    const { avisos } = await pasar(FALLA, t)
    expect(avisos).toHaveLength(1)
    expect(avisos[0].texto).toMatch(/Servicio de Apify falló/)
  })
})
