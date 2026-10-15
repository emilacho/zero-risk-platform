// PLAN v3 · V1 · genera la migración de los 5 catálogos + semilla desde `src/lib/planeacion/catalogo/semilla.json` (UNA sola fuente de verdad).
// Uso:  node scripts/ops/plan-v3-catalogo/generar-migracion.mjs [--escribir]    (sin --escribir imprime el SQL)
// La prueba `plan-v3-v1-catalogos.test.ts` exige que el archivo versionado sea EXACTAMENTE lo que este guion genera: la semilla y la migración no se separan.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
export const RAIZ = join(AQUI, '..', '..', '..')
export const RUTA_SEMILLA = join(RAIZ, 'src', 'lib', 'planeacion', 'catalogo', 'semilla.json')
export const NOMBRE_MIGRACION = '202610151300_plan_catalogos_apagada.sql'
export const RUTA_MIGRACION = join(RAIZ, 'supabase', 'migrations', NOMBRE_MIGRACION)

const CTRL = [
  ['version', 'integer NOT NULL DEFAULT 1 CHECK (version >= 1)'],
  ['vigente', 'boolean NOT NULL DEFAULT true'],
  ['desde', 'timestamptz NOT NULL DEFAULT now()'],
  ['pais', 'text'],
]
const VIAS = "('cerebro', 'crudo', 'relleno')"

/** columnas de NEGOCIO por tabla: [nombre, tipo SQL + restricciones, clase JSON para el escritor de valores] · deben coincidir con `TABLAS` de `catalogo-agregar/nucleo.mjs` (la prueba lo exige) */
export const ESQUEMA = {
  plan_catalogo_fuentes: {
    clave: 'fuente_id', semilla: 'fuentes',
    columnas: [
      ['fuente_id', 'text NOT NULL', 'texto'], ['proveedor', 'text NOT NULL', 'texto'], ['funcion', 'text NOT NULL', 'texto'],
      ['via', `text NOT NULL DEFAULT 'relleno' CHECK (via IN ${VIAS})`, 'texto'], ['alcance', 'text', 'texto'], ['aplica_si', 'jsonb', 'json'],
      ['criticidad', "text NOT NULL CHECK (criticidad IN ('critica', 'normal', 'baja'))", 'texto'],
      ['reintentos', 'integer NOT NULL DEFAULT 0 CHECK (reintentos BETWEEN 0 AND 3)', 'num'],
      ['plazo_s', 'integer NOT NULL CHECK (plazo_s BETWEEN 1 AND 900)', 'num'],
      ['tope_usd', 'numeric(6,2) NOT NULL CHECK (tope_usd BETWEEN 0 AND 5)', 'num'],
      ['forma', "text[] NOT NULL DEFAULT '{}'", 'lista'], ['moldes_de_ensayo', "text[] NOT NULL DEFAULT '{}'", 'lista'],
      ['identidad_campos', "text[] NOT NULL DEFAULT '{}'", 'lista'], ['da_ausencia_con', 'text', 'texto'],
    ],
  },
  plan_catalogo_tipos: {
    clave: 'tipo_id', semilla: 'tipos',
    columnas: [
      ['tipo_id', 'text NOT NULL', 'texto'], ['atributo_cerebro', 'text', 'texto'],
      ['clase_dato', "text NOT NULL DEFAULT 'atributo' CHECK (clase_dato IN ('atributo', 'acumula'))", 'texto'],
      ['unidad', 'text NOT NULL', 'texto'], ['moneda_requerida', 'boolean NOT NULL DEFAULT false', 'bool'], ['rango', 'jsonb', 'json'],
      ['frescura_limite_h', 'numeric(8,1) NOT NULL CHECK (frescura_limite_h > 0)', 'num'], ['critico', 'boolean NOT NULL DEFAULT false', 'bool'],
      ['tolerancia_redondeo', 'numeric(6,3) NOT NULL DEFAULT 0 CHECK (tolerancia_redondeo BETWEEN 0 AND 1)', 'num'],
      ['n_minimo', 'integer NOT NULL DEFAULT 0 CHECK (n_minimo >= 0)', 'num'], ['periodo_requerido', 'boolean NOT NULL DEFAULT false', 'bool'],
      ['comparable_con', "text[] NOT NULL DEFAULT '{}'", 'lista'],
      ['via_preferida', `text NOT NULL DEFAULT 'cerebro' CHECK (via_preferida IN ${VIAS})`, 'texto'],
    ],
  },
  plan_catalogo_reglas: {
    clave: 'regla_id', semilla: 'reglas',
    columnas: [
      ['regla_id', 'text NOT NULL', 'texto'],
      ['clase', "text NOT NULL CHECK (clase IN ('identidad', 'contradiccion', 'precedencia', 'cambio_material', 'moneda_pais', 'parametro'))", 'texto'],
      ['operador', "text NOT NULL CHECK (operador IN ('delegada_en_portero', 'rango', 'edad_max_h', 'igual_unidad', 'difiere_mas_de', 'precede', 'contiene_termino', 'n_minimo'))", 'texto'],
      ['parametros', 'jsonb NOT NULL', 'json'], ['aplica_a', 'jsonb NOT NULL', 'json'],
      ['severidad', "text NOT NULL CHECK (severidad IN ('bloquea', 'avisa'))", 'texto'],
    ],
  },
  plan_catalogo_lexico: {
    clave: 'lexico_id', semilla: 'lexico',
    columnas: [
      ['lexico_id', 'text NOT NULL', 'texto'], ['idioma', 'text NOT NULL', 'texto'],
      ['grupo', "text NOT NULL CHECK (grupo IN ('verificacion', 'ausencia', 'supuesto', 'dominio', 'periodo'))", 'texto'],
      ['terminos', 'text[] NOT NULL CHECK (cardinality(terminos) >= 1)', 'lista'],
    ],
  },
  plan_catalogo_topes: {
    clave: 'tope_id', semilla: 'topes',
    columnas: [
      ['tope_id', 'text NOT NULL', 'texto'], ['tramo', 'text NOT NULL', 'texto'], ['fuente_id', 'text', 'texto'],
      ['usd', 'numeric(6,2) NOT NULL CHECK (usd BETWEEN 0 AND 10)', 'num'], ['contador', 'text NOT NULL', 'texto'],
    ],
  },
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`
function valor(clase, v) {
  if (v === undefined || v === null) return 'NULL'
  switch (clase) {
    case 'texto': return q(v)
    case 'num': return String(v)
    case 'bool': return v ? 'true' : 'false'
    case 'json': return `${q(JSON.stringify(v))}::jsonb`
    case 'lista': return `ARRAY[${v.map(q).join(', ')}]::text[]`
    default: throw new Error(`clase desconocida ${clase}`)
  }
}

export function generarSql(semilla) {
  const out = []
  out.push(
    '-- PLAN v3 · V1 · los 5 catálogos del plan + semilla · CC#1 · 2026-10-15 · PROPUESTA · NO APLICADA · se aplica con respaldo y SIN corridas en vuelo (quien tenga escritura; CC#3 mide)',
    '-- Diseño: raw/tasks/2026-10-14-DISENO-CC1-plan-v3.md §4 (cinco tablas), §14.7 (via, atributo_cerebro), §17.3 (via_preferida de tres valores), §13.3 bis (G3/G4/G5/G7).',
    '-- GENERADO por scripts/ops/plan-v3-catalogo/generar-migracion.mjs desde src/lib/planeacion/catalogo/semilla.json: NO se edita a mano (la prueba exige que coincidan).',
    '-- 🔴 SOLO tablas NUEVAS (CREATE IF NOT EXISTS) y filas de semilla (ON CONFLICT DO NOTHING). No toca `portero`, alta, Servicio de Apify ni ninguna tabla vieja. IDEMPOTENTE.',
    '-- 🔴 Una fila = una versión: nunca se edita en sitio (V12 inserta version+1 y voltea `vigente`). Índice único parcial: UNA vigente por clave.',
    '-- 🔴 `anon` y `authenticated`: SIN permiso ni política; solo `service_role` (la ruta interna). AGNÓSTICA: ningún rubro, ciudad ni cliente en el esquema.',
    '-- REVERSA: supabase/reversas/202610151300_plan_catalogos_apagada_REVERSA.sql (se niega a borrar si hay filas propias, es decir, más que la semilla).',
    'BEGIN;', '',
  )
  for (const [tabla, def] of Object.entries(ESQUEMA)) {
    const cols = [
      '  id uuid PRIMARY KEY DEFAULT gen_random_uuid()',
      ...def.columnas.map(([n, t]) => `  ${n} ${t}`),
      ...CTRL.map(([n, t]) => `  ${n} ${t}`),
      '  creado_en timestamptz NOT NULL DEFAULT now()',
      `  UNIQUE (${def.clave}, version)`,
    ]
    out.push(`CREATE TABLE IF NOT EXISTS public.${tabla} (`, cols.join(',\n').replace(',\n  , UNIQUE', ',\n  UNIQUE'), ');')
    out.push(`CREATE UNIQUE INDEX IF NOT EXISTS ${tabla}_una_vigente ON public.${tabla} (${def.clave}) WHERE vigente;`)
    out.push(`REVOKE ALL ON public.${tabla} FROM anon, authenticated;`, `ALTER TABLE public.${tabla} ENABLE ROW LEVEL SECURITY;`,
      `GRANT SELECT, INSERT, UPDATE ON public.${tabla} TO service_role;`,
      `DO $pol_${tabla}$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.${tabla}'::regclass AND polname = '${tabla}_service') THEN CREATE POLICY ${tabla}_service ON public.${tabla} FOR ALL TO service_role USING (true) WITH CHECK (true); END IF; END $pol_${tabla}$;`, '')
  }
  out.push('-- ── semilla (versión 1, vigente) ──')
  for (const [tabla, def] of Object.entries(ESQUEMA)) {
    for (const f of semilla[def.semilla]) {
      const nombres = def.columnas.map(([n]) => n).filter((n) => f[n] !== undefined && f[n] !== null)
      const clases = Object.fromEntries(def.columnas.map(([n, , c]) => [n, c]))
      const cols = [...nombres, 'version', 'vigente', ...(f.pais ? ['pais'] : [])]
      const vals = [...nombres.map((n) => valor(clases[n], f[n])), '1', 'true', ...(f.pais ? [q(f.pais)] : [])]
      out.push(`INSERT INTO public.${tabla} (${cols.join(', ')}) VALUES (${vals.join(', ')}) ON CONFLICT (${def.clave}, version) DO NOTHING;`)
    }
  }
  out.push('', 'COMMIT;', '', "NOTIFY pgrst, 'reload schema';", '')
  return out.join('\n')
}

export function generarReversa(semilla) {
  const tablas = Object.keys(ESQUEMA)
  const filasSemilla = (t) => semilla[ESQUEMA[t].semilla].length
  const bloques = tablas.map((t) => `  IF to_regclass('public.${t}') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.${t}' INTO n;
    IF n > ${filasSemilla(t)} THEN extras := extras || format('${t}=%s ', n); END IF;
  END IF;`).join('\n')
  return `-- REVERSA de ${NOMBRE_MIGRACION} · CC#1 · 2026-10-15 · NO APLICADA · GENERADA (no se edita a mano)
-- Se NIEGA a borrar si alguna tabla tiene MÁS filas que la semilla (alguien dio de alta una versión: es evidencia de uso). Con solo la semilla, borra las cinco.
-- 🔴 CUANDO LA GUARDA SALTA, ESTE ARCHIVO DEJA SU TRANSACCIÓN ABIERTA (el BEGIN no llega a su COMMIT): en una SESIÓN INTERACTIVA hace falta un ROLLBACK a mano.
--    Ejecutado como UN solo envío (API de administración, \`psql -f\`) no importa: la conexión se cierra y la transacción se deshace sola.
BEGIN;

DO $plan_catalogos_reversa$
DECLARE
  n integer := 0;
  extras text := '';
BEGIN
${bloques}
  IF extras <> '' THEN
    RAISE EXCEPTION 'plan_catalogo_*: hay filas propias (% ); no se borra. Si usas una sesión interactiva, ROLLBACK.', extras;
  END IF;
END
$plan_catalogos_reversa$;

${tablas.map((t) => `DROP TABLE IF EXISTS public.${t};`).join('\n')}

COMMIT;

NOTIFY pgrst, 'reload schema';
`
}

export const RUTA_REVERSA = join(RAIZ, 'supabase', 'reversas', NOMBRE_MIGRACION.replace('.sql', '_REVERSA.sql'))
export const leerSemilla = () => JSON.parse(readFileSync(RUTA_SEMILLA, 'utf8'))

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const s = leerSemilla()
  if (process.argv.includes('--escribir')) {
    writeFileSync(RUTA_MIGRACION, generarSql(s))
    writeFileSync(RUTA_REVERSA, generarReversa(s))
    console.log(`escrito ${RUTA_MIGRACION}\nescrito ${RUTA_REVERSA}`)
  } else console.log(generarSql(s))
}
