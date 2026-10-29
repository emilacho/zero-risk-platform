/** Etiquetas de fotos por cliente y día según el modo (29-oct · firma de Emilio) · US$ 0, sin red. */
import { describe, it, expect } from 'vitest'
import { topeDeEtiquetasPorClienteYDia } from '../modo'
import { topesVigentes } from '../costos'
import { etiquetarPendientes } from '../../cerebro/portero/fotos-pendientes'

const filas = Array.from({ length: 30 }, (_, i) => ({ id: `f${i}`, owner_role: 'competidor', estado: 'ok', etiquetada_en: i < 10 ? '2026-10-29T01:00:00Z' : null, duplicado_de: null, hash_archivo: `h${i}`, created_at: `2026-10-2${i % 9}T00:00:00Z` }))
const consulta = async () => ({ filas, error: null })
const bien = (v: string[]) => async (a: { foto_id: string }) => { v.push(a.foto_id); return { llamo_al_modelo: true, escribio: true, costo_usd: 0.008 } }
const U = { aviso_usd: 3, apagar_usd: 10 }

describe('tope de etiquetas según el modo', () => {
  it('construcción sin tope; campaña 10', () => {
    expect(topeDeEtiquetasPorClienteYDia('construccion')).toBeGreaterThanOrEqual(1_000_000)
    expect(topeDeEtiquetasPorClienteYDia('campana')).toBe(10)
  })
  it('construcción: las 20 pendientes se etiquetan aunque ya haya 10 hoy; campaña: ya no cabe ninguna', async () => {
    const hoy = () => new Date('2026-10-29T12:00:00Z')
    const v1: string[] = []
    const a = await etiquetarPendientes({ consulta: consulta as never, etiquetarFoto: bien(v1), ahora: hoy }, { clientes: ['c'], dry_run: false, tope_por_cliente: topeDeEtiquetasPorClienteYDia('construccion') })
    expect(v1).toHaveLength(20); expect(a.informes[0].omitidas_por_tope).toBe(0)
    const v2: string[] = []
    const b = await etiquetarPendientes({ consulta: consulta as never, etiquetarFoto: bien(v2), ahora: hoy }, { clientes: ['c'], dry_run: false, tope_por_cliente: topeDeEtiquetasPorClienteYDia('campana') })
    expect(v2).toHaveLength(0); expect(b.informes[0].omitidas_por_tope).toBe(20)
  })
  it('topes_vigentes lo muestra por modo', () => {
    const f = (m: 'construccion' | 'campana') => topesVigentes(U, { modo: m }).find((t) => t.tope.startsWith('etiquetas de fotos'))!
    expect(f('construccion').frena).toBe(false); expect(f('construccion').mide).toContain('SIN tope')
    expect(f('campana').frena).toBe(true); expect(f('campana').mide).toContain('10')
  })
})
