/**
 * 30-oct · ADENDA 1 · dos escrituras del manual a la vez no pierden nada: el índice único (client_id, version) rechaza la segunda
 * y ésta vuelve a leer la vigente (con lo de la otra) y se arma otra vez sobre ella.
 */
import { describe, expect, it } from 'vitest'
import { editarManualDelDueno } from '../edicion-del-dueno'
import { promoverManualRevisado } from '../promover'
import { DbFalsa } from '../../oficina/__tests__/dbfalsa'

const C = '5c2d2dd5-a49e-4da3-87c3-03b504b734f6'
const AHORA = new Date('2026-10-30T16:00:00Z')
type Fila = Record<string, unknown>

function conManual() {
  const db = new DbFalsa()
  const draft = { proposito: 'Propósito viejo', _field_meta: {} }
  db.semilla('client_brand_books', [{ id: 'v1', client_id: C, version: 1, human_validated: false, brand_purpose: 'Propósito viejo', content_text: JSON.stringify({ brand_book_draft: draft }), provenance_tag: {} }])
  return db
}

/** envuelve la base: en los primeros `choques` inserts del manual, otra escritura "gana" la versión (se mete su fila y este insert recibe 23505) */
function conCompetencia(db: DbFalsa, choques: number, ganadora: (vigente: Fila) => Fila) {
  let quedan = choques
  const original = db.from.bind(db)
  ;(db as unknown as { from: (t: string) => unknown }).from = (t: string) => {
    const c = original(t) as { insert: (p: Fila) => unknown }
    if (t !== 'client_brand_books') return c
    const insert = c.insert.bind(c)
    c.insert = (p: Fila) => {
      if (quedan > 0) {
        quedan--
        const vigente = [...db.tablas['client_brand_books']].sort((a, b) => Number(b.version) - Number(a.version))[0]
        db.tablas['client_brand_books'].push({ ...ganadora(vigente), id: `otra-${quedan}`, client_id: C, version: Number(vigente.version) + 1 })
        return { select: () => ({ single: async () => ({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }) }) }
      }
      return insert(p)
    }
    return c
  }
  return db
}
const vigente = (db: DbFalsa) => [...db.tablas['client_brand_books']].sort((a, b) => Number(b.version) - Number(a.version))[0]

describe('versión única del manual · ADENDA 1', () => {
  it('una edición que choca con otra escritura se rearma sobre la vigente y no pierde ninguna', async () => {
    const db = conCompetencia(conManual(), 1, (v) => ({ ...v, brand_mission: 'Misión que escribió la otra', auto_generated_from: 'otra' }))
    const r = await editarManualDelDueno(db as never, { client_id: C, campos: { proposito: 'Propósito del dueño' }, reviewer: 'emilio', ahora: AHORA })
    expect(r.ok).toBe(true)
    const v = vigente(db)
    expect(v.version).toBe(3)
    expect(v.brand_purpose).toBe('Propósito del dueño')
    expect(v.brand_mission).toBe('Misión que escribió la otra')
  })

  it('aguanta varios choques seguidos (hasta 4 intentos) y, agotados, lo dice sin perder nada', async () => {
    const ok = conCompetencia(conManual(), 3, (v) => ({ ...v }))
    expect((await editarManualDelDueno(ok as never, { client_id: C, campos: { proposito: 'A' }, reviewer: 'emilio', ahora: AHORA })).ok).toBe(true)
    expect(vigente(ok).version).toBe(5)
    const mal = conCompetencia(conManual(), 9, (v) => ({ ...v }))
    const r = await editarManualDelDueno(mal as never, { client_id: C, campos: { proposito: 'A' }, reviewer: 'emilio', ahora: AHORA })
    expect(r.ok).toBe(false)
  })

  it('promover que choca no pisa a la otra escritura: queda sin promover', async () => {
    const db = conCompetencia(conManual(), 1, (v) => ({ ...v, auto_generated_from: 'otra' }))
    db.semilla('client_historical_outputs', [{ id: 'b1', client_id: C, output_type: 'brand_book_draft_revision', status: 'pending', content: JSON.stringify({ manual: { brand_purpose: 'Del borrador' }, version_base: 1 }), provenance_tag: {} }])
    const r = await promoverManualRevisado(db as never, { client_id: C, output_id: 'b1', aprobador: 'emilio', ahora: AHORA, empujar: () => ({ estado: 'x' }) } as never)
    expect(r.ok === false && r.error).toBe('version_vigente_cambio')
    expect(vigente(db).auto_generated_from).toBe('otra')
  })
})
