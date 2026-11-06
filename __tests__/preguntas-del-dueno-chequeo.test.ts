/**
 * Chequeo de la migración de las preguntas del dueño a la plataforma (adenda #940, 06-nov) · US$ 0 · sin base: funciones puras del guion.
 * Antes: frena si una respondida no tiene su ficha con la respuesta (la migración la rechazaría). Después: compara fila por fila con el mismo id.
 * Y la migración misma: mueve con el mismo id, saca la respuesta de la ficha, exige motivo a las obsoletas, comprueba y deja la tabla vieja de solo lectura.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { revisarAntes, revisarDespues } from '../scripts/ops/preguntas-del-dueno-chequeo.mjs'

const viejas = [
  { id: 'a1', estado: 'respondida', ficha_id: 'f1' },
  { id: 'a2', estado: 'obsoleta', ficha_id: null, motivo_descarte: 'vivía en Slack' },
  { id: 'a3', estado: 'pendiente', ficha_id: null },
]
const fichas = [{ id: 'f1', respuesta: 'LA PROXIMA SEMANA' }]

describe('antes de migrar', () => {
  it('con cada respondida con su ficha y respuesta: sin problemas, y cuenta por estado', () => {
    expect(revisarAntes(viejas, fichas)).toEqual({ problemas: [], conteo: { respondida: 1, obsoleta: 1, pendiente: 1 } })
  })
  it('frena si a una respondida le falta la ficha, el id de ficha o la respuesta', () => {
    expect(revisarAntes(viejas, []).problemas).toHaveLength(1)
    expect(revisarAntes([{ id: 'a1', estado: 'respondida', ficha_id: null }], fichas).problemas[0]).toContain('sin ficha_id')
    expect(revisarAntes(viejas, [{ id: 'f1', respuesta: '  ' }]).problemas[0]).toContain('no guarda la respuesta')
  })
})

describe('después de migrar', () => {
  const nuevas = [
    { id: 'a1', estado: 'respondida', respuesta: 'LA PROXIMA SEMANA', ficha_ref: 'f1', motivo: null },
    { id: 'a2', estado: 'obsoleta', respuesta: null, ficha_ref: null, motivo: 'vivía en Slack' },
    { id: 'a3', estado: 'respondida', respuesta: 'x', ficha_ref: 'f9', motivo: null }, // una pendiente que la plataforma ya cerró: vale
  ]
  it('todo coincide fila por fila', () => {
    expect(revisarDespues(viejas, nuevas, fichas)).toEqual({ problemas: [], movidas: 3 })
  })
  it('detecta: fila que falta, estado cambiado, respuesta o ficha distinta, obsoleta sin motivo', () => {
    expect(revisarDespues(viejas, nuevas.slice(1), fichas).problemas[0]).toContain('no está en dueno_preguntas')
    expect(revisarDespues(viejas, [{ ...nuevas[0], estado: 'descartada' }, ...nuevas.slice(1)], fichas).problemas[0]).toContain('estado respondida → descartada')
    expect(revisarDespues(viejas, [{ ...nuevas[0], respuesta: 'otra' }, ...nuevas.slice(1)], fichas).problemas[0]).toContain('no coincide')
    expect(revisarDespues(viejas, [{ ...nuevas[0], ficha_ref: 'f2' }, ...nuevas.slice(1)], fichas).problemas[0]).toContain('ficha')
    expect(revisarDespues(viejas, [nuevas[0], { ...nuevas[1], motivo: '' }, nuevas[2]], fichas).problemas[0]).toContain('sin motivo')
  })
})

describe('la migración (texto del SQL)', () => {
  const sql = readFileSync('supabase/migrations/202611062000_preguntas_del_dueno_a_la_plataforma.sql', 'utf8')
  it('se detiene si no existe la tabla de CC1, conserva el id y no pisa filas ya movidas', () => {
    expect(sql).toMatch(/to_regclass\('public\.dueno_preguntas'\) is null then\s+raise exception/)
    expect(sql).toMatch(/select\s+p\.id, p\.client_id/)
    expect(sql).toContain('on conflict (id) do nothing')
  })
  it('la respuesta sale de la ficha del dueño y la ficha queda como ficha_ref; las obsoletas llevan motivo', () => {
    expect(sql).toContain("when p.estado = 'respondida' then nullif(f.provenance_tag->'datos'->>'respuesta', '')")
    expect(sql).toContain("when p.estado = 'respondida' then p.ficha_id")
    expect(sql).toMatch(/when p\.estado = 'obsoleta' then coalesce\(nullif\(p\.motivo_descarte, ''\), '[^']+'\)/)
  })
  it('comprueba lo movido dentro de la misma transacción y deja la tabla vieja de solo lectura', () => {
    expect(sql).toMatch(/^begin;/m)
    expect(sql).toMatch(/^commit;/m)
    expect(sql).toContain("raise exception 'migración incompleta")
    expect(sql).toContain('revoke insert, update, delete on public.cerebro_dueno_preguntas')
    expect(sql).toMatch(/create trigger cerebro_dueno_preguntas_solo_lectura before insert or update or delete/)
    expect(sql).not.toMatch(/\b(delete from|drop table|truncate)\b/i)
  })
})
