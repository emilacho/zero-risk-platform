#!/usr/bin/env node
/**
 * SECO DE LA JEFATURA (J5) · guion ejecutable · CC#2 · 13-oct. SIN `--aplicar` cada orden solo IMPRIME lo que haría (y las de lectura leen). US$ 0: todo es `dry_run: true`; ningún agente ni GPT se llama de verdad.
 *
 *   node scripts/ops/jefatura-seco.mjs plan                              la matriz (cuántas celdas por tipo/caso) y la lista de interruptores · sin red
 *   node scripts/ops/jefatura-seco.mjs estado                            lee (solo lectura): jefatura_config, los 2 flujos, n8n en vuelo y los contadores
 *   node scripts/ops/jefatura-seco.mjs tamanos-reales                    SOLO LECTURA: mide plan / briefs / estrategia / calendario REALES (sin naufrago.ec) y guarda sus tamaños; luego: correr --tamanos <archivo>
 *   node scripts/ops/jefatura-seco.mjs contadores --guardar <archivo>    foto de los contadores ANTES · después: --comparar <archivo> (debe decir lo esperado)
 *   node scripts/ops/jefatura-seco.mjs encender [--aplicar]              guarda la foto del estado previo, pone la jefatura en `ensayo` SOLO con los 3 clientes de práctica y activa SOLO el flujo `jefatura · turno`; lee de vuelta
 *   node scripts/ops/jefatura-seco.mjs correr --via ruta|n8n [--tipo T] [--cliente slug] [--registro tuteo|voseo] [--caso C] [--limite N] [--aplicar]
 *   node scripts/ops/jefatura-seco.mjs puerta [--aplicar]                lo que la ruta debe negarse a abrir (400/409) · `puerta --apagada` (DESPUÉS de apagar): que NO abre ni corre ni vigila
 *   node scripts/ops/jefatura-seco.mjs limpiar [--aplicar]               al FINAL y solo cuando CC#3 ya midió: respalda y borra las filas jefatura_* de los 3 clientes de práctica (ninguna otra)
 *   node scripts/ops/jefatura-seco.mjs apagar [--aplicar]                todo al revés (restaura la foto previa), apagada, flujos inactivos; lee de vuelta
 *
 * Variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, N8N_API_KEY, SALA_DISPATCH_KEY (y, opcionales, N8N_BASE_URL, N8N_WEBHOOK_BASE, APP_URL, SALIDA).
 * NUNCA imprime una llave. Los clientes de práctica son archivos (`jefatura-seco/fixtures.mjs`): NO se inserta nada en `clients`; la jefatura guarda `client_id` como texto. Nada de naufrago.ec.
 */
import fs from 'node:fs'
import path from 'node:path'
import { CLIENTES, ID_PREFIJO, TAMANOS, usarTamanos } from './jefatura-seco/fixtures.mjs'
import { CASOS, CASOS_DE_PUERTA, TIPOS, celdas, resumenDeLaMatriz } from './jefatura-seco/matriz.mjs'
import { apagadaNoAbre, correrPorN8n, correrPorRuta, costoPorCaso, puerta, resumirMedidas } from './jefatura-seco/nucleo.mjs'
import { construirTurno, construirVigia } from '../worker-staging/jefatura/construir-jefatura.mjs'

const A = process.argv.slice(2)
const orden = A[0]
const flag = (n) => { const i = A.indexOf('--' + n); return i >= 0 ? A[i + 1] : null }
const aplicar = A.includes('--aplicar')
const IDS = CLIENTES.map((c) => c.id)
const NOMBRE_TURNO = construirTurno().name, NOMBRE_VIGIA = construirVigia().name
const SALIDA = flag('salida') || process.env.SALIDA || `_jefatura-seco-${new Date().toISOString().slice(0, 10)}`

const U = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''), SK = process.env.SUPABASE_SERVICE_ROLE_KEY
const N8N = (process.env.N8N_BASE_URL || 'https://n8n-production-72be.up.railway.app').replace(/\/$/, ''), NK = process.env.N8N_API_KEY
const HOOKS = (process.env.N8N_WEBHOOK_BASE || `${N8N}/webhook`).replace(/\/$/, '')
const APP = (process.env.APP_URL || 'https://zero-risk-platform.vercel.app').replace(/\/$/, '')
const LLAVE = process.env.SALA_DISPATCH_KEY
const necesita = (...ks) => { const f = ks.filter((k) => !process.env[k]); if (f.length) { console.error('faltan variables: ' + f.join(', ')); process.exit(2) } }

const HS = () => ({ apikey: SK, authorization: 'Bearer ' + SK, 'content-type': 'application/json' })
const HN = () => ({ 'X-N8N-API-KEY': NK, 'content-type': 'application/json' })
const rest = async (tabla, q = '') => { const r = await fetch(`${U}/rest/v1/${tabla}?${q}`, { headers: HS() }); const t = await r.text(); try { return JSON.parse(t) } catch { return t } }
const cuenta = async (tabla, q = '') => { const r = await fetch(`${U}/rest/v1/${tabla}?${q}&select=*`, { headers: { ...HS(), prefer: 'count=exact', range: '0-0' } }); if (!r.ok) return `error ${r.status}`; return Number((r.headers.get('content-range') || '').split('/')[1]) }
const patchCfg = async (cuerpo) => { const r = await fetch(`${U}/rest/v1/jefatura_config?id=eq.1`, { method: 'PATCH', headers: { ...HS(), prefer: 'return=representation' }, body: JSON.stringify(cuerpo) }); const t = await r.text(); if (!r.ok) throw new Error(`jefatura_config ${r.status}`); return JSON.parse(t)[0] }
const paso = (t) => console.log((aplicar ? '▶ ' : '· (solo se imprime) ') + t)
const guardar = (nombre, obj) => { fs.mkdirSync(SALIDA, { recursive: true }); fs.writeFileSync(path.join(SALIDA, nombre), JSON.stringify(obj, null, 2)); return path.join(SALIDA, nombre) }

async function flujos() {
  const lista = (await (await fetch(`${N8N}/api/v1/workflows?limit=250`, { headers: HN() })).json()).data || []
  const por = (n) => lista.filter((w) => w.name === n)
  return { turno: por(NOMBRE_TURNO), vigia: por(NOMBRE_VIGIA) }
}
async function enVuelo() {
  let n = 0
  for (const st of ['running', 'waiting']) n += ((await (await fetch(`${N8N}/api/v1/executions?status=${st}&limit=50`, { headers: HN() })).json()).data || []).length
  return n
}
async function activar(id, on) { const r = await fetch(`${N8N}/api/v1/workflows/${id}/${on ? 'activate' : 'deactivate'}`, { method: 'POST', headers: HN() }); if (!r.ok) throw new Error(`flujo ${id}: ${r.status}`) }
const unico = (lista, quien) => { if (lista.length !== 1) throw new Error(`se esperaba UN flujo «${quien}» y hay ${lista.length} (créalos con construir-jefatura.mjs --crear, inactivos)`); return lista[0] }

// ───────────────────────── contadores (antes/después)
export async function contadores() {
  const enIds = `client_id=in.(${IDS.join(',')})`
  const costos = await rest('agent_invocations', `${enIds}&select=cost_usd`)
  return {
    tomado_en: new Date().toISOString(),
    agent_invocations_total: await cuenta('agent_invocations'),
    agent_invocations_de_los_clientes_de_practica: Array.isArray(costos) ? costos.length : costos,
    agent_invocations_costo_usd_de_los_clientes_de_practica: Array.isArray(costos) ? +costos.reduce((a, r) => a + Number(r.cost_usd || 0), 0).toFixed(6) : costos,
    agent_invocations_workflow_id_nulo: await cuenta('agent_invocations', 'workflow_id=is.null'),
    hitl_queue_total: await cuenta('hitl_queue'),
    hitl_pending_approvals_editor_escalation: await cuenta('hitl_pending_approvals', 'approval_type=eq.editor_escalation'),
    client_historical_outputs_total: await cuenta('client_historical_outputs'),
    jefatura_revisiones: await cuenta('jefatura_revisiones'),
    jefatura_pasos: await cuenta('jefatura_pasos'),
    jefatura_fichas: await cuenta('jefatura_fichas'),
    n8n_en_vuelo: await enVuelo(),
    // (hitl_queue y client_historical_outputs guardan client_id como UUID: un cliente de práctica de texto no cabe ahí; el total es el que no debe moverse)
    // los mensajes a #alertas NO se pueden contar desde aquí (en seco la jefatura no llama a Slack): se anota el `ts` del último mensaje del canal antes y después con la lectura de Slack (ver el LISTO)
  }
}
/** lo que DEBE seguir igual en un seco (diferencias = alarma); las filas jefatura_* sí crecen */
const DEBE_SEGUIR_IGUAL = ['agent_invocations_total', 'agent_invocations_de_los_clientes_de_practica', 'agent_invocations_costo_usd_de_los_clientes_de_practica', 'agent_invocations_workflow_id_nulo', 'hitl_queue_total', 'hitl_pending_approvals_editor_escalation', 'client_historical_outputs_total']

// ───────────────────────── la lista de interruptores
const INTERRUPTORES = [
  'Antes: J1 aplicada (tablas `jefatura_*`) · los 2 flujos creados INACTIVOS (`construir-jefatura.mjs --crear`) · n8n 0 corriendo y 0 esperando · foto de contadores (`contadores --guardar`).',
  '1. `jefatura_config` → `ensayo`, `tipos_activos` = los 5 tipos, `clientes_ensayo` = los 3 clientes de práctica. (Las 6 filas de política siguen `is_active=false`: en ensayo no hace falta.)',
  '2. Flujo `jefatura · turno` → ACTIVO (el webhook solo existe activo). El vigía queda INACTIVO: se llama a la ruta del vigía a mano; solo se activa para la prueba de reloj (`--con-vigia`), y se apaga después.',
  '3. Nada más se enciende: ni oficina, ni cadena, ni `autoproducir`, ni planeación, ni variables de entorno.',
  'Al terminar: `apagar` → flujo turno INACTIVO (y vigía), `jefatura_config` de vuelta a la foto previa (`apagada`, listas vacías), lectura de vuelta, `contadores --comparar` (todo igual salvo las filas `jefatura_*`).',
]

// ───────────────────────── órdenes
async function main() {
  if (!orden || orden === 'plan') {
    const r = resumenDeLaMatriz()
    console.log('MATRIZ DEL SECO (§13.3) · 3 rubros × 2 registros × casos')
    console.log('  clientes de práctica :', CLIENTES.map((c) => `${c.nombre} [${c.rubro} · ${c.pais} · ${c.moneda} · manual en ${c.registro}]`).join(' | '))
    console.log('  celdas por la ruta   :', r.total, JSON.stringify(r.por_tipo), '| casos por tipo', JSON.stringify(r.casos_por_tipo))
    console.log('  casos de la puerta   :', r.puerta, '(' + CASOS_DE_PUERTA.map((c) => c.caso).join(', ') + ')')
    for (const t of TIPOS) console.log(`  ${t.padEnd(10)}:`, CASOS[t].map((c) => c.caso).join(' · '))
    console.log('\nINTERRUPTORES'); INTERRUPTORES.forEach((l) => console.log('  ' + l))
    console.log('\nAhora no se ha tocado nada.')
    return
  }
  if (orden === 'estado') {
    necesita('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'N8N_API_KEY')
    const f = await flujos()
    console.log('jefatura_config :', JSON.stringify((await rest('jefatura_config', 'select=*&id=eq.1'))[0]))
    console.log('flujo turno     :', f.turno.map((w) => `${w.id} active=${w.active}`).join(', ') || '(no existe)')
    console.log('flujo vigía     :', f.vigia.map((w) => `${w.id} active=${w.active}`).join(', ') || '(no existe)')
    console.log('contadores      :', JSON.stringify(await contadores(), null, 1))
    return
  }
  if (orden === 'limpiar') {
    // Al final de J5, y SOLO cuando CC#3 ya midió: respalda y borra las filas `jefatura_*` de los 3 clientes de práctica (si quedan revisiones, la REVERSA de J1 se niega). Nada de otros clientes: el filtro es por `client_id`.
    necesita('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY')
    const lotes = (xs, n) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))
    const revs = await rest('jefatura_revisiones', `select=*&client_id=in.(${IDS.join(',')})`)
    if (!Array.isArray(revs)) throw new Error('no se pudieron leer las revisiones: ' + JSON.stringify(revs).slice(0, 120))
    const rid = revs.map((r) => r.id)
    const leerPorRevision = async (tabla) => { const out = []; for (const l of lotes(rid, 40)) { const f = await rest(tabla, `select=*&revision_id=in.(${l.join(',')})`); if (!Array.isArray(f)) throw new Error(`no se pudo leer ${tabla}`); out.push(...f) } return out }
    const pasos = await leerPorRevision('jefatura_pasos'), fichas = await leerPorRevision('jefatura_fichas')
    paso(`respaldar y borrar ${fichas.length} fichas, ${pasos.length} pasos y ${revs.length} revisiones de los clientes de práctica (${IDS.length}); ninguna otra`)
    if (!aplicar) return
    const archivo = guardar('jefatura-filas-del-seco.json', { respaldado_en: new Date().toISOString(), clientes: IDS, revisiones: revs, pasos, fichas })
    const huella = (await import('node:crypto')).createHash('sha256').update(fs.readFileSync(archivo)).digest('hex')
    console.log(`respaldo ${archivo} sha256 ${huella.slice(0, 16)}…`)
    const borrar = async (tabla, filtro) => { const r = await fetch(`${U}/rest/v1/${tabla}?${filtro}`, { method: 'DELETE', headers: { ...HS(), prefer: 'return=minimal' } }); if (!r.ok) throw new Error(`borrar ${tabla}: ${r.status}`) }
    for (const l of lotes(rid, 40)) await borrar('jefatura_fichas', `revision_id=in.(${l.join(',')})`)
    for (const l of lotes(rid, 40)) await borrar('jefatura_pasos', `revision_id=in.(${l.join(',')})`)
    await borrar('jefatura_revisiones', `client_id=in.(${IDS.join(',')})`)
    const quedan = await cuenta('jefatura_revisiones', `client_id=in.(${IDS.join(',')})`)
    console.log('leído de vuelta: revisiones que quedan de los clientes de práctica =', quedan)
    process.exitCode = quedan === 0 ? 0 : 1; return
  }
  if (orden === 'tamanos-reales') {
    // SOLO LECTURA. Mide los artefactos REALES que ya existen (plan, parte de briefs, estrategia, calendario) de los clientes que NO son naufrago.ec (se excluyen por nombre ANTES de leer nada) y guarda los tamaños
    // medianos para armar los clientes de práctica con el tamaño real (`correr --tamanos <archivo>`). El manual no tiene una tabla única conocida: se queda en el valor medido del diseño (≈ 15 k).
    necesita('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY')
    const nau = await rest('clients', `select=id&or=${encodeURIComponent('(name.ilike.*naufrago*,name.ilike.*náufrago*,slug.ilike.*naufrago*)')}`)
    const fuera = Array.isArray(nau) ? nau.map((c) => c.id) : []
    const noNau = fuera.length ? `&client_id=not.in.(${fuera.join(',')})` : ''
    const mediana = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null }
    const largo = (r) => String(r.content_text ?? r.content ?? '').length
    const med = {}
    for (const [clave, tipo] of [['plan', 'campaign_plan_90d'], ['briefs', 'campaign_brief_pack']]) {
      const filas = await rest('client_historical_outputs', `select=client_id,content_text,content&output_type=eq.${tipo}${noNau}&order=created_at.desc&limit=30`)
      const ls = Array.isArray(filas) ? filas.map(largo).filter((n) => n > 0) : []
      med[clave] = { n: ls.length, mediana: mediana(ls), max: ls.length ? Math.max(...ls) : null }
    }
    const camp = await rest('cadena_campanas', `select=id${noNau}&limit=60`)
    const ids = Array.isArray(camp) ? camp.map((c) => c.id) : []
    if (ids.length) {
      const es = await rest('cadena_estrategias', `select=texto_md,contenido&campana_id=in.(${ids.join(',')})&limit=30`)
      const ls = Array.isArray(es) ? es.map((e) => (e.texto_md ? String(e.texto_md).length : JSON.stringify(e.contenido ?? {}).length)) : []
      med.estrategia = { n: ls.length, mediana: mediana(ls), max: ls.length ? Math.max(...ls) : null }
      const filas = await cuenta('cadena_calendario_filas', `campana_id=in.(${ids.join(',')})`)
      med.calendario = { filas_en_total: filas, campanas: ids.length }
    }
    console.log('excluidos por nombre (naufrago):', fuera.length, '(no se leyó ningún dato suyo)')
    console.log(JSON.stringify(med, null, 1))
    const tam = {}
    for (const k of ['plan', 'briefs', 'estrategia']) if (med[k]?.mediana) tam[k] = med[k].mediana
    guardar('tamanos-reales.json', { medido_en: new Date().toISOString(), ...tam, detalle: med })
    console.log(`guardado ${path.join(SALIDA, 'tamanos-reales.json')} (úsalo con: correr --tamanos <archivo>). Valores por omisión:`, JSON.stringify(TAMANOS))
    return
  }
  if (orden === 'contadores') {
    necesita('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'N8N_API_KEY')
    const ahora = await contadores()
    if (flag('guardar')) { fs.writeFileSync(flag('guardar'), JSON.stringify(ahora, null, 2)); console.log('foto guardada en', flag('guardar')); return }
    if (flag('comparar')) {
      const antes = JSON.parse(fs.readFileSync(flag('comparar'), 'utf8'))
      let mal = 0
      for (const k of Object.keys(ahora)) {
        if (k === 'tomado_en') continue
        const igual = antes[k] === ahora[k]
        const debe = DEBE_SEGUIR_IGUAL.includes(k)
        if (debe && !igual) mal++
        console.log(`${debe ? (igual ? '✔' : '🔴') : '·'} ${k.padEnd(60)} ${antes[k]} → ${ahora[k]}`)
      }
      console.log(mal ? `🔴 ${mal} contador(es) que debían seguir iguales cambiaron` : '✔ todo lo que debía seguir igual sigue igual')
      process.exitCode = mal ? 1 : 0; return
    }
    console.log(JSON.stringify(ahora, null, 2)); return
  }
  if (orden === 'encender') {
    necesita('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'N8N_API_KEY')
    const f = await flujos(), turno = unico(f.turno, NOMBRE_TURNO), vigia = unico(f.vigia, NOMBRE_VIGIA)
    const cfg = (await rest('jefatura_config', 'select=*&id=eq.1'))[0]
    const vivas = await enVuelo()
    console.log('estado previo   :', JSON.stringify({ config: cfg, turno_activo: turno.active, vigia_activo: vigia.active, n8n_en_vuelo: vivas }))
    if (vivas) { console.error('🔴 hay ejecuciones de n8n en vuelo: no se enciende nada'); process.exitCode = 1; return }
    if (turno.active || vigia.active || cfg?.estado !== 'apagada') { console.error('🔴 se esperaba todo apagado de partida (config apagada, flujos inactivos)'); process.exitCode = 1; return }
    paso(`guardar la foto previa en ${SALIDA}/estado-previo.json`)
    paso(`jefatura_config → ensayo · tipos_activos=${TIPOS.join(',')} · clientes_ensayo=${IDS.join(',')}`)
    const conVigia = A.includes('--con-vigia')
    paso(`activar el flujo «${NOMBRE_TURNO}» (${turno.id}); el vigía (${vigia.id}) ${conVigia ? 'TAMBIÉN se activa (prueba de reloj)' : 'sigue inactivo'}`)
    if (!aplicar) return
    guardar('estado-previo.json', { config: cfg, turno: { id: turno.id, active: turno.active }, vigia: { id: vigia.id, active: vigia.active } })
    await patchCfg({ estado: 'ensayo', tipos_activos: TIPOS, clientes_ensayo: IDS })
    await activar(turno.id, true)
    if (conVigia) await activar(vigia.id, true)
    const leido = (await rest('jefatura_config', 'select=*&id=eq.1'))[0], t2 = (await flujos()).turno[0], v2 = (await flujos()).vigia[0]
    console.log('leído de vuelta :', JSON.stringify({ estado: leido.estado, tipos: leido.tipos_activos, clientes: leido.clientes_ensayo, turno_activo: t2.active, vigia_activo: v2.active }))
    if (leido.estado !== 'ensayo' || !t2.active || v2.active !== conVigia) { console.error('🔴 la lectura de vuelta no coincide'); process.exitCode = 1; return }
    return
  }
  if (orden === 'correr' || orden === 'puerta') {
    if (aplicar) necesita('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SALA_DISPATCH_KEY')
    const via = flag('via') || 'ruta'
    const corrida = flag('corrida') || new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)
    const lim = flag('limite') ? Number(flag('limite')) : Infinity
    if (flag('tamanos')) usarTamanos(JSON.parse(fs.readFileSync(flag('tamanos'), 'utf8')))
    const filtro = {
      tipos: flag('tipo') ? [flag('tipo')] : TIPOS,
      clientes: flag('cliente') ? CLIENTES.filter((c) => c.slug === flag('cliente') || c.id === flag('cliente')).map((c) => c.id) : IDS,
      registros: flag('registro') ? [flag('registro')] : ['tuteo', 'voseo'],
      casos: flag('caso') ? [flag('caso')] : null, corrida,
    }
    const T = transporteReal()
    if (orden === 'puerta' && A.includes('--apagada')) {
      const base = celdas({ ...filtro, tipos: ['pieza'], clientes: [IDS[0]], registros: ['tuteo'], casos: ['sin-fichas-gpt-vacio'] })[0].sobre
      paso('con la jefatura APAGADA: abrir → 409, turnos → 409, vigía → apagada (corre DESPUÉS de «apagar»; los contadores no deben moverse)')
      if (!aplicar) return
      const r = await apagadaNoAbre(base, T)
      console.log(`${r.ok ? '✔' : '🔴'} ${r.id} ${r.ok ? JSON.stringify(r.observado) : r.fallos.join(' | ')}`)
      process.exitCode = r.ok ? 0 : 1; return
    }
    if (orden === 'puerta') {
      const base = celdas({ ...filtro, tipos: ['pieza'], clientes: [IDS[0]], registros: ['tuteo'], casos: ['sin-fichas-gpt-vacio'] })[0].sobre
      paso(`${CASOS_DE_PUERTA.length} casos de la puerta contra ${APP}`)
      if (!aplicar) return
      const rs = []
      for (const c of CASOS_DE_PUERTA) { const r = await puerta(c, base, T); rs.push(r); console.log(`${r.ok ? '✔' : '🔴'} ${r.id} ${r.ok ? '' : r.fallos.join(' | ')}`) }
      guardar(`puerta-${corrida}.json`, rs); process.exitCode = rs.every((r) => r.ok) ? 0 : 1; return
    }
    const todas = celdas(filtro).slice(0, lim)
    paso(`${todas.length} celdas «${via}» (${[...new Set(todas.map((c) => c.tipo))].join(', ')}) contra ${APP}${via === 'n8n' ? ' + el flujo real en ' + HOOKS : ''}`)
    if (!aplicar) { for (const c of todas.slice(0, 40)) console.log('   ' + c.id); if (todas.length > 40) console.log(`   … y ${todas.length - 40} más`); return }
    if (via === 'n8n') necesita('N8N_API_KEY')
    const rs = []
    for (const esc of todas) {
      const r = via === 'n8n' ? await correrPorN8n(esc, T, { limite_min: Number(flag('limite-min') || 20) }) : await correrPorRuta(esc, T)
      rs.push(r)
      console.log(`${r.ok ? '✔' : '🔴'} ${esc.id}${r.ok ? '' : '\n     ' + r.fallos.join('\n     ')}${r.observado?.minutos != null && via === 'n8n' ? `  (${r.observado.minutos.toFixed(1)} min)` : ''}`)
    }
    const f = guardar(`${via}-${corrida}.json`, { corrida, via, resultados: rs, medidas: resumirMedidas(rs), costo_por_caso: costoPorCaso(rs) })
    console.log(`\n${rs.filter((r) => r.ok).length}/${rs.length} celdas como el diseño · detalle y medidas en ${f}`)
    process.exitCode = rs.every((r) => r.ok) ? 0 : 1; return
  }
  if (orden === 'apagar') {
    necesita('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'N8N_API_KEY')
    const previo = fs.existsSync(path.join(SALIDA, 'estado-previo.json')) ? JSON.parse(fs.readFileSync(path.join(SALIDA, 'estado-previo.json'), 'utf8')) : null
    const f = await flujos(), turno = unico(f.turno, NOMBRE_TURNO), vigia = unico(f.vigia, NOMBRE_VIGIA)
    const objetivo = previo?.config ?? { estado: 'apagada', tipos_activos: [], clientes_ensayo: [] }
    paso(`flujos «${NOMBRE_TURNO}» y «${NOMBRE_VIGIA}» → INACTIVOS`)
    paso(`jefatura_config → ${JSON.stringify({ estado: objetivo.estado, tipos_activos: objetivo.tipos_activos, clientes_ensayo: objetivo.clientes_ensayo })} (${previo ? 'la foto previa' : 'valores de partida por omisión: no hay foto'})`)
    if (!aplicar) return
    await activar(turno.id, false); await activar(vigia.id, false)
    await patchCfg({ estado: objetivo.estado, tipos_activos: objetivo.tipos_activos, clientes_ensayo: objetivo.clientes_ensayo })
    const leido = (await rest('jefatura_config', 'select=*&id=eq.1'))[0], f2 = await flujos()
    console.log('leído de vuelta :', JSON.stringify({ estado: leido.estado, tipos: leido.tipos_activos, clientes: leido.clientes_ensayo, turno_activo: f2.turno[0].active, vigia_activo: f2.vigia[0].active, n8n_en_vuelo: await enVuelo() }))
    const bien = leido.estado === objetivo.estado && JSON.stringify(leido.tipos_activos) === JSON.stringify(objetivo.tipos_activos) && JSON.stringify(leido.clientes_ensayo) === JSON.stringify(objetivo.clientes_ensayo) && !f2.turno[0].active && !f2.vigia[0].active
    console.log(bien ? '✔ todo apagado y leído de vuelta' : '🔴 la lectura de vuelta NO coincide'); process.exitCode = bien ? 0 : 1; return
  }
  console.error('orden desconocida. Usa: plan | estado | tamanos-reales | contadores | encender | correr | puerta | apagar | limpiar'); process.exit(2)
}

/** el transporte real: las 3 rutas por fetch con la llave de despacho, el webhook del flujo, el envejecimiento del paso (UPDATE de la fila de PRUEBA) y el reloj */
function transporteReal() {
  return {
    async llamar(ruta, cuerpo) {
      const r = await fetch(`${APP}/api/jefatura/${ruta}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-sala-dispatch-key': LLAVE }, body: JSON.stringify(cuerpo) })
      return { status: r.status, body: await r.json().catch(() => ({})) }
    },
    async webhook(cuerpo) {
      const r = await fetch(`${HOOKS}/zero-risk/jefatura-turno`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-sala-dispatch-key': LLAVE }, body: JSON.stringify(cuerpo) })
      return { status: r.status }
    },
    /** pasan 20 min: se retrasa el `inicio` del paso abierto de ESA revisión (fila de la jefatura, de un cliente de práctica) para que el vigía la dé por muerta */
    async envejecer(revision_id) {
      const viejo = new Date(Date.now() - 20 * 60000).toISOString()
      const r = await fetch(`${U}/rest/v1/jefatura_pasos?revision_id=eq.${revision_id}&estado=eq.corriendo`, { method: 'PATCH', headers: { ...HS(), prefer: 'return=minimal' }, body: JSON.stringify({ inicio: viejo }) })
      if (!r.ok) throw new Error(`envejecer: ${r.status}`)
    },
    ahora: () => Date.now(),
    dormir: (ms) => new Promise((res) => setTimeout(res, ms)),
  }
}

if (process.argv[1] && process.argv[1].endsWith('jefatura-seco.mjs')) main().catch((e) => { console.error('🔴', e.message); process.exitCode = 1 })
export { ID_PREFIJO }
