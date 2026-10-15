/**
 * Carga de las ventas de Náufrago desde Loyverse al cerebro · UNA vez, a mano, por la MISMA función del portero (`correrBrazos` con solo el brazo `propios`).
 * Solo LECTURA de Loyverse; escribe fichas `metrica:loyverse:*` (idempotente: repetirlo no duplica). US$ 0, sin modelo.
 * La llave se lee de la misma fuente de la excepción firmada (client-sites-template, solo lectura), vive en memoria y NUNCA se imprime.
 *   npx tsx scripts/ops/cargar-ventas-loyverse.ts            → en seco (calcula el plan, no escribe)
 *   npx tsx scripts/ops/cargar-ventas-loyverse.ts --escribir → escribe
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { BRAZOS_APAGADOS, correrBrazos } from '../../src/lib/portero-alimenta/brazos'

const envTxt = fs.readFileSync('C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local', 'utf8')
const g = (k: string) => (envTxt.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const H = { Authorization: 'Bearer ' + g('VERCEL_TOKEN') }
const api = async (p: string) => (await fetch('https://api.vercel.com' + p, { headers: H })).json() as Promise<any> // eslint-disable-line @typescript-eslint/no-explicit-any
const CLIENTE = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
async function main() {
  const escribir = process.argv.includes('--escribir')
  const ps = (await api('/v9/projects?limit=100')).projects
  const O = ps.find((p: { name: string }) => p.name === 'client-sites-template')
  const q = '?teamId=' + O.accountId
  const lo = (await api(`/v9/projects/${O.id}/env${q}`)).envs
  const e = lo.find((x: { key: string }) => x.key === 'LOYVERSE_TOKEN')
  const token: string = (await api(`/v1/projects/${O.id}/env/${e.id}${q}`)).value
  const db = createClient(g('NEXT_PUBLIC_SUPABASE_URL')!, g('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const c = await db.from('clients').select('id, name, slug, country, industry, config').eq('id', CLIENTE).limit(1)
  const cliente = (c.data ?? [])[0] as Record<string, unknown> | undefined
  if (!cliente) throw new Error('no encuentro la ficha del cliente')
  let llamadas = 0
  const r = await correrBrazos({
    db: db as never, brazos: { ...BRAZOS_APAGADOS, propios: true }, cliente, client_id: CLIENTE, filas: [], ahora: new Date(), dry_run: !escribir,
    env: { CLIENTE_NAUFRAGO_LOYVERSE_TOKEN: token }, workflow_id: 'carga-manual-ventas-loyverse-2026-10-15',
    fetch: async (url, init) => { llamadas++; const x = await fetch(url, { headers: init?.headers }); return { ok: x.ok, status: x.status, json: () => x.json() as Promise<unknown> } },
  })
  const salida = { modo: escribir ? 'ESCRIBE' : 'seco', llamadas_a_loyverse: llamadas, por_brazo: r.por_brazo, archivo: r.archivo ? { escritas: r.archivo.escritas, iguales: r.archivo.iguales, retiradas: r.archivo.retiradas, errores: r.archivo.errores, plan: r.archivo.plan.map((p) => `${p.accion} ${p.ref}`) } : null, errores: r.errores }
  console.log(JSON.stringify(salida, null, 1).split(token).join('***'))
}
main().catch((err) => { console.error(String(err?.message ?? err).slice(0, 300)); process.exit(1) })
