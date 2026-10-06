#!/usr/bin/env node
/**
 * VERIFICACIÓN DE LA BASE · paso 2 del cerebro · SOLO LECTURA (solo consultas de lectura por la API de administración de Supabase).
 *
 * Lee y exige, después de aplicar la migración (o antes, con --antes, para anotar la línea base de las fotos):
 *   · las dos tablas nuevas existen, están VACÍAS, con seguridad por fila activa, SIN permisos para anon ni authenticated y con su política de service_role;
 *   · las 4 columnas nuevas de `client_social_images` existen, son anulables, SIN valor por defecto y TODAS vacías;
 *   · las 16 fotos siguen intactas: misma cuenta y misma huella de sus 21 columnas VIEJAS (lista fija, no «todas las columnas»).
 *
 * Uso:  node scripts/audit/cerebro-paso-2-verifica-base.mjs --antes  [--env-file ruta] [--guardar linea-base.json]
 *       node scripts/audit/cerebro-paso-2-verifica-base.mjs --baseline linea-base.json [--env-file ruta]     → exit 0 si todo bien, 1 si hay fallas.
 * Usa SUPABASE_ACCESS_TOKEN (y SUPABASE_PROJECT_REF, por defecto el del proyecto). Doc: docs/MAPA-2026-10-06-tablas-del-cerebro.md
 */
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

export const TABLAS = ['cerebro_ingresos', 'cerebro_fichas']
export const COLUMNAS_NUEVAS = ['que_muestra', 'producto_visto', 'etiquetada_en', 'etiqueta_modelo']
/** las 21 columnas que tenía `client_social_images` ANTES del paso 2 (lista FIJA: la huella no cambia aunque se agreguen columnas) */
export const COLUMNAS_VIEJAS = ['id', 'client_id', 'owner_role', 'handle', 'post_id', 'tipo', 'url', 'estado', 'causa', 'created_at', 'caption', 'posted_at', 'post_url', 'posicion', 'medio', 'hash_archivo', 'duplicado_de', 'producto', 'producto_fuente', 'producto_evidencia', 'contexto_completado_en']

/** @param {{tablas:Record<string,any>, columnas:any[], columnas_con_dato:number, fotos:{n:number,huella:string}, base:{fotos_n:number,huella:string}}} e */
export function evaluar(e) {
  const fallas = []
  for (const t of TABLAS) {
    const x = e.tablas?.[t]
    if (!x?.existe) { fallas.push(`${t}: no existe`); continue }
    if (x.filas !== 0) fallas.push(`${t}: tiene ${x.filas} filas (debe estar vacía)`)
    if (x.rls !== true) fallas.push(`${t}: sin seguridad por fila`)
    if ((x.permisos_anon_authenticated ?? []).length) fallas.push(`${t}: anon/authenticated con permisos (${x.permisos_anon_authenticated.join(',')})`)
    if (!(x.politicas ?? []).includes(`${t}_service`)) fallas.push(`${t}: falta su política de service_role`)
  }
  const nombres = (e.columnas ?? []).map((c) => c.column_name).sort()
  if (JSON.stringify(nombres) !== JSON.stringify([...COLUMNAS_NUEVAS].sort())) fallas.push(`client_social_images: columnas nuevas esperadas ${COLUMNAS_NUEVAS.join(',')} y hay ${nombres.join(',') || 'ninguna'}`)
  for (const c of e.columnas ?? []) {
    if (c.is_nullable !== 'YES') fallas.push(`client_social_images.${c.column_name}: NO es anulable`)
    if (c.column_default !== null && c.column_default !== undefined) fallas.push(`client_social_images.${c.column_name}: tiene valor por defecto (${c.column_default})`)
  }
  if (e.columnas_con_dato !== 0) fallas.push(`client_social_images: ${e.columnas_con_dato} filas con dato en las columnas nuevas (deben estar vacías)`)
  if (e.fotos?.n !== e.base?.fotos_n) fallas.push(`fotos: hay ${e.fotos?.n} y la línea base dice ${e.base?.fotos_n}`)
  if (e.fotos?.huella !== e.base?.huella) fallas.push(`fotos: la huella de las columnas viejas cambió (${e.fotos?.huella} ≠ ${e.base?.huella})`)
  return { ok: fallas.length === 0, fallas }
}

const HUELLA_SQL = `select count(*)::int n, md5(string_agg(${COLUMNAS_VIEJAS.map((c) => `coalesce(t."${c}"::text,'∅')`).join(` || '|' || `)}, E'\\n' order by t.id)) huella from public.client_social_images t`

export async function leerEstado(consulta) {
  const q = async (s) => consulta(s)
  const tablas = {}
  for (const t of TABLAS) {
    const existe = (await q(`select to_regclass('public.${t}') is not null as e`))[0].e
    if (!existe) { tablas[t] = { existe: false }; continue }
    tablas[t] = {
      existe: true,
      filas: (await q(`select count(*)::int n from public.${t}`))[0].n,
      rls: (await q(`select relrowsecurity r from pg_class where oid = 'public.${t}'::regclass`))[0].r,
      permisos_anon_authenticated: (await q(`select grantee || ':' || privilege_type p from information_schema.role_table_grants where table_schema='public' and table_name='${t}' and grantee in ('anon','authenticated','PUBLIC') order by 1`)).map((r) => r.p),
      politicas: (await q(`select polname from pg_policy where polrelid = 'public.${t}'::regclass order by 1`)).map((r) => r.polname),
    }
  }
  const lista = COLUMNAS_NUEVAS.map((c) => `'${c}'`).join(',')
  const columnas = await q(`select column_name, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='client_social_images' and column_name in (${lista}) order by 1`)
  let columnas_con_dato = 0
  if (columnas.length === COLUMNAS_NUEVAS.length) columnas_con_dato = (await q(`select count(*)::int n from public.client_social_images where ${COLUMNAS_NUEVAS.map((c) => `${c} is not null`).join(' or ')}`))[0].n
  const f = (await q(HUELLA_SQL))[0]
  return { tablas, columnas, columnas_con_dato, fotos: { n: f.n, huella: f.huella } }
}

function leerEntorno(ruta) {
  const env = { ...process.env }
  if (ruta && fs.existsSync(ruta)) for (const l of fs.readFileSync(ruta, 'utf8').split(/\r?\n/)) { const m = /^([A-Z0-9_]+)=(.*)$/.exec(l); if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
  return env
}
const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : undefined }

async function main() {
  const env = leerEntorno(arg('--env-file'))
  if (!env.SUPABASE_ACCESS_TOKEN) { console.error('FALTA SUPABASE_ACCESS_TOKEN'); process.exit(2) }
  const ref = env.SUPABASE_PROJECT_REF ?? 'ordaeyxvvvdqsznsecjx'
  const consulta = async (query) => {
    const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST', headers: { Authorization: 'Bearer ' + env.SUPABASE_ACCESS_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) })
    const j = await r.json()
    if (!Array.isArray(j)) throw new Error('la base respondió: ' + JSON.stringify(j).slice(0, 200))
    return j
  }
  const estado = await leerEstado(consulta)
  if (process.argv.includes('--antes')) {
    const linea = { fotos_n: estado.fotos.n, huella: estado.fotos.huella, leida_en: new Date().toISOString() }
    console.log(JSON.stringify({ linea_base: linea, estado_antes: estado }, null, 1))
    if (arg('--guardar')) fs.writeFileSync(arg('--guardar'), JSON.stringify(linea, null, 1))
    process.exit(0)
  }
  const baseline = JSON.parse(fs.readFileSync(arg('--baseline') ?? '', 'utf8'))
  const r = evaluar({ ...estado, base: { fotos_n: baseline.fotos_n, huella: baseline.huella } })
  console.log(JSON.stringify({ ...r, estado, baseline, leido_en: new Date().toISOString() }, null, 1))
  process.exit(r.ok ? 0 : 1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch((e) => { console.error(String(e)); process.exit(2) })
