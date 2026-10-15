/**
 * Seco de la auditoría diaria sobre datos REALES (solo lectura, US$ 0): audita TODAS las fichas vivas de un cliente de los últimos N días, no solo la muestra,
 * para medir la tasa de falsos errores ANTES de que la auditoría pueda apagar el portero.
 *   npx tsx scripts/ops/auditoria-seco.ts <client_id> [dias=7]
 */
import fs from 'node:fs'
import { verificarFicha, juzgarAuditoria, type FichaAuditable } from '../../src/lib/portero-alimenta/auditoria'

const env = fs.readFileSync('C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local', 'utf8')
const g = (k: string) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const U = g('NEXT_PUBLIC_SUPABASE_URL')!, K = g('SUPABASE_SERVICE_ROLE_KEY')!
const H = { apikey: K, Authorization: 'Bearer ' + K }
const get = async (p: string) => (await fetch(U + '/rest/v1/' + p, { headers: H })).json() as Promise<Array<Record<string, unknown>>>
async function main() {
  const cliente = process.argv[2]
  const dias = Number(process.argv[3] ?? 7)
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString()
  const fichas = await get(`cerebro_fichas?select=id,client_id,contenido,fecha_fuente,observado_en,fuente_url,provenance_tag,descartada,retirada_en,clase,creado_en&client_id=eq.${cliente}&creado_en=gte.${desde}&limit=1000`)
  const vivas = (Array.isArray(fichas) ? fichas : []).filter((f) => !f.descartada && !f.retirada_en)
  const ids = [...new Set(vivas.map((f) => ((f.provenance_tag as { respaldo_en?: { id?: string } } | null)?.respaldo_en?.id) ?? '').filter(Boolean))]
  const crudos = new Map<string, Record<string, unknown>>()
  for (let i = 0; i < ids.length; i += 30) {
    const r = await get(`apify_raw?select=id,client_id,respuesta&id=in.(${ids.slice(i, i + 30).join(',')})`)
    for (const x of Array.isArray(r) ? r : []) crudos.set(String(x.id), x)
  }
  const res = vivas.map((f) => {
    const rid = (f.provenance_tag as { respaldo_en?: { id?: string } } | null)?.respaldo_en?.id
    return { clase: f.clase, v: verificarFicha(f as unknown as FichaAuditable, rid ? (crudos.get(rid) as never) ?? null : null) }
  })
  const j = juzgarAuditoria('seco', res.map((x) => x.v))
  console.log(JSON.stringify({ fichas_vivas: vivas.length, verificables: j.verificables, errores: j.errores, sin_verificar: j.sin_verificar, tasa: j.tasa_de_error }, null, 1))
  for (const x of res.filter((y) => y.v.veredicto === 'error').slice(0, 12)) console.log('ERROR', x.clase, x.v.errores.join(' | '))
  const por: Record<string, { ok: number; error: number; sin: number }> = {}
  for (const x of res) { const k = String(x.clase); por[k] ??= { ok: 0, error: 0, sin: 0 }; if (x.v.veredicto === 'ok') por[k].ok++; else if (x.v.veredicto === 'error') por[k].error++; else por[k].sin++ }
  console.log('POR_CLASE', JSON.stringify(por))
}
main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 300)); process.exit(1) })
