/**
 * OFICINA FINANCIERA · F1 · la migración (CC#1 · 14-oct) · estática: se lee el texto del SQL y de su reversa.
 * Se prueba (R4 de CC#3 y la regla de la casa): solo tablas nuevas `finanzas_*`, uuid sin secuencias, ningún permiso para `anon`/`authenticated`,
 * RLS + GRANT + NOTIFY, nace apagada, repetible, nada celda-vacía, y una reversa que se niega a borrar con evidencia de uso.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = path.resolve(__dirname, '..')
const sql = fs.readFileSync(path.join(RAIZ, 'supabase/migrations/202610141800_finanzas_oficina_apagada.sql'), 'utf8').replace(/\r\n/g, '\n')
const rev = fs.readFileSync(path.join(RAIZ, 'supabase/reversas/202610141800_finanzas_oficina_apagada_REVERSA.sql'), 'utf8').replace(/\r\n/g, '\n')
const sinComentarios = (s: string) => s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
const cuerpo = sinComentarios(sql)

const TABLAS = ['finanzas_config', 'finanzas_eventos', 'finanzas_canales', 'finanzas_referencias', 'finanzas_canales_por_rubro', 'finanzas_tableros', 'finanzas_numeros', 'finanzas_preguntas']

describe('F1 · migración de la oficina financiera', () => {
  it('crea exactamente las 8 tablas nuevas, cada una con IF NOT EXISTS', () => {
    const creadas = [...cuerpo.matchAll(/CREATE TABLE IF NOT EXISTS public\.(\w+)/g)].map((m) => m[1]).sort()
    expect(creadas).toEqual([...TABLAS].sort())
    expect(cuerpo.match(/CREATE TABLE(?! IF NOT EXISTS)/g)).toBeNull()
  })
  it('NO toca ninguna tabla que no sea finanzas_* (ni ALTER, ni INSERT, ni DROP, ni UPDATE, ni DELETE sobre otras)', () => {
    for (const m of cuerpo.matchAll(/\b(?:ALTER TABLE|INSERT INTO|UPDATE|DELETE FROM|DROP TABLE(?: IF EXISTS)?|TRUNCATE(?: TABLE)?)\s+(?:ONLY\s+)?(?:public\.)?(\w+)/g)) {
      if (m[1].toUpperCase() === m[1]) continue
      expect(m[1].startsWith('finanzas_'), `toca «${m[1]}»`).toBe(true)
    }
    for (const prohibida of ['public.agents', 'settings', 'jefatura_', 'client_brain', 'camino_iii', 'oficina_']) expect(cuerpo).not.toContain(prohibida)
  })
  it('identificadores uuid y NINGUNA secuencia (R4): sin serial, sin bigserial, sin GRANT sobre secuencias', () => {
    expect(cuerpo).not.toMatch(/\bserial\b|\bbigserial\b|\bsmallserial\b|GENERATED .* AS IDENTITY/i)
    expect(cuerpo).not.toMatch(/ON SEQUENCE|\bSEQUENCE\b|nextval/i)
    for (const t of ['finanzas_referencias', 'finanzas_canales_por_rubro', 'finanzas_tableros', 'finanzas_numeros', 'finanzas_preguntas']) {
      const bloque = cuerpo.split(`CREATE TABLE IF NOT EXISTS public.${t}`)[1].split(');')[0]
      expect(bloque, t).toMatch(/id\s+uuid\s+PRIMARY KEY DEFAULT gen_random_uuid\(\)/)
    }
  })
  it('anon y authenticated: ningún permiso ni política; todo revocado', () => {
    expect(cuerpo).toMatch(/REVOKE ALL ON[\s\S]+FROM anon, authenticated/)
    expect(cuerpo).not.toMatch(/GRANT[^;]+TO[^;]*\b(anon|authenticated|public)\b/i)
    expect(cuerpo).not.toMatch(/CREATE POLICY[^;]+TO[^;]*\b(anon|authenticated|public)\b/i)
    expect(cuerpo).toContain("EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role")
  })
  it('RLS activada y GRANT a service_role en las 8, y NOTIFY al final', () => {
    for (const t of TABLAS) {
      expect(cuerpo, t).toContain(`ALTER TABLE public.${t}`.padEnd(0))
      expect(cuerpo).toMatch(new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`))
      expect(cuerpo).toContain(`ON public.${t} TO service_role`)
    }
    expect(cuerpo.trimEnd().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
  })
  it('nace APAGADA: estado apagada, preguntas apagado, conversa apagado, una sola fila', () => {
    expect(cuerpo).toMatch(/estado\s+text\s+NOT NULL DEFAULT 'apagada'/)
    expect(cuerpo).toMatch(/preguntas_slack\s+text\s+NOT NULL DEFAULT 'apagado'/)
    expect(cuerpo).toMatch(/conversa\s+text\s+NOT NULL DEFAULT 'apagado'/)
    expect(cuerpo).toMatch(/id\s+integer\s+PRIMARY KEY DEFAULT 1 CHECK \(id = 1\)/)
    expect(cuerpo).toContain('INSERT INTO public.finanzas_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING')
  })
  it('repetible: todo INSERT lleva ON CONFLICT DO NOTHING y los índices IF NOT EXISTS', () => {
    const inserts = cuerpo.match(/INSERT INTO /g) ?? []
    const conflictos = cuerpo.match(/ON CONFLICT \([^)]*\) DO NOTHING;/g) ?? []
    expect(inserts.length).toBeGreaterThan(0)
    expect(conflictos.length).toBe(inserts.length)
    for (const m of cuerpo.matchAll(/CREATE (?:UNIQUE )?INDEX\s+(?!IF NOT EXISTS)/g)) throw new Error('índice sin IF NOT EXISTS: ' + m[0])
  })
  it('nunca una celda vacía: finanzas_numeros solo admite valor nulo si es «sin_base» con motivo; un tablero firmado lleva huella', () => {
    expect(cuerpo).toMatch(/CHECK \(valor IS NOT NULL OR \(tipo = 'sin_base' AND motivo IS NOT NULL AND length\(motivo\) > 0\)\)/)
    expect(cuerpo).toMatch(/CHECK \(estado <> 'firmado' OR \(huella IS NOT NULL AND firmado_en IS NOT NULL AND firmado_por IS NOT NULL\)\)/)
    expect(cuerpo).toContain('CREATE UNIQUE INDEX IF NOT EXISTS finanzas_tableros_un_vigente ON public.finanzas_tableros (client_id) WHERE vigente')
  })
  it('AGNÓSTICA: ningún rubro, ciudad, cliente ni producto concreto, y las referencias y pesos por rubro nacen vacías', () => {
    for (const w of ['naufrago', 'náufrago', 'olón', 'guayaquil', 'quito', 'bogot', 'encebollado', 'ceviche', 'restaurante', 'peniche', 'seguridad industrial']) expect(sql.toLowerCase()).not.toContain(w)
    expect(cuerpo).not.toMatch(/INSERT INTO public\.finanzas_referencias/)
    expect(cuerpo).not.toMatch(/INSERT INTO public\.finanzas_canales_por_rubro/)
  })
  it('los catálogos: los 8 eventos y 9 canales, y todo evento alterno apunta a un evento que existe', () => {
    const eventos = [...cuerpo.matchAll(/^\s+\('(\w+)',\s+'[^']+',\s+(NULL|'\w+'),\s+\d+\)/gm)].map((m) => ({ clave: m[1], alterno: m[2] === 'NULL' ? null : m[2].replace(/'/g, '') }))
    expect(eventos.length).toBe(8)
    const claves = new Set(eventos.map((e) => e.clave))
    for (const e of eventos) if (e.alterno) expect(claves.has(e.alterno), `${e.clave} → ${e.alterno}`).toBe(true)
    const canales = cuerpo.split('INSERT INTO public.finanzas_canales (')[1].split('ON CONFLICT')[0].match(/^\s+\('\w+',/gm) ?? []
    expect(canales.length).toBe(9)
  })
  it('el canal de la plataforma publicitaria que SÍ es oficial lo dice y el resto queda «verificar»', () => {
    expect(cuerpo).toContain("'campaña > 50 por día y grupo de anuncios > 20 por día (oficial)'")
    expect(cuerpo).toContain('guías de terceros')
  })
})

describe('F1 · reversa', () => {
  it('se niega a borrar si hay tableros o preguntas y solo borra las 8 tablas nuevas', () => {
    expect(rev).toContain('RAISE EXCEPTION')
    expect(rev).toContain('count(*) FROM public.finanzas_tableros')
    expect(rev).toContain('count(*) FROM public.finanzas_preguntas')
    // nota de CC#3: las referencias y los pesos por rubro (trabajo caro de rehacer) también cuentan, y el encabezado avisa de la transacción abierta
    expect(rev).toContain('count(*) FROM public.finanzas_referencias')
    expect(rev).toContain('count(*) FROM public.finanzas_canales_por_rubro')
    expect(rev).toMatch(/IF n_tableros > 0 OR n_preguntas > 0 OR n_referencias > 0 OR n_pesos > 0 THEN/)
    expect(rev).toContain('DEJA SU TRANSACCIÓN ABIERTA')
    expect(rev).toContain('ROLLBACK')
    const borradas = [...rev.matchAll(/DROP TABLE IF EXISTS public\.(\w+)/g)].map((m) => m[1]).sort()
    expect(borradas).toEqual([...TABLAS].sort())
  })
  it('borra primero las que dependen de otras (numeros antes que tableros; referencias antes que canales)', () => {
    const orden = [...rev.matchAll(/DROP TABLE IF EXISTS public\.(\w+)/g)].map((m) => m[1])
    expect(orden.indexOf('finanzas_numeros')).toBeLessThan(orden.indexOf('finanzas_tableros'))
    expect(orden.indexOf('finanzas_referencias')).toBeLessThan(orden.indexOf('finanzas_canales'))
    expect(orden.indexOf('finanzas_canales_por_rubro')).toBeLessThan(orden.indexOf('finanzas_canales'))
  })
})
