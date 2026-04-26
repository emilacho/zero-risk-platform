/**
 * Adapter: MC → JSONL (JSON Lines)
 * Formato de archivo portable — una línea JSON por item.
 * Útil para backups, importación a cualquier sistema custom, o análisis con jq.
 *
 * Output: scripts/mc-portability/exports/mc-tasks.jsonl
 *                                        mc-inbox.jsonl
 *                                        mc-projects.jsonl
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const META = {
  name: 'jsonl',
  description: 'Exporta a archivos JSONL — portable, sin dependencias, compatible con jq/pandas',
}

export async function run(snapshot, { dryRun = true, outDir } = {}) {
  const exportDir = outDir || join(__dirname, '..', 'exports')

  if (!dryRun) mkdirSync(exportDir, { recursive: true })

  const files = {
    'mc-tasks.jsonl': snapshot.tasks || [],
    'mc-inbox.jsonl': snapshot.inbox || [],
    'mc-projects.jsonl': snapshot.projects || [],
    'mc-goals.jsonl': snapshot.goals || [],
    'mc-brain-dump.jsonl': snapshot.brain_dump || [],
  }

  const written = {}

  for (const [filename, items] of Object.entries(files)) {
    if (!items.length) continue
    const content = items.map(item => JSON.stringify(item)).join('\n')
    const filePath = join(exportDir, filename)

    if (!dryRun) {
      writeFileSync(filePath, content, 'utf8')
      written[filename] = { path: filePath, count: items.length }
    } else {
      written[filename] = { path: filePath, count: items.length, dryRun: true }
    }
  }

  return { files: Object.keys(written).length, written }
}
