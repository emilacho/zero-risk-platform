/**
 * Condición 5 (CC#3 · jefatura · 13-oct) · el gasto de GPT entra también a `agent_invocations`, que es lo que ven el freno de US$ 8 por cliente en 24 h y el vigilante de costos.
 * Antes vivía solo en `oficina_gastos`. Una fila por llamada; sin costo no hay fila; un fallo del registro nunca frena la revisión; la misma llamada no suma dos veces.
 */
import { describe, expect, it } from 'vitest'
import { filaDeInvocacionDelRevisor, registrarRevisorEnElLibro, llamarRevisorGptConLibro, AGENTE_DEL_REVISOR, FLUJO_DEL_REVISOR } from '../src/lib/revisor-gpt-libro'
import { llamarRevisorGpt } from '../src/lib/revisor-gpt'
import { crearPuertos } from '../src/lib/oficina/adaptadores'
import { abrirEncargo } from '../src/lib/oficina/orquestador'
import { TARGET_STEP_PRODUCIR } from '../src/lib/oficina/sobre'
import { BUENOS_PROMPTS, CLIENTE, FICHAS_VACIAS, PARTE, PIEZA_OK, crearMemoria, correr, direccionGenerada, observacion } from '../src/lib/oficina/__tests__/memoria'
import { rutaOpinion } from '../src/lib/manual/rutas'
import { filaDeInvocacionDeImagen } from '../src/lib/image-ledger'

const D = { origen: 'jefatura' as const, refId: 'rev-1', n: 3, clientId: 'c1', modelo: 'modelo-x', costUsd: 0.0423, costBasis: 'usage' as const, ok: true, intentos: 1, startedAtMs: 1_000, endedAtMs: 5_000 }
const sinEsperas = { esperasMs: [0, 0, 0], esperar: async () => {} }

/** un OpenAI de mentira: cada llamada devuelve lo que diga el guion (status + cuerpo) */
const openai = (...respuestas: Array<{ status: number; json: unknown }>) => {
  let i = 0
  const f = (async () => { const r = respuestas[Math.min(i++, respuestas.length - 1)]; return { ok: r.status < 400, status: r.status, json: async () => r.json } }) as unknown as typeof fetch
  return { f, llamadas: () => i }
}
const BIEN = { status: 200, json: { output_text: 'Me gusta, pero cambiaría el cierre.', usage: { input_tokens: 10_000, output_tokens: 1_000 } } }
const CAIDO = { status: 503, json: { error: { message: 'caído' }, usage: { input_tokens: 4_000, output_tokens: 0 } } }

/** una base de mentira: guarda lo que se inserta; puede fallar con un código */
const base = (falla?: { code?: string; message: string } | 'lanza') => {
  const filas: Array<[string, Record<string, unknown>]> = []
  return { filas, db: { from: (t: string) => ({ insert: async (row: Record<string, unknown>) => { if (falla === 'lanza') throw new Error('red caída'); if (falla) return { error: falla }; filas.push([t, row]); return { error: null } } }) } }
}

describe('la fila del libro', () => {
  it('una llamada que costó algo deja UNA fila con lo que piden el freno y el vigilante (cliente, costo, ventana de tiempo, flujo nunca nulo)', () => {
    const f = filaDeInvocacionDelRevisor(D)!
    expect(f).toMatchObject({ session_id: 'gpt-jefatura-rev-1-3', agent_id: AGENTE_DEL_REVISOR, agent_name: AGENTE_DEL_REVISOR, client_id: 'c1', cost_usd: 0.0423, model: 'modelo-x', status: 'completed', exit_code: 0, workflow_id: FLUJO_DEL_REVISOR, num_turns: 1 })
    expect(f.workflow_execution_id).toBe('gpt-jefatura-rev-1-3'); expect(f.started_at).toBe('1970-01-01T00:00:01.000Z'); expect(f.ended_at).toBe('1970-01-01T00:00:05.000Z')
    expect(f.metadata).toMatchObject({ kind: 'revisor_externo', source: 'jefatura', ref_id: 'rev-1', n: 3, cost_basis: 'usage', intentos: 1 })
  })
  it('tiene EXACTAMENTE las mismas columnas que la fila de una imagen (la que ya acepta la tabla): ni una de más', () => {
    const img = filaDeInvocacionDeImagen({ generationId: 'g', clientId: 'c', agentSlug: null, model: 'm', size: '1024x1024', quality: null, caller: 'x', costUsd: 1, costBasis: 'usage', startedAtMs: 0, endedAtMs: 1 })!
    expect(Object.keys(filaDeInvocacionDelRevisor(D)!).sort()).toEqual(Object.keys(img).sort())
  })
  it('sin costo (simulacro, llave mala, red sin respuesta) NO hay fila: no se anota un cero que parezca un dato', () => {
    for (const costUsd of [0, -1, NaN, Number.POSITIVE_INFINITY]) expect(filaDeInvocacionDelRevisor({ ...D, costUsd })).toBeNull()
  })
  it('una llamada sin opinión pero que costó queda `failed`, con los intentos y sin esconder el costo', () => {
    const f = filaDeInvocacionDelRevisor({ ...D, ok: false, intentos: 4 })!
    expect(f).toMatchObject({ status: 'failed', exit_code: 1, num_turns: 4, cost_usd: 0.0423 }); expect(String(f.error_message)).toMatch(/costo/)
  })
  it('la llamada de la oficina, la de la jefatura y la del manual no comparten clave', () => {
    const k = (origen: 'oficina' | 'jefatura' | 'manual') => filaDeInvocacionDelRevisor({ ...D, origen })!.session_id
    expect(new Set([k('oficina'), k('jefatura'), k('manual')]).size).toBe(3)
  })
})

describe('registrar', () => {
  it('escribe en agent_invocations una sola vez; sin costo no escribe', async () => {
    const b = base()
    expect(await registrarRevisorEnElLibro(b.db, D)).toEqual({ ok: true }); expect(b.filas.map(([t]) => t)).toEqual(['agent_invocations'])
    expect(await registrarRevisorEnElLibro(b.db, { ...D, costUsd: 0 })).toEqual({ ok: true, omitida: true }); expect(b.filas).toHaveLength(1)
  })
  it('la misma llamada anotada dos veces no suma dos veces (23505 se reconoce)', async () => {
    expect(await registrarRevisorEnElLibro(base({ code: '23505', message: 'duplicate key' }).db, D)).toEqual({ ok: true, repetida: true })
  })
  it('un fallo de la base (error o excepción) se devuelve, no se lanza: nunca frena la revisión', async () => {
    const r1 = await registrarRevisorEnElLibro(base({ code: '23514', message: 'check' }).db, D); expect(r1.ok).toBe(false); expect(r1.error).toBe('check')
    const r2 = await registrarRevisorEnElLibro(base('lanza').db, D); expect(r2.ok).toBe(false); expect(r2.error).toBe('red caída')
  })
})

describe('llamarRevisorGptConLibro · el mismo resultado de siempre + la fila', () => {
  const opciones = (f: typeof fetch) => ({ f, apiKey: 'k', modelo: 'modelo-x', precioEntrada: 2, precioSalida: 10, texto: 'pieza', ...sinEsperas })
  it('devuelve EXACTAMENTE lo que devuelve llamarRevisorGpt y anota el costo real (10.000 × 2 + 1.000 × 10 por millón = US$ 0,03)', async () => {
    const a = await llamarRevisorGpt(opciones(openai(BIEN).f))
    const b = base()
    const r = await llamarRevisorGptConLibro(opciones(openai(BIEN).f), { supabase: b.db, origen: 'jefatura', refId: 'rev-9', n: 2, clientId: 'c7', workflowId: 'wf', workflowExecutionId: 'ex' })
    expect(r).toEqual(a)
    expect(b.filas).toHaveLength(1)
    expect(b.filas[0][1]).toMatchObject({ client_id: 'c7', cost_usd: 0.03, workflow_id: 'wf', workflow_execution_id: 'ex', status: 'completed', session_id: 'gpt-jefatura-rev-9-2' })
    expect((b.filas[0][1].metadata as Record<string, unknown>).cost_basis).toBe('usage')
  })
  it('con el precio por omisión (sin precios del entorno) la fila lo declara «estimado»', async () => {
    const b = base()
    await llamarRevisorGptConLibro({ f: openai(BIEN).f, apiKey: 'k', modelo: 'modelo-x', texto: 'p', ...sinEsperas }, { supabase: b.db, origen: 'oficina', refId: 'e', clientId: 'c' })
    expect((b.filas[0][1].metadata as Record<string, unknown>).cost_basis).toBe('estimado')
  })
  it('los intentos que fallaron cuestan y se anotan (una fila, status failed, con todos los intentos); el resultado sigue siendo «sin segunda mirada»', async () => {
    const b = base()
    const r = await llamarRevisorGptConLibro(opciones(openai(CAIDO).f), { supabase: b.db, origen: 'oficina', refId: 'e', clientId: 'c' })
    expect(r.ok).toBe(false); expect(r.intentos).toHaveLength(4)
    expect(b.filas).toHaveLength(1); expect(b.filas[0][1]).toMatchObject({ status: 'failed', num_turns: 4 }); expect(Number(b.filas[0][1].cost_usd)).toBeCloseTo(4 * 0.008, 6)
  })
  it('una llave mala (401, sin consumo) no deja fila', async () => {
    const b = base()
    const r = await llamarRevisorGptConLibro(opciones(openai({ status: 401, json: { error: { message: 'bad key' } } }).f), { supabase: b.db, origen: 'oficina', refId: 'e', clientId: 'c' })
    expect(r.ok).toBe(false); expect(b.filas).toHaveLength(0)
  })
  it('si la base falla al anotar, la opinión llega igual', async () => {
    const r = await llamarRevisorGptConLibro(opciones(openai(BIEN).f), { supabase: base({ code: '42501', message: 'permiso' }).db, origen: 'jefatura', refId: 'x', clientId: 'c' })
    expect(r.ok).toBe(true)
  })
})

describe('la oficina: su puerto del revisor anota el gasto en el libro', () => {
  const env = { baseUrl: 'https://x', internalKey: 'k', openaiKey: 'k', revisorModelo: 'modelo-x', revisorPrecioEntrada: 2, revisorPrecioSalida: 10, esperasRevisorMs: [0, 0, 0], esperar: async () => {} }
  it('con cliente y encargo: una fila en agent_invocations con el origen «oficina»', async () => {
    const b = base(); const g = openai(BIEN)
    const P = crearPuertos(b.db as never, env, g.f)
    const r = await P.revisor({ texto: 'pieza', imagenes_urls: [], dry_run: false, client_id: 'c1', ref_id: 'enc-1', n: 7 })
    expect(r.ok).toBe(true); expect(b.filas).toHaveLength(1)
    expect(b.filas[0][1]).toMatchObject({ client_id: 'c1', session_id: 'gpt-oficina-enc-1-7', cost_usd: 0.03 })
  })
  it('sin cliente o sin encargo: llama como siempre y no anota (nada que atribuir)', async () => {
    const b = base(); const g = openai(BIEN)
    const P = crearPuertos(b.db as never, env, g.f)
    expect((await P.revisor({ texto: 'p', imagenes_urls: [], dry_run: false })).ok).toBe(true); expect(b.filas).toHaveLength(0); expect(g.llamadas()).toBe(1)
  })
  it('en dry_run no llama al proveedor ni anota nada', async () => {
    const b = base(); const g = openai(BIEN)
    const r = await crearPuertos(b.db as never, env, g.f).revisor({ texto: 'p', imagenes_urls: [], dry_run: true, client_id: 'c1', ref_id: 'e' })
    expect(r.ok).toBe(true); expect(g.llamadas()).toBe(0); expect(b.filas).toHaveLength(0)
  })
  it('el orquestador le pasa el cliente, el encargo y el número de paso (sin eso no habría de dónde anotar)', async () => {
    const M = crearMemoria()
    const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: true, familia: 'post_img' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    const id = String(a.cuerpo.encargo_id)
    const indices = (t: string) => [...t.matchAll(/índice (\d+)/g)].map((x) => Number(x[1]))
    await correr(M, id, {
      paquete: () => ({ texto: 'material del portero' }), direccion_visual: () => ({ texto: direccionGenerada() }), prompts: () => ({ texto: BUENOS_PROMPTS }),
      mirar: (_n, t) => ({ texto: observacion(indices(t)) }), texto: () => ({ texto: PIEZA_OK }), revision_jefe: () => ({ texto: FICHAS_VACIAS }),
    })
    expect(M.llamadas.revisorArgs).toHaveLength(1)
    expect(M.llamadas.revisorArgs[0]).toMatchObject({ client_id: CLIENTE, ref_id: id }); expect(M.llamadas.revisorArgs[0].n).toBeGreaterThan(0)
  })
})

describe('la revisión del manual: anota su llamada cuando se le da la base', () => {
  it('rutaOpinion sin `libro` sigue igual (no anota); la ruta real le pasa la base', async () => {
    // el cableado de la ruta se comprueba leyendo el archivo: la opinión del manual pasa `libro` al entorno
    const fs = await import('node:fs')
    expect(fs.readFileSync('src/app/api/manual/opinion/route.ts', 'utf8')).toMatch(/libro: getSupabaseAdmin\(\)/)
    expect(typeof rutaOpinion).toBe('function')
  })
})
