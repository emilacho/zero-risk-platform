/**
 * Freno §150 · MEDICIÓN PREVIA. El reparto de piezas de la cadena mide el gasto del cliente antes de emitir sobres: no es una corrida de empleado, no tiene identificador de ejecución,
 * y avisaba `run_scoped_unidentified` (aviso falso, cada 10 min con el reintento encendido). Ahora declara `medicionPrevia` y no avisa; mide y bloquea igual.
 * Lo que NO cambia: una corrida de empleado sin identificador SIGUE avisando (el camino ruidoso es la red de respaldo), y las dos puertas de empleados no usan la bandera.
 * $0 · sin red · sin base · sin modelo.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const raiz = join(__dirname, '..')
const leer = (p: string) => readFileSync(join(raiz, p), 'utf8')

type Fila = { cost_usd: number; workflow_execution_id: string | null }
let filas: Fila[] = []
const supabaseFalso = () =>
  ({
    from: () => ({
      select: () => {
        const q: Record<string, unknown> = {}
        q.eq = () => q
        q.in = () => q
        q.is = () => q
        q.gte = () => Promise.resolve({ data: filas, error: null })
        q.maybeSingle = () => Promise.resolve({ data: null, error: null })
        return q
      },
    }),
  }) as never

const CLIENTE = 'd69100b5-8ad7-4bb0-908c-68b5544065dc'
beforeEach(() => { filas = []; process.env.RUN_SPEND_CAP_ENFORCE = 'true'; delete process.env.RUN_SPEND_CAP_USD; delete process.env.RUN_SCOPED_CAP_USD })
afterEach(() => { delete process.env.RUN_SPEND_CAP_ENFORCE })

async function medir(opts: Record<string, unknown>) {
  const { checkRunSdkSpendCap } = await import('../src/lib/run-sdk-spend-gate')
  const avisos: Array<Record<string, unknown>> = []
  const r = await checkRunSdkSpendCap(supabaseFalso(), CLIENTE, { ...opts, notify: ((a: Record<string, unknown>) => { avisos.push(a) }) as never })
  return { r, avisos }
}

describe('freno §150 · medición previa', () => {
  it('con medicionPrevia NO avisa run_scoped_unidentified', async () => {
    const { avisos } = await medir({ runId: null, medicionPrevia: true })
    expect(avisos.filter((a) => a.kind === 'run_scoped_unidentified')).toHaveLength(0)
  })
  it('y mide y deja pasar igual: bajo el techo no bloquea', async () => {
    filas = [{ cost_usd: 1, workflow_execution_id: 'x' }]
    const { r } = await medir({ medicionPrevia: true })
    expect(r.blocked).toBe(false); expect(r.reason).toBe('under_cap'); expect(r.spent_usd).toBe(1)
  })
  it('y bloquea igual al llegar al techo por cliente/24 h (no hay hueco de gasto)', async () => {
    filas = [{ cost_usd: 9, workflow_execution_id: 'x' }]
    const { r, avisos } = await medir({ medicionPrevia: true })
    expect(r.blocked).toBe(true); expect(r.reason).toBe('over_cap')
    expect(avisos.filter((a) => a.kind === 'run_scoped_unidentified')).toHaveLength(0)
  })
  it('🔴 SIN la bandera, una corrida sin identificador SIGUE avisando (camino ruidoso intacto)', async () => {
    const { r, avisos } = await medir({ runId: null })
    expect(r.run_unidentified).toBe(true)
    expect(avisos.some((a) => a.kind === 'run_scoped_unidentified')).toBe(true)
  })
  it('🔴 la bandera en falso tampoco calla el aviso', async () => {
    const { avisos } = await medir({ medicionPrevia: false })
    expect(avisos.some((a) => a.kind === 'run_scoped_unidentified')).toBe(true)
  })
  it('con identificador de corrida todo sigue igual (la bandera no cambia la vara por corrida)', async () => {
    filas = [{ cost_usd: 9, workflow_execution_id: 'R1' }]
    const { r } = await medir({ runId: 'R1', medicionPrevia: true })
    expect(r.blocked).toBe(true); expect(r.reason).toBe('run_over_cap'); expect(r.run_unidentified).toBeUndefined()
  })
})

describe('freno §150 · quién usa la bandera', () => {
  it('la medición previa de la cadena la declara', () => {
    const t = leer('src/lib/cadena/almacen-supabase.ts')
    const i = t.indexOf('async frenoDeGasto')
    expect(i).toBeGreaterThan(0)
    expect(t.slice(i, i + 700)).toContain('medicionPrevia: true')
  })
  it.each([['src/app/api/agents/run-sdk/route.ts'], ['src/app/api/agents/run/route.ts']])('%s (puerta de empleados) NO usa la bandera', (archivo) => {
    expect(leer(archivo)).not.toContain('medicionPrevia')
  })
  it('solo la cadena la usa en todo src (nadie más se calla el aviso)', () => {
    const usos: string[] = []
    const recorre = (dir: string) => {
      for (const e of require('node:fs').readdirSync(join(raiz, dir), { withFileTypes: true })) {
        const p = `${dir}/${e.name}`
        if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') recorre(p) } else if (/\.tsx?$/.test(e.name) && leer(p).includes('medicionPrevia: true')) usos.push(p)
      }
    }
    recorre('src')
    expect(usos).toEqual(['src/lib/cadena/almacen-supabase.ts'])
  })
})
