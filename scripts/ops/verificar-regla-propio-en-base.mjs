// Corre LOS MISMOS casos de __tests__/fixtures/regla-propio-casos.json contra la regla de la base (migración 202610311300), SIN tocar nada real:
// crea copias de prueba de las funciones con otro nombre (zzcc3_cwp_*), las prueba por SELECT y las borra al final. Uso (con doppler run -p zero-risk -c prd --):
//   node scripts/ops/verificar-regla-propio-en-base.mjs [ruta-de-la-migracion]
// Sale con código 1 si algún caso de la base difiere del archivo. Nunca imprime llaves.
import { readFileSync } from 'node:fs'
import { sql } from './lib-sql-ops.mjs'

const migracion = process.argv[2] || 'supabase/migrations/202610311300_client_web_pages_regla_unica_propio.sql'
const casos = JSON.parse(readFileSync('__tests__/fixtures/regla-propio-casos.json', 'utf8'))
const ddl = readFileSync(migracion, 'utf8')
  .replace(/^\s*BEGIN;\s*$/gm, '').replace(/^\s*COMMIT;\s*$/gm, '').replace(/^\s*NOTIFY .*$/gm, '')
  .replaceAll('public.client_web_pages_', 'public.zzcc3_cwp_')
const lit = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replaceAll("'", "''")}'`)
const jsonb = (v) => `${lit(JSON.stringify(v ?? {}))}::jsonb`
let fallos = 0
try {
  await sql(ddl)
  const filas = casos.map((c, i) => `(${i}, ${lit(c.web)}, ${jsonb(c.cfg)}, ${lit(c.url)})`).join(',\n')
  const r = await sql(`select i, public.zzcc3_cwp_es_propia(web, public.zzcc3_cwp_cuentas_de(web, cfg), url) v from (values ${filas}) t(i, web, cfg, url) order by i`)
  for (const x of r) {
    const c = casos[x.i]
    if (x.v !== c.v) { fallos++; console.log(`✗ ${c.n}: la base dijo «${x.v}» y el archivo «${c.v}»`) }
  }
  // el envoltorio con la firma de siempre, contra fichas REALES (solo lectura): ficha inexistente → se conserva; Náufrago y Zero Risk con lo que se sabe
  const env = await sql(`select
    public.zzcc3_cwp_es_del_cliente('00000000-0000-0000-0000-000000000000', 'https://www.cnn.com/x') sin_ficha,
    public.zzcc3_cwp_es_del_cliente('0a2ffbd4-957c-4315-a37f-b9e4fbbbb312', 'https://www.naufrago.ec') nau_suyo,
    public.zzcc3_cwp_es_del_cliente('0a2ffbd4-957c-4315-a37f-b9e4fbbbb312', 'https://www.cnn.com/x') nau_ajeno,
    public.zzcc3_cwp_es_del_cliente('df7e47cc-bec4-4fa2-bc24-ff97ba5213a5', 'https://www.instagram.com/zeroriskgye') zr_suyo,
    public.zzcc3_cwp_es_del_cliente('df7e47cc-bec4-4fa2-bc24-ff97ba5213a5', 'https://www.pixnoy.com/profile/zeroriskgye/') zr_espejo`)
  const esperado = { sin_ficha: true, nau_suyo: true, nau_ajeno: false, zr_suyo: true, zr_espejo: false }
  for (const [k, v] of Object.entries(esperado)) if (env[0][k] !== v) { fallos++; console.log(`✗ envoltorio ${k}: ${env[0][k]} y se esperaba ${v}`) }
  console.log(`${casos.length - (fallos > 0 ? fallos : 0)}/${casos.length} casos + 5 del envoltorio · diferencias: ${fallos}`)
} finally {
  await sql(`drop function if exists public.zzcc3_cwp_es_del_cliente(uuid, text), public.zzcc3_cwp_es_propia(text, jsonb, text), public.zzcc3_cwp_cuentas_de(text, jsonb), public.zzcc3_cwp_usuario_de(text), public.zzcc3_cwp_host_de(text), public.zzcc3_cwp_red_de(text)`).catch((e) => console.log('limpieza:', String(e.message).slice(0, 200)))
}
process.exit(fallos ? 1 : 0)
