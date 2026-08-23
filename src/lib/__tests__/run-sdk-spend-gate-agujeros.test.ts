/**
 * Pruebas del arreglo de los agujeros del freno de gasto.
 * Plan · raw/tasks/2026-08-15-LENOVO-arreglo-agujeros-freno-de-gasto.md
 * Diseño · raw/findings/2026-08-22-CC3-DISENO-arreglo-freno-de-gasto-cuatro-agujeros.md
 *
 * Criterio del plan §2 · **la prueba TIENE QUE PODER DAR ROJO**. Cada bloque declara
 * qué cambio en el código de producción la vuelve roja. Un verde por construcción no
 * prueba nada.
 *
 * B1 se prueba con el PAR REAL de Peniche, por orden explícita: un par sintético que
 * comparta slug daría verde en falso y es exactamente el error que el diseño detectó.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  checkRunSdkSpendCap,
  resolveClientFamily,
  resolveSystemSpendCapUsd,
  DEFAULT_SYSTEM_SPEND_CAP_USD,
} from '../run-sdk-spend-gate'

// ── El par REAL, tal como está en producción (medido 2026-08-22) ──────────────
const PENICHE_CANONICA = 'e388a370-910f-4ee7-9a48-4a79393b8cb4' // "Peniche Surf Escape"
const PENICHE_FANTASMA = '53b05ecb-670a-4411-8a94-427e8dea6d2b' // "Cliente 53b05ecb"
/** Gasto real medido por ficha · ninguna llega sola al techo de $8. */
const GASTO = { [PENICHE_CANONICA]: 18.6515, [PENICHE_FANTASMA]: 5.3659 }

type Fila = { cost_usd?: number; canonical_client_id?: string | null; id?: string }

/**
 * Stub encadenable de Supabase. Devuelve lo que el caso define y registra qué
 * ids se consultaron, para poder exigir que la suma haya sido por la FAMILIA.
 */
function stubSupabase(opts: {
  invocaciones?: (ids: string[] | 'null') => Fila[]
  errorInvocaciones?: boolean
  errorClientsOwn?: boolean
  errorClientsKin?: boolean
  canonicalDe?: Record<string, string | null>
  hermanasDe?: Record<string, string[]>
  espia?: { idsConsultados?: string[] | 'null' }
}) {
  const q = (tabla: string): any => {
    const estado: { ids?: string[] | 'null'; idEq?: string; orCanon?: string } = {}
    const chain = {
      select: () => chain,
      gte: () => chain,
      in: (_c: string, ids: string[]) => {
        estado.ids = ids
        if (opts.espia) opts.espia.idsConsultados = ids
        return chain
      },
      is: () => {
        estado.ids = 'null'
        if (opts.espia) opts.espia.idsConsultados = 'null'
        return chain
      },
      eq: (_c: string, v: string) => {
        estado.idEq = v
        // El freno usa `.eq` cuando la familia es UNA sola ficha · `.in` cuando hay
        // familia declarada. El stub tiene que reflejar las dos formas.
        if (tabla === 'agent_invocations') {
          estado.ids = [v]
          if (opts.espia) opts.espia.idsConsultados = [v]
        }
        return chain
      },
      or: (expr: string) => {
        estado.orCanon = expr
        return chain
      },
      maybeSingle: async () => {
        if (opts.errorClientsOwn) return { data: null, error: { message: 'columna inexistente' } }
        const canon = opts.canonicalDe?.[estado.idEq ?? ''] ?? null
        return { data: { canonical_client_id: canon }, error: null }
      },
      // `await chain` sin maybeSingle
      then: (res: (v: { data: Fila[] | null; error: unknown }) => void) => {
        if (tabla === 'clients') {
          if (opts.errorClientsKin) return res({ data: null, error: { message: 'or() falló' } })
          const canon = (estado.orCanon ?? '').match(/id\.eq\.([0-9a-f-]+)/)?.[1] ?? ''
          const fam = opts.hermanasDe?.[canon] ?? [canon]
          return res({ data: fam.map((id) => ({ id })), error: null })
        }
        if (opts.errorInvocaciones) return res({ data: null, error: { message: 'base caída' } })
        return res({ data: opts.invocaciones?.(estado.ids ?? []) ?? [], error: null })
      },
    }
    return chain
  }
  return { from: (t: string) => q(t) } as any
}

/** Avisador falso · registra cada aviso para poder EXIGIRLO. */
function espiaAvisos() {
  const vistos: { kind: string; agent_slug?: string | null }[] = []
  const notify = vi.fn(async (i: { kind: string; agent_slug?: string | null }) => {
    vistos.push({ kind: i.kind, agent_slug: i.agent_slug })
    return { dispatched: true as const }
  })
  return { vistos, notify: notify as any }
}

beforeEach(() => {
  delete process.env.RUN_SPEND_CAP_ENFORCE
  delete process.env.RUN_SPEND_CAP_USD
  delete process.env.RUN_SPEND_CAP_SYSTEM_USD
})

// ═══════════════════════════════════════════════════════════════════════════
describe('C · el freno ya no se rinde en silencio', () => {
  // ROJO si: se borra el `void notify({kind:'query_error'…})` del camino de error.
  it('un fallo de consulta AVISA · y sigue dejando pasar (la política no cambia)', async () => {
    const { vistos, notify } = espiaAvisos()
    const r = await checkRunSdkSpendCap(
      stubSupabase({ errorInvocaciones: true, canonicalDe: {}, hermanasDe: {} }),
      PENICHE_CANONICA,
      { notify, agentSlug: 'brand-strategist' },
    )

    // (a) avisó
    expect(vistos.map((v) => v.kind)).toContain('query_error')
    // (b) y NO bloqueó · el fallo abierto se mantiene a propósito
    expect(r.blocked).toBe(false)
    expect(r.reason).toBe('query_error')
  })

  it('una excepción también avisa', async () => {
    const { vistos, notify } = espiaAvisos()
    const explota = { from: () => { throw new Error('boom') } } as any
    const r = await checkRunSdkSpendCap(explota, PENICHE_CANONICA, { notify })
    expect(vistos.map((v) => v.kind)).toContain('query_error')
    expect(r.blocked).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('A · corridas sin cliente · cubo system', () => {
  it('el techo por default es $2 · firmado por Emilio (peor día real: $0,6147)', () => {
    expect(DEFAULT_SYSTEM_SPEND_CAP_USD).toBe(2)
    expect(resolveSystemSpendCapUsd()).toBe(2)
  })

  // ROJO si: vuelve el `if (!clientId) return {blocked:false, reason:'no_client'}`.
  it('una invocación SIN client_id produce un caso OBSERVABLE', async () => {
    const { vistos, notify } = espiaAvisos()
    const r = await checkRunSdkSpendCap(
      stubSupabase({ invocaciones: () => [{ cost_usd: 0.6147 }] }),
      null,
      { notify, agentSlug: 'brand-strategist' },
    )

    // (a) el caso quedó visible · con nombre del empleado
    expect(vistos.map((v) => v.kind)).toContain('system_bucket_agent')
    expect(vistos[0]?.agent_slug).toBe('brand-strategist')
    // (b) medido contra SU techo, no sin techo
    expect(r.reason).toBe('system_under_cap')
    expect(r.cap_usd).toBe(2)
    expect(r.spent_usd).toBeCloseTo(0.6147, 4)
    // (c) el caso real del 10-ago no se bloquea · queda visible
    expect(r.blocked).toBe(false)
  })

  it('el cubo system BLOQUEA cuando pasa su techo', async () => {
    const { vistos, notify } = espiaAvisos()
    const r = await checkRunSdkSpendCap(
      stubSupabase({ invocaciones: () => [{ cost_usd: 2.5 }] }),
      undefined,
      { notify, agentSlug: 'brand-strategist' },
    )
    expect(r.blocked).toBe(true)
    expect(r.reason).toBe('system_over_cap')
    expect(vistos.map((v) => v.kind)).toContain('system_bucket_over_cap')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('B1 · el techo suma por la familia · PAR REAL de Peniche', () => {
  const conVinculo = {
    canonicalDe: { [PENICHE_FANTASMA]: PENICHE_CANONICA, [PENICHE_CANONICA]: null },
    hermanasDe: { [PENICHE_CANONICA]: [PENICHE_CANONICA, PENICHE_FANTASMA] },
    invocaciones: (ids: string[] | 'null') =>
      ids === 'null' ? [] : ids.map((id) => ({ cost_usd: GASTO[id as keyof typeof GASTO] ?? 0 })),
  }

  // ROJO si: la consulta vuelve a `.eq('client_id', clientId)` en vez de `.in(familia)`.
  // Con el par REAL esto da rojo · con un par sintético que comparta slug daría
  // verde en falso, que es justo el error que el diseño detectó.
  it('las dos fichas de Peniche suman en la MISMA cuenta y superan el techo', async () => {
    const espia: { idsConsultados?: string[] | 'null' } = {}
    const { notify } = espiaAvisos()
    const r = await checkRunSdkSpendCap(
      stubSupabase({ ...conVinculo, espia }),
      PENICHE_FANTASMA, // la corrida entra por la ficha fantasma
      { notify },
    )

    // (a) se consultaron LAS DOS fichas, no una
    expect(espia.idsConsultados).toEqual(
      expect.arrayContaining([PENICHE_CANONICA, PENICHE_FANTASMA]),
    )
    expect(r.family_size).toBe(2)
    expect(r.canonical_client_id).toBe(PENICHE_CANONICA)
    // (b) la cuenta unificada = $18,6515 + $5,3659 = $24,0174
    expect(r.spent_usd).toBeCloseTo(24.0174, 3)
    // (c) y por eso AHORA frena · antes ninguna de las dos llegaba sola a $8
    expect(r.blocked).toBe(true)
    expect(r.reason).toBe('over_cap')
  })

  it('ROJO de control · por separado NINGUNA de las dos alcanza el techo de $8', () => {
    expect(GASTO[PENICHE_CANONICA]).toBeGreaterThan(8) // ojo: ésta sí, sola
    expect(GASTO[PENICHE_FANTASMA]).toBeLessThan(8) // ésta no · acá se partía la cuenta
    expect(GASTO[PENICHE_CANONICA] + GASTO[PENICHE_FANTASMA]).toBeCloseTo(24.0174, 3)
  })

  it('sin vínculo declarado la cuenta sigue partida · el fantasma pasa por debajo', async () => {
    const { notify } = espiaAvisos()
    const r = await checkRunSdkSpendCap(
      stubSupabase({
        canonicalDe: { [PENICHE_FANTASMA]: null },
        hermanasDe: { [PENICHE_FANTASMA]: [PENICHE_FANTASMA] },
        invocaciones: (ids) =>
          ids === 'null' ? [] : ids.map((id) => ({ cost_usd: GASTO[id as keyof typeof GASTO] ?? 0 })),
      }),
      PENICHE_FANTASMA,
      { notify },
    )
    expect(r.spent_usd).toBeCloseTo(5.3659, 3)
    expect(r.blocked).toBe(false) // ← el agujero, reproducido
  })

  // ROJO si: se quita el fallback de `resolveClientFamily` ante columna inexistente.
  it('si la columna todavía no existe · degrada al id suelto y AVISA (lección H1.2)', async () => {
    const { vistos, notify } = espiaAvisos()
    const fam = await resolveClientFamily(
      stubSupabase({ errorClientsOwn: true }),
      PENICHE_FANTASMA,
      notify,
    )
    expect(fam.degraded).toBe(true)
    expect(fam.family).toEqual([PENICHE_FANTASMA])
    expect(vistos.map((v) => v.kind)).toContain('canonical_lookup_degraded')
  })
})
