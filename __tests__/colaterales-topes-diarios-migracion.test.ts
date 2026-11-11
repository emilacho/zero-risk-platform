/**
 * COLATERALES 2d · la migración del TOPE DIARIO por cliente (RESPUESTA Lenovo 11-nov 03:02Z: US$ 5, dato configurable por cliente).
 * Fija: el valor por omisión es 5 y hay UNA sola fila por omisión; un tope por cliente; el valor va de >0 a 50; el servidor solo LEE
 * (cambiar un tope nunca lo hace el flujo); se quita todo a public/anon/authenticated antes; la reversa borra solo esta tabla y vive fuera de migrations.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SQL = readFileSync(join(process.cwd(), 'supabase/migrations/202611111300_colaterales_topes_diarios.sql'), 'utf8')
const REV = join(process.cwd(), 'supabase/reversas/202611111300_colaterales_topes_diarios_REVERSA.sql')
const sinComentarios = SQL.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')

describe('migración · colaterales_topes_diarios', () => {
  it('el valor por omisión es US$ 5, en UNA sola fila sin cliente, y no se duplica al repetir', () => {
    expect(sinComentarios).toMatch(/select null, 5, 'por omisión/)
    expect(sinComentarios).toMatch(/where not exists \(select 1 from public\.colaterales_topes_diarios where client_id is null\)/)
    expect(sinComentarios).toMatch(/unique index if not exists colaterales_topes_diarios_una_por_omision on public\.colaterales_topes_diarios \(\(client_id is null\)\) where client_id is null/)
    expect(sinComentarios).toMatch(/unique index if not exists colaterales_topes_diarios_un_cliente on public\.colaterales_topes_diarios \(client_id\) where client_id is not null/)
  })
  it('el tope va de más de 0 a 50 y lleva motivo', () => {
    expect(sinComentarios).toMatch(/check \(tope_usd > 0 and tope_usd <= 50\)/)
    expect(sinComentarios).toMatch(/motivo text not null/)
    expect(sinComentarios).toMatch(/check \(length\(btrim\(motivo\)\) > 0\)/)
  })
  it('🔴 permisos: se quita todo antes; el servidor SOLO lee (ni insert, ni update, ni delete)', () => {
    expect(sinComentarios).toMatch(/enable row level security/)
    expect(sinComentarios).toMatch(/revoke all on public\.colaterales_topes_diarios from public, anon, authenticated, service_role;/)
    const grants = sinComentarios.match(/grant [^;]+;/g) ?? []
    expect(grants).toEqual(['grant select on public.colaterales_topes_diarios to service_role;'])
    expect(sinComentarios).toMatch(/for select to service_role using \(true\)/)
    expect(sinComentarios).not.toMatch(/for all to/)
    expect(sinComentarios.indexOf('revoke all')).toBeLessThan(sinComentarios.indexOf('grant select'))
  })
  it('un cliente con tope no se borra en cascada; la reversa vive fuera de migrations y borra solo esta tabla', () => {
    expect(sinComentarios).toMatch(/references public\.clients\(id\) on delete restrict/)
    expect(existsSync(REV)).toBe(true)
    const r = readFileSync(REV, 'utf8').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    expect(r.match(/drop table[^;]+;/g)).toEqual(['drop table if exists public.colaterales_topes_diarios;'])
  })
})
