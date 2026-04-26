#!/usr/bin/env node
/**
 * Zero Risk — Mission Control → Supabase Migration Script
 *
 * Exports all data from Mission Control (Railway) and imports it into
 * Supabase tables (mission_control_tasks, mission_control_inbox, mission_control_projects).
 *
 * Usage:
 *   node scripts/migrate-mc.mjs                    # dry run (preview only)
 *   node scripts/migrate-mc.mjs --execute           # run migration
 *   node scripts/migrate-mc.mjs --execute --verify  # run + verify row counts
 *
 * Prerequisites:
 *   1. Apply supabase/schema_mc_migration.sql in Supabase SQL Editor
 *   2. Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MC_BASE_URL, MC_MASTER_PASSWORD
 *      (can be in .env.local — script reads via dotenv if available)
 */

import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

// ─── Load .env.local ─────────────────────────────────────────────────────────
const envPath = join(projectRoot, '.env.local')
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '')
  }
}

// ─── Config ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const MC_BASE_URL = process.env.MC_BASE_URL || 'https://zero-risk-mission-control-production.up.railway.app'
const MC_PASSWORD = process.env.MC_MASTER_PASSWORD || 'zerorisk2026'

const DRY_RUN = !process.argv.includes('--execute')
const VERIFY = process.argv.includes('--verify')

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

console.log(`🔄 Mission Control → Supabase Migration`)
console.log(`   MC:       ${MC_BASE_URL}`)
console.log(`   Supabase: ${SUPABASE_URL}`)
console.log(`   Mode:     ${DRY_RUN ? '🔍 DRY RUN (pass --execute to write)' : '✅ EXECUTE'}`)
console.log('')

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
async function mcGet(path) {
  const url = `${MC_BASE_URL}${path}?masterPassword=${MC_PASSWORD}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`MC ${path}: ${res.status}`)
  const data = await res.json()
  return Array.isArray(data) ? data : (data.data || data.items || data.tasks || data.messages || [])
}

async function sbPost(table, rows) {
  if (!rows.length) return { count: 0 }
  const url = `${SUPABASE_URL}/rest/v1/${table}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal,resolution=ignore-duplicates',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Supabase POST ${table}: ${res.status} ${errText.slice(0, 200)}`)
  }
  return { count: rows.length }
}

async function sbCount(table) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=id`
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'count=exact',
      'Range': '0-0',
    },
  })
  const rangeHeader = res.headers.get('content-range')
  return rangeHeader ? parseInt(rangeHeader.split('/')[1] || '0', 10) : 0
}

// ─── Migration steps ──────────────────────────────────────────────────────────

async function migrateProjects() {
  console.log('📁 PROJECTS')
  let projects = []
  try { projects = await mcGet('/api/projects') } catch (e) { console.log(`   ⚠️ MC projects not available: ${e.message}`) }
  if (!projects.length) { console.log('   0 projects found\n'); return 0 }

  const rows = projects.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description || null,
    status: p.status || 'active',
    color: p.color || '#6B7280',
    team_members: p.teamMembers || [],
    tags: p.tags || [],
    mc_id: p.id,
    source: 'import_mc',
    created_at: p.createdAt || new Date().toISOString(),
    updated_at: p.updatedAt || new Date().toISOString(),
  }))

  console.log(`   Found ${rows.length} projects`)
  rows.forEach(r => console.log(`   - ${r.id}: ${r.name} (${r.status})`))

  if (!DRY_RUN) {
    const result = await sbPost('mission_control_projects', rows)
    console.log(`   ✅ Inserted ${result.count} projects\n`)
  } else {
    console.log('   [DRY RUN — skipped write]\n')
  }
  return rows.length
}

async function migrateTasks() {
  console.log('📋 TASKS')
  let tasks = []
  try { tasks = await mcGet('/api/tasks') } catch (e) { console.log(`   ⚠️ MC tasks not available: ${e.message}`) }
  if (!tasks.length) { console.log('   0 tasks found\n'); return 0 }

  const rows = tasks.map(t => {
    // Extract pipeline_id and step_index from notes field if present
    let pipelineId = null
    let stepIndex = null
    const notesStr = t.notes || ''
    const pipelineMatch = notesStr.match(/pipeline_id:([a-f0-9-]+)/)
    const stepMatch = notesStr.match(/step_index:(\d+)/)
    if (pipelineMatch) pipelineId = pipelineMatch[1]
    if (stepMatch) stepIndex = parseInt(stepMatch[1], 10)

    return {
      id: t.id,
      title: t.title,
      description: t.description || null,
      importance: t.importance || 'not-important',
      urgency: t.urgency || 'not-urgent',
      kanban: t.kanban || 'todo',
      assigned_to: t.assignedTo || null,
      project_id: t.projectId || null,
      milestone_id: t.milestoneId || null,
      tags: t.tags || [],
      notes: t.notes || null,
      estimated_minutes: t.estimatedMinutes || null,
      pipeline_id: pipelineId,
      step_index: stepIndex,
      source: 'import_mc',
      created_at: t.createdAt || new Date().toISOString(),
      updated_at: t.updatedAt || t.createdAt || new Date().toISOString(),
    }
  })

  const quadrant = { 'important+urgent': 0, 'important+not-urgent': 0, 'not-important+urgent': 0, 'not-important+not-urgent': 0 }
  rows.forEach(r => { quadrant[`${r.importance}+${r.urgency}`]++ })

  console.log(`   Found ${rows.length} tasks`)
  console.log(`   Eisenhower: DO=${quadrant['important+urgent']} | SCHEDULE=${quadrant['important+not-urgent']} | DELEGATE=${quadrant['not-important+urgent']} | ELIMINATE=${quadrant['not-important+not-urgent']}`)
  console.log(`   Kanban: todo=${rows.filter(r=>r.kanban==='todo').length} | in-progress=${rows.filter(r=>r.kanban==='in-progress').length} | done=${rows.filter(r=>r.kanban==='done').length}`)

  if (!DRY_RUN) {
    const result = await sbPost('mission_control_tasks', rows)
    console.log(`   ✅ Inserted ${result.count} tasks\n`)
  } else {
    console.log('   [DRY RUN — skipped write]\n')
  }
  return rows.length
}

async function migrateInbox() {
  console.log('📬 INBOX')
  let messages = []
  try { messages = await mcGet('/api/inbox') } catch (e) { console.log(`   ⚠️ MC inbox not available: ${e.message}`) }
  if (!messages.length) { console.log('   0 messages found\n'); return 0 }

  const rows = messages.map(m => ({
    id: m.id,
    from_agent: m.from,
    to_role: m.to || 'leader',
    type: m.type || 'report',
    task_id: m.taskId || null,
    subject: m.subject || '(sin asunto)',
    body: m.body || '',
    status: m.status === 'read' ? 'read' : 'unread',
    read_at: m.readAt || null,
    source: 'import_mc',
    created_at: m.createdAt || new Date().toISOString(),
  }))

  const byType = {}
  rows.forEach(r => { byType[r.type] = (byType[r.type] || 0) + 1 })
  console.log(`   Found ${rows.length} messages`)
  console.log(`   By type: ${Object.entries(byType).map(([k,v]) => `${k}=${v}`).join(' | ')}`)

  if (!DRY_RUN) {
    const result = await sbPost('mission_control_inbox', rows)
    console.log(`   ✅ Inserted ${result.count} messages\n`)
  } else {
    console.log('   [DRY RUN — skipped write]\n')
  }
  return rows.length
}

async function verify() {
  console.log('🔍 VERIFY')
  const tables = ['mission_control_projects', 'mission_control_tasks', 'mission_control_inbox']
  for (const table of tables) {
    try {
      const count = await sbCount(table)
      console.log(`   ${table}: ${count} rows`)
    } catch (e) {
      console.log(`   ${table}: ERROR — ${e.message} (¿aplicaste schema_mc_migration.sql?)`)
    }
  }
  console.log('')
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  try {
    const projectCount = await migrateProjects()
    const taskCount = await migrateTasks()
    const inboxCount = await migrateInbox()

    if (VERIFY || DRY_RUN) await verify()

    console.log('─────────────────────────────────────')
    if (DRY_RUN) {
      console.log(`📊 DRY RUN COMPLETE`)
      console.log(`   Projects: ${projectCount} | Tasks: ${taskCount} | Inbox: ${inboxCount}`)
      console.log(`\n   Para ejecutar la migración real:`)
      console.log(`   node scripts/migrate-mc.mjs --execute --verify`)
    } else {
      console.log(`✅ MIGRATION COMPLETE`)
      console.log(`   Projects: ${projectCount} | Tasks: ${taskCount} | Inbox: ${inboxCount}`)
      console.log(`\n   Próximos pasos:`)
      console.log(`   1. Verificar datos en Supabase dashboard`)
      console.log(`   2. Actualizar N8N_MC_BASE_URL → NEXT_PUBLIC_BASE_URL/api/mc en Railway env vars`)
      console.log(`   3. Agregar MC_SUPABASE_MODE=true en Railway vars del servicio Vercel`)
      console.log(`   4. Opcional: decommission MC de Railway (ahorra ~$5/mes)`)
    }
  } catch (err) {
    console.error('❌ Migration failed:', err.message)
    process.exit(1)
  }
}

main()
