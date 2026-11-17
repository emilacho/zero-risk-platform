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

// 🔴 de CC6: la fuente NO nombra tablas del cerebro (guarda de aislamiento `__tests__/cerebro-paso-2-aislamiento.test.ts`)
const hecho = (tipo: HechoDelNegocioPorOferta['tipo'], o: Partial<HechoDelNegocioPorOferta> = {}): HechoDelNegocioPorOferta =>
  ({ oferta: 'brunch', sede_id: null, tipo, valor: `un hecho de ${tipo}`, vigente_desde: null, vigente_hasta: null, fuente: `dueno · ficha:${tipo}`, fecha_de_la_fuente: '2026-11-17', confianza: 'alta', ...o })
// los 5 tipos (m3 de CC6: con uno solo, filtrar otro tipo no se notaba)
const HECHOS: HechoDelNegocioPorOferta[] = [
  hecho('sede', { sede_id: 's1' }), hecho('apertura', { vigente_desde: '2026-11-01' }), hecho('cierre_retiro', { vigente_desde: '2026-11-30' }),
  hecho('zona_de_entrega', { confianza: 'media' }), hecho('aun_no_existe', { oferta: null, vigente_hasta: '2026-11-19' }),
]
beforeEach(() => leer.mockReset())

describe('el adaptador real de los hechos del negocio', () => {
  it('🔴 lectura ok ⇒ devuelve los hechos tal cual, los 5 tipos (con su tipo), leídos con la base del adaptador y el cliente pedido', async () => {
    leer.mockResolvedValue({ estado: 'ok', hechos: HECHOS, sin_dato: [], huecos: [], texto: '', oficina: { hechos: [] } })
    const r = await almacenDeSupabase().hechosDelNegocio!('cli-1')
    expect(r).toEqual(HECHOS)
    expect(r!.map((h) => h.tipo)).toEqual(['sede', 'apertura', 'cierre_retiro', 'zona_de_entrega', 'aun_no_existe'])
    expect(leer).toHaveBeenCalledTimes(1)
    expect(leer.mock.calls[0][0]).toBe(BASE)
    expect(leer.mock.calls[0][1]).toBe('cli-1')
  })
  it('🔴 ok sin hechos ⇒ [] (el cerebro no sabe nada: NO es «aún no disponibles»)', async () => {
    leer.mockResolvedValue({ estado: 'ok', hechos: [], sin_dato: [], huecos: [], texto: '', oficina: { hechos: [] } })
    expect(await almacenDeSupabase().hechosDelNegocio!('cli-1')).toEqual([])
  })
  it('🔴 no se pudo leer (o lectura recortada) ⇒ null: el lector declara «aún no disponibles» y nada se frena', async () => {
    for (const detalle of ['una lectura cayó', 'lectura recortada a 2000 filas: los hechos no estarían completos']) {
      leer.mockResolvedValue({ estado: 'no_se_pudo_leer', detalle })
      expect(await almacenDeSupabase().hechosDelNegocio!('cli-1')).toBeNull()
    }
  })
})
