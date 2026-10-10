/**
 * `agents_model_check` + claude-sonnet-5-5 · la FORMA de la migración y de su reversa (pruebas permanentes).
 * La migración queda SIN APLICAR. Debe SOLO ampliar la lista (los 7 ids de siempre + uno), tocar solo `agents`, y la reversa debe negarse a romper datos.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = process.cwd()
const MIGRACION = 'supabase/migrations/202610100100_agents_model_check_sonnet_5_5.sql'
const REVERSA = 'supabase/reversas/202610100100_agents_model_check_sonnet_5_5_REVERSA.sql'
const sql = (rel: string): string => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r/g, '').split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')
const ids = (s: string): string[] => [...(/ARRAY\[([\s\S]*?)\]/.exec(s)?.[1] ?? '').matchAll(/'([^']+)'::text/g)].map((m) => m[1])
const ANTES = ['claude-haiku', 'claude-sonnet', 'claude-opus', 'claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-6', 'claude-opus-4-7']

describe('migración agents_model_check', () => {
  it('existe y la reversa NO está en supabase/migrations', () => {
    expect(fs.existsSync(path.join(RAIZ, MIGRACION))).toBe(true)
    expect(fs.existsSync(path.join(RAIZ, REVERSA))).toBe(true)
    expect(fs.readdirSync(path.join(RAIZ, 'supabase/migrations')).filter((f) => /(^|_)REVERSA(_|\.)/i.test(f))).toEqual([])
  })
  it('conserva los 7 ids y agrega EXACTAMENTE claude-sonnet-5-5', () => {
    expect(ids(sql(MIGRACION))).toEqual([...ANTES, 'claude-sonnet-5-5'])
  })
  it('toca solo la restricción de `agents`, en una transacción, sin tocar filas', () => {
    const s = sql(MIGRACION)
    expect(s).toMatch(/^\s*BEGIN;/m)
    expect(s).toMatch(/COMMIT;/)
    expect(new Set([...s.matchAll(/public\.([a-z_]+)/g)].map((m) => m[1]))).toEqual(new Set(['agents']))
    for (const prohibido of [/\bTRUNCATE\b/i, /\bDELETE\s+FROM\b/i, /\bUPDATE\s+[\w.]+\s+SET\b/i, /\bINSERT\s+INTO\b/i, /\bDROP\s+(TABLE|COLUMN)\b/i]) expect(s, String(prohibido)).not.toMatch(prohibido)
    expect(s.match(/DROP CONSTRAINT/g)?.length).toBe(1)
    expect(s.match(/ADD CONSTRAINT/g)?.length).toBe(1)
  })
  it('la reversa devuelve los 7 ids y SE NIEGA si algún agente usa el id nuevo', () => {
    const r = sql(REVERSA)
    expect(ids(r)).toEqual(ANTES)
    expect(r).toMatch(/SELECT count\(\*\) INTO n FROM public\.agents WHERE model = 'claude-sonnet-5-5'/)
    expect(r).toMatch(/RAISE EXCEPTION 'REVERSA ABORTADA/)
    expect(r.indexOf('RAISE EXCEPTION')).toBeLessThan(r.indexOf('DROP CONSTRAINT'))
  })
})
