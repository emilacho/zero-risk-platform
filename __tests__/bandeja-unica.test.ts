/**
 * LA BANDEJA ÚNICA (CC#3 · 19-oct · arreglo 3). US$ 0: base falsa en memoria, sin red.
 * Una sola bandeja (`hitl_queue`): la oficina, la revisión (escalada del editor) y las compuertas de n8n escriben ahí; las rutas viejas conservan su forma de respuesta;
 * y las dos tablas viejas no reciben ni una escritura del código.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'

type Fila = Record<string, any>
const leer = (f: Fila, col: string) => { if (col.includes('->>')) { const [a, b] = col.split('->>'); return f[a] && typeof f[a] === 'object' ? f[a][b] : undefined } return f[col] }
class Q {
  private op: 'select' | 'insert' | 'update' = 'select'
  private filtros: Array<(f: Fila) => boolean> = []
  private cambios: Fila = {}
  private nuevo: Fila[] = []
  private orden: { col: string; asc: boolean } | null = null
  private tope: number | null = null
  private uno: 'single' | 'maybe' | null = null
  private cuenta = false
  constructor(private db: BaseFalsa, private t: string) {}
  select(_c?: string, o?: { count?: string; head?: boolean }) { if (o?.count) this.cuenta = true; return this }
  insert(p: Fila | Fila[]) { this.op = 'insert'; this.nuevo = ([] as Fila[]).concat(p); return this }
  update(p: Fila) { this.op = 'update'; this.cambios = p; return this }
  eq(c: string, v: unknown) { this.filtros.push((f) => leer(f, c) === v); return this }
  in(c: string, v: unknown[]) { this.filtros.push((f) => v.includes(leer(f, c))); return this }
  neq(c: string, v: unknown) { this.filtros.push((f) => leer(f, c) !== v); return this }
  gte(c: string, v: unknown) { this.filtros.push((f) => String(leer(f, c)) >= String(v)); return this }
  order(c: string, o?: { ascending?: boolean }) { this.orden = { col: c, asc: o?.ascending !== false }; return this }
  limit(n: number) { this.tope = n; return this }
  single() { this.uno = 'single'; return this }
  maybeSingle() { this.uno = 'maybe'; return this }
  then<T>(res: (v: any) => T) { return Promise.resolve(this.ejecutar()).then(res) }
  private ejecutar(): any {
    if (this.db.falla[this.t]) return { data: null, count: null, error: { message: this.db.falla[this.t] } }
    this.db.leidas.push(this.t)
    const filas = (this.db.tablas[this.t] ??= [])
    if (this.op === 'insert') {
      this.db.escritas.push(this.t)
      const hechas = this.nuevo.map((n) => ({ id: this.t === 'hitl_queue' ? randomUUID() : undefined, created_at: new Date().toISOString(), ...n }))
      filas.push(...hechas)
      return this.uno ? { data: hechas[0], error: null } : { data: hechas, error: null }
    }
    if (this.op === 'update') {
      this.db.escritas.push(this.t)
      const tocadas = filas.filter((f) => this.filtros.every((g) => g(f)))
      for (const f of tocadas) Object.assign(f, this.cambios)
      return { data: tocadas, error: null }
    }
    let data = filas.filter((f) => this.filtros.every((g) => g(f)))
    if (this.orden) { const { col, asc } = this.orden; data = [...data].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1)) }
    if (this.tope !== null) data = data.slice(0, this.tope)
    if (this.cuenta) return { data: null, count: data.length, error: null }
    if (this.uno) return data.length ? { data: data[0], error: null } : this.uno === 'single' ? { data: null, error: { message: 'no rows' } } : { data: null, error: null }
    return { data, error: null }
  }
}
class BaseFalsa {
  tablas: Record<string, Fila[]> = {}
  falla: Record<string, string> = {}
  leidas: string[] = []
  escritas: string[] = []
  from(t: string) { return new Q(this, t) }
}

let db = new BaseFalsa()
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => db }))
vi.mock('@/lib/internal-auth', () => ({ checkInternalKey: () => ({ ok: true }) }))

import { aprobacionLegada, contarPendientes, crearAprobacion, esUuid, estadoLegado, filaDeCola, listarAprobaciones, resolverAprobacion } from '../src/lib/hitl/bandeja'
import { POST as crear } from '../src/app/api/hitl/approvals/create/route'
import { GET as pendientes } from '../src/app/api/hitl/approvals/pending/route'
import { POST as vencer } from '../src/app/api/hitl/approvals/expire/route'
import { POST as submit } from '../src/app/api/hitl/submit-approval/route'
import { GET as unificada } from '../src/app/api/hitl/pending/route'
import { GET as tablero } from '../src/app/api/mc/pending/route'
import { GET as resumen } from '../src/app/api/pipeline/summary/route'
import { escalateToHITL } from '../src/lib/editor-middleware'

const CLIENTE = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const AHORA = new Date('2026-10-19T12:00:00Z')
const post = (url: string, cuerpo: unknown) => new Request('http://x' + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) }) as never
const get = (url: string) => new Request('http://x' + url) as never
/** lo que deja la oficina al cerrar una pieza (la misma forma que escribe `adaptadores.ts`) */
const piezaDeLaOficina = (extra: Fila = {}): Fila => ({ id: randomUUID(), client_id: CLIENTE, agent_name: 'oficina', risk_type: 'strategic_decision', type: 'pieza', title: 'Pieza BRF-0001 · instagram', output_preview: 'Texto de la pieza', priority: 'medium', status: 'pending', payload: {}, metadata: { origen: 'oficina' }, created_at: '2026-10-19T10:00:00Z', expires_at: '2026-10-26T10:00:00Z', ...extra })

beforeEach(() => { db = new BaseFalsa() })

describe('el traductor entre la aprobación vieja y la fila de la bandeja', () => {
  it('una compuerta de n8n: tipo, aprobador, fase, prioridad y vencimiento (72 h por omisión); la carga viaja entera', () => {
    const f = filaDeCola({ approval_type: 'landing_cro', required_approver: 'emilio', phase: 'fase-2', request_id: 'r-1', client_id: CLIENTE, priority: 'high', payload: { cambios: 3 }, origen: 'workflow' }, AHORA)
    expect(f).toMatchObject({ client_id: CLIENTE, agent_name: 'workflow', risk_type: 'landing_cro', type: 'landing_cro', priority: 'high', status: 'pending', payload: { cambios: 3 } })
    expect(f.expires_at).toBe('2026-10-22T12:00:00.000Z')
    expect(f.metadata).toMatchObject({ origen: 'workflow', required_approver: 'emilio', phase: 'fase-2', request_id: 'r-1' })
    expect(String(f.output_preview)).toContain('cambios') // la vista previa sale de la carga cuando no hay texto
  })
  it('un client_id que NO es uuid no se pierde: la columna queda vacía y la referencia viaja en metadata.client_ref', () => {
    const f = filaDeCola({ client_id: 'cliente-de-practica' }, AHORA)
    expect(f.client_id).toBeNull()
    expect(f.metadata).toMatchObject({ client_ref: 'cliente-de-practica' })
    expect(aprobacionLegada({ ...f, id: 'x', created_at: 'c' }).client_id).toBe('cliente-de-practica')
    expect(esUuid(CLIENTE)).toBe(true)
    expect(esUuid('prueba-portero')).toBe(false)
  })
  it('la prioridad inválida cae a «medium» y el tipo ausente a «generic_approval»', () => {
    expect(filaDeCola({ priority: 'urgentísima' })).toMatchObject({ priority: 'medium', type: 'generic_approval' })
  })
  it('la escalada del editor guarda el contenido, el veredicto, las revisiones y la tarea en metadata.editor y las devuelve con los nombres de siempre', () => {
    const f = filaDeCola({ approval_type: 'editor_escalation', agent_slug: 'content-creator', preview: 'vista', full_content: 'texto completo', editor_verdict: { status: 'escalated', issues: ['a'] }, revisions_attempted: 2, original_task: 'tarea', origen: 'editor' }, AHORA)
    const a = aprobacionLegada({ ...f, id: 'i-1', created_at: '2026-10-19T00:00:00Z' })
    expect(a).toMatchObject({ item_id: 'i-1', approval_type: 'editor_escalation', agent_slug: 'content-creator', preview: 'vista', full_content: 'texto completo', revisions_attempted: 2, original_task: 'tarea', status: 'pending' })
    expect(a.editor_verdict).toEqual({ status: 'escalated', issues: ['a'] })
  })
  it('los estados: el catálogo solo admite pending/approved/rejected/edited; «expired» = rechazada con decision.vencida y «notified» = pendiente ya avisada', () => {
    expect(estadoLegado({ status: 'pending' })).toBe('pending')
    expect(estadoLegado({ status: 'pending', metadata: { notificado_en: 'ayer' } })).toBe('notified')
    expect(estadoLegado({ status: 'approved' })).toBe('approved')
    expect(estadoLegado({ status: 'edited' })).toBe('approved')
    expect(estadoLegado({ status: 'rejected', decision: { vencida: true } })).toBe('expired')
    expect(estadoLegado({ status: 'rejected', decision: { decision: 'rejected' } })).toBe('rejected')
  })
})

describe('con la base: crear, listar, resolver, contar', () => {
  it('🔴 lo que deja la oficina y lo que deja una compuerta salen en la MISMA lista (una sola bandeja)', async () => {
    db.tablas.hitl_queue = [piezaDeLaOficina()]
    await crearAprobacion(db as never, { approval_type: 'generic_approval', client_id: CLIENTE, payload: { x: 1 } }, AHORA)
    const r = await listarAprobaciones(db as never, { estado: 'pending' })
    expect(r.filas).toHaveLength(2)
    expect(r.filas.map((x) => x.type).sort()).toEqual(['generic_approval', 'pieza'])
  })
  it('filtros: por estado viejo (approved incluye edited; rejected no incluye vencidas; expired solo vencidas), por cliente uuid o por referencia, por origen', async () => {
    db.tablas.hitl_queue = [
      piezaDeLaOficina({ id: 'a', status: 'approved' }), piezaDeLaOficina({ id: 'b', status: 'edited' }), piezaDeLaOficina({ id: 'c', status: 'rejected', decision: { vencida: true } }),
      piezaDeLaOficina({ id: 'd', status: 'rejected', decision: {} }), piezaDeLaOficina({ id: 'e', client_id: null, metadata: { origen: 'workflow', client_ref: 'practica' } }),
    ]
    const ids = async (f: Parameters<typeof listarAprobaciones>[1]) => (await listarAprobaciones(db as never, f)).filas.map((x) => x.id).sort()
    expect(await ids({ estado: 'approved' })).toEqual(['a', 'b'])
    expect(await ids({ estado: 'rejected' })).toEqual(['d'])
    expect(await ids({ estado: 'expired' })).toEqual(['c'])
    expect(await ids({ estado: 'all' })).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(await ids({ estado: 'pending', clienteId: 'practica' })).toEqual(['e'])
    expect(await ids({ estado: 'all', clienteId: CLIENTE })).toEqual(['a', 'b', 'c', 'd'])
    expect(await ids({ estado: 'all', soloOrigen: 'workflow' })).toEqual(['e'])
  })
  it('«notified» (pendiente ya avisada) sigue esperando: entra en «pending» y también se pide sola; el agente genérico de una compuerta no se hace pasar por un empleado', async () => {
    db.tablas.hitl_queue = [piezaDeLaOficina({ id: 'n1', metadata: { origen: 'workflow', notificado_en: '2026-10-19T09:00:00Z' } }), piezaDeLaOficina({ id: 'n2' })]
    const ids = async (estado: string) => (await listarAprobaciones(db as never, { estado })).filas.map((x) => x.id).sort()
    expect(await ids('pending')).toEqual(['n1', 'n2'])
    expect(await ids('notified')).toEqual(['n1'])
    const compuerta = await crearAprobacion(db as never, { approval_type: 'meta_ads' }, AHORA)
    expect(aprobacionLegada(db.tablas.hitl_queue.find((x) => x.id === compuerta.id)!).agent_slug).toBeNull() // «workflow» no es un agente
    expect(aprobacionLegada(piezaDeLaOficina({ agent_name: 'content-creator' })).agent_slug).toBe('content-creator')
  })
  it('resolver sin decir quién (o con un nombre vacío): el aprobador por omisión es «emilio», en resolved_by, reviewer y la decisión', async () => {
    db.tablas.hitl_queue = [piezaDeLaOficina({ id: 'o1' }), piezaDeLaOficina({ id: 'o2' })]
    await resolverAprobacion(db as never, 'o1', { decision: 'approved', ahora: AHORA })
    await resolverAprobacion(db as never, 'o2', { decision: 'rejected', quien: '   ', ahora: AHORA })
    for (const f of db.tablas.hitl_queue) expect(f).toMatchObject({ resolved_by: 'emilio', reviewer: 'emilio', decision: { por: 'emilio' } })
  })
  it('resolver: aprobada o rechazada deja quién, cuándo y la decisión; vencida lleva decision.vencida', async () => {
    db.tablas.hitl_queue = [piezaDeLaOficina({ id: 'p1' }), piezaDeLaOficina({ id: 'p2' })]
    expect((await resolverAprobacion(db as never, 'p1', { decision: 'approved', quien: 'emilio', ahora: AHORA })).error).toBeNull()
    await resolverAprobacion(db as never, 'p2', { decision: 'rejected', quien: 'sistema', ahora: AHORA, vencida: true, nota: 'no aprobada antes de su fecha' })
    expect(db.tablas.hitl_queue[0]).toMatchObject({ status: 'approved', resolved_by: 'emilio', resolved_at: AHORA.toISOString(), decision: { decision: 'approved', por: 'emilio' } })
    expect(db.tablas.hitl_queue[1]).toMatchObject({ status: 'rejected', resolution_notes: 'no aprobada antes de su fecha', decision: { vencida: true } })
    expect(estadoLegado(db.tablas.hitl_queue[1])).toBe('expired')
  })
  it('contar pendientes, con y sin cliente', async () => {
    db.tablas.hitl_queue = [piezaDeLaOficina(), piezaDeLaOficina({ status: 'approved' }), piezaDeLaOficina({ client_id: randomUUID() })]
    expect((await contarPendientes(db as never)).n).toBe(2)
    expect((await contarPendientes(db as never, CLIENTE)).n).toBe(1)
  })
  it('un error de la base se devuelve, no se traga', async () => {
    db.falla.hitl_queue = 'caída'
    expect((await listarAprobaciones(db as never)).error).toBe('caída')
    expect((await crearAprobacion(db as never, {})).error).toBe('caída')
    expect((await resolverAprobacion(db as never, 'x', { decision: 'approved' })).error).toBe('caída')
  })
})

describe('las rutas viejas conservan su forma, ahora sobre la bandeja única', () => {
  it('🔴 crear: devuelve item_id/approval_type/expires_at y el eco de siempre, y la fila queda en hitl_queue (no en las viejas)', async () => {
    const r = await crear(post('/api/hitl/approvals/create', { approval_type: 'landing_cro', client_id: CLIENTE, phase: 'p1', foo: 'eco', payload: { a: 1 } }))
    const j = await r.json()
    expect(j).toMatchObject({ ok: true, approval_type: 'landing_cro', foo: 'eco' })
    expect(j.fallback_mode).toBeUndefined()
    expect(db.tablas.hitl_queue).toHaveLength(1)
    expect(db.tablas.hitl_queue[0]).toMatchObject({ id: j.item_id, type: 'landing_cro', status: 'pending', payload: { a: 1 }, metadata: { origen: 'workflow', required_approver: 'emilio', phase: 'p1' } })
    expect(db.escritas.every((t) => t === 'hitl_queue')).toBe(true)
  })
  it('crear con la base caída: ok:true con fallback_mode (el contrato de siempre)', async () => {
    db.falla.hitl_queue = 'caída'
    const j = await (await crear(post('/api/hitl/approvals/create', { approval_type: 'x' }))).json()
    expect(j).toMatchObject({ ok: true, fallback_mode: true })
    expect(j.item_id).toMatch(/^hitl-stub-/)
  })
  it('🔴 /pending: lo que dejó la oficina aparece, con la forma de aprobación (item_id, approval_type, preview…)', async () => {
    db.tablas.hitl_queue = [piezaDeLaOficina({ id: 'pz-1' })]
    const j = await (await pendientes(new NextRequest('http://x/api/hitl/approvals/pending?status=pending'))).json()
    expect(j.count).toBe(1)
    expect(j.items[0]).toMatchObject({ item_id: 'pz-1', approval_type: 'pieza', status: 'pending', preview: 'Texto de la pieza', client_id: CLIENTE })
  })
  it('vencer: marca la pendiente como vencida (rechazada + decision.vencida), una resuelta devuelve «already», una inexistente 404', async () => {
    db.tablas.hitl_queue = [piezaDeLaOficina({ id: 'v1' }), piezaDeLaOficina({ id: 'v2', status: 'approved' })]
    const a = await vencer(post('/api/hitl/approvals/expire', { item_id: 'v1' }))
    expect(await a.json()).toMatchObject({ ok: true, item_id: 'v1', expired: true, escalation_item_id: null })
    expect(db.tablas.hitl_queue.find((f) => f.id === 'v1')).toMatchObject({ status: 'rejected', decision: { vencida: true } })
    expect(await (await vencer(post('/api/hitl/approvals/expire', { item_id: 'v2' }))).json()).toMatchObject({ ok: true, already: 'approved' })
    expect((await vencer(post('/api/hitl/approvals/expire', { item_id: 'nada' }))).status).toBe(404)
  })
  it('vencer con ruta de escalada: crea la fila «escalation:<tipo>» para el siguiente aprobador con 24 h y la marca de origen', async () => {
    db.tablas.hitl_queue = [piezaDeLaOficina({ id: 'v3', type: 'pieza', payload: { k: 1 } })]
    const j = await (await vencer(post('/api/hitl/approvals/expire', { item_id: 'v3', escalation_path: 'jefe', age_minutes: 30 }))).json()
    expect(j.escalated_to).toBe('jefe')
    const esc = db.tablas.hitl_queue.find((f) => f.id === j.escalation_item_id)!
    expect(esc).toMatchObject({ type: 'escalation:pieza', status: 'pending', metadata: { origen: 'escalada', required_approver: 'jefe' } })
    expect(esc.payload).toMatchObject({ k: 1, _escalated_from: 'v3', _original_age_minutes: 30 })
  })
  it('submit-approval: aprueba o rechaza en la bandeja única (también una pieza de la oficina)', async () => {
    db.tablas.hitl_queue = [piezaDeLaOficina({ id: 's1' }), piezaDeLaOficina({ id: 's2' })]
    expect(await (await submit(post('/api/hitl/submit-approval', { item_id: 's1', decision: 'approved', resolver: 'emilio' }))).json()).toMatchObject({ ok: true, decision: 'approved' })
    await submit(post('/api/hitl/submit-approval', { item_id: 's2', decision: 'rejected' }))
    expect(db.tablas.hitl_queue[0]).toMatchObject({ status: 'approved', resolved_by: 'emilio' })
    expect(db.tablas.hitl_queue[1]).toMatchObject({ status: 'rejected', resolved_by: 'emilio' })
  })
  it('🔴 la lista unificada de Mission Control incluye lo de la oficina junto a las compuertas', async () => {
    db.tablas.hitl_queue = [piezaDeLaOficina({ id: 'u1' })]
    await crearAprobacion(db as never, { approval_type: 'meta_ads', client_id: CLIENTE }, AHORA)
    const j = await (await unificada(get('/api/hitl/pending'))).json()
    expect(j.system_b_count).toBe(2)
    expect(j.items.map((i: Fila) => i.step_name).sort()).toEqual(['meta_ads', 'pieza'])
    expect(j.items.find((i: Fila) => i.step_id === 'u1')).toMatchObject({ preview: 'Texto de la pieza', resolve_url: '/api/hitl/submit-approval' })
  })
  it('🔴 el tablero rápido (mc/pending) lista lo de la oficina y de las escaladas del editor', async () => {
    db.tablas.hitl_queue = [piezaDeLaOficina({ id: 't1' })]
    await escalateToHITL({ agentSlug: 'content-creator', finalContent: 'contenido dudoso', aggregateVerdict: { status: 'escalated', issues: ['x'], feedback: 'f', severity: 'low' } as never, revisionsAttempted: 1, originalTask: 'tarea', originalContext: {}, supabase: db as never, clientId: CLIENTE })
    const html = await (await tablero(get('/api/mc/pending?masterPassword=zerorisk2026'))).text()
    expect(html).toContain('Approvals Pendientes (2)')
    expect(html).toContain('content-creator')
    expect(html).toContain('t1')
  })
  it('el resumen del pipeline cuenta las pendientes de la bandeja única', async () => {
    db.tablas.hitl_queue = [piezaDeLaOficina(), piezaDeLaOficina(), piezaDeLaOficina({ status: 'approved' })]
    const j = await (await resumen(get(`/api/pipeline/summary?client_id=${CLIENTE}`))).json()
    expect(j.activity.hitl_approvals_pending).toBe(2)
  })
})

describe('la escalada del editor (revisión) cae en la bandeja única', () => {
  it('🔴 deja una fila editor_escalation en hitl_queue, con su contenido y a 7 días, y devuelve su id', async () => {
    const id = await escalateToHITL({ agentSlug: 'content-creator', finalContent: 'x'.repeat(900), aggregateVerdict: { status: 'escalated', issues: ['a'], feedback: 'f', severity: 'high' } as never, revisionsAttempted: 2, originalTask: 'tarea', originalContext: { client_id: CLIENTE }, supabase: db as never, clientId: null })
    expect(id).toBeTruthy()
    const f = db.tablas.hitl_queue[0]
    expect(f).toMatchObject({ id, type: 'editor_escalation', agent_name: 'content-creator', client_id: CLIENTE, status: 'pending', metadata: { origen: 'editor' } })
    expect(String(f.output_preview)).toHaveLength(500)
    expect(f.metadata.editor).toMatchObject({ revisions_attempted: 2, original_task: 'tarea' })
    expect(String(f.metadata.editor.full_content)).toHaveLength(900)
    const dias = (new Date(f.expires_at).getTime() - Date.now()) / 86400e3
    expect(dias).toBeGreaterThan(6.9); expect(dias).toBeLessThan(7.1)
    expect(db.escritas).toEqual(['hitl_queue'])
  })
  it('si la base falla devuelve null (no rompe el editor) y lo dice en el log', async () => {
    db.falla.hitl_queue = 'caída'
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await escalateToHITL({ agentSlug: 'a', finalContent: 'x', aggregateVerdict: {} as never, revisionsAttempted: 0, originalTask: 't', originalContext: {}, supabase: db as never, clientId: null })).toBeNull()
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })
})

describe('🔴 una sola bandeja: el código no escribe en las dos viejas', () => {
  const RAIZ = path.resolve(__dirname, '..', 'src')
  const archivos = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (e.name === '__tests__' || e.name === 'node_modules' ? [] : archivos(path.join(d, e.name))) : /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [path.join(d, e.name)] : [])
  it('ningún archivo de src usa .from(\'hitl_pending_approvals\') ni .from(\'hitl_approvals\')', () => {
    const malos = archivos(RAIZ).filter((f) => /\.from\(\s*['"`](hitl_pending_approvals|hitl_approvals)['"`]\s*\)/.test(fs.readFileSync(f, 'utf8')))
    expect(malos.map((f) => path.relative(RAIZ, f))).toEqual([])
  })
  it('la migración deja ambas en solo lectura con disparadores por sentencia (insert, update, delete, truncate), es reversible y no borra nada', () => {
    const sql = fs.readFileSync(path.resolve(__dirname, '..', 'supabase', 'migrations', '202610191900_bandeja_unica_viejas_solo_lectura.sql'), 'utf8')
    for (const t of ['hitl_approvals', 'hitl_pending_approvals']) {
      expect(sql).toMatch(new RegExp(`CREATE TRIGGER ${t}_solo_lectura BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public\\.${t}`))
      expect(sql).toMatch(new RegExp(`DROP TRIGGER IF EXISTS ${t}_solo_lectura`))
    }
    expect(sql).toMatch(/FOR EACH STATEMENT/)
    expect(sql).toMatch(/REVERSA/)
    expect(sql.replace(/--.*$/gm, '')).not.toMatch(/\b(DROP TABLE|DELETE FROM|ALTER TABLE|TRUNCATE TABLE|UPDATE\s+public)\b/i)
  })
})
