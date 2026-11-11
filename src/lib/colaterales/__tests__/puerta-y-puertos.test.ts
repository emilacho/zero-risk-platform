/**
 * Colaterales 2d · parte 3 · la puerta de `/api/colaterales` (firma, seco obligatorio, llave de edición) y los puertos reales (lecturas con
 * la base falsa que devuelve SOLO las columnas del select y aplica cada filtro · línea 5 de CC7).
 */
import { describe, it, expect, vi } from 'vitest'
import { baseFalsa } from './base-falsa'
import { almacenDeColaterales } from '../almacen'
import { atenderColaterales, llaveDeEdicion } from '../puerta'
import { campanaDeLaEdicion, puertosDeSupabase } from '../puertos-supabase'
import type { PuertosDelTurno } from '../turno'
import type { Db } from '../almacen'

const CLI = 'a0000000-0000-4000-8000-00000000000a'
const CLI2 = 'b0000000-0000-4000-8000-00000000000b'
const FIRMA = { workflow_id: 'wf-colaterales', workflow_execution_id: '901' }
const EDIC = { client_id: CLI, documento: 'brief', documento_ref: 'camp-1', version_base: '2', version_nueva: '3', seccion: 'Insight', antes: 'a de antes', despues: 'b de después' }

function armar() {
  const { db, tablas } = baseFalsa()
  const P: PuertosDelTurno = { almacen: almacenDeColaterales(db), filasActivas: vi.fn(async () => new Set<string>()), piezasPorPublicar: vi.fn(async () => ({ frenan: [], se_asumen_publicadas: [] })), documentos: vi.fn(async () => ({})), gastoDelDia: vi.fn(async () => 0) }
  return { P, tablas }
}
const pedir = (P: PuertosDelTurno, c: Record<string, unknown>) => atenderColaterales(P, c, new Date('2026-11-11T12:00:00Z'))

describe('🔴 la firma del flujo es obligatoria en TODA acción (nadie llama directo)', () => {
  it.each(['recibir', 'turno', 'entregar', 'barrer'])('%s sin workflow_id o sin workflow_execution_id → 403, sin tocar nada', async (accion) => {
    for (const sin of [{ workflow_id: undefined }, { workflow_execution_id: undefined }, { workflow_id: '  ' }, { workflow_execution_id: '' }]) {
      const { P, tablas } = armar()
      const r = await pedir(P, { accion, ...EDIC, edicion_id: CLI, seco: true, sello: 'x', ...FIRMA, ...sin })
      expect(r.status).toBe(403)
      expect(tablas.colaterales_ediciones).toEqual([])
      expect(P.filasActivas).not.toHaveBeenCalled()
    }
  })
  it('acción desconocida → 400', async () => expect((await pedir(armar().P, { accion: 'aplicar', ...FIRMA })).status).toBe(400))
})

describe('recibir · la misma edición dos veces = una fila', () => {
  it('crea la edición con su llave y la corrida que la recibió; repetir devuelve la misma', async () => {
    const { P, tablas } = armar()
    const a = await pedir(P, { accion: 'recibir', ...EDIC, ...FIRMA })
    const b = await pedir(P, { accion: 'recibir', ...EDIC, ...FIRMA, workflow_execution_id: '902' })
    expect(a.cuerpo.accion).toBe('recibida')
    expect(b.cuerpo).toMatchObject({ accion: 'ya_existia', edicion_id: a.cuerpo.edicion_id })
    expect(tablas.colaterales_ediciones).toHaveLength(1)
    expect(tablas.colaterales_ediciones[0]).toMatchObject({ llave: llaveDeEdicion(EDIC), workflow_execution_id: '901', estado: 'recibida' })
  })
  it('la llave cambia con cada parte de la edición (otra versión nueva = otra edición)', () => {
    const base = llaveDeEdicion(EDIC)
    for (const k of ['client_id', 'documento', 'documento_ref', 'version_base', 'version_nueva'] as const) expect(llaveDeEdicion({ ...EDIC, [k]: EDIC[k] + 'x' })).not.toBe(base)
  })
  it.each([['client_id no uuid', { client_id: 'x' }], ['documento desconocido', { documento: 'folleto' }], ['sin versión nueva', { version_nueva: undefined }], ['antes = después', { despues: 'a de antes' }], ['antes vacío', { antes: ' ' }]])('%s → 400', async (_n, x) => {
    const { P, tablas } = armar()
    const c: Record<string, unknown> = { accion: 'recibir', ...EDIC, ...FIRMA, ...x }
    for (const [k, v] of Object.entries(x)) if (v === undefined) delete c[k]
    expect((await pedir(P, c)).status).toBe(400)
    expect(tablas.colaterales_ediciones).toEqual([])
  })
})

describe('🔴 turno · `seco` obligatorio (la ausencia NUNCA es real)', () => {
  it.each([['ausente', undefined], ['texto', 'false'], ['nulo', null], ['número', 0]])('seco %s → 400 y la edición sigue recibida', async (_n, seco) => {
    const { P, tablas } = armar()
    const id = (await pedir(P, { accion: 'recibir', ...EDIC, ...FIRMA })).cuerpo.edicion_id
    const c: Record<string, unknown> = { accion: 'turno', edicion_id: id, ...FIRMA }
    if (seco !== undefined) c.seco = seco
    const r = await pedir(P, c)
    expect(r.status).toBe(400)
    expect(r.cuerpo.error).toBe('seco_obligatorio')
    expect(tablas.colaterales_ediciones[0].estado).toBe('recibida')
  })
  it('seco true no escribe; seco false toma la edición (la corrida queda firmada)', async () => {
    const { P, tablas } = armar()
    const id = (await pedir(P, { accion: 'recibir', ...EDIC, ...FIRMA })).cuerpo.edicion_id
    const s = await pedir(P, { accion: 'turno', edicion_id: id, seco: true, ...FIRMA })
    expect(s.cuerpo).toMatchObject({ seco: true, accion: 'sin_motor' })
    expect(tablas.colaterales_ediciones[0].estado).toBe('recibida')
    const r = await pedir(P, { accion: 'turno', edicion_id: id, seco: false, ...FIRMA, workflow_execution_id: '903' })
    expect(r.cuerpo).toMatchObject({ seco: false, accion: 'sin_motor' })
    expect(tablas.colaterales_ediciones[0]).toMatchObject({ estado: 'sin_motor', workflow_execution_id: '903' })
  })
  it('edicion_id que no es uuid → 400 · entregar sin sello → 400', async () => {
    const { P } = armar()
    expect((await pedir(P, { accion: 'turno', edicion_id: 'x', seco: true, ...FIRMA })).status).toBe(400)
    expect((await pedir(P, { accion: 'entregar', edicion_id: CLI, ...FIRMA })).status).toBe(400)
  })
})

// ── los puertos reales con una base falsa que respeta columnas y filtros ──
function dbFalsa(tablas: Record<string, Record<string, unknown>[]>) {
  const pedidos: { tabla: string; cols: string[]; filtros: string[] }[] = []
  return {
    pedidos,
    db: {
      from(tabla: string) {
        const fs: ((f: Record<string, unknown>) => boolean)[] = []
        let cols: string[] = []
        const ped = { tabla, cols, filtros: [] as string[] }
        const api: Record<string, unknown> = {
          select: (c: string) => { cols = c.split(',').map((x) => x.trim()); ped.cols = cols; pedidos.push(ped); return api },
          eq: (k: string, v: unknown) => { ped.filtros.push(`eq:${k}`); fs.push((f) => f[k] === v); return api },
          gte: (k: string, v: unknown) => { ped.filtros.push(`gte:${k}`); fs.push((f) => String(f[k]) >= String(v)); return api },
          in: (k: string, vs: unknown[]) => { ped.filtros.push(`in:${k}`); fs.push((f) => vs.includes(f[k])); return api },
          then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve({ data: (tablas[tabla] ?? []).filter((f) => fs.every((fn) => fn(f))).map((f) => Object.fromEntries(cols.map((c) => [c, f[c]]))), error: null }).then(res, rej),
        }
        return api
      },
    } as unknown as Db,
  }
}
const cadenaFalsa = (o: { viva?: string | null; estrategia?: { version: number; estado: string; contenido: unknown } | null } = {}) => ({
  campanaViva: vi.fn(async () => (o.viva ? { id: o.viva } : null)),
  ultimaEstrategia: vi.fn(async (c: string) => (o.estrategia ? { campana_id: c, seco: false, agente: null, modelo: null, costo_usd: 0, workflow_execution_id: null, ...o.estrategia } : null)),
  estrategiaEnVersion: vi.fn(async () => null),
  insertarEstrategiaSiLibre: vi.fn(async () => true),
}) as never

describe('puertos reales · filas activas, gasto del día y documentos', () => {
  it('filas activas: solo las is_active = true, leídas de la base', async () => {
    const { db, pedidos } = dbFalsa({ jefatura_grading_policies: [{ artifact_type: 'pieza', is_active: true }, { artifact_type: 'brief', is_active: false }, { artifact_type: 'plan', is_active: true }] })
    expect([...(await puertosDeSupabase(db, undefined, cadenaFalsa()).filasActivas())].sort()).toEqual(['pieza', 'plan'])
    expect(pedidos[0]).toMatchObject({ cols: ['artifact_type'], filtros: ['eq:is_active'] })
  })
  it('gasto del día: suma los recibos de las corridas de colaterales del cliente creadas HOY (ni de ayer ni de otro cliente)', async () => {
    const { db } = dbFalsa({
      colaterales_ediciones: [
        { client_id: CLI, created_at: '2026-11-11T08:00:00Z', workflow_execution_id: '1' },
        { client_id: CLI, created_at: '2026-11-10T23:00:00Z', workflow_execution_id: '2' },
        { client_id: CLI2, created_at: '2026-11-11T09:00:00Z', workflow_execution_id: '3' },
        { client_id: CLI, created_at: '2026-11-11T10:00:00Z', workflow_execution_id: null },
      ],
      agent_invocations: [{ workflow_execution_id: '1', cost_usd: 0.21 }, { workflow_execution_id: '1', cost_usd: 0.04 }, { workflow_execution_id: '2', cost_usd: 5 }, { workflow_execution_id: '3', cost_usd: 7 }],
    })
    const P = puertosDeSupabase(db, () => new Date('2026-11-11T12:00:00Z'), cadenaFalsa())
    expect(await P.gastoDelDia(CLI)).toBeCloseTo(0.25, 6)
    expect(await P.gastoDelDia('sin-ediciones')).toBe(0)
  })
  it('documentos: la estrategia vigente de la campaña viva (edición del plan); una estrategia en borrador no se lee; sin campaña viva, nada', async () => {
    const e = { id: 'e', client_id: CLI, documento: 'plan' as const, documento_ref: 'plan-1', version_base: '1', seccion: 's', antes: 'a', despues: 'b', llave: 'l', estado: 'en_curso' as const, version_nueva: null, gravedad: null, nota: null }
    const { db } = dbFalsa({})
    const viva = await puertosDeSupabase(db, undefined, cadenaFalsa({ viva: 'camp-viva', estrategia: { version: 4, estado: 'aprobada', contenido: { x: 'y' } } })).documentos(e, ['estrategia', 'brief'])
    expect(viva).toEqual({ estrategia: { texto: JSON.stringify({ x: 'y' }), ref: 'camp-viva', version: '4' } })
    expect(await puertosDeSupabase(db, undefined, cadenaFalsa({ viva: 'camp-viva', estrategia: { version: 4, estado: 'borrador', contenido: {} } })).documentos(e, ['estrategia'])).toEqual({})
    expect(await puertosDeSupabase(db, undefined, cadenaFalsa({ viva: null, estrategia: { version: 1, estado: 'aprobada', contenido: {} } })).documentos(e, ['estrategia'])).toEqual({})
    expect(await puertosDeSupabase(db, undefined, cadenaFalsa({ viva: 'camp-viva', estrategia: { version: 4, estado: 'aprobada', contenido: {} } })).documentos(e, ['brief', 'pieza'])).toEqual({})
  })
  it('🔴 si la base falla, cada lectura LANZA (el turno frena · nunca «cero gasto» ni «ninguna fila activa»)', async () => {
    const caida = { from: () => { const api: Record<string, unknown> = { select: () => api, eq: () => api, gte: () => api, in: () => api, then: (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'caída' } }).then(res) }; return api } } as unknown as Db
    const P = puertosDeSupabase(caida, () => new Date('2026-11-11T12:00:00Z'), cadenaFalsa())
    await expect(P.filasActivas()).rejects.toThrow(/caída/)
    await expect(P.gastoDelDia(CLI)).rejects.toThrow(/caída/)
  })
  it('la campaña de la edición: la del documento si es de campaña; la viva si es del cliente', async () => {
    const viva = vi.fn(async () => ({ id: 'viva' }))
    expect(await campanaDeLaEdicion({ client_id: CLI, documento: 'brief', documento_ref: 'camp-x' }, viva)).toBe('camp-x')
    expect(viva).not.toHaveBeenCalled()
    for (const documento of ['manual', 'plan'] as const) expect(await campanaDeLaEdicion({ client_id: CLI, documento, documento_ref: 'r' }, viva)).toBe('viva')
  })
})
