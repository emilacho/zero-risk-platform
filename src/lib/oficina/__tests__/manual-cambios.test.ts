/** 02-nov · «Pedir cambios al manual»: la puerta, lo que libera un pedido y la migración. */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ACCIONES } from '../tablero/acciones'
import { CAMINO_MANUAL_CAMBIOS, TOPE_PEDIDO_AL_MANUAL_USD } from '../tablero/manual-cambios'
import { camposDelDueno, camposQueLibera, leerPedidoDelManual } from '../../manual/pedido-de-cambios'
import { conservarLoDelDueno } from '../../manual/edicion-del-dueno'
import { DbFalsa } from './dbfalsa'

const C = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const AHORA = new Date('2026-11-02T10:00:00Z')
const llamar = (db: DbFalsa, cuerpo: Record<string, unknown>) => ACCIONES['manual-cambios']({ db, puertos: () => ({}) as never, ahora: () => AHORA }, { cuerpo, reviewer: 'emilio' })
const BIEN = { client_id: C, texto: 'Hazlo más cercano', confirmo_gasto: true, tope_usd: 5 }
const META = { mision: { fuente: 'dueno', en: '2026-10-01T00:00:00Z' }, voice_description: { aceptado_por_el_dueno: { por: 'e', en: '2026-10-02T00:00:00Z', campo: true } }, proposito: { aceptado_por_el_dueno: { por: 'e', en: 'x' } }, vision: { fuente: 'agente' } }
const base = (o: { pedidos?: Array<Record<string, unknown>> } = {}) => new DbFalsa().semilla('client_brand_books', [
  { id: 'v1', client_id: C, version: 1, content_text: '{}' },
  { id: 'v2', client_id: C, version: 2, content_text: JSON.stringify({ brand_book_draft: { _field_meta: META } }) },
  { id: 'otro', client_id: 'otro', version: 9, content_text: '{}' },
]).semilla('plan_cambios', o.pedidos ?? [])

describe('🔴 la puerta', () => {
  it('guarda el pedido sobre la versión vigente y despierta la reescritura con el sobre', async () => {
    const db = base()
    const s = await llamar(db, { ...BIEN, seccion: 'Cómo habla', campos: ['voice_description'] })
    expect(s.status).toBe(200)
    const fila = db.tablas['plan_cambios'][0]
    expect(fila).toMatchObject({ client_id: C, documento: 'manual', manual_id: 'v2', texto: BIEN.texto, seccion: 'Cómo habla', estado: 'pendiente', tope_usd: 5, pedido_por: 'emilio' })
    expect(fila.plan_id).toBeUndefined()
    expect(s.cuerpo).toMatchObject({ ok: true, manual_cambio_id: fila.id, manual_id: 'v2', campos_liberados: ['voice_description'] })
    expect(s.despertar_flujo).toEqual({ camino: CAMINO_MANUAL_CAMBIOS, registrar: { tabla: 'plan_cambios', id: fila.id }, cuerpo: { client_id: C, manual_base_id: 'v2', cambios_del_dueno: BIEN.texto, manual_cambio_id: fila.id, seccion: 'Cómo habla', campos_validados: ['mision', 'voice_description'], campos_liberados: ['voice_description'], tope_reescritura_usd: 5, force_restart: true, origen: 'tablero/manual-cambios', pedido_por: 'emilio' } })
  })
  it('🔴 acepta la clave corta del panel y libera el campo del borrador', async () => {
    const s = await llamar(base(), { ...BIEN, seccion: 'Cómo habla', campos: ['voz'] })
    expect(s.cuerpo).toMatchObject({ ok: true, campos_liberados: ['voice_description'] })
  })
  it('🔴 el tope que confirma el dueño es el que viaja y queda guardado', async () => {
    const db = base()
    const s = await llamar(db, { ...BIEN, tope_usd: 3 })
    expect((s.despertar_flujo?.cuerpo as Record<string, unknown>).tope_reescritura_usd).toBe(3)
    expect(db.tablas['plan_cambios'][0].tope_usd).toBe(3)
  })
  it('🔴 no hay un segundo pedido abierto: doble clic da 409 y no despierta', async () => {
    for (const estado of ['pendiente', 'en_reescritura']) {
      const db = base({ pedidos: [{ id: 'p1', client_id: C, documento: 'manual', estado, despertado: true }] })
      const s = await llamar(db, BIEN)
      expect(s.status).toBe(409)
      expect(s.despertar_flujo).toBeUndefined()
      expect(db.tablas['plan_cambios']).toHaveLength(1)
    }
  })
  it('🔴 el índice único gana una carrera: 23505 es 409', async () => {
    const db = base()
    const de = db.from.bind(db)
    db.from = ((t: string) => { const q = de(t) as unknown as Record<string, unknown>; if (t === 'plan_cambios') q.insert = () => ({ select: () => ({ single: async () => ({ data: null, error: { code: '23505', message: 'x' } }) }) }); return q }) as never
    expect((await llamar(db, BIEN)).status).toBe(409)
  })
  it('🔴 un pedido del plan o de otro cliente no estorba', async () => {
    const db = base({ pedidos: [{ id: 'p1', client_id: C, documento: 'plan', plan_id: 'x', estado: 'pendiente', despertado: true }, { id: 'p2', client_id: 'otro', documento: 'manual', estado: 'pendiente', despertado: true }] })
    expect((await llamar(db, BIEN)).status).toBe(200)
  })
  it('🔴 el pedido que nunca despertó se reutiliza, sin gasto doble ni fila nueva, y cuenta desde ahora', async () => {
    const db = base({ pedidos: [{ id: 'p1', client_id: C, documento: 'manual', estado: 'pendiente', despertado: false, texto: 'viejo', creado_en: '2026-10-01T00:00:00Z' }] })
    const s = await llamar(db, BIEN)
    expect(s.cuerpo).toMatchObject({ manual_cambio_id: 'p1', reintento: true })
    expect(db.tablas['plan_cambios']).toHaveLength(1)
    expect(db.tablas['plan_cambios'][0]).toMatchObject({ texto: BIEN.texto, despertado: null, creado_en: AHORA.toISOString() })
  })
  it('🔴 un pedido ya terminado no impide otro', async () => {
    const db = base({ pedidos: [{ id: 'p1', client_id: C, documento: 'manual', estado: 'aplicado' }, { id: 'p2', client_id: C, documento: 'manual', estado: 'fallido' }] })
    expect((await llamar(db, BIEN)).status).toBe(200)
  })
  it('🔴 entradas malas y gasto sin confirmar no escriben', async () => {
    const db = base()
    expect((await llamar(db, { ...BIEN, client_id: 'x' })).status).toBe(400)
    expect((await llamar(db, { ...BIEN, texto: 'no' })).status).toBe(400)
    expect((await llamar(db, { ...BIEN, seccion: 'x'.repeat(81) })).status).toBe(400)
    expect((await llamar(db, { ...BIEN, campos: ['inventado'] })).status).toBe(400)
    expect((await llamar(db, { ...BIEN, campos: 'mision' })).status).toBe(400)
    expect((await llamar(db, { ...BIEN, confirmo_gasto: false })).cuerpo).toMatchObject({ error: 'falta_confirmar_el_gasto' })
    expect((await llamar(db, { ...BIEN, tope_usd: TOPE_PEDIDO_AL_MANUAL_USD + 1 })).cuerpo).toMatchObject({ error: 'tope_demasiado_alto' })
    expect(await llamar(base(), { ...BIEN, client_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })).toMatchObject({ status: 404, cuerpo: { error: 'sin_manual' } })
    expect(db.tablas['plan_cambios']).toHaveLength(0)
  })
})

describe('🔴 lo que libera un pedido', () => {
  it('son del dueño lo escrito y lo validado por campo; lo aceptado con el manual entero, no', () => {
    expect(camposDelDueno(META)).toEqual(['mision', 'voice_description'])
    expect(camposDelDueno(undefined)).toEqual([])
  })
  const libera = (texto: string, campos: string[] = []) => camposQueLibera({ delDueno: ['mision', 'voice_description'], texto, campos })
  it('una observación general no libera nada', () => expect(libera('Hazlo más cercano')).toEqual([]))
  it('los campos de la sección se liberan', () => expect(libera('Hazlo más cercano', ['voice_description', 'vision'])).toEqual(['voice_description']))
  it('nombrar la etiqueta libera, sin tildes ni mayúsculas', () => expect(libera('cambia la MISION por favor')).toEqual(['mision']))
  it('🔴 una palabra que contiene la etiqueta no libera', () => expect(libera('una voz no es una vozarrón, sumisión')).toEqual(['voice_description']))
})

describe('🔴 lo que se conserva al guardar', () => {
  const previa = { version: 2, brand_mission: 'Misión de Emilio', content_text: { brand_book_draft: { mision: 'Misión de Emilio', voice_description: 'Voz', _field_meta: { mision: { fuente: 'dueno', en: '2026-10-01T00:00:00Z' }, voice_description: { fuente: 'dueno', en: '2026-11-02T10:30:00Z' } } } } }
  const nuevo = { mision: 'Misión nueva', voice_description: 'Voz nueva', _field_meta: {} }
  const pedido = (campos_liberados: string[]) => ({ campos_liberados, creado_en: '2026-11-02T10:00:00Z' })
  it('sin liberar, se conserva lo del dueño', () => expect(conservarLoDelDueno(previa, nuevo, pedido([])).bb.mision).toBe('Misión de Emilio'))
  it('🔴 liberado, entra lo nuevo y la marca del dueño se va', () => {
    const r = conservarLoDelDueno(previa, nuevo, pedido(['mision']))
    expect(r.bb.mision).toBe('Misión nueva')
    expect(r.conservados).not.toContain('mision')
    expect((r.bb._field_meta as Record<string, unknown> | undefined)?.mision).toBeUndefined()
  })
  it('🔴 lo que el dueño escribió después de pedir no se pisa, aunque esté liberado', () => {
    const r = conservarLoDelDueno(previa, nuevo, pedido(['voice_description']))
    expect(r.bb.voice_description).toBe('Voz')
    expect(r.conservados).toContain('voice_description')
  })
  it('🔴 lo validado después de pedir tampoco', () => {
    const p = { version: 2, content_text: { brand_book_draft: { mision: 'M', _field_meta: { mision: { aceptado_por_el_dueno: { campo: true, por: 'e', en: '2026-11-02T10:30:00Z' } } } } } }
    expect(conservarLoDelDueno(p, nuevo, pedido(['mision'])).bb.mision).toBe('M')
  })
  it('🔴 liberado y la reescritura lo dejó vacío: se conserva', () => {
    expect(conservarLoDelDueno(previa, { mision: '  ', _field_meta: {} }, pedido(['mision'])).bb.mision).toBe('Misión de Emilio')
  })
  it('🔴 sin pedido, igual que siempre', () => expect(conservarLoDelDueno(previa, nuevo).bb.mision).toBe('Misión de Emilio'))
})

describe('🔴 leer el pedido al guardar', () => {
  const db = () => new DbFalsa().semilla('plan_cambios', [{ id: 'aaaaaaaa-0000-4000-8000-000000000001', client_id: C, documento: 'manual', campos_liberados: ['mision'], creado_en: 'h', manual_nuevo_id: null }, { id: 'aaaaaaaa-0000-4000-8000-000000000002', client_id: C, documento: 'plan' }, { id: 'aaaaaaaa-0000-4000-8000-000000000003', client_id: 'otro', documento: 'manual' }])
  it('lee el suyo', async () => expect(await leerPedidoDelManual(db(), C, 'aaaaaaaa-0000-4000-8000-000000000001')).toMatchObject({ ok: true, pedido: { campos_liberados: ['mision'], manual_nuevo_id: null } }))
  it('🔴 no acepta uno del plan, de otro cliente, inexistente ni mal formado', async () => {
    for (const id of ['aaaaaaaa-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000009']) expect(await leerPedidoDelManual(db(), C, id)).toMatchObject({ ok: false, status: 404 })
    expect(await leerPedidoDelManual(db(), C, 'x')).toMatchObject({ ok: false, status: 400 })
  })
})

describe('🔴 la migración', () => {
  const RAIZ = path.join(__dirname, '..', '..', '..', '..', 'supabase')
  const SQL = fs.readFileSync(path.join(RAIZ, 'migrations', '202611020200_plan_cambios_tambien_del_manual.sql'), 'utf8')
  const REV = fs.readFileSync(path.join(RAIZ, 'reversas', '202611020200_plan_cambios_tambien_del_manual_REVERSA.sql'), 'utf8')
  it('el plan sigue exigiendo lo suyo y el manual lo suyo', () => {
    expect(SQL).toMatch(/documento = 'plan' AND plan_id IS NOT NULL AND vuelta IS NOT NULL/)
    expect(SQL).toMatch(/documento = 'manual' AND manual_id IS NOT NULL AND plan_id IS NULL/)
    expect(SQL).toMatch(/documento text NOT NULL DEFAULT 'plan'/)
  })
  it('un pedido abierto por cliente en el manual', () => expect(SQL).toMatch(/UNIQUE INDEX[^;]*\(client_id\)\s+WHERE documento = 'manual' AND estado IN \('pendiente', 'en_reescritura'\)/))
  it('🔴 la reversa se niega si ya hay pedidos del manual', () => expect(REV).toMatch(/IF EXISTS \(SELECT 1 FROM public\.plan_cambios WHERE documento = 'manual'\)[\s\S]*RAISE EXCEPTION/))
})
