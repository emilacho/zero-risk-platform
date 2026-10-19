/**
 * PUBLICAR LO APROBADO · SOLO EN ENSAYO (arreglo 5 de la cadena · CC#2 · 19-oct). US$ 0, base simulada, SIN red.
 *  · `encolarLote` deja el lote en la bandeja una sola vez por tarea; `publicarAprobado` solo trabaja sobre lo APROBADO y nunca llama a Meta;
 *  · publicar de verdad se rechaza (`real_no_habilitado`) antes de mirar nada;
 *  · el enganche en `PATCH /api/hitl/[id]` solo actúa con el tipo del lote y una aprobación; los demás tipos quedan como estaban.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  armarSolicitud, configuracionDeMeta, encolarLote, MAX_CAPTION_INSTAGRAM, MAX_PIEZAS_POR_LOTE, publicarAprobado, TIPO_LOTE_SOCIAL, validarLote,
  type ElementoDeBandeja, type PuertosDePublicacion, type ResultadoDeEnsayo,
} from '../src/lib/publicacion/en-ensayo'
import { puertosDePublicacion } from '../src/lib/publicacion/almacen-supabase'

const CLI = '41dd3d62-d6de-4c9a-9996-6df78c1da118'
const OTRO = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const ENV_COMPLETO = { META_IG_BUSINESS_ACCOUNT_ID: '123', META_IG_ACCESS_TOKEN: 'SECRETO-IG', META_FB_PAGE_ID: '456', META_FB_PAGE_ACCESS_TOKEN: 'SECRETO-FB' }
const PIEZA_IG = { canal: 'instagram', image_url: 'https://cdn.ejemplo.com/a.jpg', caption: 'Hola' }
const PIEZA_FB = { canal: 'facebook', message: 'Hola Facebook' }
const LOTE = { task_id: 'social_1', client_id: CLI, piezas: [PIEZA_IG, PIEZA_FB] }

// ───────────────────────────────────────────────────────── puertos en memoria
interface Mundo { elementos: Map<string, ElementoDeBandeja>; creados: number; guardados: Array<{ id: string; ensayo: ResultadoDeEnsayo }>; lecturas: number }
function puertos(env: Record<string, string | undefined> = {}): { P: PuertosDePublicacion; m: Mundo } {
  const m: Mundo = { elementos: new Map(), creados: 0, guardados: [], lecturas: 0 }
  const P: PuertosDePublicacion = {
    env, ahora: () => new Date('2026-10-19T20:00:00Z'),
    async leerElemento(id) { m.lecturas++; return m.elementos.get(id) ?? null },
    async guardarEnsayo(id, ensayo) { m.guardados.push({ id, ensayo }); const e = m.elementos.get(id); if (e) e.metadata = { ...(e.metadata ?? {}), publicacion_ensayo: ensayo } },
    async buscarLote(task_id, client_id) { const e = [...m.elementos.values()].find((x) => x.type === TIPO_LOTE_SOCIAL && x.client_id === client_id && x.metadata?.task_id === task_id); return e ? { id: e.id } : null },
    async crearElemento(e) { m.creados++; const id = 'el-' + m.creados; m.elementos.set(id, { id, type: TIPO_LOTE_SOCIAL, status: 'pending', client_id: e.client_id, metadata: e.metadata }); return { id } },
  }
  return { P, m }
}
const aprobado = (m: Mundo, metadata: Record<string, unknown> | null = { task_id: 'social_1', lote: LOTE }, extra: Partial<ElementoDeBandeja> = {}) =>
  m.elementos.set('a1', { id: 'a1', type: TIPO_LOTE_SOCIAL, status: 'approved', client_id: CLI, metadata, ...extra })

let fetchLlamado = 0
beforeEach(() => { fetchLlamado = 0; vi.stubGlobal('fetch', async () => { fetchLlamado++; throw new Error('SIN RED: esta prueba no puede llamar a nadie') }) })
afterEach(() => { vi.unstubAllGlobals() })

describe('validarLote', () => {
  it('un lote válido se normaliza (canal en minúsculas, fecha en ISO)', () => {
    const v = validarLote({ ...LOTE, piezas: [{ ...PIEZA_IG, canal: ' Instagram ' }], programar_para: '2026-10-20T10:00:00-05:00' })
    expect(v.ok).toBe(true)
    if (v.ok) { expect(v.lote.piezas[0].canal).toBe('instagram'); expect(v.lote.programar_para).toBe('2026-10-20T15:00:00.000Z') }
  })
  it('rechaza lo mal formado con la lista de errores', () => {
    const casos: Array<[unknown, string]> = [
      [null, 'objeto'], [{ ...LOTE, client_id: '' }, 'client_id'], [{ ...LOTE, task_id: ' ' }, 'task_id'], [{ ...LOTE, piezas: [] }, 'piezas'], [{ ...LOTE, piezas: 'x' }, 'piezas'],
      [{ ...LOTE, piezas: [{ caption: 'sin canal' }] }, 'canal'], [{ ...LOTE, piezas: [{ canal: 'instagram', image_url: 5 }] }, 'image_url debe ser texto'],
      [{ ...LOTE, programar_para: 'mañana' }, 'programar_para'],
    ]
    for (const [cuerpo, frag] of casos) { const v = validarLote(cuerpo); expect(v.ok).toBe(false); if (!v.ok) expect(v.errores.join(' | ')).toContain(frag) }
  })
  it('el borde del lote: 10 piezas pasan, 11 no', () => {
    expect(MAX_PIEZAS_POR_LOTE).toBe(10)
    expect(validarLote({ ...LOTE, piezas: Array.from({ length: 10 }, () => PIEZA_FB) }).ok).toBe(true)
    expect(validarLote({ ...LOTE, piezas: Array.from({ length: 11 }, () => PIEZA_FB) }).ok).toBe(false)
  })
})

describe('armarSolicitud (lo que se mandaría a Meta, sin llaves)', () => {
  it('instagram: contenedor y publicar, con las rutas reales', () => {
    const a = armarSolicitud(PIEZA_IG)
    expect(a.armada).toBe(true)
    expect(a.solicitudes.map((s) => s.ruta)).toEqual(['/{META_IG_BUSINESS_ACCOUNT_ID}/media', '/{META_IG_BUSINESS_ACCOUNT_ID}/media_publish'])
    expect(a.solicitudes[0].cuerpo).toEqual({ image_url: PIEZA_IG.image_url, caption: 'Hola' })
  })
  it('instagram: sin imagen, o con dirección no https, no se arma', () => {
    expect(armarSolicitud({ canal: 'instagram', caption: 'x' }).errores.join()).toContain('image_url')
    expect(armarSolicitud({ canal: 'instagram', image_url: 'http://x.com/a.jpg' }).errores.join()).toContain('https')
    expect(armarSolicitud({ canal: 'instagram', image_url: 'data:image/png;base64,AAAA' }).armada).toBe(false)
  })
  it('instagram: el borde del caption (2200 pasa, 2201 no)', () => {
    expect(MAX_CAPTION_INSTAGRAM).toBe(2200) // el límite de Instagram: no se mueve sin saberlo
    expect(armarSolicitud({ ...PIEZA_IG, caption: 'a'.repeat(2200) }).armada).toBe(true)
    const larga = armarSolicitud({ ...PIEZA_IG, caption: 'a'.repeat(2201) })
    expect(larga.armada).toBe(false); expect(larga.solicitudes).toEqual([])
  })
  it('facebook: solo texto va a /feed (con enlace si lo hay); con imagen va a /photos', () => {
    expect(armarSolicitud({ canal: 'facebook', message: 'Hola', link_url: 'https://ejemplo.com' }).solicitudes[0]).toEqual({ paso: 'publicar', metodo: 'POST', ruta: '/{META_FB_PAGE_ID}/feed', cuerpo: { message: 'Hola', link: 'https://ejemplo.com' } })
    expect(armarSolicitud({ canal: 'facebook', message: 'Hola', image_url: 'https://c.com/a.jpg' }).solicitudes[0]).toEqual({ paso: 'publicar', metodo: 'POST', ruta: '/{META_FB_PAGE_ID}/photos', cuerpo: { url: 'https://c.com/a.jpg', caption: 'Hola' } })
    expect(armarSolicitud({ canal: 'facebook', caption: 'solo caption' }).solicitudes[0].cuerpo).toEqual({ message: 'solo caption' })
  })
  it('facebook: sin texto ni imagen no se arma; un enlace no https tampoco', () => {
    expect(armarSolicitud({ canal: 'facebook' }).armada).toBe(false)
    expect(armarSolicitud({ canal: 'facebook', message: 'x', link_url: 'http://x.com' }).armada).toBe(false)
  })
  it('una red sin publicador (linkedin, tiktok…) se dice, no se inventa', () => {
    const a = armarSolicitud({ canal: 'linkedin', caption: 'x' })
    expect(a.publicador).toBe(false); expect(a.armada).toBe(false); expect(a.errores[0]).toContain('no hay publicador')
  })
})

describe('configuracionDeMeta', () => {
  it('dice qué falta, acepta el token general y NUNCA devuelve valores', () => {
    expect(configuracionDeMeta({}).instagram.faltan).toEqual(['META_IG_BUSINESS_ACCOUNT_ID', '(META_IG_ACCESS_TOKEN | META_ACCESS_TOKEN)'])
    const c = configuracionDeMeta({ META_IG_BUSINESS_ACCOUNT_ID: '1', META_ACCESS_TOKEN: 'SECRETO', META_FB_PAGE_ID: '2' })
    expect(c.instagram.configurada).toBe(true); expect(c.facebook.configurada).toBe(true)
    expect(JSON.stringify(c)).not.toContain('SECRETO')
    expect(configuracionDeMeta({ META_IG_BUSINESS_ACCOUNT_ID: '  ', META_ACCESS_TOKEN: 'x' }).instagram.configurada).toBe(false)
  })
})

describe('encolarLote', () => {
  it('un lote inválido no toca la bandeja', async () => {
    const { P, m } = puertos()
    const r = await encolarLote(P, { ...LOTE, piezas: [] })
    expect(r.ok).toBe(false); if (!r.ok) expect(r.status).toBe(400)
    expect(m.creados).toBe(0)
  })
  it('crea UN elemento de la bandeja con el lote y no publica nada', async () => {
    const { P, m } = puertos()
    const r = await encolarLote(P, LOTE)
    expect(r.ok && r.staged && !r.ya_estaba).toBe(true)
    const el = [...m.elementos.values()][0]
    expect(el.type).toBe(TIPO_LOTE_SOCIAL); expect(el.status).toBe('pending'); expect(el.metadata).toMatchObject({ task_id: 'social_1', lote: { client_id: CLI } })
    expect(fetchLlamado).toBe(0)
  })
  it('es idempotente por tarea y cliente: repetir no crea otro; la misma tarea de OTRO cliente sí', async () => {
    const { P, m } = puertos()
    const a = await encolarLote(P, LOTE); const b = await encolarLote(P, LOTE)
    expect(a.ok && b.ok && a.hitl_id === b.hitl_id && b.ya_estaba).toBe(true)
    expect(m.creados).toBe(1)
    await encolarLote(P, { ...LOTE, client_id: OTRO }); expect(m.creados).toBe(2)
  })
})

describe('publicarAprobado', () => {
  it('`real: true` se rechaza ANTES de leer nada (publicar de verdad no está construido)', async () => {
    const { P, m } = puertos(ENV_COMPLETO); aprobado(m)
    for (const real of [true, 'true', 1, {}]) { const r = await publicarAprobado(P, { hitl_id: 'a1', real }); expect(r.ok).toBe(false); if (!r.ok) { expect(r.status).toBe(409); expect(r.error).toBe('real_no_habilitado') } }
    expect(m.lecturas).toBe(0); expect(m.guardados).toEqual([]); expect(fetchLlamado).toBe(0)
  })
  it('no existe, otro tipo y no aprobado se rechazan con su razón', async () => {
    const { P, m } = puertos(ENV_COMPLETO)
    const no = await publicarAprobado(P, { hitl_id: 'zzz' }); expect(!no.ok && no.status).toBe(404)
    aprobado(m, undefined, { type: 'content_review' }); const otro = await publicarAprobado(P, { hitl_id: 'a1' }); expect(!otro.ok && otro.error).toBe('tipo_no_publicable')
    for (const status of ['pending', 'rejected', 'edited', 'in_review']) { aprobado(m, undefined, { status }); const r = await publicarAprobado(P, { hitl_id: 'a1' }); expect(!r.ok && r.error).toBe('no_aprobado') }
    expect(m.guardados).toEqual([]); expect(fetchLlamado).toBe(0)
  })
  it('aprobado sin lote válido, o de otro cliente, no se arma', async () => {
    const { P, m } = puertos(ENV_COMPLETO)
    aprobado(m, { task_id: 'x' }); const sin = await publicarAprobado(P, { hitl_id: 'a1' }); expect(!sin.ok && sin.error).toBe('lote_ausente')
    aprobado(m, { task_id: 'social_1', lote: LOTE }, { client_id: OTRO }); const otro = await publicarAprobado(P, { hitl_id: 'a1' }); expect(!otro.ok && otro.error).toBe('cliente_distinto')
    expect(m.guardados).toEqual([])
  })
  it('aprobado y con configuración: arma el ensayo, lo guarda y NO llama a Meta', async () => {
    const { P, m } = puertos(ENV_COMPLETO); aprobado(m)
    const r = await publicarAprobado(P, { hitl_id: 'a1' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.ya_estaba).toBe(false)
      expect(r.ensayo).toMatchObject({ modo: 'ensayo', real: false, publicable: true, task_id: 'social_1', client_id: CLI, hora: '2026-10-19T20:00:00.000Z' })
      expect(r.ensayo.piezas.map((p) => p.armada)).toEqual([true, true])
      expect(r.ensayo.advertencias[0]).toContain('sin_cuenta_por_cliente')
    }
    expect(m.guardados).toHaveLength(1); expect(fetchLlamado).toBe(0)
    expect(JSON.stringify(m.guardados[0].ensayo)).not.toContain('SECRETO')
  })
  it('sin configuración de Meta queda armado pero NO publicable, y lo dice', async () => {
    const { P, m } = puertos({}); aprobado(m)
    const r = await publicarAprobado(P, { hitl_id: 'a1' })
    expect(r.ok && r.ensayo.publicable).toBe(false)
    if (r.ok) expect(r.ensayo.advertencias.join(' ')).toContain('falta configuración de Meta para: instagram, facebook')
  })
  it('una sola pieza mala hace el lote no publicable; una red sin publicador también', async () => {
    const { P, m } = puertos(ENV_COMPLETO)
    aprobado(m, { task_id: 'social_1', lote: { ...LOTE, piezas: [PIEZA_IG, { canal: 'facebook' }] } })
    const r = await publicarAprobado(P, { hitl_id: 'a1' }); expect(r.ok && r.ensayo.publicable).toBe(false)
    aprobado(m, { task_id: 'social_1', lote: { ...LOTE, piezas: [PIEZA_IG, { canal: 'tiktok', caption: 'x' }] } })
    const t = await publicarAprobado(P, { hitl_id: 'a1' }); expect(t.ok && t.ensayo.publicable).toBe(false)
  })
  it('es idempotente: si el ensayo ya está guardado lo devuelve y no rehace ni vuelve a escribir', async () => {
    const { P, m } = puertos(ENV_COMPLETO); aprobado(m)
    const a = await publicarAprobado(P, { hitl_id: 'a1' }); const b = await publicarAprobado(P, { hitl_id: 'a1' })
    expect(a.ok && b.ok && b.ya_estaba && b.ensayo.hora === a.ensayo.hora).toBe(true)
    expect(m.guardados).toHaveLength(1)
  })
})

// ───────────────────────────────────────────────────────── el almacén real sobre una base falsa
function baseFalsa() {
  const filas: Array<Record<string, any>> = []
  const registro: Array<{ op: string; datos?: any; filtros: any[] }> = []
  let n = 0
  const from = (tabla: string) => {
    const q: any = { op: 'select', filtros: [] as any[], patch: null, row: null, lim: Infinity }
    const filtrar = () => filas.filter((f) => q.filtros.every((fn: any) => fn(f))).slice(0, q.lim)
    const ejecutar = () => {
      registro.push({ op: q.op, datos: q.row ?? q.patch, filtros: q.filtros.map((x: any) => x.d) })
      if (q.op === 'insert') { const f = { id: 'f' + ++n, ...q.row }; filas.push(f); return { data: [f], error: null } }
      if (q.op === 'update') { for (const f of filtrar()) Object.assign(f, q.patch); return { data: filtrar(), error: null } }
      return { data: filtrar(), error: null }
    }
    const api: any = {
      select: () => api,
      eq: (k: string, v: unknown) => { const fn: any = (f: any) => f[k] === v; fn.d = ['eq', k, v]; q.filtros.push(fn); return api },
      filter: (k: string, op: string, v: unknown) => { const fn: any = (f: any) => (k === 'metadata->>task_id' ? String(f.metadata?.task_id) === v : false); fn.d = [op, k, v]; q.filtros.push(fn); return api },
      limit: (x: number) => { q.lim = x; return api },
      insert: (r: any) => { q.op = 'insert'; q.row = r; return api },
      update: (p: any) => { q.op = 'update'; q.patch = p; return api },
      maybeSingle: async () => ({ data: ejecutar().data?.[0] ?? null, error: null }),
      single: async () => { const r = ejecutar(); return { data: r.data?.[0] ?? null, error: r.data?.length ? null : { message: 'sin fila' } } },
      then: (res: any, rej: any) => Promise.resolve(ejecutar()).then(res, rej),
    }
    void tabla
    return api
  }
  return { db: { from }, filas, registro }
}
describe('puertosDePublicacion (almacén real, base falsa)', () => {
  it('crea el elemento con las columnas heredadas que la bandeja exige y lo encuentra por tarea', async () => {
    const { db, filas } = baseFalsa(); const P = puertosDePublicacion(db, {})
    const { id } = await P.crearElemento({ client_id: CLI, title: 'T', output_preview: 'P', metadata: { task_id: 'social_1', lote: LOTE }, payload: { lote: LOTE } })
    expect(filas[0]).toMatchObject({ client_id: CLI, agent_name: 'social-publisher', risk_type: 'strategic_decision', output_preview: 'P', type: TIPO_LOTE_SOCIAL, status: 'pending', priority: 'medium' })
    expect(await P.buscarLote('social_1', CLI)).toEqual({ id }); expect(await P.buscarLote('otra', CLI)).toBeNull(); expect(await P.buscarLote('social_1', OTRO)).toBeNull()
  })
  it('buscar el lote ignora un elemento de OTRO tipo que comparte tarea y cliente', async () => {
    const { db, filas } = baseFalsa(); const P = puertosDePublicacion(db, {})
    filas.push({ id: 'o1', type: 'content_review', status: 'pending', client_id: CLI, metadata: { task_id: 'social_1' } })
    expect(await P.buscarLote('social_1', CLI)).toBeNull()
  })
  it('guardar el ensayo conserva el resto de `metadata`', async () => {
    const { db, filas } = baseFalsa(); const P = puertosDePublicacion(db, {})
    filas.push({ id: 'x1', type: TIPO_LOTE_SOCIAL, status: 'approved', client_id: CLI, metadata: { task_id: 'social_1', lote: LOTE, decision_humana: { frase: 'ok' } } })
    await P.guardarEnsayo('x1', { modo: 'ensayo', real: false } as ResultadoDeEnsayo)
    expect(filas[0].metadata).toEqual({ task_id: 'social_1', lote: LOTE, decision_humana: { frase: 'ok' }, publicacion_ensayo: { modo: 'ensayo', real: false } })
  })
  it('leer un elemento inexistente da null; un error de la base se dice (no se lee como «no existe»)', async () => {
    const { db } = baseFalsa(); expect(await puertosDePublicacion(db, {}).leerElemento('nada')).toBeNull()
    const rota = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'caída' } }) }) }) }) }
    await expect(puertosDePublicacion(rota, {}).leerElemento('x')).rejects.toThrow('caída')
  })
})

// ───────────────────────────────────────────────────────── las rutas
const m = vi.hoisted(() => ({ base: null as any }))
vi.mock('@/lib/internal-auth', () => ({ checkInternalKey: (r: Request) => (r.headers.get('x-api-key') === 'k' ? { ok: true } : { ok: false, reason: 'Invalid x-api-key' }) }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => m.base.db }))

const llamar = async (modulo: string, metodo: 'POST' | 'PATCH', cuerpo: unknown, llave: string | null = 'k', ctx?: unknown) => {
  const mod = await import(modulo)
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(llave ? { 'x-api-key': llave } : {}) }
  const r = await mod[metodo](new Request('http://x/y', { method: metodo, headers, body: JSON.stringify(cuerpo) }), ctx)
  return { status: r.status, json: (await r.json()) as Record<string, any> }
}
describe('POST /api/social/schedule-batch', () => {
  beforeEach(() => { m.base = baseFalsa() })
  it('sin llave 401; lote inválido 400 con los errores; válido 201 y repetido 200 sin duplicar', async () => {
    const ruta = '../src/app/api/social/schedule-batch/route'
    expect((await llamar(ruta, 'POST', LOTE, null)).status).toBe(401)
    const mal = await llamar(ruta, 'POST', { ...LOTE, piezas: [] }); expect(mal.status).toBe(400); expect(mal.json.errores.join()).toContain('piezas')
    const a = await llamar(ruta, 'POST', LOTE); expect(a.status).toBe(201); expect(a.json).toMatchObject({ ok: true, staged: true, ya_estaba: false, piezas: 2 })
    const b = await llamar(ruta, 'POST', LOTE); expect(b.status).toBe(200); expect(b.json.hitl_id).toBe(a.json.hitl_id)
    expect(m.base.filas).toHaveLength(1); expect(fetchLlamado).toBe(0)
  })
  it('si la bandeja no responde, 503 claro (no 500)', async () => {
    m.base = { db: { from: () => ({ select: () => { throw new Error('caída') } }) }, filas: [] }
    const r = await llamar('../src/app/api/social/schedule-batch/route', 'POST', LOTE); expect(r.status).toBe(503); expect(r.json.error).toBe('bandeja_no_disponible')
  })
})
describe('POST /api/social/publicar-aprobado', () => {
  const ruta = '../src/app/api/social/publicar-aprobado/route'
  beforeEach(() => { m.base = baseFalsa(); m.base.filas.push({ id: 'a1', type: TIPO_LOTE_SOCIAL, status: 'approved', client_id: CLI, metadata: { task_id: 'social_1', lote: LOTE } }) })
  it('sin llave 401; sin hitl_id 400; real:true 409; no aprobado 409; aprobado 200 y repetido ya_estaba', async () => {
    expect((await llamar(ruta, 'POST', { hitl_id: 'a1' }, null)).status).toBe(401)
    expect((await llamar(ruta, 'POST', {})).status).toBe(400)
    const real = await llamar(ruta, 'POST', { hitl_id: 'a1', real: true }); expect(real.status).toBe(409); expect(real.json.error).toBe('real_no_habilitado')
    m.base.filas.push({ id: 'p1', type: TIPO_LOTE_SOCIAL, status: 'pending', client_id: CLI, metadata: { lote: LOTE } })
    expect((await llamar(ruta, 'POST', { hitl_id: 'p1' })).json.error).toBe('no_aprobado')
    const ok = await llamar(ruta, 'POST', { hitl_id: 'a1' }); expect(ok.status).toBe(200); expect(ok.json.ensayo).toMatchObject({ modo: 'ensayo', real: false })
    const otra = await llamar(ruta, 'POST', { hitl_id: 'a1' }); expect(otra.json.ya_estaba).toBe(true)
    expect(m.base.filas[0].metadata.publicacion_ensayo.real).toBe(false); expect(fetchLlamado).toBe(0)
  })
})

describe('PATCH /api/hitl/[id] · el enganche del lote aprobado', () => {
  const ruta = '../src/app/api/hitl/[id]/route'
  const ctx = { params: { id: 'a1' } }
  beforeEach(() => {
    m.base = baseFalsa()
    m.base.filas.push({ id: 'a1', type: TIPO_LOTE_SOCIAL, status: 'pending', client_id: CLI, metadata: { task_id: 'social_1', lote: LOTE } })
    m.base.filas.push({ id: 'o1', type: 'content_review', status: 'pending', client_id: CLI, metadata: {} })
  })
  it('aprobar el lote arma el ensayo en la respuesta y lo deja guardado; no llama a Meta', async () => {
    const r = await llamar(ruta, 'PATCH', { status: 'approved', reviewer: 'emilio' }, 'k', ctx)
    expect(r.status).toBe(200); expect(r.json.item.status).toBe('approved')
    expect(r.json.publicacion).toMatchObject({ ok: true, ya_estaba: false, ensayo: { modo: 'ensayo', real: false } })
    expect(m.base.filas[0].metadata.publicacion_ensayo.task_id).toBe('social_1'); expect(fetchLlamado).toBe(0)
  })
  it('rechazar el lote, o aprobar otro tipo, NO traen `publicacion` (la respuesta sigue como era)', async () => {
    const rech = await llamar(ruta, 'PATCH', { status: 'rejected', reviewer: 'emilio' }, 'k', ctx); expect(rech.json).not.toHaveProperty('publicacion')
    const otro = await llamar(ruta, 'PATCH', { status: 'approved', reviewer: 'emilio' }, 'k', { params: { id: 'o1' } }); expect(Object.keys(otro.json)).toEqual(['item'])
  })
  it('si el ensayo LANZA un error (la base falla al guardarlo), la decisión se mantiene y el error se dice', async () => {
    const original = m.base.db.from; let actualizaciones = 0
    m.base.db.from = (t: string) => { const api = original(t); const upd = api.update; api.update = (p: any) => { actualizaciones++; if (actualizaciones > 1) throw new Error('caída al guardar'); return upd(p) }; return api } // la 1.ª es la decisión; la 2.ª, el ensayo
    const r = await llamar(ruta, 'PATCH', { status: 'approved', reviewer: 'emilio' }, 'k', ctx)
    expect(r.status).toBe(200); expect(r.json.item.status).toBe('approved'); expect(r.json.publicacion).toMatchObject({ ok: false, error: 'ensayo_fallido' }); expect(r.json.publicacion.detail).toContain('caída')
  })
  it('si el ensayo falla, la decisión del aprobador se mantiene y se dice', async () => {
    m.base.filas[0].metadata = { task_id: 'social_1' }
    const r = await llamar(ruta, 'PATCH', { status: 'approved', reviewer: 'emilio' }, 'k', ctx)
    expect(r.status).toBe(200); expect(r.json.item.status).toBe('approved'); expect(r.json.publicacion).toMatchObject({ ok: false, error: 'lote_ausente' })
  })
})
