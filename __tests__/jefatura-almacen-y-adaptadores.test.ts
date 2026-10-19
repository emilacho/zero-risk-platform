/**
 * JEFATURA como oficina propia · J3 · el almacén sobre la base (falso) y los adaptadores reales: falla CERRADO, un error de la base se lanza (no se lee como vacío), el reloj del vigía, el modelo del revisor con
 * caída a las variables de la oficina, Slack que nunca lanza, y las consultas §148 escritas de antemano (solo lectura). US$ 0: sin red.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { estadoInicial } from '../src/lib/revision-comun'
import { crearPuertos, entornoDeProceso } from '../src/lib/jefatura/revision/adaptadores'
import { almacenDeSupabase } from '../src/lib/jefatura/revision/almacen-supabase'
import { CONSULTAS_148 } from '../src/lib/jefatura/revision/consultas'
import { CONFIG_APAGADA } from '../src/lib/jefatura/revision/puertos'
import { DbFalsaJefatura } from './_helpers/dbfalsa-jefatura'
import { FILAS_DE_POLITICA, politica } from './_helpers/jefatura-revision'

type Json = Record<string, any>
const CTX = { revision_id: '00000000-0000-4000-8000-0000000000aa', n: 2, client_id: 'cliente-prueba' }
const nueva = (o: Json = {}) => ({ client_id: 'c', artifact_type: 'pieza' as const, artifact_id: 'p1', version: 1, journey_id: 'j', productores: politica('pieza').productores, entrada: { texto: 't', dry_run: true, devolver_a: { tipo: 'webhook' as const, destino: 'x' } }, devolver_a: { tipo: 'webhook' as const, destino: 'x' }, policy: politica('pieza'), tope_usd: 1.5, dry_run: true, prueba: false, estado_del_motor: estadoInicial(), ...o })

describe('almacén · config y políticas', () => {
  it('sin fila de config, o con la base caída, la jefatura es APAGADA (falla cerrado)', async () => {
    expect(await almacenDeSupabase(new DbFalsaJefatura()).leerConfig()).toEqual(CONFIG_APAGADA)
    const caida = new DbFalsaJefatura(); caida.fallar.jefatura_config = 'caída'
    expect(await almacenDeSupabase(caida).leerConfig()).toEqual(CONFIG_APAGADA)
  })
  it('una respuesta inconsistente (error Y datos a la vez) también es APAGADA: el error manda', async () => {
    const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { estado: 'encendida', tipos_activos: ['plan'], clientes_ensayo: [] }, error: { message: 'caída a medias' } }) }) }) }) }
    expect(await almacenDeSupabase(db as never).leerConfig()).toEqual(CONFIG_APAGADA)
  })
  it('un estado desconocido se lee como apagada; ensayo y encendida se respetan con sus listas', async () => {
    const mk = (estado: string) => almacenDeSupabase(new DbFalsaJefatura().semilla('jefatura_config', [{ id: 1, estado, tipos_activos: ['plan'], clientes_ensayo: ['c1'] }]))
    expect((await mk('rara').leerConfig()).estado).toBe('apagada')
    expect(await mk('ensayo').leerConfig()).toEqual({ estado: 'ensayo', tipos_activos: ['plan'], clientes_ensayo: ['c1'] })
    expect((await mk('encendida').leerConfig()).estado).toBe('encendida')
  })
  it('leerPolitica: una fila válida; sin renglón = existe:false; renglón mal armado = existe:true con el motivo; la base caída se LANZA', async () => {
    const db = new DbFalsaJefatura().semilla('jefatura_grading_policies', [{ ...FILAS_DE_POLITICA.pieza, is_active: true }, { ...FILAS_DE_POLITICA.pieza, artifact_type: 'plan', judgment_enabled: true }])
    const a = almacenDeSupabase(db)
    const ok = await a.leerPolitica('pieza')
    expect(ok.ok && ok.activa).toBe(true)
    expect(await a.leerPolitica('brief')).toMatchObject({ ok: false, existe: false })
    expect(await a.leerPolitica('plan')).toMatchObject({ ok: false, existe: true })
    db.fallar.jefatura_grading_policies = 'base caída'
    await expect(a.leerPolitica('pieza')).rejects.toThrow(/base caída/)
  })
})

describe('almacén · revisiones, pasos y fichas', () => {
  it('crearRevision es idempotente por (tipo, artefacto, versión, seco/real): la segunda devuelve la existente', async () => {
    const a = almacenDeSupabase(new DbFalsaJefatura())
    const r1 = await a.crearRevision(nueva())
    const r2 = await a.crearRevision(nueva())
    expect(r1.ok && r1.nuevo).toBe(true)
    expect(r2.ok && !r2.nuevo && r2.revision.id).toBe(r1.ok && r1.revision.id)
    // el seco y el real del mismo artefacto son revisiones distintas
    const real = await a.crearRevision(nueva({ dry_run: false }))
    expect(real.ok && real.nuevo).toBe(true)
  })
  it('una revisión sin su política guardada no se lee (no se adivina)', async () => {
    const db = new DbFalsaJefatura()
    const a = almacenDeSupabase(db)
    const r = await a.crearRevision(nueva())
    ;(db.tablas.jefatura_revisiones[0] as Json).policy_snapshot = {}
    await expect(a.leerRevision(r.ok ? r.revision.id : '')).rejects.toThrow(/policy_snapshot vacío/)
  })
  it('guardar: cerrar pone `cerrado_en`; el paso «corriendo» arranca el reloj y cerrarlo NO lo pisa; las fichas se guardan con su paso', async () => {
    const db = new DbFalsaJefatura()
    const a = almacenDeSupabase(db)
    const r = await a.crearRevision(nueva())
    const id = r.ok ? r.revision.id : ''
    const e = estadoInicial()
    await a.guardar({ revision_id: id, estado_del_motor: e, gasto_usd: 0, estado: 'en_paso', paso: { n: 1, paso: 'revision_fondo', intento: 1, tipo: 'agente', agente: 'jefe-marketing', estado: 'corriendo', dispatch_key: `${id}:1`, concepto: 'modelo', base: 'usage', cost_usd: 0, traza: { jefatura: { role: 'fondo' } } } })
    const inicio = (db.tablas.jefatura_pasos[0] as Json).inicio
    expect(inicio).toBeTruthy()
    expect((await a.pasoAbierto(id))?.dispatch_key).toBe(`${id}:1`)
    await a.guardar({ revision_id: id, estado_del_motor: e, gasto_usd: 0.07, paso: { n: 1, paso: 'revision_fondo', intento: 1, tipo: 'agente', agente: 'jefe-marketing', estado: 'hecho', dispatch_key: `${id}:1`, concepto: 'modelo', base: 'usage', cost_usd: 0.07, tokens_in: 10, tokens_out: 5 }, fichas: [{ id: 'jefe-1-0', origen: 'jefe', donde: 'texto', gravedad: 'bloquea', estado: 'abierta', que: 'q' }] })
    const p = db.tablas.jefatura_pasos[0] as Json
    expect(p).toMatchObject({ estado: 'hecho', cost_usd: 0.07, tokens_in: 10 })
    expect(p.inicio).toBe(inicio)
    expect(p.fin).toBeTruthy()
    expect(await a.pasoAbierto(id)).toBeNull()
    expect(db.tablas.jefatura_pasos).toHaveLength(1)
    expect(db.tablas.jefatura_fichas[0]).toMatchObject({ revision_id: id, ficha_id: 'jefe-1-0', paso_id: p.id, gravedad: 'bloquea' })
    await a.guardar({ revision_id: id, estado_del_motor: e, gasto_usd: 0.07, estado: 'cerrada', resultado: 'con_desacuerdo', marcas: { con_desacuerdo: true, sin_segunda_mirada: false } })
    expect(db.tablas.jefatura_revisiones[0]).toMatchObject({ estado: 'cerrada', resultado: 'con_desacuerdo', marcas: { con_desacuerdo: true, sin_segunda_mirada: false } })
    expect((db.tablas.jefatura_revisiones[0] as Json).cerrado_en).toBeTruthy()
  })
  it('un paso externo (GPT, dentro de la ruta) lleva inicio Y fin: el gasto de GPT se agrupa por día; un paso de agente hecho NO pisa su inicio', async () => {
    const db = new DbFalsaJefatura()
    const a = almacenDeSupabase(db)
    const r = await a.crearRevision(nueva())
    const id = r.ok ? r.revision.id : ''
    await a.guardar({ revision_id: id, estado_del_motor: estadoInicial(), gasto_usd: 0.04, paso: { n: 2, paso: 'segunda_mirada', intento: 1, tipo: 'externo', agente: 'GPT', estado: 'hecho', dispatch_key: null, concepto: 'revisor_externo', base: 'usage', cost_usd: 0.04 } })
    const p = db.tablas.jefatura_pasos[0] as Json
    expect(p.inicio).toBeTruthy()
    expect(p.fin).toBeTruthy()
  })
  it('workflow_id del flujo y de la ejecución quedan en el renglón del paso (§149)', async () => {
    const db = new DbFalsaJefatura()
    const a = almacenDeSupabase(db)
    const r = await a.crearRevision(nueva())
    const id = r.ok ? r.revision.id : ''
    await a.guardar({ revision_id: id, estado_del_motor: estadoInicial(), gasto_usd: 0, paso: { n: 1, paso: 'revision_fondo', intento: 1, tipo: 'agente', agente: 'jefe-marketing', estado: 'hecho', dispatch_key: 'k', workflow_id: 'wf-1', workflow_execution_id: 'ex-1', concepto: 'modelo', base: 'usage', cost_usd: 0.06 } })
    expect(db.tablas.jefatura_pasos[0]).toMatchObject({ workflow_id: 'wf-1', workflow_execution_id: 'ex-1' })
  })
  it('pasosCorriendoAntesDe: solo los «corriendo» que empezaron antes del límite', async () => {
    const db = new DbFalsaJefatura()
    const a = almacenDeSupabase(db)
    const r = await a.crearRevision(nueva())
    const id = r.ok ? r.revision.id : ''
    const base = { revision_id: id, intento: 1, tipo: 'agente' as const, agente: 'x', dispatch_key: null, concepto: 'modelo' as const, base: 'usage' as const, cost_usd: 0 }
    await a.guardar({ revision_id: id, estado_del_motor: estadoInicial(), gasto_usd: 0, paso: { ...base, n: 1, paso: 'a', estado: 'corriendo' } })
    ;(db.tablas.jefatura_pasos[0] as Json).inicio = '2026-10-13T10:00:00.000Z'
    // un paso ya HECHO, más viejo todavía: el vigía NO lo mira
    await a.guardar({ revision_id: id, estado_del_motor: estadoInicial(), gasto_usd: 0, paso: { ...base, n: 2, paso: 'b', estado: 'hecho' } })
    ;(db.tablas.jefatura_pasos[1] as Json).inicio = '2026-10-13T08:00:00.000Z'
    expect(await a.pasosCorriendoAntesDe('2026-10-13T11:00:00.000Z')).toEqual([{ revision_id: id, n: 1, paso: 'a' }])
    expect(await a.pasosCorriendoAntesDe('2026-10-13T09:00:00.000Z')).toEqual([])
  })
  it('un error de la base al guardar o leer se LANZA', async () => {
    const db = new DbFalsaJefatura()
    const a = almacenDeSupabase(db)
    const r = await a.crearRevision(nueva())
    const id = r.ok ? r.revision.id : ''
    db.fallar.jefatura_revisiones = 'caída'
    await expect(a.leerRevision(id)).rejects.toThrow(/caída/)
    await expect(a.guardar({ revision_id: id, estado_del_motor: estadoInicial(), gasto_usd: 0 })).rejects.toThrow(/caída/)
  })
})

describe('adaptadores · el revisor ciego', () => {
  it('el modelo y los precios salen de JEFATURA_*; si faltan, de OFICINA_* (nunca se imprime ni se escribe un valor)', () => {
    expect(entornoDeProceso({ JEFATURA_REVISOR_MODEL: 'm-jef', OFICINA_REVISOR_MODEL: 'm-ofi', JEFATURA_REVISOR_PRECIO_ENTRADA_USD_M: '3', OFICINA_REVISOR_PRECIO_ENTRADA_USD_M: '2', JEFATURA_REVISOR_PRECIO_SALIDA_USD_M: '11', OFICINA_REVISOR_PRECIO_SALIDA_USD_M: '10' })).toMatchObject({ revisorModelo: 'm-jef', revisorPrecioEntrada: 3, revisorPrecioSalida: 11 })
    expect(entornoDeProceso({ OFICINA_REVISOR_MODEL: 'm-ofi', OFICINA_REVISOR_PRECIO_ENTRADA_USD_M: '2', OFICINA_REVISOR_PRECIO_SALIDA_USD_M: '10' })).toMatchObject({ revisorModelo: 'm-ofi', revisorPrecioEntrada: 2, revisorPrecioSalida: 10 })
    expect(entornoDeProceso({})).toMatchObject({ revisorModelo: undefined, revisorPrecioEntrada: undefined })
    expect(entornoDeProceso({ JEFATURA_REVISOR_MODEL: '  ' }).revisorModelo).toBeUndefined()
    expect(entornoDeProceso({ JEFATURA_REVISOR_PRECIO_ENTRADA_USD_M: 'abc', OFICINA_REVISOR_PRECIO_ENTRADA_USD_M: '2' }).revisorPrecioEntrada).toBe(2)
  })
  it('en seco NO sale a la red; sin llave o sin modelo falla VISIBLE sin llamar a nadie', async () => {
    const f = vi.fn(async () => new Response('{}'))
    const P = crearPuertos(new DbFalsaJefatura(), { openaiKey: 'k', revisorModelo: 'm' }, f as never)
    expect(await P.revisor({ texto: 't', imagenes_urls: [], dry_run: true, contexto: CTX })).toMatchObject({ ok: true, texto: '' })
    const sinLlave = await crearPuertos(new DbFalsaJefatura(), { revisorModelo: 'm' }, f as never).revisor({ texto: 't', imagenes_urls: [], dry_run: false, contexto: CTX })
    expect(sinLlave).toMatchObject({ ok: false, error: expect.stringMatching(/OPENAI_API_KEY/) })
    const sinModelo = await crearPuertos(new DbFalsaJefatura(), { openaiKey: 'k' }, f as never).revisor({ texto: 't', imagenes_urls: [], dry_run: false, contexto: CTX })
    expect(sinModelo).toMatchObject({ ok: false, error: expect.stringMatching(/JEFATURA_REVISOR_MODEL/) })
    expect(f).not.toHaveBeenCalled()
  })
  it('real: llama al proveedor con el modelo del entorno, cuenta su costo y devuelve la opinión; un 401 no se reintenta', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ output_text: 'opinión', usage: { input_tokens: 1000, output_tokens: 100 } }), { status: 200 }))
    const P = crearPuertos(new DbFalsaJefatura(), { openaiKey: 'k', revisorModelo: 'gpt-x', revisorPrecioEntrada: 2, revisorPrecioSalida: 10, esperar: async () => {} }, f as never)
    const r = await P.revisor({ texto: 'pedido', imagenes_urls: ['https://i/1.png'], dry_run: false, contexto: CTX })
    expect(r).toMatchObject({ ok: true, texto: 'opinión', modelo: 'gpt-x' })
    expect(r.ok && r.costo_usd).toBeCloseTo((1000 * 2 + 100 * 10) / 1e6, 8)
    const [, init] = f.mock.calls[0] as unknown as [string, { body: string }]
    expect(JSON.parse(init.body).model).toBe('gpt-x')
    const f401 = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'no' } }), { status: 401 }))
    const e = await crearPuertos(new DbFalsaJefatura(), { openaiKey: 'k', revisorModelo: 'm', esperar: async () => {} }, f401 as never).revisor({ texto: 't', imagenes_urls: [], dry_run: false, contexto: CTX })
    expect(e.ok).toBe(false)
    expect(f401).toHaveBeenCalledTimes(1)
  })
  it('CONDICIÓN 5: cada llamada que cuesta deja UNA fila en agent_invocations (libro central) con su origen jefatura; repetir el mismo paso no suma dos veces; una llamada sin costo no deja fila', async () => {
    const db = new DbFalsaJefatura()
    const f = vi.fn(async () => new Response(JSON.stringify({ output_text: 'opinión', usage: { input_tokens: 2000, output_tokens: 200 } }), { status: 200 }))
    const P = crearPuertos(db, { openaiKey: 'k', revisorModelo: 'gpt-x', revisorPrecioEntrada: 2, revisorPrecioSalida: 10, esperar: async () => {} }, f as never)
    await P.revisor({ texto: 'p', imagenes_urls: [], dry_run: false, contexto: CTX })
    await P.revisor({ texto: 'p', imagenes_urls: [], dry_run: false, contexto: CTX })
    const filas = db.tablas.agent_invocations as Json[]
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({ session_id: `gpt-jefatura-${CTX.revision_id}-2`, agent_name: 'revisor-externo-gpt', client_id: 'cliente-prueba', model: 'gpt-x', status: 'completed' })
    expect(filas[0].cost_usd).toBeCloseTo((2000 * 2 + 200 * 10) / 1e6, 8)
    expect(filas[0].metadata).toMatchObject({ kind: 'revisor_externo', source: 'jefatura', ref_id: CTX.revision_id, n: 2 })
    // otro paso = otra fila
    await P.revisor({ texto: 'p', imagenes_urls: [], dry_run: false, contexto: { ...CTX, n: 5 } })
    expect(db.tablas.agent_invocations).toHaveLength(2)
    // sin costo (tokens 0) no se anota nada
    const db2 = new DbFalsaJefatura()
    const gratis = vi.fn(async () => new Response(JSON.stringify({ output_text: 'ok' }), { status: 200 }))
    await crearPuertos(db2, { openaiKey: 'k', revisorModelo: 'm', esperar: async () => {} }, gratis as never).revisor({ texto: 'p', imagenes_urls: [], dry_run: false, contexto: CTX })
    expect(db2.tablas.agent_invocations ?? []).toHaveLength(0)
  })
  it('la llamada fallida también cuenta el costo de sus intentos en el libro (status failed)', async () => {
    const db = new DbFalsaJefatura()
    const f = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'caído' }, usage: { input_tokens: 1000, output_tokens: 0 } }), { status: 503 }))
    const r = await crearPuertos(db, { openaiKey: 'k', revisorModelo: 'm', revisorPrecioEntrada: 2, revisorPrecioSalida: 10, esperar: async () => {}, esperasRevisorMs: [1] }, f as never).revisor({ texto: 'p', imagenes_urls: [], dry_run: false, contexto: CTX })
    expect(r.ok).toBe(false)
    expect((db.tablas.agent_invocations as Json[])[0]).toMatchObject({ status: 'failed' })
  })
  it('un 5xx se reintenta con la espera creciente de la oficina (el mismo módulo, no otro)', async () => {
    const esperas: number[] = []
    let n = 0
    const f = vi.fn(async () => (++n < 3 ? new Response('{}', { status: 503 }) : new Response(JSON.stringify({ output_text: 'ok' }), { status: 200 })))
    const r = await crearPuertos(new DbFalsaJefatura(), { openaiKey: 'k', revisorModelo: 'm', esperar: async (ms) => { esperas.push(ms) } }, f as never).revisor({ texto: 't', imagenes_urls: [], dry_run: false, contexto: CTX })
    expect(r.ok).toBe(true)
    expect(esperas).toEqual([5000, 20000])
  })
})

describe('adaptadores · Slack y el reloj', () => {
  it('avisar: en seco o sin token no sale a la red; con token publica en #alertas (canal por omisión o el del entorno)', async () => {
    const f = vi.fn(async () => new Response('{"ok":true}'))
    await crearPuertos(new DbFalsaJefatura(), { slackToken: 't' }, f as never).avisar({ canal: 'alertas', revision_id: 'r', texto: 'x', dry_run: true })
    await crearPuertos(new DbFalsaJefatura(), {}, f as never).avisar({ canal: 'alertas', revision_id: 'r', texto: 'x', dry_run: false })
    expect(f).not.toHaveBeenCalled()
    await crearPuertos(new DbFalsaJefatura(), { slackToken: 't' }, f as never).avisar({ canal: 'alertas', revision_id: 'r', texto: 'aviso', dry_run: false })
    expect(JSON.parse((f.mock.calls[0] as unknown as [string, { body: string }])[1].body)).toMatchObject({ channel: 'C0B7XUUEBHA', text: 'aviso' })
    await crearPuertos(new DbFalsaJefatura(), { slackToken: 't', slackCanalAlertas: 'C123' }, f as never).avisar({ canal: 'alertas', revision_id: 'r', texto: 'otro', dry_run: false })
    expect(JSON.parse((f.mock.calls[1] as unknown as [string, { body: string }])[1].body).channel).toBe('C123')
  })
  it('un fallo de Slack NUNCA se lanza (no frena una revisión)', async () => {
    const f = vi.fn(async () => { throw new Error('red caída') })
    await expect(crearPuertos(new DbFalsaJefatura(), { slackToken: 't' }, f as never).avisar({ canal: 'alertas', revision_id: 'r', texto: 'x', dry_run: false })).resolves.toBeUndefined()
  })
  it('`ahora` es inyectable', () => {
    const P = crearPuertos(new DbFalsaJefatura(), {}, fetch, () => new Date('2026-10-13T00:00:00Z'))
    expect(P.ahora().toISOString()).toBe('2026-10-13T00:00:00.000Z')
  })
})

describe('consultas §148 escritas de antemano', () => {
  const todas = Object.entries(CONSULTAS_148)
  it('hay las 9 (incluida la alarma del editor)', () => { expect(todas.map(([k]) => k)).toEqual(['revisiones_por_tipo_cliente_dia', 'porcentaje_sin_segunda_mirada', 'porcentaje_con_desacuerdo', 'fichas_tomadas_vs_no_tomadas', 'costo_por_revision_contra_tope', 'gasto_de_gpt', 'pasos_y_minutos_por_revision', 'abiertas_hace_mas_de_60_min', 'alarma_editor_escalation_nueva']) })
  it.each(todas)('%s: solo lectura (un SELECT, nada que escriba)', (_k, q) => {
    expect(q.trim()).toMatch(/^SELECT /)
    expect(q).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|GRANT|CREATE)\b/i)
    expect(q.trim().endsWith(';')).toBe(true)
  })
  it('la alarma lee la bandeja ÚNICA (hitl_queue: llave `id`, tipo `type`) y el gasto de GPT agrupa por una fecha que SIEMPRE existe', () => {
    expect(CONSULTAS_148.alarma_editor_escalation_nueva).toMatch(/SELECT id, created_at, status FROM public.hitl_queue/)
    expect(CONSULTAS_148.alarma_editor_escalation_nueva).not.toMatch(/item_id|hitl_pending_approvals/)
    expect(CONSULTAS_148.gasto_de_gpt).toMatch(/date_trunc\('day', coalesce\(inicio, fin\)\)/)
  })
  it('solo nombran tablas de la jefatura y la de pendientes del editor', () => {
    for (const [k, q] of todas) for (const m of q.matchAll(/(?:FROM|JOIN)\s+public\.(\w+)/g)) expect(['jefatura_revisiones', 'jefatura_pasos', 'jefatura_fichas', 'hitl_queue'], k).toContain(m[1])
  })
  it('la alarma busca editor_escalation nuevas por fecha; el gasto de GPT sale del libro propio (concepto revisor_externo)', () => {
    expect(CONSULTAS_148.alarma_editor_escalation_nueva).toMatch(/type = 'editor_escalation'/)
    expect(CONSULTAS_148.alarma_editor_escalation_nueva).toMatch(/created_at > \$1/)
    expect(CONSULTAS_148.gasto_de_gpt).toMatch(/concepto = 'revisor_externo'/)
  })
})

describe('las consultas §148 usan columnas que EXISTEN (reparo de CC#3: la alarma pedía `id` y la llave real es `item_id`)', () => {
  // columnas REALES de `hitl_queue` (la bandeja única; definición de PostgREST, 19-oct); las de `jefatura_*` salen del SQL de J1
  const HITL = ['id', 'client_id', 'pipeline_id', 'output_id', 'agent_name', 'risk_type', 'output_preview', 'review_context', 'status', 'resolved_by', 'resolution_notes', 'resolved_at', 'continuation_payload', 'continuation_triggered', 'created_at', 'expires_at', 'type', 'title', 'priority', 'payload', 'metadata', 'reviewer', 'decision', 'decided_at']
  const sql = readFileSync(resolve(__dirname, '..', 'supabase', 'migrations', '202610131000_jefatura_revision_oficina_propia.sql'), 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10))
  const columnasDe = (tabla: string): string[] => {
    const m = new RegExp(String.raw`CREATE TABLE IF NOT EXISTS public\.${tabla} \(([\s\S]*?)\n\);`).exec(sql)
    if (!m) throw new Error(`no encontré ${tabla} en el SQL de J1`)
    return m[1].split('\n').map((l) => /^\s{2}(\w+)\s/.exec(l)?.[1]).filter((c): c is string => !!c && !/^(PRIMARY|CONSTRAINT)$/.test(c))
  }
  const ESQUEMA: Record<string, string[]> = { hitl_queue: HITL, jefatura_revisiones: columnasDe('jefatura_revisiones'), jefatura_pasos: columnasDe('jefatura_pasos'), jefatura_fichas: columnasDe('jefatura_fichas') }
  /** las columnas que cada consulta nombra, por tabla (escrito a mano: la consulta sin alias no se puede leer sola) */
  const USO: Record<string, Record<string, string[]>> = {
    revisiones_por_tipo_cliente_dia: { jefatura_revisiones: ['artifact_type', 'client_id', 'creado_en', 'dry_run', 'gasto_usd'] },
    porcentaje_sin_segunda_mirada: { jefatura_revisiones: ['artifact_type', 'marcas', 'estado', 'dry_run'] },
    porcentaje_con_desacuerdo: { jefatura_revisiones: ['artifact_type', 'marcas', 'estado', 'dry_run'] },
    fichas_tomadas_vs_no_tomadas: { jefatura_fichas: ['origen', 'estado'] },
    costo_por_revision_contra_tope: { jefatura_revisiones: ['id', 'artifact_type', 'artifact_id', 'gasto_usd', 'tope_usd', 'estado', 'resultado'] },
    gasto_de_gpt: { jefatura_pasos: ['inicio', 'fin', 'cost_usd', 'concepto'] },
    pasos_y_minutos_por_revision: { jefatura_revisiones: ['id', 'artifact_type', 'cerrado_en', 'creado_en'], jefatura_pasos: ['revision_id'] },
    abiertas_hace_mas_de_60_min: { jefatura_revisiones: ['id', 'artifact_type', 'artifact_id', 'estado', 'creado_en'] },
    alarma_editor_escalation_nueva: { hitl_queue: ['id', 'created_at', 'status', 'type'] },
  }
  it('cada consulta está en la lista de uso y cada columna que usa existe en su tabla real', () => {
    expect(Object.keys(USO).sort()).toEqual(Object.keys(CONSULTAS_148).sort())
    for (const [clave, tablas] of Object.entries(USO)) for (const [tabla, cols] of Object.entries(tablas)) for (const c of cols) expect(ESQUEMA[tabla], `${clave}: ${tabla}.${c}`).toContain(c)
  })
  it('y cada una de esas columnas aparece de verdad en el texto de su consulta (la lista de uso no es de adorno)', () => {
    for (const [clave, tablas] of Object.entries(USO)) for (const cols of Object.values(tablas)) for (const c of cols) expect(CONSULTAS_148[clave as keyof typeof CONSULTAS_148], `${clave} · ${c}`).toMatch(new RegExp(String.raw`\b${c}\b`))
  })
  it('la bandeja única SÍ tiene `id` y `type`, y no conserva `item_id` ni `approval_type` (los nombres de la tabla vieja)', () => { expect(HITL).toEqual(expect.arrayContaining(['id', 'type'])); expect(HITL).not.toContain('item_id'); expect(HITL).not.toContain('approval_type') })
})

describe('ningún identificador suelto en las consultas §148 (una columna inventada no puede colarse aunque no esté en la lista de uso)', () => {
  const HITL = ['id', 'type', 'client_id', 'status', 'created_at', 'resolved_at', 'resolved_by', 'expires_at', 'priority', 'payload']
  const sql = readFileSync(resolve(__dirname, '..', 'supabase', 'migrations', '202610131000_jefatura_revision_oficina_propia.sql'), 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10))
  const cols = (tabla: string): string[] => (new RegExp(String.raw`CREATE TABLE IF NOT EXISTS public\.${tabla} \(([\s\S]*?)\n\);`).exec(sql)?.[1] ?? '').split('\n').map((l) => /^\s{2}(\w+)\s/.exec(l)?.[1]).filter((c): c is string => !!c)
  const COLUMNAS = new Set([...cols('jefatura_revisiones'), ...cols('jefatura_pasos'), ...cols('jefatura_fichas'), ...HITL])
  const PALABRAS = new Set(['select', 'from', 'where', 'group', 'by', 'order', 'desc', 'asc', 'as', 'and', 'or', 'not', 'in', 'is', 'null', 'left', 'join', 'on', 'limit', 'filter', 'nulls', 'last', 'coalesce', 'count', 'sum', 'round', 'nullif', 'date_trunc', 'extract', 'epoch', 'now', 'interval', 'numeric', 'boolean', 'false', 'true', 'public', 'p', 'r'])
  // alias de salida declarados con AS (o de tabla): se permiten SOLO los que la propia consulta declara
  it.each(Object.entries(CONSULTAS_148))('%s: todo identificador es una palabra de SQL, un alias que ella declara o una columna real', (_k, q) => {
    const sinCadenas = q.replace(/'[^']*'/g, "''").replace(/\$\d+/g, '')
    const tablas = new Set([...sinCadenas.matchAll(/public\.(\w+)/g)].map((m) => m[1]))
    const aliases = new Set([...sinCadenas.matchAll(/\bAS\s+(\w+)/gi)].map((m) => m[1].toLowerCase()))
    const sinTablas = sinCadenas.replace(/public\.\w+/g, ' ')
    const sueltos = [...new Set((sinTablas.match(/[a-z_][a-z0-9_]*/gi) ?? []).map((t) => t.toLowerCase()))].filter((t) => !PALABRAS.has(t) && !aliases.has(t) && !COLUMNAS.has(t) && !tablas.has(t))
    expect(sueltos).toEqual([])
  })
})
