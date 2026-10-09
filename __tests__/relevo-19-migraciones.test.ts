/**
 * RELEVO 19 · la FORMA de las 2 migraciones (reconfirmación de sedes · toma de las fotos) y de sus reversas. Pruebas permanentes, US$ 0, no tocan ninguna base.
 * Lo que cuidan: SOLO aditivas, anulables, repetibles, sin valor por defecto, con su restricción de valores en la misma sentencia, y reversas que se niegan a borrar datos.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = process.cwd()
const leer = (rel: string): string => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r/g, '')
const sql = (rel: string): string => leer(rel).split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')

const SEDES = { mig: 'supabase/migrations/202610080200_sede_datos_reconfirmado.sql', rev: 'supabase/reversas/202610080200_sede_datos_reconfirmado_REVERSA.sql' }
const FOTOS = { mig: 'supabase/migrations/202610080300_cerebro_fotos_toma.sql', rev: 'supabase/reversas/202610080300_cerebro_fotos_toma_REVERSA.sql' }

describe('ninguna reversa vive dentro de supabase/migrations (una herramienta la correría sola)', () => {
  it('existen las 4 piezas y en migrations no hay nada «de bajada»', () => {
    for (const r of [SEDES.mig, SEDES.rev, FOTOS.mig, FOTOS.rev]) expect(fs.existsSync(path.join(RAIZ, r)), r).toBe(true)
    expect(fs.readdirSync(path.join(RAIZ, 'supabase/migrations')).filter((f) => /(^|_)(REVERSA|down|rollback)(_|\.)/i.test(f))).toEqual([])
  })
})

describe('reconfirmación de sedes · client_sede_datos.reconfirmado_en', () => {
  const s = sql(SEDES.mig)
  it('agrega UNA columna timestamptz anulable, con IF NOT EXISTS, sobre client_sede_datos y nada más', () => {
    expect(s.match(/ALTER TABLE/g)).toHaveLength(1)
    expect(/ALTER TABLE public\.client_sede_datos\s+ADD COLUMN IF NOT EXISTS\s+reconfirmado_en\s+timestamptz\s*;/.test(s)).toBe(true)
    expect(s).not.toMatch(/NOT NULL|\bDEFAULT\b|REFERENCES|\bUNIQUE\b|CREATE\s+(UNIQUE\s+)?INDEX|\bTRIGGER\b|\bGENERATED\b|\bDROP\b|\bDELETE\b|\bUPDATE\b|\bINSERT\b|\bTRUNCATE\b/i)
  })
  it('una sola transacción y recarga el catálogo de PostgREST al final', () => {
    expect(s.match(/\bBEGIN\b/g)).toHaveLength(1)
    expect(s.match(/\bCOMMIT\b/g)).toHaveLength(1)
    expect(s).toMatch(/NOTIFY pgrst, 'reload schema'/)
  })
  it('la reversa se NIEGA a borrar si hay datos y después quita solo esa columna', () => {
    const r = sql(SEDES.rev)
    expect(r).toMatch(/RAISE EXCEPTION 'REVERSA ABORTADA/)
    expect(r).toMatch(/WHERE reconfirmado_en IS NOT NULL/)
    expect(r.indexOf('RAISE EXCEPTION')).toBeLessThan(r.indexOf('DROP COLUMN'))
    expect([...r.matchAll(/DROP COLUMN IF EXISTS\s+(\w+)/g)].map((m) => m[1])).toEqual(['reconfirmado_en'])
    expect(r).not.toMatch(/\bDROP TABLE\b|\bTRUNCATE\b|\bDELETE\b/i)
  })
})

describe('la toma de las fotos · con_personas, tipo_de_toma, formato', () => {
  const s = sql(FOTOS.mig)
  it('agrega EXACTAMENTE esas 3 columnas, con IF NOT EXISTS, en UN solo ALTER sobre client_social_images', () => {
    expect(s.match(/ALTER TABLE/g)).toHaveLength(1)
    const alter = /ALTER TABLE public\.client_social_images([\s\S]*?);/.exec(s)?.[1] ?? ''
    const agregadas = [...alter.matchAll(/ADD COLUMN IF NOT EXISTS\s+([a-z_]+)\s+(\w+)/g)].map((m) => [m[1], m[2]])
    expect(agregadas).toEqual([['con_personas', 'boolean'], ['tipo_de_toma', 'text'], ['formato', 'text']])
    expect(alter.match(/ADD COLUMN/g)).toHaveLength(3)
  })
  it('ninguna es NOT NULL ni lleva valor por defecto, llave, índice o disparador', () => {
    expect(s).not.toMatch(/NOT NULL|\bDEFAULT\b|REFERENCES|\bUNIQUE\b|CREATE\s+(UNIQUE\s+)?INDEX|\bTRIGGER\b|\bGENERATED\b|\bDROP\b|\bDELETE\b|\bUPDATE\b|\bINSERT\b|\bTRUNCATE\b/i)
  })
  it('tipo_de_toma y formato admiten SOLO su lista (y NULL), con la restricción en la misma sentencia (así es repetible)', () => {
    const tipo = /ADD COLUMN IF NOT EXISTS\s+tipo_de_toma\s+text\s+CONSTRAINT\s+(\w+)\s+CHECK\s*\(([^;]*?)\)\s*,/.exec(s)
    expect(tipo, 'la restricción debe ir en el ADD COLUMN de tipo_de_toma').not.toBeNull()
    expect(tipo![2]).toMatch(/IS NULL/)
    expect([...tipo![2].matchAll(/'(\w+)'/g)].map((m) => m[1]).sort()).toEqual(['ambiente', 'otro', 'personas', 'producto', 'texto_afiche'])
    const formato = /ADD COLUMN IF NOT EXISTS\s+formato\s+text\s+CONSTRAINT\s+(\w+)\s+CHECK\s*\(([^;]*?)\)\s*;/.exec(s)
    expect(formato, 'la restricción debe ir en el ADD COLUMN de formato').not.toBeNull()
    expect(formato![2]).toMatch(/IS NULL/)
    expect([...formato![2].matchAll(/'(\w+)'/g)].map((m) => m[1]).sort()).toEqual(['cuadrado', 'horizontal', 'vertical'])
  })
  it('los valores de la lista son los MISMOS que acepta el escritor del código (una sola fuente de verdad probada)', async () => {
    const { TIPOS_DE_TOMA_VALIDOS } = await import('../src/lib/cerebro/portero/etiqueta-escritura')
    const { FORMATOS_VALIDOS } = await import('../src/lib/cerebro/portero/formato')
    const tipo = /tipo_de_toma\s+IN\s*\(([^)]*)\)/.exec(s)?.[1] ?? ''
    const formato = /formato\s+IN\s*\(([^)]*)\)/.exec(s)?.[1] ?? ''
    expect([...tipo.matchAll(/'(\w+)'/g)].map((m) => m[1]).sort()).toEqual([...TIPOS_DE_TOMA_VALIDOS].sort())
    expect([...formato.matchAll(/'(\w+)'/g)].map((m) => m[1]).sort()).toEqual([...FORMATOS_VALIDOS].sort())
  })
  it('una sola transacción y recarga el catálogo de PostgREST al final', () => {
    expect(s.match(/\bBEGIN\b/g)).toHaveLength(1)
    expect(s.match(/\bCOMMIT\b/g)).toHaveLength(1)
    expect(s).toMatch(/NOTIFY pgrst, 'reload schema'/)
  })
  it('la reversa se NIEGA a borrar si alguna columna tiene datos y después quita solo esas 3', () => {
    const r = sql(FOTOS.rev)
    expect(r).toMatch(/RAISE EXCEPTION 'REVERSA ABORTADA/)
    expect(r).toMatch(/ARRAY\['con_personas','tipo_de_toma','formato'\]/)
    expect(r.indexOf('RAISE EXCEPTION')).toBeLessThan(r.indexOf('DROP COLUMN'))
    expect([...r.matchAll(/DROP COLUMN IF EXISTS\s+(\w+)/g)].map((m) => m[1])).toEqual(['con_personas', 'tipo_de_toma', 'formato'])
    expect(r).not.toMatch(/\bDROP TABLE\b|\bTRUNCATE\b|\bDELETE\b/i)
  })
})
