/**
 * Las vistas de mínimo privilegio en Doppler: cada lugar recibe solo lo que usa, como REFERENCIA a la fuente, y el guion NUNCA lee un valor.
 */
import { describe, expect, it } from 'vitest'
import { FUENTE, VISTAS, ejecutar, planearVista } from '../scripts/ops/armar-vistas-doppler.mjs'

type Llamada = { args: string[]; input?: string }
function dopplerFalso(fuente: string[], vistas: Record<string, string[]> = {}, o: { sinFuente?: boolean } = {}) {
  const llamadas: Llamada[] = []
  const proyectos = { ...vistas }
  const run = (_c: string, args: string[], opts: { input?: string }) => {
    llamadas.push({ args, input: opts.input })
    const p = args[args.indexOf('-p') + 1]
    if (args[0] === 'secrets' && args[1] === '--only-names') {
      if (p === FUENTE.proyecto) return o.sinFuente ? { status: 1, stdout: '', stderr: 'sin acceso' } : { status: 0, stdout: JSON.stringify(Object.fromEntries(fuente.map((n) => [n, {}]))), stderr: '' }
      return proyectos[p] ? { status: 0, stdout: JSON.stringify(Object.fromEntries(proyectos[p].map((n) => [n, {}]))), stderr: '' } : { status: 1, stdout: '', stderr: 'no existe' }
    }
    if (args[0] === 'projects' && args[1] === 'create') { proyectos[args[2]] = []; return { status: 0, stdout: '', stderr: '' } }
    if (args[0] === 'secrets' && args[1] === 'set') { proyectos[p] = [...(proyectos[p] ?? []), args[2]]; return { status: 0, stdout: '', stderr: '' } }
    return { status: 1, stdout: '', stderr: 'desconocido' }
  }
  return { run, llamadas, proyectos }
}

describe('planearVista', () => {
  it('crea las que existen en la fuente y faltan; deja las demás como pendientes; no toca sobrantes', () => {
    const p = planearVista(['A', 'B', 'C', 'A'], ['A', 'B'], ['B', 'X', 'DOPPLER_PROJECT'])
    expect(p.crear).toEqual(['A']); expect(p.ya).toEqual(['B']); expect(p.pendientes).toEqual(['C']); expect(p.sobrantes).toEqual(['X'])
  })
})

describe('las vistas definidas', () => {
  it('cada lugar recibe solo lo suyo: el runner NO ve a Meta ni a Slack; n8n NO ve la llave de Anthropic; el CI solo sus 5', () => {
    const runner = VISTAS['zero-risk-runner'].nombres, n8n = VISTAS['zero-risk-n8n'].nombres, ci = VISTAS['zero-risk-ci'].nombres
    expect(runner).toContain('INTERNAL_API_KEY'); expect(runner).not.toContain('META_ACCESS_TOKEN'); expect(runner).not.toContain('SLACK_BOT_TOKEN')
    expect(n8n).not.toContain('ANTHROPIC_API_KEY'); expect(n8n).toContain('INTERNAL_API_KEY')
    expect([...ci].sort()).toEqual(['N8N_API_KEY', 'N8N_BASE_URL', 'SLACK_WEBHOOK_URL_EQUIPO', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL'])
  })
  it('los servicios purgados no entran', () => {
    const todos = Object.values(VISTAS).flatMap((v: { nombres: string[] }) => v.nombres)
    for (const n of ['GHL_API_KEY', 'HIGGSFIELD_API_KEY', 'IDEOGRAM_API_KEY']) expect(todos).not.toContain(n)
  })
})

describe('ejecutar', () => {
  it('en seco no escribe nada ni crea proyectos', () => {
    const d = dopplerFalso(['INTERNAL_API_KEY', 'N8N_API_KEY'])
    expect(ejecutar({ seco: true, run: d.run as never, log: () => {} }).ok).toBe(true)
    expect(d.llamadas.some((l) => l.args[1] === 'set' || l.args[0] === 'projects')).toBe(false)
  })
  it('escribe REFERENCIAS por la entrada estándar (nunca un valor), con --silent, y NUNCA lee un valor', () => {
    const d = dopplerFalso(['INTERNAL_API_KEY', 'N8N_API_KEY'])
    ejecutar({ seco: false, run: d.run as never, log: () => {} })
    const sets = d.llamadas.filter((l) => l.args[1] === 'set')
    expect(sets.length).toBeGreaterThan(0)
    for (const s of sets) { expect(s.args).toContain('--silent'); expect(s.input).toBe('${zero-risk.prd.' + s.args[2] + '}'); expect(s.args.some((a) => a.includes('='))).toBe(false) }
    expect(d.llamadas.some((l) => l.args[1] === 'get' || l.args.includes('--plain'))).toBe(false)
  })
  it('crea el proyecto de la vista si no existe y no duplica lo que ya está (repetible)', () => {
    const d = dopplerFalso(['INTERNAL_API_KEY'])
    ejecutar({ seco: false, solo: 'zero-risk-runner' as never, run: d.run as never, log: () => {} })
    expect(d.llamadas.filter((l) => l.args[0] === 'projects')).toHaveLength(1)
    const antes = d.llamadas.filter((l) => l.args[1] === 'set').length
    ejecutar({ seco: false, solo: 'zero-risk-runner' as never, run: d.run as never, log: () => {} })
    expect(d.llamadas.filter((l) => l.args[1] === 'set').length).toBe(antes)
  })
  it('lo que aún no existe en la fuente queda como pendiente (no se crea una referencia rota)', () => {
    const d = dopplerFalso(['INTERNAL_API_KEY']); const salida: string[] = []
    ejecutar({ seco: false, solo: 'zero-risk-runner' as never, run: d.run as never, log: (s: string) => salida.push(s) })
    expect(d.proyectos['zero-risk-runner']).toEqual(['INTERNAL_API_KEY']); expect(salida.join('\n')).toContain('ANTHROPIC_API_KEY')
  })
  it('sin acceso a la fuente, no hace nada', () => {
    const d = dopplerFalso([], {}, { sinFuente: true })
    expect(ejecutar({ seco: false, run: d.run as never, log: () => {} }).ok).toBe(false)
    expect(d.llamadas.some((l) => l.args[1] === 'set')).toBe(false)
  })
})
