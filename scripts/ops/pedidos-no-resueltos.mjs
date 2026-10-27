#!/usr/bin/env node
/**
 * PEDIDOS-NO-RESUELTOS-CEREBRO.md · la lista de lo que el portero NO pudo dar (27-oct · criterio de Emilio: la respuesta `nada_usable` debe ser rara y quedar registrada).
 * SOLO LEE `cerebro_pedidos` (estado no_resuelto, o con algún hueco `nada_usable`) y escribe el papel del vault. No cambia nada en la base. US$ 0.
 *
 * Uso:  doppler run -p zero-risk -c prd -- node scripts/ops/pedidos-no-resueltos.mjs <ruta-del-md> [--dias=30]
 */
import fs from 'node:fs'

const salida = process.argv[2]
const dias = Number((process.argv.find((a) => a.startsWith('--dias=')) ?? '--dias=30').split('=')[1]) || 30
if (!salida) { console.error('uso: node pedidos-no-resueltos.mjs <ruta-del-md> [--dias=30]'); process.exit(2) }
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, llave = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !llave) { console.error('faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(2) }

const desde = new Date(Date.now() - dias * 86_400_000).toISOString()
const r = await fetch(`${url}/rest/v1/cerebro_pedidos?select=id,client_id,estado,para,pedido_por_oficina,pedido_por_agente,creado_en,costo_usd,resultado&creado_en=gte.${desde}&order=creado_en.desc&limit=1000`, { headers: { apikey: llave, Authorization: `Bearer ${llave}` } })
if (!r.ok) { console.error('lectura falló', r.status, (await r.text()).slice(0, 200)); process.exit(1) }
const filas = await r.json()
const huecosDe = (f) => (Array.isArray(f.resultado?.huecos) ? f.resultado.huecos : [])
const sinResolver = filas.filter((f) => f.estado === 'no_resuelto' || huecosDe(f).some((h) => h.nada_usable))
const nadaUsable = sinResolver.filter((f) => huecosDe(f).some((h) => h.nada_usable))

const l = []
l.push('---', 'type: registro generado', `generado: ${new Date().toISOString()}`, `ventana: últimos ${dias} días`, 'fuente: cerebro_pedidos (solo lectura) · scripts/ops/pedidos-no-resueltos.mjs', '---')
l.push('# Pedidos que el portero NO pudo resolver', '', `Pedidos en la ventana: ${filas.length} · sin resolver: ${sinResolver.length} · con \`nada_usable\` (la oficina generó con IA): ${nadaUsable.length}`, '', 'Regla (Emilio, 27-oct): esta lista debe ser RARA. El portero entrega lo más cercano y solo cae aquí si de verdad no hay nada usable.', '')
if (!sinResolver.length) l.push('_Ninguno en la ventana._')
for (const f of sinResolver) {
  l.push(`## ${f.creado_en.slice(0, 16)}Z · ${f.pedido_por_oficina}/${f.pedido_por_agente} · cliente ${String(f.client_id).slice(0, 8)} · \`${f.id}\``, `- Pidió: ${String(f.para).slice(0, 300)}`, `- Estado: ${f.estado} · costo US$ ${Number(f.costo_usd || 0).toFixed(3)}`)
  for (const h of huecosDe(f)) {
    if (h.estado === 'ya_esta' || h.estado === 'traido_y_archivado') continue
    l.push(`- Hueco «${String(h.hueco?.objetivo ?? h.hueco?.tipo ?? '').slice(0, 120)}»: ${h.nada_usable ? '**nada_usable**' : h.estado}${h.tope ? ' · TOPE' : ''} — ${String(h.detalle ?? '').slice(0, 200)}`)
    for (const i of (h.intentado ?? []).slice(0, 6)) l.push(`  - intentado: ${String(i).slice(0, 160)}`)
  }
  l.push('')
}
fs.writeFileSync(salida, l.join('\n'))
console.log(`escrito ${salida} · ${filas.length} pedidos · ${sinResolver.length} sin resolver · ${nadaUsable.length} nada_usable`)
