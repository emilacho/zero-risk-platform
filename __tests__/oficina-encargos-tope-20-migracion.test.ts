/**
 * TOPE DEL ENCARGO HASTA US$ 20 (10-nov · «dale» de Emilio, GO de Lenovo + ADENDA 2) · la FORMA de la migración y de su reversa.
 * Solo sube el máximo que la base acepta para `oficina_encargos.tope_usd` de 10 a 20. No toca datos, plantillas ni valores por omisión.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = process.cwd()
const MIGRACION = 'supabase/migrations/202611100900_oficina_encargos_tope_20.sql'
const REVERSA = 'supabase/reversas/202611100900_oficina_encargos_tope_20_REVERSA.sql'
const sql = (rel: string): string => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r/g, '').split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')

/** lee la regla `check (tope_usd > A and tope_usd <= B)` y la evalúa sobre un valor, como lo haría la base */
function regla(s: string): (v: number) => boolean {
  const m = [...s.matchAll(/add constraint oficina_encargos_tope_valido check \(tope_usd > ([\d.]+) and tope_usd <= ([\d.]+)\)/gi)]
  expect(m).toHaveLength(1)
  const [min, max] = [Number(m[0][1]), Number(m[0][2])]
  return (v) => v > min && v <= max
}

describe('la migración del tope 20', () => {
  it('existe, y su reversa vive fuera de supabase/migrations', () => {
    expect(fs.existsSync(path.join(RAIZ, MIGRACION))).toBe(true)
    expect(fs.existsSync(path.join(RAIZ, REVERSA))).toBe(true)
  })
  it('acepta topes en (0, 20]: 20 entra, 20,01 no; 0 y negativos no', () => {
    const vale = regla(sql(MIGRACION))
    expect([0.01, 1.6, 5, 10, 10.01, 19.99, 20].every(vale)).toBe(true)
    expect([0, -1, 20.01, 25, 100].some(vale)).toBe(false)
  })
  it('es repetible y en una sola transacción: quita la regla si está y la pone con el mismo nombre', () => {
    const s = sql(MIGRACION)
    expect(s).toMatch(/begin;[\s\S]*drop constraint if exists oficina_encargos_tope_valido;[\s\S]*add constraint oficina_encargos_tope_valido[\s\S]*commit;/i)
  })
  it('no toca ningún tope vivo: ni datos, ni plantillas, ni valores por omisión, ni otra tabla', () => {
    const s = sql(MIGRACION)
    expect(s).not.toMatch(/\b(update|insert|delete|truncate)\b/i)
    expect(s).not.toMatch(/\bset default\b|\bdrop table\b|\bdrop column\b/i)
    expect([...s.matchAll(/public\.([a-z_]+)/g)].map((m) => m[1])).toEqual(['oficina_encargos', 'oficina_encargos'])
    expect(s).not.toMatch(/oficina_tipos_de_grupo|tope_encargo_usd/)
  })
  it('la migración de origen no se reescribe (sigue diciendo 10)', () => {
    expect(sql('supabase/migrations/202610090100_oficina_sala_1.sql')).toMatch(/tope_usd > 0 AND tope_usd <= 10/)
  })
})

describe('la reversa', () => {
  it('vuelve el máximo a 10 y se niega si algún encargo ya pasó de 10 (no reescribe datos)', () => {
    const s = sql(REVERSA)
    const vale = regla(s)
    expect(vale(10)).toBe(true)
    expect(vale(10.01)).toBe(false)
    expect(s).toMatch(/if exists \(select 1 from public\.oficina_encargos where tope_usd > 10\) then\s+raise exception/i)
    expect(s.indexOf('raise exception')).toBeLessThan(s.indexOf('drop constraint'))
    expect(s).not.toMatch(/\b(update|delete|truncate)\b/i)
  })
})
