#!/usr/bin/env node
/**
 * J8b · CABECERA DEL EDITOR + RETIRAR LO DE JULIO · CLI · CC#1 · 14-oct · diseño v4 §9 y §11.2. NO SE EJECUTA todavía (va después de J8a, del seco y de la certificación).
 * SIN `--aplicar` cada orden solo IMPRIME lo que haría (las de lectura leen). Cada paso exige: n8n con 0 corriendo y 0 esperando, respaldo hecho y, en los flujos, `diferencia` (vivo = respaldo). Nunca imprime una llave.
 * La lógica vive en `jefatura-j8b/guion.mjs` (con el mundo inyectado, para probarla con un n8n de mentira); este archivo solo arma el mundo real.
 *
 *   node scripts/ops/jefatura-j8b.mjs plan                                         los pasos y su reversa · sin red
 *   node scripts/ops/jefatura-j8b.mjs respaldar --carpeta <fuera de la bóveda> [--aplicar]
 *   node scripts/ops/jefatura-j8b.mjs paso cabecera --carpeta <respaldo> --confirmo-j8a-probada AAAA-MM-DD [--aplicar]   (la fecha en que CC#3 certificó J8a probada en piezas)
 *   node scripts/ops/jefatura-j8b.mjs paso voto [--ejecuciones-vistas id1,id2] [--dias 7] --carpeta <respaldo> [--aplicar]   (exige la cabecera ya puesta; 0 llamadores por id y dirección; sin ejecuciones sin reconocer)
 *   node scripts/ops/jefatura-j8b.mjs paso contenido|pendientes --carpeta <respaldo> [--aplicar]                              (exigen la cabecera ya puesta)
 *   node scripts/ops/jefatura-j8b.mjs comprobar --carpeta <respaldo>               lee y compara (solo lectura)
 *
 * Los respaldos con texto de piezas (las `editor_escalation`) van FUERA de la bóveda de secretos; el guion se niega a escribirlos dentro. El cimiento (3 filas) y `grade-cimiento` no se tocan: se comparan.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { ejecutar } from './jefatura-j8b/guion.mjs'

const A = process.argv.slice(2)
const U = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''), SK = process.env.SUPABASE_SERVICE_ROLE_KEY
const N8N = (process.env.N8N_BASE_URL || 'https://n8n-production-72be.up.railway.app').replace(/\/$/, ''), NK = process.env.N8N_API_KEY
const HS = () => ({ apikey: SK, authorization: 'Bearer ' + SK, 'content-type': 'application/json' })
const HN = () => ({ 'X-N8N-API-KEY': NK, 'content-type': 'application/json' })

function mundoReal() {
  const api = async (m, p, body) => { const r = await fetch(`${N8N}/api/v1${p}`, { method: m, headers: HN(), body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); if (!r.ok) throw new Error(`${m} ${p} → ${r.status} ${t.slice(0, 200)}`); return JSON.parse(t) }
  const herramienta = (...args) => spawnSync(process.execPath, ['scripts/ops/n8n-flujo.mjs', ...args], { encoding: 'utf8', env: process.env })
  return {
    ahora: () => new Date().toISOString(),
    async enVuelo() {
      let n = 0
      for (const st of ['running', 'waiting']) { const j = await api('GET', `/executions?status=${st}&limit=50`); if (!Array.isArray(j.data)) throw new Error('no se pudo leer n8n (se trata como «hay corridas»)'); n += j.data.length }
      return n
    },
    flujo: (id) => api('GET', `/workflows/${id}`),
    flujos: async () => (await api('GET', '/workflows?limit=250')).data ?? [],
    ejecuciones: async (id) => (await api('GET', `/executions?workflowId=${id}&limit=100`)).data ?? [],
    respaldarFlujo: async (id, ruta) => { const r = herramienta('respaldar', id, ruta); return { ok: r.status === 0, texto: r.stdout.trim() || r.stderr.trim() } },
    diferencia: async (id, ruta) => { const r = herramienta('diferencia', id, ruta); return { iguales: r.status === 0, texto: r.stdout } },
    putFlujo: async (id, cuerpo) => { await api('PUT', `/workflows/${id}`, cuerpo) },
    desactivar: async (id) => { await api('POST', `/workflows/${id}/deactivate`) },
    async rest(tabla, q = '', init = {}) {
      const r = await fetch(`${U}/rest/v1/${tabla}?${q}`, { headers: { ...HS(), ...(init.prefer ? { prefer: init.prefer } : {}) }, method: init.method, body: init.body })
      const t = await r.text(); let j; try { j = JSON.parse(t) } catch { j = t }
      if (!r.ok) throw new Error(`${tabla} ${r.status}: ${String(t).slice(0, 200)}`)
      return j
    },
    sha: (s) => crypto.createHash('sha256').update(s).digest('hex'),
    fs: { existe: (p) => fs.existsSync(p), leer: (p) => fs.readFileSync(p, 'utf8'), escribir: (p, s) => fs.writeFileSync(p, s), mkdir: (p) => fs.mkdirSync(p, { recursive: true }) },
  }
}

const sinRed = !A[0] || A[0] === 'plan'
if (!sinRed) {
  const f = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'N8N_API_KEY'].filter((k) => !process.env[k])
  if (f.length) { console.error('faltan variables: ' + f.join(', ')); process.exit(2) }
}
let r
try { r = await ejecutar(A, mundoReal()) } catch (e) { console.error('ERROR:', e instanceof Error ? e.message : String(e)); process.exit(1) }
for (const l of r.lineas) (r.codigo === 0 ? console : { log: console.error }).log(l)
await new Promise((x) => setTimeout(x, 100))
process.exit(r.codigo)
void path
