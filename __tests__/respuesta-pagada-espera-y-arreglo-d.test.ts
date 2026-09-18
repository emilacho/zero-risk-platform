/**
 * 🔴 E96 · CC#3 · blindar la espera (①) + el arreglo D (②).
 *
 * ① CC#1 lo dejó dicho certificando E94: la espera se cortaba en la PRIMERA vuelta ante
 *   cualquier estado distinto de `completed`, **incluido `running`**. `running` no es un
 *   fallo: es «todavía no».
 * ② CC#2 lo midió en E86: el rescate del manual **pagaba dos veces** en vez de leer la
 *   respuesta ya pagada. En la bolita E83 el reintento costó US$ 0,1832 con la respuesta
 *   original ya cobrada y entera en el registro 58 s después del corte.
 *
 * NO toca producción · sin red.
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { recuperarRespuestaPagada, filaEstaEntera, type FilaInvocacion } from '../src/lib/respuesta-pagada'

vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({}) }))

const fila = (over: Partial<FilaInvocacion> = {}): FilaInvocacion => ({
  status: 'completed',
  output_summary: 'z'.repeat(190),
  session_id: 'ses-1',
  model: 'claude-sonnet-4-6',
  cost_usd: 0.138691,
  duration_ms: 92683,
  tokens_input: 3,
  tokens_output: 500,
  metadata: { response_length_real: 190, brand_section: { lens: 'jefe-client-success' }, step_name: 'bb-lens-jefe-client-success' },
  ...over,
})

const ctx = { agent: 'jefe-client-success', step: 'bb-lens-jefe-client-success', executionId: '140150' }
const reloj = () => {
  let t = 0
  return { esperar: async (ms: number) => { t += ms }, ahora: () => t, get t() { return t } }
}

describe('① la espera no se rinde con «todavía no»', () => {
  it('🔴 el rojo de CC#1 · `running` NO corta la espera: sigue hasta que la fila cierra', async () => {
    const r = reloj()
    let vueltas = 0
    const res = await recuperarRespuestaPagada(ctx, {
      buscarFila: async () => {
        vueltas++
        return r.t < 40_000 ? fila({ status: 'running', output_summary: '', metadata: {} }) : fila()
      },
      esperar: r.esperar,
      ahora: r.ahora,
    })
    expect(res?.response.length).toBe(190) // antes devolvía null en la primera vuelta
    expect(vueltas).toBeGreaterThan(1)
  })

  it('los demás estados «en curso» tampoco cortan', async () => {
    for (const estado of ['in_progress', 'started', 'pending', 'queued', 'waiting']) {
      const r = reloj()
      const res = await recuperarRespuestaPagada(ctx, {
        buscarFila: async () => (r.t < 10_000 ? fila({ status: estado, output_summary: '', metadata: {} }) : fila()),
        esperar: r.esperar,
        ahora: r.ahora,
      })
      expect(res, `estado ${estado}`).not.toBeNull()
    }
  })

  it('un fallo de verdad sigue cortando en la primera vuelta · no se espera al pedo', async () => {
    const r = reloj()
    let vueltas = 0
    const res = await recuperarRespuestaPagada(ctx, {
      buscarFila: async () => { vueltas++; return fila({ status: 'failed' }) },
      esperar: r.esperar,
      ahora: r.ahora,
    })
    expect(res).toBeNull()
    expect(vueltas).toBe(1)
  })

  it('una fila que no se puede probar entera no se espera de nuevo', async () => {
    const r = reloj()
    let vueltas = 0
    const res = await recuperarRespuestaPagada(ctx, {
      buscarFila: async () => { vueltas++; return fila({ output_summary: 'y'.repeat(2001), metadata: { response_length: 22888 } }) },
      esperar: r.esperar,
      ahora: r.ahora,
    })
    expect(res).toBeNull()
    expect(vueltas).toBe(1)
    expect(filaEstaEntera(fila({ output_summary: 'y'.repeat(2001), metadata: { response_length: 22888 } })).motivo).toMatch(/recortada/)
  })

  it('`completed` sigue funcionando igual (camino normal intacto)', async () => {
    const r = reloj()
    const res = await recuperarRespuestaPagada(ctx, { buscarFila: async () => fila(), esperar: r.esperar, ahora: r.ahora })
    expect(res?.costUsd).toBe(0.138691)
    expect(res?.brandSectionToolCall?.input).toEqual({ lens: 'jefe-client-success' })
    expect(r.t).toBe(0) // la encontró en la primera vuelta · no esperó
  })
})

describe('② el arreglo D · el rescate del manual lee en vez de pagar de nuevo', () => {
  const DIR = join(process.cwd(), 'scripts/worker-staging/ssLtwYPt7zxuvnM2')
  const vivo = JSON.parse(readFileSync(join(DIR, 'cimiento-VIVO-2026-09-18.json'), 'utf8')) as {
    nodes: Array<{ name: string; parameters: Record<string, any> }>
    connections: Record<string, { main?: Array<Array<{ node: string }>> }>
  }
  const hoy = JSON.parse(readFileSync(join(DIR, 'cimiento-construido-e96.json'), 'utf8')) as typeof vivo
  const VIEJO = '[BB] Rescate · red 2 · reintento'
  const NUEVO = '[BB] Rescate · red 2 · leer lo ya pagado'
  const nodo = (f: typeof vivo, n: string) => f.nodes.find((x) => x.name === n)

  it('🔴 el rojo · el nodo publicado hoy vuelve a invocar al empleado (paga dos veces)', () => {
    expect(String(nodo(vivo, VIEJO)!.parameters.url)).toContain('/api/agents/run-sdk')
    expect(String(nodo(vivo, VIEJO)!.parameters.jsonBody)).toContain('"task"')
  })

  it('ahora llama a la puerta que LEE lo ya pagado · sin tarea, sin invocar', () => {
    const n = nodo(hoy, NUEVO)!
    expect(String(n.parameters.url)).toContain('/api/agents/respuesta-pagada')
    expect(String(n.parameters.jsonBody)).not.toContain('"task"')
    expect(String(n.parameters.jsonBody)).toContain('"step_name": "{{ $json._step }}"') // el paso ORIGINAL, el pagado
    expect(String(n.parameters.jsonBody)).toContain('"tope_ms": 120000')
    expect(n.parameters.options.timeout).toBe(190000)
  })

  it('el nombre deja de mentir y las conexiones lo siguen', () => {
    expect(nodo(hoy, VIEJO)).toBeUndefined()
    const entradasARed3 = Object.entries(hoy.connections)
      .filter(([, c]) => (c.main ?? []).some((s) => (s ?? []).some((x) => x.node.endsWith('red 3 · fusionar o PARAR'))))
      .map(([k]) => k)
    expect(new Set(entradasARed3)).toEqual(new Set(['[BB] Rescate · ¿falta alguna?', NUEVO]))
    expect(hoy.connections['[BB] Rescate · ¿falta alguna?']).toEqual(
      expect.objectContaining({
        main: expect.arrayContaining([expect.arrayContaining([expect.objectContaining({ node: NUEVO })])]),
      }),
    )
  })

  it('cambia SÓLO ese nodo · el resto del cimiento queda igual', () => {
    const distintos = vivo.nodes
      .filter((n) => n.name !== VIEJO)
      .filter((n) => JSON.stringify(n) !== JSON.stringify(nodo(hoy, n.name)))
    expect(distintos.map((n) => n.name)).toEqual([])
    expect(hoy.nodes.length).toBe(vivo.nodes.length)
  })

  it('la red 3 lee la respuesta de la puerta sin cambiar una línea (brand_section al nivel de siempre)', () => {
    const red3 = String(nodo(hoy, '[BB] Rescate · red 3 · fusionar o PARAR')!.parameters.jsCode)
    const triaje = [{ json: { secciones: { 'brand-strategist': { lens: 'brand-strategist' }, 'editor-en-jefe': { lens: 'editor-en-jefe' } }, origen: {}, _lente: 'jefe-client-success' } }]
    const dePuerta = [{ json: { ok: true, recuperado: true, agent: 'jefe-client-success', response: 'x', brand_section: { lens: 'jefe-client-success' }, ahorro_usd: 0.1387 }, pairedItem: { item: 0 } }]
    const $ = (n: string) => {
      if (n !== '[BB] Rescate · red 1 · triaje') throw new Error('no ejecutado')
      return { all: () => triaje, first: () => triaje[0] }
    }
    const [out] = new Function('$input', '$', red3)({ all: () => dePuerta }, $) as Array<{ json: any }>
    expect(Object.keys(out.json.secciones).sort()).toEqual(['brand-strategist', 'editor-en-jefe', 'jefe-client-success'])
    expect(out.json.origen['jefe-client-success']).toBe('reintento')
  })

  it('si la puerta dice «no sé», la red 3 sigue parando ruidoso', () => {
    const red3 = String(nodo(hoy, '[BB] Rescate · red 3 · fusionar o PARAR')!.parameters.jsCode)
    const triaje = [{ json: { secciones: {}, origen: {}, _lente: 'jefe-client-success' } }]
    const noSe = [{ json: { ok: false, recuperado: false, motivo: 'no hay respuesta pagada que se pueda probar entera · «no sé»' }, pairedItem: { item: 0 } }]
    const $ = () => ({ all: () => triaje, first: () => triaje[0] })
    expect(() => new Function('$input', '$', red3)({ all: () => noSe }, $)).toThrow(/LENTE_SIN_SECCION/)
  })
})
