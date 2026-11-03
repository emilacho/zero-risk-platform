/**
 * 03-nov · SEÑAL LENOVO 14:49Z · «pequeñas pausas que se quitan cuando yo hago las aprobaciones; por ahora solo la del manual». US$ 0, sin red.
 * Fija: el alta conserva todos sus nodos y conexiones; solo «E57» deja de pedir el plan a la sala y GUARDA el mismo sobre en la espera del dueño; falla en voz alta si la forma cambió.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RUTA_ESPERA, SOBRE, guardarSobreEnEspera } from '../scripts/ops/alta-espera-del-manual.mjs'
import { analizar, veredicto } from '../scripts/sala/alta-alcanzabilidad.mjs'

const DIR = join(__dirname, '..', 'scripts', 'worker-staging', 'LyVoKcrypS5uLyuu')
const leer = (f: string) => JSON.parse(readFileSync(join(DIR, f), 'utf8'))
const antes = leer('alta-ANTES-espera-del-manual-2026-11-03.json')
const despues = guardarSobreEnEspera(antes)
const nodo = (w: any, n: string) => w.nodes.find((x: any) => x.name === n)
const ENV: Record<string, string> = { ZERO_RISK_API_URL: 'https://api.test', INTERNAL_API_KEY: 'k-interna' }
const VAL = { client_id: 'c-1', _journey_id: 'j-1', dry_run: false, force_restart: false, tenant_id: 't-1', _sala_correlation_id: 'corr-1' }
/** evalúa las expresiones {{ … }} del cuerpo con un «Validate Deal Data» de prueba */
const evaluar = (plantilla: string) => {
  const $ = (n: string) => { if (n !== 'Validate Deal Data') throw new Error('nodo no previsto ' + n); return { first: () => ({ json: VAL }) } }
  return plantilla.replace(/\{\{([\s\S]*?)\}\}/g, (_m, e) => String(new Function('$', '$env', `return (${e})`)($, ENV)))
}

describe('E57 guarda en la espera del dueño', () => {
  it('no se quita ni se añade ningún nodo y las conexiones quedan idénticas', () => {
    expect(despues.nodes.map((n: any) => n.name)).toEqual(antes.nodes.map((n: any) => n.name))
    expect(despues.connections).toEqual(antes.connections)
  })
  it('solo cambia «E57» (el resto de los nodos, byte a byte)', () => {
    for (const n of antes.nodes) if (n.name !== SOBRE) expect(JSON.stringify(nodo(despues, n.name))).toBe(JSON.stringify(n))
  })
  it('ya no apunta a la sala: va a la ruta de esperas con la llave interna', () => {
    const p = nodo(despues, SOBRE).parameters
    expect(p.url).toContain(RUTA_ESPERA)
    expect(p.url).not.toContain('sala/intake')
    const h = Object.fromEntries(p.headerParameters.parameters.map((x: any) => [x.name, x.value]))
    expect(h['x-api-key']).toBe('={{ $env.INTERNAL_API_KEY }}')
  })
  it('el cuerpo es JSON válido: cliente, tipo «manual», journey y el MISMO sobre que hoy sale a la sala', () => {
    const nuevo = JSON.parse(evaluar(nodo(despues, SOBRE).parameters.jsonBody.slice(1)))
    const viejo = JSON.parse(evaluar(nodo(antes, SOBRE).parameters.jsonBody.slice(1)))
    expect(nuevo).toEqual({ client_id: 'c-1', tipo: 'manual', journey_id: 'j-1', sobre: viejo })
    expect(nuevo.sobre.intent).toBe('planear')
    expect(nuevo.sobre.idempotency_key).toBe('j-1:planear')
  })
  it('la alcanzabilidad lo da por bueno; con el sobre devuelto a la sala (mutante) FALLA', () => {
    expect(veredicto(analizar(despues), despues)).toEqual({ ok: true, problemas: [] })
    const m = JSON.parse(JSON.stringify(despues))
    nodo(m, SOBRE).parameters.url = "={{ $env.SALA_INTAKE_URL || 'https://zero-risk-platform.vercel.app/api/sala/intake' }}"
    const v = veredicto(analizar(m), m)
    expect(v.ok).toBe(false)
    expect(v.problemas.join(' ')).toMatch(/sin esperar/)
  })
  it('🔴 falla en voz alta si ya está adaptado o si el sobre cambió de forma (no adivina)', () => {
    expect(() => guardarSobreEnEspera(despues)).toThrow(/ya no manda a la sala/)
    const raro = JSON.parse(JSON.stringify(antes)); nodo(raro, SOBRE).parameters.jsonBody = 'sin igual'
    expect(() => guardarSobreEnEspera(raro)).toThrow(/forma esperada/)
  })
  it('la foto publicada del alta = el constructor sobre la foto de ANTES (nodos y conexiones)', () => {
    const norm = (w: any) => JSON.stringify({ n: w.nodes.map((x: any) => [x.name, JSON.stringify(x.parameters ?? {}), !!x.disabled]).sort(), c: w.connections })
    expect(norm(leer('alta-VIVO-2026-11-03.json'))).toBe(norm(despues))
  })
})
