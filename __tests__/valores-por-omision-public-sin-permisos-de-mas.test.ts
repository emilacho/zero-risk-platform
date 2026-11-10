/**
 * GO-LENOVO 10-nov 18:14Z punto 2 · la raíz: los valores por omisión de `postgres` en `public` dejan de dar permisos de más a lo que NACE.
 * Medido en vivo 10-nov 18:32Z: tablas `service_role=Dxtm` · contadores `anon=w, authenticated=w, service_role=w`.
 * Solo `postgres` en `public`; `supabase_admin` y los demás esquemas quedan fuera. La reversa vuelve exactamente a lo medido.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const N = '202611102300_valores_por_omision_public_sin_permisos_de_mas'
const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r/g, '')
const sentencias = (s: string) => s.replace(/--.*$/gm, '').split('\n').map((l) => l.trim()).filter(Boolean)
const MIG = sentencias(leer(`supabase/migrations/${N}.sql`))
const REV = sentencias(leer(`supabase/reversas/${N}_REVERSA.sql`))

const LETRA: Record<string, string> = { select: 'r', insert: 'a', update: 'w', delete: 'd', truncate: 'D', references: 'x', trigger: 't', maintain: 'm', usage: 'U' }
type Acl = Record<string, string> // rol → letras
const MEDIDO: { tables: Acl; sequences: Acl } = {
  tables: { postgres: 'arwdDxtm', service_role: 'Dxtm' },
  sequences: { postgres: 'rwU', anon: 'w', authenticated: 'w', service_role: 'w' },
}
const ord = (x: string) => [...x].sort().join('')
/** aplica las sentencias «alter default privileges for role postgres in schema public …» sobre los valores medidos */
function aplicar(base: typeof MEDIDO, sql: string[]) {
  const out = { tables: { ...base.tables }, sequences: { ...base.sequences } }
  for (const s of sql) {
    if (s === 'begin;' || s === 'commit;') continue
    const m = /^alter default privileges for role postgres in schema public (revoke|grant) (.+?) on (tables|sequences) (?:from|to) (.+);$/.exec(s)
    if (!m) throw new Error(`sentencia no esperada: ${s}`)
    const letras = m[2]!.split(',').map((p) => LETRA[p.trim()]!)
    for (const rol of m[4]!.split(',').map((r) => r.trim())) {
      let a = out[m[3] as 'tables' | 'sequences'][rol] ?? ''
      for (const l of letras) a = m[1] === 'revoke' ? a.replace(l, '') : a.includes(l) ? a : a + l
      if (a) out[m[3] as 'tables' | 'sequences'][rol] = ord(a)
      else delete out[m[3] as 'tables' | 'sequences'][rol]
    }
  }
  for (const k of ['tables', 'sequences'] as const) for (const r of Object.keys(out[k])) out[k][r] = ord(out[k][r]!)
  return out
}
const normal = (x: typeof MEDIDO) => aplicar(x, [])

describe('migración: una transacción, solo lo que NACE de postgres en public', () => {
  it('begin, las dos sentencias exactas, commit', () => {
    expect(MIG).toEqual([
      'begin;',
      'alter default privileges for role postgres in schema public revoke truncate, references, trigger, maintain on tables from service_role;',
      'alter default privileges for role postgres in schema public revoke update on sequences from anon, authenticated, service_role;',
      'commit;',
    ])
  })
  it('🔴 lo que nace después: tablas y contadores solo para el dueño (nadie más con nada)', () => {
    const d = aplicar(MEDIDO, MIG)
    expect(d.tables).toEqual({ postgres: ord('arwdDxtm') })
    expect(d.sequences).toEqual({ postgres: ord('rwU') })
  })
  it('no toca supabase_admin, otros esquemas, objetos existentes, funciones ni el cerebro', () => {
    const texto = MIG.join('\n')
    expect(texto).not.toMatch(/supabase_admin|storage|naufrago|extensions|graphql|realtime|auth\b|cerebro_|client_voc_|\bon\s+(table|sequence)\s+public\.|functions|routines|policy/i)
    expect(texto).not.toMatch(/^(revoke|grant)\s/m) // solo valores por omisión: ningún objeto existente
  })
})

describe('reversa = lo medido', () => {
  it('una transacción que vuelve exactamente a los valores medidos el 10-nov 18:32Z', () => {
    expect(REV[0]).toBe('begin;')
    expect(REV.at(-1)).toBe('commit;')
    expect(aplicar(aplicar(MEDIDO, MIG), REV)).toEqual(normal(MEDIDO))
  })
})
