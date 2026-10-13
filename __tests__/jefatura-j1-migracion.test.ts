/**
 * JEFATURA como oficina propia · J1 · la migración 202610131000 (aditiva · idempotente · con reversa · APAGADA) y su foto antes/después. US$ 0: solo lee archivos; no toca base ni red.
 * Lo que vigila (cada línea se probó poniéndola en rojo con una mutación, ver el papel LISTO-CC1-jefatura-J1-J3):
 *  · no se EDITA la migración de julio (huella fija) y esta no hace UPDATE/DELETE/DROP TABLE sobre nada que ya existía;
 *  · solo relaja los 3 CHECK que dice y los 7 renglones de julio siguen cumpliéndolos (espejo puro de los CHECK);
 *  · 4 tablas nuevas, cada una con RLS + REVOKE + GRANT + política; NOTIFY al final; la jefatura nace apagada y los 6 renglones nuevos nacen INACTIVOS;
 *  · la reversa se niega si hay uso y no toca los renglones de julio;
 *  · `tope_revision_usd` del plan = 5,00 (corrección 1 de CC#3);
 *  · la foto antes/después detecta un cambio en el cimiento y una fila nueva ACTIVA.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { JefaturaGradingPolicy } from '../src/lib/jefatura/contract'
import { armarFoto, compararFotos, COLUMNAS_DE_JULIO } from '../scripts/ops/jefatura-j1-antes-despues.mjs'

const RAIZ = resolve(__dirname, '..')
const leer = (...p: string[]) => (existsSync(resolve(RAIZ, ...p)) ? readFileSync(resolve(RAIZ, ...p), 'utf8').replace(/\r\n/g, '\n') : '')
const SQL = leer('supabase', 'migrations', '202610131000_jefatura_revision_oficina_propia.sql')
const REVERSA = leer('supabase', 'reversas', '202610131000_jefatura_revision_oficina_propia_REVERSA.sql')
const JULIO = leer('supabase', 'migrations', '202607051200_jefatura_grading_policies.sql')
const sinComentarios = (s: string) => s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
const CUERPO = sinComentarios(SQL)

/** la huella de la migración de julio: si alguien la edita, esta prueba se pone en rojo (la migración nueva existe justamente para no editarla) */
const HUELLA_DE_JULIO = 'd3b2c12e0a58a39202eabc05df022f5e55bca4c7279edab8182da6d06acdf79d'

const TIPOS_NUEVOS = ['plan', 'estrategia', 'calendario', 'brief', 'pieza', 'manual']
const TIPOS_DE_JULIO = ['brand_book', 'icp', 'competitive', 'ad_creative', 'copy', 'email', 'landing']
const TABLAS_NUEVAS = ['jefatura_config', 'jefatura_revisiones', 'jefatura_pasos', 'jefatura_fichas']

describe('J1 · la migración nueva existe y no edita la de julio', () => {
  it('el archivo nuevo y su reversa existen', () => {
    expect(SQL.length).toBeGreaterThan(1000)
    expect(REVERSA.length).toBeGreaterThan(500)
  })
  it('la migración de julio NO se editó (huella fija)', () => {
    expect(createHash('sha256').update(JULIO).digest('hex')).toBe(HUELLA_DE_JULIO)
  })
  it('se declara PROPUESTA · NO APLICADA y con orden de publicación', () => {
    expect(SQL).toMatch(/NO APLICADA/)
    expect(SQL).toMatch(/CERO corridas/)
    expect(SQL).toMatch(/REVERSA:/)
  })
  it('va en una transacción y avisa a PostgREST DESPUÉS del COMMIT', () => {
    expect(CUERPO).toMatch(/^\s*BEGIN;/m)
    const c = CUERPO.indexOf('COMMIT;'), n = CUERPO.indexOf("NOTIFY pgrst, 'reload schema'")
    expect(c).toBeGreaterThan(0)
    expect(n).toBeGreaterThan(c)
  })
})

describe('J1 · solo aditiva: nada de lo que existía se borra ni se cambia de valor', () => {
  it('no hay DROP TABLE, TRUNCATE, DELETE ni UPDATE', () => {
    expect(CUERPO).not.toMatch(/\bDROP\s+TABLE\b/i)
    expect(CUERPO).not.toMatch(/\bTRUNCATE\b/i)
    expect(CUERPO).not.toMatch(/\bDELETE\s+FROM\b/i)
    expect(CUERPO).not.toMatch(/^\s*UPDATE\s/im)
  })
  it('el único DROP CONSTRAINT es de los 3 CHECK que se relajan', () => {
    const drops = [...CUERPO.matchAll(/DROP CONSTRAINT IF EXISTS (\w+)/g)].map((m) => m[1]).sort()
    expect(new Set(drops)).toEqual(new Set(['jefatura_grading_policies_artifact_class_check', 'jefatura_grading_policies_canon_grader_check', 'jefatura_grader_class_match']))
    expect(CUERPO).not.toMatch(/DROP COLUMN/i)
  })
  it('no toca el CHECK de no-circularidad del cimiento ni el máximo de ciclos', () => {
    expect(CUERPO).not.toMatch(/DROP CONSTRAINT[^;]*jefatura_no_circular_cimiento/)
    expect(CUERPO).not.toMatch(/max_cycles\s+(INTEGER|SET)/)
  })
  it('todas las columnas nuevas son ADD COLUMN IF NOT EXISTS y ninguna NOT NULL (los renglones de julio no las llenan)', () => {
    const cols = [...CUERPO.matchAll(/ALTER TABLE public\.jefatura_grading_policies ADD COLUMN IF NOT EXISTS (\w+) ([^;]+);/g)]
    expect(cols.map((m) => m[1]).sort()).toEqual(['chequeos_previos', 'contra_que', 'destino_cierre', 'esquema_correccion', 'huecos_pregunta', 'indicacion_fondo', 'productores', 'reentrega', 'revisor_ciego', 'revisor_ciego_modelo_env', 'revisor_fondo', 'tope_paso_usd', 'tope_revision_usd'].sort())
    for (const c of cols) expect(c[2]).not.toMatch(/NOT NULL|DEFAULT/i)
  })
  it('la siembra de políticas usa ON CONFLICT DO NOTHING (no pisa nada) y solo nombra los 6 tipos nuevos', () => {
    const bloque = CUERPO.slice(CUERPO.indexOf('INSERT INTO public.jefatura_grading_policies'))
    expect(bloque.slice(0, bloque.indexOf('ON CONFLICT (artifact_type) DO NOTHING') + 40)).toMatch(/ON CONFLICT \(artifact_type\) DO NOTHING/)
    const tipos = [...bloque.matchAll(/^\s*\('(\w+)', 'revision'/gm)].map((m) => m[1])
    expect(tipos).toEqual(TIPOS_NUEVOS)
    for (const t of TIPOS_DE_JULIO) expect(bloque).not.toMatch(new RegExp(`\\('${t}'`))
  })
})

describe('J1 · los 3 CHECK relajados admiten lo de julio y lo nuevo (espejo puro de los CHECK)', () => {
  type Fila = { artifact_type: string; artifact_class: string; canon_grader: string; judgment_enabled: boolean; revisor_fondo?: string | null; reentrega?: string | null; destino_cierre?: string | null; tope_revision_usd?: number | null; productores?: unknown }
  /** réplica de los CHECK de la migración nueva + los de julio que siguen vigentes */
  const cumple = (f: Fila): boolean => {
    if (!['cimiento', 'contenido', 'revision'].includes(f.artifact_class)) return false
    if (!['fidelity', 'vote_3_of_n', 'par_fondo_y_ciego'].includes(f.canon_grader)) return false
    const pareja = (f.artifact_class === 'cimiento' && f.canon_grader === 'fidelity') || (f.artifact_class === 'contenido' && f.canon_grader === 'vote_3_of_n') || (f.artifact_class === 'revision' && f.canon_grader === 'par_fondo_y_ciego')
    if (!pareja) return false
    if (f.artifact_class === 'cimiento' && f.judgment_enabled) return false // jefatura_no_circular_cimiento (julio)
    if (f.artifact_class === 'revision' && f.judgment_enabled) return false // jefatura_revision_sin_voto
    if (f.artifact_class === 'revision' && f.artifact_type !== 'manual' && !(f.revisor_fondo && f.reentrega && f.destino_cierre && f.tope_revision_usd != null && f.productores != null)) return false
    if (f.tope_revision_usd != null && !(f.tope_revision_usd > 0 && f.tope_revision_usd <= 10)) return false
    return true
  }
  it('los 7 renglones de julio (clase/grader/voto) siguen pasando', () => {
    const filas: Fila[] = [
      ...['brand_book', 'icp', 'competitive'].map((t) => ({ artifact_type: t, artifact_class: 'cimiento', canon_grader: 'fidelity', judgment_enabled: false })),
      ...['ad_creative', 'copy', 'email', 'landing'].map((t) => ({ artifact_type: t, artifact_class: 'contenido', canon_grader: 'vote_3_of_n', judgment_enabled: true })),
    ]
    expect(filas.every(cumple)).toBe(true)
  })
  it('el cimiento que se vota SIGUE rechazado', () => {
    expect(cumple({ artifact_type: 'brand_book', artifact_class: 'cimiento', canon_grader: 'fidelity', judgment_enabled: true })).toBe(false)
  })
  it('una revisión que vota se rechaza; una revisión sin revisor de fondo se rechaza (salvo `manual`)', () => {
    const buena: Fila = { artifact_type: 'plan', artifact_class: 'revision', canon_grader: 'par_fondo_y_ciego', judgment_enabled: false, revisor_fondo: 'jefe-marketing', reentrega: 'version_nueva', destino_cierre: 'siguiente_paso', tope_revision_usd: 5, productores: [] }
    expect(cumple(buena)).toBe(true)
    expect(cumple({ ...buena, judgment_enabled: true })).toBe(false)
    expect(cumple({ ...buena, revisor_fondo: null })).toBe(false)
    expect(cumple({ ...buena, tope_revision_usd: 11 })).toBe(false)
    expect(cumple({ artifact_type: 'manual', artifact_class: 'revision', canon_grader: 'par_fondo_y_ciego', judgment_enabled: false, reentrega: 'ninguna' })).toBe(true)
    expect(cumple({ ...buena, canon_grader: 'fidelity' })).toBe(false) // pareja cruzada
  })
  it('el SQL de verdad tiene esos mismos predicados (el espejo no se desincroniza)', () => {
    expect(CUERPO).toMatch(/artifact_class IN \('cimiento', 'contenido', 'revision'\)/)
    expect(CUERPO).toMatch(/canon_grader IN \('fidelity', 'vote_3_of_n', 'par_fondo_y_ciego'\)/)
    expect(CUERPO).toMatch(/artifact_class = 'revision'\s+AND canon_grader = 'par_fondo_y_ciego'/)
    expect(CUERPO).toMatch(/artifact_class <> 'revision' OR judgment_enabled = false/)
    expect(CUERPO).toMatch(/artifact_class <> 'revision' OR artifact_type = 'manual' OR/)
    expect(CUERPO).toMatch(/tope_revision_usd > 0 AND tope_revision_usd <= 10/)
    expect(CUERPO).toMatch(/reentrega IN \('ninguna', 'parcial', 'completa', 'version_nueva'\)/)
    expect(CUERPO).toMatch(/destino_cierre IN \('bandeja', 'siguiente_paso'\)/)
  })
  it('es repetible: cada CHECK se re-crea solo si todavía no está en su forma nueva', () => {
    expect(CUERPO).toMatch(/position\('revision' IN def\) = 0/)
    expect(CUERPO.match(/position\('par_fondo_y_ciego' IN def\) = 0/g)?.length).toBe(2)
    for (const n of ['jefatura_policies_destino_cierre_valido', 'jefatura_policies_reentrega_valida', 'jefatura_policies_tope_revision_valido', 'jefatura_revision_sin_voto', 'jefatura_revision_completa']) {
      expect(CUERPO).toMatch(new RegExp(`IF NOT EXISTS \\(SELECT 1 FROM pg_constraint WHERE [^)]*conname = '${n}'\\)`))
    }
  })
})

describe('J1 · las 4 tablas nuevas, con permisos (CREATE TABLE no alcanza) y APAGADAS', () => {
  it.each(TABLAS_NUEVAS)('%s: IF NOT EXISTS · RLS · REVOKE · GRANT a service_role · política', (t) => {
    expect(CUERPO).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t}\\b`))
    expect(CUERPO).toMatch(new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`))
    expect(CUERPO).toMatch(new RegExp(`REVOKE ALL ON public\\.${t} FROM PUBLIC, anon, authenticated`))
    expect(CUERPO).toMatch(new RegExp(`GRANT SELECT, INSERT, UPDATE, DELETE ON public\\.${t} TO service_role`))
    expect(CUERPO).toMatch(new RegExp(`polname = '${t}_service'`))
  })
  it('la secuencia de los pasos tiene permiso (si no, el insert falla en silencio)', () => {
    expect(CUERPO).toMatch(/GRANT USAGE, SELECT ON SEQUENCE public\.jefatura_pasos_id_seq TO service_role/)
  })
  it('ninguna tabla nueva se abre a anon ni a authenticated', () => {
    expect(CUERPO).not.toMatch(/GRANT[^;]*(anon|authenticated)/i)
  })
  it('la jefatura nace APAGADA: una sola fila, sin tipos ni clientes de ensayo', () => {
    expect(CUERPO).toMatch(/INSERT INTO public\.jefatura_config \(id, estado, tipos_activos, clientes_ensayo\) VALUES \(1, 'apagada', '\{\}', '\{\}'\) ON CONFLICT \(id\) DO NOTHING/)
    expect(CUERPO).toMatch(/jefatura_config_una_sola_fila CHECK \(id = 1\)/)
    expect(CUERPO).toMatch(/estado IN \('apagada', 'ensayo', 'encendida'\)/)
  })
  it('la base da la idempotencia: una revisión por (tipo, artefacto, versión, seco/real) y un intento por paso (G2)', () => {
    expect(CUERPO).toMatch(/UNIQUE INDEX IF NOT EXISTS jefatura_revisiones_una_por_artefacto ON public\.jefatura_revisiones \(artifact_type, artifact_id, version, dry_run\)/)
    expect(CUERPO).toMatch(/UNIQUE INDEX IF NOT EXISTS jefatura_pasos_uno_por_paso_e_intento ON public\.jefatura_pasos \(revision_id, paso, intento\)/)
    expect(CUERPO).toMatch(/UNIQUE INDEX IF NOT EXISTS jefatura_pasos_uno_por_n ON public\.jefatura_pasos \(revision_id, n\)/)
    expect(CUERPO).toMatch(/UNIQUE INDEX IF NOT EXISTS jefatura_pasos_una_llave ON public\.jefatura_pasos \(dispatch_key\) WHERE dispatch_key IS NOT NULL/)
  })
  it('`dry_run` es obligatorio en la revisión (NOT NULL, sin valor por omisión)', () => {
    expect(CUERPO).toMatch(/dry_run\s+boolean\s+NOT NULL,/)
  })
  it('los resultados admitidos son exactamente los 5 del contrato', () => {
    expect(CUERPO).toMatch(/resultado IN \('limpia', 'con_desacuerdo', 'sin_segunda_mirada', 'incompleta_por_tope', 'fallida'\)/)
  })
})

describe('J1 · los 6 renglones nuevos nacen INACTIVOS y con los topes corregidos', () => {
  const bloque = CUERPO.slice(CUERPO.indexOf('INSERT INTO public.jefatura_grading_policies'))
  const fila = (t: string) => {
    const m = new RegExp(String.raw`^\s*\('${t}', 'revision'`, 'm').exec(bloque)
    if (!m) return ''
    const resto = bloque.slice(m.index + m[0].length)
    const j = resto.search(/^\s*\('\w+', 'revision'/m)
    return m[0] + (j < 0 ? resto.slice(0, resto.indexOf('ON CONFLICT')) : resto.slice(0, j))
  }
  it.each(TIPOS_NUEVOS)('%s: clase revision · par_fondo_y_ciego · sin voto · is_active = false', (t) => {
    expect(fila(t)).toMatch(/'revision', true, false, 'par_fondo_y_ciego', NULL, 1, NULL, NULL,\s*'[^']*', false,/)
  })
  it('el tope de revisión del PLAN es 5,00 y no 3 (corrección 1 de CC#3); correccion y decision 2,00', () => {
    const p = fila('plan')
    expect(p).toMatch(/ARRAY\['revisarPlan'\], 5\.00,/)
    expect(p).not.toMatch(/\b3\.00\b/)
    expect(p).toMatch(/"correccion":2\.0/)
    expect(p).toMatch(/"decision":2\.0/)
    expect(p).toMatch(/'version_nueva'\)/)
    expect(p).toMatch(/'siguiente_paso'/)
  })
  it('brief = solo marca: reentrega ninguna, sin esquema de corrección ni pasos de corregir/decidir', () => {
    const b = fila('brief')
    expect(b).toMatch(/'ninguna'\)/)
    expect(b).not.toMatch(/"correccion"|"decision"/)
  })
  it('pieza termina en la bandeja; los demás siguen a su consumidor', () => {
    expect(fila('pieza')).toMatch(/'bandeja', 'parcial'\)/)
    for (const t of ['plan', 'estrategia', 'calendario', 'brief']) expect(fila(t)).toMatch(/'siguiente_paso'/)
  })
  it('manual: sin revisor de fondo (no-circularidad), sin destino, apagado', () => {
    const m = fila('manual')
    expect(m).toMatch(/NULL, false, NULL, NULL, '\[\]'::jsonb/)
    expect(m).toMatch(/'ninguna'\)/)
  })
  it('todas las líneas de contexto de jefe-marketing son una sola línea con el hueco de documentos y SIN voseo', () => {
    for (const t of ['plan', 'estrategia', 'calendario', 'brief']) {
      const l = fila(t).match(/'(Estás revisando [^']+)'/)
      expect(l, t).toBeTruthy()
      expect(l![1]).toMatch(/\{documentos\}\.$/)
      expect(l![1]).not.toMatch(/\b(estás|revisás|tenés|vos)\b.*\b(vos|tenés|revisás)\b/i)
    }
    expect(CUERPO).not.toMatch(/\b(tenés|querés|podés|sabés|revisás|decís|hacés|sos)\b/)
  })
  it('el nombre de la variable del modelo del revisor ciego está, pero no un valor de modelo', () => {
    expect(CUERPO).toMatch(/'JEFATURA_REVISOR_MODEL'/)
    expect(CUERPO).not.toMatch(/gpt-\d/i)
  })
})

describe('J1 · la reversa se niega si hubo uso y no toca los renglones de julio', () => {
  it('se niega con revisiones, pasos, fichas, la llave encendida o políticas activas', () => {
    for (const x of ['jefatura_revisiones', 'jefatura_pasos', 'jefatura_fichas']) expect(REVERSA).toMatch(new RegExp(`FROM public\\.${x}'? INTO`))
    expect((REVERSA.match(/REVERSA RECHAZADA/g) ?? []).length).toBeGreaterThanOrEqual(6)
    expect(REVERSA).toMatch(/estado <> 'apagada'/)
    expect(REVERSA).toMatch(/is_active = true/)
  })
  it('no hace UPDATE ni DELETE sobre los renglones de julio: solo borra clase revision, inactivos y de los 6 tipos', () => {
    expect(sinComentarios(REVERSA)).not.toMatch(/^\s*UPDATE\s/im)
    const dels = [...sinComentarios(REVERSA).matchAll(/DELETE FROM public\.jefatura_grading_policies WHERE ([^;]+);/g)]
    expect(dels).toHaveLength(1)
    expect(dels[0][1]).toMatch(/artifact_class = 'revision'/)
    expect(dels[0][1]).toMatch(/is_active = false/)
    for (const t of TIPOS_DE_JULIO) expect(dels[0][1]).not.toMatch(new RegExp(`'${t}'`))
  })
  it('devuelve los 3 CHECK a su forma de julio y borra las 4 tablas y las 13 columnas', () => {
    expect(REVERSA).toMatch(/CHECK \(artifact_class IN \('cimiento', 'contenido'\)\)/)
    expect(REVERSA).toMatch(/CHECK \(canon_grader IN \('fidelity', 'vote_3_of_n'\)\)/)
    for (const t of TABLAS_NUEVAS) expect(REVERSA).toMatch(new RegExp(`DROP TABLE IF EXISTS public\\.${t};`))
    expect((REVERSA.match(/DROP COLUMN IF EXISTS/g) ?? []).length).toBe(13)
  })
  it('borra primero las tablas hijas (fichas → pasos → revisiones → config)', () => {
    const i = (t: string) => REVERSA.indexOf(`DROP TABLE IF EXISTS public.${t}`)
    expect(i('jefatura_fichas')).toBeLessThan(i('jefatura_pasos'))
    expect(i('jefatura_pasos')).toBeLessThan(i('jefatura_revisiones'))
    expect(i('jefatura_revisiones')).toBeLessThan(i('jefatura_config'))
  })
})

describe('J1 · contract.ts admite los valores nuevos (condición 6 de CC#3)', () => {
  it("una política de clase 'revision' con par_fondo_y_ciego es del tipo", () => {
    const p: JefaturaGradingPolicy = { artifact_type: 'plan', artifact_class: 'revision', correction_enabled: true, judgment_enabled: false, canon_grader: 'par_fondo_y_ciego', counterweight: null, max_cycles: 1, fidelity_threshold: null, vote_config: null, is_active: false }
    expect(p.artifact_class).toBe('revision')
    expect(readFileSync(resolve(RAIZ, 'src', 'lib', 'jefatura', 'contract.ts'), 'utf8')).toMatch(/'cimiento' \| 'contenido' \| 'revision'/)
  })
})

describe('J1 · la foto antes/después (solo lectura) compara lo que debe', () => {
  const julio = (extra: Record<string, unknown> = {}) => [
    { artifact_type: 'brand_book', artifact_class: 'cimiento', correction_enabled: true, judgment_enabled: false, canon_grader: 'fidelity', counterweight: 'shadow_scorer', max_cycles: 1, fidelity_threshold: 0.85, vote_config: null, notes: 'n', is_active: true, created_at: 'a', updated_at: 'a', ...extra },
    { artifact_type: 'icp', artifact_class: 'cimiento', correction_enabled: true, judgment_enabled: false, canon_grader: 'fidelity', counterweight: 'shadow_scorer', max_cycles: 1, fidelity_threshold: 0.85, vote_config: null, notes: 'n', is_active: true, created_at: 'a', updated_at: 'a' },
    { artifact_type: 'competitive', artifact_class: 'cimiento', correction_enabled: true, judgment_enabled: false, canon_grader: 'fidelity', counterweight: 'shadow_scorer', max_cycles: 1, fidelity_threshold: 0.85, vote_config: null, notes: 'n', is_active: true, created_at: 'a', updated_at: 'a' },
    { artifact_type: 'copy', artifact_class: 'contenido', correction_enabled: true, judgment_enabled: true, canon_grader: 'vote_3_of_n', counterweight: 'gpt55_non_voting', max_cycles: 1, fidelity_threshold: null, vote_config: { expected_votes: 3 }, notes: 'n', is_active: true, created_at: 'a', updated_at: 'a' },
  ]
  const nueva = (activa: boolean) => ({ artifact_type: 'plan', artifact_class: 'revision', is_active: activa, revisor_fondo: 'jefe-marketing' })
  it('sin cambios en julio y con una fila nueva INACTIVA y columnas nuevas: idéntico', () => {
    const antes = armarFoto(julio())
    const despues = armarFoto([...julio().map((f) => ({ ...f, revisor_fondo: null, reentrega: null })), nueva(false)])
    expect(compararFotos(antes, despues)).toEqual({ ok: true, cambios: [] })
  })
  it('detecta un cambio en una fila del cimiento', () => {
    const r = compararFotos(armarFoto(julio()), armarFoto(julio({ fidelity_threshold: 0.8 })))
    expect(r.ok).toBe(false)
    expect(r.cambios.join(' ')).toMatch(/brand_book/)
  })
  it('detecta que desapareció lo que lee grade-cimiento', () => {
    const r = compararFotos(armarFoto(julio()), armarFoto(julio({ is_active: false })))
    expect(r.ok).toBe(false)
    expect(r.cambios.join(' ')).toMatch(/grade-cimiento/)
  })
  it('detecta una fila nueva ACTIVA (debe nacer inactiva)', () => {
    const r = compararFotos(armarFoto(julio()), armarFoto([...julio(), nueva(true)]))
    expect(r.ok).toBe(false)
    expect(r.cambios.join(' ')).toMatch(/ACTIVAS/)
  })
  it('compara solo las columnas de julio', () => {
    expect(COLUMNAS_DE_JULIO).toHaveLength(13)
  })
})
