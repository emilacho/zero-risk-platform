// RELLENO REVERSIBLE de `client_web_pages` con la regla única (31-oct · CC#3 · encargo «limpieza de páginas ajenas»). TODOS los clientes.
// Una fila «propio» que la regla NO reconoce como del cliente pasa a «referencia» y guarda `metadata.rotulo_original = 'propio'` + `rotulado_por`. Las filas «sin_base» (cliente sin sitio utilizable ni cuentas) NO se tocan.
// POR OMISIÓN ES EN SECO: cuenta y lista, no cambia nada. Para aplicar hace falta --aplicar (escribe antes un respaldo con hash; la escritura va por la API pública con la llave de servicio, nunca por la de administración).
//   con doppler:  node scripts/ops/relleno-paginas-propias.mjs                      → conteo en seco por cliente
//                 node scripts/ops/relleno-paginas-propias.mjs --aplicar <carpeta>   → respaldo en <carpeta> y cambio
//                 node scripts/ops/relleno-paginas-propias.mjs restaurar <carpeta/respaldo.json> [--ejecutar]  → REVERSA (en seco si no lleva --ejecutar; solo vuelve las filas que siguen tal como las dejó el relleno)
// Exige la migración 202610311300 aplicada (usa client_web_pages_es_propia). Nunca imprime llaves.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { sql } from './lib-sql-ops.mjs'

const SELLO = 'relleno-regla-unica-31-oct'
const args = process.argv.slice(2)
const SB = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex')
const patch = async (id, filtro, cuerpo) => {
  const r = await fetch(`${SB}/rest/v1/client_web_pages?id=eq.${id}&${filtro}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(cuerpo) })
  if (!r.ok) throw new Error(`PATCH ${id}: ${r.status} ${(await r.text()).slice(0, 200)}`)
  return (await r.json()).length
}

if (args[0] === 'restaurar') {
  const ruta = args[1]
  const EJECUTAR = args.includes('--ejecutar')
  const resp = JSON.parse(fs.readFileSync(ruta, 'utf8'))
  if (sha(JSON.stringify(resp.filas)) !== resp.sha256) throw new Error('el respaldo no coincide con su hash')
  let vuelven = 0, cambiadas = 0
  for (const f of resp.filas) {
    const [ahora] = await sql(`select owner_role, metadata->>'rotulado_por' p from public.client_web_pages where id='${f.id}'`)
    if (ahora && ahora.owner_role === 'referencia' && ahora.p === SELLO) {
      vuelven++
      if (EJECUTAR) cambiadas += await patch(f.id, `metadata->>rotulado_por=eq.${SELLO}`, { owner_role: f.owner_role, metadata: f.metadata })
    }
  }
  console.log(`${EJECUTAR ? 'RESTAURAR' : 'EN SECO'} · ${resp.filas.length} filas en el respaldo · ${vuelven} siguen como las dejó el relleno${EJECUTAR ? ` · ${cambiadas} restauradas` : ''}`)
  process.exit(0)
}

const APLICAR = args.includes('--aplicar')
const carpeta = args.find((a) => !a.startsWith('--'))
const existe = await sql(`select 1 ok from pg_proc where proname = 'client_web_pages_es_propia'`)
if (!existe.length) throw new Error('falta la migración 202610311300 (client_web_pages_es_propia): aplícala primero')
const filas = await sql(`
  select w.id, w.client_id::text, c.name, w.url, w.owner_role, w.metadata
  from public.client_web_pages w join public.clients c on c.id = w.client_id
  where w.owner_role = 'propio'
    and public.client_web_pages_es_propia(c.website_url, public.client_web_pages_cuentas_de(c.website_url, c.config), w.url) = 'no'
  order by c.name, w.url`)
const porCliente = {}
for (const f of filas) porCliente[f.name] = (porCliente[f.name] || 0) + 1
const [tot] = await sql(`select count(*) filter (where owner_role='propio')::int propio from public.client_web_pages`)
console.log(`${APLICAR ? 'APLICAR' : 'EN SECO (no se cambia nada)'} · «propio» hoy: ${tot.propio} · pasarían a «referencia»: ${filas.length}`)
for (const [n, c] of Object.entries(porCliente)) console.log(`   ${n}: ${c}`)
if (!APLICAR) process.exit(0)

if (!carpeta) throw new Error('uso: --aplicar <carpeta_de_respaldo>')
fs.mkdirSync(carpeta, { recursive: true })
const respaldo = filas.map((f) => ({ id: f.id, client_id: f.client_id, url: f.url, owner_role: f.owner_role, metadata: f.metadata }))
const archivo = path.join(carpeta, 'respaldo.json')
fs.writeFileSync(archivo, JSON.stringify({ hecho_en: new Date().toISOString(), sello: SELLO, sha256: sha(JSON.stringify(respaldo)), filas: respaldo }, null, 1))
let hechas = 0
for (const f of respaldo) hechas += await patch(f.id, 'owner_role=eq.propio', { owner_role: 'referencia', metadata: { ...(f.metadata || {}), rotulo_original: 'propio', rotulado_por: SELLO } })
const [despues] = await sql(`select count(*) filter (where owner_role='propio')::int propio, count(*) filter (where metadata->>'rotulado_por'='${SELLO}')::int marcadas from public.client_web_pages`)
console.log(`HECHO · ${hechas} filas cambiadas · «propio» ahora: ${despues.propio} · marcadas por el relleno: ${despues.marcadas} · respaldo: ${archivo}`)
