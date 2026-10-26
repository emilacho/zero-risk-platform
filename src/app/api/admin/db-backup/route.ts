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
import { createGzip } from 'node:zlib'
import { createWriteStream, readFileSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { volcarTodo } from '@/lib/db-backup/volcado'

export const runtime = 'nodejs'
export const maxDuration = 290
// La base vive en eu-west-1 (Irlanda): la función corre en Dublín para que cada ida y vuelta del volcado cueste milisegundos, no ~80 ms desde EE. UU.
export const preferredRegion = 'dub1'

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

    // STREAMING: cada lote de filas pasa por gzip y baja a /tmp en cuanto está listo. En memoria vive un lote,
    // no los ~236 MB de la base (antes: string gigante + Buffer + gzipSync → la función moría por memoria).
    const gzip = createGzip({ level: 6 })
    const salida = createWriteStream(tmpPath)
    tmpWritten = true
    let falla: Error | null = null
    const terminado = new Promise<void>((resolve, reject) => {
      salida.on('finish', () => resolve())
      salida.on('error', (e) => { falla = e; reject(e) })
      gzip.on('error', (e) => { falla = e; reject(e) })
    })
    terminado.catch(() => { /* el error real sale por escribir() o por el await de abajo */ })
    gzip.pipe(salida)
    const escribir = (texto: string) =>
      new Promise<void>((resolve, reject) => {
        if (falla) return reject(falla)
        if (gzip.write(texto, 'utf8')) return resolve()
        const seguir = () => { gzip.off('error', fallo); resolve() }
        const fallo = (e: Error) => { gzip.off('drain', seguir); reject(e) }
        gzip.once('drain', seguir)
        gzip.once('error', fallo)
      })
    const volcado = await volcarTodo(pg as never, tables, escribir)
    gzip.end()
    await terminado
    const totalRows = volcado.filas
    const sizeBytes = statSync(tmpPath).size

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

    const incompleto = volcado.tablas_con_error.length > 0
    if (incompleto) {
      Sentry.captureMessage('db-backup: respaldo INCOMPLETO', {
        level: 'error',
        tags: { category: 'db_backup' },
        extra: { tablas_con_error: volcado.tablas_con_error.slice(0, 20) },
      })
    }
    return NextResponse.json({
      success: !incompleto,
      ...(incompleto ? { partial: true, tables_failed: volcado.tablas_con_error } : {}),
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
