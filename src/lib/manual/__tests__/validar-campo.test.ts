// 02-nov · firma de Emilio: validar cualquier campo por separado, sin versión nueva, y que viaje como aceptado por el dueño.
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CAMPOS } from '../campos-del-manual'
import { conservarLoDelDueno, editarManualDelDueno, validarCampoDelManual, validarManualDelDueno } from '../edicion-del-dueno'
import { avisoDelManualConValidados, avisoDeProvisionales, camposDelManual } from '../lectura'
import { ACCIONES } from '@/lib/oficina/tablero/acciones'
import { palabrasDuras } from '../palabras-con-intencion'
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
  it('🔴 sirve para cualquier campo con contenido, no solo los que tienen clave del tablero', async () => {
    const claves = CAMPOS.filter((c) => !c.clave_del_tablero).map((c) => c.clave)
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
  it('🔴 texto en blanco, lista vacía u objeto vacío no son contenido, en el borrador ni en la columna', async () => {
    const libre = CAMPOS.find((c) => !c.columna)!
    for (const v of ['', '   ', [], [''], ['', ' '], {}, { a: '' }]) {
      const db = base({}, { [libre.clave]: v })
      expect(await validar(db, libre.clave), JSON.stringify(v)).toMatchObject({ ok: false, error: 'campo_vacio' })
    }
    const conColumna = base({}, { mision: '' })
    conColumna.tablas['client_brand_books'][0].brand_mission = '   '
    expect(await validar(conColumna, 'mision')).toMatchObject({ ok: false, error: 'campo_vacio' })
    const lista = base({}, { [libre.clave]: ['algo'] })
    expect((await validar(lista, libre.clave)).ok).toBe(true)
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
  it('🔴 quien lee en marketing lo ve validado, y deja de leerlo como provisional', async () => {
    const db = base()
    expect(avisoDelManualConValidados(db.tablas['client_brand_books'][0].content_text)).toMatch(/provisionales.*mision/)
    await validar(db, 'mision')
    const t = db.tablas['client_brand_books'][0].content_text
    expect(avisoDelManualConValidados(t)).toMatch(/validados por el dueño, tal como están: mision/)
    expect(avisoDelManualConValidados(t)).not.toMatch(/provisionales/)
    expect(camposDelManual(t)).toMatchObject({ validados_por_el_dueno: ['mision'] })
  })
  it('🔴 lo que entrega el lector del cerebro no cambia al validar', async () => {
    const db = base()
    const antes = avisoDeProvisionales(db.tablas['client_brand_books'][0].content_text)
    expect(antes).toMatch(/provisionales.*mision/)
    await validar(db, 'mision')
    expect(avisoDeProvisionales(db.tablas['client_brand_books'][0].content_text)).toBe(antes)
    expect(fs.readFileSync('src/lib/cerebro/lectores.ts', 'utf8')).toContain('avisoDeProvisionales(f.content_text)')
    expect(fs.readFileSync('src/lib/oficina/adaptadores.ts', 'utf8')).toContain('avisoDelManualConValidados(manual.content_text)')
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

describe('🔴 editar cualquier campo (adenda de Emilio)', () => {
  it('cada campo, por su clave del borrador, sin que el campo tuviera valor', async () => {
    for (const c of CAMPOS) {
      const db = new DbFalsa().semilla('client_brand_books', [{ id: 'v1', client_id: C, version: 1, updated_at: 't', content_text: JSON.stringify({ brand_book_draft: {} }) }])
      const r = await editarManualDelDueno(db, { client_id: C, campos: { [c.clave]: 'Texto del dueño' }, reviewer: 'emilio', ahora: AHORA })
      expect(r, c.clave).toMatchObject({ ok: true, version_nueva: 2, cambios: [{ clave: c.clave, valor: 'Texto del dueño', valor_anterior: null }] })
      const u = db.tablas['client_brand_books'].find((x) => x.version === 2)!
      const d = (JSON.parse(String(u.content_text)) as any).brand_book_draft
      expect(d._field_meta[c.clave], c.clave).toMatchObject({ fuente: 'dueno', por: 'emilio' })
      expect(JSON.stringify(d[c.clave]), c.clave).toContain('Texto del dueño')
      if (c.columna) expect(JSON.stringify(u[c.columna]), c.clave).toContain('Texto del dueño')
    }
  })
  it('las claves cortas del tablero siguen sirviendo', async () => {
    const r = await editarManualDelDueno(base(), { client_id: C, campos: { voz: 'Otra voz' }, reviewer: 'emilio', ahora: AHORA })
    expect(r).toMatchObject({ ok: true, cambios: [{ clave: 'voice_description', clave_del_tablero: 'voz' }] })
  })
  it('🔴 un campo inventado se rechaza, y el mismo campo por sus dos claves también', async () => {
    expect(await editarManualDelDueno(base(), { client_id: C, campos: { inventado: 'x' }, reviewer: 'e' })).toMatchObject({ ok: false, status: 400, error: 'campo_no_editable' })
    expect(await editarManualDelDueno(base(), { client_id: C, campos: { voz: 'a', voice_description: 'b' }, reviewer: 'e' })).toMatchObject({ ok: false, status: 400, error: 'entrada_invalida' })
  })
  it('🔴 una corrida posterior conserva un campo que antes no se podía editar', async () => {
    const db = base()
    await editarManualDelDueno(db, { client_id: C, campos: { vision: 'La visión de Emilio' }, reviewer: 'emilio', ahora: AHORA })
    const u = db.tablas['client_brand_books'].find((x) => x.version === 2)!
    expect(conservarLoDelDueno({ ...u, content_text: JSON.parse(String(u.content_text)) }, { vision: 'Otra', _field_meta: {} }).bb.vision).toBe('La visión de Emilio')
  })
  describe('la lista de palabras', () => {
    const GRATIS = { texto: 'gratis', intencion: 'legal', fuente: { cita: 'la ley' } }
    const conPalabras = () => {
      const db = base()
      Object.assign(db.tablas['client_brand_books'][0], { forbidden_words: ['barato', 'gratis', 'mejor'], palabras_con_intencion: [{ texto: 'barato', intencion: 'del_dueno', fuente: { cita: 'lo dijo', fecha: '2026-10-30' } }, GRATIS] })
      return db
    }
    const final = (db: DbFalsa) => db.tablas['client_brand_books'].find((x) => x.version === 2)!
    it('🔴 la palabra prohibida que el dueño quita deja de contar; la que sigue conserva su intención; la nueva es contexto', async () => {
      const db = conPalabras()
      await editarManualDelDueno(db, { client_id: C, campos: { forbidden_words: 'gratis; mejor; nueva' }, reviewer: 'emilio', ahora: AHORA })
      const u = final(db)
      expect(u.forbidden_words).toEqual(['gratis', 'mejor', 'nueva'])
      expect(u.palabras_con_intencion).toEqual([GRATIS])
      expect(palabrasDuras(u as never)).toEqual(['gratis'])
      expect((JSON.parse(String(u.content_text)) as any).brand_book_draft.palabras_con_intencion).toEqual([GRATIS])
    })
    it('editar otro campo no las toca', async () => {
      const db = conPalabras()
      await editarManualDelDueno(db, { client_id: C, campos: { voz: 'x' }, reviewer: 'emilio', ahora: AHORA })
      expect(palabrasDuras(final(db) as never)).toEqual(['barato', 'gratis'])
    })
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
