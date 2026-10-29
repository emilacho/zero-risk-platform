import crypto from 'node:crypto'
import { describe, it, expect, vi } from 'vitest'
import { verificarFirmaDeSlack, VENTANA_S } from '../firma-slack'
import { mensajeDeLaPieza, ACCION_APROBAR, ACCION_RECHAZAR, MAX_SECCION, MAX_IMAGENES } from '../mensaje-pieza'
import { alcanceYComentario, interpretarEvento, interpretarInteractividad, payloadDeInteractividad, BLOQUE_DEL_MOTIVO, CALLBACK_DEL_RECHAZO, CAMPO_DEL_MOTIVO } from '../interpretar'
import { procesar } from '../recibir'
import { enviarPiezaASlack, leerGenerales, puertosDeNotas } from '../adaptadores'
import type { ConfiguracionDeNotas, NotaNueva, PiezaDeBandeja, PuertosDeNotas, ResultadoDeNota } from '../tipos'
import { DbFalsa } from '../../oficina/__tests__/dbfalsa'

const HITL = '11111111-1111-4111-8111-111111111111'
const OTRO = '22222222-2222-4222-8222-222222222222'
const CLIENTE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const EMILIO = 'U0EMILIO1'
const CFG: ConfiguracionDeNotas = { autorizados: [EMILIO] }

// ───────────────────────── firma de Slack
describe('firma de Slack', () => {
  const secreto = 's3creto'
  const ahoraMs = 1_800_000_000_000
  const marca = String(Math.floor(ahoraMs / 1000))
  const cuerpo = 'payload=%7B%7D'
  const firmar = (b = cuerpo, m = marca, s = secreto) => 'v0=' + crypto.createHmac('sha256', s).update(`v0:${m}:${b}`).digest('hex')
  it('acepta una firma buena', () => { expect(verificarFirmaDeSlack({ secreto, firma: firmar(), marca, cuerpo, ahoraMs })).toEqual({ ok: true }) })
  it('rechaza sin secreto configurado (falla cerrado)', () => { expect(verificarFirmaDeSlack({ secreto: undefined, firma: firmar(), marca, cuerpo, ahoraMs })).toEqual({ ok: false, motivo: 'sin_secreto' }) })
  it('rechaza sin cabeceras', () => {
    expect(verificarFirmaDeSlack({ secreto, firma: null, marca, cuerpo, ahoraMs })).toEqual({ ok: false, motivo: 'sin_cabeceras' })
    expect(verificarFirmaDeSlack({ secreto, firma: firmar(), marca: undefined, cuerpo, ahoraMs })).toEqual({ ok: false, motivo: 'sin_cabeceras' })
  })
  it('rechaza una marca que no es un número', () => { expect(verificarFirmaDeSlack({ secreto, firma: firmar(), marca: 'abc', cuerpo, ahoraMs })).toEqual({ ok: false, motivo: 'marca_invalida' }) })
  it('rechaza una marca vieja o futura (antirepetición) y acepta el borde', () => {
    const vieja = String(Math.floor(ahoraMs / 1000) - VENTANA_S - 1)
    expect(verificarFirmaDeSlack({ secreto, firma: firmar(cuerpo, vieja), marca: vieja, cuerpo, ahoraMs })).toEqual({ ok: false, motivo: 'marca_vieja' })
    const futura = String(Math.floor(ahoraMs / 1000) + VENTANA_S + 1)
    expect(verificarFirmaDeSlack({ secreto, firma: firmar(cuerpo, futura), marca: futura, cuerpo, ahoraMs })).toEqual({ ok: false, motivo: 'marca_vieja' })
    const borde = String(Math.floor(ahoraMs / 1000) - VENTANA_S)
    expect(verificarFirmaDeSlack({ secreto, firma: firmar(cuerpo, borde), marca: borde, cuerpo, ahoraMs })).toEqual({ ok: true })
  })
  it('rechaza un cuerpo alterado, un secreto distinto y una firma de otro largo (sin lanzar)', () => {
    expect(verificarFirmaDeSlack({ secreto, firma: firmar(), marca, cuerpo: cuerpo + 'x', ahoraMs })).toEqual({ ok: false, motivo: 'firma_invalida' })
    expect(verificarFirmaDeSlack({ secreto, firma: firmar(cuerpo, marca, 'otro'), marca, cuerpo, ahoraMs })).toEqual({ ok: false, motivo: 'firma_invalida' })
    expect(verificarFirmaDeSlack({ secreto, firma: 'v0=corta', marca, cuerpo, ahoraMs })).toEqual({ ok: false, motivo: 'firma_invalida' })
  })
})

// ───────────────────────── el mensaje de la pieza
describe('mensaje de la pieza', () => {
  const base = { hitl_id: HITL, cliente: 'Cliente', titulo: 'Post del lunes', familia: 'post_img' }
  const botones = (m: { blocks: unknown[] }) => ((m.blocks.find((b) => (b as { type: string }).type === 'actions') as { elements: Array<{ action_id: string; value: string }> }).elements)
  it('trae los dos botones con el id de la pieza y el aviso de que nada se publica sin aprobar', () => {
    const m = mensajeDeLaPieza({ ...base, texto: 'Hola' })
    expect(botones(m).map((b) => [b.action_id, b.value])).toEqual([[ACCION_APROBAR, HITL], [ACCION_RECHAZAR, HITL]])
    expect(JSON.stringify(m.blocks)).toContain('Nada se publica sin tu aprobación')
    expect(JSON.stringify(m.blocks)).toContain('también puedes aprobar o rechazar en el tablero')   // mientras los botones no estén activos en Slack, la bandeja sigue siendo la vía
    expect(JSON.stringify(m.blocks)).toContain('general:')
  })
  it('recorta el texto largo a lo que Slack admite y lo marca con «…»', () => {
    const m = mensajeDeLaPieza({ ...base, texto: 'a'.repeat(MAX_SECCION + 500) })
    const seccion = (m.blocks as Array<{ type: string; text?: { text: string } }>).filter((b) => b.type === 'section' && b.text && b.text.text.startsWith('a'))[0]
    expect(seccion.text!.text.length).toBeLessThanOrEqual(MAX_SECCION)
    expect(seccion.text!.text.endsWith('…')).toBe(true)
  })
  it('29-oct · un carrusel de 7 láminas llega con las 7 (antes se cortaba en 4)', () => {
    const m = mensajeDeLaPieza({ ...base, imagenes: Array.from({ length: 7 }, (_, i) => `https://a.test/l${i + 1}.png`) })
    expect((m.blocks as Array<{ type: string }>).filter((b) => b.type === 'image')).toHaveLength(7)
  })
  it('solo manda imágenes públicas https y como mucho MAX_IMAGENES', () => {
    const imgs = ['https://a.test/1.png', 'http://a.test/2.png', 'data:image/png;base64,AAA', ...Array.from({ length: 14 }, (_, i) => `https://a.test/x${i}.png`)]
    const m = mensajeDeLaPieza({ ...base, imagenes: imgs })
    const im = (m.blocks as Array<{ type: string; image_url?: string }>).filter((b) => b.type === 'image')
    expect(im.length).toBe(MAX_IMAGENES)
    expect(im.every((b) => b.image_url!.startsWith('https://'))).toBe(true)
    expect(m.blocks.length).toBeLessThanOrEqual(50)
  })
  it('lleva un texto de respaldo y funciona sin texto ni imágenes', () => {
    const m = mensajeDeLaPieza(base)
    expect(m.text).toContain('Post del lunes')
    expect(botones(m)).toHaveLength(2)
  })
})

// ───────────────────────── interpretar
describe('interpretar lo que manda Slack', () => {
  const accion = (action_id: string, value = HITL, extra: Record<string, unknown> = {}) => ({ type: 'block_actions', user: { id: EMILIO }, trigger_id: 'T1', container: { channel_id: 'C1', message_ts: '1.1' }, actions: [{ action_id, value }], ...extra })
  it('[Aprobar] ⇒ aprobar con canal y ts', () => { expect(interpretarInteractividad(accion(ACCION_APROBAR))).toEqual({ tipo: 'aprobar', hitl_id: HITL, autor: EMILIO, canal: 'C1', ts: '1.1' }) })
  it('[Rechazar] ⇒ abrir el formulario (no rechaza todavía); sin trigger_id se ignora', () => {
    expect(interpretarInteractividad(accion(ACCION_RECHAZAR))).toEqual({ tipo: 'abrir_rechazo', hitl_id: HITL, autor: EMILIO, canal: 'C1', ts: '1.1', trigger_id: 'T1' })
    expect(interpretarInteractividad(accion(ACCION_RECHAZAR, HITL, { trigger_id: undefined })).tipo).toBe('ignorar')
  })
  it('ignora ids que no son uuid, acciones desconocidas, payloads ilegibles y tipos no atendidos', () => {
    expect(interpretarInteractividad(accion(ACCION_APROBAR, 'no-es-uuid')).tipo).toBe('ignorar')
    expect(interpretarInteractividad(accion('otra')).tipo).toBe('ignorar')
    expect(interpretarInteractividad(null).tipo).toBe('ignorar')
    expect(interpretarInteractividad({ type: 'block_actions' }).tipo).toBe('ignorar')
    expect(interpretarInteractividad({ type: 'shortcut', user: { id: EMILIO } }).tipo).toBe('ignorar')
  })
  const envio = (motivo?: string, callback = CALLBACK_DEL_RECHAZO, meta: Record<string, unknown> = { hitl_id: HITL, canal: 'C1', ts: '1.1' }) => ({
    type: 'view_submission', user: { id: EMILIO },
    view: { callback_id: callback, private_metadata: JSON.stringify(meta), state: { values: { [BLOQUE_DEL_MOTIVO]: { [CAMPO_DEL_MOTIVO]: { value: motivo ?? null } } } } },
  })
  it('el formulario del motivo ⇒ rechazar con el comentario (o sin él)', () => {
    expect(interpretarInteractividad(envio('Muy largo'))).toEqual({ tipo: 'rechazar', hitl_id: HITL, autor: EMILIO, canal: 'C1', ts: '1.1', comentario: 'Muy largo' })
    expect(interpretarInteractividad(envio())).toMatchObject({ tipo: 'rechazar', comentario: null })
    expect(interpretarInteractividad(envio('x'.repeat(2500)))).toMatchObject({ comentario: 'x'.repeat(2000) })
  })
  it('ignora un formulario ajeno o con metadata rota', () => {
    expect(interpretarInteractividad(envio('x', 'otro')).tipo).toBe('ignorar')
    expect(interpretarInteractividad(envio('x', CALLBACK_DEL_RECHAZO, { hitl_id: 'zzz' })).tipo).toBe('ignorar')
    expect(interpretarInteractividad({ type: 'view_submission', user: { id: EMILIO }, view: { callback_id: CALLBACK_DEL_RECHAZO, private_metadata: '{no json' } }).tipo).toBe('ignorar')
  })
  it('el cuerpo de la interactividad se lee del formulario `payload=`', () => {
    const p = accion(ACCION_APROBAR)
    expect(payloadDeInteractividad('payload=' + encodeURIComponent(JSON.stringify(p)))).toEqual(p)
    expect(payloadDeInteractividad('payload=%7Bmal')).toBeNull()
    expect(payloadDeInteractividad('')).toBeNull()
  })
  const ev = (e: Record<string, unknown>) => ({ type: 'event_callback', event: { type: 'message', channel: 'C1', ts: '2.2', thread_ts: '1.1', user: EMILIO, text: 'Más corto, por favor', ...e } })
  it('un mensaje de Emilio dentro del hilo ⇒ comentar', () => { expect(interpretarEvento(ev({}))).toEqual({ tipo: 'comentar', canal: 'C1', hilo_ts: '1.1', ts: '2.2', autor: EMILIO, texto: 'Más corto, por favor' }) })
  it('ignora la raíz del hilo, los mensajes fuera de un hilo, los de bots, los editados y los vacíos', () => {
    expect(interpretarEvento(ev({ thread_ts: '2.2' })).tipo).toBe('ignorar')
    expect(interpretarEvento(ev({ thread_ts: undefined })).tipo).toBe('ignorar')
    expect(interpretarEvento(ev({ bot_id: 'B1' })).tipo).toBe('ignorar')
    expect(interpretarEvento(ev({ subtype: 'message_changed' })).tipo).toBe('ignorar')
    expect(interpretarEvento(ev({ text: '   ' })).tipo).toBe('ignorar')
    expect(interpretarEvento(ev({ user: undefined })).tipo).toBe('ignorar')
    expect(interpretarEvento({ type: 'event_callback', event: { type: 'reaction_added' } }).tipo).toBe('ignorar')
  })
  it('el reto de verificación se devuelve', () => {
    expect(interpretarEvento({ type: 'url_verification', challenge: 'abc' })).toEqual({ tipo: 'reto', challenge: 'abc' })
    expect(interpretarEvento({ type: 'url_verification' }).tipo).toBe('ignorar')
  })
  it('«general:» al inicio hace la nota general; si solo dice «general:» no cuenta', () => {
    expect(alcanceYComentario('general: nunca uses signos de exclamación')).toEqual({ alcance: 'general', comentario: 'nunca uses signos de exclamación' })
    expect(alcanceYComentario('Para todos: tutea')).toEqual({ alcance: 'general', comentario: 'tutea' })
    expect(alcanceYComentario('  más corto ')).toEqual({ alcance: 'cliente', comentario: 'más corto' })
    expect(alcanceYComentario('general:   ')).toEqual({ alcance: 'cliente', comentario: 'general:' })
    expect(alcanceYComentario('lo general: no cuenta aquí')).toEqual({ alcance: 'cliente', comentario: 'lo general: no cuenta aquí' })
  })
})

// ───────────────────────── recibir (con puertos en memoria)
function mundo(estado = 'pending', over: Partial<PiezaDeBandeja> = {}) {
  const pieza: PiezaDeBandeja = { hitl_id: HITL, client_id: CLIENTE, type: 'content_piece_review', status: estado, output_id: 'oooooooo-oooo-4ooo-8ooo-oooooooooooo', titulo: 'Post del lunes', familia: 'post_img', version: '3', slack: { canal: 'C1', ts: '1.1' }, ...over }
  const m = { pieza, decididas: [] as Array<{ status: string; reviewer: string; frase: string | null }>, notas: new Map<string, NotaNueva>(), hilos: [] as Array<[string, string]>, modales: [] as string[], fallaDecidir: false, fallaNota: false }
  const P: PuertosDeNotas = {
    pieza: async (id) => (id === HITL ? m.pieza : null),
    decidir: async (_id, d) => { if (m.fallaDecidir) return { ok: false, error: 'boom' }; m.decididas.push(d); m.pieza = { ...m.pieza, status: d.status }; return { ok: true } },
    guardarNota: async (n): Promise<ResultadoDeNota> => { if (m.fallaNota) return { ok: false, error: 'boom' }; const repetida = m.notas.has(n.clave_unica); if (!repetida) m.notas.set(n.clave_unica, n); return { ok: true, id: `nota-${m.notas.size}`, repetida } },
    hitlDelHilo: async (c, ts) => (c === 'C1' && ts === '1.1' ? HITL : null),
    abrirModalDeRechazo: async (t) => { m.modales.push(t); return t !== 'MALO' },
    responderEnHilo: async () => {},
  }
  return { m, P }
}
const aprobar = { tipo: 'aprobar' as const, hitl_id: HITL, autor: EMILIO, canal: 'C1', ts: '1.1' }
const rechazar = (comentario: string | null) => ({ tipo: 'rechazar' as const, hitl_id: HITL, autor: EMILIO, canal: 'C1', ts: '1.1', comentario })

describe('recibir · decisiones', () => {
  it('aprobar decide la pieza por la ruta de siempre y guarda la nota aprobada, sin comentario', async () => {
    const { m, P } = mundo()
    const r = await procesar(P, CFG, aprobar)
    expect(r.status).toBe(200)
    expect(r.cuerpo).toMatchObject({ ok: true, decision: 'approved' })
    expect(m.decididas).toEqual([{ status: 'approved', reviewer: `slack:${EMILIO}`, frase: null }])
    expect([...m.notas.values()]).toEqual([expect.objectContaining({ client_id: CLIENTE, tipo: 'aprobada', comentario: null, alcance: 'cliente', hitl_id: HITL, pieza_titulo: 'Post del lunes', pieza_version: '3', pieza_familia: 'post_img', origen: 'slack', autor: EMILIO, clave_unica: `decision:${HITL}:aprobada` })])
  })
  it('rechazar con motivo: decide, manda la frase a la ruta y guarda la nota con el motivo', async () => {
    const { m, P } = mundo()
    const r = await procesar(P, CFG, rechazar('Demasiado formal'))
    expect(r.cuerpo).toMatchObject({ ok: true, decision: 'rejected' })
    expect(m.decididas).toEqual([{ status: 'rejected', reviewer: `slack:${EMILIO}`, frase: 'Demasiado formal' }])
    expect([...m.notas.values()][0]).toMatchObject({ tipo: 'rechazada', comentario: 'Demasiado formal', alcance: 'cliente' })
  })
  it('rechazar con «general: …» guarda la nota general sin el prefijo', async () => {
    const { m, P } = mundo()
    await procesar(P, CFG, rechazar('general: nada de emojis'))
    expect([...m.notas.values()][0]).toMatchObject({ alcance: 'general', comentario: 'nada de emojis' })
  })
  it('rechazar sin motivo guarda la nota sin comentario', async () => {
    const { m, P } = mundo()
    await procesar(P, CFG, rechazar(null))
    expect([...m.notas.values()][0]).toMatchObject({ tipo: 'rechazada', comentario: null })
    expect(m.decididas[0].frase).toBeNull()
  })
  it('un doble clic no decide dos veces ni duplica la nota', async () => {
    const { m, P } = mundo()
    await procesar(P, CFG, aprobar)
    const r2 = await procesar(P, CFG, aprobar)
    expect(m.decididas).toHaveLength(1)
    expect(m.notas.size).toBe(1)
    expect(r2.cuerpo).toMatchObject({ ok: true, repetida: true })
  })
  it('una pieza ya decidida distinto NO se cambia y no guarda nota', async () => {
    const { m, P } = mundo('rejected')
    const r = await procesar(P, CFG, aprobar)
    expect(r.cuerpo).toMatchObject({ ok: false, error: 'ya_decidida', estado: 'rejected' })
    expect(m.decididas).toHaveLength(0)
    expect(m.notas.size).toBe(0)
    expect(r.aviso).toContain('no la cambié')
  })
  it('si la decisión falla no se guarda ninguna nota y se avisa', async () => {
    const { m, P } = mundo()
    m.fallaDecidir = true
    const r = await procesar(P, CFG, aprobar)
    expect(r.status).toBe(502)
    expect(m.notas.size).toBe(0)
    expect(r.aviso).toContain('No pude registrar')
  })
  it('si la nota falla la decisión queda y un nuevo clic reintenta SOLO la nota', async () => {
    const { m, P } = mundo()
    m.fallaNota = true
    const r = await procesar(P, CFG, aprobar)
    expect(r.status).toBe(500)
    expect(r.cuerpo).toMatchObject({ error: 'nota_no_guardada', decision: 'aplicada' })
    expect(m.decididas).toHaveLength(1)
    m.fallaNota = false
    const r2 = await procesar(P, CFG, aprobar)
    expect(r2.status).toBe(200)
    expect(m.decididas).toHaveLength(1)
    expect(m.notas.size).toBe(1)
  })
  it('solo decide quien está autorizado; con la lista vacía nadie (falla cerrado)', async () => {
    const { m, P } = mundo()
    expect((await procesar(P, CFG, { ...aprobar, autor: 'U0OTRO' })).cuerpo).toMatchObject({ ok: false, error: 'no_autorizado' })
    expect((await procesar(P, { autorizados: [] }, aprobar)).cuerpo).toMatchObject({ ok: false, error: 'no_autorizado' })
    expect((await procesar(P, CFG, rechazar('x'))).cuerpo).toMatchObject({ ok: true })
    const o = mundo()
    expect((await procesar(o.P, CFG, { tipo: 'comentar', canal: 'C1', hilo_ts: '1.1', ts: '2.2', autor: 'U0OTRO', texto: 'hola' })).cuerpo).toMatchObject({ error: 'no_autorizado' })
    expect(m.decididas).toHaveLength(1)
    expect(o.m.notas.size).toBe(0)
  })
  it('una pieza que no existe o no es una pieza de la oficina no se toca', async () => {
    const { m, P } = mundo()
    expect((await procesar(P, CFG, { ...aprobar, hitl_id: OTRO })).cuerpo).toMatchObject({ error: 'pieza_inexistente' })
    const w = mundo('pending', { type: 'seo_playbook_review' })
    expect((await procesar(w.P, CFG, aprobar)).cuerpo).toMatchObject({ error: 'pieza_inexistente' })
    expect(w.m.decididas).toHaveLength(0)
    expect(m.decididas).toHaveLength(0)
  })
})

describe('recibir · formulario del rechazo y comentarios', () => {
  it('[Rechazar] abre el formulario y NO decide todavía', async () => {
    const { m, P } = mundo()
    const r = await procesar(P, CFG, { tipo: 'abrir_rechazo', hitl_id: HITL, autor: EMILIO, canal: 'C1', ts: '1.1', trigger_id: 'T1' })
    expect(r.cuerpo).toMatchObject({ ok: true, formulario: 'abierto' })
    expect(m.modales).toEqual(['T1'])
    expect(m.decididas).toHaveLength(0)
  })
  it('si el formulario no se abre se dice; si la pieza ya está decidida no se abre', async () => {
    const { P } = mundo()
    const r = await procesar(P, CFG, { tipo: 'abrir_rechazo', hitl_id: HITL, autor: EMILIO, canal: 'C1', ts: '1.1', trigger_id: 'MALO' })
    expect(r.cuerpo).toMatchObject({ error: 'formulario_no_abierto' })
    const y = mundo('approved')
    const r2 = await procesar(y.P, CFG, { tipo: 'abrir_rechazo', hitl_id: HITL, autor: EMILIO, canal: 'C1', ts: '1.1', trigger_id: 'T1' })
    expect(r2.cuerpo).toMatchObject({ error: 'ya_decidida' })
    expect(y.m.modales).toHaveLength(0)
  })
  const comentar = (texto: string, ts = '2.2') => ({ tipo: 'comentar' as const, canal: 'C1', hilo_ts: '1.1', ts, autor: EMILIO, texto })
  it('un comentario en el hilo guarda una nota y NO cambia la decisión de la pieza', async () => {
    const { m, P } = mundo()
    const r = await procesar(P, CFG, comentar('Prefiero frases cortas'))
    expect(r.cuerpo).toMatchObject({ ok: true, alcance: 'cliente' })
    expect(m.decididas).toHaveLength(0)
    expect([...m.notas.values()][0]).toMatchObject({ tipo: 'comentario', comentario: 'Prefiero frases cortas', clave_unica: 'comentario:C1:2.2', client_id: CLIENTE })
  })
  it('el mismo comentario repetido (reintento de Slack) no duplica; otro comentario sí suma', async () => {
    const { m, P } = mundo()
    await procesar(P, CFG, comentar('uno'))
    const r = await procesar(P, CFG, comentar('uno'))
    expect(r.cuerpo).toMatchObject({ repetida: true })
    await procesar(P, CFG, comentar('dos', '3.3'))
    expect(m.notas.size).toBe(2)
  })
  it('«general:» vale para todos los clientes', async () => {
    const { m, P } = mundo()
    await procesar(P, CFG, comentar('general: tutea siempre'))
    expect([...m.notas.values()][0]).toMatchObject({ alcance: 'general', comentario: 'tutea siempre' })
  })
  it('un hilo que no es de una pieza se ignora sin escribir nada', async () => {
    const { m, P } = mundo()
    const r = await procesar(P, CFG, { ...comentar('hola'), hilo_ts: '9.9' })
    expect(r.cuerpo).toMatchObject({ ok: true, ignorado: 'el hilo no es de una pieza' })
    expect(m.notas.size).toBe(0)
  })
  it('si la nota del comentario no se guarda se dice', async () => {
    const { m, P } = mundo()
    m.fallaNota = true
    const r = await procesar(P, CFG, comentar('hola'))
    expect(r.status).toBe(500)
    expect(r.aviso).toContain('No pude guardar')
  })
  it('el reto y lo ignorado responden sin mirar la lista de autorizados', async () => {
    const { P } = mundo()
    expect(await procesar(P, { autorizados: [] }, { tipo: 'reto', challenge: 'abc' })).toMatchObject({ status: 200, cuerpo: { challenge: 'abc' } })
    expect(await procesar(P, { autorizados: [] }, { tipo: 'ignorar', motivo: 'x' })).toMatchObject({ status: 200, cuerpo: { ignorado: 'x' } })
  })
})

// ───────────────────────── adaptadores reales (base falsa + Slack falso)
describe('adaptadores sobre una base y un Slack falsos', () => {
  function entorno() {
    const db = new DbFalsa()
    db.semilla('hitl_queue', [{ id: HITL, client_id: CLIENTE, type: 'content_piece_review', status: 'pending', title: 'Post del lunes', output_id: 'o-1', metadata: { familia: 'post_img', version: '3', slack: { canal: 'C1', ts: '1.1' } } }])
    const llamadas: Array<{ url: string; cuerpo: Record<string, unknown>; cabeceras: Record<string, string> }> = []
    let nTs = 0
    const respuestas: Record<string, Record<string, unknown>> = {}
    const f = (async (url: string, init?: RequestInit) => {
      const cuerpo = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      llamadas.push({ url, cuerpo, cabeceras: (init?.headers ?? {}) as Record<string, string> })
      const metodo = url.split('/').pop()!
      if (url.includes('/api/hitl/')) return new Response('{}', { status: respuestas['hitl']?.status === 500 ? 500 : 200 })
      const r = respuestas[metodo] ?? (metodo === 'conversations.open' ? { ok: true, channel: { id: 'D1' } } : { ok: true, ts: `9.${++nTs}` })
      return new Response(JSON.stringify(r), { status: 200 })
    }) as unknown as typeof fetch
    return { db, llamadas, respuestas, f }
  }
  const env = { baseUrl: 'https://app.test', internalKey: 'llave', slackToken: 'xoxb-1', destino: 'C1' }

  it('lee la pieza de la bandeja con su ts de Slack', async () => {
    const { db, f } = entorno()
    const P = puertosDeNotas(db, env, f)
    expect(await P.pieza(HITL)).toMatchObject({ hitl_id: HITL, client_id: CLIENTE, type: 'content_piece_review', status: 'pending', titulo: 'Post del lunes', familia: 'post_img', version: '3', slack: { canal: 'C1', ts: '1.1' } })
    expect(await P.pieza(OTRO)).toBeNull()
  })
  it('un error de la base al leer se lanza (nunca se lee como vacío)', async () => {
    const { db, f } = entorno()
    db.fallar['hitl_queue'] = 'caída'
    await expect(puertosDeNotas(db, env, f).pieza(HITL)).rejects.toThrow(/caída/)
    await expect(puertosDeNotas(db, env, f).hitlDelHilo('C1', '1.1')).rejects.toThrow(/caída/)
  })
  it('decide por PATCH /api/hitl/[id] con la llave interna y la frase', async () => {
    const { db, llamadas, f } = entorno()
    const r = await puertosDeNotas(db, env, f).decidir(HITL, { status: 'rejected', reviewer: 'slack:U1', frase: 'Muy largo' })
    expect(r).toEqual({ ok: true })
    expect(llamadas[0].url).toBe(`https://app.test/api/hitl/${HITL}`)
    expect(llamadas[0].cabeceras['x-api-key']).toBe('llave')
    expect(llamadas[0].cuerpo).toMatchObject({ status: 'rejected', reviewer: 'slack:U1', frase_del_aprobador: 'Muy largo' })
    const sin = await puertosDeNotas(db, env, f).decidir(HITL, { status: 'approved', reviewer: 'slack:U1', frase: null })
    expect(sin).toEqual({ ok: true })
    expect('frase_del_aprobador' in llamadas[1].cuerpo).toBe(false)
  })
  it('si la ruta responde con error la decisión no se da por hecha', async () => {
    const { db, respuestas, f } = entorno()
    respuestas['hitl'] = { status: 500 }
    expect(await puertosDeNotas(db, env, f).decidir(HITL, { status: 'approved', reviewer: 'x', frase: null })).toMatchObject({ ok: false })
  })
  it('guarda la nota una sola vez por clave y devuelve la misma al repetir', async () => {
    const { db, f } = entorno()
    const P = puertosDeNotas(db, env, f)
    const n: NotaNueva = { client_id: CLIENTE, alcance: 'cliente', tipo: 'rechazada', comentario: 'x', hitl_id: HITL, output_id: null, pieza_titulo: 't', pieza_version: '1', pieza_familia: 'post_img', origen: 'slack', autor: 'U1', clave_unica: 'k1' }
    const a = await P.guardarNota(n), b = await P.guardarNota(n)
    expect(a).toMatchObject({ ok: true, repetida: false })
    expect(b).toMatchObject({ ok: true, repetida: true })
    expect(b.ok && a.ok && b.id === a.id).toBe(true)
    expect(db.tablas['notas_del_dueno']).toHaveLength(1)
    db.fallar['notas_del_dueno'] = 'sin permiso'
    expect(await P.guardarNota({ ...n, clave_unica: 'k2' })).toMatchObject({ ok: false })
  })
  it('encuentra la pieza de un hilo por canal + ts y no confunde otros', async () => {
    const { db, f } = entorno()
    const P = puertosDeNotas(db, env, f)
    expect(await P.hitlDelHilo('C1', '1.1')).toBe(HITL)
    expect(await P.hitlDelHilo('C1', '5.5')).toBeNull()
    expect(await P.hitlDelHilo('C2', '1.1')).toBeNull()
  })
  it('abre el formulario con el id de la pieza dentro y el motivo opcional', async () => {
    const { db, llamadas, f } = entorno()
    expect(await puertosDeNotas(db, env, f).abrirModalDeRechazo('T1', { hitl_id: HITL, canal: 'C1', ts: '1.1', titulo: 'Post' })).toBe(true)
    const v = llamadas[0].cuerpo.view as { callback_id: string; private_metadata: string; blocks: Array<{ block_id?: string; optional?: boolean }> }
    expect(llamadas[0].url).toContain('views.open')
    expect(llamadas[0].cuerpo.trigger_id).toBe('T1')
    expect(v.callback_id).toBe(CALLBACK_DEL_RECHAZO)
    expect(JSON.parse(v.private_metadata)).toEqual({ hitl_id: HITL, canal: 'C1', ts: '1.1' })
    expect(v.blocks.find((b) => b.block_id === BLOQUE_DEL_MOTIVO)?.optional).toBe(true)
  })
  it('sin token de Slack el formulario no se abre y no se llama a la red', async () => {
    const { db, llamadas, f } = entorno()
    expect(await puertosDeNotas(db, { ...env, slackToken: undefined }, f).abrirModalDeRechazo('T1', { hitl_id: HITL, canal: null, ts: null, titulo: 'x' })).toBe(false)
    expect(llamadas).toHaveLength(0)
  })

  it('manda la pieza al canal y guarda canal + ts en la bandeja sin perder el resto del metadata', async () => {
    const { db, llamadas, f } = entorno()
    db.tablas['hitl_queue'][0].metadata = { familia: 'post_img', otro: 'dato' }
    const r = await enviarPiezaASlack(db, env, { hitl_id: HITL, cliente: 'C', titulo: 'Post', texto: 'Hola' }, f)
    expect(r).toMatchObject({ ok: true, canal: 'C1' })
    expect(llamadas.map((l) => l.url.split('/').pop())).toEqual(['chat.postMessage'])
    expect(db.tablas['hitl_queue'][0].metadata).toMatchObject({ familia: 'post_img', otro: 'dato', slack: { canal: 'C1', ts: expect.any(String) } })
  })
  it('NUNCA por mensaje directo: un destino que no sea un canal se rechaza sin llamar a Slack (cada oficina habla con el dueño por su canal)', async () => {
    const { db, llamadas, f } = entorno()
    for (const destino of ['U0AQ3N967SB', 'D0ABCDEF', 'W0ABC', 'canal-sin-id', '#oficina-creativa']) {
      expect(await enviarPiezaASlack(db, { ...env, destino }, { hitl_id: HITL, cliente: 'C', titulo: 'Post' }, f)).toMatchObject({ ok: false, error: expect.stringContaining('destino_no_es_un_canal') })
    }
    expect(llamadas).toHaveLength(0)
    expect(await enviarPiezaASlack(db, { ...env, destino: 'G0PRIVADO1' }, { hitl_id: HITL, cliente: 'C', titulo: 'Post' }, f)).toMatchObject({ ok: true, canal: 'G0PRIVADO1' }) // un canal privado sí
  })
  it('nunca lanza: sin token, sin destino, Slack con error o la base caída al guardar el ts', async () => {
    const { db, respuestas, f } = entorno()
    const p = { hitl_id: HITL, cliente: 'C', titulo: 'Post' }
    expect(await enviarPiezaASlack(db, { ...env, slackToken: undefined }, p, f)).toEqual({ ok: false, error: 'sin_token' })
    expect(await enviarPiezaASlack(db, { ...env, destino: undefined }, p, f)).toEqual({ ok: false, error: 'sin_destino' })
    respuestas['chat.postMessage'] = { ok: false, error: 'channel_not_found' }
    expect(await enviarPiezaASlack(db, env, p, f)).toMatchObject({ ok: false })
    delete respuestas['chat.postMessage']
    db.fallar['hitl_queue'] = 'caída'
    expect(await enviarPiezaASlack(db, env, p, f)).toMatchObject({ ok: false, error: expect.stringContaining('no se pudo guardar su ts') })
  })

  it('lee SOLO las notas «general:» (las del cliente ya no se leen de aquí: viven en el cerebro), de la más nueva a la más vieja', async () => {
    const { db } = entorno()
    const fila = (id: string, client_id: string, alcance: string, creada_en: string, comentario: string) => ({ id, client_id, alcance, tipo: 'comentario', comentario, hitl_id: null, output_id: null, pieza_titulo: null, pieza_version: null, pieza_familia: null, origen: 'slack', autor: 'U1', clave_unica: id, creada_en })
    db.semilla('notas_del_dueno', [
      fila('a', CLIENTE, 'cliente', '2026-10-01T00:00:00Z', 'propia del cliente'), fila('c', 'otro-cliente', 'general', '2026-10-02T00:00:00Z', 'general vieja'),
      fila('d', 'otro-cliente', 'cliente', '2026-10-02T12:00:00Z', 'privada ajena'), fila('e', CLIENTE, 'general', '2026-10-03T00:00:00Z', 'general nueva'),
    ])
    expect((await leerGenerales(db)).map((n) => n.id)).toEqual(['e', 'c'])
    expect((await leerGenerales(db, 1)).map((n) => n.id)).toEqual(['e'])
  })
  it('un error de la base al leer las generales se LANZA (nunca se lee como «no hay»)', async () => {
    const { db } = entorno()
    db.fallar['notas_del_dueno'] = 'caída'
    await expect(leerGenerales(db)).rejects.toThrow(/caída/)
  })
})
