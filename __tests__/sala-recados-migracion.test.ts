/**
 * RECADOS DE LA SALA · PASO 1 · la FORMA de la migración y de su reversa, y quién toca las tablas (pruebas permanentes, escritas antes del SQL).
 * Diseño: raw/tasks/2026-10-08-DISENO-CC3-recados-de-la-sala.md (versión final, §2.1 y §5). La migración queda SIN APLICAR: pide firma de Emilio.
 * La migración debe ser SOLO ADITIVA, repetible y cerrada; la reversa debe NEGARSE a borrar datos; y NADIE más que la puerta toca las dos tablas.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = process.cwd()
const MIGRACION = 'supabase/migrations/202610080100_sala_recados.sql'
const REVERSA = 'supabase/reversas/202610080100_sala_recados_REVERSA.sql'
const leer = (rel: string): string => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r/g, '')
const sql = (rel: string): string => leer(rel).split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')
const TABLAS = ['sala_destinos_de_recado', 'sala_recados']

describe('la migración: SOLO aditiva, repetible y cerrada', () => {
  it('existe, y la reversa NO está en supabase/migrations (una herramienta de migraciones la correría sola)', () => {
    expect(fs.existsSync(path.join(RAIZ, MIGRACION))).toBe(true)
    expect(fs.existsSync(path.join(RAIZ, REVERSA))).toBe(true)
    expect(fs.readdirSync(path.join(RAIZ, 'supabase/migrations')).filter((f) => /(^|_)(REVERSA|down|rollback)(_|\.)/i.test(f))).toEqual([])
  })
  it('crea EXACTAMENTE las dos tablas nuevas (destinos primero), con IF NOT EXISTS, y no toca ninguna otra', () => {
    const s = sql(MIGRACION)
    const creadas = [...s.matchAll(/CREATE TABLE IF NOT EXISTS public\.([a-z_]+)/g)].map((m) => m[1])
    expect(creadas).toEqual(TABLAS)
    expect(s).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/)
    expect(new Set([...s.matchAll(/public\.([a-z_]+)/g)].map((m) => m[1]).filter((n) => !n.endsWith('_id_seq')))).toEqual(new Set(TABLAS)) // la secuencia del número no es otra tabla
    for (const prohibido of [/\bDROP\b/i, /ALTER\s+COLUMN/i, /\bALTER\s+TABLE\s+\S+\s+(?!ENABLE ROW LEVEL SECURITY)/i, /\bTRUNCATE\b/i, /\bDELETE\s+FROM\b/i, /\bUPDATE\s+[\w.]+\s+SET\b/i, /\bCREATE\s+(OR\s+REPLACE\s+)?(TRIGGER|FUNCTION)\b/i]) {
      expect(s, String(prohibido)).not.toMatch(prohibido)
    }
  })
  it('`sala_recados`: el número es bigserial, client_id es TEXTO sin llave hacia tablas viejas, y solo apunta a la tabla de destinos', () => {
    const s = sql(MIGRACION)
    const t = /CREATE TABLE IF NOT EXISTS public\.sala_recados \(([\s\S]*?)\n\);/.exec(s)?.[1] ?? ''
    expect(t).toMatch(/\bid\s+bigserial\s+PRIMARY KEY/)
    expect(t).toMatch(/\bclient_id\s+text\s+NOT NULL/)
    expect(t).toMatch(/\bclave_de_agrupacion\s+text\s+NOT NULL/)
    expect(t).toMatch(/\bque_falta\s+text\s+NOT NULL/)
    expect(t).toMatch(/\bbloquea\s+boolean\s+NOT NULL DEFAULT false/)
    expect(t).toMatch(/\bpedido_original\s+jsonb/)
    expect(t).toMatch(/\bficha_ids\s+text\[\]/)
    expect(t).toMatch(/\bprueba\s+boolean\s+NOT NULL DEFAULT false/)
    expect([...t.matchAll(/REFERENCES\s+public\.([a-z_]+)/g)].map((m) => m[1])).toEqual(['sala_destinos_de_recado'])
    expect(s).not.toMatch(/REFERENCES\s+(clients|public\.clients|auth\.)/i)
  })
  it('los estados y los tipos están cerrados con CHECK (sin destino «emilio»: nada va a Emilio)', () => {
    const s = sql(MIGRACION)
    expect(s).toMatch(/CHECK \(estado IN \('abierto','repartido','cumplido','no_conseguido'\)\)/)
    expect(s).toMatch(/CHECK \(tipo IN \('herramienta','agente','persona'\)\)/)
    expect(s).toMatch(/CHECK \(estado_del_brazo IN \('opera','por_configurar','no_existe'\)\)/)
    expect(s).toMatch(/CHECK \(plazo_minutos > 0\)/)
    expect(s.toLowerCase()).not.toMatch(/'emilio'/)
  })
  it('NUNCA dos recados abiertos iguales: índice ÚNICO PARCIAL sobre (cliente, clave, prueba) mientras estén abierto o repartido', () => {
    const s = sql(MIGRACION).replace(/\s+/g, ' ')
    expect(s).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS sala_recados_un_abierto_por_clave ON public\.sala_recados \(client_id, clave_de_agrupacion, prueba\) WHERE estado IN \('abierto','repartido'\)/)
  })
  it('los destinos nacen con su estado REAL del inventario: operan solo apify, imagen y etiquetar; el dueño nace APAGADO; los demás por configurar o inexistentes', () => {
    const s = sql(MIGRACION).replace(/\s+/g, ' ')
    const filas = [...s.matchAll(/\('([a-z_:]+)', '(herramienta|agente|persona)', [^)]*?, (\d+), '(opera|por_configurar|no_existe)', (true|false)\)/g)].map((m) => ({ destino: m[1], tipo: m[2], plazo: Number(m[3]), estado: m[4], activo: m[5] === 'true' }))
    const por = Object.fromEntries(filas.map((f) => [f.destino, f]))
    expect(Object.keys(por).sort()).toEqual(['apify', 'audio', 'correo', 'dataforseo', 'dueno', 'etiquetar', 'imagen', 'loyverse', 'video'])
    for (const d of ['apify', 'imagen', 'etiquetar']) expect(por[d]).toMatchObject({ estado: 'opera', activo: true })
    expect(por.dueno).toMatchObject({ tipo: 'persona', activo: false })
    for (const d of ['video', 'audio', 'correo', 'dataforseo']) expect(por[d].estado).toBe('por_configurar')
    expect(por.loyverse.estado).toBe('no_existe')
    for (const f of filas) expect(f.plazo, f.destino).toBeLessThanOrEqual(120) // minutos u horas, nunca días
    expect(s).toMatch(/INSERT INTO public\.sala_destinos_de_recado[^;]*ON CONFLICT \(destino\) DO NOTHING/)
  })
  it('cada tabla sale CERRADA: RLS + REVOKE a anon/authenticated + GRANT solo a service_role + política solo de service_role (y el número bigserial también)', () => {
    const s = sql(MIGRACION)
    for (const t of TABLAS) {
      expect(s, `${t} sin RLS`).toMatch(new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`))
      expect(s, `${t} sin REVOKE`).toMatch(new RegExp(`REVOKE ALL ON public\\.${t}\\s+FROM PUBLIC, anon, authenticated`))
      expect(s, `${t} sin GRANT`).toMatch(new RegExp(`GRANT SELECT, INSERT, UPDATE, DELETE ON public\\.${t}\\s+TO service_role`))
      expect(s, `${t} sin política`).toMatch(new RegExp(`CREATE POLICY ${t}_service ON public\\.${t} FOR ALL TO service_role`))
    }
    expect(s).toMatch(/GRANT USAGE, SELECT ON SEQUENCE public\.sala_recados_id_seq TO service_role/) // sin esto el INSERT falla con «permission denied for sequence»
    expect(s).not.toMatch(/GRANT[^;]*\bTO\b[^;]*\b(anon|authenticated|PUBLIC)\b/i)
    for (const p of s.matchAll(/CREATE POLICY[^;]*;/g)) expect(p[0]).toMatch(/TO service_role/)
  })
  it('es repetible y atómica: IF NOT EXISTS en todo, políticas en un bloque que mira si existen, una transacción y el aviso de recarga al final', () => {
    const s = sql(MIGRACION)
    for (const m of s.matchAll(/CREATE\s+(UNIQUE\s+)?INDEX\s+(?!IF NOT EXISTS)/g)) throw new Error('índice sin IF NOT EXISTS: ' + m[0])
    expect(s).toMatch(/\bBEGIN;/)
    expect(s).toMatch(/\bCOMMIT;/)
    expect(s.indexOf('BEGIN;')).toBeLessThan(s.indexOf('CREATE TABLE'))
    for (const t of TABLAS) expect(s).toMatch(new RegExp(`IF NOT EXISTS \\(SELECT 1 FROM pg_policy WHERE polrelid = 'public\\.${t}'::regclass`))
    expect(leer(MIGRACION).trim().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
  })
  it('lo dice su encabezado: NO APLICADA, pide firma, y nadie la usa todavía', () => {
    const t = leer(MIGRACION)
    expect(t).toMatch(/NO APLICADA/)
    expect(t).toMatch(/firma de Emilio/i)
    expect(t).toMatch(/DISENO-CC3-recados-de-la-sala/)
  })
})

describe('la reversa: se NIEGA a borrar datos y borra SOLO lo que la migración creó', () => {
  it('la guarda va antes de todo DROP y aborta si alguna de las dos tablas tiene filas (los destinos sembrados no cuentan: solo los que no son de la migración)', () => {
    const s = sql(REVERSA)
    const plano = s.replace(/\s+/g, ' ')
    expect(s.indexOf('RAISE EXCEPTION')).toBeGreaterThan(-1)
    expect(s.indexOf('RAISE EXCEPTION')).toBeLessThan(s.indexOf('DROP TABLE'))
    expect(plano).toMatch(/IF to_regclass\('public\.sala_recados'\) IS NOT NULL THEN EXECUTE 'SELECT count\(\*\) FROM public\.sala_recados' INTO n; IF n > 0 THEN RAISE EXCEPTION 'REVERSA ABORTADA: sala_recados tiene % filas\. Exportar antes de borrar\.', n; END IF;/)
    // los destinos: la migración siembra los suyos; la reversa aborta si hay alguno que NO sea de esa siembra
    expect(plano).toMatch(/SELECT count\(\*\) FROM public\.sala_destinos_de_recado WHERE destino <> ALL \(ARRAY\[''apify'',''audio'',''correo'',''dataforseo'',''dueno'',''etiquetar'',''imagen'',''loyverse'',''video''\]\)/)
    expect(plano).toMatch(/RAISE EXCEPTION 'REVERSA ABORTADA: sala_destinos_de_recado tiene % destinos añadidos/)
    expect(plano).not.toMatch(/IF false|IF NOT TRUE|IF 1 = 0|IF n < 0|IF n >= 1000000/i)
    expect(leer(REVERSA)).toMatch(/Exportar antes de borrar/)
  })
  it('borra EXACTAMENTE las dos tablas, primero los recados (apuntan a los destinos), sin CASCADE ni nada más', () => {
    const r = sql(REVERSA), m = sql(MIGRACION)
    const creadas = [...m.matchAll(/CREATE TABLE IF NOT EXISTS public\.([a-z_]+)/g)].map((x) => x[1])
    const borradas = [...r.matchAll(/DROP TABLE IF EXISTS public\.([a-z_]+)/g)].map((x) => x[1])
    expect(borradas.sort()).toEqual([...creadas].sort())
    expect(r.indexOf('DROP TABLE IF EXISTS public.sala_recados')).toBeLessThan(r.indexOf('DROP TABLE IF EXISTS public.sala_destinos_de_recado'))
    expect(r).not.toMatch(/\bCASCADE\b/i)
    expect(r.match(/\bDROP\b/gi)).toHaveLength(creadas.length)
    for (const prohibido of [/\bTRUNCATE\b/i, /\bDELETE\s+FROM\b/i, /\bUPDATE\s+[\w.]+\s+SET\b/i, /DROP\s+(SCHEMA|DATABASE|ROLE|POLICY|INDEX|FUNCTION|VIEW|TRIGGER|SEQUENCE)/i]) expect(r, String(prohibido)).not.toMatch(prohibido)
  })
  it('una transacción y termina con el aviso de recarga', () => {
    expect(sql(REVERSA)).toMatch(/\bBEGIN;/)
    expect(sql(REVERSA)).toMatch(/\bCOMMIT;/)
    expect(leer(REVERSA).trim().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
  })
})

describe('NADIE más que la puerta toca las dos tablas (el permiso de la base no lo impide: todos usan la misma llave de servicio)', () => {
  const CARPETAS = ['src', 'services', 'scripts', 'n8n-workflows', 'packages', 'tools']
  const SALTAR = /(^|\/)(node_modules|\.next|\.git|evidence|outputs|fixtures|__tests__)(\/|$)/
  function archivos(dir: string, salida: string[] = []): string[] {
    const abs = path.join(RAIZ, dir)
    if (!fs.existsSync(abs)) return salida
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`
      if (SALTAR.test(rel)) continue
      if (e.isDirectory()) archivos(rel, salida)
      else if (/\.(ts|tsx|js|mjs|cjs|json)$/.test(e.name) && fs.statSync(path.join(RAIZ, rel)).size < 3_000_000) salida.push(rel)
    }
    return salida
  }
  const PERMITIDOS = ['src/lib/sala-recados/almacen-supabase.ts']
  it('solo el almacén de la puerta nombra `sala_recados` o `sala_destinos_de_recado` (un flujo, un productor o un guion que las toque falla hasta que se declare)', () => {
    const tocan = CARPETAS.flatMap((c) => archivos(c)).filter((f) => /sala_recados|sala_destinos_de_recado/.test(fs.readFileSync(path.join(RAIZ, f), 'utf8')))
    expect(tocan.sort()).toEqual(PERMITIDOS.filter((f) => fs.existsSync(path.join(RAIZ, f))).sort())
    expect(tocan.length).toBeGreaterThan(0)
  })
})
