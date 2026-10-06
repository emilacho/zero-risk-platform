/**
 * PASO 2 DEL CEREBRO · la FORMA de la migración y de su reversa (pruebas permanentes, escritas antes del SQL).
 * La migración debe ser SOLO ADITIVA, repetible, cerrada a anon/authenticated y sin disparadores; la reversa debe NEGARSE a borrar datos
 * y borrar SOLO lo que la migración creó. Y los guiones de auditoría del paso (flujos vivos y estado de la base) deben existir y razonar bien.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const RAIZ = process.cwd()
const MIGRACION = 'supabase/migrations/202610060100_cerebro_paso_2_tablas_y_columnas.sql'
const REVERSA = 'supabase/reversas/202610060100_cerebro_paso_2_REVERSA.sql'
const leer = (rel: string): string => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r/g, '')
/** sin comentarios de línea: lo que dice un comentario no cuenta como SQL */
const sql = (rel: string): string => leer(rel).split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')

const TABLAS_NUEVAS = ['cerebro_ingresos', 'cerebro_fichas']
const COLUMNAS_NUEVAS = ['que_muestra', 'producto_visto', 'etiquetada_en', 'etiqueta_modelo']

describe('la migración: SOLO aditiva, repetible y cerrada', () => {
  it('existe y la reversa NO está dentro de supabase/migrations (una herramienta de migraciones la correría sola)', () => {
    expect(fs.existsSync(path.join(RAIZ, MIGRACION))).toBe(true)
    expect(fs.existsSync(path.join(RAIZ, REVERSA))).toBe(true)
    expect(fs.readdirSync(path.join(RAIZ, 'supabase/migrations')).filter((f) => /(^|_)(REVERSA|down|rollback)(_|\.)/i.test(f))).toEqual([])
  })
  it('crea EXACTAMENTE las dos tablas nuevas, con IF NOT EXISTS, y agrega EXACTAMENTE las 4 columnas, anulables y sin valor por defecto', () => {
    const s = sql(MIGRACION)
    const creadas = [...s.matchAll(/CREATE TABLE IF NOT EXISTS public\.([a-z_]+)/g)].map((m) => m[1])
    expect(creadas.sort()).toEqual([...TABLAS_NUEVAS].sort())
    expect(s).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/)
    const alter = /ALTER TABLE public\.client_social_images([\s\S]*?);/.exec(s)?.[1] ?? ''
    const agregadas = [...alter.matchAll(/ADD COLUMN IF NOT EXISTS\s+([a-z_]+)\s+([^,;]+)/g)].map((m) => [m[1], m[2].trim()])
    expect(agregadas.map((a) => a[0]).sort()).toEqual([...COLUMNAS_NUEVAS].sort())
    for (const [col, resto] of agregadas) expect(resto, `${col} no puede tener NOT NULL ni DEFAULT`).not.toMatch(/NOT NULL|DEFAULT|REFERENCES|CHECK|UNIQUE/i)
    expect(s.match(/ALTER TABLE public\.client_social_images/g)).toHaveLength(1)
  })
  it('no cambia, borra ni endurece nada de lo que ya existe', () => {
    const s = sql(MIGRACION)
    for (const prohibido of [/\bDROP\b/i, /ALTER\s+COLUMN/i, /\bSET\s+NOT\s+NULL\b/i, /\bALTER\s+TYPE\b/i, /\bTRUNCATE\b/i, /\bDELETE\s+FROM\b/i, /\bUPDATE\s+[\w.]+\s+SET\b/i, /\bRENAME\b/i, /\bCREATE\s+(OR\s+REPLACE\s+)?(TRIGGER|FUNCTION|VIEW|MATERIALIZED)/i, /\bCREATE\s+EXTENSION\b/i, /\bINSERT\s+INTO\b/i]) {
      expect(s, String(prohibido)).not.toMatch(prohibido)
    }
    // solo toca las dos tablas nuevas y client_social_images
    const tocadas = new Set([...s.matchAll(/public\.([a-z_]+)/g)].map((m) => m[1]))
    expect([...tocadas].sort()).toEqual([...TABLAS_NUEVAS, 'client_social_images'].sort())
  })
  it('client_id es TEXTO y ninguna tabla nueva tiene llave hacia las tablas viejas (clients, etc.); solo se apuntan entre sí', () => {
    const s = sql(MIGRACION)
    expect([...s.matchAll(/\bclient_id\s+([a-z]+)/g)].map((m) => m[1])).toEqual(['text', 'text'])
    const llaves = [...s.matchAll(/REFERENCES\s+public\.([a-z_]+)/g)].map((m) => m[1])
    expect(llaves.length).toBeGreaterThan(0)
    for (const t of llaves) expect(TABLAS_NUEVAS).toContain(t)
  })
  it('cada tabla nueva sale CERRADA: seguridad por fila + REVOKE a anon/authenticated + GRANT solo a service_role + una política solo de service_role', () => {
    const s = sql(MIGRACION)
    for (const t of TABLAS_NUEVAS) {
      expect(s, `${t} sin RLS`).toMatch(new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`))
      expect(s, `${t} sin REVOKE`).toMatch(new RegExp(`REVOKE ALL ON public\\.${t}\\s+FROM PUBLIC, anon, authenticated`))
      expect(s, `${t} sin GRANT a service_role`).toMatch(new RegExp(`GRANT SELECT, INSERT, UPDATE, DELETE ON public\\.${t}\\s+TO service_role`))
      expect(s, `${t} sin política`).toMatch(new RegExp(`CREATE POLICY ${t}_service ON public\\.${t} FOR ALL TO service_role`))
    }
    expect(s).not.toMatch(/GRANT[^;]*\bTO\b[^;]*\b(anon|authenticated|PUBLIC)\b/i)
    for (const p of s.matchAll(/CREATE POLICY[^;]*;/g)) expect(p[0]).toMatch(/TO service_role/)
  })
  it('es repetible: todo CREATE/ADD lleva IF NOT EXISTS, las políticas van en un bloque que mira si ya existen, y va en UNA transacción con el aviso de recarga al final', () => {
    const s = sql(MIGRACION)
    for (const m of s.matchAll(/CREATE\s+(UNIQUE\s+)?INDEX\s+(?!IF NOT EXISTS)/g)) throw new Error('índice sin IF NOT EXISTS: ' + m[0])
    expect(s).toMatch(/\bBEGIN;/)
    expect(s).toMatch(/\bCOMMIT;/)
    expect(s.indexOf('BEGIN;')).toBeLessThan(s.indexOf('CREATE TABLE'))
    expect(s.indexOf('COMMIT;')).toBeGreaterThan(s.indexOf('ADD COLUMN'))
    for (const p of TABLAS_NUEVAS) expect(s).toMatch(new RegExp(`IF NOT EXISTS \\(SELECT 1 FROM pg_policy WHERE polrelid = 'public\\.${p}'::regclass`))
    expect(leer(MIGRACION).trim().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
  })
  it('`archivo_bytes` es el TAMAÑO (bigint), no el contenido: ninguna columna de las nuevas guarda el archivo', () => {
    const s = sql(MIGRACION)
    expect(s.match(/archivo_bytes\s+bigint/g)).toHaveLength(2)
    expect(s).not.toMatch(/\bbytea\b/i)
  })
  it('lo dice su encabezado: NO aplicada al escribirse, aditiva, y apunta al mapa', () => {
    const t = leer(MIGRACION)
    expect(t).toMatch(/NO APLICADA|PROPUESTA|se aplica en la PUBLICACI/i)
    expect(t).toMatch(/MAPA-2026-10-06-tablas-del-cerebro/)
  })
})

describe('la reversa: se NIEGA a borrar datos y borra SOLO lo que la migración creó', () => {
  it('la guarda va ANTES del primer DROP y aborta con error si hay datos en las tablas o en las 4 columnas', () => {
    const s = sql(REVERSA)
    expect(s.indexOf('RAISE EXCEPTION')).toBeGreaterThan(-1)
    expect(s.indexOf('RAISE EXCEPTION')).toBeLessThan(s.indexOf('DROP TABLE'))
    expect(s.indexOf('RAISE EXCEPTION')).toBeLessThan(s.indexOf('DROP COLUMN'))
    for (const t of TABLAS_NUEVAS) expect(s).toMatch(new RegExp(`count\\(\\*\\) FROM public\\.${t}`))
    expect(s.match(/RAISE EXCEPTION/g)).toHaveLength(3) // una por cada tabla y una por las columnas: ninguna se puede quitar
    for (const t of ['cerebro_fichas', 'cerebro_ingresos']) expect(s).toMatch(new RegExp(`RAISE EXCEPTION 'REVERSA ABORTADA: ${t} tiene`))
    expect(s).toMatch(/RAISE EXCEPTION 'REVERSA ABORTADA: client_social_images\.%/)
    for (const c of COLUMNAS_NUEVAS) expect(s).toContain(`'${c}'`)
    expect(leer(REVERSA)).toMatch(/Exportar antes de borrar/)
  })
  it('borra EXACTAMENTE lo que creó la migración (las dos tablas y las 4 columnas), sin CASCADE ni nada más', () => {
    const r = sql(REVERSA), m = sql(MIGRACION)
    const creadas = [...m.matchAll(/CREATE TABLE IF NOT EXISTS public\.([a-z_]+)/g)].map((x) => x[1])
    const borradas = [...r.matchAll(/DROP TABLE IF EXISTS public\.([a-z_]+)/g)].map((x) => x[1])
    expect(borradas.sort()).toEqual(creadas.sort())
    expect(r.indexOf('DROP TABLE IF EXISTS public.cerebro_fichas')).toBeLessThan(r.indexOf('DROP TABLE IF EXISTS public.cerebro_ingresos')) // las fichas apuntan a los ingresos
    const agregadas = [...(/ALTER TABLE public\.client_social_images([\s\S]*?);/.exec(m)?.[1] ?? '').matchAll(/ADD COLUMN IF NOT EXISTS\s+([a-z_]+)/g)].map((x) => x[1])
    const quitadas = [...r.matchAll(/DROP COLUMN IF EXISTS\s+([a-z_]+)/g)].map((x) => x[1])
    expect(quitadas.sort()).toEqual(agregadas.sort())
    expect(r).not.toMatch(/\bCASCADE\b/i)
    expect(r.match(/\bDROP\b/gi)).toHaveLength(creadas.length + agregadas.length)
    for (const prohibido of [/\bTRUNCATE\b/i, /\bDELETE\s+FROM\b/i, /\bUPDATE\s+[\w.]+\s+SET\b/i, /DROP\s+(SCHEMA|DATABASE|ROLE|POLICY|INDEX|FUNCTION|VIEW|TRIGGER)/i]) expect(r, String(prohibido)).not.toMatch(prohibido)
  })
  it('va en una transacción y termina con el aviso de recarga', () => {
    const r = leer(REVERSA)
    expect(sql(REVERSA)).toMatch(/\bBEGIN;/)
    expect(sql(REVERSA)).toMatch(/\bCOMMIT;/)
    expect(r.trim().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
  })
})

describe('los guiones de auditoría del paso (se corren al publicar y dejan su resultado en la señal)', () => {
  const AUDITORIA_FLUJOS = 'scripts/audit/cerebro-tablas-no-las-usa-nadie.mjs'
  const AUDITORIA_BASE = 'scripts/audit/cerebro-paso-2-verifica-base.mjs'
  it('existen y son de SOLO LECTURA (ninguna escritura ni a n8n ni a la base)', () => {
    for (const f of [AUDITORIA_FLUJOS, AUDITORIA_BASE]) {
      expect(fs.existsSync(path.join(RAIZ, f)), f).toBe(true)
      const t = leer(f).split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')
      expect(t, f).not.toMatch(/method:\s*['"](PUT|PATCH|DELETE)['"]/)
      expect(t, f).not.toMatch(/\b(INSERT INTO|UPDATE\s+[\w.]+\s+SET|DELETE FROM|DROP TABLE|ALTER TABLE|TRUNCATE|CREATE TABLE)\b/i)
    }
  })
  it('la auditoría de flujos VIVOS marca a un flujo que use las tablas nuevas, las 4 columnas o un select * de la tabla de fotos, y deja las versiones de la pieza, la planeación y el Servicio de Apify', async () => {
    const mod = await import(/* @vite-ignore */ pathToFileURL(path.join(RAIZ, AUDITORIA_FLUJOS)).href)
    const limpio = { id: 'lVCLzxQCKNkd3uS0', name: 'Pieza', active: true, versionId: 'v-pieza', nodes: [{ name: '③', parameters: { url: '.../rest/v1/client_social_images?select=id,url&client_id=eq.1' } }] }
    const sucios = [
      { id: 'x1', name: 'Usa fichas', active: true, versionId: 'a', nodes: [{ name: 'n', parameters: { url: '.../rest/v1/cerebro_fichas?select=id' } }] },
      { id: 'x2', name: 'Usa columna', active: false, versionId: 'b', nodes: [{ name: 'n', parameters: { jsCode: 'fila.producto_visto' } }] },
      { id: 'x3', name: 'Select estrella', active: true, versionId: 'c', nodes: [{ name: 'n', parameters: { url: '.../rest/v1/client_social_images?select=*&estado=eq.ok' } }] },
    ]
    const r = mod.revisarFlujos([limpio, { id: 'X9F0zp6LQ2xGEYVS', name: 'planeacion', active: true, versionId: 'v-plan', nodes: [] }, { id: '3lyknrP3PoS2KzUf', name: 'Apify', active: true, versionId: 'v-apify', nodes: [] }, ...sucios])
    expect(r.ok).toBe(false)
    expect(r.infracciones.map((i: { flujo: string }) => i.flujo).sort()).toEqual(['x1', 'x2', 'x3'])
    expect(r.versiones).toMatchObject({ lVCLzxQCKNkd3uS0: 'v-pieza', X9F0zp6LQ2xGEYVS: 'v-plan', '3lyknrP3PoS2KzUf': 'v-apify' })
    const ok = mod.revisarFlujos([limpio])
    expect(ok.ok).toBe(true)
    expect(ok.infracciones).toEqual([])
  })
  it('la auditoría del estado de la base da PASA solo con el estado esperado y FALLA ante cada desvío (tablas con filas, sin RLS, anon con permisos, columnas con valor por defecto o con dato, fotos cambiadas)', async () => {
    const mod = await import(/* @vite-ignore */ pathToFileURL(path.join(RAIZ, AUDITORIA_BASE)).href)
    type Estado = { tablas: Record<string, { existe: boolean; filas: number; rls: boolean; permisos_anon_authenticated: string[]; politicas: string[] }>; columnas: Array<{ column_name: string; is_nullable: string; column_default: string | null }>; columnas_con_dato: number; fotos: { n: number; huella: string }; base: { fotos_n: number; huella: string } }
    const bueno: Estado = {
      tablas: { cerebro_ingresos: { existe: true, filas: 0, rls: true, permisos_anon_authenticated: [], politicas: ['cerebro_ingresos_service'] }, cerebro_fichas: { existe: true, filas: 0, rls: true, permisos_anon_authenticated: [], politicas: ['cerebro_fichas_service'] } },
      columnas: [{ column_name: 'que_muestra', is_nullable: 'YES', column_default: null }, { column_name: 'producto_visto', is_nullable: 'YES', column_default: null }, { column_name: 'etiquetada_en', is_nullable: 'YES', column_default: null }, { column_name: 'etiqueta_modelo', is_nullable: 'YES', column_default: null }],
      columnas_con_dato: 0,
      fotos: { n: 16, huella: 'H' },
      base: { fotos_n: 16, huella: 'H' },
    }
    expect(mod.evaluar(bueno).ok).toBe(true)
    const rompe = (f: (e: Estado) => void) => { const e = JSON.parse(JSON.stringify(bueno)); f(e); return mod.evaluar(e) }
    for (const [que, f] of [
      ['una tabla con filas', (e: Estado) => { e.tablas.cerebro_fichas.filas = 1 }],
      ['una tabla sin seguridad por fila', (e: Estado) => { e.tablas.cerebro_ingresos.rls = false }],
      ['anon con permisos', (e: Estado) => { e.tablas.cerebro_ingresos.permisos_anon_authenticated = ['SELECT'] }],
      ['una tabla que no existe', (e: Estado) => { e.tablas.cerebro_fichas.existe = false }],
      ['una columna con valor por defecto', (e: Estado) => { e.columnas[0].column_default = "'x'" }],
      ['una columna NOT NULL', (e: Estado) => { e.columnas[1].is_nullable = 'NO' }],
      ['faltan columnas', (e: Estado) => { e.columnas.pop() }],
      ['una columna con dato', (e: Estado) => { e.columnas_con_dato = 2 }],
      ['una foto de menos', (e: Estado) => { e.fotos.n = 15 }],
      ['la huella de las fotos cambió', (e: Estado) => { e.fotos.huella = 'OTRA' }],
    ] as Array<[string, (e: Estado) => void]>) {
      const r = rompe(f)
      expect(r.ok, que).toBe(false)
      expect(r.fallas.length, que).toBeGreaterThan(0)
    }
  })
})
