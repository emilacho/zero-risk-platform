/**
 * Ventas de Náufrago en Loyverse REAL · SOLO LECTURA (recibos y tiendas), no escribe nada, US$ 0. Imprime el resumen de los últimos 12 meses (cifras agregadas, sin datos de clientes).
 * La llave se lee de la misma fuente de la excepción firmada (client-sites-template, solo lectura), vive en memoria y NUNCA se imprime.
 *   npx tsx scripts/ops/ventas-loyverse-real.ts
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
  let llamadas = 0
  const r = await brazoDePropios({
    client_id: '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312', slug: 'naufrago', config: null, ahora: new Date(),
    env: { CLIENTE_NAUFRAGO_LOYVERSE_TOKEN: token },
    fetch: async (url, init) => { llamadas++; const x = await fetch(url, { headers: init?.headers }); return { ok: x.ok, status: x.status, json: () => x.json() as Promise<unknown> } },
  })
  const filas = r.fichas.filter((f) => f.atributo.startsWith('metrica:loyverse:ingreso:'))
    .map((f) => { const d = f.datos as Record<string, unknown>; return { atributo: f.atributo.replace('metrica:loyverse:ingreso:', ''), tienda: d.tienda, en_curso: d.en_curso, tickets: d.tickets, ingreso: d.ingreso, ticket_promedio: d.ticket_promedio, reembolsos: d.reembolsos } })
    .sort((a, b) => (a.atributo < b.atributo ? -1 : 1))
  const salida = { estado: r.estado, llamadas, fichas: r.fichas.length, declarado: r.declarado, meses: filas, ultimo_mes: r.fichas.filter((f) => f.atributo.startsWith('metrica:loyverse:items:')).slice(-1).map((f) => f.contenido.slice(0, 600)), horas: r.fichas.filter((f) => f.atributo.startsWith('metrica:loyverse:dias_y_horas:')).slice(-1).map((f) => f.contenido.slice(0, 400)) }
  console.log(JSON.stringify(salida, null, 1).split(token).join('***'))
}
main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 300)); process.exit(1) })
