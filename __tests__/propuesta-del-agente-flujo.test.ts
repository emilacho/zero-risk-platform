/** El flujo «Manual · propuesta del agente»: estructura, que el agente se llame sin reintento y de a uno, y los nodos de código con un mundo falso. Sin n8n ni modelo. */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { construirFlujo, RUTA_WEBHOOK } from '../scripts/worker-staging/construir-propuesta-flujo.mjs'

type Nodo = { name: string; type: string; retryOnFail?: boolean; parameters: Record<string, any> }
type Flujo = { name: string; nodes: Nodo[]; connections: Record<string, { main: Array<Array<{ node: string }>> }> }
const HOY = JSON.parse(readFileSync(join(process.cwd(), 'scripts/worker-staging/propuesta-del-agente/propuesta-NUEVO-2026-10-12.json'), 'utf8')) as Flujo
const nodo = (n: string) => HOY.nodes.find((x) => x.name === n)!
const lf = (s: string) => s.split('\r\n').join('\n')
const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<any>
async function correr(nombre: string, entrada: any[], mundo: Record<string, any[]>) {
  const fn = new AsyncFunction('$', '$json', '$input', lf(String(nodo(nombre).parameters.jsCode)))
  const $ = (n: string) => { if (mundo[n]) return { first: () => ({ json: mundo[n][0] }), all: () => mundo[n].map((json) => ({ json })) }; throw new Error('nodo ' + n) }
  return (await (fn as any)($, entrada[0], { first: () => ({ json: entrada[0] }), all: () => entrada.map((json) => ({ json })) })) as Array<{ json: any }>
}

describe('estructura', () => {
  it('se reconstruye igual', () => { expect(JSON.stringify(construirFlujo())).toBe(JSON.stringify(HOY)) })
  it('toda conexión apunta a un nodo que existe y todo nodo (menos el disparador) tiene entrada', () => {
    const nombres = new Set(HOY.nodes.map((n) => n.name))
    const destinos = new Set<string>()
    for (const [de, c] of Object.entries(HOY.connections)) { expect(nombres.has(de), de).toBe(true); for (const r of c.main) for (const d of r) { expect(nombres.has(d.node), d.node).toBe(true); destinos.add(d.node) } }
    for (const n of HOY.nodes) if (n.name !== 'Pedir propuesta') expect(destinos.has(n.name), n.name).toBe(true)
  })
  it('el webhook es POST y responde al recibir (no cuelga a quien llama)', () => {
    expect(nodo('Pedir propuesta').parameters).toMatchObject({ httpMethod: 'POST', path: RUTA_WEBHOOK, responseMode: 'onReceived' })
  })
  it('el agente se llama SIN reintento y de a uno, con el contexto del flujo (los agentes solo se invocan por flujos)', () => {
    const a = nodo('Llamar al agente')
    expect(a.retryOnFail).toBe(false)
    expect(a.parameters.options.batching.batch.batchSize).toBe(1)
    expect(a.parameters.jsonBody).toContain('"workflow_execution_id": "{{ $execution.id }}"')
    expect(a.parameters.jsonBody).toContain('"workflow_id": "{{ $execution.id }}"')
  })
  it('ninguna llave pegada: todo por variable de entorno', () => {
    const t = JSON.stringify(HOY)
    expect(t).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{20,}|xox[a-z]-|[0-9a-f]{64}/)
    expect(t).toContain('$env.INTERNAL_API_KEY')
  })
  it('lo que no se aplicó va directo al recibo, sin guardar ni subir nada', () => {
    expect(HOY.connections['¿Guardar?'].main[1].map((d) => d.node)).toEqual(['Recibo'])
    expect(HOY.connections['¿Seguir?'].main[1]).toEqual([])
  })
})

describe('Armar pedidos', () => {
  const mundo = (dry: boolean) => ({ 'Pedir propuesta': [{ body: { client_id: 'c1', dry_run: dry, campos: ['mision'] } }] })
  const prep = { ok: true, client_id: 'c1', client_name: 'Negocio Demo', version_base: 4, huella_base: 'h', faltantes: ['mision'], pedidos: [{ agente: 'jefe-client-success', campos: ['mision'], task: 'haz esto' }] }
  it('un ítem por agente con todo lo que hace falta para llamar y para aplicar', async () => {
    const out = await correr('Armar pedidos', [prep], mundo(false))
    expect(out.length).toBe(1)
    expect(out[0].json).toMatchObject({ client_id: 'c1', agente: 'jefe-client-success', campos: ['mision'], task: 'haz esto', version_base: 4, huella_base: 'h' })
  })
  it('con dry_run NO sale ningún pedido: se para y dice lo que pediría', async () => {
    const out = await correr('Armar pedidos', [prep], mundo(true))
    expect(out.length).toBe(1)
    expect(out[0].json).toMatchObject({ _parar: true, dry_run: true }); expect(out[0].json.pedidos[0]).toMatchObject({ agente: 'jefe-client-success', campos: ['mision'] })
  })
  it('sin campos que proponer o con la preparación caída, para con su motivo', async () => {
    expect((await correr('Armar pedidos', [{ ok: true, pedidos: [], rechazados: [{ campo: 'proposito', motivo: 'ya tiene contenido' }] }], mundo(false)))[0].json.motivo).toMatch(/ya tiene contenido/)
    expect((await correr('Armar pedidos', [{ error: 'lectura_fallida', detail: 'la base no contestó' }], mundo(false)))[0].json.motivo).toMatch(/la base no contestó/)
  })
})

describe('Reunir y Recibo', () => {
  it('reúne la respuesta de cada agente en el orden de los pedidos y deja afuera al que falló', async () => {
    const pedidos = [{ client_id: 'c1', client_name: 'N', agente: 'a1', campos: ['mision'], version_base: 4, huella_base: 'h' }, { client_id: 'c1', agente: 'a2', campos: ['mensajes_clave'] }]
    const out = await correr('Reunir', [{ body: { response: '{"mision":1}' } }, { body: { error: 'caído' } }], { 'Armar pedidos': pedidos })
    expect(out[0].json.respuestas).toEqual([{ agente: 'a1', response: '{"mision":1}', ok: true }])
    expect(out[0].json.agentes_sin_respuesta).toEqual(['a2']); expect(out[0].json.campos).toEqual(['mision', 'mensajes_clave']); expect(out[0].json.version_base).toBe(4)
  })
  it('el recibo dice lo que SUCEDIÓ: aplicado pero sin versión guardada se declara', async () => {
    const aplicado = { body: { aplicado: true, client_id: 'c1', version_base: 4, aplicadas: ['mision'], rechazadas: [], sin_leer: [], diferencias: [{ campo: 'mision' }] } }
    const sinGuardar = await correr('Recibo', [{}], { Aplicar: [aplicado], 'Guardar versión nueva': [{ body: { error: 'x' } }] })
    expect(sinGuardar[0].json).toMatchObject({ aplicado: true, guardado: false, motivo: 'se aplicó pero la versión nueva no se guardó' })
    const guardado = await correr('Recibo', [{}], { Aplicar: [aplicado], 'Guardar versión nueva': [{ body: { persisted: true, version: 5 } }] })
    expect(guardado[0].json).toMatchObject({ guardado: true, version_nueva: 5, campos_aplicados: ['mision'], motivo: null })
  })
})
