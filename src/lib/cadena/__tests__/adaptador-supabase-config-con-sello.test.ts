/**
 * 17-nov · puerto banco (CC1 · observación de CC6 al certificar #1149) · el ADAPTADOR real de `cadena_config` escribe una clave SOLO si nadie la cambió desde que se leyó
 * (`actualizado_en` como sello) y la inserta SOLO si no existe (choque de llave primaria = no escribió). Base simulada que aplica eq/insert como Postgres: US$ 0, sin red.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

let filas: Array<Record<string, unknown>> = []
function consulta() {
  const filtros: Array<(r: Record<string, unknown>) => boolean> = []
  let cambio: Record<string, unknown> | null = null
  let alta: Record<string, unknown> | null = null
  let unaSola = false
  const q: any = {}
  q.select = () => q
  q.eq = (col: string, v: unknown) => { filtros.push((r) => r[col] === v); return q }
  q.update = (p: Record<string, unknown>) => { cambio = p; return q }
  q.insert = (p: Record<string, unknown>) => { alta = p; return q }
  q.maybeSingle = () => { unaSola = true; return q }
  q.then = (ok: (v: unknown) => unknown) => {
    if (alta) {
      if (filas.some((r) => r.clave === alta!.clave)) return ok({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "cadena_config_pkey"' } })
      filas.push(structuredClone(alta))
      return ok({ data: null, error: null })
    }
    const sel = filas.filter((r) => filtros.every((f) => f(r)))
    if (cambio) for (const r of sel) Object.assign(r, structuredClone(cambio))
    const data = sel.map((r) => structuredClone(r))
    return ok({ data: unaSola ? (data[0] ?? null) : data, error: null })
  }
  return q
}
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ from: () => consulta() }) }))
vi.mock('@/lib/sala-recados/almacen-supabase', () => ({ almacenDeSupabase: () => ({}) }))
vi.mock('@/lib/run-sdk-spend-gate', () => ({ checkRunSdkSpendCap: async () => ({ blocked: false }) }))
vi.mock('@/lib/sala-event-log', () => ({ SupabaseEventLogStorage: class { constructor(public db: unknown) {} } }))
vi.mock('@/lib/sala-ingress', () => ({ isIntakeEnabled: () => true, orchestrateIngress: async () => ({ kind: 'accepted' }), SupabaseIngressTables: class {} }))
vi.mock('@/lib/sala-router-consumer/inmediato-supabase', () => ({ programarDespachoInmediato: () => 'programado' }))

import { almacenDeSupabase } from '../almacen-supabase'

const SELLO = '2026-11-17T20:44:53.123+00:00'
beforeEach(() => { filas = [{ clave: 'banco_correccion:c1', valor: { estado: 'abierta' }, actualizado_en: SELLO }] })

describe('adaptador · cadena_config con sello', () => {
  it('🔴 lee el valor con su sello; una clave que no existe es null', async () => {
    const al = almacenDeSupabase()
    expect(await al.leerConfigConSello!('banco_correccion:c1')).toEqual({ valor: { estado: 'abierta' }, sello: SELLO })
    expect(await al.leerConfigConSello!('banco_correccion:otra')).toBeNull()
  })
  it('🔴 con el sello leído escribe y lo RENUEVA (otro sello); con un sello viejo NO escribe', async () => {
    const al = almacenDeSupabase()
    expect(await al.escribirConfigSiSello!('banco_correccion:c1', { estado: 'respondida' }, SELLO)).toBe(true)
    const despues = await al.leerConfigConSello!('banco_correccion:c1')
    expect(despues!.valor).toEqual({ estado: 'respondida' })
    expect(despues!.sello).not.toBe(SELLO)
    expect(await al.escribirConfigSiSello!('banco_correccion:c1', { estado: 'pisada' }, SELLO)).toBe(false)
    expect((await al.leerConfigConSello!('banco_correccion:c1'))!.valor).toEqual({ estado: 'respondida' })
  })
  it('🔴 el sello nuevo es siempre POSTERIOR al leído, aunque el reloj vaya atrás', async () => {
    filas[0].actualizado_en = '2999-01-01T00:00:00.000Z'
    const al = almacenDeSupabase()
    expect(await al.escribirConfigSiSello!('banco_correccion:c1', { estado: 'x' }, '2999-01-01T00:00:00.000Z')).toBe(true)
    expect(Date.parse(String(filas[0].actualizado_en))).toBeGreaterThan(Date.parse('2999-01-01T00:00:00.000Z'))
  })
  it('🔴 sello null = insertar SOLO si no existe: la primera vez escribe; si ya existe, devuelve false sin tocarla', async () => {
    const al = almacenDeSupabase()
    expect(await al.escribirConfigSiSello!('banco_encargo:e1', 'c1', null)).toBe(true)
    expect(await al.escribirConfigSiSello!('banco_encargo:e1', 'c2', null)).toBe(false)
    expect(filas.find((r) => r.clave === 'banco_encargo:e1')!.valor).toBe('c1')
    expect(await al.escribirConfigSiSello!('banco_correccion:c1', { estado: 'pisada' }, null)).toBe(false)
    expect(filas[0].valor).toEqual({ estado: 'abierta' })
  })
})
