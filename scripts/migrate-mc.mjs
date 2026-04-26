#!/usr/bin/env node
/**
 * Zero Risk — Mission Control → Supabase Migration Script
 * CÓDIGO DORMIDO — solo correr cuando Emilio decida migrar.
 *
 * Exporta datos de MC (Railway) e importa en Supabase.
 * Para adapters a otras plataformas (Linear, Notion, etc.) ver scripts/mc-portability/
 *
 * Usage:
 *   node scripts/migrate-mc.mjs                     # dry run (preview, sin writes)
 *   node scripts/migrate-mc.mjs --execute            # ejecutar migración
 *   node scripts/migrate-mc.mjs --execute --verify   # migrar + verificar row counts
 *
 * Prerequisites:
 *   1. Aplicar supabase/schema_mc_migration.sql en Supabase SQL Editor
 *   2. Variables en .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env.local via dotenv
const dotenv = require('dotenv')
dotenv.config({ path: join(__dirname, '..', '.env.local') })

// ─── Config ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const MC_BASE_URL = process.env.MC_BASE_URL || 'https://zero-risk-mission-control-production.up.railway.app'
const MC_PASSWORD = process.env.MC_MASTER_PASSWORD || 'zerorisk2026'

const DRY_RUN = !process.argv.includes('--execute')
const VERIFY = process.argv.includes('--verify')

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Faltan variables en .env.local: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

console.log('🔄 Mission Control → Supabase Migration')
console.log(`   MC:       ${MC_BASE_URL}`)
console.log(`   Supabase: ${SUPABASE_URL}`)
console.log(`   Modo:     ${DRY_RUN ? '🔍 DRY RUN (pasar --execute para escribir)' : '✅ EXECUTE'}`)
console.log('')

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function mcGet(path) {
  const url = `${MC_BASE_URL}${path}?masterPassword=${MC_PASSWORD}`
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`MC ${path}: HTTP ${res.status}`)
  const data = await res.json()
  return Array.isArray(data) ? data : (data.data || data.tasks || data.messages || data.items || [])
}

async function sbUpsert(table, rows) {
  if (!rows.length) return { count: 0 }
  const url = `${SUPABASE_URL}/rest/v1/${table}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal,resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Supabase ${table}: HTTP ${res.status} — ${errText.slice(0, 200)}`)
  }
  return { count: rows.length }
}

async function sbCount(table) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'count=exact',
      'Range': '0-0',
    },
  })
  const header = res.headers.get('content-range')
  return header ? parseInt(header.split('/')[1] || '0', 10) : 0
}

// ─── Migration steps ──────────────────────────────────────────────────────────
async function migrateProjects() {
  console.log('📁 PROJECTS')
  let projects = []
  try { projects = await mcGet('/api/projects') } catch (e) { console.log(`   ⚠️  MC projects offline: ${e.message}\n`); return 0 }
  if (!projects.length) { console.log('   0 proyectos encontrados\n'); return 0 }

  const rows = projects.map(p => ({
    id: p.id, name: p.name, description: p.description || null,
    status: p.status || 'active', color: p.color || '#6B7280',
    team_members: p.teamMembers || [], tags: p.tags || [],
    mc_id: p.id, source: 'import_mc',
    created_at: p.createdAt || new Date().toISOString(),
    updated_at: p.updatedAt || new Date().toISOString(),
  }))
  console.log(`   Encontrados: ${rows.length}`)
  if (!DRY_RUN) { await sbUpsert('mission_control_projects', rows); console.log(`   ✅ Insertados ${rows.length}`) }
  else console.log('   [DRY RUN — sin escritura]')
  console.log('')
  return rows.length
}

async function migrateTasks() {
  console.log('📋 TASKS')
  let tasks = []
  try { tasks = await mcGet('/api/tasks') } catch (e) { console.log(`   ⚠️  MC tasks offline: ${e.message}\n`); return 0 }
  if (!tasks.length) { console.log('   0 tareas encontradas\n'); return 0 }

  const rows = tasks.map(t => {
    const notes = String(t.notes || '')
    const pm = notes.match(/pipeline_id:([a-f0-9-]+)/)
    const sm = notes.match(/step_index:(\d+)/)
    return {
      id: t.id, title: t.title || 'Sin título',
      description: t.description || null,
      importance: t.importance || 'not-important',
      urgency: t.urgency || 'not-urgent',
      kanban: t.kanban || 'todo',
      assigned_to: t.assignedTo || null, project_id: t.projectId || null,
      tags: t.tags || [], notes: notes || null,
      pipeline_id: pm ? pm[1] : null, step_index: sm ? parseInt(sm[1], 10) : null,
      source: 'import_mc', created_at: t.createdAt || new Date().toISOString(),
    }
  })

  const q = { do: 0, schedule: 0, delegate: 0, eliminate: 0 }
  rows.forEach(r => {
    if (r.importance === 'important' && r.urgency === 'urgent') q.do++
    else if (r.importance === 'important') q.schedule++
    else if (r.urgency === 'urgent') q.delegate++
    else q.eliminate++
  })
  console.log(`   Encontradas: ${rows.length}`)
  console.log(`   Eisenhower: DO=${q.do} | SCHEDULE=${q.schedule} | DELEGATE=${q.delegate} | ELIMINATE=${q.eliminate}`)
  if (!DRY_RUN) { await sbUpsert('mission_control_tasks', rows); console.log(`   ✅ Insertadas ${rows.length}`) }
  else console.log('   [DRY RUN — sin escritura]')
  console.log('')
  return rows.length
}

async function migrateInbox() {
  console.log('📬 INBOX')
  let messages = []
  try { messages = await mcGet('/api/inbox') } catch (e) { console.log(`   ⚠️  MC inbox offline: ${e.message}\n`); return 0 }
  if (!messages.length) { console.log('   0 mensajes encontrados\n'); return 0 }

  const rows = messages.map(m => ({
    id: m.id, from_agent: m.from || 'unknown', to_role: m.to || 'leader',
    type: m.type || 'report', task_id: m.taskId || null,
    subject: m.subject || '(sin asunto)', body: m.body || '',
    status: m.status === 'read' ? 'read' : 'unread',
    read_at: m.readAt || null, source: 'import_mc',
    created_at: m.createdAt || new Date().toISOString(),
  }))

  const byType = {}
  rows.forEach(r => { byType[r.type] = (byType[r.type] || 0) + 1 })
  console.log(`   Encontrados: ${rows.length} (${Object.entries(byType).map(([k, v]) => `${k}:${v}`).join(' | ')})`)
  if (!DRY_RUN) { await sbUpsert('mission_control_inbox', rows); console.log(`   ✅ Insertados ${rows.length}`) }
  else console.log('   [DRY RUN — sin escritura]')
  console.log('')
  return rows.length
}

async function verify() {
  console.log('🔍 VERIFY (Supabase row counts)')
  for (const table of ['mission_control_projects', 'mission_control_tasks', 'mission_control_inbox']) {
    try { console.log(`   ${table}: ${await sbCount(table)} filas`) }
    catch (e) { console.log(`   ${table}: ERROR — ${e.message} (¿aplicaste schema_mc_migration.sql?)`) }
  }
  console.log('')
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  try {
    const p = await migrateProjects()
    const t = await migrateTasks()
    const i = await migrateInbox()
    if (VERIFY || DRY_RUN) await verify()

    console.log('─────────────────────────────────────')
    if (DRY_RUN) {
      console.log(`📊 DRY RUN COMPLETO`)
      console.log(`   Projects: ${p} | Tasks: ${t} | Inbox: ${i}`)
      console.log(`\n   Para ejecutar: node scripts/migrate-mc.mjs --execute --verify`)
      console.log(`   Para otras plataformas: node scripts/mc-portability/import-from-mc.mjs --help`)
    } else {
      console.log(`✅ MIGRACIÓN COMPLETA`)
      console.log(`   Projects: ${p} | Tasks: ${t} | Inbox: ${i}`)
      console.log(`\n   Próximos pasos:`)
      console.log(`   1. Verificar datos en Supabase dashboard`)
      console.log(`   2. Actualizar MC_BASE_URL si cambiás de plataforma`)
    }
  } catch (err) {
    console.error('❌ Error:', err.message)
    process.exit(1)
  }
}

main()
