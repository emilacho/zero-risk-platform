/** M2 · el PATCH de la bandeja: aprobar la tarjeta `manual_de_marca_review` PROMUEVE; rechazar guarda la nota; cualquier otro tipo queda como siempre. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DbFalsa } from '../../oficina/__tests__/dbfalsa'
import { rutaBorrador } from '../rutas'
import { filaInstagram, filaSitio, PROPIOS } from './apoyo'

const C = '11111111-1111-4111-8111-111111111111'
const holder: { db: DbFalsa } = { db: new DbFalsa() }
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => holder.db }))

const MANUAL = { positioning: 'Una clínica cálida y cercana. Somos los mejores del barrio.', mision: 'Cuidar sonrisas, con trazabilidad verificable de cada material.', tagline: null }
async function armar(): Promise<{ hitl_id: string; output_id: string }> {
  const db = new DbFalsa()
  db.semilla('clients', [{ id: C, name: 'Clínica Ejemplo', website_url: PROPIOS.sitio, config: { apify: { own_handles: { instagram: 'clinicaejemplo' } } } }])
  db.semilla('client_brand_books', [{ id: 'b1', client_id: C, version: 1, content_text: JSON.stringify({ brand_book_draft: MANUAL }) }])
  db.semilla('apify_raw', [
    filaSitio('s1', [{ url: 'https://www.clinicaejemplo.test/', title: 'Clínica Ejemplo · Sonríe sin miedo, siempre contigo', text: 'Somos los mejores del barrio.' }]),
    filaInstagram('i1', 'clinicaejemplo', 'Sonríe sin miedo,\nsiempre contigo!'),
  ].map((f) => ({ ...f, client_id: C, ensayo: false })))
  holder.db = db
  const r = await rutaBorrador(db, { client_id: C, manual: MANUAL, costo_usd: 0, dry_run: false, workflow_id: 'w', workflow_execution_id: 'e' })
  return { hitl_id: String(r.body.hitl_id), output_id: String(r.body.output_id) }
}
const parchar = async (id: string, body: Record<string, unknown>) => {
  const { PATCH } = await import('@/app/api/hitl/[id]/route')
  return PATCH(new Request('https://app.test/api/hitl/x', { method: 'PATCH', headers: { 'x-api-key': 'k', 'content-type': 'application/json' }, body: JSON.stringify(body) }), { params: { id } })
}
beforeEach(() => { process.env.INTERNAL_API_KEY = 'k'; delete process.env.BRAIN_PUSH_AL_TERMINAR })
afterEach(() => { delete process.env.INTERNAL_API_KEY })

describe('M2 · la bandeja promueve el manual revisado', () => {
  it('aprobar ⇒ versión nueva vigente y firmada, el recibo la dice, y la anterior queda', async () => {
    const { hitl_id } = await armar()
    const res = await parchar(hitl_id, { status: 'approved', reviewer: 'emilio' })
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.promocion).toMatchObject({ ok: true, version: 2, previous_id: 'b1' })
    const filas = holder.db.tablas['client_brand_books']
    expect(filas).toHaveLength(2); expect(filas[1]).toMatchObject({ version: 2, human_validated: true })
    expect(filas[0]).toMatchObject({ id: 'b1', version: 1 })
  })
  it('aprobar dos veces no inserta dos versiones', async () => {
    const { hitl_id } = await armar()
    await parchar(hitl_id, { status: 'approved', reviewer: 'emilio' })
    const otra = await (await parchar(hitl_id, { status: 'approved', reviewer: 'emilio' })).json()
    expect(otra.promocion).toMatchObject({ ok: true, ya_promovido: true })
    expect(holder.db.tablas['client_brand_books']).toHaveLength(2)
  })
  it('si la promoción falla (la vigente cambió) responde 207 y lo dice; la decisión de la bandeja queda registrada', async () => {
    const { hitl_id } = await armar()
    holder.db.semilla('client_brand_books', [{ id: 'b9', client_id: C, version: 2, content_text: '{}' }])
    const res = await parchar(hitl_id, { status: 'approved', reviewer: 'emilio' })
    expect(res.status).toBe(207)
    expect((await res.json()).promocion).toMatchObject({ ok: false, error: 'version_vigente_cambio' })
    expect(holder.db.tablas['hitl_queue'][0].status).toBe('approved')
  })
  it('rechazar ⇒ nota en el borrador y NINGUNA versión nueva', async () => {
    const { hitl_id } = await armar()
    const res = await parchar(hitl_id, { status: 'rejected', reviewer: 'emilio', frase_del_aprobador: 'falta la voz' })
    expect(res.status).toBe(200); const j = await res.json(); expect(j.nota_de_rechazo).toEqual({ ok: true })
    expect(holder.db.tablas['client_brand_books']).toHaveLength(1)
    expect((holder.db.tablas['client_historical_outputs'][0].provenance_tag as { nota_de_rechazo: string }).nota_de_rechazo).toBe('falta la voz')
  })
  it('otro tipo de tarjeta no dispara nada de esto (la ruta responde como siempre)', async () => {
    holder.db = new DbFalsa().semilla('hitl_queue', [{ id: 'h1', type: 'content_piece_review', status: 'pending', client_id: C, output_id: 'o1', metadata: {} }])
    const j = await (await parchar('h1', { status: 'approved', reviewer: 'emilio' })).json()
    expect(j.promocion).toBeUndefined(); expect(j.item.status).toBe('approved')
  })
})
