#!/usr/bin/env node
/**
 * FOTO DE SOLO LECTURA para el doble chequeo: filas de Náufrago y de configuración, una sola vez, a un archivo local fuera del repositorio.
 * Solo hace GET. No lee cerebro ni portero (`client_brain_chunks`, `cerebro_*`). Sin Doppler no corre.
 *   doppler run -p zero-risk -c prd -- node foto.mjs <cliente_id> <salida.json>
 */
import fs from 'node:fs'
const [cliente, salida] = process.argv.slice(2)
const B = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
const K = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!cliente || !salida || !B || !K) { console.error('uso: foto.mjs <cliente_id> <salida.json> (con SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY)'); process.exit(1) }
const POR_CLIENTE = {
  client_brand_books: 'order=version.desc&limit=3',
  client_icp_documents: 'limit=5',
  client_competitive_landscape: 'limit=40',
  client_sedes: 'limit=20',
  client_sede_datos: 'limit=200',
  client_historical_outputs: "output_type=like.*plan*&order=created_at.desc&limit=6",
}
const COMPLETAS = {
  finanzas_config: '',
  cadena_config: '',
  jefatura_grading_policies: '',
  jefatura_config: '',
  agents: 'select=id,name,model,status,is_active',
  plan_catalogo_fuentes: 'vigente=eq.true',
  plan_catalogo_tipos: 'vigente=eq.true',
  plan_catalogo_reglas: 'vigente=eq.true',
  plan_catalogo_lexico: 'vigente=eq.true',
  plan_catalogo_topes: 'vigente=eq.true',
  settings: 'key=like.planeacion*',
}
const foto = {}
const leer = async (t, q) => {
  const r = await fetch(`${B}/rest/v1/${t}?${q}`, { headers: { apikey: K, Authorization: `Bearer ${K}` } })
  if (!r.ok) { console.log(`${t}: ${r.status} ${(await r.text()).slice(0, 120)}`); return [] }
  return r.json()
}
foto.clients = await leer('clients', `id=eq.${cliente}`)
for (const [t, q] of Object.entries(POR_CLIENTE)) foto[t] = await leer(t, `client_id=eq.${cliente}&${q}`)
for (const [t, q] of Object.entries(COMPLETAS)) foto[t] = await leer(t, q)
fs.writeFileSync(salida, JSON.stringify(foto))
console.log(Object.fromEntries(Object.entries(foto).map(([k, v]) => [k, v.length])), `${Math.round(fs.statSync(salida).size / 1024)} KB`)
