/**
 * Al terminar la alta, el agente propone lo que falta del manual (eslogan y campos vacíos) y NUNCA bloquea (regla de Emilio, 30-oct).
 * Solo las funciones puras; el guion contra n8n se prueba con --seco.
 */
import { describe, expect, it } from 'vitest'
import { NODO_CIERRE, NODO_NUEVO, WEBHOOK, agregarPropuesta, nodoPropuesta } from '../scripts/ops/alta-propuesta-tras-cierre.mjs'

const nodo = (name: string, extra: Record<string, unknown> = {}) => ({ id: name, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [100, 200], parameters: {}, ...extra })
const flujo = () => ({
  name: 'Alta · Segunda Fase',
  settings: { executionOrder: 'v1' },
  nodes: [nodo('Datos del alta'), nodo('Write-back'), nodo(NODO_CIERRE, { position: [1680, 480], onError: 'continueErrorOutput' }), nodo('Nota perdida · journey_completed'), nodo('Avisar')],
  connections: {
    'Write-back': { main: [[{ node: NODO_CIERRE, type: 'main', index: 0 }]] },
    [NODO_CIERRE]: { main: [[], [{ node: 'Nota perdida · journey_completed', type: 'main', index: 0 }]] },
    'Nota perdida · journey_completed': { main: [[{ node: 'Avisar', type: 'main', index: 0 }]] },
  },
})

describe('agregarPropuesta · el nodo va DESPUÉS del cierre y no cambia nada más', () => {
  it('cuelga el nodo de la salida de éxito del cierre; la salida de error queda como estaba', () => {
    const f = flujo()
    const { ya, flujo: out } = agregarPropuesta(f)
    expect(ya).toBe(false)
    expect(out.nodes).toHaveLength(f.nodes.length + 1)
    expect(out.connections[NODO_CIERRE].main[0]).toEqual([{ node: NODO_NUEVO, type: 'main', index: 0 }])
    expect(out.connections[NODO_CIERRE].main[1]).toEqual(f.connections[NODO_CIERRE].main[1])
  })
  it('no toca ningún otro nodo ni conexión, y no muta la entrada', () => {
    const f = flujo(), copia = JSON.parse(JSON.stringify(f))
    const { flujo: out } = agregarPropuesta(f)
    expect(f).toEqual(copia)
    for (const n of f.nodes) expect(out.nodes.find((x: { name: string }) => x.name === n.name)).toEqual(n)
    for (const k of Object.keys(f.connections)) if (k !== NODO_CIERRE) expect(out.connections[k]).toEqual(f.connections[k])
    expect(out.settings).toEqual(f.settings)
  })
  it('es idempotente: la segunda vez no agrega otro', () => {
    const una = agregarPropuesta(flujo()).flujo
    const dos = agregarPropuesta(una)
    expect(dos.ya).toBe(true)
    expect(dos.flujo.nodes.filter((n: { name: string }) => n.name === NODO_NUEVO)).toHaveLength(1)
  })
  it('si el flujo cambió y ya no tiene el nodo de cierre, falla ruidoso y no toca nada', () => {
    const f = flujo(); f.nodes = f.nodes.filter((n) => n.name !== NODO_CIERRE)
    expect(() => agregarPropuesta(f)).toThrow(/no encuentro el nodo/)
  })
})

describe('nodoPropuesta · las tres condiciones de «nunca bloquea»', () => {
  const n = nodoPropuesta([0, 0]) as unknown as { onError: string; retryOnFail: boolean; parameters: { url: string; jsonBody: string; options: { timeout: number; response: { response: { neverError: boolean } } }; method: string } }
  it('sigue en error: si el flujo de la propuesta falla, la alta termina igual', () => {
    expect(n.onError).toBe('continueRegularOutput')
    expect(n.parameters.options.response.response.neverError).toBe(true)
  })
  it('sin reintentos (no cobra dos veces) y con tiempo límite corto', () => {
    expect(n.retryOnFail).toBe(false)
    expect(n.parameters.options.timeout).toBeLessThanOrEqual(15000)
  })
  it('en ensayo va al eco y no llama al agente; en real llama al webhook de la propuesta', () => {
    expect(n.parameters.url).toContain("dry_run === true")
    expect(n.parameters.url).toContain('/api/dry-run/eco')
    expect(n.parameters.url).toContain(WEBHOOK)
    expect(WEBHOOK).toMatch(/\/webhook\/zero-risk\/manual-proponer-campos$/)
  })
  it('manda el cliente de la alta, sin dry_run y sin forzar nada más del manual', () => {
    expect(n.parameters.method).toBe('POST')
    expect(n.parameters.jsonBody).toContain("$('Datos del alta').first().json.client_id")
    expect(n.parameters.jsonBody).toContain('dry_run: false')
    expect(n.parameters.jsonBody).not.toMatch(/campos|reproponer/)
  })
  it('no lleva ninguna llave pegada', () => {
    expect(JSON.stringify(n)).not.toMatch(/[0-9a-f]{64}|eyJ[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{20,}|xox[a-z]-/)
  })
})
