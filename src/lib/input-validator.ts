/**
 * Input validator · Wave 14 · CC#1
 *
 * Centralized request-body validation using Ajv 2020-12 + ajv-formats.
 * Schemas live in `src/lib/contracts/inputs/` as JSON files and are loaded
 * lazily on first use, then cached per-name.
 *
 * Wire into a route like:
 *
 *   import { validateInput } from '@/lib/input-validator'
 *
 *   export async function POST(request: Request) {
 *     const v = await validateInput<MyType>(request, 'my-schema-name')
 *     if (!v.ok) return v.response
 *     const body = v.data
 *     // ... happy path
 *   }
 *
 * Authentication should run BEFORE validation (401 before 400). The validator
 * does not handle auth — it only checks structure + types + required fields.
 */
import Ajv, { type ValidateFunction, type ErrorObject } from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { NextResponse } from 'next/server'
import path from 'node:path'
import fs from 'node:fs'

// ---------- Ajv instance (singleton) ----------

const ajv = new Ajv({
  allErrors: true,
  removeAdditional: false,
  useDefaults: true,
  coerceTypes: false,
  // strict catches schema bugs (unknown keywords, malformed types) but
  // strictRequired rejects `anyOf: [{required:[X]}]` patterns where X lives
  // in the parent's `properties`. Our schemas use that pattern legitimately
  // (e.g. agents-run accepts agent | agent_id | agent_slug | ...), so we
  // disable strictRequired only.
  strict: true,
  strictRequired: false,
  strictSchema: true,
  // Several routes legitimately accept multiple JSON types for the same field
  // (e.g. result: object | array | string | null). Allow union-type declarations.
  allowUnionTypes: true,
})
addFormats(ajv)

// Compiled-validator cache keyed by schema name (filename without .json).
const validators = new Map<string, ValidateFunction>()

// Schema directory — resolved relative to this file. Works in both `next dev`
// (where __dirname points into .next/server) and tests (where it resolves to
// src/lib). We compute multiple candidate roots and pick the first that exists.
function schemaDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'src/lib/contracts/inputs'),
    path.resolve(__dirname, 'contracts/inputs'),
    path.resolve(__dirname, '..', 'contracts/inputs'),
  ]
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir
  }
  return candidates[0]
}

function loadSchema(name: string): ValidateFunction {
  const cached = validators.get(name)
  if (cached) return cached

  const file = path.join(schemaDir(), `${name}.json`)
  if (!fs.existsSync(file)) {
    throw new Error(`input-validator: schema not found at ${file}`)
  }
  const raw = fs.readFileSync(file, 'utf8')
  let schema: object
  try {
    schema = JSON.parse(raw)
  } catch (err) {
    throw new Error(`input-validator: schema "${name}" is not valid JSON: ${err instanceof Error ? err.message : String(err)}`)
  }
  const compiled = ajv.compile(schema)
  validators.set(name, compiled)
  return compiled
}

// ---------- Public API ----------

export type ValidationOk<T> = { ok: true; data: T }
export type ValidationFail = { ok: false; response: NextResponse; errors: ErrorObject[] }
export type ValidationResult<T> = ValidationOk<T> | ValidationFail

/**
 * Validate a request body against a named JSON Schema.
 *
 * On success: returns `{ ok: true, data }` where `data` is the parsed body
 * (mutated by Ajv defaults if `default` is declared).
 *
 * On failure: returns `{ ok: false, response, errors }` — the caller should
 * `return v.response` immediately. HTTP 400 with code `E-INPUT-INVALID` and
 * the Ajv error list is included in the response body.
 *
 * If the body cannot be parsed as JSON: HTTP 400 with code `E-INPUT-PARSE`.
 *
 * Auth check (401) MUST happen before this — validation should never reveal
 * schema details to unauthenticated callers.
 */
export async function validateInput<T = unknown>(
  request: Request,
  schemaName: string,
): Promise<ValidationResult<T>> {
  let body: unknown
  try {
    body = await request.json()
  } catch (err) {
    return {
      ok: false,
      errors: [],
      response: NextResponse.json(
        {
          error: 'invalid_json',
          code: 'E-INPUT-PARSE',
          detail: err instanceof Error ? err.message : 'Body is not valid JSON',
        },
        { status: 400 },
      ),
    }
  }

  let validator: ValidateFunction
  try {
    validator = loadSchema(schemaName)
  } catch (err) {
    // Schema mis-config is a server-side bug, not a client error.
    return {
      ok: false,
      errors: [],
      response: NextResponse.json(
        {
          error: 'schema_load_failed',
          code: 'E-INPUT-SCHEMA',
          detail: err instanceof Error ? err.message : String(err),
        },
        { status: 500 },
      ),
    }
  }

  const valid = validator(body)
  if (valid) {
    return { ok: true, data: body as T }
  }

  const errors = validator.errors ?? []
  return {
    ok: false,
    errors,
    response: NextResponse.json(
      {
        error: 'validation_error',
        code: 'E-INPUT-INVALID',
        detail: formatErrors(errors),
        errors,
      },
      { status: 400 },
    ),
  }
}

/**
 * Validate an already-parsed object against a schema. Useful when the caller
 * has its own JSON-parsing layer (e.g. a webhook with a verification step
 * that consumes the body first).
 */
export function validateObject<T = unknown>(
  payload: unknown,
  schemaName: string,
): ValidationResult<T> {
  let validator: ValidateFunction
  try {
    validator = loadSchema(schemaName)
  } catch (err) {
    return {
      ok: false,
      errors: [],
      response: NextResponse.json(
        {
          error: 'schema_load_failed',
          code: 'E-INPUT-SCHEMA',
          detail: err instanceof Error ? err.message : String(err),
        },
        { status: 500 },
      ),
    }
  }
  const valid = validator(payload)
  if (valid) return { ok: true, data: payload as T }
  const errors = validator.errors ?? []
  return {
    ok: false,
    errors,
    response: NextResponse.json(
      {
        error: 'validation_error',
        code: 'E-INPUT-INVALID',
        detail: formatErrors(errors),
        errors,
      },
      { status: 400 },
    ),
  }
}

function formatErrors(errors: ErrorObject[]): string {
  if (errors.length === 0) return 'Unknown validation error'
  return errors
    .slice(0, 3)
    .map(e => {
      const where = e.instancePath || '(root)'
      return `${where} ${e.message ?? 'invalid'}`
    })
    .join('; ')
}

// ---------- Test hooks ----------

/**
 * Reset the compiled-validator cache. Test-only — production routes should
 * never call this since schemas are immutable on disk.
 *
 * Also drops schemas from the Ajv instance so re-compilation under the same
 * `$id` doesn't trigger Ajv's "already exists" guard.
 */
export function _resetValidatorCache(): void {
  for (const name of validators.keys()) {
    try {
      ajv.removeSchema(name)
    } catch {
      // ignore — schema may have been added without $id
    }
  }
  validators.clear()
}
