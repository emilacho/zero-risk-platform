/**
 * 11-nov · 🟡 CC7 sobre #1019 (formatos sin familia) · el ADAPTADOR real (lo que la base en memoria no ve):
 *   (1) el aviso llega al buzón con SU origen («formato sin familia»), no como «lote sin parte»;
 *   (2) la nota «ya anotada» se lee de la columna `avisos`: con una base falsa que devuelve SOLO las columnas pedidas, la segunda pasada del reloj no vuelve a escribir ni a avisar.
 * Base y buzón simulados: US$ 0, sin red.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── la base falsa: respeta las columnas pedidas (`select`), los filtros `eq`/`in` y la escritura `update` (con `select` de vuelta)
type Fila = Record<string, unknown>
const tablas: Record<string, Fila[]> = {}
const escrituras: Array<{ tabla: string; patch: Fila }> = []
function consulta(tabla: string) {
  let cols: string[] | null = null, patch: Fila | null = null, lim = Infinity
  const filtros: Array<(f: Fila) => boolean> = []
  const proyectar = (f: Fila): Fila => (cols === null ? { ...f } : Object.fromEntries(cols.map((c) => [c, f[c]]).filter(([, v]) => v !== undefined)))
  const correr = (): Fila[] => {
    const filas = (tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f))).slice(0, lim)
    if (patch) { for (const f of filas) Object.assign(f, structuredClone(patch)); escrituras.push({ tabla, patch: structuredClone(patch) }) }
    return filas.map(proyectar)
  }
  const q: any = {
    select: (c: string) => { cols = c.trim() === '*' ? null : c.split(',').map((x) => x.trim()); return q },
    eq: (c: string, v: unknown) => { filtros.push((f) => f[c] === v); return q },
    in: (c: string, vs: unknown[]) => { filtros.push((f) => vs.includes(f[c])); return q },
    limit: (n: number) => { lim = n; return q },
    order: () => q,
    update: (p: Fila) => { patch = p; return q },
    maybeSingle: async () => ({ data: correr()[0] ?? null, error: null }),
    then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: correr(), error: null }).then(ok, ko),
  }
  return q
}
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ from: (t: string) => consulta(t) }) }))
vi.mock('@/lib/sala-recados/almacen-supabase', () => ({ almacenDeSupabase: () => ({}) }))
vi.mock('@/lib/run-sdk-spend-gate', () => ({ checkRunSdkSpendCap: async () => ({ blocked: false }) }))
vi.mock('@/lib/sala-event-log', () => ({ SupabaseEventLogStorage: class { constructor(public db: unknown) {} } }))
vi.mock('@/lib/sala-ingress', () => ({ isIntakeEnabled: () => true, orchestrateIngress: async () => ({ kind: 'accepted' }), SupabaseIngressTables: class {} }))
vi.mock('@/lib/sala-router-consumer/inmediato-supabase', () => ({ programarDespachoInmediato: () => 'programado' }))
// ── el buzón (C1): un espía de `avisar` · la clave ya vista suma una repetición
const avisados: Array<Record<string, unknown>> = []
vi.mock('@/lib/avisos/nucleo', () => ({ avisar: async (_d: unknown, a: Record<string, unknown>) => { const accion = avisados.some((x) => x.clave === a.clave) ? 'repetida' : 'abrio'; avisados.push(a); return { accion, slack: 'no' } } }))
vi.mock('@/lib/avisos/adaptadores', () => ({ dependenciasReales: () => ({}) }))

import { almacenDeSupabase } from '../almacen-supabase'
import { filasLotes } from '../datos'
import { esNotaSinFamilia } from '../sin-familia'
import { formatosDeLaMigracion } from '../__fixtures__/clientes'
import type { Almacen, Campana } from '../almacen'
import type { FormatosPorRed } from '../tipos'

const CAMP = '28de888e-b3f2-4aca-86b3-2c7f7bf6685a', CLIENTE = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312' // Náufrago (real)
const formatosReales = (): FormatosPorRed => {
  const t = formatosDeLaMigracion()
  for (const xs of Object.values(t)) for (const x of xs) if (x.formato === 'foto') x.familia = 'post_img'
  return t
}
const fila = (id: string, red: string, formato: string, fecha: string): Fila => ({ campana_id: CAMP, calendario_version: 1, id, fecha, hora: '12:00:00', red, formato, estado: 'validada', avisos: [], seco: false })

beforeEach(() => {
  avisados.length = 0; escrituras.length = 0
  tablas.cadena_calendario_filas = [fila('s1-d3-mie_foto', 'instagram', 'foto', '2026-11-11'), fila('s1-d4-jue_anuncio_gye', 'instagram', 'anuncio_imagen', '2026-11-12'), fila('s1-d4-jue_anuncio_fb', 'facebook', 'anuncio_imagen', '2026-11-12')]
})

describe('adaptador · el aviso llega al buzón con su origen (1)', () => {
  it('🔴 con `origen` pasa ESE origen al buzón (no «lote sin parte»), sin colarlo como otro campo', async () => {
    const r = await almacenDeSupabase().avisarLoteMuerto!({ clave: 'k1', client_id: CLIENTE, titulo: 't', detalle: 'd', workflow_id: null, workflow_execution_id: null, origen: 'cadena/reloj · formato sin familia' })
    expect(r).toMatchObject({ ok: true })
    expect(avisados).toHaveLength(1)
    expect(avisados[0]).toMatchObject({ clave: 'k1', tipo: 'alarma', origen: 'cadena/reloj · formato sin familia', origen_tipo: 'plataforma' })
  })
  it('sin `origen`, el de siempre (el lote muerto no cambia)', async () => {
    await almacenDeSupabase().avisarLoteMuerto!({ clave: 'k2', client_id: CLIENTE, titulo: 't', detalle: 'd', workflow_id: null, workflow_execution_id: null })
    expect(avisados[0]).toMatchObject({ origen: 'cadena/reloj · lote sin parte' })
  })
})

describe('adaptador · la nota se lee de la columna `avisos` (2)', () => {
  it('🔴 con una base que devuelve SOLO las columnas pedidas: la primera pasada anota y avisa; la segunda no escribe ni avisa', async () => {
    const real = almacenDeSupabase()
    const al = {
      campana: async () => ({ id: CAMP, client_id: CLIENTE, estado: 'activa', seco: false }) as unknown as Campana,
      leerConfig: async (k: string) => (k === 'flujos' ? ['wf-vigia'] : undefined),
      journeyExiste: async () => false,
      formatos: async () => formatosReales(),
      ultimaVersionDeCalendario: async () => 1,
      filas: real.filas.bind(real),
      reubicarFila: real.reubicarFila.bind(real),
      avisarLoteMuerto: real.avisarLoteMuerto!.bind(real),
    } as unknown as Almacen
    const pasar = () => filasLotes(al, { workflow_id: 'wf-vigia', workflow_execution_id: 'ex-1', campana_id: CAMP, hoy: '2026-11-10' }, '2026-11-10T14:33:00Z')
    const r1 = await pasar()
    expect((r1.cuerpo.lotes as Array<{ fila_ids: string[] }>)[0].fila_ids).toEqual(['s1-d3-mie_foto'])
    expect(r1.cuerpo.sin_familia).toMatchObject({ anotadas: 2 })
    expect(escrituras).toHaveLength(2)
    expect(avisados).toHaveLength(1)
    for (const f of tablas.cadena_calendario_filas) expect((f.avisos as string[]).filter(esNotaSinFamilia)).toHaveLength(f.formato === 'anuncio_imagen' ? 1 : 0)
    // segunda pasada del reloj (30 min después): la nota ya está en la columna → nada que escribir ni avisar
    const r2 = await pasar()
    expect(r2.cuerpo.sin_familia).toMatchObject({ anotadas: 0 })
    expect(escrituras).toHaveLength(2)
    expect(avisados).toHaveLength(1)
    for (const f of tablas.cadena_calendario_filas) expect((f.avisos as string[]).filter(esNotaSinFamilia).length).toBeLessThanOrEqual(1)
  })
})
