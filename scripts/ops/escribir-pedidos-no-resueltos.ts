/**
 * Reescribe `raw/tasks/PEDIDOS-NO-RESUELTOS-CEREBRO.md` con los pedidos al portero que quedaron sin resolver (para que Lenovo les busque fuente o brazo nuevo).
 * Solo LEE `cerebro_pedidos`; US$ 0. No avisa a nadie.
 *   npx tsx scripts/ops/escribir-pedidos-no-resueltos.ts [--salida=<archivo>]
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const t = fs.readFileSync('C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local', 'utf8')
const g = (k: string) => (t.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const SALIDA = process.argv.find((a) => a.startsWith('--salida='))?.slice(9) ?? 'C:/Users/emili/OneDrive/Documents/zr-vault/raw/tasks/PEDIDOS-NO-RESUELTOS-CEREBRO.md'
type Hueco = { hueco?: Record<string, unknown>; estado?: string; detalle?: string; intentado?: string[] }

async function main() {
  const db = createClient(g('NEXT_PUBLIC_SUPABASE_URL')!, g('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const q = await db.from('cerebro_pedidos').select('id, client_id, sede_clave, pedido_por_oficina, pedido_por_agente, para, estado, resultado, costo_usd, creado_en').in('estado', ['no_resuelto', 'parcial', 'fallo']).order('creado_en', { ascending: false }).limit(200)
  if (q.error) throw new Error(`cerebro_pedidos: ${q.error.message}`)
  const filas = (q.data ?? []) as Array<Record<string, unknown>>
  const lineas: string[] = [
    '---', 'type: lista de pedidos no resueltos del cerebro (la reescribe CC-CEREBRO en cada corrida)', `actualizado: ${new Date().toISOString()}`, '---',
    '# Pedidos al portero que no se pudieron resolver', '',
    'Cada uno es un pedido libre de una oficina o un director al que el portero respondió «esta información me falta». Sirve para que Lenovo le busque una fuente o un brazo nuevo. No se avisa a Emilio por esto.', '',
  ]
  let n = 0
  for (const f of filas) {
    const r = (f.resultado && typeof f.resultado === 'object' ? f.resultado : {}) as { huecos?: Hueco[] }
    const sin = (r.huecos ?? []).filter((h) => h.estado === 'no_resuelto' || h.estado === 'tope')
    if (!sin.length && f.estado !== 'fallo') continue
    n++
    lineas.push(`## ${String(f.creado_en).slice(0, 16)}Z · ${String(f.pedido_por_oficina)} (${String(f.pedido_por_agente)}) · cliente ${String(f.client_id).slice(0, 8)}${f.sede_clave ? ` · sede ${String(f.sede_clave)}` : ''}`)
    lineas.push(`- **Pedido:** ${String(f.para)}`, `- **Estado:** ${String(f.estado)} · costo US$ ${Number(f.costo_usd || 0).toFixed(3)} · \`${String(f.id)}\``)
    for (const h of sin) {
      const x = h.hueco ?? {}
      lineas.push(`- **Hueco:** ${[x.fuente, x.tipo, x.objetivo, x.motivo].filter(Boolean).join(' · ') || '(libre)'} — ${h.estado}: ${h.detalle ?? ''}`)
      for (const i of h.intentado ?? []) lineas.push(`  - intentado: ${i}`)
    }
    lineas.push('')
  }
  if (!n) lineas.push('_No hay pedidos sin resolver._', '')
  fs.writeFileSync(SALIDA, lineas.join('\n'))
  console.log(JSON.stringify({ salida: SALIDA, pedidos_sin_resolver: n }))
}
main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 300)); process.exit(1) })
