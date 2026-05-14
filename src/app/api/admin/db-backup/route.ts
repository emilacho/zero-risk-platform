/**
 * POST /api/admin/db-backup
 *
 * Weekly DB backup endpoint · pure-JS Postgres dump → Supabase Storage.
 *
 * Vercel functions do not ship pg_dump as a system binary, so this uses the
 * node-postgres (`pg`) client to enumerate BASE TABLEs in the relevant
 * schemas, serialize their rows as INSERT statements, gzip the result, and
 * upload to the `db-backups` Supabase Storage bucket.
 *
 * Schema-level DDL (CREATE TABLE, functions, RLS) is NOT included — that
 * lives in supabase/migrations/ under source control. This dump is for
 * row-data recovery only.
 *
 * Auth · `x-api-key` header must equal `process.env.INTERNAL_API_KEY`
 * (same pattern as /api/agents/run-sdk · timing-safe compare).
 *
 * Required env vars:
 *   INTERNAL_API_KEY           caller auth
 *   SUPABASE_DB_URL            postgresql://postgres:<pw>@db.<proj>.supabase.co:5432/postgres
 *   NEXT_PUBLIC_SUPABASE_URL   for the Storage client (used by getSupabaseAdmin)
 *   SUPABASE_SERVICE_ROLE_KEY  for the Storage upload (bypass RLS)
 *
 * Storage bucket requirements:
 *   name        = "db-backups"
 *   public      = false
 *   size limit  = 500 MB
 *   MIME types  = application/gzip
 */
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { Client } from 'pg'
import { gzipSync } from 'node:zlib'
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 290

const BUCKET_NAME = 'db-backups'

// Schemas managed by Postgres or Supabase platform internals. We never dump
// them — they are recreated from extensions/migrations on restore.
const EXCLUDED_SCHEMAS = new Set([
  'pg_catalog',
  'pg_toast',
  'information_schema',
  'extensions',
  'graphql',
  'graphql_public',
  'realtime',
  'storage',
  'vault',
  'auth',
  'net',
  'pgsodium',
  'pgsodium_masks',
  'cron',
  'supabase_functions',
  'supabase_migrations',
])

function isoStamp(): string {
  // 2026-05-14T15-32-08 (drop millis · colon-safe for filenames)
  return new Date()
    .toISOString()
    .replace(/\.\d{3}Z$/, '')
    .replace(/:/g, '-')
}

function sqlQuote(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (value instanceof Date) return `'${value.toISOString()}'`
  if (Buffer.isBuffer(value)) return `'\\x${value.toString('hex')}'`
  if (typeof value === 'object') {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`
  }
  return `'${String(value).replace(/'/g, "''")}'`
}

interface TableInfo {
  schema: string
  name: string
}

async function listTables(pg: Client): Promise<TableInfo[]> {
  const result = await pg.query<{ table_schema: string; table_name: string }>(
    `SELECT table_schema, table_name
     FROM information_schema.tables
     WHERE table_type = 'BASE TABLE'
       AND table_schema NOT LIKE 'pg_temp_%'
       AND table_schema NOT LIKE 'pg_toast_temp_%'
     ORDER BY table_schema, table_name`,
  )
  return result.rows
    .filter((r) => !EXCLUDED_SCHEMAS.has(r.table_schema))
    .map((r) => ({ schema: r.table_schema, name: r.table_name }))
}

async function dumpTable(pg: Client, table: TableInfo): Promise<{ sql: string; rowCount: number }> {
  const fq = `"${table.schema}"."${table.name}"`
  const colInfo = await pg.query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2
     ORDER BY ordinal_position`,
    [table.schema, table.name],
  )
  const cols = colInfo.rows.map((r) => r.column_name)
  if (!cols.length) {
    return { sql: `-- skipped ${fq} (no columns visible)\n\n`, rowCount: 0 }
  }

  const rows = await pg.query(`SELECT * FROM ${fq}`)
  const colList = cols.map((c) => `"${c}"`).join(', ')

  const lines: string[] = [`-- ${fq} · ${rows.rows.length} rows`]
  if (!rows.rows.length) {
    return { sql: lines.join('\n') + '\n\n', rowCount: 0 }
  }
  for (const row of rows.rows) {
    const values = cols.map((c) => sqlQuote((row as Record<string, unknown>)[c])).join(', ')
    lines.push(`INSERT INTO ${fq} (${colList}) VALUES (${values});`)
  }
  return { sql: lines.join('\n') + '\n\n', rowCount: rows.rows.length }
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  const dbUrl = process.env.SUPABASE_DB_URL
  if (!dbUrl) {
    Sentry.captureMessage('db-backup: SUPABASE_DB_URL not configured', {
      level: 'error',
      tags: { category: 'db_backup' },
    })
    return NextResponse.json(
      { success: false, error: 'SUPABASE_DB_URL env var missing' },
      { status: 500 },
    )
  }

  const stamp = isoStamp()
  const filename = `db-backup-${stamp}.sql.gz`
  const tmpPath = join('/tmp', filename)

  const pg = new Client({
    connectionString: dbUrl,
    ssl: dbUrl.includes('supabase.co') ? { rejectUnauthorized: false } : undefined,
    statement_timeout: 240_000,
    query_timeout: 240_000,
  })

  let tmpWritten = false
  try {
    await pg.connect()

    const tables = await listTables(pg)

    const headerLines = [
      `-- Zero Risk · weekly DB backup`,
      `-- Generated: ${new Date().toISOString()}`,
      `-- Tables: ${tables.length}`,
      `-- Schema DDL (CREATE TABLE / RLS / functions) lives in supabase/migrations/`,
      ``,
      `SET statement_timeout = 0;`,
      `SET client_encoding = 'UTF8';`,
      `SET standard_conforming_strings = on;`,
      `SET search_path = public;`,
      ``,
      ``,
    ]

    const tableDumps: string[] = []
    let totalRows = 0
    for (const t of tables) {
      try {
        const { sql, rowCount } = await dumpTable(pg, t)
        tableDumps.push(sql)
        totalRows += rowCount
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        tableDumps.push(`-- ERROR dumping "${t.schema}"."${t.name}": ${msg}\n\n`)
        Sentry.captureMessage(`db-backup: dump failed for ${t.schema}.${t.name}`, {
          level: 'warning',
          tags: { category: 'db_backup' },
          extra: { error: msg },
        })
      }
    }

    const sqlText = headerLines.join('\n') + tableDumps.join('')
    const gz = gzipSync(Buffer.from(sqlText, 'utf-8'), { level: 9 })
    writeFileSync(tmpPath, gz)
    tmpWritten = true
    const sizeBytes = gz.byteLength

    const supabase = getSupabaseAdmin()
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filename, readFileSync(tmpPath), {
        contentType: 'application/gzip',
        upsert: false,
      })

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`)
    }

    return NextResponse.json({
      success: true,
      filename,
      size_bytes: sizeBytes,
      uploaded_at: new Date().toISOString(),
      storage_path: `${BUCKET_NAME}/${filename}`,
      tables_dumped: tables.length,
      rows_dumped: totalRows,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    Sentry.captureException(
      err instanceof Error ? err : new Error(msg),
      { tags: { category: 'db_backup' } },
    )
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 },
    )
  } finally {
    if (tmpWritten) {
      try { unlinkSync(tmpPath) } catch { /* best-effort */ }
    }
    try { await pg.end() } catch { /* best-effort */ }
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/admin/db-backup',
    method: 'POST',
    runtime: 'nodejs',
    description:
      'Weekly DB backup · enumerates BASE TABLEs in the public/zero-risk schemas, serializes rows as INSERT statements, gzips, uploads to the "db-backups" Supabase Storage bucket. Schema DDL is excluded · restored from supabase/migrations/.',
    requires_env: [
      'INTERNAL_API_KEY',
      'SUPABASE_DB_URL',
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
    ],
    storage: { bucket: BUCKET_NAME, contentType: 'application/gzip' },
  })
}
