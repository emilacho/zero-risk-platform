/**
 * OFICINA · SALA 1 · PR 2 · la FORMA de la migración y de su reversa (pruebas permanentes). La migración queda SIN APLICAR: se aplica primero en copia (CC#3) y luego en producción.
 * Debe ser SOLO ADITIVA, repetible y cerrada; la plantilla sembrada debe ser EXACTAMENTE la fotografía congelada de la v1 (`fixtures/plantillas/post-img-v1.json`: la migración 1 NO se reescribe cuando el código de `POST_IMG` evoluciona; cada cambio de plantilla trae su propia migración de datos y su propia prueba); la oficina nace APAGADA;
 * los artefactos solo se agregan; la reversa se NIEGA a borrar datos; y NADIE más que la propia oficina nombra estas tablas.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { POST_IMG } from '../src/lib/oficina/plantillas/post-img'
import POST_IMG_V1 from './fixtures/plantillas/post-img-v1.json'
import { validarPlantilla } from '../src/lib/oficina/plantilla'

const RAIZ = process.cwd()
const MIGRACION = 'supabase/migrations/202610090100_oficina_sala_1.sql'
const REVERSA = 'supabase/reversas/202610090100_oficina_sala_1_REVERSA.sql'
const leer = (rel: string): string => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r/g, '')
const sql = (rel: string): string => leer(rel).split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')
const TABLAS = ['oficina_tipos_de_grupo', 'oficina_config', 'oficina_encargos', 'oficina_turnos', 'oficina_artefactos', 'oficina_fichas', 'oficina_gastos', 'oficina_uso_de_fotos', 'oficina_entrega_formatos']

describe('la migración: SOLO aditiva, repetible y cerrada', () => {
  it('existe y la reversa NO está en supabase/migrations', () => {
    expect(fs.existsSync(path.join(RAIZ, MIGRACION))).toBe(true)
    expect(fs.existsSync(path.join(RAIZ, REVERSA))).toBe(true)
    expect(fs.readdirSync(path.join(RAIZ, 'supabase/migrations')).filter((f) => /(^|_)(REVERSA|down|rollback)(_|\.)/i.test(f))).toEqual([])
  })
  it('crea EXACTAMENTE las 9 tablas nuevas con IF NOT EXISTS y no toca ninguna otra', () => {
    const s = sql(MIGRACION)
    expect([...s.matchAll(/CREATE TABLE IF NOT EXISTS public\.([a-z_]+)/g)].map((m) => m[1])).toEqual(TABLAS)
    expect(s).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/)
    const nombradas = new Set([...s.matchAll(/public\.([a-z_]+)/g)].map((m) => m[1]).filter((n) => !n.endsWith('_id_seq')))
    expect(nombradas).toEqual(new Set(TABLAS))
    for (const prohibido of [/\bDROP\b/i, /ALTER\s+COLUMN/i, /\bALTER\s+TABLE\s+\S+\s+(?=\S)(?!ENABLE ROW LEVEL SECURITY)/i, /\bTRUNCATE\b/i, /\bDELETE\s+FROM\b/i, /\bUPDATE\s+[\w.]+\s+SET\b/i, /\bCREATE\s+(OR\s+REPLACE\s+)?(TRIGGER|FUNCTION)\b/i]) {
      expect(s, String(prohibido)).not.toMatch(prohibido)
    }
  })
  it('no toca `hitl_queue`, las tablas de la cadena ni el mapa de viajes', () => {
    const s = sql(MIGRACION)
    for (const t of ['hitl_queue', 'cadena_', 'routing_rules', 'ingress_sources', 'client_historical_outputs', 'agents']) expect(s).not.toMatch(new RegExp(`public\\.${t}`))
  })
  it('`client_id` es TEXTO sin llave hacia tablas viejas; las llaves foráneas solo apuntan a tablas de la oficina', () => {
    const s = sql(MIGRACION)
    expect(s).toMatch(/oficina_encargos \([\s\S]*?\bclient_id\s+text\s+NOT NULL/)
    expect(s).toMatch(/oficina_uso_de_fotos \([\s\S]*?\bclient_id\s+text\s+NOT NULL/)
    const refs = [...s.matchAll(/REFERENCES\s+public\.([a-z_]+)/g)].map((m) => m[1])
    expect(refs.length).toBeGreaterThan(0)
    for (const r of refs) expect(TABLAS).toContain(r)
    expect(s).not.toMatch(/REFERENCES\s+(clients|public\.clients|auth\.)/i)
  })
  it('la idempotencia la da la base: un encargo por (parte, brief, tipo, versión), un turno por n, una imagen sumada una vez', () => {
    const s = sql(MIGRACION)
    expect(s).toMatch(/UNIQUE INDEX IF NOT EXISTS oficina_encargos_uno_por_pedido ON public\.oficina_encargos \(parte_id, brief_id, tipo_de_grupo, version_encargo\)/)
    expect(s).toMatch(/UNIQUE INDEX IF NOT EXISTS oficina_turnos_uno_por_n ON public\.oficina_turnos \(encargo_id, n\)/)
    expect(s).toMatch(/UNIQUE INDEX IF NOT EXISTS oficina_gastos_una_vez ON public\.oficina_gastos \(ref_tabla, ref_id\)/)
    expect(s).toMatch(/UNIQUE INDEX IF NOT EXISTS oficina_artefactos_una_version ON public\.oficina_artefactos \(encargo_id, tipo, version\)/)
  })
  it('el tope del encargo no puede pasar de US$ 10 (la base lo impide) y la oficina solo tiene UNA fila de config', () => {
    const s = sql(MIGRACION)
    expect(s).toMatch(/tope_usd > 0 AND tope_usd <= 10/)
    expect(s).toMatch(/tope_encargo_usd > 0 AND tope_encargo_usd <= 10/)
    expect(s).toMatch(/CHECK \(id = 1\)/)
  })
})

describe('nace APAGADA y las siembras son exactamente lo probado', () => {
  it('config: una fila, estado apagada, sin familias ni clientes de ensayo', () => {
    expect(sql(MIGRACION)).toMatch(/INSERT INTO public\.oficina_config \(id, estado, familias_activas, clientes_ensayo\) VALUES \(1, 'apagada', '\{\}', '\{\}'\) ON CONFLICT \(id\) DO NOTHING/)
  })
  it('la plantilla `post_img` se siembra INACTIVA y es IDÉNTICA a la fotografía congelada de la v1 (pasos, indicaciones y límites)', () => {
    const s = leer(MIGRACION)
    const toma = (tag: string) => JSON.parse(new RegExp(`\\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$::jsonb`).exec(s)![1])
    expect(toma('pasos')).toEqual(POST_IMG_V1.pasos)
    expect(toma('ind')).toEqual(POST_IMG_V1.indicaciones)
    expect(toma('lim')).toEqual(POST_IMG_V1.limites)
    expect(s).toMatch(/,\s*2,\s*10,\s*false\s*\)\s*ON CONFLICT \(tipo\) DO NOTHING/)
    expect(validarPlantilla({ ...POST_IMG, pasos: toma('pasos'), indicaciones: toma('ind'), limites: toma('lim') })).toEqual([])
    expect(POST_IMG_V1.pasos.map((p) => p.clave)).not.toContain('decide_imagen') // es la v1: antes de que la opinión llegara a cada dueño
  })
  it('solo se siembra `post_img` (el carrusel queda como fila futura)', () => {
    expect([...sql(MIGRACION).matchAll(/INSERT INTO public\.oficina_tipos_de_grupo/g)]).toHaveLength(1)
    expect(sql(MIGRACION)).not.toMatch(/carrusel_ig_v1|kit_historias/)
  })
  it('los formatos de entrega se siembran SIN verificar (los límites avisan, no bloquean)', () => {
    const s = sql(MIGRACION)
    const bloque = /INSERT INTO public\.oficina_entrega_formatos[\s\S]*?ON CONFLICT/.exec(s)![0]
    expect(bloque.match(/, false\)/g)).toHaveLength(2)
    expect(bloque).not.toMatch(/, true\)/)
    expect(bloque).toMatch(/1080, 1080/)
    expect(bloque).toMatch(/1080, 1350/)
  })
})

describe('permisos y seguridad por fila: solo `service_role`, y los artefactos solo se agregan', () => {
  const s = sql(MIGRACION)
  it.each(TABLAS)('%s: RLS activo, sin acceso para anon/authenticated, política de service_role', (t) => {
    expect(s).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`)
    expect(s).toContain(`REVOKE ALL ON public.${t} FROM PUBLIC, anon, authenticated;`)
    expect(s).toContain(`CREATE POLICY ${t}_service ON public.${t} FOR ALL TO service_role`)
  })
  it('todas menos `oficina_artefactos` tienen SELECT/INSERT/UPDATE/DELETE para service_role', () => {
    for (const t of TABLAS.filter((x) => x !== 'oficina_artefactos')) expect(s).toContain(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.${t} TO service_role;`)
  })
  it('`oficina_artefactos` solo SELECT e INSERT (la historia es la prueba)', () => {
    expect(s).toContain('GRANT SELECT, INSERT ON public.oficina_artefactos TO service_role;')
    expect(s).not.toMatch(/GRANT[^;]*(UPDATE|DELETE)[^;]*ON public\.oficina_artefactos/)
  })
  it('ningún permiso para anon ni authenticated; recarga el catálogo de PostgREST', () => {
    expect(s).not.toMatch(/GRANT[^;]*TO[^;]*\b(anon|authenticated|PUBLIC)\b/)
    expect(leer(MIGRACION)).toMatch(/NOTIFY pgrst, 'reload schema';\s*$/)
  })
  it('las secuencias (bigserial) tienen permiso de uso', () => {
    expect(s).toMatch(/GRANT USAGE, SELECT ON SEQUENCE[^;]*oficina_turnos_id_seq[^;]*oficina_artefactos_id_seq[^;]*oficina_gastos_id_seq[^;]*oficina_uso_de_fotos_id_seq TO service_role/)
  })
})

describe('la reversa se NIEGA a borrar datos', () => {
  const r = sql(REVERSA)
  it('aborta si hay encargos, plantillas o formatos añadidos, o si la oficina no está apagada', () => {
    expect(r).toMatch(/oficina_encargos[\s\S]*?RAISE EXCEPTION 'REVERSA ABORTADA/)
    expect(r).toMatch(/oficina_tipos_de_grupo WHERE tipo <> ALL \(ARRAY\[''post_img''\]\)/)
    expect(r).toMatch(/oficina_entrega_formatos WHERE NOT/)
    expect(r).toMatch(/estado <> ''apagada''/)
  })
  it('borra primero lo que apunta a los encargos y al final las plantillas y la config', () => {
    const orden = [...r.matchAll(/DROP TABLE IF EXISTS public\.([a-z_]+)/g)].map((m) => m[1])
    expect(orden).toEqual(['oficina_uso_de_fotos', 'oficina_gastos', 'oficina_fichas', 'oficina_artefactos', 'oficina_turnos', 'oficina_encargos', 'oficina_entrega_formatos', 'oficina_config', 'oficina_tipos_de_grupo'])
    expect(orden.indexOf('oficina_encargos')).toBeGreaterThan(orden.indexOf('oficina_turnos'))
    expect(orden.indexOf('oficina_tipos_de_grupo')).toBeGreaterThan(orden.indexOf('oficina_encargos'))
  })
  it('una sola transacción', () => { expect(r).toMatch(/BEGIN;[\s\S]*COMMIT;/) })
})

describe('NADIE más que la propia oficina nombra las tablas (todavía no hay rutas ni flujos)', () => {
  it('ningún archivo de src/ fuera de src/lib/oficina menciona `oficina_`', () => {
    const buscar = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
      const p = path.join(dir, d.name)
      if (d.isDirectory()) return d.name === 'node_modules' || d.name === '.next' ? [] : buscar(p)
      return /\.(ts|tsx|js|mjs)$/.test(d.name) ? [p] : []
    })
    const ajenos = buscar(path.join(RAIZ, 'src')).filter((f) => !f.replace(/\\/g, '/').includes('/src/lib/oficina/') && /\boficina_(tipos_de_grupo|config|encargos|turnos|artefactos|fichas|gastos|uso_de_fotos|entrega_formatos)\b/.test(fs.readFileSync(f, 'utf8')))
    expect(ajenos).toEqual([])
  })
})
