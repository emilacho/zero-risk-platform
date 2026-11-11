/**
 * Tests · ledger de intención `agent_dispatches` · fix raíz (a) 2026-07-19.
 *
 * Cubre la spec convergida (consejero+arquitecto):
 *   · dispatch_key derivado ESTABLE (anclado en workflow_id · idempotente en el rescate)
 *   · INSERT síncrono confirma → o THROW (el caller responde 5xx · nunca 202-sin-fila)
 *   · CONCURRENCIA: 2 dispatches misma key ⇒ 1 fila (índice único parcial · 23505 idempotente)
 *   · C4 NEGATIVO: waitUntil muerto post-202 → la fila `accepted` queda VISIBLE (poll ready:false)
 *     ⇒ prueba que la CLASE murió, no sólo el happy path.
 * $0 · Supabase fake en memoria que ENFORCE-a el unique parcial (simula el índice real).
 */
import { describe, it, expect } from 'vitest'
import {
  deriveDispatchKey,
  recordDispatchIntent,
  markDispatchRunning,
  markDispatchTerminal,
  DISPATCHES_TABLE,
} from '../src/lib/agent-dispatch-ledger'

// ── Supabase fake · enforce el índice único PARCIAL (dispatch_key IS NOT NULL) ──
function makeFakeSupabase() {
  const rows: Array<Record<string, unknown>> = []
  let failNextInsert: { code?: string; message?: string } | null = null
  let updateThrows = false
  return {
    _rows: rows,
    _failNextInsert(e: { code?: string; message?: string }) {
      failNextInsert = e
    },
    _breakUpdate() {
      updateThrows = true
    },
    from(_table: string) {
      const consulta = (patch: Record<string, unknown> | null) => {
        const fs: Array<(r: Record<string, unknown>) => boolean> = []
        const q: Record<string, unknown> = {
          eq(col: string, val: unknown) { fs.push((r) => r[col] === val); return q },
          in(col: string, vals: unknown[]) { fs.push((r) => vals.includes(r[col])); return q },
          select() { return q },
          limit() { return q },
          then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) {
            if (patch && updateThrows) return Promise.reject(new Error('update boom')).then(res, rej)
            const tocadas = rows.filter((r) => fs.every((f) => f(r)))
            if (patch) for (const r of tocadas) Object.assign(r, patch)
            return Promise.resolve({ data: tocadas.map((r) => ({ ...r })), error: null }).then(res, rej)
          },
        }
        return q
      }
      return {
        insert(row: Record<string, unknown>) {
          if (failNextInsert) {
            const e = failNextInsert
            failNextInsert = null
            return Promise.resolve({ error: e })
          }
          // Unique PARCIAL · sólo colisiona con dispatch_key NO-null (múltiples null OK).
          if (
            row.dispatch_key != null &&
            rows.some((r) => r.dispatch_key === row.dispatch_key)
          ) {
            return Promise.resolve({ error: { code: '23505', message: 'duplicate key' } })
          }
          rows.push({ ...row })
          return Promise.resolve({ error: null })
        },
        // 11-nov · #21 · filtros encadenados (eq · in · select · limit) para el cierre que no pisa un cierre ajeno
        update(patch: Record<string, unknown>) { return consulta(patch) },
        select() { return consulta(null) },
      }
    },
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asSb = (fake: ReturnType<typeof makeFakeSupabase>) => fake as any

describe('deriveDispatchKey · estable · anclado en workflow_id', () => {
  it('respeta el dispatch_key explícito del caller', () => {
    expect(deriveDispatchKey({ dispatch_key: 'caller-key', workflow_id: 'wf' })).toBe('caller-key')
  })
  it('deriva de workflow_id + agent + exec', () => {
    const k = deriveDispatchKey({
      workflow_id: 'rediscovery-59185',
      agent_name: 'onboarding-specialist',
      workflow_execution_id: '59185',
    })
    expect(k).toBe('dispatch:rediscovery-59185:onboarding-specialist:59185')
  })
  it('ESTABLE · mismo input ⇒ mismo key (idempotente en el re-dispatch del rescate)', () => {
    const intent = { workflow_id: 'rediscovery-59185', agent_name: 'onboarding-specialist', workflow_execution_id: '59185' }
    expect(deriveDispatchKey(intent)).toBe(deriveDispatchKey(intent))
  })
  it('el rescate reusa el mismo workflow_id ⇒ mismo key aunque sea otra “corrida”', () => {
    const primero = deriveDispatchKey({ workflow_id: 'rediscovery-59185', agent_name: 'a', workflow_execution_id: 'e' })
    const rescate = deriveDispatchKey({ workflow_id: 'rediscovery-59185', agent_name: 'a', workflow_execution_id: 'e' })
    expect(rescate).toBe(primero)
  })
  it('fallback sin campos → key no vacío determinista', () => {
    expect(deriveDispatchKey({})).toBe('dispatch:no-wf:no-agent')
  })
})

describe('recordDispatchIntent · INSERT síncrono confirma o throw', () => {
  it('éxito · inserta 1 fila accepted · idempotent=false', async () => {
    const sb = makeFakeSupabase()
    const r = await recordDispatchIntent(asSb(sb), { workflow_id: 'wf-1', agent_name: 'a', workflow_execution_id: 'e1' })
    expect(r.idempotent).toBe(false)
    expect(sb._rows).toHaveLength(1)
    expect(sb._rows[0]).toMatchObject({ dispatch_key: 'dispatch:wf-1:a:e1', status: 'accepted', workflow_id: 'wf-1' })
  })

  it('CONCURRENCIA · 2 dispatches misma key ⇒ 1 fila (2º = 23505 idempotente)', async () => {
    const sb = makeFakeSupabase()
    const intent = { workflow_id: 'wf-x', agent_name: 'a', workflow_execution_id: 'e' }
    const r1 = await recordDispatchIntent(asSb(sb), intent)
    const r2 = await recordDispatchIntent(asSb(sb), intent)
    expect(r1.dispatch_key).toBe(r2.dispatch_key)
    expect(r1.idempotent).toBe(false)
    expect(r2.idempotent).toBe(true) // el 2º cae en 23505 · tratado como éxito
    expect(sb._rows).toHaveLength(1) // ⇒ UNA sola fila
  })

  it('carrera simultánea (Promise.all) misma key ⇒ 1 fila', async () => {
    const sb = makeFakeSupabase()
    const intent = { workflow_id: 'wf-race', agent_name: 'a', workflow_execution_id: 'e' }
    const [a, b] = await Promise.all([
      recordDispatchIntent(asSb(sb), intent),
      recordDispatchIntent(asSb(sb), intent),
    ])
    expect(a.dispatch_key).toBe(b.dispatch_key)
    expect(sb._rows).toHaveLength(1)
    // exactamente uno fue el ganador (idempotent=false) y el otro idempotente
    expect([a.idempotent, b.idempotent].filter(Boolean)).toHaveLength(1)
  })

  it('error de DB NO-unique → THROW (el caller devuelve 5xx · nunca 202)', async () => {
    const sb = makeFakeSupabase()
    sb._failNextInsert({ code: '08006', message: 'connection failure' })
    await expect(
      recordDispatchIntent(asSb(sb), { workflow_id: 'wf', agent_name: 'a', workflow_execution_id: 'e' }),
    ).rejects.toThrow(/dispatch_intent_insert_failed/)
    expect(sb._rows).toHaveLength(0) // no quedó fila · el 202 no debe salir
  })
})

describe('C4 NEGATIVO · waitUntil muerto post-202 → la fila accepted queda VISIBLE', () => {
  it('registrada la intención, si el trabajo (running) NUNCA corre, la fila accepted sigue visible + poll ready:false', async () => {
    const sb = makeFakeSupabase()
    // 1) INSERT síncrono ANTES del 202 (esto SÍ pasó · es lo durable).
    const { dispatch_key } = await recordDispatchIntent(asSb(sb), {
      workflow_id: 'rediscovery-59185',
      agent_name: 'onboarding-specialist',
      workflow_execution_id: '59185',
    })
    // 2) Simular waitUntil MUERTO post-202: markDispatchRunning / terminal JAMÁS corren.
    //    (No los llamamos · la función se congeló tras el ack.)
    // 3) La fila accepted DEBE seguir visible (durable) → el poll la ve.
    const row = sb._rows.find((r) => r.dispatch_key === dispatch_key)!
    expect(row).toBeDefined()
    expect(row.status).toBe('accepted') // NO desapareció · la CLASE del bug murió
    // El poll lee accepted ⇒ ready:false (in-flight real · cero falso-timeout).
    const pollReady = ['completed', 'error', 'failed'].includes(String(row.status))
    expect(pollReady).toBe(false)
  })

  it('contraste · con waitUntil vivo la fila transiciona accepted→running→completed', async () => {
    const sb = makeFakeSupabase()
    const { dispatch_key } = await recordDispatchIntent(asSb(sb), { workflow_id: 'wf', agent_name: 'a', workflow_execution_id: 'e' })
    await markDispatchRunning(asSb(sb), dispatch_key)
    expect(sb._rows[0].status).toBe('running')
    await markDispatchTerminal(asSb(sb), dispatch_key, 'completed')
    expect(sb._rows[0].status).toBe('completed')
    expect(sb._rows[0].completed_at).toBeTruthy()
  })
})

describe('11-nov · #21 · el cierre no pisa un cierre ajeno (CC6 línea 3)', () => {
  it('🔴 si el limpiador ya lo cerró (sin_cierre), su estado se queda y se anota que el trabajo terminó después (Náufrago y B2B)', async () => {
    for (const [wf, agente] of [['oficina-naufrago', 'jefe-marketing'], ['jefatura-b2b', 'campaign-brief-agent']]) {
      const sb = makeFakeSupabase()
      const { dispatch_key } = await recordDispatchIntent(asSb(sb), { workflow_id: wf, agent_name: agente, workflow_execution_id: 'e' })
      Object.assign(sb._rows[0], { status: 'sin_cierre', metadata: { cierre: { regla: 'ciclo-de-incidentes' } } })
      await markDispatchTerminal(asSb(sb), dispatch_key, 'completed')
      expect(sb._rows[0].status).toBe('sin_cierre')
      expect(sb._rows[0].metadata).toMatchObject({ cierre: { regla: 'ciclo-de-incidentes' }, termino_despues: { estado: 'completed', estado_que_tenia: 'sin_cierre' } })
    }
  })
  it('🔴 abierto (accepted o running) → su estado final, como siempre', async () => {
    const sb = makeFakeSupabase()
    const { dispatch_key } = await recordDispatchIntent(asSb(sb), { workflow_id: 'wf', agent_name: 'a', workflow_execution_id: 'e' })
    await markDispatchTerminal(asSb(sb), dispatch_key, 'error')
    expect(sb._rows[0].status).toBe('error')
  })
})

describe('mark* · best-effort · nunca throwean', () => {
  it('markDispatchRunning no throwea si el update falla (la señal accepted queda)', async () => {
    const sb = makeFakeSupabase()
    await recordDispatchIntent(asSb(sb), { workflow_id: 'wf', agent_name: 'a', workflow_execution_id: 'e' })
    sb._breakUpdate()
    await expect(markDispatchRunning(asSb(sb), 'dispatch:wf:a:e')).resolves.toBeUndefined()
    expect(sb._rows[0].status).toBe('accepted') // sin cambio · pero no reventó
  })
  it('markDispatchTerminal no throwea si el update falla', async () => {
    const sb = makeFakeSupabase()
    await recordDispatchIntent(asSb(sb), { workflow_id: 'wf', agent_name: 'a', workflow_execution_id: 'e' })
    sb._breakUpdate()
    await expect(markDispatchTerminal(asSb(sb), 'dispatch:wf:a:e', 'error')).resolves.toBeUndefined()
  })
})

describe('constantes', () => {
  it('DISPATCHES_TABLE = agent_dispatches', () => {
    expect(DISPATCHES_TABLE).toBe('agent_dispatches')
  })
})
