import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { camposCambiados, MAX_CARACTERES_DE_NOTAS, MAX_NOTAS, seccionDeAutorevision, seleccionarNotas, validarAutorevision } from '../autorevision'
import { lunesDe, registroDelCliente } from '../registro'
import { registrarAutorevision } from '../adaptadores'
import { procesarSalida } from '../../oficina/salida'
import { crearPuertos, type Entorno } from '../../oficina/adaptadores'
import { DbFalsa } from '../../oficina/__tests__/dbfalsa'
import type { Nota } from '../tipos'

const CLIENTE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
let db: DbFalsa
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => db }))
const nota = (o: Partial<Nota> & { id: string }): Nota => ({ client_id: CLIENTE, alcance: 'cliente', tipo: 'comentario', comentario: 'algo', hitl_id: null, output_id: null, pieza_titulo: 'Post', pieza_version: null, pieza_familia: null, origen: 'slack', autor: 'U1', clave_unica: o.id, creada_en: '2026-10-21T12:00:00Z', ...o })

describe('qué notas ve el agente', () => {
  it('solo las que dicen algo; una aprobación o un rechazo sin comentario no enseña nada', () => {
    const v = seleccionarNotas([nota({ id: 'a', comentario: null, tipo: 'aprobada' }), nota({ id: 'b', comentario: null, tipo: 'rechazada' }), nota({ id: 'c', comentario: '   ' }), nota({ id: 'd', comentario: 'Más corto', tipo: 'rechazada' })])
    expect(v.map((x) => x.id)).toEqual(['d'])
    expect(v[0].texto).toBe('El dueño rechazó «Post»: «Más corto»')
  })
  it('las más nuevas primero; las generales se rotulan; el título se recorta', () => {
    const v = seleccionarNotas([nota({ id: 'vieja', creada_en: '2026-10-01T00:00:00Z', pieza_titulo: 'T'.repeat(200) }), nota({ id: 'nueva', creada_en: '2026-10-20T00:00:00Z', alcance: 'general' })])
    expect(v.map((x) => x.id)).toEqual(['nueva', 'vieja'])
    expect(v[0].texto.startsWith('(vale para todos los clientes) El dueño comentó: «')).toBe(true)
    expect(v[1].texto.startsWith('El dueño comentó sobre «')).toBe(true)
    expect(v[1].texto).toContain('…»')
  })
  it('una nota GENERAL no lleva el título de la pieza de origen (no filtra la pieza de un cliente al contexto de otro)', () => {
    const v = seleccionarNotas([nota({ id: 'g', alcance: 'general', tipo: 'rechazada', pieza_titulo: 'PIEZA-SECRETA-DEL-CLIENTE-A', comentario: 'Nada de signos de exclamación' }), nota({ id: 'c', alcance: 'general', tipo: 'comentario', pieza_titulo: 'OTRA-PIEZA-SECRETA', comentario: 'Tutea' })])
    expect(JSON.stringify(v)).not.toContain('SECRETA')
    expect(v.map((x) => x.texto).sort()).toEqual(['(vale para todos los clientes) El dueño comentó: «Tutea»', '(vale para todos los clientes) El dueño dijo al rechazar: «Nada de signos de exclamación»'])
  })
  it('una nota sin título habla de «una pieza»', () => { expect(seleccionarNotas([nota({ id: 'a', pieza_titulo: null, tipo: 'rechazada' })])[0].texto).toContain('rechazó una pieza') })
  it('tope de cantidad y de caracteres; cada comentario se recorta', () => {
    const muchas = Array.from({ length: 40 }, (_, i) => nota({ id: `n${i}`, creada_en: `2026-10-${String(1 + (i % 28)).padStart(2, '0')}T00:00:00Z`, comentario: `comentario ${i}` }))
    expect(seleccionarNotas(muchas)).toHaveLength(MAX_NOTAS)
    expect(seleccionarNotas(muchas, { max: 3 })).toHaveLength(3)
    const largas = Array.from({ length: 15 }, (_, i) => nota({ id: `l${i}`, comentario: 'x'.repeat(1900) }))
    const v = seleccionarNotas(largas)
    expect(v.reduce((t, x) => t + x.texto.length, 0)).toBeLessThanOrEqual(MAX_CARACTERES_DE_NOTAS)
    expect(v.every((x) => x.texto.length < 500)).toBe(true)
    expect(v.length).toBeGreaterThan(5)
  })
  it('el que viene primero por fecha sobrevive al tope aunque llegue último en la lista', () => {
    const v = seleccionarNotas([nota({ id: 'o1', creada_en: '2026-10-01T00:00:00Z' }), nota({ id: 'o2', creada_en: '2026-10-02T00:00:00Z' }), nota({ id: 'n', creada_en: '2026-10-21T00:00:00Z' })], { max: 1 })
    expect(v.map((x) => x.id)).toEqual(['n'])
  })
  it('sin notas, nada', () => { expect(seleccionarNotas([])).toEqual([]) })
})

describe('la sección que se agrega al pedido', () => {
  const sec = seccionDeAutorevision({ piezaActual: { pie_de_foto: 'Hola' }, notas: [{ id: 'n1', texto: 'El dueño rechazó una pieza: «corto»' }], contratoOriginal: '{"pie_de_foto": "…"}' })
  it('trae las notas con su id, la entrega actual y las reglas de respuesta', () => {
    expect(sec).toContain('- [n1] El dueño rechazó una pieza: «corto»')
    expect(sec).toContain('"pie_de_foto": "Hola"')
    expect(sec).toContain('{"choca": false, "hallazgos": []}')
    expect(sec).toContain('1. Si NADA choca con las notas')
    expect(sec).toContain('2. Si algo choca, corrige SOLO eso')
    expect(sec).toContain('cambia únicamente los campos que nombres')
    expect(sec).toContain('No agregues datos nuevos ni inventes nada')
    expect(sec).toContain('{"pie_de_foto": "…"}')
  })
  it('sin contrato conocido pide el mismo formato de la entrega anterior; con error de formato lo agrega al final', () => {
    expect(seccionDeAutorevision({ piezaActual: {}, notas: [], contratoOriginal: null })).toContain('el MISMO formato de tu entrega anterior')
    const e = seccionDeAutorevision({ piezaActual: {}, notas: [], contratoOriginal: null, errorDeFormato: 'cita notas que no existen' })
    expect(e.endsWith('cita notas que no existen')).toBe(true)
    expect(e).toContain('## Corrección')
  })
})

describe('lo que el código le exige a la auto-revisión', () => {
  const original = { pie_de_foto: 'Hola largo', hashtags: ['#a'], llamado: 'Pide' }
  const H = (campo: string, nota_id = 'n1') => ({ nota_id, campo, que_choca: 'x', que_cambio: 'y' })
  it('camposCambiados ve cambios, altas y bajas de campos, y compara por valor (no por orden de claves)', () => {
    expect(camposCambiados(original, { llamado: 'Pide', hashtags: ['#a'], pie_de_foto: 'Hola largo' })).toEqual([])
    expect(camposCambiados(original, { ...original, hashtags: ['#a', '#b'] })).toEqual(['hashtags'])
    expect(camposCambiados(original, { pie_de_foto: 'Hola largo', hashtags: ['#a'] })).toEqual(['llamado'])
    expect(camposCambiados(original, { ...original, nuevo: 1 })).toEqual(['nuevo'])
    expect(camposCambiados({ a: { x: 1, y: [1, { z: 2 }] } }, { a: { y: [1, { z: 2 }], x: 1 } })).toEqual([])
    expect(camposCambiados({ a: { x: 1 } }, { a: { x: 2 } })).toEqual(['a'])
  })
  it('nada chocó: hallazgos vacíos y sin pieza', () => {
    expect(validarAutorevision({ choca: false, hallazgos: [] }, ['n1'], original)).toEqual({ ok: true, choca: false })
    expect(validarAutorevision({ choca: false, hallazgos: [H('pie_de_foto')] }, ['n1'], original)).toMatchObject({ ok: false })
    expect(validarAutorevision({ choca: false, hallazgos: [], corregida: original }, ['n1'], original)).toMatchObject({ ok: false })
  })
  it('chocó: nombra notas que existen, trae la pieza y los campos cambiados son EXACTAMENTE los nombrados', () => {
    const buena = validarAutorevision({ choca: true, hallazgos: [H('pie_de_foto')], corregida: { ...original, pie_de_foto: 'Hola' } }, ['n1'], original)
    expect(buena).toMatchObject({ ok: true, choca: true, cambiados: ['pie_de_foto'] })
    expect(validarAutorevision({ choca: true, hallazgos: [], corregida: { ...original, pie_de_foto: 'Hola' } }, ['n1'], original)).toMatchObject({ ok: false, error: expect.stringContaining('no nombras ninguna nota') })
    expect(validarAutorevision({ choca: true, hallazgos: [H('pie_de_foto')] }, ['n1'], original)).toMatchObject({ ok: false, error: expect.stringContaining('no devuelves la pieza') })
    expect(validarAutorevision({ choca: true, hallazgos: [H('pie_de_foto')], corregida: [] }, ['n1'], original)).toMatchObject({ ok: false, error: expect.stringContaining('no devuelves la pieza corregida') })
    expect(validarAutorevision({ choca: true, hallazgos: [H('pie_de_foto')], corregida: 'texto' }, ['n1'], original)).toMatchObject({ ok: false, error: expect.stringContaining('no devuelves la pieza corregida') })
    expect(validarAutorevision({ choca: true, hallazgos: [H('pie_de_foto', 'n9')], corregida: { ...original, pie_de_foto: 'Hola' } }, ['n1'], original)).toMatchObject({ ok: false, error: expect.stringContaining('«n9»') })
    expect(validarAutorevision({ choca: true, hallazgos: [H('pie_de_foto')], corregida: { ...original, pie_de_foto: 'Hola', llamado: 'Otro' } }, ['n1'], original)).toMatchObject({ ok: false, error: expect.stringContaining('«llamado»') })
    expect(validarAutorevision({ choca: true, hallazgos: [H('pie_de_foto'), H('llamado')], corregida: { ...original, pie_de_foto: 'Hola' } }, ['n1'], original)).toMatchObject({ ok: false, error: expect.stringContaining('no lo cambiaste') })
    expect(validarAutorevision({ choca: true, hallazgos: [H('pie_de_foto')], corregida: original }, ['n1'], original)).toMatchObject({ ok: false, error: expect.stringContaining('idéntica') })
  })
})

describe('el registro visible', () => {
  it('lunesDe: la semana empieza el lunes (UTC)', () => {
    expect(lunesDe('2026-10-21T12:00:00Z')).toBe('2026-10-19') // miércoles
    expect(lunesDe('2026-10-19T00:00:00Z')).toBe('2026-10-19')
    expect(lunesDe('2026-10-25T23:59:59Z')).toBe('2026-10-19') // domingo
    expect(lunesDe('2026-10-26T00:00:00Z')).toBe('2026-10-26')
  })
  const ns = [
    nota({ id: '1', tipo: 'rechazada', creada_en: '2026-10-05T10:00:00Z' }), nota({ id: '2', tipo: 'rechazada', creada_en: '2026-10-06T10:00:00Z' }), nota({ id: '3', tipo: 'aprobada', creada_en: '2026-10-07T10:00:00Z', comentario: null }),
    nota({ id: '4', tipo: 'aprobada', creada_en: '2026-10-19T10:00:00Z', comentario: null }), nota({ id: '5', tipo: 'aprobada', creada_en: '2026-10-20T10:00:00Z', comentario: null }), nota({ id: '6', tipo: 'rechazada', creada_en: '2026-10-21T10:00:00Z', alcance: 'general' }),
    nota({ id: '7', tipo: 'comentario', creada_en: '2026-10-21T11:00:00Z' }), nota({ id: 'ajena', client_id: 'otro', tipo: 'rechazada', creada_en: '2026-10-21T11:00:00Z' }),
  ]
  it('cuenta las notas del cliente (no las de otro), por tipo, con comentario y generales', () => {
    const r = registroDelCliente(CLIENTE, ns, [])
    expect(r.notas).toEqual({ total: 7, con_comentario: 4, generales: 1, aprobadas: 3, rechazadas: 3, comentarios: 1, primera: '2026-10-05T10:00:00Z', ultima: '2026-10-21T11:00:00Z' })
  })
  it('la tasa de rechazo por semana y si baja de la primera mitad a la segunda', () => {
    const r = registroDelCliente(CLIENTE, ns, [])
    expect(r.semanas).toEqual([{ semana: '2026-10-05', aprobadas: 1, rechazadas: 2, tasa_de_rechazo: 0.6667 }, { semana: '2026-10-19', aprobadas: 2, rechazadas: 1, tasa_de_rechazo: 0.3333 }])
    expect(r.tendencia).toEqual({ antes: 0.6667, despues: 0.3333, baja: true })
    const sube = registroDelCliente(CLIENTE, [...ns].reverse().map((n, i) => ({ ...n, creada_en: ns[i].creada_en })), [])
    expect(sube.tendencia === null || typeof sube.tendencia.baja === 'boolean').toBe(true)
  })
  it('si la tasa de rechazo no baja (queda igual), la tendencia lo dice: baja = false', () => {
    const igual = [
      nota({ id: 'a', tipo: 'rechazada', creada_en: '2026-10-05T10:00:00Z' }), nota({ id: 'b', tipo: 'aprobada', creada_en: '2026-10-06T10:00:00Z', comentario: null }),
      nota({ id: 'c', tipo: 'rechazada', creada_en: '2026-10-19T10:00:00Z' }), nota({ id: 'd', tipo: 'aprobada', creada_en: '2026-10-20T10:00:00Z', comentario: null }),
    ]
    expect(registroDelCliente(CLIENTE, igual, []).tendencia).toEqual({ antes: 0.5, despues: 0.5, baja: false })
    const sube = [nota({ id: 'a', tipo: 'aprobada', creada_en: '2026-10-05T10:00:00Z', comentario: null }), nota({ id: 'b', tipo: 'rechazada', creada_en: '2026-10-19T10:00:00Z' })]
    expect(registroDelCliente(CLIENTE, sube, []).tendencia).toEqual({ antes: 0, despues: 1, baja: false })
  })
  it('con menos de dos semanas con decisiones no hay tendencia (no se inventa)', () => {
    expect(registroDelCliente(CLIENTE, [ns[0]], []).tendencia).toBeNull()
    expect(registroDelCliente(CLIENTE, [], [])).toMatchObject({ notas: { total: 0, primera: null, ultima: null }, semanas: [], tendencia: null, autorevisiones: { total: 0 } })
    expect(registroDelCliente(CLIENTE, [ns[6]], []).semanas).toEqual([]) // un comentario no es una decisión
  })
  it('las auto-revisiones: cuántas corrigieron algo, por paso y cuánto costaron', () => {
    const r = registroDelCliente(CLIENTE, [], [
      { choco: true, costo_usd: 0.05, paso: 'autorevision_texto', creada_en: 'x' }, { choco: false, costo_usd: 0.04, paso: 'autorevision_texto', creada_en: 'x' }, { choco: false, costo_usd: 0.03, paso: 'autorevision_diseno', creada_en: 'x' },
    ])
    expect(r.autorevisiones).toEqual({ total: 3, con_cambios: 1, sin_cambios: 2, costo_usd: 0.12, por_paso: { autorevision_texto: { total: 2, con_cambios: 1 }, autorevision_diseno: { total: 1, con_cambios: 0 } } })
  })
})

describe('el sobre de la respuesta de la auto-revisión', () => {
  const H = (campo: string) => ({ nota_id: 'n1', campo, que_choca: 'x', que_cambio: 'y' })
  it('«nada chocó» sin la lista de hallazgos también vale (no cuesta un reintento)', () => {
    expect(procesarSalida('{"choca": false}', 'autorevision.v1', 0, 1)).toMatchObject({ ok: true })
    expect(procesarSalida(['```json', '{"choca": false, "hallazgos": []}', '```'].join('\n'), 'autorevision.v1', 0, 1)).toMatchObject({ ok: true })
  })
  it('hasta 6 hallazgos; el séptimo no cabe', () => {
    const con = (n: number) => JSON.stringify({ choca: true, hallazgos: Array.from({ length: n }, (_, i) => H(`c${i}`)), corregida: { a: 1 } })
    expect(procesarSalida(con(6), 'autorevision.v1', 0, 1)).toMatchObject({ ok: true })
    expect(procesarSalida(con(7), 'autorevision.v1', 0, 1)).toMatchObject({ ok: false, accion: 'reintentar' })
  })
  it('exige `choca` booleano y rechaza campos ajenos', () => {
    expect(procesarSalida('{"hallazgos": []}', 'autorevision.v1', 1, 1)).toMatchObject({ ok: false })
    expect(procesarSalida('{"choca": "si", "hallazgos": []}', 'autorevision.v1', 1, 1)).toMatchObject({ ok: false })
    expect(procesarSalida('{"choca": false, "hallazgos": [], "otra": 1}', 'autorevision.v1', 1, 1)).toMatchObject({ ok: false })
  })
})

describe('la ruta del registro', () => {
  beforeEach(() => {
    db = new DbFalsa()
    process.env.INTERNAL_API_KEY = 'llave'
    db.semilla('notas_del_dueno', [{ id: 'n1', client_id: CLIENTE, alcance: 'cliente', tipo: 'rechazada', comentario: 'x', creada_en: '2026-10-05T10:00:00Z' }, { id: 'n2', client_id: 'otro', alcance: 'cliente', tipo: 'rechazada', comentario: 'y', creada_en: '2026-10-05T10:00:00Z' }])
    db.semilla('autorevisiones_del_productor', [{ client_id: CLIENTE, choco: true, costo_usd: 0.05, paso: 'autorevision_texto', creada_en: '2026-10-06T10:00:00Z' }])
  })
  afterEach(() => { delete process.env.INTERNAL_API_KEY })
  const pedir = async (q: string, llave: string | null = 'llave') => { const { GET } = await import('@/app/api/notas-del-dueno/registro/route'); return GET(new Request(`https://app.test/api/notas-del-dueno/registro${q}`, { headers: llave ? { 'x-api-key': llave } : {} })) }
  it('sin llave 401; sin client_id válido 400', async () => {
    expect((await pedir(`?client_id=${CLIENTE}`, null)).status).toBe(401)
    expect((await pedir(`?client_id=${CLIENTE}`, 'mala')).status).toBe(401)
    expect((await pedir('?client_id=no-es-uuid')).status).toBe(400)
    expect((await pedir('')).status).toBe(400)
  })
  it('devuelve el registro del cliente pedido y solo de ese', async () => {
    const r = await pedir(`?client_id=${CLIENTE}`)
    expect(r.status).toBe(200)
    const { registro } = await r.json()
    expect(registro.notas.total).toBe(1)
    expect(registro.autorevisiones).toMatchObject({ total: 1, con_cambios: 1 })
  })
  it('un error de la base NO se devuelve como «sin notas»', async () => {
    db.fallar['notas_del_dueno'] = 'caída'
    expect((await pedir(`?client_id=${CLIENTE}`)).status).toBe(500)
    delete db.fallar['notas_del_dueno']
    db.fallar['autorevisiones_del_productor'] = 'caída'
    expect((await pedir(`?client_id=${CLIENTE}`)).status).toBe(500)
  })
})

describe('el puerto de notas de la oficina real (la auto-revisión lee del CEREBRO)', () => {
  const ENV = { baseUrl: 'https://app.test', internalKey: 'k' } as Entorno
  const OTRO = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  type Resp = { ficha_id: string; tema: string; pregunta: string; respuesta: string; canal: string; respondido_en: string }
  /** el cerebro falso: GET /api/brain/alimentar/dueno?client_id=… devuelve lo del cliente pedido */
  function cerebro(porCliente: Record<string, Resp[]>, o: { apagado?: boolean; status?: number } = {}) {
    const llamadas: Array<{ url: string; llave: string | null }> = []
    const f = (async (url: string, init?: RequestInit) => {
      llamadas.push({ url, llave: ((init?.headers ?? {}) as Record<string, string>)['x-api-key'] ?? null })
      if (o.status) return new Response('{}', { status: o.status })
      if (o.apagado) return new Response(JSON.stringify({ apagado: true }), { status: 200 })
      const id = new URL(url).searchParams.get('client_id') ?? ''
      return new Response(JSON.stringify({ ok: true, client_id: id, respuestas: porCliente[id] ?? [], pendientes: [] }), { status: 200 })
    }) as unknown as typeof fetch
    return { f, llamadas }
  }
  const r1: Resp = { ficha_id: 'f1', tema: 'oficina creativa · pieza p1 · 1.1', pregunta: 'Revisión de la pieza «Post» (post_img)', respuesta: 'Más corto', canal: '#oficina-creativa', respondido_en: '2026-10-21T10:00:00.000Z' }
  const r2: Resp = { ficha_id: 'f2', tema: 'pauta', pregunta: 'Presupuesto de pauta', respuesta: 'No más de 200 por semana', canal: 'MD de Slack', respondido_en: '2026-10-20T10:00:00.000Z' }
  it('apagado por omisión: sin la bandera no hay puerto y la oficina funciona como siempre', () => {
    const db = new DbFalsa()
    expect(crearPuertos(db, ENV).notas).toBeUndefined()
    expect(crearPuertos(db, { ...ENV, notasDelDueno: false }).notas).toBeUndefined()
  })
  it('lee del cerebro lo último que dijo el dueño de ESE cliente (de cualquier canal) con la llave interna, y las generales del registro; nunca lo de otro cliente ni las notas propias de la tabla', async () => {
    const db = new DbFalsa()
    db.semilla('notas_del_dueno', [
      { id: 'tabla-propia', client_id: CLIENTE, alcance: 'cliente', tipo: 'rechazada', comentario: 'ESTA-NO-SE-LEE-DE-LA-TABLA', pieza_titulo: 'Post', creada_en: '2026-10-05T10:00:00Z' },
      { id: 'g1', client_id: OTRO, alcance: 'general', tipo: 'comentario', comentario: 'Tutea siempre', pieza_titulo: 'PIEZA-SECRETA', creada_en: '2026-10-06T10:00:00Z' },
      { id: 'ajena', client_id: OTRO, alcance: 'cliente', tipo: 'comentario', comentario: 'privada ajena', pieza_titulo: null, creada_en: '2026-10-07T10:00:00Z' },
    ])
    const { f, llamadas } = cerebro({ [CLIENTE]: [r1, r2], [OTRO]: [{ ...r1, ficha_id: 'x9', respuesta: 'DEL-OTRO-CLIENTE' }] })
    const P = crearPuertos(db, { ...ENV, notasDelDueno: true }, f)
    const l = await P.notas!.leer(CLIENTE)
    expect(l.error).toBeUndefined()
    expect(l.notas.map((v) => v.id)).toEqual(['f1', 'f2', 'g1'])                       // el cerebro primero (lo más nuevo primero) y luego las generales
    const todo = JSON.stringify(l)
    expect(todo).toContain('Más corto'); expect(todo).toContain('200 por semana'); expect(todo).toContain('Tutea siempre'); expect(todo).toContain('#oficina-creativa')
    for (const no of ['ESTA-NO-SE-LEE-DE-LA-TABLA', 'DEL-OTRO-CLIENTE', 'privada ajena', 'PIEZA-SECRETA']) expect(todo).not.toContain(no)
    expect(llamadas).toHaveLength(2)                                                   // dos lecturas: el canal creativo con su tope y lo último que dijo el dueño en general
    expect(llamadas.map((l) => l.url).sort()).toEqual([`https://app.test/api/brain/alimentar/dueno?client_id=${CLIENTE}`, `https://app.test/api/brain/alimentar/dueno?client_id=${CLIENTE}&canal=%23oficina-creativa&limite=20`].sort())
    expect(llamadas.every((l) => l.llave === 'k')).toBe(true)
  })
  it('si el cerebro falla o está apagado: sigue con las generales y trae el motivo (nunca se toma por «el dueño no ha dicho nada»)', async () => {
    const db = new DbFalsa()
    db.semilla('notas_del_dueno', [{ id: 'g1', client_id: OTRO, alcance: 'general', tipo: 'comentario', comentario: 'Tutea siempre', pieza_titulo: null, creada_en: '2026-10-06T10:00:00Z' }])
    for (const [o, motivo] of [[{ status: 502 }, '502'], [{ apagado: true }, 'apagada']] as const) {
      const l = await crearPuertos(db, { ...ENV, notasDelDueno: true }, cerebro({ [CLIENTE]: [r1] }, o).f).notas!.leer(CLIENTE)
      expect(l.notas.map((v) => v.id)).toEqual(['g1'])
      expect(l.error).toContain('cerebro:'); expect(l.error).toContain(motivo)
    }
    const red = (async () => { throw new Error('red caída') }) as unknown as typeof fetch
    expect((await crearPuertos(db, { ...ENV, notasDelDueno: true }, red).notas!.leer(CLIENTE)).error).toContain('red caída')
  })
  it('si solo falla una de las dos lecturas del cerebro: sigue con la otra y deja el motivo', async () => {
    const db = new DbFalsa()
    let n = 0
    const f = (async (url: string) => { n++; return String(url).includes('canal=') ? new Response('{}', { status: 502 }) : new Response(JSON.stringify({ ok: true, respuestas: [r1] }), { status: 200 }) }) as unknown as typeof fetch
    const l = await crearPuertos(db, { ...ENV, notasDelDueno: true }, f).notas!.leer(CLIENTE)
    expect(n).toBe(2)
    expect(l.notas.map((v) => v.id)).toEqual(['f1'])
    expect(l.error).toBeUndefined()   // la lectura creativa es un refuerzo: si la general entregó, no hay nada que lamentar
  })
  it('si falla la lectura de las generales: sigue con lo del cerebro y trae el motivo', async () => {
    const db = new DbFalsa()
    db.fallar['notas_del_dueno'] = 'caída'
    const l = await crearPuertos(db, { ...ENV, notasDelDueno: true }, cerebro({ [CLIENTE]: [r1] }).f).notas!.leer(CLIENTE)
    expect(l.notas.map((v) => v.id)).toEqual(['f1'])
    expect(l.error).toContain('generales:'); expect(l.error).toContain('caída')
  })
  it('si fallan las dos cosas: sin notas y los dos motivos', async () => {
    const db = new DbFalsa()
    db.fallar['notas_del_dueno'] = 'caída'
    const l = await crearPuertos(db, { ...ENV, notasDelDueno: true }, cerebro({}, { status: 500 }).f).notas!.leer(CLIENTE)
    expect(l.notas).toEqual([])
    expect(l.error).toContain('cerebro:'); expect(l.error).toContain('generales:')
  })
  it('registra la auto-revisión una sola vez por clave; un error de la base se lanza (el orquestador lo traga)', async () => {
    const db = new DbFalsa()
    const P = crearPuertos(db, { ...ENV, notasDelDueno: true })
    const r = { client_id: CLIENTE, encargo_id: 'e1', agente: 'content-creator', paso: 'autorevision_texto', notas_vistas: ['a'], choco: true, cambios: [{ campo: 'pie_de_foto' }], costo_usd: 0.04, clave_unica: 'e1:autorevision_texto:5' }
    await P.notas!.registrar(r); await P.notas!.registrar(r)
    expect(db.tablas['autorevisiones_del_productor']).toHaveLength(1)
    db.fallar['autorevisiones_del_productor'] = 'sin permiso'
    await expect(registrarAutorevision(db, { ...r, clave_unica: 'otra' })).rejects.toThrow(/sin permiso/)
  })
})
