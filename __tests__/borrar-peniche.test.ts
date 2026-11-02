/** 02-nov · borrar Peniche, opción A: se lee la migración real. Quedan los importes con su fecha; nada más. */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SQL = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '202611020400_borrar_peniche_opcion_a.sql'), 'utf8').replace(/\r/g, '')
const CUERPO = SQL.split('\n').filter((l) => !l.startsWith('--')).join('\n')

describe('🔴 borrar Peniche', () => {
  it('🔴 no toca la libreta de costos, ni como permiso', () => {
    expect(CUERPO).not.toMatch(/brain_embed_costs/)
    expect(CUERPO).not.toMatch(/\b(GRANT|REVOKE|DISABLE|ALTER)\b/i)
  })
  it('🔴 el libro y los costos conservan el importe y la fecha: solo se vacían textos, sin borrar filas', () => {
    expect(CUERPO).not.toMatch(/DELETE FROM public\.(agent_invocations|costs|clients)/)
    const libro = /UPDATE public\.agent_invocations x\nSET ([^\n]*)\n/.exec(CUERPO)![1]
    for (const c of ['cost_usd', 'started_at', 'ended_at', 'tokens_input', 'tokens_output', 'model', 'client_id', 'created_at']) expect(libro).not.toContain(c)
    for (const c of ['system_prompt', 'input_summary', 'output_summary', 'metadata', 'command', 'error_message']) expect(libro).toContain(`${c} = NULL`)
    expect(/UPDATE public\.costs x SET ([^W]*)WHERE/.exec(CUERPO)![1]).not.toMatch(/amount|date/)
  })
  it('🔴 la ficha sobrevive sin datos y sigue de baja', () => {
    expect(CUERPO).toMatch(/UPDATE public\.clients[\s\S]*WHERE id = 'e388a370-910f-4ee7-9a48-4a79393b8cb4' AND status = 'churned'/)
    for (const c of ['website_url', 'industry', 'country', 'brand_voice', 'logo_url']) expect(CUERPO).toContain(`${c} = NULL`)
    expect(CUERPO).toContain("config = '{}'::jsonb")
    expect(/SET name = '([^']*)'/.exec(CUERPO)![1]).not.toMatch(/peniche/i)
  })
  it('incluye la segunda ficha', () => expect(CUERPO).toContain('53b05ecb-670a-4411-8a94-427e8dea6d2b'))
  it('🔴 si un conteo no calza, aborta antes de escribir', () => {
    for (const [t, n] of [['agent_invocations', 87], ['agents_log', 98], ['costs', 6], ['cowork_messages', 4], ['ingress_quarantine', 1]] as const) expect(CUERPO).toMatch(new RegExp(`IF n <> ${n} THEN RAISE EXCEPTION '${t}`))
    expect(CUERPO.indexOf('RAISE EXCEPTION')).toBeLessThan(CUERPO.indexOf('UPDATE public.agent_invocations'))
    expect(CUERPO).toContain('BEGIN;')
    expect(CUERPO.indexOf('BEGIN;')).toBeLessThan(CUERPO.indexOf('DO $$'))
    expect(CUERPO.trim().endsWith('COMMIT;')).toBe(true)
  })
  it('🔴 comprueba al final que no quedó texto', () => expect(CUERPO).toMatch(/quedó texto en agent_invocations[\s\S]*quedó texto en clients[\s\S]*quedó texto en costs/))
})
