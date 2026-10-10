/**
 * M3 · la FORMA del flujo «Manual · revisión» y el comportamiento de sus nodos de código (ejecutados de verdad, con un `$` falso). Sin n8n, sin red, sin modelo.
 * Lo que se verifica: nace INACTIVO por construcción, ningún paso de modelo corre con dry_run, el juez ve SOLO fuente cruda y cabe en el tope, el cimiento y el lazo A no se llaman,
 * ningún nodo que paga reintenta, y no hay llaves pegadas.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

type Nodo = { name: string; type: string; parameters: Record<string, any>; onError?: string; retryOnFail?: boolean }
type Flujo = { name: string; nodes: Nodo[]; connections: Record<string, { main: Array<Array<{ node: string }>> }>; settings: unknown; active?: boolean }
const DIR = 'scripts/worker-staging/manual'
const mod = await import('../../../../scripts/worker-staging/manual/construir-manual.mjs')
const flujo = mod.construirManual() as unknown as Flujo
const N = mod.NOMBRES_DE_NODOS as Record<string, string>
const nodo = (n: string) => flujo.nodes.find((x) => x.name === n)!
const corre = (n: string) => nodo(n).parameters.jsCode as string

/** ejecuta un nodo de código con un `$` falso: `previos` = salida de otros nodos por nombre */
function correr(codigo: string, o: { entrada?: unknown; previos?: Record<string, unknown>; env?: Record<string, string> } = {}): any[] {
  const sig = (n: string) => ({ first: () => ({ json: (o.previos ?? {})[n] }), isExecuted: true })
  const $ = (n: string) => sig(n)
  const f = new Function('$input', '$', '$env', '$workflow', '$execution', codigo)
  return f({ first: () => ({ json: o.entrada }) }, $, o.env ?? {}, { id: 'WF1' }, { id: 'EX1' })
}

describe('M3 · la forma del flujo', () => {
  it('es un solo flujo con UN webhook de entrada y sin `active` (n8n lo crea INACTIVO)', () => {
    expect(flujo.nodes.filter((n) => n.type === 'n8n-nodes-base.webhook')).toHaveLength(1)
    expect(flujo.nodes.some((n) => /schedule|cron/i.test(n.type))).toBe(false) // nadie lo dispara solo
    expect(flujo).not.toHaveProperty('active')
    expect(flujo.settings).toMatchObject({ executionOrder: 'v1' })
  })
  it('todos los enlaces apuntan a nodos que existen y todo nodo es alcanzable desde el webhook', () => {
    const nombres = new Set(flujo.nodes.map((n) => n.name))
    const vistos = new Set<string>([N.web]); const cola = [N.web]
    while (cola.length) for (const salida of flujo.connections[cola.shift()!]?.main ?? []) for (const c of salida) { expect(nombres.has(c.node)).toBe(true); if (!vistos.has(c.node)) { vistos.add(c.node); cola.push(c.node) } }
    expect([...nombres].filter((x) => !vistos.has(x))).toEqual([])
  })
  it('ningún nodo reintenta (los que pagan, tampoco) y toda llamada HTTP entrega siempre salida y deja decidir a una guarda', () => {
    for (const n of flujo.nodes) expect(n.retryOnFail).toBeUndefined()
    for (const n of flujo.nodes.filter((x) => x.type === 'n8n-nodes-base.httpRequest')) {
      expect(n.onError).toBe('continueRegularOutput')
      expect(n.parameters.options.response.response.neverError).toBe(true)
    }
  })
  it('el cimiento cerrado y el lazo A NO se llaman ni se nombran (el manual vigente es lo que ellos produjeron; esta revisión corre DESPUÉS)', () => {
    const j = JSON.stringify(flujo)
    expect(j).not.toMatch(/ssLtwYPt7zxuvnM2|kSSAvCbEfHs2Hoa0|LyVoKcrypS5uLyuu|Lazo A/)
    expect(flujo.nodes.some((n) => /executeWorkflow/i.test(n.type))).toBe(false)
  })
  it('solo habla con /api/manual/* y con el corredor de agentes; las llamadas al corredor llevan workflow_id, workflow_execution_id y force_restart', () => {
    const urls = flujo.nodes.filter((n) => n.type === 'n8n-nodes-base.httpRequest').map((n) => String(n.parameters.url))
    for (const u of urls) expect(u).toMatch(/\/api\/manual\/(revisar|recomprobar|opinion|borrador)$|\/api\/agents\/run-sdk$/)
    for (const n of flujo.nodes.filter((x) => String(x.parameters.url ?? '').endsWith('/api/agents/run-sdk'))) {
      const b = String(n.parameters.jsonBody)
      expect(b).toContain('workflow_id: $workflow.id'); expect(b).toContain('workflow_execution_id: $execution.id'); expect(b).toContain('force_restart: true'); expect(b).toMatch(/max_budget_usd: \d/)
    }
  })
  it('nunca se nombra al jefe de marketing (canon del manual)', () => {
    expect(JSON.stringify(flujo)).not.toMatch(/jefe-marketing/)
  })
  it('sin llaves pegadas: toda credencial sale del entorno de n8n', () => {
    const j = JSON.stringify(flujo)
    expect(j).not.toMatch(/sk-[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{20,}|Bearer [A-Za-z0-9]{10,}/)
    for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.js'))) expect(fs.readFileSync(`${DIR}/${f}`, 'utf8')).not.toMatch(/sk-[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{20,}/)
    expect(j).toContain('$env.INTERNAL_API_KEY')
  })
  it('los tiempos caben: opinión 300 s (la ruta vive 300 s) y los agentes 800 s (el corredor corta a 800 s)', () => {
    expect(nodo(N.opHttp).parameters.options.timeout).toBe(300000)
    for (const n of [N.autorRun, N.juezRun, N.resRun]) expect(nodo(n).parameters.options.timeout).toBe(800000)
    expect(fs.readFileSync('src/app/api/manual/opinion/route.ts', 'utf8')).toMatch(/maxDuration = 300/)
  })
  it('con dry_run NINGÚN paso de modelo es alcanzable: desde la rama «no sigue» de la guarda no se llega a ningún run-sdk, ni a GPT, ni al borrador', () => {
    const prohibidos = new Set([N.autorRun, N.juezRun, N.resRun, N.opHttp, N.borHttp])
    const vistos = new Set<string>(); const cola = (flujo.connections[N.ifSigue].main[1] ?? []).map((c) => c.node)
    while (cola.length) { const n = cola.shift()!; if (vistos.has(n)) continue; vistos.add(n); expect(prohibidos.has(n)).toBe(false); for (const s of flujo.connections[n]?.main ?? []) for (const c of s) cola.push(c.node) }
    expect([...vistos]).toEqual([N.cierreSin])
  })
  it('el juez va DESPUÉS de la primera puerta y ANTES de GPT; GPT no recibe nada del juez', () => {
    const orden: string[] = []
    let n = N.web
    while (n) { orden.push(n); const sig = flujo.connections[n]?.main[0]?.[0]?.node; n = sig && !orden.includes(sig) ? sig : '' }
    expect(orden.indexOf(N.puerta1)).toBeLessThan(orden.indexOf(N.juezRun)); expect(orden.indexOf(N.juezRun)).toBeLessThan(orden.indexOf(N.opHttp))
    const pedido = correr(corre(N.opPedido), { previos: { [N.juezVeredicto]: { client_id: 'c', workflow_id: 'w', workflow_execution_id: 'e', manual1: { a: 'x' }, fidelidad: { puntajes: { positioning: 0.9 } }, puerta1: { retirados: [{ clausula: 'SECRETO' }] } } } })
    expect(JSON.stringify(pedido[0].json.opinion_body)).toBe(JSON.stringify({ client_id: 'c', dry_run: false, workflow_id: 'w', workflow_execution_id: 'e', manual: { a: 'x' } })) // ciego: solo el manual
  })
  it('todos los nodos de código compilan', () => {
    for (const n of flujo.nodes.filter((x) => x.type === 'n8n-nodes-base.code')) expect(() => new Function('$input', '$', '$env', '$workflow', '$execution', n.parameters.jsCode), n.name).not.toThrow()
  })
})

describe('M3 · los nodos de código, ejecutados', () => {
  const UUID = '11111111-1111-4111-8111-111111111111'
  it('⓪ entrada: sin llave, sin cliente válido o sin dry_run booleano SE DETIENE', () => {
    const ok = { headers: { 'x-sala-dispatch-key': 'k' }, body: { client_id: UUID, dry_run: true } }
    expect(correr(corre(N.entrada), { entrada: ok, env: { SALA_DISPATCH_KEY: 'k' } })[0].json).toMatchObject({ client_id: UUID, dry_run: true, workflow_id: 'WF1', workflow_execution_id: 'EX1', costo_usd: 0 })
    expect(() => correr(corre(N.entrada), { entrada: ok, env: {} })).toThrow(/MANUAL_SIN_LLAVE/)
    expect(() => correr(corre(N.entrada), { entrada: { ...ok, headers: {} }, env: { SALA_DISPATCH_KEY: 'k' } })).toThrow(/MANUAL_SIN_LLAVE/)
    expect(() => correr(corre(N.entrada), { entrada: { ...ok, body: { client_id: 'x', dry_run: true } }, env: { SALA_DISPATCH_KEY: 'k' } })).toThrow(/CLIENTE_INVALIDO/)
    expect(() => correr(corre(N.entrada), { entrada: { ...ok, body: { client_id: UUID } }, env: { SALA_DISPATCH_KEY: 'k' } })).toThrow(/DRY_RUN_OBLIGATORIO/)
    expect(() => correr(corre(N.entrada), { entrada: { ...ok, body: { client_id: UUID, dry_run: 'true' } }, env: { SALA_DISPATCH_KEY: 'k' } })).toThrow(/DRY_RUN_OBLIGATORIO/)
  })
  const E = { client_id: UUID, dry_run: false, workflow_id: 'WF1', workflow_execution_id: 'EX1', llave: 'k', costo_usd: 0 }
  const prep = { informe: { hechos: [{ campo: 'mision', clausula: 'con trazabilidad verificable', estado: 'sin_cita', motivo: 'sin cita en lo raspado', duda: null }] }, sin_hallazgos: false, manual_vigente: { mision: 'Cuidar sonrisas, con trazabilidad verificable.', tagline: null }, materia: { texto: 'MATERIA CRUDA' }, evidencia_del_juez: { texto: 'EVIDENCIA CRUDA', recortada: false, excluidas: [{ id: 'sintesis:icp0', tipo: 'sintesis' }] } }
  it('① guarda: error de la preparación ⇒ fin con el motivo; sin hallazgos ⇒ fin; dry_run ⇒ fin (sin modelo); si no, sigue', () => {
    const g = (r: unknown, dry = false) => correr(corre(N.guarda), { entrada: r, previos: { [N.entrada]: { ...E, dry_run: dry } } })[0].json
    expect(g({ error: 'sin_manual', detalle: 'no hay' })).toMatchObject({ ruta: 'fin', motivo: expect.stringContaining('sin_manual') })
    expect(g(undefined)).toMatchObject({ ruta: 'fin' })
    expect(g({ ...prep, sin_hallazgos: true })).toMatchObject({ ruta: 'fin', motivo: expect.stringContaining('Sin hallazgos') })
    expect(g(prep, true)).toMatchObject({ ruta: 'fin', motivo: expect.stringContaining('dry_run') })
    expect(g(prep)).toMatchObject({ ruta: 'seguir' })
  })
  it('② el autor recibe el manual, la materia cruda y SOLO los hallazgos sin respaldo; se le prohíbe tocar lo creativo y el eslogan', () => {
    const t = correr(corre(N.autorPedido), { entrada: { ...E, prep } })[0].json.autor_task as string
    expect(t).toContain('con trazabilidad verificable'); expect(t).toContain('MATERIA CRUDA'); expect(t).toContain('No cambies lo creativo'); expect(t).toContain('No toques el campo `tagline`')
    expect(t).not.toContain('EVIDENCIA CRUDA')
  })
  it('② la vuelta del autor: JSON dentro de prosa se lee; un fallo o un texto ilegible NO se inventa (queda el manual vigente y se declara); suma el costo', () => {
    const v = (cuerpo: unknown) => correr(corre(N.autorVuelta), { entrada: cuerpo, previos: { [N.autorPedido]: { ...E, prep, costo_usd: 0.1 } } })[0].json
    const bien = v({ body: { response: 'Aquí está:\n{"mision":"Cuidar sonrisas.","tagline":null} fin', cost_usd: 0.5 } })
    expect(bien).toMatchObject({ despues: { mision: 'Cuidar sonrisas.' }, autor_fallo: null }); expect(bien.costo_usd).toBeCloseTo(0.6, 6)
    expect(v({ response: '{"manual":{"mision":"M"}}' }).despues).toEqual({ mision: 'M' })
    for (const mal of [{ response: 'sin json' }, { response: '{roto' }, { success: false, error: 'tope' }, {}]) {
      const r = v(mal); expect(r.despues).toEqual(prep.manual_vigente); expect(r.autor_fallo).toEqual(expect.any(String))
    }
  })
  it('④ el juez: la evidencia es SOLO la de la puerta (cruda); ni la materia del autor ni nada de ICP; cabe en 14.000 y cede la evidencia, nunca los campos', () => {
    const ent = { introducidos: [], retirados: [], manual: { positioning: 'POS', icp_summary: 'ICP', voice_description: 'V', customer_angle: 'C', retention_notes: 'R' } }
    const j = (p: Record<string, unknown>) => correr(corre(N.juezPedido), { entrada: { body: ent }, previos: { [N.autorVuelta]: { ...E, prep: { ...prep, ...p }, despues: prep.manual_vigente } } })[0].json
    const ok = j({})
    expect(ok.juez_task).toContain('EVIDENCIA CRUDA'); expect(ok.juez_task).not.toContain('MATERIA CRUDA'); expect(ok.juez_task).toContain('emit_fidelity_scores'); expect(ok.juez_task).toContain('"field":"positioning","value":"POS"')
    expect(ok.evidencia_excluida).toEqual([{ id: 'sintesis:icp0', tipo: 'sintesis' }])
    const enorme = j({ evidencia_del_juez: { texto: 'E'.repeat(30000), recortada: false, excluidas: [] } })
    expect(enorme.juez_task.length).toBeLessThanOrEqual(14000); expect(enorme.evidencia_recortada).toBe(true)
    for (const campo of ['POS', 'ICP', '"V"', '"C"', '"R"']) expect(enorme.juez_task).toContain(campo) // los campos NO ceden
  })
  it('④ el veredicto: lee los puntajes; los gateados bajo 0,85 se marcan; sin puntajes NO se inventan (queda sin veredicto); no bloquea', () => {
    const v = (cuerpo: unknown) => correr(corre(N.juezVeredicto), { entrada: cuerpo, previos: { [N.juezPedido]: { ...E, costo_usd: 1 } } })[0].json
    expect(v({ body: { fidelity_scores: { scores: { positioning: 0.9, icp_summary: 0.7, voice_description: 0.4 } }, cost_usd: 0.2 } }).fidelidad).toMatchObject({ umbral: 0.85, bajo_umbral: ['icp_summary'], sin_veredicto: false })
    const sin = v({ body: { response: 'texto' } })
    expect(sin.fidelidad).toMatchObject({ puntajes: null, sin_veredicto: true, bajo_umbral: ['positioning', 'icp_summary'] })
    expect(v({ body: { cost_usd: 0.25 } }).costo_usd).toBeCloseTo(1.25, 6)
  })
  it('⑤ la vuelta de GPT: la opinión se guarda como opinión; si falló, NO bloquea y se marca; el costo se suma', () => {
    const v = (cuerpo: unknown) => correr(corre(N.opVuelta), { entrada: cuerpo, previos: { [N.opPedido]: { ...E, costo_usd: 1 } } })[0].json
    expect(v({ ok: true, opinion: 'texto libre', costo_usd: 0.1 })).toMatchObject({ hay_opinion: true, opinion: { ok: true, texto: 'texto libre' }, costo_usd: 1.1 })
    expect(v({ ok: false, error: 'caído', sin_segunda_mirada: true })).toMatchObject({ hay_opinion: false, opinion: { ok: false, error: 'caído' } })
    expect(v({})).toMatchObject({ hay_opinion: false })
  })
  it('⑥ la respuesta del autor: una pasada; filtra las decisiones mal formadas; sin JSON legible conserva el manual y lo declara', () => {
    const base = { ...E, opinion: { ok: true, texto: 'OPINION X' }, manual1: { m: 1 }, prep }
    const t = correr(corre(N.resPedido), { previos: { [N.opVuelta]: base } })[0].json.respuesta_task as string
    expect(t).toContain('OPINION X'); expect(t).toContain('no un dato confirmado'); expect(t).toContain('UNA sola vez')
    const v = (cuerpo: unknown) => correr(corre(N.resVuelta), { entrada: cuerpo, previos: { [N.resPedido]: base } })[0].json
    const ok = v({ response: '{"manual":{"m":2},"respuesta":[{"punto":"a","decision":"tomada","razon":"r"},{"punto":"b","decision":"quizá","razon":"r"},{"decision":"tomada"}]}' })
    expect(ok.despues2).toEqual({ m: 2 }); expect(ok.respuesta_del_autor).toEqual([{ punto: 'a', decision: 'tomada', razon: 'r' }])
    expect(v({ response: 'nada' })).toMatchObject({ despues2: { m: 1 }, respuesta_del_autor: [], respuesta_fallo: expect.any(String) })
  })
  it('⑦ el borrador: manda el manual FINAL, la opinión y la respuesta SOLO si hubo respuesta, el costo y el veredicto; dry_run=false; sin lo retirado', () => {
    const conRes = correr(corre(N.borPedido), { entrada: { ...E, manual_final: { z: 1 }, manual_final_origen: 'respuesta', opinion: { ok: true, texto: 'o' }, respuesta_del_autor: [{ punto: 'a', decision: 'tomada', razon: 'r' }], costo_usd: 0.123456789, fidelidad: { umbral: 0.85 }, puerta1: { retirados: [{ clausula: 'NO DEBE SALIR' }] } } })[0].json.borrador_body
    expect(conRes).toMatchObject({ dry_run: false, manual: { z: 1 }, respuesta_del_autor: [{ punto: 'a' }], costo_usd: 0.123457, fidelidad: { umbral: 0.85 } })
    expect(JSON.stringify(conRes)).not.toContain('NO DEBE SALIR')
    const sin = correr(corre(N.borPedido), { entrada: { ...E, manual_final: { z: 1 }, manual_final_origen: 'sin_opinion', opinion: { ok: false, error: 'x' }, respuesta_del_autor: [{ punto: 'fantasma' }] } })[0].json.borrador_body
    expect(sin.respuesta_del_autor).toBeNull(); expect(sin.opinion).toEqual({ ok: false, error: 'x' })
  })
  it('⑧ los cierres dicen qué pasó; el de borrador no pierde un error de la ruta', () => {
    expect(correr(corre(N.cierreSin), { entrada: { ...E, dry_run: true, motivo: 'm' } })[0].json).toMatchObject({ fin: 'sin_modelo', dry_run: true, costo_usd: 0 })
    const c = (r: unknown) => correr(corre(N.cierreBor), { entrada: r, previos: { [N.borPedido]: { costo_usd: 0.7, autor_fallo: null, respuesta_fallo: null } } })[0].json
    expect(c({ ok: true, output_id: 'o', hitl_id: 'h', version_nueva: 3, sin_cambios: false })).toMatchObject({ fin: 'borrador_escrito', output_id: 'o', hitl_id: 'h', version_nueva: 3, costo_usd: 0.7 })
    expect(c({ ok: true, sin_cambios: true, version_nueva: 3 })).toMatchObject({ fin: 'sin_cambios' })
    expect(c({ ok: false, error: 'bandeja: x', version_nueva: 3 })).toMatchObject({ fin: 'borrador_con_error', error: 'bandeja: x' })
  })
})
