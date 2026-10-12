/**
 * Fuentes públicas · el cable en el alta. Sin n8n ni Apify de verdad: los nodos de código se corren con un mundo falso.
 * Cubre: se reconstruye igual desde el respaldo y solo cambia lo previsto · el orden (el resumen sigue donde seguía el agregado) · armar las llamadas con 3 rubros · el plan que falla no para el alta · el resumen.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cableDeFuentes, NOMBRE_AGREGADO } from '../scripts/worker-staging/construir-fuentes-alta.mjs'
import { planDeLaFicha } from '@/lib/fuentes-publicas'

type Nodo = { name: string; type: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, { main: Array<Array<{ node: string }>> }> }
const WS = join(process.cwd(), 'scripts/worker-staging/LyVoKcrypS5uLyuu')
const leer = (p: string) => JSON.parse(readFileSync(join(WS, p), 'utf8')) as Flujo
const ANTES = leer('alta-ANTES-fuentes-2026-10-12.json')
const HOY = leer('alta-ARREGLADA-fuentes-2026-10-12.json')
const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!
const lf = (s: string) => s.split('\r\n').join('\n')
const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<any>
const PARSER = '[APIFY-WIRE] Discovery Parser · dynamic targets (lazo)'
const NUEVOS = ['[FUENTES] Plan de fuentes públicas', '[FUENTES] Armar las llamadas', '[FUENTES] ¿Hay llamadas?', '[FUENTES] Llamar al Servicio', '[FUENTES] Resumen']

async function correr(nombre: string, entradas: any[], mundo: Record<string, any>) {
  const fn = new AsyncFunction('$', '$input', '$workflow', '$execution', lf(String(nodo(HOY, nombre).parameters.jsCode)))
  const $ = (n: string) => { if (mundo[n]) return { first: () => ({ json: mundo[n] }) }; throw new Error('nodo ' + n) }
  const $input = { first: () => ({ json: entradas[0] }), all: () => entradas.map((json) => ({ json })) }
  return (await (fn as any)($, $input, { id: 'wf1' }, { id: 'ex1' })) as Array<{ json: any; pairedItem?: any }>
}
const CID = '11111111-1111-4111-8111-111111111111'
const mundo = { [PARSER]: { client_id: CID }, 'Validate Deal Data': { client_id: CID }, [NOMBRE_AGREGADO]: { scope: 'onboarding_e2e', summary: { total_calls: 2 }, sources: [{ apify_function: 'x' }] } }

describe('el cable se reconstruye igual y solo agrega lo previsto', () => {
  it('reproducible desde el respaldo', () => { expect(JSON.stringify(cableDeFuentes(ANTES))).toBe(JSON.stringify(HOY)) })
  it('5 nodos nuevos y ningún nodo existente cambió', () => {
    expect(HOY.nodes.length).toBe(ANTES.nodes.length + 5)
    for (const a of ANTES.nodes) expect(JSON.stringify(nodo(HOY, a.name)), a.name).toBe(JSON.stringify(a))
    expect(HOY.nodes.filter((n) => NUEVOS.includes(n.name)).length).toBe(5)
  })
  it('el resumen sigue donde seguía el agregado; el agregado ahora entra al plan; nada más cambió de conexiones', () => {
    expect(HOY.connections[NOMBRE_AGREGADO].main[0].map((x) => x.node)).toEqual(['[FUENTES] Plan de fuentes públicas'])
    expect(HOY.connections['[FUENTES] Resumen'].main[0].map((x) => x.node)).toEqual(ANTES.connections[NOMBRE_AGREGADO].main[0].map((x) => x.node))
    for (const k of Object.keys(ANTES.connections)) if (k !== NOMBRE_AGREGADO) expect(JSON.stringify(HOY.connections[k]), k).toBe(JSON.stringify(ANTES.connections[k]))
    expect(HOY.connections['[FUENTES] ¿Hay llamadas?'].main.map((r) => r.map((x) => x.node))).toEqual([['[FUENTES] Llamar al Servicio'], ['[FUENTES] Resumen']])
  })
  it('la llave de Apify no viaja en el cable (el Servicio la pone) y el plan usa la llave interna del entorno', () => {
    expect(JSON.stringify(HOY.nodes.filter((n) => NUEVOS.includes(n.name)))).not.toMatch(/apify_api_|Bearer [A-Za-z0-9]/)
    expect(JSON.stringify(nodo(HOY, '[FUENTES] Plan de fuentes públicas').parameters)).toContain('$env.INTERNAL_API_KEY')
  })
  it('el alta sigue apagada si estaba apagada', () => { expect((HOY as any).active).toBe((ANTES as any).active) })
})

describe('armar las llamadas · 3 rubros distintos', () => {
  const CLIENTES = [
    planDeLaFicha({ name: 'Casa Demo', industry: 'restaurante', country: 'Colombia', website_url: 'https://casademo.example', config: { apify: { own_handles: { instagram: 'casademo' } } } }, [{ apify_function: 'own_google_maps_profile', respuesta: [{ title: 'Casa Demo', placeId: 'ChIJ1' }] }]),
    planDeLaFicha({ name: 'Producto Demo', industry: 'software SaaS', country: 'Uruguay', website_url: 'https://productodemo.example', config: { apify: { own_handles: { youtube: 'productodemo' } } } }, []),
    planDeLaFicha({ name: 'Clínica Demo', industry: 'clínica dental', country: 'Argentina', website_url: 'https://clinicademo.example' }, []),
  ]
  it.each(CLIENTES.map((c, i) => [i, c] as const))('cliente %i: una llamada por cada una del plan, en destino «respuesta», con el cliente y sin dry_run', async (_i, c) => {
    const plan = { ok: true, ...c.plan, estimado: c.estimado }
    const out = await correr('[FUENTES] Armar las llamadas', [plan], mundo)
    if (!c.plan.llamadas.length) { expect(out.length).toBe(1); expect(out[0].json._sin_llamadas).toBe(true); expect(out[0].json.omitidas.length).toBeGreaterThan(0); return }
    expect(out.length).toBe(c.plan.llamadas.length)
    for (const o of out) { expect(o.json.client_id).toBe(CID); expect(o.json.destination).toBe('respuesta'); expect(o.json.dry_run).toBe(false); expect(o.json.metadata.target_kind).toBe('own') }
    expect(out[0].json._omitidas).toEqual(c.plan.omitidas)
  })
  it('un plan que falla (error del endpoint) NO para el alta: un solo ítem marcador con el motivo', async () => {
    const out = await correr('[FUENTES] Armar las llamadas', [{ error: 'plan_fallo', detail: 'la base no contestó' }], mundo)
    expect(out.length).toBe(1)
    expect(out[0].json._sin_llamadas).toBe(true); expect(out[0].json._plan_error).toMatch(/la base no contestó/)
  })
})

describe('resumen', () => {
  it('cuenta lo pedido, lo que trajo datos y lo que falló o vino vacío; devuelve el ítem del agregado más fuentes_publicas', async () => {
    const out = await correr('[FUENTES] Resumen', [
      { ok: true, apify_function: 'resenas_google_maps', sin_resultados: false },
      { ok: true, apify_function: 'resenas_facebook', sin_resultados: true, cero: { motivo: 'no_items' } },
      { ok: false, apify_function: 'videos_tiktok', errors: ['actor caído'] },
    ], mundo)
    const j = out[0].json
    expect(j.scope).toBe('onboarding_e2e'); expect(j.sources).toEqual([{ apify_function: 'x' }]); expect(out[0].pairedItem).toEqual({ item: 0 })
    expect(j.fuentes_publicas).toMatchObject({ pedidas: 3, con_datos: 1 })
    expect(j.fuentes_publicas.sin_datos_o_rechazadas.map((x: any) => x.funcion)).toEqual(['resenas_facebook', 'videos_tiktok'])
  })
  it('sin llamadas: pasa el ítem tal cual, con lo omitido y el motivo del plan si falló', async () => {
    const out = await correr('[FUENTES] Resumen', [{ _sin_llamadas: true, omitidas: [{ plataforma: 'X', motivo: 'm' }], estimado_usd: 0, _plan_error: 'boom' }], mundo)
    expect(out[0].json.fuentes_publicas).toMatchObject({ pedidas: 0, omitidas: [{ plataforma: 'X', motivo: 'm' }], plan_error: 'boom' })
    expect(out[0].json.summary.total_calls).toBe(2)
  })
})
