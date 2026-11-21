/**
 * 21-nov · CC1 · la ruta del vigía con el ④ arreglo propio de «Crear Campaña» (`cadena/reparar-pedidos`, GO Lenovo 10:28Z): corre en cada pasada después de lo demás,
 * en seco solo calcula, y NUNCA frena al vigía (ni si lanza, ni si armar el almacén lanza). Se prueba la RUTA real con sus piezas simuladas.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  orden: [] as string[],
  estado: 'encendida' as 'apagada' | 'encendida',
  args: [] as Array<{ ahora: string; o: { ejecutar: boolean } }>,
  respuesta: { accion: 'reparado', revisados: 1, reintentos: [{ pedido_id: 'p1', intento: 1, resultado: 'aceptado' }], fallidos: [], errores: [] } as Record<string, unknown>,
  lanza: null as string | null,
  almacenLanza: null as string | null,
}))
vi.mock('@/lib/oficina/cerrar-decisiones-reemplazadas', () => ({ cerrarDecisionesReemplazadas: async () => ({ cerradas: [], error: null }) }))
vi.mock('@/lib/oficina/purgar-textos', () => ({ purgarTextosViejos: async () => { h.orden.push('purga'); return { error: null } } }))
vi.mock('@/lib/oficina/ruta', () => ({
  checkLlaveDeLaSala: () => ({ ok: true }),
  esObjeto: (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v),
  puertosReales: () => ({ P: { almacen: { leerConfig: async () => ({ estado: h.estado, familias_activas: [], clientes_ensayo: [] }) }, ahora: () => new Date('2026-11-21T12:00:00Z') }, db: {} }),
}))
vi.mock('@/lib/oficina/vigia', () => ({
  vencerBandeja: async () => { h.orden.push('bandeja'); return { vencidas: [] } },
  revisarPasosMuertos: async () => { h.orden.push('muertos'); return { reanudar: [], fallidos: [], cierres: [] } },
  vencerMesasPorPlazo: async () => ({ vencidas: [] }),
  revisarEsperasDeLaCadena: async () => ({ revisados: [], error: null }),
}))
vi.mock('@/lib/oficina/reintento-adaptador', () => ({ reintentoDeLaCadena: async (_db: unknown, _env: unknown, o: { ejecutar: boolean }) => { h.orden.push(o.ejecutar ? 'reintento' : 'reintento_en_seco'); return { accion: 'vigilado' } } }))
vi.mock('@/lib/cadena/almacen-supabase', () => ({ almacenDeSupabase: () => { if (h.almacenLanza) throw new Error(h.almacenLanza); return { soy: 'el almacén de la cadena' } } }))
vi.mock('@/lib/cadena/reparar-pedidos', () => ({
  repararPedidos: async (al: { soy?: string }, ahora: Date, o: { ejecutar: boolean }) => {
    expect(al.soy).toBe('el almacén de la cadena')
    h.orden.push(o.ejecutar ? 'pedidos' : 'pedidos_en_seco'); h.args.push({ ahora: ahora.toISOString(), o })
    if (h.lanza) throw new Error(h.lanza)
    return h.respuesta
  },
}))
import { POST } from '@/app/api/oficina/vigia/route'

const llamar = (cuerpo: unknown) => POST(new Request('https://app.test/api/oficina/vigia', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) }))
beforeEach(() => { h.orden = []; h.estado = 'encendida'; h.args = []; h.lanza = null; h.almacenLanza = null })

describe('POST /api/oficina/vigia · ④ el arreglo propio de «Crear Campaña»', () => {
  it('🔴 corre en cada pasada, DESPUÉS de lo demás, con la hora del vigía y ejecutando; la respuesta lo trae', async () => {
    const r = await llamar({}); const j = await r.json()
    expect(r.status).toBe(200)
    expect(h.orden).toEqual(['bandeja', 'muertos', 'reintento', 'purga', 'pedidos'])
    expect(h.args).toEqual([{ ahora: '2026-11-21T12:00:00.000Z', o: { ejecutar: true } }])
    expect(j.pedidos).toEqual(h.respuesta)
  })
  it('🔴 si el arreglo LANZA, el vigía sigue en 200 y lo dice; lo demás ya quedó hecho', async () => {
    h.lanza = 'la base cayó'
    const r = await llamar({}); const j = await r.json()
    expect(r.status).toBe(200)
    expect(j.pedidos).toEqual({ accion: 'error', detalle: 'la base cayó' })
    expect(h.orden).toEqual(['bandeja', 'muertos', 'reintento', 'purga', 'pedidos'])
  })
  it('🔴 si armar el almacén lanza (antes de la promesa), tampoco frena: 200 con el error', async () => {
    h.almacenLanza = 'faltan credenciales'
    const r = await llamar({}); const j = await r.json()
    expect(r.status).toBe(200)
    expect(j.pedidos).toEqual({ accion: 'error', detalle: 'faltan credenciales' })
  })
  it('🔴 «reintento_en_seco»: el arreglo solo calcula (ejecutar false) y no corre nada más', async () => {
    const j = await (await llamar({ reintento_en_seco: true })).json()
    expect(h.orden).toEqual(['reintento_en_seco', 'pedidos_en_seco'])
    expect(h.args[0].o).toEqual({ ejecutar: false })
    expect(j).toMatchObject({ accion: 'reintento_en_seco', pedidos: h.respuesta })
  })
  it('🔴 con la oficina apagada no corre; con «dry_run» tampoco', async () => {
    h.estado = 'apagada'
    await llamar({})
    h.estado = 'encendida'
    await llamar({ dry_run: true })
    expect(h.args).toEqual([])
  })
})
