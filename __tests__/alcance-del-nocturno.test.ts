/**
 * EL ALCANCE DEL NOCTURNO · `POST /api/brain/reindex-stale` acepta `client_id`.
 * Encargo · `raw/tasks/2026-08-28-LENOVO-CC2-el-alcance-del-nocturno.md`
 * Firma del Arquitecto · 2026-08-27 20:22:44 UTC · «si no acepta alcance, ÉSE es el trabajo».
 *
 * ── POR QUÉ ────────────────────────────────────────────────────────────────────
 * El manual tiene que estar en el cerebro AL TERMINAR el alta (§144). El cómo lo
 * firmó el Arquitecto: **reusar el nocturno, no escribir un segundo indexador**.
 * Pero el nocturno sólo acepta `{ dry_run, max_per_table }` — dispararlo por alta
 * RE-ESCANEARÍA TODO, y esa puerta crece con cada cliente.
 *
 * ── LOS DOS ROJOS (medidos ANTES · los dos fallan sobre el código de hoy) ──────
 *  R1 · ALCANCE · pasar `client_id` y procesar SÓLO ése.
 *       HOY: el campo se ignora ⇒ ninguna consulta lleva `.eq('client_id', …)`.
 *  R2 · TOPE · un cliente con más filas que el tope queda COMPLETO.
 *       HOY: `.limit(max_per_table * 2)` = 20 ⇒ de 51 filas se detectan 20.
 *       🔴 Medición 2026-08-27: Peniche tiene **51** filas competitivas y **40** de ICP.
 *          El alcance solo NO alcanza — el tope hay que arreglarlo aparte.
 *
 * ── EL ROJO DE NO-REGRESIÓN (protege la red) ──────────────────────────────────
 *  SIN `client_id` la conducta es IDÉNTICA a la de hoy: sin `.eq`, con `.limit(20)`,
 *  mismo orden. Pasa ANTES y DESPUÉS. Si alguna vez falla, la red nocturna cambió.
 *
 * $0 · sin red · sin base · sin modelo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseReindexScope } from '../src/app/api/brain/reindex-stale/route'

const CLIENTE = '92148d0e-d2d1-40b9-b209-982edc968b7e' // Náufrago
const OTRO = 'dc89fe24-81ba-4862-ae6b-d39be2e5bea6' // Sweet & Coffee

/** Registro de lo que cada consulta pidió · es lo que las pruebas inspeccionan. */
interface Llamada {
  tabla: string
  eq: Array<[string, unknown]>
  limit: number | null
  order: string | null
  gte: string | null
}

let llamadas: Llamada[] = []
/** Filas por tabla · la "base" de mentira. */
let filas: Record<string, Array<Record<string, unknown>>> = {}
/** Fragmentos ya existentes · controlan qué está pendiente. */
let fragmentos: Array<{ source_id: string; updated_at: string }> = []

function tablaFalsa(tabla: string) {
  const reg: Llamada = { tabla, eq: [], limit: null, order: null, gte: null }
  llamadas.push(reg)
  const resolver = () => {
    if (tabla === 'client_brain_chunks') return { data: fragmentos, error: null }
    let out = (filas[tabla] ?? []).slice()
    for (const [col, val] of reg.eq) out = out.filter((r) => r[col] === val)
    // el orden real es updated_at DESC
    out.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
    // 🔴 el stub HONRA el tope · si no lo honrara, R2 no podría dar rojo
    if (reg.limit !== null) out = out.slice(0, reg.limit)
    return { data: out, error: null }
  }
  const q: Record<string, unknown> = {}
  const chain = (fn: (...a: never[]) => void) =>
    (...args: never[]) => {
      fn(...args)
      return q
    }
  q.select = chain(() => {})
  q.gte = chain(((col: string) => {
    reg.gte = col
  }) as never)
  q.order = chain(((col: string) => {
    reg.order = col
  }) as never)
  q.limit = chain(((n: number) => {
    reg.limit = n
  }) as never)
  q.eq = chain(((col: string, val: unknown) => {
    reg.eq.push([col, val])
  }) as never)
  q.in = chain(() => {})
  q.then = (res: (v: unknown) => unknown) => Promise.resolve(resolver()).then(res)
  return q
}

const supabaseMock = { from: (t: string) => tablaFalsa(t) }
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => supabaseMock }))
vi.mock('@/lib/internal-auth', () => ({ checkInternalKey: () => ({ ok: true }) }))

const fetchMock = vi.fn(async () => ({ ok: true, text: async () => '' }))

beforeEach(() => {
  llamadas = []
  filas = {
    client_brand_books: [],
    client_icp_documents: [],
    client_voc_library: [],
    client_competitive_landscape: [],
  }
  fragmentos = []
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})

const hoy = () => new Date().toISOString()

function pedir(body: Record<string, unknown>) {
  return new Request('https://zero-risk-platform.vercel.app/api/brain/reindex-stale', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const correr = async (body: Record<string, unknown>) => {
  const { POST } = await import('../src/app/api/brain/reindex-stale/route')
  const res = await POST(pedir(body))
  return { res, json: (await res.json()) as Record<string, never> }
}

/** filas de manual · `n` por cliente · todas pendientes (sin fragmentos previos). */
function sembrarManuales(tabla: string, cliente: string, n: number, prefijo: string) {
  const base = filas[tabla] ?? []
  for (let i = 0; i < n; i++) {
    base.push({
      id: `${prefijo}-${String(i).padStart(3, '0')}`,
      client_id: cliente,
      updated_at: new Date(Date.now() - i * 1000).toISOString(),
      voice_description: `texto suficientemente largo para pasar el filtro ${i}`,
    })
  }
  filas[tabla] = base
}

describe('🔴 R1 · ALCANCE · con client_id procesa SÓLO ese cliente', () => {
  it('todas las consultas de fuente filtran por el cliente pedido', async () => {
    sembrarManuales('client_brand_books', CLIENTE, 1, 'mio')
    sembrarManuales('client_brand_books', OTRO, 1, 'ajeno')

    const { json } = await correr({ client_id: CLIENTE, dry_run: true })

    const deFuente = llamadas.filter((l) => l.tabla !== 'client_brain_chunks')
    expect(deFuente.length, 'no consultó las 4 tablas de fuente').toBe(4)
    for (const l of deFuente) {
      expect(
        l.eq,
        `la consulta a ${l.tabla} NO filtró por cliente · el alcance se ignoró`,
      ).toContainEqual(['client_id', CLIENTE])
    }
    // y el del otro cliente no se detecta
    expect(json.total_detected, 'detectó filas de otro cliente').toBe(1)
  })

  it('la respuesta declara el alcance aplicado · no se adivina desde afuera', async () => {
    const { json } = await correr({ client_id: CLIENTE, dry_run: true })
    expect(json.client_id, 'la respuesta no dice a qué cliente se limitó').toBe(CLIENTE)
    expect(json.scoped).toBe(true)
  })

  it('un client_id mal formado NO se degrada a barrido completo · 400', async () => {
    // el modo peligroso sería tragarse el error y barrer TODO "por las dudas".
    sembrarManuales('client_brand_books', OTRO, 3, 'ajeno')
    const { res, json } = await correr({ client_id: 'no-soy-un-uuid' })
    expect(res.status, 'aceptó un identificador inválido').toBe(400)
    expect(json.error).toBe('invalid_client_id')
    expect(llamadas.length, 'llegó a consultar la base con un alcance inválido').toBe(0)
  })
})

describe('🔴 R2 · TOPE · un cliente con más filas que el tope queda COMPLETO', () => {
  it('detecta las 51 filas de un cliente grande, no las primeras 20', async () => {
    // 🔴 medición real 2026-08-27 · Peniche: 51 competitivas · el tope de hoy es 20.
    sembrarManuales('client_competitive_landscape', CLIENTE, 51, 'comp')

    const { json } = await correr({ client_id: CLIENTE, dry_run: true })

    expect(
      json.total_detected,
      'el tope de fetch tapó filas · el cliente NO quedó completo',
    ).toBe(51)
  })

  it('el gasto sigue acotado · detecta todo pero re-indexa hasta el tope, y lo DECLARA', async () => {
    // detectar es gratis · re-ingerir cuesta. El tope de gasto se queda · lo que
    // desaparece es el silencio (regla propia §150 · "no silent caps").
    sembrarManuales('client_competitive_landscape', CLIENTE, 51, 'comp')

    const { json } = await correr({ client_id: CLIENTE, max_per_table: 10 })

    expect(json.total_detected).toBe(51)
    expect(json.total_reindexed, 'gastó por encima del tope declarado').toBe(10)
    expect(json.total_pending, 'no declaró lo que dejó afuera · un cap mudo').toBe(41)
  })
})

describe('⚠️ NO-REGRESIÓN · sin client_id la red nocturna NO cambia', () => {
  // PURA · esta afirmación pasa ANTES y DESPUÉS del arreglo · es la que protege la red.
  it('sin alcance · ninguna consulta filtra por cliente · sigue viendo a todos', async () => {
    sembrarManuales('client_brand_books', CLIENTE, 2, 'a')
    sembrarManuales('client_brand_books', OTRO, 2, 'b')

    const { json } = await correr({ dry_run: true })

    const deFuente = llamadas.filter((l) => l.tabla !== 'client_brain_chunks')
    for (const l of deFuente) {
      expect(l.eq, `la consulta a ${l.tabla} filtró por cliente sin que se lo pidieran`).toEqual([])
    }
    expect(json.total_detected, 'dejó de ver a los dos clientes').toBe(4)
  })

  // campos NUEVOS · no pueden pasar antes del arreglo · van aparte para que la
  // afirmación de no-regresión de arriba quede pura y demostrable sobre el código viejo.
  it('sin alcance · la respuesta lo declara (campo nuevo)', async () => {
    const { json } = await correr({ dry_run: true })
    expect(json.scoped).toBe(false)
    expect(json.client_id).toBeNull()
  })

  it('sin alcance · el tope de fetch sigue siendo max_per_table * 2 (conducta de hoy)', async () => {
    sembrarManuales('client_competitive_landscape', CLIENTE, 51, 'comp')

    const { json } = await correr({ dry_run: true, max_per_table: 10 })

    const comp = llamadas.find((l) => l.tabla === 'client_competitive_landscape')
    expect(comp?.limit, 'la red nocturna cambió su tope de barrido').toBe(20)
    // y por lo tanto sigue viendo sólo 20 · éste es el defecto que NO se toca acá
    expect(json.total_detected).toBe(20)
  })

  it('sin alcance · sigue mirando las 4 tablas, con ventana y orden intactos', async () => {
    await correr({ dry_run: true })
    const deFuente = llamadas.filter((l) => l.tabla !== 'client_brain_chunks')
    expect(deFuente.map((l) => l.tabla)).toEqual([
      'client_brand_books',
      'client_icp_documents',
      'client_voc_library',
      'client_competitive_landscape',
    ])
    for (const l of deFuente) {
      expect(l.gte).toBe('updated_at')
      expect(l.order).toBe('updated_at')
    }
  })

  it('sin alcance · la forma de la respuesta de hoy se conserva', async () => {
    const { json } = await correr({})
    for (const k of [
      'ok',
      'dry_run',
      'max_per_table',
      'total_detected',
      'total_reindexed',
      'total_errors',
      'summary',
    ]) {
      expect(Object.keys(json), `desapareció el campo "${k}" de la respuesta`).toContain(k)
    }
  })
})

describe('un mecanismo, dos modos · no dos caminos de código', () => {
  it('el mismo endpoint sirve los dos modos · el alcance es un parámetro, no una rama', async () => {
    sembrarManuales('client_brand_books', CLIENTE, 1, 'mio')
    sembrarManuales('client_brand_books', OTRO, 1, 'ajeno')

    const conAlcance = await correr({ client_id: CLIENTE, dry_run: true })
    llamadas = []
    const sinAlcance = await correr({ dry_run: true })

    expect(conAlcance.json.total_detected).toBe(1)
    expect(sinAlcance.json.total_detected).toBe(2)
  })
})

describe('parseReindexScope · el modo se resuelve sin HTTP ni base', () => {
  it('cuerpo vacío ⇒ modo red · sin alcance, tope 10', () => {
    expect(parseReindexScope({})).toEqual({ ok: true, clientId: null, dryRun: false, maxPerTable: 10 })
  })
  it('cadena vacía y null NO cuentan como alcance', () => {
    expect((parseReindexScope({ client_id: '' }) as { clientId: string | null }).clientId).toBeNull()
    expect((parseReindexScope({ client_id: null }) as { clientId: string | null }).clientId).toBeNull()
  })
  it('un uuid con espacios se acepta recortado', () => {
    const r = parseReindexScope({ client_id: `  ${CLIENTE}  ` }) as { clientId: string }
    expect(r.clientId).toBe(CLIENTE)
  })
  it('un número, un objeto o un uuid truncado son inválidos · nunca barrido completo', () => {
    for (const malo of [123, {}, [], CLIENTE.slice(0, 30), 'null', 'undefined']) {
      expect(parseReindexScope({ client_id: malo }), String(malo)).toEqual({
        ok: false,
        error: 'invalid_client_id',
      })
    }
  })
  it('max_per_table inválido cae al default · no a 0 (que no procesaría nada)', () => {
    for (const malo of [0, -5, 'diez', null]) {
      expect((parseReindexScope({ max_per_table: malo }) as { maxPerTable: number }).maxPerTable).toBe(10)
    }
  })
})
