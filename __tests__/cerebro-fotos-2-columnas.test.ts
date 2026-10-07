/**
 * LAS 2 COLUMNAS DE FOTOS DEL CEREBRO (`texto_visible`, `etiqueta_confianza`) · la FORMA de la migración y de su reversa, y los guiones de auditoría extendidos.
 * Pruebas permanentes (escritas antes del SQL). Lo que cambia respecto del paso 2: SOLO 2 columnas, y una restricción de valores en `etiqueta_confianza`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const RAIZ = process.cwd()
const MIGRACION = 'supabase/migrations/202610070100_cerebro_fotos_texto_visible_y_etiqueta_confianza.sql'
const REVERSA = 'supabase/reversas/202610070100_cerebro_fotos_texto_visible_y_etiqueta_confianza_REVERSA.sql'
const leer = (rel: string): string => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r/g, '')
const sql = (rel: string): string => leer(rel).split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')
const COLUMNAS = ['texto_visible', 'etiqueta_confianza']

describe('la migración: SOLO 2 columnas, aditiva, repetible', () => {
  it('existe, y ni ella ni su reversa son una migración «de bajada» dentro de supabase/migrations', () => {
    expect(fs.existsSync(path.join(RAIZ, MIGRACION))).toBe(true)
    expect(fs.existsSync(path.join(RAIZ, REVERSA))).toBe(true)
    expect(fs.readdirSync(path.join(RAIZ, 'supabase/migrations')).filter((f) => /(^|_)(REVERSA|down|rollback)(_|\.)/i.test(f))).toEqual([])
  })
  it('agrega EXACTAMENTE texto_visible y etiqueta_confianza, ambas text, con IF NOT EXISTS, en UN solo ALTER sobre client_social_images', () => {
    const s = sql(MIGRACION)
    expect(s.match(/ALTER TABLE/g)).toHaveLength(1)
    const alter = /ALTER TABLE public\.client_social_images([\s\S]*?);/.exec(s)?.[1] ?? ''
    const agregadas = [...alter.matchAll(/ADD COLUMN IF NOT EXISTS\s+([a-z_]+)\s+(\w+)/g)].map((m) => [m[1], m[2]])
    expect(agregadas).toEqual([['texto_visible', 'text'], ['etiqueta_confianza', 'text']])
    expect(alter.match(/ADD COLUMN/g)).toHaveLength(2)
  })
  it('ninguna es NOT NULL ni lleva valor por defecto, llave, índice o disparador; texto_visible no lleva ninguna restricción', () => {
    const s = sql(MIGRACION)
    expect(s).not.toMatch(/NOT NULL|\bDEFAULT\b|REFERENCES|\bUNIQUE\b|CREATE\s+(UNIQUE\s+)?INDEX|\bTRIGGER\b|\bGENERATED\b/i)
    const linea = (c: string) => s.split('\n').find((l) => new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${c}\\b`).test(l)) ?? ''
    expect(linea('texto_visible')).not.toMatch(/CHECK|CONSTRAINT/i)
  })
  it('etiqueta_confianza solo admite alta | media | baja (y NULL), con la restricción en la misma sentencia (así es repetible)', () => {
    const s = sql(MIGRACION)
    const m = /ADD COLUMN IF NOT EXISTS\s+etiqueta_confianza\s+text\s+CONSTRAINT\s+(\w+)\s+CHECK\s*\(([^;]*?)\)\s*;/.exec(s)
    expect(m, 'la restricción debe ir en el ADD COLUMN de etiqueta_confianza').not.toBeNull()
    expect(m![1]).toBe('client_social_images_etiqueta_confianza_valida')
    expect(m![2]).toMatch(/etiqueta_confianza IS NULL OR etiqueta_confianza IN \('alta','media','baja'\)/)
    expect([...m![2].matchAll(/'([a-z]+)'/g)].map((x) => x[1])).toEqual(['alta', 'media', 'baja'])
    expect(s).not.toMatch(/ADD CONSTRAINT/i)
  })
  it('no cambia, borra ni endurece nada de lo que ya existe, y solo nombra client_social_images', () => {
    const s = sql(MIGRACION)
    for (const prohibido of [/\bDROP\b/i, /ALTER\s+COLUMN/i, /\bSET\s+NOT\s+NULL\b/i, /\bALTER\s+TYPE\b/i, /\bTRUNCATE\b/i, /\bDELETE\s+FROM\b/i, /\bUPDATE\s+[\w.]+\s+SET\b/i, /\bRENAME\b/i, /\bCREATE\s+(OR\s+REPLACE\s+)?(TRIGGER|FUNCTION|VIEW|MATERIALIZED|TABLE|POLICY|EXTENSION)/i, /\bINSERT\s+INTO\b/i, /\bGRANT\b|\bREVOKE\b|\bENABLE ROW LEVEL\b/i]) {
      expect(s, String(prohibido)).not.toMatch(prohibido)
    }
    expect([...new Set([...s.matchAll(/public\.([a-z_]+)/g)].map((m) => m[1]))]).toEqual(['client_social_images'])
  })
  it('una transacción, con el aviso de recarga al final; y su encabezado dice NO APLICADA y apunta al mapa', () => {
    const s = sql(MIGRACION)
    expect(s.indexOf('BEGIN;')).toBeGreaterThan(-1)
    expect(s.indexOf('BEGIN;')).toBeLessThan(s.indexOf('ALTER TABLE'))
    expect(s.indexOf('COMMIT;')).toBeGreaterThan(s.indexOf('ADD COLUMN'))
    expect(leer(MIGRACION).trim().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
    expect(leer(MIGRACION)).toMatch(/NO APLICADA|PROPUESTA/)
    expect(leer(MIGRACION)).toMatch(/MAPA-2026-10-06-tablas-del-cerebro/)
  })
  it('no choca con las 4 columnas del paso 2 ni con ninguna columna de las 21 viejas', () => {
    const viejas = ['id', 'client_id', 'owner_role', 'handle', 'post_id', 'tipo', 'url', 'estado', 'causa', 'created_at', 'caption', 'posted_at', 'post_url', 'posicion', 'medio', 'hash_archivo', 'duplicado_de', 'producto', 'producto_fuente', 'producto_evidencia', 'contexto_completado_en', 'que_muestra', 'producto_visto', 'etiquetada_en', 'etiqueta_modelo']
    for (const c of COLUMNAS) expect(viejas).not.toContain(c)
  })
})

describe('la reversa: se NIEGA a borrar datos y quita SOLO las 2 columnas', () => {
  it('la guarda va ANTES del DROP y aborta si cualquiera de las 2 columnas tiene datos', () => {
    const s = sql(REVERSA)
    expect(s.indexOf('RAISE EXCEPTION')).toBeGreaterThan(-1)
    expect(s.indexOf('RAISE EXCEPTION')).toBeLessThan(s.indexOf('DROP COLUMN'))
    expect(s.match(/RAISE EXCEPTION/g)).toHaveLength(1)
    expect(s).toMatch(/IF n > 0 THEN RAISE EXCEPTION/) // la guarda salta con UNA sola fila con dato, no con «muchas»
    expect(s).toMatch(/RAISE EXCEPTION 'REVERSA ABORTADA: client_social_images\.%/)
    for (const c of COLUMNAS) expect(s).toContain(`'${c}'`)
    expect(leer(REVERSA)).toMatch(/Exportar antes de borrar/)
  })
  it('borra EXACTAMENTE las dos columnas que agregó la migración, sin CASCADE ni nada más', () => {
    const r = sql(REVERSA), m = sql(MIGRACION)
    const agregadas = [...(/ALTER TABLE public\.client_social_images([\s\S]*?);/.exec(m)?.[1] ?? '').matchAll(/ADD COLUMN IF NOT EXISTS\s+([a-z_]+)/g)].map((x) => x[1])
    const quitadas = [...r.matchAll(/DROP COLUMN IF EXISTS\s+([a-z_]+)/g)].map((x) => x[1])
    expect(quitadas.sort()).toEqual(agregadas.sort())
    expect(r.match(/\bDROP\b/gi)).toHaveLength(2)
    expect(r).not.toMatch(/\bCASCADE\b|\bTRUNCATE\b|\bDELETE\s+FROM\b|\bUPDATE\s+[\w.]+\s+SET\b|DROP\s+(TABLE|SCHEMA|DATABASE|ROLE|POLICY|INDEX|FUNCTION|VIEW|TRIGGER|CONSTRAINT)/i)
    expect(r).not.toMatch(/que_muestra|producto_visto|etiquetada_en|etiqueta_modelo|cerebro_ingresos|cerebro_fichas/) // no toca lo del paso 2
  })
  it('una transacción y termina con el aviso de recarga', () => {
    expect(sql(REVERSA)).toMatch(/\bBEGIN;/)
    expect(sql(REVERSA)).toMatch(/\bCOMMIT;/)
    expect(leer(REVERSA).trim().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
  })
})

describe('el aislamiento del paso 2 vigila también las 2 columnas', () => {
  const aislamiento = leer('__tests__/cerebro-paso-2-aislamiento.test.ts')
  it('NOMBRES_NUEVOS las incluye y la migración, la reversa y esta prueba están en la lista corta de quienes pueden nombrarlas', () => {
    expect(aislamiento).toMatch(/NOMBRES_NUEVOS = [^\n]*texto_visible[^\n]*etiqueta_confianza/)
    expect(aislamiento).toContain('202610070100_cerebro_fotos_texto_visible_y_etiqueta_confianza')
    expect(aislamiento).toContain('cerebro-fotos-2-columnas')
  })
  it('el guion de flujos vivos marca a un flujo que nombre cualquiera de las 2 columnas', async () => {
    const mod = await import(/* @vite-ignore */ pathToFileURL(path.join(RAIZ, 'scripts/audit/cerebro-tablas-no-las-usa-nadie.mjs')).href)
    for (const col of COLUMNAS) {
      const r = mod.revisarFlujos([{ id: 'x1', name: 'Usa la columna', active: true, versionId: 'a', nodes: [{ name: 'n', parameters: { jsCode: `fila.${col}` } }] }])
      expect(r.ok, col).toBe(false)
      expect(r.infracciones[0]).toMatchObject({ flujo: 'x1', tipo: 'nombra_algo_del_cerebro', detalle: col })
    }
    expect(mod.revisarFlujos([{ id: 'x2', name: 'Limpio', active: true, versionId: 'b', nodes: [{ name: 'n', parameters: { url: '.../rest/v1/client_social_images?select=id,url' } }] }]).ok).toBe(true)
  })
})

describe('la verificación de la base con --con-fotos-2', () => {
  type Estado = Record<string, any>
  const nuevaCol = (c: string) => ({ column_name: c, is_nullable: 'YES', column_default: null })
  const bueno = (): Estado => ({
    con_fotos_2: true,
    tablas: { cerebro_ingresos: { existe: true, filas: 0, rls: true, permisos_anon_authenticated: [], politicas: ['cerebro_ingresos_service'] }, cerebro_fichas: { existe: true, filas: 0, rls: true, permisos_anon_authenticated: [], politicas: ['cerebro_fichas_service'] } },
    columnas: ['que_muestra', 'producto_visto', 'etiquetada_en', 'etiqueta_modelo', 'texto_visible', 'etiqueta_confianza'].map(nuevaCol),
    columnas_con_dato: 0,
    restriccion_confianza: "CHECK (((etiqueta_confianza IS NULL) OR (etiqueta_confianza = ANY (ARRAY['alta'::text, 'media'::text, 'baja'::text]))))",
    fotos: { n: 16, huella: 'H' }, base: { fotos_n: 16, huella: 'H' },
  })
  it('pasa con las 6 columnas y la restricción; sin la bandera sigue exigiendo exactamente las 4 de antes (un script viejo no se rompe)', async () => {
    const mod = await import(/* @vite-ignore */ pathToFileURL(path.join(RAIZ, 'scripts/audit/cerebro-paso-2-verifica-base.mjs')).href)
    expect(mod.evaluar(bueno()).ok).toBe(true)
    const sin = bueno(); sin.con_fotos_2 = false
    expect(mod.evaluar(sin).ok).toBe(false) // las 6 columnas sin la bandera: sobran dos
    const cuatro = bueno(); cuatro.con_fotos_2 = false; cuatro.columnas = cuatro.columnas.slice(0, 4)
    expect(mod.evaluar(cuatro).ok).toBe(true)
    expect(mod.COLUMNAS_FOTOS_2).toEqual(COLUMNAS)
  })
  it('FALLA ante cada desvío: falta una columna, falta la restricción, la restricción no admite NULL o no nombra los 3 valores, valor por defecto, NOT NULL, dato, huella', async () => {
    const mod = await import(/* @vite-ignore */ pathToFileURL(path.join(RAIZ, 'scripts/audit/cerebro-paso-2-verifica-base.mjs')).href)
    const rompe = (f: (e: Estado) => void) => { const e = bueno(); f(e); return mod.evaluar(e) }
    for (const [que, f] of [
      ['falta texto_visible', (e: Estado) => { e.columnas = e.columnas.filter((c: any) => c.column_name !== 'texto_visible') }],
      ['falta etiqueta_confianza', (e: Estado) => { e.columnas = e.columnas.filter((c: any) => c.column_name !== 'etiqueta_confianza') }],
      ['sin restricción', (e: Estado) => { e.restriccion_confianza = null }],
      ['restricción sin NULL', (e: Estado) => { e.restriccion_confianza = "CHECK (etiqueta_confianza = ANY (ARRAY['alta','media','baja']))" }],
      ['restricción sin «baja»', (e: Estado) => { e.restriccion_confianza = "CHECK (etiqueta_confianza IS NULL OR etiqueta_confianza IN ('alta','media'))" }],
      ['valor por defecto', (e: Estado) => { e.columnas[4].column_default = "'x'" }],
      ['NOT NULL', (e: Estado) => { e.columnas[5].is_nullable = 'NO' }],
      ['dato en las columnas', (e: Estado) => { e.columnas_con_dato = 1 }],
      ['la huella de las fotos cambió', (e: Estado) => { e.fotos.huella = 'OTRA' }],
      ['una foto de menos', (e: Estado) => { e.fotos.n = 15 }],
    ] as Array<[string, (e: Estado) => void]>) {
      const r = rompe(f)
      expect(r.ok, que).toBe(false)
      expect(r.fallas.length, que).toBeGreaterThan(0)
    }
  })
  it('el guion consulta las 6 columnas y la restricción (solo lectura)', () => {
    const t = leer('scripts/audit/cerebro-paso-2-verifica-base.mjs')
    expect(t).toMatch(/--con-fotos-2/)
    expect(t).toMatch(/pg_get_constraintdef/)
    expect(t.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')).not.toMatch(/\b(INSERT INTO|UPDATE\s+[\w.]+\s+SET|DELETE FROM|DROP TABLE|ALTER TABLE|TRUNCATE|CREATE TABLE)\b/i)
  })
})
