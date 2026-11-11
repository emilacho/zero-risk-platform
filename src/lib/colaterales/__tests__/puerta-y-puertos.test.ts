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
  const P: PuertosDelTurno = { almacen: almacenDeColaterales(db), filasActivas: vi.fn(async () => new Set<string>()), piezasPorPublicar: vi.fn(async () => ({ frenan: [], se_asumen_publicadas: [] })), documentos: vi.fn(async () => ({})), campanaDelCliente: vi.fn(async () => true), gastoDelDia: vi.fn(async () => ({ recibos: 0, en_vuelo: 0, revisiones: 0, revisiones_abiertas: 0 })), topeDiario: vi.fn(async () => 5), gastoDeLaEdicion: vi.fn(async () => ({ cobrado: 0, secretaria_sin_recibo: 0, rehacer_sin_recibo: 0, revisiones_abiertas: 0 })), abrirRevisionColateral: vi.fn(async () => ({ estado: 'esperando' as const, revision_id: 'rev-1' })), aplicar: vi.fn(async () => ({ aplicados: [], pendientes: [], ya_cambiaron: [] })) }
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
          is: (k: string, v: unknown) => { ped.filtros.push(`is:${k}`); fs.push((f) => (f[k] ?? null) === v); return api },
          limit: () => api,
          then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve({ data: (tablas[tabla] ?? []).filter((f) => fs.every((fn) => fn(f))).map((f) => (cols.includes('*') ? { ...f } : Object.fromEntries(cols.map((c) => [c, f[c]])))), error: null }).then(res, rej),
        }
        return api
      },
    } as unknown as Db,
  }
}
const cadenaFalsa = (o: { viva?: string | null; estrategia?: { version: number; estado: string; contenido: unknown } | null; campanas?: Record<string, { client_id: string }>; caida?: boolean } = {}) => ({
  campana: vi.fn(async (id: string) => { if (o.caida) throw new Error('cadena caída'); return o.campanas?.[id] ? { id, ...o.campanas[id] } : null }),
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
  it('🔴 gasto del día (línea de CC7): recibos por la FECHA DEL RECIBO + las ediciones tomadas sin recibo cuentan como en vuelo; ni otro cliente ni la edición que pregunta', async () => {
    const ed = (id: string, client_id: string, estado: string, created_at: string, updated_at: string, workflow_execution_id: string | null) => ({ id, client_id, estado, created_at, updated_at, workflow_execution_id })
    const { db, pedidos } = dbFalsa({
      colaterales_ediciones: [
        ed('e1', CLI, 'lista', '2026-11-11T07:00:00Z', '2026-11-11T08:00:00Z', '1'), // hoy, con dos recibos de hoy
        ed('e2', CLI, 'en_curso', '2026-11-10T20:00:00Z', '2026-11-11T09:00:00Z', '2'), // CREADA AYER, tomada hoy, con recibo de hoy: cuenta, y no está en vuelo
        ed('e3', CLI, 'lista', '2026-11-10T07:00:00Z', '2026-11-10T08:00:00Z', '3'), // de ayer, recibo de ayer: no cuenta
        ed('e4', CLI2, 'lista', '2026-11-11T07:00:00Z', '2026-11-11T08:00:00Z', '4'), // otro cliente
        ed('e5', CLI, 'en_curso', '2026-11-10T22:00:00Z', '2026-11-10T23:00:00Z', '5'), // tomada AYER, sigue sin recibo: en vuelo
        ed('e6', CLI, 'en_curso', '2026-11-11T10:00:00Z', '2026-11-11T10:00:00Z', null), // tomada hoy sin corrida firmada: en vuelo
        ed('e7', CLI, 'en_curso', '2026-11-11T11:00:00Z', '2026-11-11T11:00:00Z', '7'), // la que pregunta: no se cuenta a sí misma
        ed('e8', CLI, 'sin_colaterales', '2026-11-11T06:00:00Z', '2026-11-11T06:01:00Z', '8'), // cerrada hoy sin llamar al agente: ni recibo ni en vuelo
        ed('e9', CLI, 'lista', '2026-11-11T00:30:00Z', '2026-11-11T00:40:00Z', '9'), // tocada hoy, pero su recibo es de ayer 23:59: no cuenta
      ],
      agent_invocations: [
        { workflow_execution_id: '1', cost_usd: 0.21, created_at: '2026-11-11T07:30:00Z' }, { workflow_execution_id: '1', cost_usd: 0.04, created_at: '2026-11-11T07:31:00Z' },
        { workflow_execution_id: '2', cost_usd: 0.1, created_at: '2026-11-11T09:10:00Z' }, { workflow_execution_id: '3', cost_usd: 5, created_at: '2026-11-10T07:30:00Z' },
        { workflow_execution_id: '4', cost_usd: 7, created_at: '2026-11-11T07:30:00Z' }, { workflow_execution_id: '9', cost_usd: 0.3, created_at: '2026-11-10T23:59:00Z' },
        { workflow_execution_id: '7', cost_usd: 9, created_at: '2026-11-11T11:01:00Z' },
      ],
    })
    const P = puertosDeSupabase(db, () => new Date('2026-11-11T12:00:00Z'), cadenaFalsa())
    const g = await P.gastoDelDia(CLI, 'e7')
    expect(g.recibos).toBeCloseTo(0.35, 6)
    expect(g.en_vuelo).toBe(2)
    expect(await P.gastoDelDia('sin-ediciones', 'x')).toEqual({ recibos: 0, en_vuelo: 0, revisiones: 0, revisiones_abiertas: 0 })
    // las lecturas piden SOLO lo que usan y filtran en la base
    expect(pedidos.filter((q) => q.tabla === 'colaterales_ediciones').map((q) => q.filtros)).toContainEqual(['eq:client_id', 'gte:updated_at'])
    expect(pedidos.filter((q) => q.tabla === 'colaterales_ediciones').map((q) => q.filtros)).toContainEqual(['eq:client_id', 'eq:estado'])
    expect(pedidos.find((q) => q.tabla === 'agent_invocations')).toMatchObject({ filtros: ['in:workflow_execution_id'] })
  })
  it('🔴 pieza D: el gasto de UNA edición lee sus llamadas por la llave EXACTA (una edición nunca suma las de otra), sus recibos y sus revisiones; lo sin recibo va aparte', async () => {
    const E = 'e0000000-0000-4000-8000-0000000000e1'
    const OTRA = 'e0000000-0000-4000-8000-0000000000e1x'
    const { db, pedidos } = dbFalsa({
      agent_dispatches: [
        { dispatch_key: `colaterales:${E}:secretaria`, workflow_execution_id: '100' },
        { dispatch_key: `colaterales:${E}:rehacer`, workflow_execution_id: '101' },
        // otra edición cuyo id EMPIEZA igual, y una llave parecida: no cuentan
        { dispatch_key: `colaterales:${OTRA}:secretaria`, workflow_execution_id: '900' },
        { dispatch_key: `colaterales:${E}:secretaria:extra`, workflow_execution_id: '901' },
      ],
      agent_invocations: [{ workflow_execution_id: '100', cost_usd: '0.04' }, { workflow_execution_id: '100', cost_usd: 0.01 }, { workflow_execution_id: '900', cost_usd: 9 }, { workflow_execution_id: '901', cost_usd: 9 }],
      colaterales_retoques: [{ edicion_id: E, revision_id: 'r1' }, { edicion_id: E, revision_id: 'r1' }, { edicion_id: E, revision_id: 'r2' }, { edicion_id: 'otra', revision_id: 'r9' }],
      jefatura_revisiones: [{ id: 'r1', estado: 'cerrada', gasto_usd: '0.12' }, { id: 'r2', estado: 'esperando_turno', gasto_usd: 0.02 }, { id: 'r9', estado: 'cerrada', gasto_usd: 9 }].map((f) => ({ ...f, client_id: CLI, artifact_type: 'colateral', artifact_id: 'x', policy_snapshot: { artifact_type: 'colateral' } })),
    })
    const g = await puertosDeSupabase(db, () => new Date('2026-11-11T12:00:00Z'), cadenaFalsa()).gastoDeLaEdicion({ id: E, workflow_execution_id: '100' } as never)
    expect(g.cobrado).toBeCloseTo(0.04 + 0.01 + 0.12, 6)
    expect(g).toMatchObject({ secretaria_sin_recibo: 0, rehacer_sin_recibo: 1, revisiones_abiertas: 1 })
    expect(pedidos.find((q) => q.tabla === 'agent_dispatches')).toMatchObject({ filtros: ['in:dispatch_key'] })
  })
  it('🔴 pieza D: si el flujo no pasó la llave, la primera llamada se reconoce por la ejecución de la edición; sin recibo cuenta aparte (nunca 0)', async () => {
    const E = 'e0000000-0000-4000-8000-0000000000e2'
    const sinRecibo = dbFalsa({ agent_dispatches: [], agent_invocations: [], colaterales_retoques: [], jefatura_revisiones: [] })
    expect(await puertosDeSupabase(sinRecibo.db, undefined, cadenaFalsa()).gastoDeLaEdicion({ id: E, workflow_execution_id: '7' } as never)).toEqual({ cobrado: 0, secretaria_sin_recibo: 1, rehacer_sin_recibo: 0, revisiones_abiertas: 0 })
    const conRecibo = dbFalsa({ agent_dispatches: [], agent_invocations: [{ workflow_execution_id: '7', cost_usd: 0.03 }], colaterales_retoques: [], jefatura_revisiones: [] })
    expect(await puertosDeSupabase(conRecibo.db, undefined, cadenaFalsa()).gastoDeLaEdicion({ id: E, workflow_execution_id: '7' } as never)).toMatchObject({ cobrado: 0.03, secretaria_sin_recibo: 0 })
  })
  it('🔴 hueco 1 de CC6: la PRIMERA revisión sigue contando cuando todos sus retoques se rehicieron (se lee también por la edición misma · Náufrago y B2B)', async () => {
    for (const [E, CL] of [['e0000000-0000-4000-8000-0000000000a1', CLI], ['e0000000-0000-4000-8000-0000000000b1', CLI2]] as const) {
      const rev = (id: string, estado: string, gasto_usd: number, artifact_id: string, version: number) => ({ id, client_id: CL, estado, gasto_usd, artifact_type: 'colateral', artifact_id, version, policy_snapshot: { artifact_type: 'colateral' } })
      const { db } = dbFalsa({
        colaterales_ediciones: [{ id: E, client_id: CL, estado: 'en_curso', updated_at: '2026-11-11T08:00:00Z', workflow_execution_id: '50' }],
        // los dos retoques se rehicieron: soltaron la revisión 1 y aún no tienen la 2
        colaterales_retoques: [{ edicion_id: E, revision_id: null }, { edicion_id: E, revision_id: null }],
        jefatura_revisiones: [rev('v1', 'cerrada', 0.3, E, 1), rev('v2', 'esperando_turno', 0, E, 2), rev('otra', 'cerrada', 9, 'otra-edicion', 1), { ...rev('pieza', 'cerrada', 9, E, 1), artifact_type: 'pieza' }],
        agent_dispatches: [], agent_invocations: [{ workflow_execution_id: '50', cost_usd: 0.04, created_at: '2026-11-11T08:00:00Z' }],
      })
      const P = puertosDeSupabase(db, () => new Date('2026-11-11T12:00:00Z'), cadenaFalsa())
      const g = await P.gastoDeLaEdicion({ id: E, workflow_execution_id: '50' } as never)
      expect(g.cobrado).toBeCloseTo(0.04 + 0.3, 6)
      expect(g.revisiones_abiertas).toBe(1)
      const d = await P.gastoDelDia(CL, null)
      expect(d.revisiones).toBeCloseTo(0.3, 6)
      expect(d.revisiones_abiertas).toBe(1)
    }
  })
  it('🔴 hueco 1 de CC6: una revisión que nombran los retoques Y la edición cuenta UNA sola vez', async () => {
    const E = 'e0000000-0000-4000-8000-0000000000a2'
    const { db } = dbFalsa({
      colaterales_retoques: [{ edicion_id: E, revision_id: 'v1' }],
      jefatura_revisiones: [{ id: 'v1', client_id: CLI, estado: 'cerrada', gasto_usd: 0.2, artifact_type: 'colateral', artifact_id: E, policy_snapshot: { artifact_type: 'colateral' } }],
      agent_dispatches: [], agent_invocations: [],
    })
    expect((await puertosDeSupabase(db, undefined, cadenaFalsa()).gastoDeLaEdicion({ id: E, workflow_execution_id: null } as never)).cobrado).toBeCloseTo(0.2, 6)
  })
  it('🔴 hueco 2 de CC6: el gasto del día suma el recibo del REHACER (otra ejecución, por su llave exacta); sin recibo cuenta en vuelo; la llave de otra edición no entra (B2B y Náufrago)', async () => {
    for (const CL of [CLI2, CLI]) {
      const E = 'e0000000-0000-4000-8000-0000000000c1', F = 'e0000000-0000-4000-8000-0000000000c2'
      const base = (rehacerEx: string) => dbFalsa({
        colaterales_ediciones: [{ id: E, client_id: CL, estado: 'lista', updated_at: '2026-11-11T08:00:00Z', workflow_execution_id: '60' }, { id: F, client_id: CL, estado: 'lista', updated_at: '2026-11-11T08:00:00Z', workflow_execution_id: '70' }],
        colaterales_retoques: [], jefatura_revisiones: [],
        agent_dispatches: [
          { dispatch_key: `colaterales:${E}:secretaria`, workflow_execution_id: '60' },
          { dispatch_key: `colaterales:${E}:rehacer`, workflow_execution_id: rehacerEx },
          { dispatch_key: `colaterales:${E}x:rehacer`, workflow_execution_id: '99' },
        ],
        agent_invocations: [
          { workflow_execution_id: '60', cost_usd: 0.1, created_at: '2026-11-11T08:00:00Z' }, { workflow_execution_id: '70', cost_usd: 0.05, created_at: '2026-11-11T08:00:00Z' },
          { workflow_execution_id: '61', cost_usd: 0.12, created_at: '2026-11-11T09:00:00Z' }, { workflow_execution_id: '99', cost_usd: 9, created_at: '2026-11-11T09:00:00Z' },
        ],
      })
      const ahora = () => new Date('2026-11-11T12:00:00Z')
      const con = await puertosDeSupabase(base('61').db, ahora, cadenaFalsa()).gastoDelDia(CL, null)
      expect(con.recibos).toBeCloseTo(0.1 + 0.05 + 0.12, 6)
      expect(con.en_vuelo).toBe(0)
      const sin = await puertosDeSupabase(base('62').db, ahora, cadenaFalsa()).gastoDelDia(CL, null)
      expect(sin.recibos).toBeCloseTo(0.1 + 0.05, 6)
      expect(sin.en_vuelo).toBe(1)
    }
  })
  it('🔴 pieza B: el gasto del día suma las revisiones de la jefatura de ESAS ediciones (cerradas por su gasto; abiertas, contadas aparte); ni las de otro cliente ni las de la que pregunta', async () => {
    const ed = (id: string, client_id: string, estado: string, workflow_execution_id: string | null) => ({ id, client_id, estado, created_at: '2026-11-11T07:00:00Z', updated_at: '2026-11-11T08:00:00Z', workflow_execution_id })
    const { db, pedidos } = dbFalsa({
      colaterales_ediciones: [ed('e1', CLI, 'lista', '1'), ed('e2', CLI, 'en_curso', '2'), ed('e3', CLI2, 'lista', '3'), ed('e7', CLI, 'en_curso', '7')],
      colaterales_retoques: [
        { edicion_id: 'e1', revision_id: 'r1' }, { edicion_id: 'e1', revision_id: 'r1' }, { edicion_id: 'e1', revision_id: null },
        { edicion_id: 'e2', revision_id: 'r2' }, { edicion_id: 'e3', revision_id: 'r3' }, { edicion_id: 'e7', revision_id: 'r7' },
      ],
      jefatura_revisiones: [{ id: 'r1', estado: 'cerrada', gasto_usd: '0.21' }, { id: 'r2', estado: 'esperando_turno', gasto_usd: 0.05 }, { id: 'r3', estado: 'cerrada', gasto_usd: 9 }, { id: 'r7', estado: 'cerrada', gasto_usd: 9 }].map((f) => ({ ...f, client_id: CLI, artifact_type: 'colateral', artifact_id: 'x', policy_snapshot: { artifact_type: 'colateral' } })),
      agent_invocations: [],
    })
    const g = await puertosDeSupabase(db, () => new Date('2026-11-11T12:00:00Z'), cadenaFalsa()).gastoDelDia(CLI, 'e7')
    expect(g.revisiones).toBeCloseTo(0.21, 6)
    expect(g.revisiones_abiertas).toBe(1)
    expect(pedidos.find((q) => q.tabla === 'colaterales_retoques')).toMatchObject({ cols: ['edicion_id', 'revision_id'], filtros: ['in:edicion_id'] })
    // por el almacén de la jefatura: las de esas ediciones por su propio nombre (hueco 1 de CC6) y una lectura por revisión de sus retoques, filtrada por id (nunca la de otro cliente ni la de la que pregunta)
    expect(pedidos.filter((q) => q.tabla === 'jefatura_revisiones').map((q) => q.filtros)).toEqual([['eq:artifact_type', 'in:artifact_id'], ['eq:id'], ['eq:id']])
  })
  it('🔴 tope diario (RESPUESTA Lenovo 03:02Z): la fila del cliente manda; sin fila, la por omisión; sin ninguna o con un valor inválido, null', async () => {
    const filas = [{ client_id: null, tope_usd: '5.00' }, { client_id: CLI2, tope_usd: 12 }]
    const { db, pedidos } = dbFalsa({ colaterales_topes_diarios: filas })
    const P = puertosDeSupabase(db, undefined, cadenaFalsa())
    expect(await P.topeDiario(CLI2)).toBe(12)
    expect(await P.topeDiario(CLI)).toBe(5)
    expect(pedidos.filter((q) => q.tabla === 'colaterales_topes_diarios').map((q) => q.filtros)).toEqual([['eq:client_id'], ['eq:client_id'], ['is:client_id']])
    expect(pedidos.every((q) => q.cols.join() === 'tope_usd')).toBe(true)
    expect(await puertosDeSupabase(dbFalsa({}).db, undefined, cadenaFalsa()).topeDiario(CLI)).toBeNull()
    expect(await puertosDeSupabase(dbFalsa({ colaterales_topes_diarios: [{ client_id: CLI, tope_usd: 0 }, { client_id: null, tope_usd: 5 }] }).db, undefined, cadenaFalsa()).topeDiario(CLI)).toBeNull()
    expect(await puertosDeSupabase(dbFalsa({ colaterales_topes_diarios: [{ client_id: null, tope_usd: null }] }).db, undefined, cadenaFalsa()).topeDiario(CLI)).toBeNull()
  })
  it('🔴 la campaña es del cliente (línea de CC6): la suya sí; la de otro cliente o una que no existe, no; si la cadena falla, lanza', async () => {
    const { db } = dbFalsa({})
    const campanas = { 'camp-a': { client_id: CLI }, 'camp-b': { client_id: CLI2 } }
    const P = puertosDeSupabase(db, undefined, cadenaFalsa({ campanas }))
    expect(await P.campanaDelCliente(CLI, 'camp-a')).toBe(true)
    expect(await P.campanaDelCliente(CLI, 'camp-b')).toBe(false)
    expect(await P.campanaDelCliente(CLI2, 'camp-b')).toBe(true)
    expect(await P.campanaDelCliente(CLI, 'no-existe')).toBe(false)
    await expect(puertosDeSupabase(db, undefined, cadenaFalsa({ caida: true })).campanaDelCliente(CLI, 'camp-a')).rejects.toThrow(/caída/)
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
    const caida = { from: () => { const api: Record<string, unknown> = { select: () => api, eq: () => api, gte: () => api, in: () => api, is: () => api, then: (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'caída' } }).then(res) }; return api } } as unknown as Db
    const P = puertosDeSupabase(caida, () => new Date('2026-11-11T12:00:00Z'), cadenaFalsa())
    await expect(P.filasActivas()).rejects.toThrow(/caída/)
    await expect(P.gastoDelDia(CLI, 'x')).rejects.toThrow(/caída/)
    await expect(P.topeDiario(CLI)).rejects.toThrow(/caída/)
  })
  it('la campaña de la edición: la del documento si es de campaña; la viva si es del cliente', async () => {
    const viva = vi.fn(async () => ({ id: 'viva' }))
    expect(await campanaDeLaEdicion({ client_id: CLI, documento: 'brief', documento_ref: 'camp-x' }, viva)).toBe('camp-x')
    expect(viva).not.toHaveBeenCalled()
    for (const documento of ['manual', 'plan'] as const) expect(await campanaDeLaEdicion({ client_id: CLI, documento, documento_ref: 'r' }, viva)).toBe('viva')
  })
})
