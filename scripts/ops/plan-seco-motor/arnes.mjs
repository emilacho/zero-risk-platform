#!/usr/bin/env node
/**
 * DOBLE CHEQUEO EN SECO DEL PLAN · el servidor local que reemplaza a todo lo que está fuera de n8n · US$ 0 · sin red hacia afuera.
 * Lo llaman el n8n local y la plataforma local (`next dev` con variables que apuntan aquí). Tres cosas:
 *   · /rest/v1/*  base en memoria sembrada con una FOTO de solo lectura. Nunca habla con producción. No valida columnas (ver feedback: la base falsa no valida columnas).
 *   · /api/agents/run-sdk  corredor falso: mide el pedido, contesta con el molde del agente, y si trae callback_url devuelve la vuelta como el corredor real.
 *   · lo demás de fuera (Drive, Slack, sala, brazos con proveedor pago): simulado y rotulado.
 * Cada llamada queda en <salida>/traza.jsonl. Los fallos se provocan por escenario (`--escenario <archivo.json>`).
 *   node arnes.mjs --foto <foto.json> --salida <carpeta> [--puerto 4100] [--moldes <moldes.mjs>] [--escenario <archivo.json>]
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const PUERTO = Number(flag('--puerto', '4100'))
const SALIDA = flag('--salida', '.')
const FOTO = flag('--foto')
const ESCENARIO = flag('--escenario') ? JSON.parse(fs.readFileSync(flag('--escenario'), 'utf8')) : {}
const moldes = flag('--moldes') ? await import(pathToFileURL(path.resolve(flag('--moldes'))).href) : {}
fs.mkdirSync(SALIDA, { recursive: true })
const TRAZA = path.join(SALIDA, 'traza.jsonl')
const t0 = Date.now()
let n = 0
const anotar = (o) => fs.appendFileSync(TRAZA, JSON.stringify({ n: ++n, t_s: Math.round((Date.now() - t0) / 100) / 10, ...o }) + '\n')

// ── base en memoria ──────────────────────────────────────────────────────────
const tablas = new Map()
if (FOTO) for (const [t, filas] of Object.entries(JSON.parse(fs.readFileSync(FOTO, 'utf8')))) tablas.set(t, filas)
const tablasSinFoto = new Set()
const filasDe = (t) => { if (!tablas.has(t)) { tablasSinFoto.add(t); tablas.set(t, []) } return tablas.get(t) }

function valorDe(fila, col) {
  const m = col.match(/^([^-]+)((?:->>?[^-]+)*)$/)
  if (!m) return fila[col]
  let v = fila[m[1]]
  for (const paso of m[2].matchAll(/->>?([^-]+)/g)) {
    if (typeof v === 'string') { try { v = JSON.parse(v) } catch { /* texto */ } }
    v = v == null ? undefined : v[paso[1]]
  }
  return v
}
function cumple(fila, col, expr) {
  const v = valorDe(fila, col)
  let neg = false
  if (expr.startsWith('not.')) { neg = true; expr = expr.slice(4) }
  const i = expr.indexOf('.')
  const op = expr.slice(0, i), a = (() => { try { return decodeURIComponent(expr.slice(i + 1)) } catch { return expr.slice(i + 1) } })()
  const s = v === null || v === undefined ? null : typeof v === 'object' ? JSON.stringify(v) : String(v)
  let r
  switch (op) {
    case 'eq': r = s === a; break
    case 'neq': r = s !== a; break
    case 'is': r = a === 'null' ? s === null : a === 'true' ? v === true : a === 'false' ? v === false : false; break
    case 'in': r = a.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '')).includes(s); break
    case 'gt': r = s !== null && (Number(s) > Number(a) || (isNaN(Number(s)) && s > a)); break
    case 'gte': r = s !== null && (Number(s) >= Number(a) || (isNaN(Number(s)) && s >= a)); break
    case 'lt': r = s !== null && (Number(s) < Number(a) || (isNaN(Number(s)) && s < a)); break
    case 'lte': r = s !== null && (Number(s) <= Number(a) || (isNaN(Number(s)) && s <= a)); break
    case 'like': case 'ilike': { const re = new RegExp('^' + a.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*') + '$', op === 'ilike' ? 'i' : ''); r = s !== null && re.test(s); break }
    case 'cs': r = s !== null && s.includes(a.replace(/^[{[]|[}\]]$/g, '')); break
    default: r = true
  }
  return neg ? !r : r
}
function filtrar(filas, q) {
  let r = filas
  for (const [k, v] of q) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue
    if (k === 'or' || k === 'and') {
      const partes = v.replace(/^\(|\)$/g, '').split(',').map((p) => { const j = p.indexOf('.'); return [p.slice(0, j), p.slice(j + 1)] })
      r = r.filter((f) => (k === 'or' ? partes.some(([c, e]) => cumple(f, c, e)) : partes.every(([c, e]) => cumple(f, c, e))))
      continue
    }
    r = r.filter((f) => cumple(f, k, v))
  }
  return r
}
function ordenar(filas, q) {
  const o = q.get('order')
  if (!o) return filas
  const claves = o.split(',').map((x) => x.split('.'))
  return [...filas].sort((a, b) => {
    for (const [c, dir] of claves) {
      const va = valorDe(a, c), vb = valorDe(b, c)
      if (va === vb) continue
      const m = va == null ? 1 : vb == null ? -1 : va > vb ? 1 : -1
      return dir === 'desc' ? -m : m
    }
    return 0
  })
}
function proyectar(fila, select) {
  if (!select || select === '*') return fila
  const out = {}
  // separa por comas fuera de paréntesis (incrustaciones)
  const partes = []; let d = 0, cur = ''
  for (const ch of select) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { partes.push(cur); cur = '' } else cur += ch }
  if (cur) partes.push(cur)
  for (const p of partes) {
    const m = p.trim().match(/^(?:([^:]+):)?([^()]+?)(\(.*\))?$/)
    if (!m) continue
    const col = m[2].replace(/::\w+$/, '')
    if (col === '*') { Object.assign(out, fila); continue }
    const nombre = m[1] || col.split(/->>?/).pop()
    out[nombre] = valorDe(fila, col) ?? null
  }
  return out
}
const armarFila = (t, o) => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...o })

function postgrest(req, url, cuerpo, res) {
  const t = decodeURIComponent(url.pathname.replace('/rest/v1/', ''))
  const q = url.searchParams
  const prefer = String(req.headers.prefer || '')
  const accept = String(req.headers.accept || '')
  const quiereUno = accept.includes('vnd.pgrst.object')
  const manda = (status, data, extra = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...extra }); res.end(data === undefined ? '' : JSON.stringify(data)) }
  const responder = (filas, status) => {
    if (!prefer.includes('return=representation') && req.method !== 'GET' && req.method !== 'HEAD') return manda(status === 200 ? 204 : status)
    const sel = q.get('select')
    const pr = filas.map((f) => proyectar(f, sel))
    if (quiereUno) { if (pr.length !== 1) return manda(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `${pr.length} filas`, hint: null }); return manda(status, pr[0]) }
    manda(status, pr, { 'content-range': `0-${Math.max(pr.length - 1, 0)}/${pr.length}` })
  }
  if (t.startsWith('rpc/')) { anotar({ tipo: 'base', op: 'rpc', tabla: t, chars: JSON.stringify(cuerpo ?? '').length }); return manda(200, []) }
  if (req.method === 'GET' || req.method === 'HEAD') {
    const sinFotoAntes = !tablas.has(t)
    let r = ordenar(filtrar(filasDe(t), q), q)
    const off = Number(q.get('offset') || 0), lim = q.get('limit')
    r = r.slice(off, lim ? off + Number(lim) : undefined)
    anotar({ tipo: 'base', op: 'leer', tabla: t, filas: r.length, sin_foto: sinFotoAntes || undefined, q: url.search.slice(0, 180) })
    return responder(r, 200)
  }
  if (req.method === 'POST') {
    const lista = Array.isArray(cuerpo) ? cuerpo : [cuerpo]
    const filas = filasDe(t)
    const out = []
    const merge = prefer.includes('resolution=merge-duplicates')
    const claves = (q.get('on_conflict') || 'id').split(',')
    for (const o of lista) {
      const previa = merge ? filas.find((f) => claves.every((c) => o[c] !== undefined && String(f[c]) === String(o[c]))) : null
      if (previa) { Object.assign(previa, o); out.push(previa) } else { const f = armarFila(t, o); filas.push(f); out.push(f) }
    }
    anotar({ tipo: 'base', op: 'escribir', tabla: t, filas: out.length, chars: JSON.stringify(cuerpo ?? '').length })
    return responder(out, 201)
  }
  if (req.method === 'PATCH') {
    const r = filtrar(filasDe(t), q)
    for (const f of r) Object.assign(f, cuerpo)
    anotar({ tipo: 'base', op: 'cambiar', tabla: t, filas: r.length, campos: Object.keys(cuerpo || {}).slice(0, 12), q: url.search.slice(0, 120) })
    return responder(r, 200)
  }
  if (req.method === 'DELETE') {
    const r = filtrar(filasDe(t), q)
    tablas.set(t, filasDe(t).filter((f) => !r.includes(f)))
    anotar({ tipo: 'base', op: 'borrar', tabla: t, filas: r.length })
    return responder(r, 200)
  }
  manda(405, { message: 'metodo' })
}

// ── corredor falso ───────────────────────────────────────────────────────────
const intentosPorPaso = new Map()
const puntosDeControl = new Map()
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
async function runSdk(cuerpo, res) {
  // El freno REAL de la plataforma (src/lib/run-sdk-spend-gate.ts · run-sdk L1002), que aquí la ruta falsa reemplaza: mismo orden (por corrida, luego cliente/24 h), mismo 429, sin gasto. Solo con el escenario `freno`.
  if (ESCENARIO.freno) {
    const filas = filasDe('agent_invocations').filter((x) => x.client_id === cuerpo.client_id)
    const gastado = filas.reduce((a, x) => a + (Number(x.cost_usd) || 0), 0)
    const deCorrida = filas.filter((x) => String(x.workflow_execution_id ?? '') === String(cuerpo.workflow_execution_id ?? '')).reduce((a, x) => a + (Number(x.cost_usd) || 0), 0)
    // la vara por plan (#928 61caf1b): suma lo rotulado con esa corrida, sin ventana; el paso 0 ni suma ni se frena aquí
    const fueraDelPlan = (p) => typeof p === 'string' && (p.startsWith('analisis-') || p === 'informe-mercado')
    const delPlan = cuerpo.trabajo_tipo === 'plan' && cuerpo.trabajo_id && !fueraDelPlan(cuerpo.paso) ? filas.filter((x) => x.trabajo_tipo === 'plan' && x.trabajo_id === cuerpo.trabajo_id && !fueraDelPlan(x.paso)).reduce((a, x) => a + (Number(x.cost_usd) || 0), 0) : 0
    const razon = deCorrida >= (ESCENARIO.freno.por_corrida ?? 5) ? 'run_over_cap' : gastado >= ESCENARIO.freno.cliente ? 'over_cap' : ESCENARIO.freno.plan !== undefined && cuerpo.trabajo_tipo === 'plan' && !fueraDelPlan(cuerpo.paso) && delPlan + (ESCENARIO.freno.ya_gastado ?? 0) >= ESCENARIO.freno.plan ? 'plan_over_cap' : null
    if (razon) {
      anotar({ tipo: 'freno_429', razon, agente: cuerpo.agent, paso: cuerpo.paso || cuerpo.step_name || null, gastado, de_corrida: deCorrida })
      res.writeHead(429, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ error: 'cost_cap_exceeded', code: 'E-CAP-150', cap_usd: ESCENARIO.freno.cliente, spent_usd: gastado, detail: 'freno simulado' }))
    }
  }
  const clave = `${cuerpo.workflow_execution_id || ''}|${cuerpo.paso || cuerpo.step_name || cuerpo.agent}`
  const intento = (intentosPorPaso.get(clave) || 0) + 1
  intentosPorPaso.set(clave, intento)
  const pasoDelPedido = cuerpo.paso || cuerpo.step_name || null
  // para comprobar qué recibió cada empleado: el pedido entero, solo en la carpeta del caso
  if (ESCENARIO.guardar_pedidos) fs.appendFileSync(path.join(SALIDA, 'pedidos.jsonl'), JSON.stringify({ agente: cuerpo.agent, paso: pasoDelPedido, tarea: cuerpo.task }) + '\n')
  const claveDelPunto = `${cuerpo.workflow_id}|${cuerpo.client_id}|${cuerpo.step_name || cuerpo.agent}`
  const reusa = !cuerpo.force_restart && cuerpo.workflow_id && cuerpo.client_id && puntosDeControl.has(claveDelPunto)
  // el corredor falló sin hacer nada: ni cobra ni deja punto de control
  const antes = (ESCENARIO.corredor_cae || []).find((x) => x.paso === pasoDelPedido && (x.intentos || [1]).includes(intento))
  if (antes) { anotar({ tipo: 'corredor_cae', paso: pasoDelPedido, intento, status: antes.status || 502 }); if (antes.status === 'red') return res.destroy(); res.writeHead(antes.status || 502, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: 'agent-runner upstream failed', upstream_status: 503 })) }
  // CC6/CC7, 05-nov · el empleado termina y falla: el corredor deja su fila «en curso» para siempre y contesta 500 con su error
  const falla = (ESCENARIO.empleado_falla || []).find((x) => x.paso === pasoDelPedido && (x.intentos || [1]).includes(intento))
  if (falla) {
    const lista = filasDe('workflow_checkpoints'), paso = cuerpo.step_name || cuerpo.agent
    const ya = lista.find((x) => x.workflow_id === cuerpo.workflow_id && x.client_id === cuerpo.client_id && x.step_name === paso)
    if (ya) { ya.step_status = 'in_progress'; ya.updated_at = new Date().toISOString() } else lista.push(armarFila('workflow_checkpoints', { workflow_id: cuerpo.workflow_id, workflow_execution_id: String(cuerpo.workflow_execution_id), client_id: cuerpo.client_id, step_name: paso, step_status: 'in_progress', output_ref: null, updated_at: new Date().toISOString() }))
    anotar({ tipo: 'empleado_falla', paso: pasoDelPedido, intento, tope: !!falla.tope, force_restart: !!cuerpo.force_restart })
    res.writeHead(500, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ success: false, error: falla.tope ? 'error_max_budget_usd · el empleado alcanzó el tope de gasto de la corrida y se DETUVO' : 'el proveedor del modelo devolvió un error' }))
  }
  // la conexión se cae pero el empleado sigue trabajando: su punto de control queda «en curso» N s y luego termina
  const sigue = ESCENARIO.sigue_en_vuelo && ESCENARIO.sigue_en_vuelo.paso === pasoDelPedido && intento === 1 ? ESCENARIO.sigue_en_vuelo : null
  if (sigue) {
    const fila = armarFila('workflow_checkpoints', { workflow_id: cuerpo.workflow_id, workflow_execution_id: String(cuerpo.workflow_execution_id), client_id: cuerpo.client_id, step_name: cuerpo.step_name || cuerpo.agent, step_status: 'in_progress', output_ref: null, updated_at: new Date().toISOString() })
    filasDe('workflow_checkpoints').push(fila)
    anotar({ tipo: 'sigue_en_vuelo', paso: pasoDelPedido, s: sigue.s })
    res.writeHead(502, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'agent-runner upstream failed', upstream_status: 503 }))
    const costoLento = Number((ESCENARIO.costo || {})['*'] ?? 0)
    await dormir(sigue.s * 1000)
    if (costoLento > 0) filasDe('agent_invocations').push(armarFila('agent_invocations', { agent_name: cuerpo.agent, client_id: cuerpo.client_id, cost_usd: costoLento, trabajo_tipo: cuerpo.trabajo_tipo ?? null, trabajo_id: cuerpo.trabajo_id ?? null, started_at: new Date().toISOString(), workflow_id: cuerpo.workflow_id, workflow_execution_id: cuerpo.workflow_execution_id, paso: pasoDelPedido }))
    const textoLento = typeof moldes.responder === 'function' ? await moldes.responder(cuerpo, { intento, tablas }) : ''
    puntosDeControl.set(claveDelPunto, textoLento)
    fila.step_status = 'completed'; fila.updated_at = new Date().toISOString()
    anotar({ tipo: 'agente', agente: cuerpo.agent, paso: pasoDelPedido, intento, trabajo_tipo: cuerpo.trabajo_tipo ?? null, trabajo_id: cuerpo.trabajo_id ?? null, termino_tarde: true })
    return
  }
  // costo SIMULADO (no sale plata): lo que el escenario diga por paso o «*». Se escribe en el libro en memoria como lo hace el corredor, para que los topes y frenos reales lo vean.
  const pasoCosto = String(cuerpo.paso || cuerpo.step_name || '')
  const costoSim = reusa ? 0 : Number((ESCENARIO.costo || {})[pasoCosto] ?? (ESCENARIO.costo || {})[cuerpo.agent] ?? (ESCENARIO.costo || {})['*'] ?? 0)
  if (costoSim > 0) filasDe('agent_invocations').push(armarFila('agent_invocations', { agent_name: cuerpo.agent, client_id: cuerpo.client_id, cost_usd: costoSim, trabajo_tipo: cuerpo.trabajo_tipo ?? null, trabajo_id: cuerpo.trabajo_id ?? null, started_at: new Date().toISOString(), workflow_id: cuerpo.workflow_id, workflow_execution_id: String(cuerpo.workflow_execution_id || ''), status: 'simulado', paso: pasoCosto }))
  const demoraSim = Number((ESCENARIO.demora_s || {})[pasoCosto] ?? 0)
  if (demoraSim > 0 && !cuerpo.callback_url) await dormir(demoraSim * 1000)
  // La regla real de reuso del corredor (services/agent-runner · shouldSkipStep): con punto de control completo para (flujo, cliente, paso o agente) y SIN force_restart, devuelve lo guardado a US$ 0.
  const claveReuso = `${cuerpo.workflow_id}|${cuerpo.client_id}|${cuerpo.step_name || cuerpo.agent}`
  const guardado = !cuerpo.force_restart && cuerpo.workflow_id && cuerpo.client_id ? puntosDeControl.get(claveReuso) : undefined
  if (guardado !== undefined) anotar({ tipo: 'reuso_del_punto_de_control', agente: cuerpo.agent, paso: cuerpo.paso || cuerpo.step_name || null, chars: String(guardado).length })
  const texto = guardado !== undefined ? guardado : typeof moldes.responder === 'function' ? await moldes.responder(cuerpo, { intento, tablas }) : `[SECO] respuesta simulada de ${cuerpo.agent}`
  if (cuerpo.workflow_id && cuerpo.client_id) puntosDeControl.set(claveReuso, texto)
  const reg = { tipo: 'agente', trabajo_tipo: cuerpo.trabajo_tipo ?? cuerpo.context?.trabajo_tipo ?? null, trabajo_id: cuerpo.trabajo_id ?? cuerpo.context?.trabajo_id ?? null, agente: cuerpo.agent, paso: cuerpo.paso || cuerpo.step_name || null, intento, chars_entrada: String(cuerpo.task || '').length, chars_salida: String(texto).length, tope_usd: cuerpo.max_budget_usd ?? null, dry_run: cuerpo.dry_run ?? null, force_restart: cuerpo.force_restart ?? null, con_vuelta: !!cuerpo.callback_url, trabajo: cuerpo.trabajo_tipo ? `${cuerpo.trabajo_tipo}:${cuerpo.trabajo_id}` : null, ejecucion: cuerpo.workflow_execution_id ?? null }
  const f = (ESCENARIO.fallar_agente || []).find((x) => (x.agente === cuerpo.agent || x.paso === reg.paso) && (x.intentos || [1]).includes(intento))
  // la corrida muere mientras este empleado trabaja (el barrido la cerró, por ejemplo)
  if (ESCENARIO.matar_corrida_tras === cuerpo.agent || ESCENARIO.matar_corrida_tras === reg.paso) { for (const c of filasDe('plan_corridas')) c.estado = ESCENARIO.matar_corrida_como || 'fallida'; anotar({ tipo: 'corrida_muerta_provocada', agente: cuerpo.agent, estado: ESCENARIO.matar_corrida_como || 'fallida' }) }
  const puntoDeControl = () => filasDe('workflow_checkpoints').push(armarFila('workflow_checkpoints', { workflow_id: cuerpo.workflow_id, workflow_execution_id: String(cuerpo.workflow_execution_id), client_id: cuerpo.client_id, step_name: cuerpo.step_name || cuerpo.agent, step_status: 'completed', output_ref: { response: texto, response_truncated: false } }))
  // corte de conexión con el empleado trabajando: sin acuse, y su texto aparece N s después
  const corte = (ESCENARIO.corte_y_termina_s || {})[reg.paso]
  if (corte !== undefined && cuerpo.callback_url) { anotar({ ...reg, fallo_provocado: 'corte_y_termina', en_s: corte }); res.destroy(); await dormir(corte * 1000); puntoDeControl(); anotar({ tipo: 'punto_de_control_tarde', agente: cuerpo.agent }); return }
  // aceptado, sin vuelta por cable, y su texto aparece N s después
  const tarde = (ESCENARIO.termina_tarde_s || {})[reg.paso]
  if (tarde !== undefined && cuerpo.callback_url) { anotar({ ...reg, termina_en_s: tarde }); res.writeHead(202, { 'content-type': 'application/json' }); res.end(JSON.stringify({ accepted: true, delivered_by: 'runner', dispatch_key: crypto.randomUUID(), ack_timestamp: new Date().toISOString() })); await dormir(tarde * 1000); puntoDeControl(); anotar({ tipo: 'punto_de_control_tarde', agente: cuerpo.agent }); return }
  if (f && f.status === 'red') { anotar({ ...reg, fallo_provocado: 'red' }); return res.destroy() }
  // con latido, lo que tardó llega en 200 con su código verdadero en el cuerpo
  if (f && f.en_cuerpo) { anotar({ ...reg, fallo_provocado: f.status || 500, en_cuerpo: true }); res.writeHead(200, { 'content-type': 'application/json' }); return res.end('\n\n' + JSON.stringify({ error: 'agent-runner upstream failed', estado_http: f.status || 500 })) }
  if (f) { anotar({ ...reg, fallo_provocado: f.status || 500 }); res.writeHead(f.status || 500, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ...((f.status || 500) === 500 ? { success: false, error: 'fallo provocado' } : { error: 'agent-runner upstream failed' }), cost_usd: f.costo_usd ?? 0 })) }
  anotar(reg)
  if (cuerpo.callback_url) {
    res.writeHead(202, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ accepted: true, delivered_by: 'runner', dispatch_key: crypto.randomUUID(), ack_timestamp: new Date().toISOString() }))
    // igual que el corredor: guarda el punto de control y LUEGO llama a la vuelta
    filasDe('workflow_checkpoints').push(armarFila('workflow_checkpoints', { workflow_id: cuerpo.workflow_id, workflow_execution_id: String(cuerpo.workflow_execution_id), client_id: cuerpo.client_id, step_name: cuerpo.step_name || cuerpo.agent, step_status: 'completed', output_ref: { response: texto, response_truncated: false } }))
    const espera = (ESCENARIO.demora_vuelta_s || {})[cuerpo.agent] ?? 1
    if ((ESCENARIO.sin_vuelta || []).includes(cuerpo.agent)) { anotar({ tipo: 'agente_sin_vuelta', agente: cuerpo.agent }); return }
    await dormir(espera * 1000)
    const url = String(cuerpo.callback_url).replace('https://n8n-production-72be.up.railway.app', process.env.N8N_LOCAL_URL || 'http://localhost:5678')
    // como src/lib/agent-async-callback: 3 intentos, separados 2 s y 4 s. Si n8n no está, la vuelta se pierde igual que en producción.
    const cuerpoVuelta = JSON.stringify({ success: true, agent: cuerpo.agent, response: ESCENARIO.vuelta_sin_texto ? undefined : texto, cost_usd: costoSim, delivered_by: 'runner' })
    for (const [i, pausa] of [0, 2000, 4000].entries()) {
      await dormir(pausa)
      try {
        const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: cuerpoVuelta })
        anotar({ tipo: 'vuelta', agente: cuerpo.agent, status: r.status, intento: i + 1, url: url.split('/').slice(0, -1).join('/') + '/…' })
        if (r.ok) break
      } catch (e) { anotar({ tipo: 'vuelta_fallida', agente: cuerpo.agent, intento: i + 1, error: String(e?.message || e) }) }
    }
    return
  }
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ success: true, output: texto, cost_usd: costoSim, usage: { cost_usd: costoSim } }))
}

// ── servidor ─────────────────────────────────────────────────────────────────
const simulados = (typeof moldes.rutas === 'object' && moldes.rutas) || {}
const srv = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PUERTO}`)
  const trozos = []
  for await (const c of req) trozos.push(c)
  const crudo = Buffer.concat(trozos).toString('utf8')
  let cuerpo = null
  try { cuerpo = crudo ? JSON.parse(crudo) : null } catch { cuerpo = crudo }
  try {
    if (url.pathname === '/__apagar') { res.end('ok'); setTimeout(() => process.exit(0), 50); return }
    if (url.pathname === '/__estado') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ tablas_sin_foto: [...tablasSinFoto], filas: Object.fromEntries([...tablas].map(([k, v]) => [k, v.length])) })) }
    if (url.pathname === '/__tabla') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(tablas.get(url.searchParams.get('t')) || [])) }
    if (url.pathname.startsWith('/rest/v1/')) return postgrest(req, url, cuerpo, res)
    if (url.pathname === '/api/agents/run-sdk') return await runSdk(cuerpo, res)
    // la pregunta del barrido a n8n: contesta lo que de verdad hay en la base del n8n local
    if (url.pathname === '/api/v1/executions') {
      const { DatabaseSync } = await import('node:sqlite')
      const db = new DatabaseSync(process.env.SECO_RAIZ + '/n8n-datos/.n8n/database.sqlite', { readOnly: true })
      const data = db.prepare('select id from execution_entity where workflowId = ? and status = ? limit 1').all(url.searchParams.get('workflowId'), url.searchParams.get('status'))
      db.close()
      anotar({ tipo: 'pregunta_a_n8n', status: url.searchParams.get('status'), filas: data.length })
      res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ data }))
    }
    // la pausa falla de verdad si el caso lo pide
    if (url.pathname === '/__pausar') {
      const h = {}; for (const [k, v] of Object.entries(req.headers)) if (!['host', 'content-length', 'connection'].includes(k)) h[k] = v
      if (ESCENARIO.pausa_falla) { anotar({ tipo: 'pausa_fallida_provocada' }); res.writeHead(500, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: 'fallo provocado' })) }
      const rr = await fetch('http://localhost:4200/api/finanzas/pausar', { method: req.method, headers: h, body: crudo })
      res.writeHead(rr.status, { 'content-type': 'application/json' }); return res.end(await rr.text())
    }
    // la mesa pasa por aquí para provocarle cortes: antes de entrar, soltando el turno en marcha, o colgando la conexión
    // abrir la mesa también pasa por el arnés: sus cortes se provocan aparte, para no mover la cuenta de los turnos
    if (url.pathname === '/__mesa_abrir') {
      globalThis.__llamadasAbrir = (globalThis.__llamadasAbrir || 0) + 1
      const n = globalThis.__llamadasAbrir, f = ESCENARIO.abrir_falla
      const toca = f && n <= f.veces
      const h = {}; for (const [k, v] of Object.entries(req.headers)) if (!['host', 'content-length', 'connection'].includes(k)) h[k] = v
      anotar({ tipo: 'abrir_llamada', n, provocado: toca ? (f.status || 504) : null })
      if (toca) { res.writeHead(f.status || 504, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: 'corte provocado al abrir' })) }
      const rr = await fetch('http://localhost:4200/api/planeacion/mesa', { method: req.method, headers: h, body: crudo })
      res.writeHead(rr.status, { 'content-type': 'application/json' }); return res.end(await rr.text())
    }
    if (url.pathname === '/__mesa') {
      globalThis.__llamadasMesa = (globalThis.__llamadasMesa || 0) + 1
      const n = globalThis.__llamadasMesa, f = ESCENARIO.mesa_falla
      const toca = f && n >= f.desde && n < f.desde + f.veces
      const h = {}; for (const [k, v] of Object.entries(req.headers)) if (!['host', 'content-length', 'connection'].includes(k)) h[k] = v
      const seguir = () => fetch('http://localhost:4200/api/planeacion/mesa', { method: req.method, headers: h, body: crudo })
      anotar({ tipo: 'mesa_llamada', n, provocado: toca ? f.modo : null })
      if (toca && f.modo === 'corte') { req.socket.destroy(); return }
      if (toca && f.modo === 'suelta') seguir().catch(() => undefined)
      if (toca) { res.writeHead(f.status || 504, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: 'corte provocado' })) }
      const rr = await seguir()
      res.writeHead(rr.status, { 'content-type': 'application/json' }); return res.end(await rr.text())
    }
    // la plataforma llega a n8n por el arnés: lo que despierta un flujo sigue de verdad al n8n local
    if (url.pathname.startsWith('/webhook')) {
      const h = {}; for (const [k, v] of Object.entries(req.headers)) if (!['host', 'content-length', 'connection'].includes(k)) h[k] = v
      const rr = await fetch('http://localhost:5678' + url.pathname + url.search, { method: req.method, headers: h, body: req.method === 'GET' ? undefined : crudo })
      anotar({ tipo: 'despertar_n8n', ruta: url.pathname, status: rr.status })
      res.writeHead(rr.status, { 'content-type': rr.headers.get('content-type') || 'application/json' }); return res.end(await rr.text())
    }
    const ruta = simulados[url.pathname]
    const salida = ruta ? await ruta(cuerpo, { tablas, url }) : { status: 200, cuerpo: { ok: true, simulado: true } }
    anotar({ tipo: 'simulado', metodo: req.method, ruta: url.pathname, chars: crudo.length, con_molde: !!ruta, status: salida.status, ...(url.pathname.includes('slack') ? { texto: String(cuerpo?.text ?? '').slice(0, 300), canal: cuerpo?.channel ?? null } : {}) })
    res.writeHead(salida.status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(salida.cuerpo))
  } catch (e) {
    anotar({ tipo: 'error_arnes', ruta: url.pathname, error: String(e && e.stack || e).slice(0, 400) })
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: String(e) }))
  }
})
srv.listen(PUERTO, () => console.log(`arnes en ${PUERTO} · traza ${TRAZA}`))
