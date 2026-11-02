/**
 * Las notas del juez (flujo de CC2, 03-nov) viven en `_field_meta.<clave>.notas_del_juez`: se conservan al guardar el manual y al pasar la puerta; si el dueño edita ese campo, su nota se va. US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { buildBrandBookRow } from '@/app/api/brand-book/[clientId]/route'
import { DbFalsa } from '../../oficina/__tests__/dbfalsa'
import { editarManualDelDueno, validarCampoDelManual } from '../edicion-del-dueno'
import { aplicarMeta } from '../firmes'
import { evaluarHechos } from '../hechos'

const C = '5c2d2dd5-a49e-4da3-87c3-03b504b734f6'
const NOTA = [{ dato: '2015', motivo: 'sin fuente' }]
const borrador = () => ({ positioning: 'p', vision: 'Ser recordados', historia_y_origen: 'Empezó en 2015', notas_del_juez: [{ campo: 'historia_y_origen', dato: '2015', motivo: 'sin fuente' }], _field_meta: { historia_y_origen: { notas_del_juez: NOTA }, vision: { notas_del_juez: NOTA } } })
type Meta = Record<string, Record<string, unknown>>
const draftDe = (f: Record<string, unknown>) => (JSON.parse(String(f.content_text)) as { brand_book_draft: Record<string, unknown> }).brand_book_draft
const con = () => new DbFalsa().semilla('client_brand_books', [{ id: 'v1', client_id: C, version: 1, human_validated: false, content_text: JSON.stringify({ brand_book_draft: borrador() }) }])

describe('las notas del juez', () => {
  it('🔴 sobreviven al guardar el manual', () => {
    const d = draftDe(buildBrandBookRow(C, borrador(), {}) as unknown as Record<string, unknown>)
    expect((d._field_meta as Meta).historia_y_origen.notas_del_juez).toEqual(NOTA)
    expect(d.notas_del_juez).toEqual(borrador().notas_del_juez)
  })

  it('🔴 sobreviven a la puerta', () => {
    const bb = borrador()
    const r = aplicarMeta(bb as never, evaluarHechos({ manual: bb, fuentes: [] } as never))
    expect((r._field_meta as Meta).historia_y_origen.notas_del_juez).toEqual(NOTA)
  })

  it('🔴 si el dueño edita ese campo, su nota se va; la de otro campo sigue', async () => {
    const db = con()
    await editarManualDelDueno(db as never, { client_id: C, campos: { vision: 'Otra visión' }, reviewer: 'emilio' })
    const d = draftDe(db.tablas['client_brand_books'].find((f) => f.version === 2)!)
    expect((d._field_meta as Meta).vision.notas_del_juez).toBeUndefined()
    expect((d._field_meta as Meta).historia_y_origen.notas_del_juez).toEqual(NOTA)
  })

  it('🔴 validar un campo no borra su nota', async () => {
    const db = con()
    await validarCampoDelManual(db as never, { client_id: C, campo: 'historia_y_origen', validado: true, reviewer: 'emilio' })
    const ult = [...db.tablas['client_brand_books']].sort((a, b) => Number(b.version) - Number(a.version))[0]
    expect((draftDe(ult)._field_meta as Meta).historia_y_origen.notas_del_juez).toEqual(NOTA)
  })
})
