/**
 * apply-sentry-capture.mjs · Wave 13 T2 (CC#1)
 *
 * Aplica `captureRouteError()` al outermost catch de cada handler en
 * src/app/api (recursivo · matching route.ts). Conservador:
 *
 *   - Solo patcha catches que tengan variable nombrada (ej. `catch (e)` ·
 *     `catch (err: any)`) · skip `catch {}` sin var.
 *   - Solo patcha catches que sean seguidas por `return NextResponse.json(`
 *     ó `return apiError(` ó `return apiErrors.` (response handler outer).
 *   - Skip si el archivo ya importa `captureRouteError` (idempotente).
 *   - Skip si el catch ya contiene `captureRouteError` o `Sentry.captureException`.
 *   - Asume que el primer parámetro del handler es `request` o `req` o nombre
 *     similar · si no encuentra, pasa null.
 *
 * Inserta:
 *   captureRouteError(<errVar>, <requestVar>, {
 *     route: '<derived-from-file-path>',
 *     source: 'route_handler',
 *   })
 *
 * inmediatamente DESPUÉS del `catch (var) {` y ANTES del cuerpo del catch.
 *
 * Uso:
 *   node scripts/audit/apply-sentry-capture.mjs              # dry-run
 *   node scripts/audit/apply-sentry-capture.mjs --execute    # in-place
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')
const API_ROOT = resolve(REPO_ROOT, 'src', 'app', 'api')

const IMPORT_LINE = "import { captureRouteError } from '@/lib/sentry-capture'"

// Match catch (var) { · captura nombre de var · ignora catch sin var
const CATCH_REGEX = /\}\s*catch\s*\(\s*(\w+)(?:\s*:\s*\w+)?\s*\)\s*\{/g

function* walkRoutes(dir) {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) yield* walkRoutes(full)
    else if (entry === 'route.ts') yield full
  }
}

function deriveRoutePath(absPath) {
  const rel = relative(API_ROOT, absPath).replace(/\\/g, '/')
  // rel = 'agents/pipeline/route.ts' → '/api/agents/pipeline'
  return '/api/' + rel.replace(/\/route\.ts$/, '')
}

function findRequestVarName(content) {
  // Buscar el primer handler y extraer nombre del primer param
  const match = content.match(
    /export\s+async\s+function\s+(?:GET|POST|PUT|DELETE|PATCH)\s*\(\s*(_?\w+)/,
  )
  if (!match) return null
  const name = match[1]
  // Skip _request placeholder · usa null
  if (name.startsWith('_')) return null
  return name
}

function shouldPatchCatch(content, catchEndIdx, errVar) {
  // Check next ~200 chars: si contienen `return NextResponse.json` o `apiError`
  // ANTES de algún `}` que cierre el catch · patch.
  const slice = content.slice(catchEndIdx, catchEndIdx + 400)
  // Si ya hay captureRouteError o Sentry.captureException · skip
  if (/captureRouteError|Sentry\.(captureException|captureMessage)/.test(slice)) {
    return false
  }
  // Heurística: es un response-returning catch?
  if (/return\s+(NextResponse\.json|apiError|apiErrors\.)/.test(slice)) {
    return true
  }
  return false
}

function ensureImport(content) {
  if (content.includes(IMPORT_LINE)) return content
  if (/from ['"]@\/lib\/sentry-capture['"]/.test(content)) return content
  // Insert AFTER the LAST top-level import statement (skip multi-line imports)
  const lines = content.split('\n')
  let lastImportLine = -1
  let inMultilineImport = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (inMultilineImport) {
      if (line.includes('from ')) {
        lastImportLine = i
        inMultilineImport = false
      }
      continue
    }
    if (/^import\s+\S/.test(line) && !line.includes('from ')) {
      // Multi-line import start
      inMultilineImport = true
      continue
    }
    if (/^import\s.+from\s/.test(line)) {
      lastImportLine = i
    }
  }
  if (lastImportLine === -1) {
    return IMPORT_LINE + '\n' + content
  }
  const before = lines.slice(0, lastImportLine + 1).join('\n')
  const after = lines.slice(lastImportLine + 1).join('\n')
  return before + '\n' + IMPORT_LINE + '\n' + after
}

function processFile(absPath, options) {
  const relPath = relative(REPO_ROOT, absPath).replace(/\\/g, '/')
  const original = readFileSync(absPath, 'utf-8')

  const requestVar = findRequestVarName(original)
  const routePath = deriveRoutePath(absPath)

  const matches = [...original.matchAll(CATCH_REGEX)]
  if (matches.length === 0) {
    return { relPath, action: 'skip', reason: 'no catch with var' }
  }

  // Iterar de atrás hacia adelante para mantener índices estables
  let updated = original
  let patches = 0
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i]
    const errVar = m[1]
    const matchEnd = m.index + m[0].length

    if (!shouldPatchCatch(updated, matchEnd, errVar)) continue

    const reqArg = requestVar ? requestVar : 'null'
    const insert =
      `\n    captureRouteError(${errVar}, ${reqArg}, {` +
      `\n      route: '${routePath}',` +
      `\n      source: 'route_handler',` +
      `\n    })`
    updated = updated.slice(0, matchEnd) + insert + updated.slice(matchEnd)
    patches++
  }

  if (patches === 0) {
    return { relPath, action: 'skip', reason: 'no patchable catches' }
  }

  const finalContent = ensureImport(updated)
  if (options.execute) {
    writeFileSync(absPath, finalContent, 'utf-8')
  }

  return {
    relPath,
    action: options.execute ? 'applied' : 'would-apply',
    patches,
    requestVar: requestVar ?? '(null)',
    routePath,
  }
}

function main() {
  const args = process.argv.slice(2)
  const execute = args.includes('--execute')

  const results = []
  for (const path of walkRoutes(API_ROOT)) {
    results.push(processFile(path, { execute }))
  }

  const applied = results.filter((r) => r.action === 'applied' || r.action === 'would-apply')
  const skipped = results.filter((r) => r.action === 'skip')

  console.log(`\n=== apply-sentry-capture · Wave 13 T2 ===`)
  console.log(`Mode: ${execute ? 'EXECUTE' : 'dry-run'}`)
  console.log(`Total routes: ${results.length}`)
  console.log(`  ${execute ? 'Applied' : 'Would apply'}: ${applied.length}`)
  console.log(`  Skipped: ${skipped.length}`)

  if (applied.length > 0) {
    console.log(`\n--- ${execute ? 'Applied' : 'Would apply'} ---`)
    for (const r of applied) {
      console.log(
        `  ${r.relPath} · ${r.patches} catch(es) · req=${r.requestVar} · route=${r.routePath}`,
      )
    }
  }
  console.log(`\nTotal catch blocks patched: ${applied.reduce((s, r) => s + r.patches, 0)}`)
}

main()
