/**
 * La migración de las tablas de la cadena · garantías permanentes (PR 1).
 * Ensayada además en un Postgres real en memoria (pglite) fuera del repo: 23 comprobaciones, dos pasadas, reversa.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(__dirname, '..', '..', '..', '..')
const SQL = readFileSync(join(RAIZ, 'supabase', 'migrations', '202610090200_cadena_tablas.sql'), 'utf8')
const REVERSA = readFileSync(join(RAIZ, 'supabase', 'reversas', '202610090200_cadena_tablas_REVERSA.sql'), 'utf8')
const CODIGO = SQL.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')

const TABLAS = [
  'cadena_config', 'cadena_plazos', 'cadena_formatos_por_red', 'cadena_campanas', 'cadena_estrategias', 'cadena_calendario_filas',
  'cadena_validaciones', 'cadena_fechas_especiales', 'cadena_fechas_cobertura', 'cadena_esperas', 'cadena_corridas',
]

describe('migración de la cadena · solo aditiva, apagada, sin contacto con el cliente', () => {
  it('crea exactamente las 11 tablas, todas con IF NOT EXISTS', () => {
    const creadas = [...CODIGO.matchAll(/CREATE TABLE IF NOT EXISTS public\.(\w+)/g)].map((m) => m[1]).sort()
    expect(creadas).toEqual([...TABLAS].sort())
    expect(CODIGO.match(/CREATE TABLE/g)?.length).toBe(11)
  })

  it('no borra ni altera nada existente', () => {
    expect(CODIGO).not.toMatch(/\bDROP\s+(TABLE|COLUMN|INDEX|POLICY)/i)
    expect(CODIGO).not.toMatch(/\bTRUNCATE\b/i)
    expect(CODIGO).not.toMatch(/\bDELETE\s+FROM\b/i)
    const alteradas = [...CODIGO.matchAll(/ALTER TABLE\s+(?:ONLY\s+)?(?:public\.)?(\S+)/gi)].map((m) => m[1])
    // el único ALTER es el de RLS, por formato dentro del bloque que recorre SOLO las 11 tablas
    for (const a of alteradas) expect(a).toMatch(/^(public\.)?%I$/)
  })

  it('cada tabla tiene permisos y seguridad por fila para service_role (CREATE TABLE no alcanza)', () => {
    const bloque = CODIGO.slice(CODIGO.indexOf('DO $cadena$'))
    for (const t of TABLAS) expect(bloque).toContain(`'${t}'`)
    expect(bloque).toContain('ENABLE ROW LEVEL SECURITY')
    expect(bloque).toContain('REVOKE ALL')
    expect(bloque).toContain('TO service_role')
    expect(CODIGO).toContain("NOTIFY pgrst, 'reload schema'")
  })

  it('las 5 secuencias se cierran a anon/authenticated como las tablas (Supabase les da permisos por defecto)', () => {
    expect(CODIGO).toMatch(/REVOKE ALL ON SEQUENCE[\s\S]*?FROM PUBLIC, anon, authenticated/)
    const seqs = CODIGO.match(/REVOKE ALL ON SEQUENCE([\s\S]*?)FROM PUBLIC/)?.[1].match(/cadena_\w+_seq/g) ?? []
    expect(new Set(seqs).size).toBe(5)
  })
  it('el interruptor nace APAGADO y con clientes de ensayo vacíos', () => {
    expect(CODIGO).toMatch(/\('estado_cadena',\s*'"apagada"'::jsonb\)/)
    expect(CODIGO).toMatch(/\('clientes_ensayo',\s*'\[\]'::jsonb\)/)
    expect(CODIGO).toMatch(/\('alertas_en_ensayo',\s*'"registrar"'::jsonb\)/)
    expect(CODIGO).not.toMatch(/"encendida"'::jsonb\)/)
  })

  it('el plazo de la llamada al agente nace en 6 minutos (el nodo corta a los 290 s; con 15 la base ganaría al código)', () => {
    expect(CODIGO).toMatch(/('plazo_llamada_agente_minutos',s*'6'::jsonb)/)
  })

  it('cero contacto con el cliente: ningún destino, valor ni columna apunta al dueño', () => {
    expect(CODIGO).not.toMatch(/due[nñ]o/i)
    expect(CODIGO).toMatch(/verificado_por IS NULL OR verificado_por = 'codigo'/)
  })

  it('nada espera sin reloj: vence_en y plazo_en de una llamada en curso son obligatorios', () => {
    expect(CODIGO).toMatch(/vence_en\s+timestamptz\s+NOT NULL/)
    expect(CODIGO).toMatch(/estado <> 'en_curso' OR plazo_en IS NOT NULL/)
    expect(CODIGO).toMatch(/\('ultimo_latido'/)
  })

  it('dos planes del mismo cliente: una sola campaña viva por cliente, garantizada por la base', () => {
    expect(CODIGO).toMatch(/UNIQUE INDEX IF NOT EXISTS cadena_campanas_una_viva_por_cliente[^;]*WHERE estado NOT IN \('cerrada','reemplazada'\)/)
    expect(CODIGO).toMatch(/cadena_campanas_un_plan UNIQUE \(client_id, plan_id\)/)
  })

  it('los formatos de video esperan al brazo y la siembra son 19 filas (la reversa lo cuenta)', () => {
    const filas = [...CODIGO.matchAll(/\('(instagram|facebook|tiktok|linkedin|youtube|whatsapp)',\s*'(\w+)',\s*\d+,\s*'(opera|espera_brazo)'/g)]
    expect(filas.length).toBe(19)
    for (const f of filas) if (/^(reel|video|short)$/.test(f[2])) expect(f[3]).toBe('espera_brazo')
    expect(REVERSA).toContain('n <> 19')
  })

  it('la reversa se niega a borrar datos y cubre las 11 tablas', () => {
    expect(REVERSA).toContain('REVERSA ABORTADA')
    for (const t of TABLAS) expect(REVERSA).toContain(t)
    expect(REVERSA.match(/DROP TABLE IF EXISTS/g)?.length).toBe(11)
  })
})

describe('la fila guarda la clave de su pieza fija (el chequeo de dependencias del plan la necesita)', () => {
  it('cadena_calendario_filas tiene pieza_fija', () => {
    expect(CODIGO).toMatch(/CREATE TABLE IF NOT EXISTS public\.cadena_calendario_filas[\s\S]*?pieza_fija\s+text/)
  })
})
