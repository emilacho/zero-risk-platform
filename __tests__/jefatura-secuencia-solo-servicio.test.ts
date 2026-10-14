/**
 * JEFATURA · reparo menor de CC#3 (§8 nota 1): la secuencia `jefatura_pasos_id_seq` queda solo para el servicio. Migración y reversa PREPARADAS, no aplicadas.
 * Se prueba el texto: qué toca (solo esa secuencia), a quién se lo quita, que el servicio conserva lo que necesita (el `insert` de pasos usa la secuencia) y que no hay DDL ni datos.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const lf = (s: string) => s.split('\r\n').join('\n')
const sql = lf(fs.readFileSync('supabase/migrations/202610141100_jefatura_pasos_secuencia_solo_servicio.sql', 'utf8'))
const rev = lf(fs.readFileSync('supabase/reversas/202610141100_jefatura_pasos_secuencia_solo_servicio_REVERSA.sql', 'utf8'))
const j1 = lf(fs.readFileSync('supabase/migrations/202610131000_jefatura_revision_oficina_propia.sql', 'utf8'))
const codigo = (s: string) => s.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n')

describe('secuencia de los pasos de la jefatura · solo el servicio', () => {
  it('quita TODO a PUBLIC, anon y authenticated sobre esa secuencia, y le deja al servicio lo que necesita para insertar pasos', () => {
    expect(codigo(sql)).toMatch(/REVOKE ALL ON SEQUENCE public\.jefatura_pasos_id_seq FROM PUBLIC, anon, authenticated;/)
    expect(codigo(sql)).toMatch(/GRANT USAGE, SELECT ON SEQUENCE public\.jefatura_pasos_id_seq TO service_role;/)
    expect(codigo(sql)).toContain("NOTIFY pgrst, 'reload schema';")
  })
  it('no toca ninguna otra cosa: ni tablas, ni datos, ni otra secuencia, ni políticas', () => {
    const c = codigo(sql)
    for (const prohibido of [/CREATE\s/i, /ALTER\s/i, /DROP\s/i, /INSERT\s/i, /UPDATE\s/i, /DELETE\s/i, /TRUNCATE/i, /ENABLE ROW LEVEL/i]) expect(c).not.toMatch(prohibido)
    expect([...c.matchAll(/SEQUENCE ([\w.]+)/g)].map((m) => m[1])).toEqual(['public.jefatura_pasos_id_seq', 'public.jefatura_pasos_id_seq'])
  })
  it('coincide con lo que J1 ya da al servicio (no quita lo que J1 concedió)', () => {
    expect(j1).toContain('GRANT USAGE, SELECT ON SEQUENCE public.jefatura_pasos_id_seq TO service_role;')
  })
  it('la reversa devuelve el valor por omisión de la plataforma y no toca nada más', () => {
    expect(codigo(rev)).toMatch(/GRANT USAGE, SELECT, UPDATE ON SEQUENCE public\.jefatura_pasos_id_seq TO anon, authenticated;/)
    expect(codigo(rev)).not.toMatch(/REVOKE|CREATE|DROP|DELETE|INSERT/i)
  })
  it('cada archivo dice que NO está aplicado y cuándo se aplica', () => { expect(sql).toMatch(/NO APLICADA/); expect(sql).toMatch(/jefatura apagada y 0 corridas/) })
})
