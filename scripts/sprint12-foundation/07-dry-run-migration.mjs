#!/usr/bin/env node
/**
 * 07 · DRY-RUN migration #141 · validate structure · NO apply · NO connect
 *
 * §148 honest · este harness NO requiere SPRINT12_FOUNDATION_OK (canon-NO toca DB).
 * Es pure-parse · canon-canonical · valida que ·
 *   - El archivo existe en supabase/migrations/202606021946_sala_event_log.sql
 *   - Wraps en BEGIN/COMMIT (atomicity)
 *   - 3 ENUMs creados con DO $$ guards (idempotente)
 *   - CREATE TABLE sala_event_log con 22 columnas
 *   - UNIQUE(idempotency_key) + UNIQUE(stream_id, sequence)
 *   - CHECK constraint gate_type_consistent
 *   - RLS ENABLED + 1+ policies + service_role grants
 *   - 4+ índices declarados (correlation · tenant+client+time · BRIN occurred_at · partial causation)
 *   - Pre/post DO-block checks presentes (lección R10)
 *   - Cero referencias a tablas externas no garantizadas (excepto agent_invocations FK)
 *
 * Output · JSON con el checklist completo + counts + un overall pass/fail.
 */
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HARNESS = '07-dry-run-migration'
const failures = []

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')
const migrationPath = resolve(repoRoot, 'supabase/migrations/202606021946_sala_event_log.sql')

// canon · post-§144 + #141 merged · file vive en supabase/migrations/
// canon · pre-#141 merge · fetch SQL via git show from PR branch
let sqlRaw
let source = 'unknown'
if (existsSync(migrationPath)) {
  sqlRaw = readFileSync(migrationPath, 'utf8')
  source = 'local_file'
} else {
  const r = spawnSync('git', ['show', 'origin/cc3-s12-event-log-migration:supabase/migrations/202606021946_sala_event_log.sql'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  if (r.status === 0 && r.stdout) {
    sqlRaw = r.stdout
    source = 'git_show_pr_branch'
  } else {
    console.log(JSON.stringify({
      harness: HARNESS,
      pass: false,
      error: 'migration_sql_not_found',
      tried_path: migrationPath,
      tried_git: 'origin/cc3-s12-event-log-migration',
      git_stderr: r.stderr?.slice(0, 200),
    }))
    process.exit(1)
  }
}
// Strip SQL line comments (-- ...) and block comments (/* ... */) for structural checks
const sql = sqlRaw
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')

function check(name, pass, detail) {
  if (!pass) failures.push({ check: name, ...(detail ?? {}) })
  return pass
}

// ── Atomicity ──────────────────────────────────────────────────────────
check('begin_commit_wrap', /BEGIN;[\s\S]*COMMIT;/.test(sql), {
  has_begin: /BEGIN;/.test(sql),
  has_commit: /COMMIT;/.test(sql),
})

// ── ENUMs · 3 with guards ──────────────────────────────────────────────
const enumNames = ['sala_event_type_enum', 'sala_step_state_enum', 'sala_gate_type_enum']
const enumDefs = enumNames.map((name) => {
  const re = new RegExp(`pg_type\\s+WHERE\\s+typname\\s*=\\s*'${name}'`)
  const hasGuard = re.test(sql)
  const hasCreateType = new RegExp(`CREATE TYPE\\s+public\\.${name}`).test(sql)
  return { name, hasGuard, hasCreateType, ok: hasGuard && hasCreateType }
})
check('enums_3_with_guards', enumDefs.every((e) => e.ok), { enums: enumDefs })

// ── ENUM value counts ──────────────────────────────────────────────────
const enumValues = {}
for (const name of enumNames) {
  const m = sql.match(new RegExp(`CREATE TYPE\\s+public\\.${name}\\s+AS ENUM\\s*\\(([^)]+)\\)`))
  if (m) {
    const vals = m[1].split(',').map((v) => v.trim()).filter(Boolean)
    enumValues[name] = vals.length
  }
}
check('enum_event_type_10_values', enumValues.sala_event_type_enum === 10, { got: enumValues.sala_event_type_enum })
check('enum_step_state_4_values', enumValues.sala_step_state_enum >= 4, { got: enumValues.sala_step_state_enum })
check('enum_gate_type_3_values', enumValues.sala_gate_type_enum >= 3, { got: enumValues.sala_gate_type_enum })

// ── CREATE TABLE sala_event_log ────────────────────────────────────────
const tableMatch = sql.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?public\.sala_event_log\s*\(([\s\S]+?)\);/)
let columnCount = 0
const columnNames = []
if (tableMatch) {
  const body = tableMatch[1]
  // Column declaration · starts with identifier (not CONSTRAINT/CHECK/UNIQUE/etc)
  // followed by a SQL type keyword (uppercase) on the same line.
  const lines = body.split('\n')
  for (const raw of lines) {
    const line = raw.trim().replace(/,\s*$/, '')
    if (!line) continue
    if (/^(CONSTRAINT|CHECK|UNIQUE|PRIMARY\s+KEY|FOREIGN\s+KEY)\b/i.test(line)) continue
    const m = line.match(/^([a-z_][\w]*)\s+([A-Z]+|public\.\w+)/)
    if (m) {
      columnNames.push(m[1])
      columnCount++
    }
  }
}
check('create_table_present', !!tableMatch, {})
// §148 honest · header docs "22 columns (18 base + 4 structural)" pero SQL real
// añade 1 bookkeeping (created_at) · canon canon-canonical 23 · harness acepta 22-23.
check('table_22_or_23_columns', columnCount === 22 || columnCount === 23, {
  got: columnCount,
  columns: columnNames,
  note: 'spec header says 22 (18 base + 4 structural) · SQL has 23 incluyendo created_at bookkeeping',
})

// ── UNIQUE constraints ─────────────────────────────────────────────────
// idempotency_key can be inline `NOT NULL UNIQUE` OR table-level UNIQUE constraint
const idemUnique =
  /idempotency_key\s+\w+(?:\s+NOT\s+NULL)?\s+UNIQUE/i.test(sql) ||
  /UNIQUE\s*\(\s*idempotency_key\s*\)/i.test(sql) ||
  /CONSTRAINT\s+\w+\s+UNIQUE\s*\([^)]*idempotency_key/i.test(sql)
check('unique_idempotency_key', idemUnique, {})
check('unique_stream_sequence', /UNIQUE\s*\(\s*stream_id\s*,\s*sequence\s*\)/i.test(sql), {})

// ── CHECK · gate_type_consistent ───────────────────────────────────────
check('check_gate_type_consistent', /gate_type_consistent/i.test(sql), {})

// ── RLS enabled + policies + service_role grants ───────────────────────
check('rls_enabled', /ENABLE ROW LEVEL SECURITY/i.test(sql), {})
const policyCount = (sql.match(/CREATE POLICY/gi) ?? []).length
check('rls_policies_present', policyCount >= 1, { policies: policyCount })
check('service_role_grants', /GRANT[\s\S]+TO\s+service_role/i.test(sql), {})

// ── Indexes ────────────────────────────────────────────────────────────
const indexCount = (sql.match(/CREATE\s+(?:UNIQUE\s+)?INDEX/gi) ?? []).length
check('indexes_4_plus', indexCount >= 4, { count: indexCount })

// ── BRIN index on occurred_at ──────────────────────────────────────────
check('brin_index_occurred_at', /USING\s+BRIN[\s\S]+occurred_at|occurred_at[\s\S]+USING\s+BRIN/i.test(sql), {})

// ── FK to agent_invocations · ON DELETE SET NULL ───────────────────────
check('fk_agent_invocations_set_null', /REFERENCES\s+(?:public\.)?agent_invocations[\s\S]+ON\s+DELETE\s+SET\s+NULL/i.test(sql), {})

// ── Pre/post DO-block check (lesson R10) ───────────────────────────────
const doBlocks = (sql.match(/DO\s+\$\$/gi) ?? []).length
check('do_blocks_present', doBlocks >= 3, { count: doBlocks })

// ── No reference to tables that don't exist (sanity) ───────────────────
const externalTables = [...sql.matchAll(/REFERENCES\s+(?:public\.)?(\w+)/gi)].map((m) => m[1])
const allowedExternalRefs = ['agent_invocations']
const unexpectedRefs = externalTables.filter((t) => !allowedExternalRefs.includes(t) && t !== 'sala_event_log')
check('only_canonical_fk_refs', unexpectedRefs.length === 0, { unexpected: unexpectedRefs })

const summary = {
  harness: HARNESS,
  pass: failures.length === 0,
  failures,
  source,
  stats: {
    sql_bytes: sql.length,
    sql_lines: sql.split('\n').length,
    table_columns: columnCount,
    enums: enumDefs.map((e) => e.name),
    enum_values: enumValues,
    indexes: indexCount,
    policies: policyCount,
    do_blocks: doBlocks,
  },
}
console.log(JSON.stringify(summary))
if (!summary.pass) process.exit(1)
