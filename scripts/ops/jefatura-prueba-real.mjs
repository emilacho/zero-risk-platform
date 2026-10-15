#!/usr/bin/env node
/**
 * PRUEBA REAL CHICA DE LA JEFATURA (J6) · guion ejecutable · CC#1 · 14-oct · diseño v4 §13.4 (opción B). NO SE CORRE sin el «dale» de Emilio.
 * SIN `--aplicar` cada orden solo IMPRIME lo que haría (y las de lectura leen). Nunca imprime una llave.
 *
 *   node scripts/ops/jefatura-prueba-real.mjs plan                           los pasos, los topes y lo que se compara · sin red
 *   node scripts/ops/jefatura-prueba-real.mjs aviso [--medidas <archivo>]    el texto del aviso para Emilio (qué corre, cuánto cuesta, cuánto tarda, qué prueba, qué riesgo)
 *   node scripts/ops/jefatura-prueba-real.mjs estado                         lee (solo lectura): jefatura_config, los 2 flujos, n8n en vuelo y los contadores
 *   node scripts/ops/jefatura-prueba-real.mjs contadores --guardar <archivo> | --comparar <archivo>
 *   node scripts/ops/jefatura-prueba-real.mjs correr --aplicar --dale-de-emilio <fecha> [--imagen <url>] [--salida <carpeta>]
 *        2 revisiones REALES (dry_run=false) de una pieza post ya hecha, 2 rubros, clientes de práctica; tope US$ 0,40 por revisión y US$ 0,70 en total; APAGA SIEMPRE al final
 *   node scripts/ops/jefatura-prueba-real.mjs apagar [--aplicar]             restaura jefatura_config a apagada con listas vacías y deja inactivo el flujo `jefatura · turno`
 *   node scripts/ops/jefatura-prueba-real.mjs limpiar [--aplicar]            al FINAL y solo cuando CC#3 ya midió: respalda y borra las filas jefatura_* de los 2 clientes de esta prueba (ninguna otra)
 *
 * Variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, N8N_API_KEY, INTERNAL_API_KEY (la llave interna: entra por las rutas de Vercel; NUNCA se usa ni se pide `SALA_DISPATCH_KEY`: la ruta despierta al flujo con la suya) (y, opcionales, N8N_BASE_URL, APP_URL).
 * Los clientes de la prueba son archivos (`prueba-jefatura-real-*`): NO se inserta nada en `clients`. Nada de naufrago.ec. No toca el guion del seco (J5) ni sus rutas: solo LEE sus fixtures.
 */
import fs from 'node:fs'
import path from 'node:path'
import { avisoParaEmilio, CLIENTES_REALES, correrLaPruebaReal, compararContadores, pasosDeLaPrueba, TOPES } from './jefatura-prueba-real/nucleo.mjs'
import { construirTurno, construirVigia } from '../worker-staging/jefatura/construir-jefatura.mjs'

const A = process.argv.slice(2)
const orden = A[0]
const flag = (n) => { const i = A.indexOf('--' + n); return i >= 0 ? A[i + 1] : null }
const aplicar = A.includes('--aplicar')
const IDS = CLIENTES_REALES.map((c) => c.id)
const NOMBRE_TURNO = construirTurno().name, NOMBRE_VIGIA = construirVigia().name
const SALIDA = flag('salida') || `_jefatura-prueba-real-${new Date().toISOString().slice(0, 10)}`

const U = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''), SK = process.env.SUPABASE_SERVICE_ROLE_KEY
const N8N = (process.env.N8N_BASE_URL || 'https://n8n-production-72be.up.railway.app').replace(/\/$/, ''), NK = process.env.N8N_API_KEY
const APP = (process.env.APP_URL || 'https://zero-risk-platform.vercel.app').replace(/\/$/, '')
const LLAVE = process.env.INTERNAL_API_KEY
const necesita = (...ks) => { const f = ks.filter((k) => !process.env[k]); if (f.length) { console.error('faltan variables: ' + f.join(', ')); process.exit(2) } }
const HS = () => ({ apikey: SK, authorization: 'Bearer ' + SK, 'content-type': 'application/json' })
const HN = () => ({ 'X-N8N-API-KEY': NK, 'content-type': 'application/json' })
const rest = async (tabla, q = '') => { const r = await fetch(`${U}/rest/v1/${tabla}?${q}`, { headers: HS() }); const t = await r.text(); try { return JSON.parse(t) } catch { return t } }
const cuenta = async (tabla, q = '') => { const r = await fetch(`${U}/rest/v1/${tabla}?${q}&select=*`, { headers: { ...HS(), prefer: 'count=exact', range: '0-0' } }); if (!r.ok) return `error ${r.status}`; return Number((r.headers.get('content-range') || '').split('/')[1]) }
const patchCfg = async (cuerpo) => { const r = await fetch(`${U}/rest/v1/jefatura_config?id=eq.1`, { method: 'PATCH', headers: { ...HS(), prefer: 'return=representation' }, body: JSON.stringify(cuerpo) }); const t = await r.text(); if (!r.ok) throw new Error(`jefatura_config ${r.status}: ${t.slice(0, 200)}`); return JSON.parse(t)[0] }
const guardar = (nombre, obj) => { fs.mkdirSync(SALIDA, { recursive: true }); fs.writeFileSync(path.join(SALIDA, nombre), JSON.stringify(obj, null, 2)); return path.join(SALIDA, nombre) }

async function flujos() {
  const lista = (await (await fetch(`${N8N}/api/v1/workflows?limit=250`, { headers: HN() })).json()).data || []
  const por = (n) => lista.filter((w) => w.name === n)
  const uno = (l, q) => { if (l.length > 1) throw new Error(`hay ${l.length} flujos «${q}»`); return l[0] ? { id: l[0].id, active: l[0].active === true } : null }
  return { turno: uno(por(NOMBRE_TURNO), NOMBRE_TURNO), vigia: uno(por(NOMBRE_VIGIA), NOMBRE_VIGIA) }
}
async function enVuelo() {
  let n = 0
  for (const st of ['running', 'waiting']) {
    const j = await (await fetch(`${N8N}/api/v1/executions?status=${st}&limit=50`, { headers: HN() })).json()
    if (!Array.isArray(j.data)) throw new Error('no se pudo leer las ejecuciones de n8n (se trata como «hay corridas»)')
    n += j.data.length
  }
  return n
}
async function activar(id, on) { const r = await fetch(`${N8N}/api/v1/workflows/${id}/${on ? 'activate' : 'deactivate'}`, { method: 'POST', headers: HN() }); if (!r.ok) throw new Error(`flujo ${id}: ${r.status}`) }

async function contadores() {
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
  }
}

/** el transporte REAL: las rutas por fetch con la llave interna (`x-api-key`) y la acción `despertar` de la ruta de turnos, las lecturas de evidencia (solo lectura) */
function transporteReal() {
  return {
    enVuelo, contadores,
    leerConfig: async () => { const c = (await rest('jefatura_config', 'select=*&id=eq.1'))[0]; return c ? { estado: c.estado, tipos_activos: c.tipos_activos ?? [], clientes_ensayo: c.clientes_ensayo ?? [] } : null },
    ponerConfig: async (c) => { await patchCfg(c) },
    flujos, activar,
    async llamar(ruta, cuerpo) { const r = await fetch(`${APP}/api/jefatura/${ruta}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': LLAVE }, body: JSON.stringify(cuerpo) }); const t = await r.text(); let body; try { body = JSON.parse(t) } catch { body = { texto: t.slice(0, 300) } } return { status: r.status, body } },
    async despertar(cuerpo) { const r = await fetch(`${APP}/api/jefatura/turnos`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': LLAVE }, body: JSON.stringify({ accion: 'despertar', ...cuerpo }) }); return { status: r.status } },
    async evidencia(revision_id) {
      const rev = (await rest('jefatura_revisiones', `select=*&id=eq.${revision_id}`))[0]
      const pasos = await rest('jefatura_pasos', `select=*&revision_id=eq.${revision_id}&order=n.asc`)
      const fichas = await rest('jefatura_fichas', `select=*&revision_id=eq.${revision_id}`)
      const invocaciones = await rest('agent_invocations', `select=agent_name,model,cost_usd,workflow_id,workflow_execution_id,metadata,created_at&client_id=in.(${IDS.join(',')})&order=created_at.desc&limit=50`)
      // las filas de ESTA revisión: las que traen su id en la traza o en el contexto del libro
      const suyas = Array.isArray(invocaciones) ? invocaciones.filter((i) => JSON.stringify(i.metadata ?? {}).includes(revision_id)) : []
      return { rev, pasos: Array.isArray(pasos) ? pasos : [], fichas: Array.isArray(fichas) ? fichas : [], invocaciones: suyas.map((i) => ({ ...i, origen: i.metadata?.origen ?? i.metadata?.jefatura?.origen })) }
    },
  }
}

async function main() {
  if (!orden || orden === 'plan') {
    console.log('PRUEBA REAL CHICA (J6 · opción B) · NO se corre sin el «dale» de Emilio')
    console.log('  clientes de práctica :', CLIENTES_REALES.map((c) => `${c.id} [${c.rubro} · ${c.pais} · ${c.moneda}]`).join(' | '))
    console.log('  topes                :', JSON.stringify(TOPES))
    pasosDeLaPrueba().forEach((p, i) => console.log(`  ${i + 1}. ${p}`))
    console.log('\nAhora no se ha tocado nada.')
    return
  }
  if (orden === 'aviso') {
    const f = flag('medidas')
    console.log(avisoParaEmilio({ medidas: f ? JSON.parse(fs.readFileSync(f, 'utf8')) : null }))
    return
  }
  necesita('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'N8N_API_KEY')
  if (orden === 'estado') {
    const f = await flujos()
    console.log('jefatura_config :', JSON.stringify((await rest('jefatura_config', 'select=*&id=eq.1'))[0]))
    console.log('flujo turno     :', f.turno ? `${f.turno.id} active=${f.turno.active}` : '(no existe)')
    console.log('flujo vigía     :', f.vigia ? `${f.vigia.id} active=${f.vigia.active}` : '(no existe)')
    console.log('contadores      :', JSON.stringify(await contadores(), null, 1))
    return
  }
  if (orden === 'contadores') {
    const g = flag('guardar'), c = flag('comparar')
    if (g) { console.log('guardado en', guardar(path.basename(g), await contadores())); return }
    if (c) {
      const antes = JSON.parse(fs.readFileSync(c, 'utf8')), despues = await contadores()
      console.log(JSON.stringify(compararContadores(antes, despues, { gasto_esperado_usd: Number(flag('gasto') ?? 0) }), null, 1))
      return
    }
    console.log(JSON.stringify(await contadores(), null, 1)); return
  }
  if (orden === 'apagar') {
    const f = await flujos()
    console.log((aplicar ? '▶ ' : '· (solo se imprime) ') + 'jefatura_config → apagada con listas vacías · flujo turno → inactivo · flujo vigía → inactivo')
    if (!aplicar) return
    await patchCfg({ estado: 'apagada', tipos_activos: [], clientes_ensayo: [] })
    if (f.turno?.active) await activar(f.turno.id, false)
    if (f.vigia?.active) await activar(f.vigia.id, false)
    console.log('leído de vuelta:', JSON.stringify((await rest('jefatura_config', 'select=*&id=eq.1'))[0]), JSON.stringify(await flujos()))
    return
  }
  if (orden === 'limpiar') {
    const lotes = (xs, n) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))
    const revs = await rest('jefatura_revisiones', `select=*&client_id=in.(${IDS.join(',')})`)
    const ids = Array.isArray(revs) ? revs.map((r) => r.id) : []
    const pasos = [], fichas = []
    for (const l of lotes(ids, 20)) { pasos.push(...await rest('jefatura_pasos', `select=*&revision_id=in.(${l.join(',')})`)); fichas.push(...await rest('jefatura_fichas', `select=*&revision_id=in.(${l.join(',')})`)) }
    console.log(`${aplicar ? '▶ ' : '· (solo se imprime) '}respaldar y borrar: ${ids.length} revisión(es), ${pasos.length} paso(s), ${fichas.length} ficha(s) de ${IDS.join(', ')} (ningún otro cliente)`)
    if (!aplicar || !ids.length) return
    console.log('respaldo en', guardar('respaldo-jefatura-j6.json', { revs, pasos, fichas }))
    for (const [t, col, xs] of [['jefatura_fichas', 'revision_id', ids], ['jefatura_pasos', 'revision_id', ids], ['jefatura_revisiones', 'id', ids]]) for (const l of lotes(xs, 20)) { const r = await fetch(`${U}/rest/v1/${t}?${col}=in.(${l.join(',')})`, { method: 'DELETE', headers: HS() }); if (!r.ok) throw new Error(`${t}: ${r.status}`) }
    console.log('borrado; no se tocó agent_invocations ni ningún libro de costos')
    return
  }
  if (orden === 'correr') {
    necesita('INTERNAL_API_KEY')
    const fecha = flag('dale-de-emilio')
    const confirmacion = !!fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha)
    if (aplicar && !confirmacion) { console.error('J6 se niega: falta `--dale-de-emilio AAAA-MM-DD` (la fecha del «dale»). Sin ese «dale» no se corre nada real.'); console.error('\n' + avisoParaEmilio()); process.exit(3) }
    const corrida = `c${new Date().toISOString().replace(/\D/g, '').slice(0, 12)}`
    let r
    try { r = await correrLaPruebaReal({ T: transporteReal(), aplicar, confirmacion, corrida, imagen: flag('imagen'), fallaSembrada: A.includes('--falla-sembrada') }) } catch (e) { r = e.resultado_parcial ?? null; console.error('ERROR:', e instanceof Error ? e.message : String(e)); if (r) console.log('resultado parcial en', guardar(`resultado-parcial-${corrida}.json`, r)); process.exit(1) }
    if (r.impreso) { r.pasos.forEach((p, i) => console.log(`  ${i + 1}. ${p}`)); console.log('\n(sin --aplicar: no se escribió ni se llamó a nada)'); return }
    console.log(r.log.join('\n'))
    console.log('evidencia en', guardar(`evidencia-${corrida}.json`, r))
    console.log(r.ok ? 'RESULTADO: la prueba cumplió todo' : 'RESULTADO: la prueba tiene puntos sin cumplir; ver la evidencia')
    process.exitCode = r.ok ? 0 : 1
    return
  }
  console.error('orden desconocida: ' + orden)
  process.exit(2)
}
await main()
await new Promise((r) => setTimeout(r, 100))
