#!/usr/bin/env node
/**
 * J8b · CABECERA DEL EDITOR + RETIRAR LO DE JULIO · guion ejecutable · CC#1 · 14-oct · diseño v4 §9 y §11.2. NO SE EJECUTA todavía (va después de J8a y del seco).
 * SIN `--aplicar` cada orden solo IMPRIME lo que haría (las de lectura leen). Cada paso exige: n8n con 0 corriendo y 0 esperando, respaldo hecho y, en los flujos, `diferencia` (vivo = respaldo). Nunca imprime una llave.
 *
 *   node scripts/ops/jefatura-j8b.mjs plan                                         los pasos y su reversa · sin red
 *   node scripts/ops/jefatura-j8b.mjs respaldar --carpeta <fuera de la bóveda> [--aplicar]
 *   node scripts/ops/jefatura-j8b.mjs paso cabecera|voto|contenido|pendientes --carpeta <la del respaldo> [--aplicar]
 *   node scripts/ops/jefatura-j8b.mjs comprobar --carpeta <la del respaldo>        lee y compara (solo lectura)
 *
 * Los respaldos con texto de piezas (las `editor_escalation`) van FUERA de la bóveda de secretos; el guion se niega a escribirlos dentro. El cimiento (3 filas) y `grade-cimiento` no se tocan: se comparan.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { conCabeceraDelEditor, dentroDeLaBoveda, FLUJO_OFICINA, FLUJO_VOTO, pasosDeJ8b, planDeFilasDeContenido, planDePendientes, referenciasA } from './jefatura-j8b/nucleo.mjs'

const A = process.argv.slice(2)
const orden = A[0]
const flag = (n) => { const i = A.indexOf('--' + n); return i >= 0 ? A[i + 1] : null }
const aplicar = A.includes('--aplicar')
const carpeta = flag('carpeta')
const U = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''), SK = process.env.SUPABASE_SERVICE_ROLE_KEY
const N8N = (process.env.N8N_BASE_URL || 'https://n8n-production-72be.up.railway.app').replace(/\/$/, ''), NK = process.env.N8N_API_KEY
const necesita = (...ks) => { const f = ks.filter((k) => !process.env[k]); if (f.length) { console.error('faltan variables: ' + f.join(', ')); process.exit(2) } }
const HS = () => ({ apikey: SK, authorization: 'Bearer ' + SK, 'content-type': 'application/json' })
const HN = () => ({ 'X-N8N-API-KEY': NK, 'content-type': 'application/json' })
const rest = async (tabla, q = '', init = {}) => { const r = await fetch(`${U}/rest/v1/${tabla}?${q}`, { headers: { ...HS(), ...(init.prefer ? { prefer: init.prefer } : {}) }, method: init.method, body: init.body }); const t = await r.text(); let j; try { j = JSON.parse(t) } catch { j = t } if (!r.ok) throw new Error(`${tabla} ${r.status}: ${String(t).slice(0, 200)}`); return j }
const huella = (s) => crypto.createHash('sha256').update(s).digest('hex')
const paso = (t) => console.log((aplicar ? '▶ ' : '· (solo se imprime) ') + t)
const archivo = (n) => path.join(carpeta, n)
const F_OFICINA = () => archivo(`respaldo-flujo-${FLUJO_OFICINA}.json`), F_VOTO = () => archivo(`respaldo-flujo-${FLUJO_VOTO}.json`)

async function enVuelo() {
  let n = 0
  for (const st of ['running', 'waiting']) {
    const j = await (await fetch(`${N8N}/api/v1/executions?status=${st}&limit=50`, { headers: HN() })).json()
    if (!Array.isArray(j.data)) throw new Error('no se pudo leer n8n (se trata como «hay corridas»)')
    n += j.data.length
  }
  return n
}
const flujo = async (id) => { const r = await fetch(`${N8N}/api/v1/workflows/${id}`, { headers: HN() }); if (!r.ok) throw new Error(`flujo ${id}: ${r.status}`); return r.json() }
const herramienta = (...args) => spawnSync(process.execPath, ['scripts/ops/n8n-flujo.mjs', ...args], { encoding: 'utf8', env: process.env })
function exigirCarpeta(escribe) {
  if (!carpeta) { console.error('falta --carpeta (la del respaldo)'); process.exit(2) }
  if (dentroDeLaBoveda(carpeta)) { console.error('la carpeta está dentro de la bóveda de secretos: los respaldos con texto de piezas van FUERA'); process.exit(2) }
  if (escribe) fs.mkdirSync(carpeta, { recursive: true })
}
async function precondiciones() {
  const v = await enVuelo()
  if (v !== 0) { console.error(`se detiene: n8n tiene ${v} ejecución(es) corriendo o esperando (debe haber 0)`); process.exit(3) }
}
/** el vivo debe ser IGUAL al respaldo (si otro CC lo cambió debajo, no se pisa) */
function iguales(id, ruta) {
  const r = herramienta('diferencia', id, ruta)
  if (r.status !== 0) { console.error(`se detiene: el flujo ${id} vivo NO es igual a su respaldo (otro cambio debajo):\n${r.stdout}`); process.exit(4) }
}

async function main() {
  if (!orden || orden === 'plan') {
    console.log('J8b · lo que se hace (en este orden) y cómo se deshace')
    pasosDeJ8b().forEach((p, i) => console.log(`  ${i + 1}. [${p.paso}] ${p.que}\n       reversa: ${p.reversa}`))
    console.log('\nAhora no se ha tocado nada.')
    return
  }
  necesita('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'N8N_API_KEY')
  if (orden === 'respaldar') {
    exigirCarpeta(aplicar)
    paso(`respaldar en ${carpeta}: flujo ${FLUJO_OFICINA}, flujo ${FLUJO_VOTO}, filas de jefatura_grading_policies, filas editor_escalation`)
    if (!aplicar) return
    for (const [id, ruta] of [[FLUJO_OFICINA, F_OFICINA()], [FLUJO_VOTO, F_VOTO()]]) { const r = herramienta('respaldar', id, ruta); console.log(r.stdout.trim() || r.stderr.trim()); if (r.status !== 0) process.exit(5) }
    const pol = JSON.stringify(await rest('jefatura_grading_policies', 'select=*&order=artifact_type.asc'), null, 2)
    fs.writeFileSync(archivo('respaldo-politicas.json'), pol); console.log('políticas · sha256', huella(pol))
    const esc = JSON.stringify(await rest('hitl_pending_approvals', 'select=*&approval_type=eq.editor_escalation'), null, 2)
    fs.writeFileSync(archivo('respaldo-editor-escalation.json'), esc); console.log('editor_escalation · sha256', huella(esc))
    return
  }
  if (orden === 'comprobar') {
    exigirCarpeta(false)
    const pol = await rest('jefatura_grading_policies', 'select=*&order=artifact_type.asc')
    const resp = JSON.parse(fs.readFileSync(archivo('respaldo-politicas.json'), 'utf8'))
    const cim = (xs) => JSON.stringify(xs.filter((f) => ['brand_book', 'icp', 'competitive'].includes(f.artifact_type)))
    console.log('cimiento idéntico al respaldo:', cim(pol) === cim(resp))
    console.log('filas de contenido ahora:', JSON.stringify(pol.filter((f) => f.artifact_class === 'contenido').map((f) => [f.artifact_type, f.is_active])))
    const of = await flujo(FLUJO_OFICINA), vo = await flujo(FLUJO_VOTO)
    console.log(`oficina: activa=${of.active} · cabecera en el agente: ${JSON.stringify(of.nodes.find((n) => n.name === '② Agente (run-sdk)')?.parameters?.headerParameters?.parameters?.map((h) => h.name))}`)
    console.log(`voto: activo=${vo.active}`)
    console.log('editor_escalation abiertas:', (await rest('hitl_pending_approvals', 'select=item_id&approval_type=eq.editor_escalation&status=in.(pending,notified,escalated)')).length)
    return
  }
  if (orden === 'paso') {
    const cual = A[1]
    exigirCarpeta(false)
    await precondiciones()
    if (cual === 'cabecera') {
      iguales(FLUJO_OFICINA, F_OFICINA())
      const resp = JSON.parse(fs.readFileSync(F_OFICINA(), 'utf8'))
      const nuevo = conCabeceraDelEditor(resp)
      paso(`PUT del flujo ${FLUJO_OFICINA} con x-skip-editor-middleware: 1 en «② Agente (run-sdk)» (${nuevo.nodes.length} nodos; no cambia si está activo)`)
      if (!aplicar) return
      const r = await fetch(`${N8N}/api/v1/workflows/${FLUJO_OFICINA}`, { method: 'PUT', headers: HN(), body: JSON.stringify({ name: nuevo.name, nodes: nuevo.nodes, connections: nuevo.connections, settings: nuevo.settings }) })
      if (!r.ok) throw new Error(`PUT ${r.status}: ${(await r.text()).slice(0, 200)}`)
      const despues = await flujo(FLUJO_OFICINA)
      console.log('activo (no se toca):', despues.active, '· cabecera puesta:', despues.nodes.find((n) => n.name === '② Agente (run-sdk)').parameters.headerParameters.parameters.some((h) => h.name === 'x-skip-editor-middleware'))
      return
    }
    if (cual === 'voto') {
      iguales(FLUJO_VOTO, F_VOTO())
      const lista = (await (await fetch(`${N8N}/api/v1/workflows?limit=250`, { headers: HN() })).json()).data ?? []
      const todos = []
      for (const w of lista) todos.push(await flujo(w.id))
      const refs = referenciasA(todos, FLUJO_VOTO)
      if (refs.length) { console.error('se detiene: el voto TIENE referencias:', JSON.stringify(refs)); process.exit(6) }
      paso(`desactivar ${FLUJO_VOTO} (sin referencias en ${todos.length} flujos; no se borra)`)
      if (!aplicar) return
      const r = await fetch(`${N8N}/api/v1/workflows/${FLUJO_VOTO}/deactivate`, { method: 'POST', headers: HN() })
      if (!r.ok) throw new Error(`deactivate ${r.status}`)
      console.log('activo ahora:', (await flujo(FLUJO_VOTO)).active)
      return
    }
    if (cual === 'contenido') {
      const filas = await rest('jefatura_grading_policies', 'select=*&order=artifact_type.asc')
      const resp = JSON.parse(fs.readFileSync(archivo('respaldo-politicas.json'), 'utf8'))
      if (JSON.stringify(filas) !== JSON.stringify(resp)) { console.error('se detiene: la tabla de políticas ya no es igual al respaldo'); process.exit(4) }
      const plan = planDeFilasDeContenido(filas)
      paso(`UPDATE jefatura_grading_policies SET is_active=false WHERE ${plan.filtro} → ${plan.tipos.join(', ') || '(ya estaban apagadas)'} · cimiento intacto: ${plan.cimiento.join(', ')}`)
      if (!aplicar || !plan.tipos.length) return
      const hechas = await rest('jefatura_grading_policies', plan.filtro, { method: 'PATCH', body: JSON.stringify(plan.cuerpo), prefer: 'return=representation' })
      console.log('filas cambiadas:', hechas.map((f) => `${f.artifact_type}=${f.is_active}`).join(', '))
      const despues = await rest('jefatura_grading_policies', 'select=*&order=artifact_type.asc')
      const cim = (xs) => JSON.stringify(xs.filter((f) => ['brand_book', 'icp', 'competitive'].includes(f.artifact_type)))
      console.log('cimiento idéntico:', cim(despues) === cim(resp))
      return
    }
    if (cual === 'pendientes') {
      const filas = await rest('hitl_pending_approvals', 'select=*&approval_type=eq.editor_escalation')
      const plan = planDePendientes(filas, { ahora: new Date().toISOString() })
      if (!fs.existsSync(archivo('respaldo-editor-escalation.json'))) { console.error('se detiene: falta el respaldo de las editor_escalation (paso «respaldar»)'); process.exit(4) }
      paso(`marcar expired ${plan.por_cerrar.length} editor_escalation abierta(s) de ${plan.total_editor_escalation} (ya cerradas ${plan.ya_cerradas}; filas de otros tipos que NO se tocan: se filtra solo por approval_type)`)
      if (!aplicar || !plan.por_cerrar.length) return
      const hechas = await rest('hitl_pending_approvals', plan.filtro, { method: 'PATCH', body: JSON.stringify(plan.cuerpo), prefer: 'return=representation' })
      console.log('cerradas:', hechas.length)
      return
    }
    console.error('paso desconocido: ' + cual); process.exit(2)
  }
  console.error('orden desconocida: ' + orden); process.exit(2)
}
await main()
await new Promise((r) => setTimeout(r, 100))
