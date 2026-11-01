// 01-nov · observabilidad, puntos 1 y 2: revisor externo, imágenes y video también guardan lo que se les pidió.
import { describe, expect, it } from 'vitest'
import { registrarImagenEnElLibro } from '../src/lib/image-ledger'
import { registrarRevisorEnElLibro } from '../src/lib/revisor-gpt-libro'
import { registrarEnvioEnElLibro } from '../src/lib/video/libro'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'

const LARGO = 'x'.repeat(5000) + 'FIN'
const LLAVE = 'sk-ant-api03-' + 'a'.repeat(30)
const T0 = Date.parse('2026-11-01T12:00:00Z')
const revisor = (extra: Record<string, unknown> = {}) => ({ origen: 'jefatura', refId: 'r1', n: 1, clientId: 'c1', modelo: 'm', costUsd: 0.01, costBasis: 'usage', ok: true, intentos: 1, startedAtMs: T0, endedAtMs: T0 + 1000, workflowId: 'wf', workflowExecutionId: 'ex', ...extra })
const imagen = (extra: Record<string, unknown> = {}) => ({ generationId: 'g1', clientId: 'c1', agentSlug: 'a', model: 'm', size: '1024x1024', quality: null, caller: 'c', costUsd: 0.01, costBasis: 'usage', startedAtMs: T0, endedAtMs: T0 + 1000, workflowId: 'wf', workflowExecutionId: 'ex', ...extra })
const video = (extra: Record<string, unknown> = {}) => ({ requestId: 'v1', clientId: 'c1', agentSlug: 'a', modelo: 'm', ruta: 'r', segundos: 5, resolucion: '720p', caller: 'c', costoEstimadoUsd: 0.5, startedAtMs: T0, workflowId: 'wf', workflowExecutionId: 'ex', ...extra })

describe.each([
  ['revisor externo', (db: DbFalsa, x: Record<string, unknown>) => registrarRevisorEnElLibro(db as never, revisor(x) as never), (t: string) => ({ entrada: t, salida: 'la opinión' })],
  ['imagen', (db: DbFalsa, x: Record<string, unknown>) => registrarImagenEnElLibro(db as never, imagen(x) as never), (t: string) => ({ prompt: t })],
  ['video', (db: DbFalsa, x: Record<string, unknown>) => registrarEnvioEnElLibro(db as never, video(x) as never), (t: string) => ({ prompt: t })],
] as const)('%s', (_n, registrar, conTexto) => {
  it('🔴 la fila trae el comienzo y la tabla de textos, entero y unido por su id', async () => {
    const db = new DbFalsa()
    expect((await registrar(db, conTexto(LARGO))).ok).toBe(true)
    const fila = db.tablas['agent_invocations'][0] as Record<string, unknown>
    expect(String(fila.input_summary)).toHaveLength(2001)
    const texto = db.tablas['agent_invocation_textos'][0] as Record<string, unknown>
    expect(texto.invocation_id).toBe(fila.id)
    expect(texto.entrada).toBe(LARGO)
  })
  it('🔴 oculta las llaves en la tabla de textos', async () => {
    const db = new DbFalsa()
    await registrar(db, conTexto(`usa ${LLAVE}`))
    expect((db.tablas['agent_invocation_textos'][0] as { entrada: string }).entrada).toBe('usa [oculto]')
  })
  it('sin texto, la fila queda sin entrada y no se escribe en la tabla de textos', async () => {
    const db = new DbFalsa()
    expect((await registrar(db, {})).ok).toBe(true)
    expect((db.tablas['agent_invocations'][0] as Record<string, unknown>).input_summary).toBeNull()
    expect(db.tablas['agent_invocation_textos'] ?? []).toHaveLength(0)
  })
  it('🔴 si la tabla de textos falla, el costo igual quedó y no lanza', async () => {
    const db = new DbFalsa()
    const de = db.from.bind(db)
    db.from = ((t: string) => { if (t === 'agent_invocation_textos') throw new Error('caída'); return de(t) }) as never
    expect((await registrar(db, conTexto('algo'))).ok).toBe(true)
    expect(db.tablas['agent_invocations']).toHaveLength(1)
  })
})

describe('cada fila lleva su propio id', () => {
  it('🔴 dos llamadas no comparten id', async () => {
    const db = new DbFalsa()
    await registrarRevisorEnElLibro(db as never, revisor({ refId: 'a' }) as never)
    await registrarRevisorEnElLibro(db as never, revisor({ refId: 'b' }) as never)
    await registrarImagenEnElLibro(db as never, imagen({ generationId: 'a' }) as never)
    await registrarImagenEnElLibro(db as never, imagen({ generationId: 'b' }) as never)
    const ids = db.tablas['agent_invocations'].map((f) => f.id)
    expect(ids).toHaveLength(4)
    expect(new Set(ids).size).toBe(4)
  })
})

describe('el revisor externo', () => {
  it('🔴 guarda también lo que respondió', async () => {
    const db = new DbFalsa()
    await registrarRevisorEnElLibro(db as never, revisor({ entrada: 'pregunta', salida: 'la opinión' }) as never)
    expect(db.tablas['agent_invocation_textos'][0]).toMatchObject({ entrada: 'pregunta', salida: 'la opinión' })
  })
})
