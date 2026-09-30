/**
 * LA PALANCA Y EL PARTE QUE NO MIENTE · pruebas a costo cero · CC#1 · 2026-09-30 · encargo Lenovo + 2 decisiones de Emilio
 * (agent_run_completed simétrico · el campo del costo). Corre el CÓDIGO EXACTO de cada nodo (el que el constructor pega en n8n).
 *
 * 🔴 Cada rojo se prueba contra el defecto real:
 *   · palanca: el cuerpo que paga trae callback_mode:"runner" (y dry_run sigue explícito)
 *   · costo: la vuelta trae `cost_usd` y ahora se lee (antes salía null)
 *   · parte vacío: NO sube a Drive sin marca, la corrida NO cierra «correcta», el cable declara el resultado REAL
 *   · parte SANO: idéntico a hoy (sube, cierra, sin marca)
 *   · agent_run_completed: el corredor emite las MISMAS propiedades que Vercel
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { eventoDeCorridaCompleta, emitirEventoPostHog } from '../services/agent-runner/src/lib/entrega-de-la-vuelta'
import { correrYEntregar } from '../services/agent-runner/src/lib/correr-y-entregar'

const require = createRequire(import.meta.url)
const DIR = join(process.cwd(), 'scripts', 'worker-staging', 'brief-parte-de-trabajo')
const leer = (f: string) => readFileSync(join(DIR, f), 'utf8')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const { chequear, extraerParte } = require(join(DIR, 'brief-chequeos.js'))
const { armarSimulacroSano } = require(join(DIR, 'simulacro-parte-sano.js'))
const { construirFlujo } = await import(pathToFileURL(join(DIR, 'construir-brief.mjs')).href)

type Ctx = { input?: unknown[]; refs?: Record<string, unknown>; env?: Record<string, string> }
async function correrNodo(archivo: string, ctx: Ctx, conChequeos = false) {
  const items = (ctx.input ?? [{}]).map((j) => ({ json: j }))
  const $input = { first: () => items[0], all: () => items }
  const $ = (n: string) => {
    if (!(ctx.refs && n in ctx.refs)) throw new Error('nodo no ejecutado: ' + n)
    return { first: () => ({ json: ctx.refs![n] }), all: () => [{ json: ctx.refs![n] }] }
  }
  let codigo = leer(archivo).replace('__REFERENCIA__', JSON.stringify(leer('referencia-el-brief-de-un-entregable.md')))
  if (conChequeos) {
    const c = leer('brief-chequeos.js')
    const i = c.indexOf("if (typeof module !== 'undefined' && module.exports)")
    codigo = (i === -1 ? c : c.slice(0, i)) + '\n' + codigo
  }
  const fn = new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', codigo)
  return fn($input, $, ctx.env ?? {}, items[0]?.json, { id: 'WF-1' }, { id: '999', resumeUrl: 'https://n8n.test/webhook-waiting/999' })
}

const CID = '41dd3d62-d6de-4c9a-9996-6df78c1da118'
const PLAN = `# PLAN DE CAMPAÑA 90 DÍAS · NÁUFRAGO
## LAS CUATRO PUERTAS
### Semana 1-2 · el camino de Instagram para el turno de la mañana
Anuncio de imagen para mostrar el ceviche de Olón al adulto urbano guayaquileño.`
const MANUAL = { forbidden_words: ['premium', 'el mejor', 'calidad garantizada', 'ghost kitchen'], required_terminology: ['marisco de Olón'] }
const N3 = '③ Armar el cuerpo del redactor'
const N4 = '④ Chequeos'
const N5 = '⑤ ¿Guardó y salió el PDF?'
const base = (over: Record<string, unknown> = {}) => ({
  client_id: CID, client_name: 'Náufrago', dry_run: true, plan_id: 'plan-1', plan_texto: PLAN, manual_id: 'm1', manual_version: 3,
  forbidden_words: MANUAL.forbidden_words, required_terminology: MANUAL.required_terminology, cuerpo: { dry_run: true }, ...over,
})
/** ③ ¿Llegó la vuelta? → ④ Chequeos, con el texto de la vuelta dado */
async function hastaChequeos(textoVuelta: string | null, dry = true) {
  const [{ json: vuelta }] = await correrNodo('n3-llego-la-vuelta.js', {
    input: [textoVuelta === null ? {} : { body: { response: textoVuelta, cost_usd: 0.42, model: 'claude-sonnet-4-6' } }],
    refs: { [N3]: { ...base({ dry_run: dry }), simulacro_respuesta: null } },
  })
  const [{ json: cheq }] = await correrNodo('n4-chequeos-nodo.js', { input: [vuelta] }, true)
  return { vuelta, cheq }
}
const problemasDeCierre = (cheq: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  correrNodo('n5-cierre.js', { refs: { [N4]: cheq, '⑤ Guardar el parte': { body: [{ id: 'fila-1' }] }, '⑤ Parte a Drive': { body: { ok: true, file_id: 'F1', url: 'u' }, ...extra } } })

describe('el simulacro de un parte SANO (para probar en ensayo)', () => {
  it('sale de un plan y un manual REALES y PASA todos los chequeos (0 hallazgos)', () => {
    const txt = armarSimulacroSano(PLAN, MANUAL)
    const ext = extraerParte(txt)
    expect(ext.legible).toBe(true)
    const r = chequear(ext.parte, MANUAL, PLAN)
    expect(r.hallazgos).toEqual([])
    expect(r.ok).toBe(true)
    expect(ext.parte.entregables).toHaveLength(2)
  })
  it('ROJO · no es un pase automático: si se le quita la cita al plan o se le pone una prohibida, los chequeos LO CAZAN', () => {
    const ext = extraerParte(armarSimulacroSano(PLAN, MANUAL))
    ext.parte.entregables[0].mensaje = 'el mejor marisco premium'
    expect(chequear(ext.parte, MANUAL, PLAN).ok).toBe(false)
    const otro = extraerParte(armarSimulacroSano(PLAN, MANUAL))
    otro.parte.entregables[1].de_que_parte_del_plan = 'una frase que el plan jamás dijo'
    expect(chequear(otro.parte, MANUAL, PLAN).hallazgos.some((h: { chequeo: string }) => h.chequeo === 'cita_al_plan')).toBe(true)
  })
})

describe('1 · la palanca y 4 · el costo', () => {
  it('🔴 el cuerpo que paga trae callback_mode:"runner" Y dry_run explícito (la palanca no se lleva el interruptor)', async () => {
    const prev = { ...base(), dry_run: true, manual_texto: 'm', plan_id: 'p', manual_version: 1, manual_id: 'm', client_id: CID, plan_texto: PLAN }
    const [{ json }] = await correrNodo('n3-armar-cuerpo.js', { input: [{ name: 'Náufrago' }], refs: { '② ¿Ya hay parte de este plan? · guarda': prev } })
    expect(json.cuerpo).toMatchObject({ agent: 'campaign-brief-agent', callback_mode: 'runner', dry_run: true, force_restart: true })
    expect(json.cuerpo.callback_url).toBe('https://n8n.test/webhook-waiting/999')
    const [{ json: real }] = await correrNodo('n3-armar-cuerpo.js', { input: [{ name: 'x' }], refs: { '② ¿Ya hay parte de este plan? · guarda': { ...prev, dry_run: false } } })
    expect(real.cuerpo).toMatchObject({ callback_mode: 'runner', dry_run: false })
  })
  it('la palanca está en UN solo agente y en UN solo nodo del flujo', () => {
    const f = construirFlujo()
    const texto = JSON.stringify(f.nodes.map((n: { parameters: unknown }) => n.parameters))
    expect((texto.match(/callback_mode/g) || []).length).toBe(1)
    expect(texto).toContain("agent: 'campaign-brief-agent'")
  })
  it('🔴 el costo: la vuelta trae `cost_usd` y ahora SE LEE (antes salía null · corrida del 29-sep)', async () => {
    const { vuelta } = await hastaChequeos('texto')
    expect(vuelta.vuelta_costo_usd).toBe(0.42)
    const [{ json: viejo }] = await correrNodo('n3-llego-la-vuelta.js', { input: [{ body: { response: 'x', costUsd: 0.1 } }], refs: { [N3]: { ...base(), simulacro_respuesta: null } } })
    expect(viejo.vuelta_costo_usd).toBe(0.1) // compatibilidad: el nombre viejo sigue valiendo
  })
})

describe('2 · un parte vacío NO se lee como éxito', () => {
  const VACIOS: Array<[string, string | null]> = [
    ['entregables: 0', '```json\n{"parte":{"entregables":[],"huecos":["x"]}}\n```'],
    ['la vuelta no llegó (espera agotada)', null],
    ['respuesta que no es un parte', '[DRY_RUN] canonical fake response'],
  ]
  it.each(VACIOS)('ROJO · %s ⇒ parte_valido:false con motivo, título y texto MARCADOS', async (_n, txt) => {
    const { cheq } = await hastaChequeos(txt)
    expect(cheq.parte_valido).toBe(false)
    expect(cheq.motivo_invalido).toBeTruthy()
    expect(cheq.titulo_parte).toMatch(/^⛔ PARTE NO VÁLIDO · Parte de trabajo/)
    expect(cheq.fila_parte.title).toBe(cheq.titulo_parte)
    expect(cheq.parte_md.startsWith('# ⛔ PARTE NO VÁLIDO · NO USAR')).toBe(true)
    expect(cheq.parte_md).toContain('Motivo: ' + cheq.motivo_invalido)
    expect(cheq.fila_parte.provenance_tag).toMatchObject({ valido: false })
    expect(cheq.payload_cable.resultado).toBe('parte_no_valido')
  })
  it('ROJO · el motivo dice «entregables: 0» tal cual (un parte vacío se llama vacío, no se maquilla)', async () => {
    const { cheq } = await hastaChequeos(VACIOS[0][1])
    expect(cheq.motivo_invalido).toMatch(/entregables: 0/)
    expect(cheq.entregables).toBe(0)
  })
  it('ROJO · una cifra centinela (,77 copiada del ejemplo) también invalida el parte', async () => {
    const ext = extraerParte(armarSimulacroSano(PLAN, MANUAL))
    ext.parte.entregables[0].hipotesis = 'Sube 12,77 por ciento la respuesta'
    const { cheq } = await hastaChequeos('```json\n' + JSON.stringify({ parte: ext.parte }) + '\n```')
    expect(cheq.parte_valido).toBe(false)
    expect(cheq.motivo_invalido).toMatch(/centinela/)
  })
  it('ROJO · ⑤ la corrida de un parte inválido NO cierra ok y el cable declara el resultado REAL (no parte_terminado)', async () => {
    const { cheq } = await hastaChequeos(VACIOS[0][1])
    const [{ json }] = await problemasDeCierre(cheq)
    expect(json.ok).toBe(false)
    expect(json.parte_valido).toBe(false)
    expect(json.problemas.join(' ')).toMatch(/PARTE NO VÁLIDO · .*entregables: 0/)
    expect(json.payload_cable.resultado).toBe('parte_no_valido')
    expect(json.payload_cable.problemas.length).toBeGreaterThan(0)
  })
  it('ROJO · ⑥ la corrida TERMINA EN ERROR visible con el motivo (antes devolvía siempre cierre:"parte_terminado")', async () => {
    const { cheq } = await hastaChequeos(VACIOS[0][1])
    const [{ json: cierre }] = await problemasDeCierre(cheq)
    await expect(correrNodo('n6-volvio.js', { input: [{ ok: true, event_id: 'e1' }], refs: { '⓪ Sobre · llave · modo seco': { _sala_correlation_id: 'c1' }, [N5]: cierre } })).rejects.toThrow(/PARTE_NO_VALIDO · .*entregables: 0/)
    // y sin sala (disparo a mano) TAMBIÉN termina en error: el veredicto no depende de quién despachó
    await expect(correrNodo('n6-volvio.js', { input: [{ ok: true }], refs: { '⓪ Sobre · llave · modo seco': { _sala_correlation_id: null }, [N5]: cierre } })).rejects.toThrow(/PARTE_NO_VALIDO/)
  })
  it('ROJO · el cable mudo sigue mandando: si la sala no contesta se dice CABLE_DE_VUELTA_MUDO antes que cualquier otra cosa', async () => {
    await expect(correrNodo('n6-volvio.js', { input: [{ ok: false, code: 'HTTP 500' }], refs: { '⓪ Sobre · llave · modo seco': { _sala_correlation_id: 'c1' }, [N5]: { ok: true } } })).rejects.toThrow(/CABLE_DE_VUELTA_MUDO/)
  })
  it('ROJO · el ensayo (seco) ejerce el MISMO veredicto: un parte inválido termina el ensayo en error, con el motivo', async () => {
    const { cheq } = await hastaChequeos(VACIOS[0][1])
    await expect(correrNodo('n5-seco.js', { input: [cheq] })).rejects.toThrow(/PARTE_NO_VALIDO \(modo seco\) · .*entregables: 0/)
  })
  it('el flujo manda a Drive el TÍTULO MARCADO (no uno fijo que oculte el motivo)', () => {
    const drive = construirFlujo().nodes.find((n: { name: string }) => n.name === '⑤ Parte a Drive')
    expect(drive.parameters.jsonBody).toContain('titulo_parte')
    expect(drive.parameters.jsonBody).toContain('parte_md')
  })
})

describe('3 · un parte SANO se comporta idéntico a hoy', () => {
  it('parte sano ⇒ válido · título SIN marca · cierra ok · el cable dice parte_terminado · ⑥ no lanza · el ensayo devuelve su salida', async () => {
    const { cheq, vuelta } = await hastaChequeos(armarSimulacroSano(PLAN, MANUAL))
    expect(cheq).toMatchObject({ parte_legible: true, parte_valido: true, motivo_invalido: null, chequeos_ok: true, entregables: 2 })
    expect(cheq.titulo_parte).toMatch(/^Parte de trabajo · briefs · /)
    expect(cheq.parte_md).not.toContain('PARTE NO VÁLIDO')
    expect(cheq.payload_cable.resultado).toBe('parte_terminado')
    expect(cheq.payload_cable).not.toHaveProperty('motivo')
    expect(vuelta.vuelta_costo_usd).toBe(0.42)
    const [{ json: cierre }] = await problemasDeCierre(cheq)
    expect(cierre).toMatchObject({ ok: true, parte_valido: true, problemas: [] })
    expect(cierre.payload_cable.resultado).toBe('parte_terminado')
    const [{ json: fin }] = await correrNodo('n6-volvio.js', { input: [{ ok: true, event_id: 'e1' }], refs: { '⓪ Sobre · llave · modo seco': { _sala_correlation_id: 'c1' }, [N5]: cierre } })
    expect(fin).toMatchObject({ cierre: 'parte_terminado', vuelta_ok: true })
    const [{ json: seco }] = await correrNodo('n5-seco.js', { input: [cheq] })
    expect(seco).toMatchObject({ seco: true, escrituras_reales: 0, formas_validas: true, parte_valido: true, habria_cerrado_como: 'parte_terminado' })
    expect(seco.habria_subido_a_drive_con_titulo).toBe(cheq.titulo_parte)
  })
  it('un parte con hallazgos NO fatales (p. ej. campo faltante) sigue como hoy: se declara, sube, y no invalida', async () => {
    const ext = extraerParte(armarSimulacroSano(PLAN, MANUAL))
    ext.parte.entregables[0].limites = ''
    const { cheq } = await hastaChequeos('```json\n' + JSON.stringify({ parte: ext.parte }) + '\n```')
    expect(cheq.chequeos_ok).toBe(false)
    expect(cheq.hallazgos.length).toBeGreaterThan(0)
    expect(cheq.parte_valido).toBe(true)
    expect(cheq.titulo_parte).not.toContain('NO VÁLIDO')
  })
  it('un problema de cierre (Drive no devolvió archivo) sigue terminando en error, ahora también en ⑥ (antes decía parte_terminado)', async () => {
    const { cheq } = await hastaChequeos(armarSimulacroSano(PLAN, MANUAL))
    const [{ json: cierre }] = await correrNodo('n5-cierre.js', { refs: { [N4]: cheq, '⑤ Guardar el parte': { body: [{ id: 'f' }] }, '⑤ Parte a Drive': { body: { ok: false, motivo: 'sin credencial' } } } })
    expect(cierre.ok).toBe(false)
    await expect(correrNodo('n6-volvio.js', { input: [{ ok: true }], refs: { '⓪ Sobre · llave · modo seco': { _sala_correlation_id: 'c1' }, [N5]: cierre } })).rejects.toThrow(/PARTE_CON_PROBLEMAS/)
  })
})

describe('el flujo sigue siendo el mismo grafo (sólo cambian nodos de código y el título de Drive)', () => {
  it('21 nodos · mismas etapas · sin nodos nuevos', () => {
    const f = construirFlujo()
    expect(f.nodes).toHaveLength(21)
    for (const n of f.nodes.filter((x: { type: string }) => x.type.endsWith('.code'))) {
      expect(() => new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', n.parameters.jsCode)).not.toThrow()
    }
  })
})

describe('3 · agent_run_completed · el corredor emite lo MISMO que Vercel ("simétrico o nada")', () => {
  it('🔴 mismas propiedades que el evento de Vercel (leídas del código de run-sdk) + emitted_by, y misma clave de persona', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'agents', 'run-sdk', 'route.ts'), 'utf8')
    const i = src.indexOf("capture('agent_run_completed'")
    const bloque = src.slice(i, src.indexOf('})', i))
    const clavesVercel = [...bloque.matchAll(/^\s+([a-z_]+):/gm)].map((m) => m[1]).filter((k) => k !== 'agent_run_completed')
    expect(clavesVercel.sort()).toEqual(['agent_slug', 'cost_usd', 'duration_ms', 'input_tokens', 'output_tokens', 'success'])
    const ev = eventoDeCorridaCompleta({ success: true, durationMs: 5, inputTokens: 1, outputTokens: 2, costUsd: 0.3 }, { agentName: 'campaign-brief-agent', clientId: CID })
    expect(ev.event).toBe('agent_run_completed')
    expect(ev.distinctId).toBe(CID)
    expect(Object.keys(ev.properties).filter((k) => k !== 'emitted_by').sort()).toEqual(clavesVercel.sort())
    expect(ev.properties).toMatchObject({ agent_slug: 'campaign-brief-agent', success: true, duration_ms: 5, cost_usd: 0.3, emitted_by: 'agent-runner' })
    expect(eventoDeCorridaCompleta({}, { agentName: 'a', clientId: null }).distinctId).toBe('system')
  })
  it('se emite UNA vez por corrida, ANTES de la entrega, y también cuando el agente falla o la entrega falla', async () => {
    const orden: string[] = []
    const mk = (over: Record<string, unknown> = {}) => ({
      ejecutar: vi.fn().mockResolvedValue({ success: true, costUsd: 0.1 }),
      entregar: vi.fn(async () => { orden.push('entrega'); return { ok: true, intentos: [] } as never }),
      registrarIntento: () => {}, cerrarDespacho: async () => {}, avisarFallo: () => {},
      emitirEvento: vi.fn(async () => { orden.push('evento') }),
      ...over,
    })
    const p = { url: new URL('https://n8n-production-72be.up.railway.app/webhook-waiting/1'), agentName: 'campaign-brief-agent', dispatchKey: 'k', clientId: CID, dryRun: false }
    const a = mk(); await correrYEntregar(p, a as never)
    expect(a.emitirEvento).toHaveBeenCalledTimes(1)
    expect(orden).toEqual(['evento', 'entrega'])
    const b = mk({ ejecutar: vi.fn().mockResolvedValue({ success: false, error: 'saldo' }) }); await correrYEntregar(p, b as never)
    expect(b.emitirEvento).toHaveBeenCalledWith(expect.objectContaining({ properties: expect.objectContaining({ success: false }) }))
    const c = mk({ entregar: vi.fn().mockResolvedValue({ ok: false, intentos: [] }) }); await correrYEntregar(p, c as never)
    expect(c.emitirEvento).toHaveBeenCalledTimes(1)
  })
  it('ROJO · si la analítica LANZA, la vuelta se entrega igual (la telemetría nunca frena el trabajo)', async () => {
    const entregar = vi.fn().mockResolvedValue({ ok: true, intentos: [] })
    const r = await correrYEntregar(
      { url: new URL('https://n8n-production-72be.up.railway.app/webhook-waiting/1'), agentName: 'a', dispatchKey: 'k', dryRun: false },
      { ejecutar: vi.fn().mockResolvedValue({ success: true }), entregar, registrarIntento: () => {}, cerrarDespacho: async () => {}, avisarFallo: () => {}, emitirEvento: vi.fn().mockRejectedValue(new Error('posthog caído')) } as never,
    )
    expect(r.entregada).toBe(true)
    expect(entregar).toHaveBeenCalledTimes(1)
  })
  it('emitirEventoPostHog: sin llave no hace nada · con llave manda el evento · un fallo de red NO lanza', async () => {
    const ev = eventoDeCorridaCompleta({ success: true }, { agentName: 'a', clientId: null })
    const f = vi.fn().mockResolvedValue({ status: 200 })
    expect(await emitirEventoPostHog(ev, {}, f)).toBe('sin_llave')
    expect(f).not.toHaveBeenCalled()
    expect(await emitirEventoPostHog(ev, { POSTHOG_API_KEY: 'k', POSTHOG_API_URL: 'https://us.i.posthog.com/' }, f)).toBe('enviado')
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://us.i.posthog.com/capture/')
    expect(JSON.parse(init.body)).toMatchObject({ api_key: 'k', event: 'agent_run_completed', distinct_id: 'system' })
    expect(await emitirEventoPostHog(ev, { POSTHOG_API_KEY: 'k' }, vi.fn().mockRejectedValue(new Error('red')))).toBe('fallo')
    expect(await emitirEventoPostHog(ev, { POSTHOG_API_KEY: 'k' }, vi.fn().mockResolvedValue({ status: 500 }))).toBe('fallo')
  })
})
