/**
 * 3-nov · firma de Emilio: «que no siga la cadena hasta que yo apruebe el manual». El botón aprueba y pide el plan, una sola vez, y lo que él retiró queda retirado.
 * Sin red: la sala es un `fetch` falso y la base, la de pruebas.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { evaluarCompletitud } from '../src/lib/manual/campos-del-manual'
import { conservarLoDelDueno, editarManualDelDueno } from '../src/lib/manual/edicion-del-dueno'
import { rutaValidarManual } from '../src/lib/manual/edicion-rutas'
import { pedirPlanDelManual, sobreDelPlan } from '../src/lib/manual/pedir-plan'
import { fusionarPropuestas } from '../src/lib/manual/propuesta'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'

const C = '5c2d2dd5-a49e-4da3-87c3-03b504b734f6'
const AHORA = new Date('2026-11-03T16:00:00Z')
function base() {
  const db = new DbFalsa()
  const draft = { proposito: 'Propósito', mision: 'Misión', vision: 'Visión vieja', voice_description: 'Voz cálida' }
  db.semilla('client_brand_books', [{ id: 'v1', client_id: C, version: 1, human_validated: false, brand_purpose: 'Propósito', brand_vision: 'Visión vieja', content_text: JSON.stringify({ brand_book_draft: draft }), provenance_tag: {} }])
  db.semilla('plan_cambios', [])
  db.semilla('plan_corridas', [])
  return db
}
const deps = (db: DbFalsa, pedirPlan = vi.fn(async () => ({ pedido: true as const, repetido: false, event_id: 'e1' }))) => ({ db, ahora: () => AHORA, cerebro: { env: { baseUrl: 'x', internalKey: 'k' } }, empujarManual: () => ({ estado: 'agendado' }), pedirPlan })
const versiones = (db: DbFalsa) => [...db.tablas['client_brand_books']].sort((a, b) => Number(a.version) - Number(b.version))

afterEach(() => vi.unstubAllGlobals())

describe('el botón aprueba y pide el plan', () => {
  it('🔴 aprueba el manual y pide el plan de ESA versión', async () => {
    const db = base(), d = deps(db)
    const s = await rutaValidarManual(d, C, 'emilio')
    expect(s.status).toBe(200)
    expect(versiones(db)[1]).toMatchObject({ version: 2, human_validated: true })
    expect(d.pedirPlan).toHaveBeenCalledWith({ client_id: C, manual_id: versiones(db)[1].id })
    expect(s.body).toMatchObject({ ok: true, plan: { pedido: true } })
  })

  it('🔴 el doble clic pide con la misma versión: la clave de la sala hace que sea un solo plan', async () => {
    const db = base(), d = deps(db)
    await rutaValidarManual(d, C, 'emilio')
    await rutaValidarManual(d, C, 'emilio')
    expect(versiones(db)).toHaveLength(2)
    const [a, b] = d.pedirPlan.mock.calls as unknown as Array<[{ manual_id: string }]>
    expect(a[0].manual_id).toBe(b[0].manual_id)
    expect(sobreDelPlan({ client_id: C, ...a[0] }).idempotency_key).toBe(sobreDelPlan({ client_id: C, ...b[0] }).idempotency_key)
  })

  it.each([['pendiente'], ['en_reescritura']])('🔴 con el manual regenerándose (%s) no deja aprobar y no pide nada', async (estado) => {
    const db = base(), d = deps(db)
    db.semilla('plan_cambios', [{ id: 'c1', client_id: C, manual_id: 'v1', estado }])
    const s = await rutaValidarManual(d, C, 'emilio')
    expect(s.status).toBe(409)
    expect(s.body).toMatchObject({ ok: false, error: 'regeneracion_en_curso' })
    expect(versiones(db)).toHaveLength(1)
    expect(d.pedirPlan).not.toHaveBeenCalled()
  })

  it('un pedido de cambios del PLAN no frena la aprobación del manual, ni uno ya cerrado', async () => {
    const db = base(), d = deps(db)
    db.semilla('plan_cambios', [{ id: 'c1', client_id: C, manual_id: null, plan_id: 'p', estado: 'pendiente' }, { id: 'c2', client_id: C, manual_id: 'v1', estado: 'aplicado' }])
    expect((await rutaValidarManual(d, C, 'emilio')).status).toBe(200)
  })

  it.each([['esperando'], ['corriendo']])('🔴 con un plan %s no deja aprobar: el botón prometería un plan que no arranca', async (estado) => {
    const db = base(), d = deps(db)
    db.semilla('plan_corridas', [{ id: 'r1', client_id: C, estado }])
    const s = await rutaValidarManual(d, C, 'emilio')
    expect(s.status).toBe(409)
    expect(s.body).toMatchObject({ error: 'plan_en_curso' })
    expect(d.pedirPlan).not.toHaveBeenCalled()
  })

  it.each([['plan_cambios'], ['plan_corridas']])('🔴 si no puede leer %s no aprueba ni pide nada: no se aprueba a ciegas', async (tabla) => {
    const db = base(), d = deps(db)
    const rota = () => { const c: Record<string, unknown> = {}; for (const m of ['select', 'eq', 'in']) c[m] = () => c; c.then = (ok: (v: unknown) => void) => ok({ data: null, error: { message: 'caída' } }); return c }
    const s = await rutaValidarManual({ ...d, db: { from: (t: string) => (t === tabla ? rota() : db.from(t)) } as never }, C, 'emilio')
    expect(s.status).toBe(502)
    expect(s.body).toMatchObject({ ok: false, error: 'no_se_pudo_leer' })
    expect(versiones(db)).toHaveLength(1)
    expect(d.pedirPlan).not.toHaveBeenCalled()
  })

  it('🔴 si la sala falla, el manual queda aprobado, se dice, y aprobar otra vez reintenta sin otra versión', async () => {
    const db = base()
    const pedir = vi.fn(async () => ({ pedido: false as const, error: 'no' }))
    const d = deps(db, pedir as never)
    const s = await rutaValidarManual(d, C, 'emilio')
    expect(s.status).toBe(200)
    expect(s.body).toMatchObject({ ok: true, plan: { pedido: false }, aviso: expect.stringContaining('Vuelve a aprobar') })
    await rutaValidarManual(d, C, 'emilio')
    expect(pedir).toHaveBeenCalledTimes(2)
    expect(versiones(db)).toHaveLength(2)
  })
})

describe('el sobre', () => {
  it('🔴 va por la misma regla de la sala que usaba el alta, y pide rehacer aunque el cliente ya tenga plan', () => {
    const s = sobreDelPlan({ client_id: C, manual_id: 'm1' }, 'c-1') as { source: string; intent: string; payload: Record<string, unknown>; idempotency_key: string; correlation_id: string }
    expect(s).toMatchObject({ source: 'alta/journey-completed', intent: 'planear', idempotency_key: 'manual:m1:planear', logical_period: 'manual:m1', tenant_id: C, client_id: C, correlation_id: 'c-1' })
    expect(s.payload).toMatchObject({ plan_v3: true, corrida: 'manual:m1:planear', forzar: true, force_restart: true, dry_run: false, client_id: C })
    expect(String(s.payload.corrida).length).toBeLessThanOrEqual(120)
  })

  it('🔴 sin llave no llama a nadie', async () => {
    const f = vi.fn()
    expect(await pedirPlanDelManual({ client_id: C, manual_id: 'm1' }, { llave: '', fetchImpl: f as never })).toMatchObject({ pedido: false, error: expect.stringContaining('llave') })
    expect(f).not.toHaveBeenCalled()
  })

  it.each([
    ['aceptado', { ok: true, kind: 'accepted', event_id: 'e1' }, 200, { pedido: true, repetido: false, event_id: 'e1' }],
    ['repetido', { ok: true, kind: 'duplicate' }, 200, { pedido: true, repetido: true }],
    ['la sala contesta 200 y rechaza', { ok: false, code: 'x', detail: 'y' }, 200, { pedido: false }],
    ['la sala da error', {}, 500, { pedido: false }],
  ])('%s', async (_n, cuerpo, status, esperado) => {
    const f = vi.fn(async () => ({ ok: status < 400, status, json: async () => cuerpo }))
    expect(await pedirPlanDelManual({ client_id: C, manual_id: 'm1' }, { url: 'https://x', llave: 'k', fetchImpl: f as never })).toMatchObject(esperado)
  })

  it('🔴 sin red no lanza', async () => {
    const f = vi.fn(async () => { throw new Error('caída') })
    expect(await pedirPlanDelManual({ client_id: C, manual_id: 'm1' }, { url: 'https://x', llave: 'k', fetchImpl: f as never })).toMatchObject({ pedido: false })
  })
})

describe('lo retirado queda retirado', () => {
  async function conVisionRetirada() {
    const db = base()
    await editarManualDelDueno(db, { client_id: C, campos: { vision: '' }, reviewer: 'emilio', ahora: AHORA })
    return versiones(db)[1]
  }

  it('🔴 una corrida nueva que trae el campo no lo rellena', async () => {
    const previa = await conVisionRetirada()
    const { bb, conservados } = conservarLoDelDueno(previa, { vision: 'Visión nueva del agente', mision: 'Otra' })
    expect(bb.vision).toBeNull()
    expect(conservados).toContain('vision')
    expect((bb._field_meta as Record<string, { retirado?: boolean }>).vision.retirado).toBe(true)
    expect(bb.mision).toBe('Otra')
  })

  it('🔴 «Pedir cambios» lo libera', async () => {
    const previa = await conVisionRetirada()
    const { bb } = conservarLoDelDueno(previa, { vision: 'Visión nueva' }, { campos_liberados: ['vision'], creado_en: '2026-11-04T00:00:00Z' })
    expect(bb.vision).toBe('Visión nueva')
  })

  it('🔴 si la retiró después de pedir el cambio, sigue retirada', async () => {
    const previa = await conVisionRetirada()
    expect(conservarLoDelDueno(previa, { vision: 'Visión nueva' }, { campos_liberados: ['vision'], creado_en: '2026-11-01T00:00:00Z' }).bb.vision).toBeNull()
  })

  it('🔴 volver a escribirlo a mano quita la retirada', async () => {
    const db = base()
    await editarManualDelDueno(db, { client_id: C, campos: { vision: '' }, reviewer: 'emilio', ahora: AHORA })
    await editarManualDelDueno(db, { client_id: C, campos: { vision: 'Mi visión' }, reviewer: 'emilio', ahora: AHORA })
    expect(conservarLoDelDueno(versiones(db)[2], { vision: 'De la corrida' }).bb.vision).toBe('Mi visión')
  })

  it('🔴 una propuesta del agente no lo vuelve a llenar', () => {
    const r = fusionarPropuestas({ vision: null, _field_meta: { vision: { retirado: true } } }, [{ campo: 'vision', valor: 'Ser los mejores', razon: 'r' }], [], { reproponer: ['vision'] } as never)
    expect(r.aplicadas).toEqual([])
    expect(r.rechazadas[0].motivo).toMatch(/retiró/)
  })

  it('🔴 no cuenta como hueco por llenar, pero otro campo vacío sí', () => {
    const c = evaluarCompletitud({ vision: null, mision: null, _field_meta: { vision: { retirado: true } } })
    expect(c.huecos.map((h) => h.clave)).not.toContain('vision')
    expect(c.huecos.map((h) => h.clave)).toContain('mision')
  })
})
