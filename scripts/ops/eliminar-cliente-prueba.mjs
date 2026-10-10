// ELIMINA (o LISTA) los registros de un cliente por la API PÚBLICA con la llave de servicio (los permisos SÍ se respetan). NUNCA por la API de administración.
// POR OMISIÓN SOLO LISTA: no borra nada. Para borrar hay que pasar --ejecutar (y que el respaldo coincida con lo que hay AHORA).
// PROTEGIDAS (nunca se borran): agent_invocations · agent_dispatches · brain_embed_costs · costs · agent_image_generations · todo `cost_*` · la ficha `clients` · la vista active_journeys.
// Fuera de alcance por construcción: solo mira el esquema `public` y SOLO los archivos del respaldo en `client-social-images`; no toca el esquema `naufrago` ni el cubo `client-websites`.
// Uso: node eliminar-cliente-v2.mjs <client_id> <carpeta_de_respaldo> [--ejecutar]
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
const env = fs.existsSync('C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local') ? fs.readFileSync('C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local', 'utf8') : ''
const g = (k) => process.env[k] ?? (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const SB = g('NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, ''), SK = g('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: SK, Authorization: 'Bearer ' + SK }
const [id, resp] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const EJECUTAR = process.argv.includes('--ejecutar')
if (!/^[0-9a-f-]{36}$/.test(id ?? '')) throw new Error('uso: <client_id> <carpeta_de_respaldo> [--ejecutar]')
const PROTEGIDA = (t) => ['agent_invocations', 'agent_dispatches', 'brain_embed_costs', 'costs', 'agent_image_generations', 'clients', 'active_journeys'].includes(t) || /^cost_/.test(t)
// 1 · el respaldo debe existir y verificar contra sus hashes
const man = JSON.parse(fs.readFileSync(path.join(resp, 'MANIFIESTO.json'), 'utf8'))
if (man.cliente !== id) throw new Error('el respaldo es de otro cliente')
for (const t of man.tablas) { const c = fs.readFileSync(path.join(resp, 'tablas', t.tabla + '.json'), 'utf8'); if (crypto.createHash('sha256').update(c).digest('hex') !== t.sha256) throw new Error('el respaldo de ' + t.tabla + ' no coincide con su hash') }
for (const o of man.almacenamiento) { const b = fs.readFileSync(path.join(resp, 'almacenamiento', o.bucket, o.objeto)); if (crypto.createHash('sha256').update(b).digest('hex') !== o.sha256) throw new Error('objeto del respaldo corrupto ' + o.objeto) }
const cuenta = async (t) => { const r = await fetch(`${SB}/rest/v1/${t}?client_id=eq.${id}&select=client_id`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } }); return Number((r.headers.get('content-range') || '*/0').split('/')[1]) }
const aBorrar = man.tablas.filter((t) => t.filas && !PROTEGIDA(t.tabla))
const protegidas = man.tablas.filter((t) => t.filas && PROTEGIDA(t.tabla))
const difiere = []
for (const t of aBorrar) { const n = await cuenta(t.tabla); if (n !== t.filas) difiere.push(`${t.tabla}: hay ${n}, el respaldo tiene ${t.filas}`) }
const total = aBorrar.reduce((a, t) => a + t.filas, 0)
console.log(`MODO ${EJECUTAR ? 'EJECUTAR' : 'LISTAR (no se borra nada)'} · cliente ${id}`)
console.log(`a borrar: ${aBorrar.length} tablas / ${total} filas`)
for (const t of aBorrar) console.log(`   ${t.tabla} ${t.filas}`)
console.log(`archivos del almacenamiento a borrar: ${man.almacenamiento.length} (cubo(s): ${[...new Set(man.almacenamiento.map((o) => o.bucket))].join(', ')})`)
console.log('PROTEGIDAS (no se tocan):', protegidas.map((t) => `${t.tabla} ${t.filas}`).join(' · '))
console.log('esquema naufrago y cubo client-websites: fuera de alcance (el guion no los nombra)')
if (difiere.length) { console.log('🔴 el respaldo NO coincide con la base ahora:', difiere.join(' | ')); if (EJECUTAR) throw new Error('hay que rehacer el respaldo antes de borrar') }
if (!EJECUTAR) { console.log('(modo listar: nada borrado)'); process.exit(0) }
const orden = ['client_sede_datos', ...aBorrar.map((t) => t.tabla).filter((t) => t !== 'client_sede_datos')]
const pend = [...new Set(orden)], resultado = []
for (let vuelta = 0; vuelta < 3 && pend.length; vuelta++) {
  for (const t of [...pend]) {
    if (PROTEGIDA(t)) throw new Error('intento de borrar una tabla protegida: ' + t)
    const r = await fetch(`${SB}/rest/v1/${t}?client_id=eq.${id}`, { method: 'DELETE', headers: { ...H, Prefer: 'return=representation,count=exact' } })
    if (r.ok) { resultado.push({ tabla: t, borradas: (await r.json()).length }); pend.splice(pend.indexOf(t), 1) } else if (vuelta === 2) resultado.push({ tabla: t, error: r.status + ' ' + (await r.text()).slice(0, 160) })
  }
}
console.log('borrado:', resultado.map((x) => (x.error ? `${x.tabla} ERROR ${x.error}` : `${x.tabla} ${x.borradas}`)).join(' · '))
const porCubo = {}
for (const o of man.almacenamiento) (porCubo[o.bucket] ??= []).push(o.objeto)
for (const [cubo, nombres] of Object.entries(porCubo)) { if (cubo === 'client-websites') throw new Error('el cubo de la landing no se toca'); const r = await fetch(`${SB}/storage/v1/object/${cubo}`, { method: 'DELETE', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: nombres }) }); console.log('almacenamiento', cubo, r.status) }
console.log('filas que quedan por tabla:', [...aBorrar.map((t) => t.tabla)].length ? (await Promise.all(aBorrar.map(async (t) => `${t.tabla}=${await cuenta(t.tabla)}`))).join(' · ') : '')
