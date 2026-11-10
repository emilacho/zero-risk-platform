/**
 * TOPE DEL ENCARGO HASTA US$ 20 (10-nov · «dale» de Emilio, GO de Lenovo + ADENDA 2 + respuesta 09:12Z) · la FORMA de la migración y de su reversa.
 * Sube a 20 el máximo de las DOS reglas que guardan el tope del encargo (la del encargo y la de la plantilla). No toca datos, plantillas ni valores por omisión.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = process.cwd()
const MIGRACION = 'supabase/migrations/202611100900_oficina_encargos_tope_20.sql'
const REVERSA = 'supabase/reversas/202611100900_oficina_encargos_tope_20_REVERSA.sql'
const sql = (rel: string): string => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r/g, '').split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')
const REGLAS = [
  { tabla: 'oficina_encargos', regla: 'oficina_encargos_tope_valido', columna: 'tope_usd' },
  { tabla: 'oficina_tipos_de_grupo', regla: 'oficina_tipos_tope_valido', columna: 'tope_encargo_usd' },
] as const

/** lee `alter table public.T add constraint R check (C > A and C <= B)` y la evalúa sobre un valor, como lo haría la base */
function regla(s: string, r: (typeof REGLAS)[number]): (v: number) => boolean {
  const re = new RegExp(`alter table public\\.${r.tabla} add constraint ${r.regla} check \\(${r.columna} > ([\\d.]+) and ${r.columna} <= ([\\d.]+)\\)`, 'gi')
  const m = [...s.matchAll(re)]
  expect(m, r.regla).toHaveLength(1)
  const [min, max] = [Number(m[0][1]), Number(m[0][2])]
  return (v) => v > min && v <= max
}

describe('la migración del tope 20', () => {
  it('existe, y su reversa vive fuera de supabase/migrations', () => {
    expect(fs.existsSync(path.join(RAIZ, MIGRACION))).toBe(true)
    expect(fs.existsSync(path.join(RAIZ, REVERSA))).toBe(true)
  })
  for (const r of REGLAS) {
    it(`${r.regla} acepta (0, 20]: 20 entra, 20,01 no; 0 y negativos no`, () => {
      const vale = regla(sql(MIGRACION), r)
      expect([0.01, 1.6, 5, 10, 10.01, 19.99, 20].every(vale)).toBe(true)
      expect([0, -1, 20.01, 25, 100].some(vale)).toBe(false)
    })
    it(`${r.regla} es repetible: se quita si está y se pone con el mismo nombre, dentro de la transacción`, () => {
      const s = sql(MIGRACION)
      const quitar = s.indexOf(`alter table public.${r.tabla} drop constraint if exists ${r.regla};`)
      const poner = s.indexOf(`alter table public.${r.tabla} add constraint ${r.regla}`)
      expect(s.match(/^begin;$/gm)).toHaveLength(1)
      expect(s.match(/^commit;$/gm)).toHaveLength(1)
      expect(quitar).toBeGreaterThan(s.indexOf('begin;'))
      expect(poner).toBeGreaterThan(quitar)
      expect(s.indexOf('commit;')).toBeGreaterThan(poner)
    })
  }
  it('las dos reglas dicen lo mismo', () => {
    const s = sql(MIGRACION)
    const [a, b] = REGLAS.map((r) => regla(s, r))
    for (const v of [0, 0.01, 10, 20, 20.01]) expect(a(v)).toBe(b(v))
  })
  it('no toca ningún tope vivo: ni datos, ni plantillas, ni valores por omisión, ni otras tablas', () => {
    const s = sql(MIGRACION)
    expect(s).not.toMatch(/\b(update|insert|delete|truncate)\b/i)
    expect(s).not.toMatch(/\bset default\b|\bdrop table\b|\bdrop column\b|\balter column\b/i)
    expect(new Set([...s.matchAll(/public\.([a-z_]+)/g)].map((m) => m[1]))).toEqual(new Set(['oficina_encargos', 'oficina_tipos_de_grupo']))
    expect([...s.matchAll(/^alter table/gim)]).toHaveLength(4)
  })
  it('la migración de origen no se reescribe (sigue diciendo 10 en las dos)', () => {
    const o = sql('supabase/migrations/202610090100_oficina_sala_1.sql')
    expect(o).toMatch(/tope_usd > 0 AND tope_usd <= 10/)
    expect(o).toMatch(/tope_encargo_usd > 0 AND tope_encargo_usd <= 10/)
  })
})

describe('la reversa', () => {
  it('vuelve las dos reglas a 10', () => {
    const s = sql(REVERSA)
    for (const r of REGLAS) {
      const vale = regla(s, r)
      expect(vale(10)).toBe(true)
      expect(vale(10.01)).toBe(false)
    }
  })
  it('se niega si algún encargo o plantilla ya pasó de 10, antes de cambiar nada (no reescribe datos)', () => {
    const s = sql(REVERSA)
    expect(s).toMatch(/if exists \(select 1 from public\.oficina_encargos where tope_usd > 10\) then\s+raise exception/i)
    expect(s).toMatch(/if exists \(select 1 from public\.oficina_tipos_de_grupo where tope_encargo_usd > 10\) then\s+raise exception/i)
    expect(s.lastIndexOf('raise exception')).toBeLessThan(s.indexOf('drop constraint'))
    expect(s).not.toMatch(/\b(update|delete|truncate)\b/i)
  })
})
