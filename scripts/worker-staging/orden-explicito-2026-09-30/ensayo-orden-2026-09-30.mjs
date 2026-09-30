// ENSAYO DEL ORDEN DE EJECUCIÓN · CC#1 · 2026-09-30 · US$ 0 · la regla que adoptó Emilio: «todo flujo se prueba con todas sus ramas llenas y se compara el orden de ejecución».
//   node ensayo-orden-2026-09-30.mjs [--salida=dir] [--solo=planeacion|vigia]
//
// PLANEACIÓN · las 8 combinaciones de brazos (apify · posthog · cerebro) llenos/vacíos × 3 VARIANTES del flujo, en seco y con sumideros en los 7 nodos que escriben o avisan:
//   A · «viejo»            = el flujo publicado (sin cadena) con el dibujo ORIGINAL (casa y=520 · referencia y=700, debajo de la ficha)  → tiene que FALLAR con las 3 ramas llenas (prueba que el ensayo caza el defecto)
//   B · «cadena+dibujo viejo» = el arreglo de raíz con el dibujo ORIGINAL malo                                                              → tiene que pasar las 8 (prueba que YA NO depende de la posición)
//   C · «final»            = el arreglo de raíz tal como se publicará                                                                        → tiene que pasar las 8
// La combinación se elige POR EL SOBRE (`excluir_brazos`), sin tocar el flujo entre corridas (la copia parchea «elegir brazos» una sola vez).
//
// VIGÍA DEL SILENCIO · copia con la rama del reloj quitada (no se dispara sola), el aviso a Slack apuntado a un sumidero, y 3 escenarios: normal · umbral ilegible · reloj ilegible.
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ordenDeEjecucion } from './lecturas-fuera-de-orden.mjs'
const aqui = dirname(fileURLToPath(import.meta.url))
const envPath = process.env.ENV_FILE || 'C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local'
for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '') }
const N8N = process.env.N8N_BASE_URL, H = { 'X-N8N-API-KEY': process.env.N8N_API_KEY, 'Content-Type': 'application/json' }
const arg = (p) => (process.argv.find((a) => a.startsWith(p)) || '').slice(p.length)
const salida = arg('--salida=') || join(process.cwd(), 'salida-ensayo-orden')
const solo = arg('--solo=')
fs.mkdirSync(salida, { recursive: true })
const CID = '41dd3d62-d6de-4c9a-9996-6df78c1da118'
const SETTINGS_OK = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder']
const SUMIDERO = 'https://n8n-production-72be.up.railway.app/webhook/zero-risk/sumidero-cc1-no-existe'
const espera = (ms) => new Promise((s) => setTimeout(s, ms))
const leer = (f) => JSON.parse(fs.readFileSync(join(aqui, f), 'utf8'))
const crear = async (f) => { const r = await (await fetch(`${N8N}/api/v1/workflows`, { method: 'POST', headers: H, body: JSON.stringify(f) })).json(); if (!r.id) throw new Error('no se creó: ' + JSON.stringify(r).slice(0, 300)); await fetch(`${N8N}/api/v1/workflows/${r.id}/activate`, { method: 'POST', headers: H }); await espera(3000); return r.id }
const apagar = (id) => fetch(`${N8N}/api/v1/workflows/${id}/deactivate`, { method: 'POST', headers: H })
const disparar = (path, body) => fetch(`${N8N}/webhook/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
async function correr(wid, path, body, max = 60) {
  const previos = new Set(((await (await fetch(`${N8N}/api/v1/executions?workflowId=${wid}&limit=30`, { headers: H })).json()).data || []).map((e) => e.id))
  await disparar(path, body)
  for (let i = 0; i < max; i++) {
    await espera(6000)
    const l = (await (await fetch(`${N8N}/api/v1/executions?workflowId=${wid}&limit=8`, { headers: H })).json()).data || []
    const nueva = l.find((e) => !previos.has(e.id))
    if (nueva && !['running', 'waiting', 'new'].includes(nueva.status)) return (await (await fetch(`${N8N}/api/v1/executions/${nueva.id}?includeData=true`, { headers: H })).json())
  }
  return null
}

// ═══ PLANEACIÓN ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
const ESCRIBEN = ['Guardar el plan', 'Plan → Drive (PDF)', 'Cable de vuelta · sala', 'Cable de vuelta · repetida', 'BRIEF · sobre · pedir el parte a la sala (E-brief · CC#2)', '⑥ AVISO · #alertas', 'Campana · plan sin PDF']
const ARMAR_EXCLUSION = "for (let i = 0; i < pedidos.length; i++) pedidos[i].orden = i + 1;"
const EXCLUSION = "const __excl = ((($('Webhook · planeacion').first().json.body) || {}).excluir_brazos) || [];\nfor (let k = pedidos.length - 1; k >= 0; k--) { if (__excl.indexOf(pedidos[k].brazo) !== -1) pedidos.splice(k, 1); }\n"
function copiaDePlaneacion(base, nombre, path, posicionesViejas) {
  const f = JSON.parse(JSON.stringify({ name: nombre, nodes: base.nodes, connections: base.connections }))
  f.settings = Object.fromEntries(SETTINGS_OK.filter((k) => base.settings?.[k] !== undefined).map((k) => [k, base.settings[k]]))
  const wh = f.nodes.find((n) => n.name === 'Webhook · planeacion'); wh.parameters.path = path; wh.webhookId = path.replace(/[^a-z0-9]/gi, '-') + '-0001'
  for (const n of f.nodes.filter((x) => ESCRIBEN.includes(x.name))) n.parameters.url = SUMIDERO
  const el = f.nodes.find((n) => n.name === 'elegir brazos'); const crlf = el.parameters.jsCode.includes('\r\n')
  const js = el.parameters.jsCode.split('\r\n').join('\n')
  if (js.split(ARMAR_EXCLUSION).length !== 2) throw new Error('no encontré el punto para la exclusión en «elegir brazos»')
  el.parameters.jsCode = (crlf ? (x) => x.split('\n').join('\r\n') : (x) => x)(js.replace(ARMAR_EXCLUSION, () => EXCLUSION + ARMAR_EXCLUSION))
  if (posicionesViejas) { f.nodes.find((n) => n.name === 'El número de la casa').position = [660, 520]; f.nodes.find((n) => n.name === 'La referencia del producto').position = [660, 700] }
  return f
}
const COMBOS = []
for (const apify of [1, 0]) for (const posthog of [1, 0]) for (const cerebro of [1, 0]) COMBOS.push({ apify, posthog, cerebro, etiqueta: `${apify ? 'A' : '-'}${posthog ? 'P' : '-'}${cerebro ? 'C' : '-'}`, excluir: [!apify && 'apify', !posthog && 'posthog', !cerebro && 'cerebro'].filter(Boolean) })

async function planeacion() {
  const publicado = leer('planeacion-antes-orden-explicito-2026-09-30.json')
  const nuevo = leer('planeacion-construida-orden-explicito-2026-09-30.json')
  const variantes = [
    { id: 'A', nombre: 'viejo (sin cadena · dibujo original)', base: publicado, viejas: true, esperaFallarConTodas: true },
    { id: 'B', nombre: 'cadena + dibujo original malo', base: nuevo, viejas: true },
    { id: 'C', nombre: 'final (cadena · dibujo publicado)', base: nuevo, viejas: false },
  ]
  const resultados = {}
  await Promise.all(variantes.map(async (v) => {
    const path = `zero-risk/planeacion-orden-${v.id.toLowerCase()}-cc1`
    const wid = await crear(copiaDePlaneacion(v.base, `CC1 · orden de planeación ${v.id} TEMPORAL (NO BORRAR hasta que CC#3 certifique)`, path, v.viejas))
    resultados[v.id] = { workflow: wid, nombre: v.nombre, combos: {} }
    for (const c of COMBOS) {
      const d = await correr(wid, path, { client_id: CID, dry_run: true, forzar: true, excluir_brazos: c.excluir })
      if (!d) { resultados[v.id].combos[c.etiqueta] = { estado: 'no terminó' }; continue }
      fs.writeFileSync(join(salida, `planeacion-${v.id}-${c.etiqueta}-${d.id}.json`), JSON.stringify(d))
      const orden = ordenDeEjecucion(d.data.resultData.runData)
      const pos = (n) => (orden.find((x) => x.nodo === n) || {}).n || null
      const fila = {
        ejecucion: d.id, estado: d.status, error: d.data.resultData.error?.message?.slice(0, 60) || null,
        casa: pos('El número de la casa'), referencia: pos('La referencia del producto'), ficha: pos('Ficha del cliente'), junta: pos('Junta · esperar los 3 brazos'), armar: pos('armar el paquete'), seco: pos('⑤ Seco · lo que se habría escrito'),
      }
      fila.referencias_antes_de_la_junta = fila.junta ? !!(fila.casa && fila.referencia && fila.casa < fila.junta && fila.referencia < fila.junta) : null
      fila.escritores = ESCRIBEN.filter((n) => d.data.resultData.runData[n])
      resultados[v.id].combos[c.etiqueta] = fila
    }
    await apagar(wid)
  }))
  return resultados
}

// ═══ VIGÍA ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
async function vigia() {
  const construida = leer('vigia-construida-orden-explicito-2026-09-30.json')
  const escenarios = { normal: (f) => f, umbral_ilegible: (f) => { f.nodes.find((n) => n.name === 'El umbral del silencio').parameters.url = f.nodes.find((n) => n.name === 'El umbral del silencio').parameters.url.replace('sala.silencio_max_horas', 'sala.no_existe_cc1'); return f }, reloj_ilegible: (f) => { f.nodes.find((n) => n.name === 'El reloj de la sala').parameters.url = f.nodes.find((n) => n.name === 'El reloj de la sala').parameters.url.replace('z2nS8Up115EA9TKz', 'noExisteCC1000000'); return f } }
  const res = {}
  for (const [nombre, ajustar] of Object.entries(escenarios)) {
    const f = JSON.parse(JSON.stringify({ name: `CC1 · vigía orden ${nombre} TEMPORAL (NO BORRAR hasta que CC#3 certifique)`, nodes: construida.nodes, connections: construida.connections }))
    f.settings = Object.fromEntries(SETTINGS_OK.filter((k) => construida.settings?.[k] !== undefined).map((k) => [k, construida.settings[k]]))
    // el reloj de 6 h NO va en la copia; el aviso a Slack apunta a un sumidero; la puerta tiene otro path
    f.nodes = f.nodes.filter((n) => n.name !== 'Reloj · cada 6 horas'); delete f.connections['Reloj · cada 6 horas']
    const puerta = f.nodes.find((n) => n.name === 'Puerta · preguntar a pedido'); const path = `zero-risk/vigia-orden-${nombre.replace('_', '-')}-cc1`; puerta.parameters.path = path; puerta.webhookId = path.replace(/[^a-z0-9]/gi, '-') + '-0001'
    f.nodes.find((n) => n.name === 'AVISO · #alertas').parameters.url = SUMIDERO
    ajustar(f)
    const wid = await crear(f)
    // forzar_aviso:'true' ⇒ tiene que llegar al aviso (sumidero) sin gritar a Slack
    const d = await correr(wid, path, { forzar_aviso: 'true' }, 20)
    await apagar(wid)
    if (!d) { res[nombre] = { estado: 'no terminó' }; continue }
    fs.writeFileSync(join(salida, `vigia-${nombre}-${d.id}.json`), JSON.stringify(d))
    const rd = d.data.resultData.runData
    const orden = ordenDeEjecucion(rd)
    const dec = rd['[SALA] Vigía · decide']?.[0]?.data?.main?.[0]?.[0]?.json || {}
    res[nombre] = {
      workflow: wid, ejecucion: d.id, estado: d.status, error: d.data.resultData.error?.message?.slice(0, 80) || null,
      orden: orden.map((x) => x.nodo.slice(0, 26)).join(' → '),
      umbral_de_donde: dec.umbral_de_donde, reloj: dec.reloj, libro: dec.libro, estado_de_la_sala: dec.estado,
      aviso_a_slack_alcanzado_en_el_sumidero: !!rd['AVISO · #alertas'],
    }
  }
  return res
}

const informe = {}
if (solo !== 'vigia') informe.planeacion = await planeacion()
if (solo !== 'planeacion') informe.vigia = await vigia()
fs.writeFileSync(join(salida, 'resumen-ensayo-orden.json'), JSON.stringify(informe, null, 1))
if (informe.planeacion) {
  console.log('\nPLANEACIÓN · orden de ejecución (casa · referencia · ficha · junta · armar) por combinación [A=apify P=posthog C=cerebro llenos]')
  for (const [v, r] of Object.entries(informe.planeacion)) {
    console.log(`\n  ${v} · ${r.nombre}`)
    for (const [c, f] of Object.entries(r.combos)) console.log(`    ${c}  ${String(f.estado).padEnd(7)} casa=${f.casa} ref=${f.referencia} ficha=${f.ficha} junta=${f.junta} armar=${f.armar} seco=${f.seco} · ref_antes_de_junta=${f.referencias_antes_de_la_junta} · escritores=${JSON.stringify(f.escritores)}${f.error ? ' · ' + f.error : ''}`)
  }
}
if (informe.vigia) { console.log('\nVIGÍA'); for (const [k, r] of Object.entries(informe.vigia)) console.log(' ', k, JSON.stringify(r)) }
