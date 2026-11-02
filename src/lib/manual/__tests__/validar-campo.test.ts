// 02-nov · firma de Emilio: validar cualquier campo por separado, sin versión nueva, y que viaje como aceptado por el dueño.
import { describe, expect, it } from 'vitest'
import { CAMPOS } from '../campos-del-manual'
import { conservarLoDelDueno, editarManualDelDueno, validarCampoDelManual, validarManualDelDueno } from '../edicion-del-dueno'
import { avisoDeProvisionales, camposDelManual } from '../lectura'
import { ACCIONES } from '@/lib/oficina/tablero/acciones'
import { DbFalsa } from '../../oficina/__tests__/dbfalsa'

const C = '5c2d2dd5-a49e-4da3-87c3-03b504b734f6'
const AHORA = new Date('2026-11-02T06:00:00Z')
function base(meta: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  const draft = { proposito: 'Propósito', mision: 'Misión', valores: ['honestidad'], voice_description: 'Voz cálida', _field_meta: { mision: { fuente: 'agente', estado: 'con_pendientes' }, ...meta }, ...extra }
  return new DbFalsa().semilla('client_brand_books', [{ id: 'v1', client_id: C, version: 1, updated_at: '2026-11-01T00:00:00Z', human_validated: false, brand_purpose: 'Propósito', brand_mission: 'Misión', content_text: JSON.stringify({ brand_book_draft: draft }) }])
}
const draftDe = (db: DbFalsa) => (JSON.parse(String(db.tablas['client_brand_books'][0].content_text)) as { brand_book_draft: Record<string, any> }).brand_book_draft
const validar = (db: DbFalsa, campo: unknown, validado = true) => validarCampoDelManual(db, { client_id: C, campo, validado, reviewer: 'emilio', ahora: AHORA })

describe('validar un campo', () => {
  it('🔴 no crea versión nueva: diez validaciones siguen siendo una versión', async () => {
    const db = base()
    for (const c of ['mision', 'proposito', 'valores', 'voice_description']) expect((await validar(db, c)).ok).toBe(true)
    expect(db.tablas['client_brand_books']).toHaveLength(1)
    expect(db.tablas['client_brand_books'][0].version).toBe(1)
  })
  it('🔴 marca quién y cuándo, y conserva lo demás del campo y del manual', async () => {
    const db = base()
    expect(await validar(db, 'mision')).toMatchObject({ ok: true, campo: 'mision', validado: true, por: 'emilio', en: AHORA.toISOString(), version: 1, sin_cambios: false })
    const d = draftDe(db)
    expect(d._field_meta.mision).toEqual({ fuente: 'agente', estado: 'con_pendientes', aceptado_por_el_dueno: { por: 'emilio', en: AHORA.toISOString(), campo: true } })
    expect(d.proposito).toBe('Propósito')
    expect(db.tablas['client_brand_books'][0].human_validated).toBe(false)
  })
  it('🔴 sirve para cualquier campo con contenido, no solo los editables', async () => {
    const claves = CAMPOS.filter((c) => !c.editable).map((c) => c.clave)
    expect(claves.length).toBeGreaterThan(0)
    const db = base({}, Object.fromEntries(claves.map((k) => [k, 'algo'])))
    for (const k of claves) expect((await validar(db, k)).ok, k).toBe(true)
  })
  it('acepta la clave del tablero', async () => {
    const c = CAMPOS.find((x) => x.clave_del_tablero && x.clave_del_tablero !== x.clave)
    if (!c) return
    const db = base({}, { [c.clave]: 'algo' })
    expect(await validar(db, c.clave_del_tablero)).toMatchObject({ ok: true, campo: c.clave })
  })
  it('🔴 desvalidar quita la marca y deja lo demás', async () => {
    const db = base()
    await validar(db, 'mision')
    expect(await validar(db, 'mision', false)).toMatchObject({ ok: true, validado: false, por: null, en: null, sin_cambios: false })
    expect(draftDe(db)._field_meta.mision).toEqual({ fuente: 'agente', estado: 'con_pendientes' })
  })
  it('🔴 repetir no escribe', async () => {
    const db = base()
    await validar(db, 'mision')
    const antes = db.tablas['client_brand_books'][0].content_text
    expect(await validar(db, 'mision')).toMatchObject({ ok: true, sin_cambios: true, por: 'emilio' })
    expect(db.tablas['client_brand_books'][0].content_text).toBe(antes)
    expect(await validar(db, 'proposito', false)).toMatchObject({ ok: true, sin_cambios: true, validado: false })
  })
  it('🔴 un campo escrito por el dueño ya es suyo: validar no toca nada y desvalidar se niega', async () => {
    const db = base({ mision: { fuente: 'dueno', por: 'emilio', en: '2026-10-30' } })
    const antes = db.tablas['client_brand_books'][0].content_text
    expect(await validar(db, 'mision')).toMatchObject({ ok: true, validado: true, sin_cambios: true, por: 'emilio', en: '2026-10-30' })
    expect(await validar(db, 'mision', false)).toMatchObject({ ok: false, status: 409, error: 'escrito_por_el_dueno' })
    expect(db.tablas['client_brand_books'][0].content_text).toBe(antes)
  })
  it('🔴 vacío, desconocido, sin manual o cliente malo: se niega sin escribir', async () => {
    const db = base()
    const vacio = CAMPOS.find((c) => !['proposito', 'mision', 'valores', 'voice_description'].includes(c.clave) && !c.columna)!
    expect(await validar(db, vacio.clave)).toMatchObject({ ok: false, error: 'campo_vacio' })
    expect(await validar(db, 'inventado')).toMatchObject({ ok: false, status: 400, error: 'campo_desconocido' })
    expect(await validarCampoDelManual(db, { client_id: 'x', campo: 'mision', validado: true, reviewer: 'e' })).toMatchObject({ ok: false, status: 400 })
    expect(await validar(new DbFalsa().semilla('client_brand_books', []), 'mision')).toMatchObject({ ok: false, status: 404 })
    expect(draftDe(db)._field_meta.mision.aceptado_por_el_dueno).toBeUndefined()
  })
  it('🔴 desvalidar también quita lo aceptado con «Validar el manual» entero', async () => {
    const db = base({ mision: { aceptado_por_el_dueno: { por: 'e', en: 'x' } } })
    expect(await validar(db, 'mision', false)).toMatchObject({ ok: true, validado: false, sin_cambios: false })
    expect(draftDe(db)._field_meta.mision.aceptado_por_el_dueno).toBeUndefined()
  })
  it('🔴 validar el manual entero no le quita a un campo su validación propia', async () => {
    const db = base()
    await validar(db, 'mision')
    expect(await validarManualDelDueno(db, { client_id: C, reviewer: 'otra', ahora: new Date('2026-11-03T00:00:00Z') })).toMatchObject({ ok: true })
    const u = [...db.tablas['client_brand_books']].sort((a, b) => Number(b.version) - Number(a.version))[0]
    expect((JSON.parse(String(u.content_text)) as any).brand_book_draft._field_meta.mision.aceptado_por_el_dueno).toEqual({ por: 'emilio', en: AHORA.toISOString(), campo: true })
  })
  it('🔴 si otra escritura tocó la fila, no la pisa: reintenta y al final lo dice', async () => {
    const llamadas = { escribe: 0 }
    const fila = { id: 'v1', client_id: C, version: 1, updated_at: 't', brand_mission: 'M', content_text: JSON.stringify({ brand_book_draft: { mision: 'M' } }) }
    const db = { from: () => {
      const q: Record<string, unknown> = {
        select: () => q, eq: () => q, order: () => q,
        limit: async () => ({ data: [fila], error: null }),
        update: () => { llamadas.escribe++; return { eq: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) }) } },
      }
      return q
    } }
    expect(await validarCampoDelManual(db, { client_id: C, campo: 'mision', validado: true, reviewer: 'e' })).toMatchObject({ ok: false, status: 409, error: 'otra_escritura' })
    expect(llamadas.escribe).toBe(4)
  })
  it('🔴 filtra por el sello de la fila que leyó', async () => {
    const db = base()
    await validar(db, 'mision')
    db.tablas['client_brand_books'][0].updated_at = '2026-11-02T00:00:00Z'
    expect((await validar(db, 'proposito')).ok).toBe(true)
  })
})

describe('que viaje como aceptado por el dueño', () => {
  it('🔴 una corrida posterior lo conserva, con su valor y su marca', async () => {
    const db = base()
    await validar(db, 'mision')
    const previa = { ...db.tablas['client_brand_books'][0], content_text: JSON.parse(String(db.tablas['client_brand_books'][0].content_text)) }
    const { bb, conservados } = conservarLoDelDueno(previa, { mision: 'Otra misión de la corrida', _field_meta: {} })
    expect(conservados).toContain('mision')
    expect(bb.mision).toBe('Misión')
    expect((bb._field_meta as any).mision.aceptado_por_el_dueno.por).toBe('emilio')
  })
  it('🔴 lo aceptado con «Validar el manual» entero no se conserva, como hasta hoy', () => {
    const previa = { version: 1, brand_mission: 'Misión', content_text: { brand_book_draft: { mision: 'Misión', _field_meta: { mision: { aceptado_por_el_dueno: { por: 'e', en: 'x' } } } } } }
    const { bb, conservados } = conservarLoDelDueno(previa, { mision: 'Otra', _field_meta: {} })
    expect(conservados).not.toContain('mision')
    expect(bb.mision).toBe('Otra')
  })
  it('🔴 quien lee el manual lo ve validado, y deja de leerlo como provisional', async () => {
    const db = base()
    expect(avisoDeProvisionales(db.tablas['client_brand_books'][0].content_text)).toMatch(/provisionales.*mision/)
    await validar(db, 'mision')
    const t = db.tablas['client_brand_books'][0].content_text
    expect(avisoDeProvisionales(t)).toMatch(/validados por el dueño, tal como están: mision/)
    expect(avisoDeProvisionales(t)).not.toMatch(/provisionales/)
    expect(camposDelManual(t)).toMatchObject({ validados_por_el_dueno: ['mision'] })
    expect(camposDelManual(t)!.firmes).toContain('mision')
  })
  it('🔴 editar el campo reemplaza la marca: ya es escrito por el dueño', async () => {
    const db = base()
    await validar(db, 'proposito')
    const r = await editarManualDelDueno(db, { client_id: C, campos: { proposito: 'Nuevo' }, reviewer: 'emilio', ahora: AHORA })
    expect(r).toMatchObject({ ok: true })
    const u = [...db.tablas['client_brand_books']].sort((x, y) => Number(y.version) - Number(x.version))[0]
    const m = (JSON.parse(String(u.content_text)) as any).brand_book_draft._field_meta.proposito
    expect(m.fuente).toBe('dueno')
    expect(m.aceptado_por_el_dueno).toBeUndefined()
  })
})

describe('la acción del tablero', () => {
  const llamar = (db: DbFalsa, cuerpo: Record<string, unknown>) => ACCIONES['manual-validar-campo']({ db } as never, { cuerpo, reviewer: 'emilio' } as never)
  it('🔴 valida por omisión, desvalida con false y rechaza un valor raro', async () => {
    const db = base()
    expect((await llamar(db, { client_id: C, campo: 'mision' }))).toMatchObject({ status: 200, cuerpo: { ok: true, validado: true, por: 'emilio' }, toca: { client_id: C } })
    expect((await llamar(db, { client_id: C, campo: 'mision', validado: false })).cuerpo).toMatchObject({ validado: false })
    expect((await llamar(db, { client_id: C, campo: 'mision', validado: 'no' })).status).toBe(400)
  })
})
