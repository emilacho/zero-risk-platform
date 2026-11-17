import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HechoDelNegocioPorOferta } from '../ficha-de-oferta'

/**
 * 17-nov · el ADAPTADOR real conecta los «Hechos del negocio» (#1140) al lector de la ficha:
 *   ok → los hechos tal cual · no_se_pudo_leer (incluida la lectura recortada) → null («aún no disponibles», nunca frena)
 *   siempre con la base del adaptador y el cliente de la campaña · US$ 0, sin red
 */
const BASE = { from: () => { throw new Error('la consulta real no debe correr en esta prueba') } }
const leer = vi.fn()
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => BASE }))
vi.mock('@/lib/portero-alimenta/hechos-del-negocio', () => ({ leerHechosDelNegocio: (...a: unknown[]) => leer(...a) }))
vi.mock('@/lib/sala-recados/almacen-supabase', () => ({ almacenDeSupabase: () => ({}) }))
vi.mock('@/lib/run-sdk-spend-gate', () => ({ checkRunSdkSpendCap: async () => ({ blocked: false }) }))
vi.mock('@/lib/sala-event-log', () => ({ SupabaseEventLogStorage: class { constructor(public db: unknown) {} } }))
vi.mock('@/lib/sala-ingress', () => ({ isIntakeEnabled: () => true, orchestrateIngress: async () => ({ kind: 'accepted' }), SupabaseIngressTables: class {} }))
vi.mock('@/lib/sala-router-consumer/inmediato-supabase', () => ({ programarDespachoInmediato: () => 'programado' }))
vi.mock('@/lib/avisos/nucleo', () => ({ avisar: async () => ({ accion: 'abrio', slack: 'no' }) }))
vi.mock('@/lib/avisos/adaptadores', () => ({ dependenciasReales: () => ({}) }))

import { almacenDeSupabase } from '../almacen-supabase'

const HECHO: HechoDelNegocioPorOferta = { oferta: 'brunch', sede_id: null, tipo: 'cierre_retiro', valor: 'se retira el 30-nov', vigente_desde: '2026-11-30', vigente_hasta: null, fuente: 'dueno · cerebro_fichas:f1', fecha_de_la_fuente: '2026-11-17', confianza: 'alta' }
beforeEach(() => leer.mockReset())

describe('el adaptador real de los hechos del negocio', () => {
  it('🔴 lectura ok ⇒ devuelve los hechos tal cual (con su tipo), leídos con la base del adaptador y el cliente pedido', async () => {
    leer.mockResolvedValue({ estado: 'ok', hechos: [HECHO], sin_dato: [], huecos: [], texto: '', oficina: { hechos: [] } })
    const r = await almacenDeSupabase().hechosDelNegocio!('cli-1')
    expect(r).toEqual([HECHO])
    expect(leer).toHaveBeenCalledTimes(1)
    expect(leer.mock.calls[0][0]).toBe(BASE)
    expect(leer.mock.calls[0][1]).toBe('cli-1')
  })
  it('🔴 ok sin hechos ⇒ [] (el cerebro no sabe nada: NO es «aún no disponibles»)', async () => {
    leer.mockResolvedValue({ estado: 'ok', hechos: [], sin_dato: [], huecos: [], texto: '', oficina: { hechos: [] } })
    expect(await almacenDeSupabase().hechosDelNegocio!('cli-1')).toEqual([])
  })
  it('🔴 no se pudo leer (o lectura recortada) ⇒ null: el lector declara «aún no disponibles» y nada se frena', async () => {
    for (const detalle of ['client_sedes: caída', 'lectura recortada a 2000 filas: los hechos no estarían completos']) {
      leer.mockResolvedValue({ estado: 'no_se_pudo_leer', detalle })
      expect(await almacenDeSupabase().hechosDelNegocio!('cli-1')).toBeNull()
    }
  })
})
