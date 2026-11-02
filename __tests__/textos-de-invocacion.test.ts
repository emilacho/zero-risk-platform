// 01-nov · firma de Emilio · observabilidad, punto 1: el texto completo de cada llamada, sin llaves, y que nunca frene nada.
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { DIAS_DE_TEXTOS, guardarTextosDeInvocacion, LLAVES_A_OCULTAR, ocultarLlaves } from '../src/lib/textos-de-invocacion'
import { purgarTextosViejos } from '../src/lib/oficina/purgar-textos'
import { guardarTextosDeInvocacion as delCorredor, LLAVES_A_OCULTAR as delCorredorLista } from '../services/agent-runner/src/lib/agent-invocations-log'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'

const LLAVE = 'sk-ant-api03-' + 'a'.repeat(30)
const LARGO = 'x'.repeat(200_000) + 'FINAL'

describe.each([['la plataforma', guardarTextosDeInvocacion], ['el corredor', delCorredor]] as const)('guardar los textos · %s', (_n, guardar) => {
  it('🔴 guarda el texto entero, sin recortar', async () => {
    const db = new DbFalsa()
    await guardar(db as never, 'i1', { entrada: LARGO, salida: LARGO })
    expect(db.tablas['agent_invocation_textos'][0]).toMatchObject({ invocation_id: 'i1', entrada: LARGO, salida: LARGO })
  })
  it('🔴 oculta las llaves en la entrada y en la salida', async () => {
    const db = new DbFalsa()
    await guardar(db as never, 'i1', { entrada: `usa ${LLAVE}`, salida: `Bearer abcdefghijklmnop y ${'f'.repeat(40)}` })
    const f = db.tablas['agent_invocation_textos'][0] as { entrada: string; salida: string }
    expect(f.entrada).toBe('usa [oculto]')
    expect(f.salida).toBe('[oculto] y [oculto]')
  })
  it('sin nada que guardar no escribe', async () => {
    const db = new DbFalsa()
    await guardar(db as never, 'i1', { entrada: '', salida: null })
    expect(db.tablas['agent_invocation_textos'] ?? []).toHaveLength(0)
  })
  it('🔴 nunca lanza, ni si la base responde error ni si revienta', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(guardar({ from: () => ({ insert: async () => ({ error: { message: 'mal' } }) }) } as never, 'i1', { entrada: 'a' })).resolves.toBeUndefined()
    await expect(guardar({ from: () => { throw new Error('caída') } } as never, 'i1', { entrada: 'a' })).resolves.toBeUndefined()
    expect(consola).toHaveBeenCalledTimes(2)
    consola.mockRestore()
  })
})

describe('las dos listas de llaves', () => {
  it('🔴 son iguales en la plataforma y en el corredor', () => {
    expect(delCorredorLista.map(String)).toEqual(LLAVES_A_OCULTAR.map(String))
  })
  it('no toca el texto normal', () => {
    const t = 'El plan de 90 días cuesta US$ 1.200 y abre en Guayaquil'
    expect(ocultarLlaves(t)).toBe(t)
  })
})

describe('la purga', () => {
  const AHORA = new Date('2026-11-01T12:00:00Z')
  it('🔴 borra solo lo que pasó de 30 días y solo en esa tabla', async () => {
    expect(DIAS_DE_TEXTOS).toBe(30)
    const pedidos: unknown[][] = []
    const db = { from: (t: string) => ({ delete: () => ({ lt: async (c: string, v: string) => { pedidos.push([t, c, v]); return { error: null } } }) }) }
    expect(await purgarTextosViejos(db, AHORA)).toEqual({ error: null })
    expect(pedidos).toEqual([['agent_invocation_textos', 'creado_en', '2026-10-02T12:00:00.000Z']])
  })
  it('🔴 nunca lanza', async () => {
    expect((await purgarTextosViejos({ from() { throw new Error('caída') } }, AHORA)).error).toMatch(/caída/)
  })
})

describe('el corredor', () => {
  const codigo = readFileSync('services/agent-runner/src/lib/agent-sdk-runner.ts', 'utf8')
  it('🔴 la fila del libro lleva su id y los textos van después, con la pregunta y la respuesta enteras', () => {
    expect(codigo).toMatch(/id: invocationId,/)
    expect(codigo).toMatch(/insertAgentInvocationWithRetry\(supabase, invocationRow, canonicalSlug\)\.then\(\(\) =>\s+guardarTextosDeInvocacion\(supabase, invocationId, \{ entrada: input\.task, salida:/)
  })
})

describe('la tabla', () => {
  const sql = readFileSync('supabase/migrations/202611012500_agent_invocation_textos.sql', 'utf8')
  it('🔴 tiene permisos por fila y permiso para el servicio: sin eso el corredor falla en silencio', () => {
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/)
    expect(sql).toMatch(/GRANT SELECT, INSERT, DELETE ON public\.agent_invocation_textos TO service_role/)
    expect(sql).toMatch(/NOTIFY pgrst/)
  })
})
