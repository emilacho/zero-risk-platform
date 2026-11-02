/** 02-nov · la limpieza, fase 2: se lee la migración real. Nada se borra y solo se tocan las filas firmadas. */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = path.join(__dirname, '..', 'supabase')
const SQL = fs.readFileSync(path.join(RAIZ, 'migrations', '202611020300_limpieza_fase_2.sql'), 'utf8').replace(/\r/g, '')
const REV = fs.readFileSync(path.join(RAIZ, 'reversas', '202611020300_limpieza_fase_2_REVERSA.sql'), 'utf8').replace(/\r/g, '')
const CUERPO = SQL.split('\n').filter((l) => !l.startsWith('--')).join('\n')

describe('🔴 la limpieza', () => {
  it('no borra nada', () => {
    expect(CUERPO).not.toMatch(/\b(DELETE|DROP|TRUNCATE)\b/i)
    expect(REV).not.toMatch(/\b(DELETE|DROP|TRUNCATE)\b/i)
  })
  it('🔴 cierra exactamente las 2 decisiones firmadas, solo si siguen pendientes y como vencidas', () => {
    expect(CUERPO.match(/UPDATE public\.hitl_queue/g)).toHaveLength(2)
    for (const id of ['a27d3ed8-52bc-44a7-9f38-e0f639404573', '9ccb6924-d876-4c8a-8773-a69b0ecdab76']) expect(CUERPO).toContain(`WHERE id = '${id}' AND status = 'pending'`)
    expect(CUERPO.match(/'vencida', true/g)).toHaveLength(2)
  })
  it('🔴 no toca el plan pendiente de Náufrago, Peniche, GoEurope ni el cerebro', () => {
    for (const x of ['d4e17753', 'e388a370', '534362db', 'a7ad4331', 'cerebro_', 'client_brain', 'contexto_del_cliente', 'bodega']) expect(CUERPO).not.toContain(x)
  })
  it('🔴 rotula solo las 3 fichas viejas, nunca la real', () => {
    expect(CUERPO.match(/SET name = 'ARCHIVADA 2026-11-02/g)).toHaveLength(3)
    expect(SQL).not.toContain('df7e47cc')
    expect(CUERPO.match(/AND status = 'churned'/g)).toHaveLength(3)
  })
  it('da de baja la ficha de prueba y cierra el encargo de finanzas', () => {
    expect(CUERPO).toMatch(/SET status = 'churned' WHERE id = 'a0000000-0000-4000-8000-0000000000e1' AND status = 'onboarding'/)
    expect(CUERPO).toMatch(/SET estado = 'cerrado'.*WHERE id = 'd7c7187a-e8ae-47b1-bf81-d05c66778754' AND estado = 'en_curso'/)
  })
  it('🔴 la reversa devuelve todo, y solo lo que cerró esta limpieza', () => {
    expect(REV.match(/AND resolved_by = 'sistema · limpieza'/g)).toHaveLength(2)
    expect(REV.match(/AND name LIKE 'ARCHIVADA 2026-11-02%'/g)).toHaveLength(3)
    expect(REV).toMatch(/SET status = 'onboarding' WHERE id = 'a0000000-0000-4000-8000-0000000000e1'/)
    expect(REV).toMatch(/SET estado = 'en_curso' WHERE id = 'd7c7187a-e8ae-47b1-bf81-d05c66778754'/)
  })
})
