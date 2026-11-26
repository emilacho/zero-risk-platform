/**
 * ENCARGO 17 (24-nov) · «Cómo se produce con IA» nace SIN VIGENCIA: la corrida guarda un borrador con tarjeta en la
 * bandeja; la versión del manual la crea SOLO la aprobación de Emilio (misma ruta `PATCH /api/hitl/[id]` del manual).
 * La prueba que pide el encargo: una sección NO aprobada no llega a ninguna pieza (la mesa lee el manual limpio y
 * el manual no cambió). US$ 0 · base falsa.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DbFalsa } from '../../oficina/__tests__/dbfalsa'
import { guardarBorradorDeLaSeccion, promoverProduccionConIa, TIPO_DE_BANDEJA_DE_LA_SECCION, TIPO_DE_BORRADOR_DE_LA_SECCION } from '../produccion-con-ia-bandeja'
import { renderManualLimpio } from '@/lib/brand-book-render-limpio'

const C = '22222222-2222-4222-8222-222222222222'
const holder: { db: DbFalsa } = { db: new DbFalsa() }
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => holder.db }))

const PROSA = 'El registro es hiperrealista porque el negocio muestra producto de verdad: la luz del mediodía costero sobre la mesa de madera sale de sus fotos reales, y lo que existe (el encebollado, la fachada morada, el esqueleto con su ropa) no se inventa ni se rediseña. '.repeat(2)
const DRAFT = { voice_description: 'Tutea siempre, voz costera.', positioning: 'La cevichería de Olón', reglas_de_escritura: ['tutear en todo imperativo'] }
const vigente = () => ({ id: 'b3', client_id: C, version: 3, human_validated: true, content_text: JSON.stringify({ brand_book_draft: { ...DRAFT } }), provenance_tag: { type: 'evidence', validado_por: 'dueno' }, tagline: 'Donde el mar te espera' })

function armarDb(): DbFalsa {
  const db = new DbFalsa()
  db.semilla('clients', [{ id: C, name: 'Náufrago de Prueba' }])
  db.semilla('client_brand_books', [vigente()])
  holder.db = db
  return db
}
async function conBorrador(): Promise<{ db: DbFalsa; output_id: string; hitl_id: string }> {
  const db = armarDb()
  const r = await guardarBorradorDeLaSeccion(db, { client_id: C, texto: PROSA, version_base: 3, dry_run: false, workflow_id: 'wf-17', workflow_execution_id: 'ex-17' })
  if (!r.ok || !r.output_id || !r.hitl_id) throw new Error(`no se pudo armar el borrador: ${JSON.stringify(r)}`)
  return { db, output_id: r.output_id, hitl_id: r.hitl_id }
}
const parchar = async (id: string, body: Record<string, unknown>) => {
  const { PATCH } = await import('@/app/api/hitl/[id]/route')
  return PATCH(new Request('https://app.test/api/hitl/x', { method: 'PATCH', headers: { 'x-api-key': 'k', 'content-type': 'application/json' }, body: JSON.stringify(body) }), { params: { id } })
}
beforeEach(() => { process.env.INTERNAL_API_KEY = 'k'; delete process.env.BRAIN_PUSH_AL_TERMINAR })
afterEach(() => { delete process.env.INTERNAL_API_KEY })

describe('encargo 17 · la sección nace sin vigencia', () => {
  it('🔴 guardar el borrador NO toca el manual, y la pieza que arma la mesa sigue SIN la sección (una sección no aprobada no llega a ninguna pieza)', async () => {
    const { db, output_id, hitl_id } = await conBorrador()
    // el manual no cambió: sigue UNA versión, la vigente
    expect(db.tablas['client_brand_books']).toHaveLength(1)
    expect(db.tablas['client_brand_books'][0]).toMatchObject({ id: 'b3', version: 3 })
    // lo que la mesa y el generador consumen es el manual limpio del VIGENTE: sin la sección y sin el texto del borrador
    const limpio = renderManualLimpio({ brand_book: db.tablas['client_brand_books'][0], client_name: 'Náufrago de Prueba' })
    expect(limpio.secciones).not.toContain('produccion_con_ia')
    expect(limpio.texto).not.toContain('hiperrealista')
    // el borrador y la tarjeta quedaron, atados entre sí
    const out = db.tablas['client_historical_outputs'].find((f) => String(f.id) === output_id)!
    expect(out).toMatchObject({ output_type: TIPO_DE_BORRADOR_DE_LA_SECCION, status: 'draft', client_id: C })
    const tarjeta = db.tablas['hitl_queue'].find((f) => String(f.id) === hitl_id)!
    expect(tarjeta).toMatchObject({ type: TIPO_DE_BANDEJA_DE_LA_SECCION, status: 'pending', output_id, client_id: C })
    expect(String(tarjeta.output_preview)).toBe(PROSA.trim()) // Emilio LEE ENTERO lo que aprueba: nada se recorta
  })
  it('🔴 (CC6 p7) con un texto de MÁS de 1500 caracteres, la tarjeta lleva el texto ENTERO: ningún recorte en la vista previa', async () => {
    const db = armarDb()
    const LARGA = `${PROSA} `.repeat(5).trim()
    expect(LARGA.length).toBeGreaterThan(1500)
    const r = await guardarBorradorDeLaSeccion(db, { client_id: C, texto: LARGA, version_base: 3, dry_run: false })
    if (!r.ok || !r.hitl_id) throw new Error(`no se guardó el borrador largo: ${JSON.stringify(r)}`)
    const tarjeta = db.tablas['hitl_queue'].find((f) => String(f.id) === r.hitl_id)!
    expect(String(tarjeta.output_preview)).toBe(LARGA)
    expect(String(tarjeta.output_preview).length).toBeGreaterThan(1500)
  })
  it('🔴 (CC6 p18) la puerta `escribir` de la ruta guarda borrador y tarjeta, y NO escribe ninguna versión del manual', async () => {
    const db = armarDb()
    const { POST } = await import('@/app/api/manual/produccion-con-ia/route')
    const res = await POST(new Request('https://app.test/api/manual/produccion-con-ia', {
      method: 'POST', headers: { 'x-api-key': 'k', 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: C, accion: 'escribir', dry_run: false, texto: PROSA, version_base: 3, workflow_id: 'wf-17', workflow_execution_id: 'ex-17' }),
    }))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j).toMatchObject({ ok: true, dry_run: false, sin_vigencia: true })
    // la promesa central del encargo: por la puerta `escribir` NINGUNA versión del manual nace
    expect(db.tablas['client_brand_books']).toHaveLength(1)
    expect(db.tablas['client_brand_books'][0]).toMatchObject({ id: 'b3', version: 3 })
    expect(db.tablas['client_historical_outputs'].find((f) => String(f.id) === String(j.output_id))).toMatchObject({ output_type: TIPO_DE_BORRADOR_DE_LA_SECCION, status: 'draft', client_id: C })
    expect(db.tablas['hitl_queue'].find((f) => String(f.id) === String(j.hitl_id))).toMatchObject({ type: TIPO_DE_BANDEJA_DE_LA_SECCION, status: 'pending', client_id: C })
  })
  it('en seco valida todo y no guarda nada', async () => {
    const db = armarDb()
    const r = await guardarBorradorDeLaSeccion(db, { client_id: C, texto: PROSA, version_base: 3, dry_run: true })
    expect(r).toMatchObject({ ok: true, dry_run: true, output_id: null, hitl_id: null, sin_vigencia: true })
    expect(db.tablas['client_historical_outputs'] ?? []).toHaveLength(0)
    expect(db.tablas['hitl_queue'] ?? []).toHaveLength(0)
  })
  it('el validador es el escritor certificado en seco: texto corto y versión vieja se rechazan con su porqué, sin guardar nada', async () => {
    const db = armarDb()
    expect(await guardarBorradorDeLaSeccion(db, { client_id: C, texto: 'corta', version_base: 3, dry_run: false })).toMatchObject({ ok: false, status: 400, error: 'texto_invalido' })
    expect(await guardarBorradorDeLaSeccion(db, { client_id: C, texto: PROSA, version_base: 2, dry_run: false })).toMatchObject({ ok: false, status: 409, error: 'version_vigente_cambio' })
    expect(db.tablas['client_historical_outputs'] ?? []).toHaveLength(0)
  })
  it('🔴 APROBAR la tarjeta escribe la versión por el escritor certificado: copia del vigente + la sección, y el borrador queda `approved`', async () => {
    const { db, output_id, hitl_id } = await conBorrador()
    const res = await parchar(hitl_id, { status: 'approved', reviewer: 'emilio' })
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.promocion).toMatchObject({ ok: true, version: 4, solo_cambia: 'produccion_con_ia', aprobado_por: 'emilio' })
    const filas = db.tablas['client_brand_books']
    expect(filas).toHaveLength(2)
    const nueva = filas.find((f) => Number(f.version) === 4)!
    const json = JSON.parse(String(nueva.content_text)) as { brand_book_draft: Record<string, unknown> }
    expect(json.brand_book_draft.produccion_con_ia).toBe(PROSA.trim())
    expect(json.brand_book_draft.voice_description).toBe(DRAFT.voice_description) // lo demás viaja tal cual
    expect(nueva).toMatchObject({ human_validated: true, tagline: 'Donde el mar te espera' })
    expect(db.tablas['client_historical_outputs'].find((f) => String(f.id) === output_id)).toMatchObject({ status: 'approved' })
  })
  it('aprobar dos veces no inserta dos versiones', async () => {
    const { db, hitl_id } = await conBorrador()
    await parchar(hitl_id, { status: 'approved', reviewer: 'emilio' })
    const res2 = await parchar(hitl_id, { status: 'approved', reviewer: 'emilio' })
    const j2 = await res2.json()
    expect(j2.promocion).toMatchObject({ ok: true, ya_promovido: true })
    expect(db.tablas['client_brand_books']).toHaveLength(2)
  })
  it('si la vigente cambió entre el borrador y la aprobación, nada se pisa: se declara y el borrador queda', async () => {
    const { db, output_id, hitl_id } = await conBorrador()
    db.tablas['client_brand_books'].push({ ...vigente(), id: 'b4', version: 4 }) // otra versión entró mientras tanto
    const res = await parchar(hitl_id, { status: 'approved', reviewer: 'emilio' })
    expect(res.status).toBe(207)
    const j = await res.json()
    expect(j.promocion).toMatchObject({ ok: false, error: 'version_vigente_cambio' })
    expect(db.tablas['client_brand_books']).toHaveLength(2) // solo b3 y b4: ninguna versión nueva
    expect(db.tablas['client_historical_outputs'].find((f) => String(f.id) === output_id)).toMatchObject({ status: 'draft' })
  })
  it('RECHAZAR deja la nota en el borrador y el manual no se toca', async () => {
    const { db, output_id, hitl_id } = await conBorrador()
    const res = await parchar(hitl_id, { status: 'rejected', reviewer: 'emilio', frase_del_aprobador: 'sigue sin cubrir Guayaquil' })
    expect(res.status).toBe(200)
    const out = db.tablas['client_historical_outputs'].find((f) => String(f.id) === output_id)!
    expect(out.status).toBe('rejected')
    expect((out.provenance_tag as Record<string, unknown>).nota_de_rechazo).toBe('sigue sin cubrir Guayaquil')
    expect(db.tablas['client_brand_books']).toHaveLength(1)
  })
  it('promover con un id que no es de esta clase de borrador → borrador_inexistente (la rama no toca tarjetas ajenas)', async () => {
    const db = armarDb()
    db.semilla('client_historical_outputs', [{ id: 'otro', client_id: C, output_type: 'brand_book_draft_revision', status: 'draft', content: '{}' }])
    expect(await promoverProduccionConIa(db, { output_id: 'otro', client_id: C, aprobador: 'emilio' })).toMatchObject({ ok: false, status: 404, error: 'borrador_inexistente' })
  })
})
