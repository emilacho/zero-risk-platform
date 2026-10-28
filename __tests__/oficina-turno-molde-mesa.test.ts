/**
 * LA MESA EN SECO (28-oct) · el «modelo simulado» del flujo `oficina · turno` habla como la mesa. US$ 0, sin red.
 * Primer ensayo seco real: el director falló 3 veces con OFICINA_SIN_MOLDE_SIMULADO · esquema «opinion_libre.v1» (sin molde). Aquí:
 *  ① el nodo ② PARCHEADO (código vivo + parche) juega la pieza de punta a punta contra el motor real de la mesa (director → pedir_material → portero → especialistas → integra con citas → cierra);
 *  ② SISTÉMICO: todo esquema que usa un paso de agente de CUALQUIER plantilla (incluidas las de la mesa) tiene molde en seco — la lista no excluye ninguno.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { cambiarPedido, construirFlujo } from '../scripts/worker-staging/bTbWL9lUvQCfStAz/construir-mesa-molde.mjs'
import { registrarHerramienta } from '../src/lib/oficina/mesa/herramienta'
import { recibirResultado } from '../src/lib/oficina/orquestador'
import { CARRUSEL_IG_CON_JEFATURA, KIT_HISTORIAS_CON_JEFATURA, POST_IMG_CON_JEFATURA } from '../src/lib/oficina/plantillas/con-jefatura'
import { CARRUSEL_MESA, KIT_MESA } from '../src/lib/oficina/plantillas/mesa'
import { POST_IMG } from '../src/lib/oficina/plantillas/post-img'
import { CARRUSEL_IG_V1 } from '../src/lib/oficina/plantillas/carrusel-ig-v1'
import { KIT_HISTORIAS } from '../src/lib/oficina/plantillas/kit-historias'
import { montar } from '../src/lib/oficina/__tests__/mesa-arnes'

const RAIZ = process.cwd()
const VIVO = fs.readFileSync(path.join(RAIZ, 'scripts/worker-staging/bTbWL9lUvQCfStAz/turno-armar-ANTES-mesa-2026-10-28.js'), 'utf8')
const PARCHEADO: string = cambiarPedido(VIVO)
const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (this: unknown, ...a: unknown[]) => Promise<Array<{ json: Record<string, unknown> }>>

type Pedido = { agent_name: string; task: string; esquema: string; extra?: Record<string, unknown>; client_id: string }
type Hecho = { json: { resultado_body: { texto?: string; error?: string; n: number } } }

/** corre el nodo ② tal como lo corre n8n: `this.helpers.httpRequest` es la ruta real de la herramienta (llamada directa al motor) */
async function correrNodo(codigo: string, encargo_id: string, n: number, pedido: Pedido, llamadas: Array<Record<string, unknown>> = [], http?: (o: Record<string, unknown>) => Promise<unknown>) {
  const e = { dry_run: true, encargo_id, turno: { n, pedido } }
  const f = new AsyncFunction('$input', '$workflow', '$execution', '$env', codigo)
  const ctx = { helpers: { httpRequest: async (o: Record<string, unknown>) => { llamadas.push(o); if (!http) throw new Error('no debía llamar a la red'); return http(o) } } }
  return (await f.call(ctx, { first: () => ({ json: e }) }, { id: 'wf' }, { id: 'ex', resumeUrl: 'u' }, { INTERNAL_API_KEY: 'k-interna' }))[0] as unknown as Hecho & { json: { simulado: boolean } }
}

describe('① la mesa jugada con el nodo ② parcheado, contra el motor real', () => {
  it('abre, el director pide material DE VERDAD, el portero responde, cada especialista aporta, la integración cita a todos y la pieza se entrega', async () => {
    const { M, MS, a, id } = await montar()
    let ultima = a
    const turnos: string[] = []
    const llamadasHttp: Array<Record<string, unknown>> = []
    for (let i = 0; i < 40 && ultima.cuerpo.accion === 'esperar'; i++) {
      const t = ultima.cuerpo.turno as { n: number; paso: string; agente: string; tipo: string; pedido: Pedido & { cuerpo?: unknown } }
      turnos.push(t.paso)
      let resultado: { texto?: string; error?: string; costo_usd?: number }
      if (t.tipo === 'portero') {
        resultado = { texto: JSON.stringify({ caso: 'x', cliente: 'c', modo: 'conversado', estado: 'ok', material: [{ dato: '(simulado) horario de atención' }] }), costo_usd: 0 }
      } else {
        const r = await correrNodo(PARCHEADO, id, t.n, t.pedido, llamadasHttp, async (o) => (await registrarHerramienta(M.P, o.body as Record<string, unknown>)).cuerpo)
        expect(r.json.simulado).toBe(true)
        resultado = r.json.resultado_body
        expect(resultado.error, `${t.paso}: ${resultado.error}`).toBeUndefined()
      }
      ultima = await recibirResultado(M.P, id, t.n, { ...resultado, workflow_execution_id: `ex-${t.n}`, costo_usd: resultado.costo_usd ?? 0 })
    }
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado', simulado: true })
    // el director pidió material con la herramienta real y llegó al portero
    expect(llamadasHttp).toHaveLength(1)
    expect(llamadasHttp[0]).toMatchObject({ method: 'POST', headers: { 'x-api-key': 'k-interna' } })
    expect(String(llamadasHttp[0].url)).toMatch(/\/api\/oficina\/mesa\/herramienta$/)
    expect(MS.filas.map((f) => f.tipo)).toContain('pide')
    expect(MS.filas.filter((f) => f.tipo === 'material')).toHaveLength(1)
    // cada especialista pertinente aportó y la integración los citó (el código lo comprueba)
    expect(MS.filas.filter((f) => f.tipo === 'aporta')).toHaveLength(4)
    expect(MS.filas.filter((f) => f.tipo === 'integra')).toHaveLength(1) // sin devolución por citas
    expect(turnos.some((p) => p.includes('devolver_citas'))).toBe(false)
    expect(M.llamadas.renderPedidos[0].slides).toHaveLength(5)
  })

  it('si la herramienta no anota el pedido, el director NO finge éxito: el turno vuelve con error visible', async () => {
    const { M, a, id } = await montar()
    const t = a.cuerpo.turno as { n: number; pedido: Pedido }
    const r = await correrNodo(PARCHEADO, id, t.n, t.pedido, [], async () => ({ ok: false, motivo: 'esta pieza no tiene portero del cerebro disponible' }))
    expect(r.json.resultado_body.texto).toBeUndefined()
    expect(r.json.resultado_body.error).toMatch(/^MESA_SECO · pedir_material no quedó anotado/)
    void M
  })

  it('un turno de la mesa que el molde no conoce falla VISIBLE (no se inventa)', async () => {
    const r = await correrNodo(PARCHEADO, 'enc', 3, { agent_name: 'x', esquema: 'opinion_libre.v1', task: '## Tu turno · otra cosa', extra: { mesa: true }, client_id: 'c' })
    expect(r.json.resultado_body.error).toMatch(/OFICINA_SIN_MOLDE_SIMULADO/)
  })

  it('«opinion_libre.v1» de la oficina de siempre (sin mesa) tiene molde y no llama a la red', async () => {
    const llamadas: Array<Record<string, unknown>> = []
    const r = await correrNodo(PARCHEADO, 'enc', 3, { agent_name: 'brand_strategist', esquema: 'opinion_libre.v1', task: 'opina', client_id: 'c' }, llamadas)
    expect(r.json.resultado_body.texto).toMatch(/simulado/); expect(llamadas).toHaveLength(0)
  })

  it('en modo REAL el bloque no se ejecuta (el nodo arma el pedido como siempre)', async () => {
    const f = new AsyncFunction('$input', '$workflow', '$execution', '$env', PARCHEADO)
    const e = { dry_run: false, encargo_id: 'enc', turno: { n: 3, dispatch_key: 'dk', pedido: { esquema: 'opinion_libre.v1', task: 't', agent_name: 'creative-director-mesa', client_id: 'c', extra: { mesa: true }, max_budget_usd: 1 } } }
    const sal = await f.call({ helpers: { httpRequest: async () => { throw new Error('no debía llamar') } } }, { first: () => ({ json: e }) }, { id: 'wf' }, { id: 'ex', resumeUrl: 'u' }, {})
    expect(sal[0].json.simulado).toBe(false)
  })

  it('el parche cambia solo el nodo «② Armar el pedido» y no se aplica dos veces', () => {
    const flujo = { nodes: [{ name: '② Armar el pedido', parameters: { jsCode: VIVO } }, { name: 'otro', parameters: { jsCode: 'x' } }], connections: {} }
    const nuevo = construirFlujo(flujo)
    expect(nuevo.nodes[1]).toEqual(flujo.nodes[1])
    expect(nuevo.nodes[0].parameters.jsCode).toBe(PARCHEADO)
    expect(() => cambiarPedido(PARCHEADO)).toThrow(/ya tiene/)
    expect(PARCHEADO.replace('LA MESA EN SECO', '')).not.toBe(PARCHEADO)
  })
})

describe('② SISTÉMICO · ninguna plantilla usa un esquema sin molde en seco', () => {
  const PLANTILLAS = { POST_IMG, CARRUSEL_IG_V1, KIT_HISTORIAS, POST_IMG_CON_JEFATURA, CARRUSEL_IG_CON_JEFATURA, KIT_HISTORIAS_CON_JEFATURA, CARRUSEL_MESA, KIT_MESA }
  const esquemasDe = (pl: { pasos: Array<{ tipo: string; salida?: { esquema?: string } }> }): string[] => pl.pasos.filter((p) => p.tipo === 'agente' && p.salida?.esquema).map((p) => String(p.salida!.esquema))
  const conMolde = (esquema: string): boolean => PARCHEADO.includes(`'${esquema}'`)

  it.each(Object.entries(PLANTILLAS))('%s: cada esquema de sus pasos de agente tiene molde', (_n, pl) => {
    const sin = esquemasDe(pl as never).filter((e) => !conMolde(e))
    expect(sin).toEqual([])
  })
  it('el esquema con el que habla la mesa (pedidoDeAgente) tiene molde', async () => {
    const { pedidoDeAgente } = await import('../src/lib/oficina/mesa/pedidos')
    const p = pedidoDeAgente({ agente: 'x', task: 't', encargo_id: 'e', client_id: 'c', dry_run: true, paso: 'mesa:dirigir:x', reserva_usd: 1 }) as { esquema: string }
    expect(conMolde(p.esquema)).toBe(true)
  })
  it('la lista no es vacía (la prueba no pasa por no mirar nada)', () => {
    const todos = Object.values(PLANTILLAS).flatMap((pl) => esquemasDe(pl as never))
    expect(todos.length).toBeGreaterThan(10)
    expect(new Set(todos).size).toBeGreaterThan(8)
  })
})
