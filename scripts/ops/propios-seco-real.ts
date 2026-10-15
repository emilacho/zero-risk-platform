/**
 * Seco de datos propios de Náufrago contra Loyverse REAL (solo LECTURA de recibos; no escribe nada; US$ 0).
 * El token se lee de Vercel por tubería (proyecto zero-risk-platform, copia ya creada) NO: es sensible y no se puede leer de vuelta;
 * por eso se lee de la misma fuente de la excepción firmada (client-sites-template, solo lectura) y vive solo en memoria. Nunca se imprime.
 *   npx tsx scripts/ops/propios-seco-real.ts
 */
import fs from 'node:fs'
import { brazoDePropios } from '../../src/lib/portero-alimenta/brazos/propios'

const env = fs.readFileSync('C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local', 'utf8')
const g = (k: string) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const H = { Authorization: 'Bearer ' + g('VERCEL_TOKEN') }
const api = async (p: string) => (await fetch('https://api.vercel.com' + p, { headers: H })).json() as Promise<any> // eslint-disable-line @typescript-eslint/no-explicit-any
async function main() {
  const ps = (await api('/v9/projects?limit=100')).projects
  const O = ps.find((p: { name: string }) => p.name === 'client-sites-template')
  const q = '?teamId=' + O.accountId
  const lo = (await api(`/v9/projects/${O.id}/env${q}`)).envs
  const e = lo.find((x: { key: string }) => x.key === 'LOYVERSE_TOKEN')
  const token: string = (await api(`/v1/projects/${O.id}/env/${e.id}${q}`)).value
  const r = await brazoDePropios({
    client_id: '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312', slug: 'naufrago', config: null, ahora: new Date(),
    env: { CLIENTE_NAUFRAGO_LOYVERSE_TOKEN: token },
    fetch: async (url, init) => { const x = await fetch(url, { headers: init?.headers }); return { ok: x.ok, status: x.status, json: () => x.json() as Promise<unknown> } },
  })
  const s = JSON.stringify(r, null, 1).split(token).join('***')
  console.log(s.slice(0, 4000))
}
main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 300)); process.exit(1) })
