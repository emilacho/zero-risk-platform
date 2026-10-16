/**
 * Pedido libre al portero EN SECO sobre un cliente real (US$ 0: ningún modelo, ninguna búsqueda, nada se escribe): muestra qué respondería «ya está» y qué decidiría el modelo.
 *   npx tsx scripts/ops/pedido-en-seco.ts
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { rutaPedido } from '../../src/lib/portero-alimenta/pedidos'

const t = fs.readFileSync('C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local', 'utf8')
const g = (k: string) => (t.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
async function main() {
  const db = createClient(g('NEXT_PUBLIC_SUPABASE_URL')!, g('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const r = await rutaPedido({
    db: db as never, activo: true, interruptores: { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: false, resumen_vivo: false, resumen_pulido: false },
  }, {
    client_id: '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312', dry_run: true, sede_clave: 'guayaquil',
    pedido_por: { oficina: 'oficina-financiera', agente: 'chief-financial-officer' },
    para: 'armar el plan de 90 días con ventas reales del punto de venta',
    huecos: [{ tipo: 'metrica:loyverse:ingreso', objetivo: 'ventas por mes de los últimos 12 meses' }, { tipo: 'resumen', objetivo: 'resumen vivo del cliente' }, { objetivo: 'qué eventos locales hay en noviembre cerca de Olón' }],
  })
  console.log(JSON.stringify({ status: r.status, ...r.body, huecos: ((r.body.huecos ?? []) as Array<Record<string, unknown>>).map((h) => ({ estado: h.estado, detalle: h.detalle, fichas: Array.isArray(h.fichas) ? (h.fichas as string[]).length : 0 })) }, null, 1))
}
main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 300)); process.exit(1) })
