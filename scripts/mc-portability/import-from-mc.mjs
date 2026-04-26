/**
 * MC Portability Kit — Orchestrator
 * Lee un snapshot exportado y ejecuta el adapter elegido.
 *
 * Uso:
 *   node scripts/mc-portability/import-from-mc.mjs --adapter notion --file mc-export-2024-01-01.json
 *   node scripts/mc-portability/import-from-mc.mjs --adapter jsonl --execute
 *   node scripts/mc-portability/import-from-mc.mjs --list
 *
 * Por defecto: dry-run. Pasar --execute para escribir datos reales.
 */

import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const dotenv = require('dotenv')

const __dirname = dirname(fileURLToPath(import.meta.url))

dotenv.config({ path: join(__dirname, '..', '..', '.env.local') })

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const option = (name) => {
  const idx = args.indexOf(name)
  return idx !== -1 ? args[idx + 1] : null
}

const dryRun    = !flag('--execute')
const listMode  = flag('--list')
const adapterName = option('--adapter')
const snapshotFile = option('--file')

// ── Discover adapters ─────────────────────────────────────────────────────────

const ADAPTERS_DIR = join(__dirname, 'adapters')

async function loadAdapters() {
  const files = readdirSync(ADAPTERS_DIR).filter(f => f.startsWith('to-') && f.endsWith('.mjs'))
  const adapters = {}
  for (const file of files) {
    const mod = await import(join(ADAPTERS_DIR, file))
    if (mod.META?.name) adapters[mod.META.name] = { ...mod, file }
  }
  return adapters
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
  const adapters = await loadAdapters()

  if (listMode) {
    console.log('\n📦 Adapters disponibles:\n')
    for (const [name, mod] of Object.entries(adapters)) {
      console.log(`  ${name.padEnd(20)} — ${mod.META.description}`)
    }
    console.log('\nUso: node import-from-mc.mjs --adapter <name> [--file <path>] [--execute]\n')
    return
  }

  if (!adapterName) {
    console.error('❌ Falta --adapter. Usa --list para ver opciones.')
    process.exit(1)
  }

  const adapter = adapters[adapterName]
  if (!adapter) {
    console.error(`❌ Adapter desconocido: "${adapterName}". Usa --list para ver opciones.`)
    process.exit(1)
  }

  // Resolve snapshot file
  const resolvedFile = snapshotFile || findLatestExport()
  if (!resolvedFile) {
    console.error('❌ No se encontró snapshot. Primero exporta con: node export-mc-data.mjs')
    process.exit(1)
  }

  let snapshot
  try {
    snapshot = JSON.parse(readFileSync(resolvedFile, 'utf8'))
  } catch (e) {
    console.error(`❌ No se pudo leer el snapshot: ${e.message}`)
    process.exit(1)
  }

  const taskCount   = (snapshot.tasks || []).length
  const inboxCount  = (snapshot.inbox || []).length
  const projCount   = (snapshot.projects || []).length

  console.log(`\n📂 Snapshot: ${resolvedFile}`)
  console.log(`   Exportado: ${snapshot.exportedAt || 'desconocido'}`)
  console.log(`   Tasks: ${taskCount}  |  Inbox: ${inboxCount}  |  Projects: ${projCount}`)
  console.log(`\n🚀 Adapter: ${adapterName} — ${adapter.META.description}`)
  console.log(`   Modo: ${dryRun ? '🔍 DRY RUN (sin escritura real)' : '✅ EXECUTE (escritura real)'}`)
  if (dryRun) console.log('   Pasar --execute para importar datos reales.\n')

  try {
    const result = await adapter.run(snapshot, { dryRun })
    console.log('\n✅ Resultado:', JSON.stringify(result, null, 2))
  } catch (e) {
    console.error(`\n❌ Error en adapter "${adapterName}": ${e.message}`)
    if (e.message.includes('Falta ')) {
      console.error('   → Añade la variable requerida a .env.local')
    }
    process.exit(1)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
