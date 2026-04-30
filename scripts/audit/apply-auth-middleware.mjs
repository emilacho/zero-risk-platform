/**
 * apply-auth-middleware.mjs · Wave 13 (CC#1)
 *
 * Aplica `requireInternalApiKey` auth check a routes que actualmente no tienen
 * auth. Usa un parser conservador (regex line-based) que:
 *   1. Lee cada handler `export async function (GET|POST|...)(...)`
 *   2. Verifica que NO tenga ya un auth check (heurística: `requireInternalApiKey`,
 *      `checkInternalKey`, `allowPublic`, `requireSupabaseSession` en el archivo)
 *   3. Si necesita el param request y lo falta, lo agrega
 *   4. Inserta auth check como primera línea del handler body
 *   5. Asegura el import al top
 *
 * Es deliberadamente conservador · skip si:
 *   - El archivo ya tiene auth check
 *   - El handler no parsea con la regex (multiline · destructuring complejo)
 *   - El archivo está en la lista PUBLIC_INTENTIONAL
 *
 * Uso:
 *   node scripts/audit/apply-auth-middleware.mjs              # dry-run · imprime lo que haría
 *   node scripts/audit/apply-auth-middleware.mjs --execute    # aplica edits in-place
 *
 * NO toca:
 *   - /api/health (PUBLIC_INTENTIONAL)
 *   - /api/auth (PUBLIC_INTENTIONAL)
 *   - Routes que ya tienen auth (>= 1 de los markers)
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')
const API_ROOT = resolve(REPO_ROOT, 'src', 'app', 'api')

const PUBLIC_INTENTIONAL = new Set([
  'src/app/api/health/route.ts',
  'src/app/api/auth/route.ts',
])

const AUTH_MARKERS = [
  'requireInternalApiKey',
  'checkInternalKey',
  'requireInternalKey',
  'allowPublic',
  'requireSupabaseSession',
]

const IMPORT_LINE = "import { requireInternalApiKey } from '@/lib/auth-middleware'"

// Custom parser · NO single regex porque los params multi-line con `{ params }`
// destructuring contienen `{` y `}` que rompen un regex naive. Implementamos
// un mini-balanceador: localizamos `export async function METHOD(` · luego
// avanzamos balanceando paréntesis hasta el `)` de params · luego skippeamos
// optional return type · luego encontramos el `{` de body.
const HANDLER_NAME_REGEX = /export\s+async\s+function\s+(GET|POST|PUT|DELETE|PATCH|HEAD)\s*\(/g

function* walkRoutes(dir) {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      yield* walkRoutes(full)
    } else if (entry === 'route.ts') {
      yield full
    }
  }
}

function fileHasAuth(content) {
  return AUTH_MARKERS.some((m) => content.includes(m))
}

function ensureRequestParam(paramsStr) {
  // paramsStr: '' | 'request' | 'request: Request' | 'request: NextRequest, { params }: ...' | etc.
  if (!paramsStr || !paramsStr.trim()) {
    return { newParams: 'request: Request', requestVar: 'request' }
  }
  // Detect first param identifier (request | req | _request)
  const firstParam = paramsStr.split(',')[0].trim()
  const m = firstParam.match(/^(_?\w+)\s*(?::\s*\w+)?/)
  const varName = m ? m[1] : 'request'
  return { newParams: paramsStr, requestVar: varName }
}

/**
 * Encuentra el handler completo a partir del match-index del nombre.
 * Retorna { paramsText, paramsEnd, bodyOpen } o null si no parsea.
 *
 * paramsEnd = index del `)` de cierre de params
 * bodyOpen  = index del `{` que abre el body del handler
 */
function findHandlerBoundaries(content, paramsStart) {
  // paramsStart apunta al char DESPUÉS del `(` (primer char de params)
  let depth = 1
  let i = paramsStart
  while (i < content.length && depth > 0) {
    const c = content[i]
    if (c === '(') depth++
    else if (c === ')') depth--
    if (depth === 0) break
    i++
  }
  if (depth !== 0) return null
  const paramsEnd = i // index of closing `)`
  const paramsText = content.slice(paramsStart, paramsEnd)

  // Skip optional return type annotation `: Foo<Bar>` · whitespace
  let j = paramsEnd + 1
  while (j < content.length && /[\s:A-Za-z0-9<>\[\]|,]/.test(content[j])) {
    if (content[j] === '{') break
    j++
  }
  // j ahora debe apuntar al `{` del body
  if (content[j] !== '{') return null
  return { paramsText, paramsEnd, bodyOpen: j }
}

function transformHandlers(content) {
  // Iterar de atrás hacia adelante para mantener índices estables
  const matches = [...content.matchAll(HANDLER_NAME_REGEX)]
  if (matches.length === 0) return { content, handlers: [] }

  const handlers = []
  let updated = content
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i]
    const method = m[1]
    const paramsStart = m.index + m[0].length
    const bounds = findHandlerBoundaries(updated, paramsStart)
    if (!bounds) {
      handlers.unshift({ method, status: 'unparsable' })
      continue
    }
    const { paramsText, paramsEnd, bodyOpen } = bounds
    const { newParams, requestVar } = ensureRequestParam(paramsText)

    // Si los params cambiaron, reescribir
    let newContent = updated
    let newBodyOpen = bodyOpen
    if (newParams !== paramsText) {
      newContent =
        updated.slice(0, paramsStart) +
        newParams +
        updated.slice(paramsEnd)
      // Recompute bodyOpen relative to new content
      const offset = newParams.length - paramsText.length
      newBodyOpen = bodyOpen + offset
    }

    const authBlock =
      `\n  const auth = await requireInternalApiKey(${requestVar})\n` +
      `  if (!auth.ok) return auth.response\n`

    updated =
      newContent.slice(0, newBodyOpen + 1) +
      authBlock +
      newContent.slice(newBodyOpen + 1)
    handlers.unshift({ method, status: 'patched' })
  }

  return { content: updated, handlers }
}

function ensureImport(content) {
  if (content.includes(IMPORT_LINE)) return content
  // Check if `from '@/lib/auth-middleware'` already exists (different import shape)
  if (/from ['"]@\/lib\/auth-middleware['"]/.test(content)) return content

  // Insert after first existing import block (last import line)
  const importLines = content.match(/^import\s.+$/gm) ?? []
  if (importLines.length > 0) {
    const lastImport = importLines[importLines.length - 1]
    const idx = content.lastIndexOf(lastImport) + lastImport.length
    return content.slice(0, idx) + '\n' + IMPORT_LINE + content.slice(idx)
  }
  // No imports · insert at top
  return IMPORT_LINE + '\n' + content
}

function processFile(absPath, options) {
  const relPath = relative(REPO_ROOT, absPath).replace(/\\/g, '/')
  const original = readFileSync(absPath, 'utf-8')

  if (PUBLIC_INTENTIONAL.has(relPath)) {
    return { relPath, action: 'skip', reason: 'PUBLIC_INTENTIONAL' }
  }
  if (fileHasAuth(original)) {
    return { relPath, action: 'skip', reason: 'already has auth' }
  }

  const { content: transformed, handlers } = transformHandlers(original)
  const patchedHandlers = handlers.filter((h) => h.status === 'patched')
  const unparsable = handlers.filter((h) => h.status === 'unparsable')

  if (patchedHandlers.length === 0) {
    return {
      relPath,
      action: 'skip',
      reason: handlers.length === 0 ? 'no handlers found' : 'all unparsable',
      handlers: handlers.map((h) => `${h.method}(${h.status})`),
    }
  }

  const finalContent = ensureImport(transformed)

  if (options.execute) {
    writeFileSync(absPath, finalContent, 'utf-8')
  }

  return {
    relPath,
    action: options.execute ? 'applied' : 'would-apply',
    handlers: handlers.map((h) => `${h.method}${h.status === 'patched' ? '' : '!' + h.status}`),
    unparsable: unparsable.length,
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
  const skippedAuth = results.filter((r) => r.action === 'skip' && r.reason === 'already has auth')
  const skippedPublic = results.filter((r) => r.action === 'skip' && r.reason === 'PUBLIC_INTENTIONAL')
  const skippedOther = results.filter((r) => r.action === 'skip' && !['already has auth', 'PUBLIC_INTENTIONAL'].includes(r.reason))

  console.log(`\n=== apply-auth-middleware · Wave 13 ===`)
  console.log(`Mode: ${execute ? 'EXECUTE (writes files)' : 'dry-run (no writes)'}`)
  console.log(`Total routes: ${results.length}`)
  console.log(`  ${execute ? 'Applied' : 'Would apply'}: ${applied.length}`)
  console.log(`  Skipped (already auth): ${skippedAuth.length}`)
  console.log(`  Skipped (PUBLIC_INTENTIONAL): ${skippedPublic.length}`)
  console.log(`  Skipped (other): ${skippedOther.length}`)

  if (applied.length > 0) {
    console.log(`\n--- ${execute ? 'Applied' : 'Would apply'} ---`)
    for (const r of applied) {
      console.log(`  ${r.relPath} · handlers: [${r.handlers.join(', ')}]`)
    }
  }

  if (skippedOther.length > 0) {
    console.log(`\n--- Skipped (no recognizable handlers) ---`)
    for (const r of skippedOther) console.log(`  ${r.relPath} · ${r.reason}`)
  }
}

main()
