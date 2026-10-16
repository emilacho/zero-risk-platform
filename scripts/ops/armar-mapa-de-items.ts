/**
 * Mapa de ítems por sinónimo · caja (Loyverse, catálogo de ítems) ↔ carta web (JSON-LD de `client_web_pages` propias) · UNA vez por cliente.
 * Solo LECTURA de Loyverse (GET /items) y de nuestras tablas; con --escribir guarda en `clients.config.apify.loyverse_mapa_de_items` (+ `_meta`, con origen y lo dudoso) con respaldo previo.
 * La llave se lee de la misma fuente de la excepción firmada (client-sites-template, solo lectura), vive en memoria y NUNCA se imprime.
 * Agnóstico: el cliente, la carta (el sitio de su ficha) y la variable de la llave se piden por argumento; nada de un cliente va en el código.
 * El mapa se decide SOLO por nombre (el precio no es criterio: cada sede o canal puede cobrar distinto).
 *   npx tsx scripts/ops/armar-mapa-de-items.ts --cliente=<uuid>            → en seco (imprime la equivalencia, no escribe)
 *   npx tsx scripts/ops/armar-mapa-de-items.ts --cliente=<uuid> --escribir → escribe (respaldo en ./respaldo-config-<id>.json)
 *   --proyecto-vercel=<nombre> --variable=<NOMBRE>   de dónde se lee la llave de solo lectura del punto de venta (por omisión: client-sites-template · LOYVERSE_TOKEN)
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { armarMapaDeItems, itemsDeLaCarta, metaDelMapa, type ItemConPrecio } from '../../src/lib/portero-alimenta/brazos/mapa-de-items'
import { sedesDeLaFuente } from '../../src/lib/portero-alimenta/sedes-fuentes'

const hostDe = (u: string): string => { try { return new URL(u.includes('://') ? u : `https://${u}`).host.replace(/^www\./, '').toLowerCase() } catch { return '' } }

const envTxt = fs.readFileSync('C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local', 'utf8')
const g = (k: string) => (envTxt.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const H = { Authorization: 'Bearer ' + g('VERCEL_TOKEN') }
const api = async (p: string) => (await fetch('https://api.vercel.com' + p, { headers: H })).json() as Promise<any> // eslint-disable-line @typescript-eslint/no-explicit-any
const arg = (n: string): string | undefined => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
const CLIENTE = arg('cliente') ?? ''
const PROYECTO = arg('proyecto-vercel') ?? 'client-sites-template'
const VARIABLE = arg('variable') ?? 'LOYVERSE_TOKEN'

async function main() {
  if (!/^[0-9a-f-]{36}$/.test(CLIENTE)) throw new Error('falta --cliente=<uuid>')
  const escribir = process.argv.includes('--escribir')
  const ps = (await api('/v9/projects?limit=100')).projects
  const O = ps.find((p: { name: string }) => p.name === PROYECTO)
  const q = '?teamId=' + O.accountId
  const lo = (await api(`/v9/projects/${O.id}/env${q}`)).envs
  const e = lo.find((x: { key: string }) => x.key === VARIABLE)
  const token: string = (await api(`/v1/projects/${O.id}/env/${e.id}${q}`)).value
  // la caja: catálogo de ítems con su precio
  const pos: ItemConPrecio[] = []
  let cursor = ''
  for (let i = 0; i < 10; i++) {
    const r = await fetch('https://api.loyverse.com/v1.0/items?limit=250' + (cursor ? '&cursor=' + cursor : ''), { headers: { Authorization: 'Bearer ' + token } })
    if (!r.ok) throw new Error(`Loyverse respondió ${r.status} al leer el catálogo`)
    const j = (await r.json()) as { items?: Array<{ item_name?: string; variants?: Array<{ default_price?: number | null; stores?: Array<{ price?: number | null }> }> }>; cursor?: string }
    for (const it of j.items ?? []) {
      const v = it.variants ?? []
      const precio = v.length === 1 ? (v[0].stores?.[0]?.price ?? v[0].default_price ?? null) : null
      if (it.item_name) pos.push({ nombre: it.item_name, precio: typeof precio === 'number' ? precio : null })
    }
    if (!j.cursor) break
    cursor = j.cursor
  }
  const db = createClient(g('NEXT_PUBLIC_SUPABASE_URL')!, g('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const c = await db.from('clients').select('id, name, website_url, config').eq('id', CLIENTE).limit(1)
  const cliente = (c.data ?? [])[0] as { id: string; name: string; website_url: string | null; config: Record<string, any> } | undefined // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!cliente) throw new Error('no encuentro la ficha del cliente')
  const host = hostDe(cliente.website_url ?? '')
  if (!host) throw new Error('la ficha del cliente no tiene sitio web: no hay carta que leer')
  const w = await db.from('client_web_pages').select('url, content_text').eq('client_id', CLIENTE).eq('owner_role', 'propio').limit(50)
  const carta = new Map<string, ItemConPrecio>()
  for (const p of (w.data ?? []) as Array<{ url: string; content_text: string | null }>) {
    // solo el sitio del cliente (el de su ficha): sus páginas rastreadas de otros dominios (noticias, guías) no son su carta
    if (hostDe(p.url) !== host) continue
    for (const it of itemsDeLaCarta(p.content_text ?? '')) if (!carta.has(it.nombre.toLowerCase())) carta.set(it.nombre.toLowerCase(), it)
  }
  const ahora = new Date()
  const claves = ((await db.from('client_sedes').select('clave').eq('client_id', CLIENTE)).data ?? []).map((s: { clave: string }) => s.clave)
  const deLaCarta = sedesDeLaFuente(cliente.config, 'sitio_web', null, claves).sedes
  const m = armarMapaDeItems({ pos, web: [...carta.values()], negocio: cliente.name })
  const meta = metaDelMapa(m, ahora, { cartaDeSedes: deLaCarta })
  const salida = { modo: escribir ? 'ESCRIBE' : 'seco', items_de_la_caja: pos.length, items_de_la_carta: carta.size, resumen: m.resumen, equivalencias: m.equivalencias.map((x) => `${x.certeza} · ${x.pos}${x.web ? ' → ' + x.web : ''}${x.candidatos ? ' ? ' + x.candidatos.join(' | ') : ''}`) }
  console.log(JSON.stringify(salida, null, 1).split(token).join('***'))
  if (!escribir) return
  if (!carta.size) throw new Error('la carta web no trae ítems: no escribo un mapa vacío')
  fs.writeFileSync(`respaldo-config-${CLIENTE.slice(0, 8)}.json`, JSON.stringify(cliente.config, null, 1))
  const nuevo = { ...cliente.config, apify: { ...(cliente.config?.apify ?? {}), loyverse_mapa_de_items: m.mapa, loyverse_mapa_de_items_meta: meta } }
  const u = await db.from('clients').update({ config: nuevo }).eq('id', CLIENTE).select('id')
  if (u.error) throw new Error(`no pude guardar el mapa: ${u.error.message}`)
  console.log('guardado: loyverse_mapa_de_items (' + Object.keys(m.mapa).length + ' ítems) + _meta')
}
main().catch((err) => { console.error(String(err?.message ?? err).slice(0, 300)); process.exit(1) })
