/**
 * MC Portability Kit — Restore / Rollback
 * Restaura un snapshot exportado de vuelta a Supabase.
 * Útil para: recuperación de datos, cambio de instancia MC, o rollback post-migración.
 *
 * Uso:
 *   node scripts/mc-portability/restore-to-supabase.mjs --file mc-export-2024-01-01.json
 *   node scripts/mc-portability/restore-to-supabase.mjs --execute
 *
 * Por defecto: dry-run. Pasar --execute para escribir en Supabase.
 * Requiere: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY en .env.local
 */

import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const dotenv = require('dotenv')

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '..', '.env.local') })

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const option = (name) => {
  const idx = args.indexOf(name)
  return idx !== -1 ? args[idx + 1] : null
}

const dryRun      = !flag('--execute')
const snapshotFile = option('--file')

// ── Supabase REST upsert ──────────────────────────────────────────────────────

async function supabaseUpsert(table, rows) {
  const url   = process.env.SUPABASE_URL
  const key   = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('Falta SUPABASE_URL en .env.local')
  if (!key) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en .env.local')

  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Supabase ${table}: HTTP ${res.status} — ${text}`)
  }
  return res.status
}

// ── Transform MC task → Supabase row ─────────────────────────────────────────

function taskToRow(task) {
  return {
    mc_id:       task.id,
    title:       task.title,
    description: task.description || null,
    notes:       task.notes || null,
    importance:  task.importance || 'not-important',
    urgency:     task.urgency || 'not-urgent',
    kanban:      task.kanban || 'todo',
    tags:        task.tags || [],
    assigned_to: task.assigned_to || null,
    created_at:  task.createdAt || new Date().toISOString(),
  }
}

function inboxToRow(msg) {
  return {
    mc_id:     msg.id,
    subject:   msg.subject || '(sin asunto)',
    body:      msg.body || null,
    from_name: msg.from || null,
    type:      msg.type || 'report',
    status:    msg.status || 'unread',
    created_at: msg.createdAt || new Date().toISOString(),
  }
}

function projectToRow(proj) {
  return {
    mc_id:       proj.id,
    name:        proj.name || proj.title || '(sin nombre)',
    description: proj.description || null,
    status:      proj.status || 'active',
    created_at:  proj.createdAt || new Date().toISOString(),
  }
}

// ── Find latest export ────────────────────────────────────────────────────────

function findLatestExport() {
  const exportsDir = join(__dirname, 'exports')
  let files
  try {
    files = readdirSync(exportsDir).filter(f => f.startsWith('mc-export-') && f.endsWith('.json'))
  } catch {
    return null
  }
  if (!files.length) return null
  files.sort().reverse()
  return join(exportsDir, files[0])
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const resolvedFile = snapshotFile || findLatestExport()
  if (!resolvedFile) {
    console.error('❌ No se encontró snapshot. Exporta primero con: node export-mc-data.mjs')
    process.exit(1)
  }

  let snapshot
  try {
    snapshot = JSON.parse(readFileSync(resolvedFile, 'utf8'))
  } catch (e) {
    console.error(`❌ No se pudo leer snapshot: ${e.message}`)
    process.exit(1)
  }

  const tasks    = (snapshot.tasks    || []).map(taskToRow)
  const inbox    = (snapshot.inbox    || []).map(inboxToRow)
  const projects = (snapshot.projects || []).map(projectToRow)

  console.log(`\n📂 Snapshot: ${resolvedFile}`)
  console.log(`   Exportado: ${snapshot.exportedAt || 'desconocido'}`)
  console.log(`   Tasks: ${tasks.length}  |  Inbox: ${inbox.length}  |  Projects: ${projects.length}`)
  console.log(`\n🔄 Modo: ${dryRun ? '🔍 DRY RUN — sin escritura real' : '✅ EXECUTE — escribiendo en Supabase'}`)
  if (dryRun) console.log('   Pasar --execute para restaurar datos.\n')

  const results = {}

  if (!dryRun) {
    if (tasks.length) {
      try {
        await supabaseUpsert('mission_control_tasks', tasks)
        results.tasks = tasks.length
        console.log(`   ✅ ${tasks.length} tasks restauradas`)
      } catch (e) {
        console.error(`   ❌ tasks: ${e.message}`)
        results.tasks_error = e.message
      }
    }

    if (inbox.length) {
      try {
        await supabaseUpsert('mission_control_inbox', inbox)
        results.inbox = inbox.length
        console.log(`   ✅ ${inbox.length} mensajes de inbox restaurados`)
      } catch (e) {
        console.error(`   ❌ inbox: ${e.message}`)
        results.inbox_error = e.message
      }
    }

    if (projects.length) {
      try {
        await supabaseUpsert('mission_control_projects', projects)
        results.projects = projects.length
        console.log(`   ✅ ${projects.length} projects restaurados`)
      } catch (e) {
        console.error(`   ❌ projects: ${e.message}`)
        results.projects_error = e.message
      }
    }
  } else {
    results.tasks    = tasks.length
    results.inbox    = inbox.length
    results.projects = projects.length
  }

  console.log('\n📊 Resultado:', JSON.stringify(results, null, 2))
  console.log('\n⚠️  NOTA: Este script hace upsert por mc_id.')
  console.log('   Si el schema no existe aún, aplica primero: supabase/schema_mc_migration.sql\n')
}

main().catch(e => { console.error(e); process.exit(1) })
