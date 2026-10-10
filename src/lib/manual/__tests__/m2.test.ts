/**
 * M2 · rutas, puerta con dry_run, borrador en `client_historical_outputs`, bandeja, promoción y aviso de provisionales en los lectores.
 * Base FALSA, cliente SINTÉTICO de otro rubro, cero llamadas reales. Lo que se verifica de verdad: que dry_run no escribe NADA, que ninguna ruta pura llama a un modelo,
 * y que LO QUITADO SIN FUENTE no llega a la tarjeta de Emilio.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DbFalsa } from '../../oficina/__tests__/dbfalsa'
import { avisoDeProvisionales, camposDelManual } from '../lectura'
import { autorizar, rutaBorrador, rutaOpinion, rutaRecomprobar, rutaRevisar, validarCuerpo } from '../rutas'
import { TIPO_DE_BANDEJA, TIPO_DE_BORRADOR } from '../borrador'
import { guardarNotaDeRechazo, promoverManualRevisado } from '../promover'
import { filaInstagram, filaSitio, PROPIOS } from './apoyo'

const C = '11111111-1111-4111-8111-111111111111'
const OTRO = '22222222-2222-4222-8222-222222222222'
const MANUAL = {
  positioning: 'Una clínica cálida y cercana. Somos los mejores del barrio.',
  voice_description: 'Voz cálida y juguetona. Tutea siempre.',
  mision: 'Cuidar sonrisas, con trazabilidad verificable de cada material.',
  tagline: null,
}
const WF = { workflow_id: 'wf-1', workflow_execution_id: 'ex-1' }

function base(): DbFalsa {
  const db = new DbFalsa()
  db.semilla('clients', [{ id: C, name: 'Clínica Ejemplo', website_url: PROPIOS.sitio, country: 'EC', config: { apify: { own_handles: { instagram: 'clinicaejemplo' } } } }])
  db.semilla('client_brand_books', [{ id: 'b2', client_id: C, version: 2, human_validated: false, created_at: '2026-09-29T00:00:00Z', primary_colors: ['#112233'], typography: { h: 'Serif' }, content_text: JSON.stringify({ brand_book_draft: MANUAL }) }])
  const filas = [
    filaSitio('s1', [{ url: 'https://www.clinicaejemplo.test/', title: 'Clínica Ejemplo · Sonríe sin miedo, siempre contigo', text: 'Hacemos implantes certificados con cita previa. Atendemos todos los días. Somos los mejores del barrio.' }]),
    filaInstagram('i1', 'clinicaejemplo', 'Sonríe sin miedo,\nsiempre contigo!\n📍 Ciudad Ejemplo'),
    filaInstagram('c1', 'competidor', 'Somos los únicos con trazabilidad verificable de cada material'),
  ]
  db.semilla('apify_raw', [...filas.map((f) => ({ ...f, client_id: C, ensayo: false, created_at: '2026-09-29' })), { ...filaInstagram('e1', 'clinicaejemplo', 'TEXTO SINTÉTICO de ensayo'), client_id: C, ensayo: true, created_at: '2026-09-30' }])
  db.semilla('client_icp_documents', [{ id: 'icp1', client_id: C, audience_segment: 'familias', objections: '["No sé si la trazabilidad verificable de cada material es real o es marketing"]' }])
  return db
}
const nada = (db: DbFalsa) => ['client_historical_outputs', 'hitl_queue'].every((t) => !(db.tablas[t]?.length))
const req = (h: Record<string, string>) => new Request('https://app.test/api/manual/x', { method: 'POST', headers: h })

beforeEach(() => { process.env.INTERNAL_API_KEY = 'k-interna'; process.env.SALA_DISPATCH_KEY = 'k-despacho' })
afterEach(() => { delete process.env.INTERNAL_API_KEY; delete process.env.SALA_DISPATCH_KEY })

describe('M2 · las guardas de la puerta (antes de leer o escribir)', () => {
  it('sin llave interna ⇒ 401; con la interna pero sin la de despacho en una ruta del ciclo ⇒ 401; ambas ⇒ pasa', () => {
    expect(autorizar(req({}), false)!.status).toBe(401)
    expect(autorizar(req({ 'x-api-key': 'mala' }), false)!.status).toBe(401)
    expect(autorizar(req({ 'x-api-key': 'k-interna' }), false)).toBeNull() // ruta pura: basta la interna
    expect(autorizar(req({ 'x-api-key': 'k-interna' }), true)!.status).toBe(401)
    expect(autorizar(req({ 'x-api-key': 'k-interna', 'x-sala-dispatch-key': 'otra' }), true)!.status).toBe(401)
    expect(autorizar(req({ 'x-api-key': 'k-interna', 'x-sala-dispatch-key': 'k-despacho' }), true)).toBeNull()
  })
  it('sin SALA_DISPATCH_KEY configurada, las rutas del ciclo quedan CERRADAS (503)', () => {
    delete process.env.SALA_DISPATCH_KEY
    expect(autorizar(req({ 'x-api-key': 'k-interna', 'x-sala-dispatch-key': 'x' }), true)!.status).toBe(503)
  })
  it('`dry_run` es obligatorio y booleano (400); con false exige workflow_id y workflow_execution_id (403); el cliente debe ser uuid (400)', () => {
    expect((validarCuerpo({ client_id: C }, { exigeDryRun: true }) as { status: number }).status).toBe(400)
    expect((validarCuerpo({ client_id: C, dry_run: 'true' }, { exigeDryRun: true }) as { status: number }).status).toBe(400)
    expect((validarCuerpo({ client_id: C, dry_run: false }, { exigeDryRun: true }) as { status: number }).status).toBe(403)
    expect((validarCuerpo({ client_id: C, dry_run: false, workflow_id: 'w' }, { exigeDryRun: true }) as { status: number }).status).toBe(403)
    expect((validarCuerpo({ client_id: 'no', dry_run: true }, { exigeDryRun: true }) as { status: number }).status).toBe(400)
    expect(validarCuerpo({ client_id: C, dry_run: false, ...WF }, { exigeDryRun: true })).toMatchObject({ dry_run: false, workflow_id: 'wf-1' })
    expect(validarCuerpo({ client_id: C, dry_run: true }, { exigeDryRun: true })).toMatchObject({ dry_run: true })
  })
  it('las rutas con dry_run obligatorio rechazan SIN LEER la base si falta (la base ni se toca)', async () => {
    const db = base(); const spy = vi.spyOn(db, 'from')
    for (const f of [rutaRevisar, rutaBorrador]) expect((await f(db, { client_id: C })).status).toBe(400)
    expect((await rutaOpinion(db, { client_id: C }, {})).status).toBe(400)
    expect((await rutaRevisar(db, { client_id: C, dry_run: false })).status).toBe(403)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('M2 · /revisar (S0/S1/S3) y las rutas puras: US$ 0, sin modelo, sin escribir', () => {
  it('prepara la revisión con lo ya raspado: eslogan, hechos sin cita y evidencia FILTRADA para el juez; no escribe nada', async () => {
    const db = base()
    const r = await rutaRevisar(db, { client_id: C, dry_run: true })
    expect(r.status).toBe(200)
    const b = r.body as Record<string, any>
    expect(b.modelos_llamados).toBe(0)
    expect(b.foto).toMatchObject({ version: 2 }); expect(b.foto.huella).toMatch(/^[0-9a-f]{16}$/)
    expect(b.frases.eslogan.literal).toBe('Sonríe sin miedo, siempre contigo!')
    expect(b.informe.hechos.some((h: any) => h.clausula.includes('trazabilidad') && h.estado !== 'verificado')).toBe(true)
    expect(b.sin_hallazgos).toBe(false)
    // el juez ve SOLO fuente cruda propia/humana: ni el documento de perfil de cliente ideal, ni el competidor, ni el ensayo
    expect(b.evidencia_del_juez.texto).not.toMatch(/marketing|únicos|TEXTO SINTÉTICO|objeciones/i)
    expect(b.evidencia_del_juez.excluidas.map((x: any) => x.tipo)).toEqual(expect.arrayContaining(['sintesis', 'tercero']))
    expect(nada(db)).toBe(true)
  })
  it('con dry_run=false y workflow tampoco llama a ningún modelo ni escribe (la puerta solo prepara)', async () => {
    const db = base()
    const r = await rutaRevisar(db, { client_id: C, dry_run: false, ...WF })
    expect(r.status).toBe(200); expect((r.body as any).modelos_llamados).toBe(0); expect(nada(db)).toBe(true)
  })
  it('un error de lectura se DICE (502); nunca se lee como «sin datos»', async () => {
    const db = base(); db.fallar['apify_raw'] = 'boom'
    const r = await rutaRevisar(db, { client_id: C, dry_run: true })
    expect(r.status).toBe(502); expect(r.body.error).toBe('lectura_fallida')
  })
  it('cliente inexistente 404; cliente sin manual 409 (la revisión corrige el que existe)', async () => {
    expect((await rutaRevisar(base(), { client_id: OTRO, dry_run: true })).status).toBe(404)
    const sin = new DbFalsa().semilla('clients', [{ id: C, name: 'X', config: {} }])
    expect(await rutaRevisar(sin, { client_id: C, dry_run: true })).toMatchObject({ status: 409, body: { error: 'sin_manual' } })
  })
  it('un manual vigente cuyo contenido no se puede leer (409), no se adivina', async () => {
    const db = new DbFalsa().semilla('clients', [{ id: C, name: 'X', config: {} }]).semilla('client_brand_books', [{ id: 'b', client_id: C, version: 1, content_text: 'no es json' }])
    expect(await rutaRevisar(db, { client_id: C, dry_run: true })).toMatchObject({ status: 409, body: { error: 'manual_ilegible' } })
  })
  it('recomprobar es pura y exige cliente válido y `despues`', async () => {
    const db = base()
    expect((await rutaRecomprobar(db, { client_id: C })).status).toBe(400) // falta `despues`
    expect(nada(db)).toBe(true)
  })
})

describe('M2 · S5/S7 · lo que el autor devuelve pasa por la puerta (registro interno, no bandeja)', () => {
  it('lo que no tiene cita SALE, queda en `retirados`, el eslogan lo escribe el código y el autor no puede reintroducirlo', async () => {
    const db = base()
    const despues = { ...MANUAL, positioning: 'Una clínica cálida y cercana, con garantía total de resultados.' }
    const r = await rutaRecomprobar(db, { client_id: C, despues })
    expect(r.status).toBe(200)
    const b = r.body as Record<string, any>
    expect(b.manual.mision).toBe('Cuidar sonrisas.')
    expect(b.manual.positioning).not.toMatch(/garant/)
    expect(b.manual.tagline).toBe('Sonríe sin miedo, siempre contigo!')
    expect(b.retirados.map((x: any) => x.clausula).join('|')).toMatch(/trazabilidad/)
    expect(JSON.stringify(b.manual)).not.toContain('PENDIENTE')
    expect(b.limpio).toBe(false)
    expect(b.manual._field_meta).toBeDefined()
  })
})

describe('M2 · /opinion (S6) · una sola pregunta, ciego, 3 reintentos', () => {
  it('dry_run: arma el pedido y NO llama (0 llamadas, US$ 0)', async () => {
    const f = vi.fn()
    const r = await rutaOpinion(base(), { client_id: C, dry_run: true }, { f: f as never, openaiKey: 'sk', modelo: 'm' })
    expect(r.body).toMatchObject({ simulado: true, llamadas: 0, costo_usd: 0 }); expect(f).not.toHaveBeenCalled()
  })
  it('real: manda UNA pregunta con los 4 huecos llenos y el manual + material crudo; no manda hallazgos, estados ni la palabra PENDIENTE (ciego); rotula la respuesta como opinión', async () => {
    let enviado = ''
    const f = (async (_u: string, init: RequestInit) => { enviado = String(JSON.parse(String(init.body)).input[0].content[0].text); return new Response(JSON.stringify({ output_text: 'Opinión libre.', usage: { input_tokens: 1000, output_tokens: 100 } }), { status: 200 }) }) as unknown as typeof fetch
    const r = await rutaOpinion(base(), { client_id: C, dry_run: false, ...WF }, { f, openaiKey: 'sk', modelo: 'm', precioEntrada: 2, precioSalida: 10 })
    expect(r.body).toMatchObject({ ok: true, opinion: 'Opinión libre.', supero_el_tope: false })
    expect(enviado).toContain('Te comparto el manual de marca de un negocio, que se usa para guiar todo lo que se produzca')
    expect(enviado).toContain('Voz cálida y juguetona') // el manual
    expect(enviado).toContain('Sonríe sin miedo') // el material crudo propio
    expect(enviado).not.toMatch(/sin_cita|solo_sintesis|PENDIENTE|hallazgo|puntaje|fidelidad|únicos con trazabilidad|TEXTO SINTÉTICO/)
  })
  it('si GPT falla (401), no revienta: `sin_segunda_mirada` y el costo de los intentos', async () => {
    const f = (async () => new Response(JSON.stringify({ error: { message: 'mala llave' } }), { status: 401 })) as unknown as typeof fetch
    const r = await rutaOpinion(base(), { client_id: C, dry_run: false, ...WF }, { f, openaiKey: 'sk', modelo: 'm', esperar: async () => {} })
    expect(r.status).toBe(200); expect(r.body).toMatchObject({ ok: false, sin_segunda_mirada: true })
  })
})

describe('M2 · el borrador y la bandeja (S8) · LO QUITADO SIN FUENTE NO VA A EMILIO', () => {
  const cuerpo = { client_id: C, manual: MANUAL, costo_usd: 0.42, opinion: { ok: true, texto: 'GPT dice algo.' }, respuesta_del_autor: [{ punto: 'p1', decision: 'tomada', razon: 'porque sí' }] }
  it('dry_run: devuelve la tarjeta y NO escribe', async () => {
    const db = base()
    const r = await rutaBorrador(db, { ...cuerpo, dry_run: true })
    expect(r.status).toBe(200); expect(r.body).toMatchObject({ simulado: true, output_id: null, hitl_id: null, sin_cambios: false })
    expect(nada(db)).toBe(true)
  })
  it('real: borrador `draft` fuera de `client_brand_books` + tarjeta pendiente atada al borrador; el manual vigente no se toca', async () => {
    const db = base()
    const antes = JSON.stringify(db.tablas['client_brand_books'])
    const r = await rutaBorrador(db, { ...cuerpo, dry_run: false, ...WF })
    expect(r.status).toBe(200)
    const out = db.tablas['client_historical_outputs'][0]
    expect(out).toMatchObject({ client_id: C, output_type: TIPO_DE_BORRADOR, status: 'draft' })
    const hitl = db.tablas['hitl_queue'][0]
    expect(hitl).toMatchObject({ type: TIPO_DE_BANDEJA, status: 'pending', output_id: out.id, client_id: C })
    expect(new Date(String(hitl.expires_at)).getTime()).toBeGreaterThan(Date.now())
    expect(JSON.stringify(db.tablas['client_brand_books'])).toBe(antes) // ninguna fila del manual se edita ni se agrega
    expect((out.provenance_tag as any)).toMatchObject({ workflow_id: 'wf-1', workflow_execution_id: 'ex-1', version_base: 2 })
  })
  it('lo retirado queda SOLO en el registro interno del borrador; la tarjeta (título, vista previa, metadata) no lo trae, ni siquiera como «texto anterior»', async () => {
    const db = base()
    await rutaBorrador(db, { ...cuerpo, dry_run: false, ...WF })
    const out = db.tablas['client_historical_outputs'][0]
    expect(JSON.stringify((out.provenance_tag as any).registro_interno.retirados)).toMatch(/trazabilidad/)
    const hitl = JSON.stringify(db.tablas['hitl_queue'][0])
    expect(hitl).not.toMatch(/trazabilidad|verificable|retirad|registro_interno/i)
    const meta = db.tablas['hitl_queue'][0].metadata as any
    expect(meta.diferencias.every((d: any) => !('antes' in d))).toBe(true)
    // lo que sí lleva: opinión rotulada, respuesta del autor, costo, versión, hechos con su cita
    expect(meta).toMatchObject({ version_nueva: 3, version_vigente: 2, costo_usd: 0.42 })
    expect(meta.opinion_de_gpt.rotulo).toMatch(/no es un dato confirmado/)
    expect(meta.respuesta_del_autor[0]).toMatchObject({ decision: 'tomada' })
    expect(meta.hechos.some((h: any) => h.estado === 'afirmacion_del_cliente' && h.cita_literal)).toBe(true)
  })
  it('si GPT falló, la tarjeta sale «SIN SEGUNDA MIRADA»', async () => {
    const db = base()
    await rutaBorrador(db, { ...cuerpo, opinion: { ok: false, error: 'caído' }, dry_run: false, ...WF })
    expect(String(db.tablas['hitl_queue'][0].title)).toMatch(/SIN SEGUNDA MIRADA/)
    expect((db.tablas['hitl_queue'][0].metadata as any).sin_segunda_mirada).toBe(true)
  })
  it('sin cambios frente a lo vigente ⇒ no hay nada que firmar: ni borrador ni tarjeta', async () => {
    const db = new DbFalsa().semilla('clients', [{ id: C, name: 'X', config: {} }]).semilla('client_brand_books', [{ id: 'b', client_id: C, version: 1, content_text: JSON.stringify({ brand_book_draft: { voice_description: 'Voz cálida.', tagline: 'Ya está' } }) }])
    const r = await rutaBorrador(db, { client_id: C, manual: { voice_description: 'Voz cálida.', tagline: 'Ya está' }, dry_run: false, ...WF })
    expect(r.body).toMatchObject({ sin_cambios: true, output_id: null }); expect(nada(db)).toBe(true)
  })
  it('si la tarjeta falla después del borrador, se DICE y se informa el borrador escrito (no se esconde)', async () => {
    const db = base(); db.fallar['hitl_queue'] = 'sin permiso'
    const r = await rutaBorrador(db, { ...cuerpo, dry_run: false, ...WF })
    expect(r.status).toBe(502); expect(String(r.body.error)).toMatch(/bandeja: sin permiso/)
  })
})

describe('M2 · la promoción (aprobar) y la nota (rechazar)', () => {
  async function conBorrador() {
    const db = base()
    await rutaBorrador(db, { client_id: C, manual: MANUAL, costo_usd: 0, dry_run: false, ...WF })
    return { db, output_id: String(db.tablas['client_historical_outputs'][0].id) }
  }
  it('aprobar inserta la versión max+1 VIGENTE y firmada; la anterior queda intacta; hereda visuales; empuja al cerebro', async () => {
    const { db, output_id } = await conBorrador()
    const anterior = JSON.stringify(db.tablas['client_brand_books'][0])
    const empujar = vi.fn(() => ({ estado: 'agendado' }) as never)
    const r = await promoverManualRevisado(db, { output_id, client_id: C, aprobador: 'emilio', frase_del_aprobador: 'dale', empujar })
    expect(r).toMatchObject({ ok: true, version: 3, previous_id: 'b2' })
    const filas = db.tablas['client_brand_books']
    expect(filas).toHaveLength(2); expect(JSON.stringify(filas[0])).toBe(anterior)
    expect(filas[1]).toMatchObject({ client_id: C, version: 3, human_validated: true, auto_generated_from: 'revision_del_manual', tagline: 'Sonríe sin miedo, siempre contigo!', primary_colors: ['#112233'], typography: { h: 'Serif' } })
    expect(filas[1].provenance_tag).toMatchObject({ type: 'evidence', trust_level: 'tenant_trusted' })
    expect(String(filas[1].content_text)).not.toMatch(/trazabilidad verificable/)
    expect(empujar).toHaveBeenCalledWith({ client_id: C, source_id: String(filas[1].id) })
    expect(db.tablas['client_historical_outputs'][0]).toMatchObject({ status: 'approved' })
  })
  it('es idempotente: aprobar dos veces no inserta otra versión', async () => {
    const { db, output_id } = await conBorrador()
    const empujar = vi.fn(() => ({ estado: 'agendado' }) as never)
    await promoverManualRevisado(db, { output_id, client_id: C, aprobador: 'emilio', empujar })
    expect(await promoverManualRevisado(db, { output_id, client_id: C, aprobador: 'emilio', empujar })).toMatchObject({ ok: true, ya_promovido: true })
    expect(db.tablas['client_brand_books']).toHaveLength(2); expect(empujar).toHaveBeenCalledTimes(1)
  })
  it('si entró otra versión mientras tanto, NO se pisa: se dice y el borrador queda', async () => {
    const { db, output_id } = await conBorrador()
    db.semilla('client_brand_books', [{ id: 'b3', client_id: C, version: 3, content_text: '{}' }])
    const r = await promoverManualRevisado(db, { output_id, client_id: C, aprobador: 'emilio', empujar: vi.fn() as never })
    expect(r).toMatchObject({ ok: false, error: 'version_vigente_cambio' })
    expect(db.tablas['client_brand_books']).toHaveLength(2); expect(db.tablas['client_historical_outputs'][0].status).toBe('draft')
  })
  it('un borrador de otro cliente o inexistente no se promueve', async () => {
    const { db, output_id } = await conBorrador()
    expect(await promoverManualRevisado(db, { output_id, client_id: OTRO, aprobador: 'e' })).toMatchObject({ ok: false, error: 'borrador_inexistente' })
    expect(await promoverManualRevisado(db, { output_id: 'nada', client_id: C, aprobador: 'e' })).toMatchObject({ ok: false, error: 'borrador_inexistente' })
  })
  it('rechazar guarda la nota en el borrador, no agrega versión y no edita ningún manual', async () => {
    const { db, output_id } = await conBorrador()
    expect(await guardarNotaDeRechazo(db, { output_id, client_id: C, nota: 'falta la voz', rechazado_por: 'emilio' })).toEqual({ ok: true })
    expect(db.tablas['client_historical_outputs'][0]).toMatchObject({ status: 'rejected' })
    expect((db.tablas['client_historical_outputs'][0].provenance_tag as any).nota_de_rechazo).toBe('falta la voz')
    expect(db.tablas['client_brand_books']).toHaveLength(1)
  })
})

describe('M2 · R6 en los lectores · provisional viaja', () => {
  const texto = (draft: unknown) => JSON.stringify({ brand_book_draft: draft })
  it('un campo provisional aparece en el aviso; un manual anterior al ciclo (sin `_field_meta`) no genera aviso; lo ilegible tampoco', () => {
    const conMeta = { positioning: 'a', voice_description: 'b', _field_meta: { positioning: { estado: 'con_pendientes', provisional: true }, voice_description: { estado: 'sin_hechos', provisional: false } } }
    expect(camposDelManual(texto(conMeta))).toEqual({ firmes: ['voice_description'], provisionales: ['positioning'], sin_revisar: [] })
    expect(avisoDeProvisionales(texto(conMeta))).toMatch(/provisionales.*positioning/)
    expect(avisoDeProvisionales(texto({ positioning: 'a' }))).toBe('')
    expect(avisoDeProvisionales('no es json')).toBe('')
    expect(avisoDeProvisionales(null)).toBe('')
  })
})
