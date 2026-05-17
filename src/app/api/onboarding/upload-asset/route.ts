/**
 * POST /api/onboarding/upload-asset
 *
 * Multipart endpoint para el wizard onboarding (Step 2 logo · Step 3 multi-file).
 *
 * FormData fields:
 *   file     · File (required · max 25MB)
 *   slug     · string (required · kebab-case)
 *   folder   · string (optional · default 'onboarding-uploads' · also 'brand' for logos)
 *   filename · string (optional · default file.name)
 *
 * Returns:
 *   { ok, bucket, storage_path, public_url, bytes, content_type }
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const STORAGE_BUCKET = 'client-websites'
const MAX_BYTES = 25 * 1024 * 1024
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export async function POST(request: Request) {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_form_data', code: 'E-INPUT-FORM' }, { status: 400 })
  }

  const file = form.get('file')
  const slug = typeof form.get('slug') === 'string' ? (form.get('slug') as string).trim() : ''
  const folder = typeof form.get('folder') === 'string' ? (form.get('folder') as string).trim() : 'onboarding-uploads'
  const filenameOverride = typeof form.get('filename') === 'string' ? (form.get('filename') as string).trim() : ''

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'file_required', code: 'E-UPLOAD-FILE' }, { status: 400 })
  }
  if (!slug || !SLUG_PATTERN.test(slug)) {
    return NextResponse.json({ ok: false, error: 'invalid_slug', code: 'E-UPLOAD-SLUG' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: 'file_too_large', limit_mb: 25 }, { status: 413 })
  }
  if (!/^[a-z0-9-]+$/.test(folder)) {
    return NextResponse.json({ ok: false, error: 'invalid_folder', code: 'E-UPLOAD-FOLDER' }, { status: 400 })
  }

  const filename = sanitizeFilename(filenameOverride || file.name)
  const storagePath = `${slug}/${folder}/${Date.now()}-${filename}`
  const contentType = file.type || 'application/octet-stream'
  const arrayBuffer = await file.arrayBuffer()

  const supabase = getSupabaseAdmin()
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, arrayBuffer, {
    contentType,
    upsert: true,
  })
  if (error) {
    return NextResponse.json(
      { ok: false, error: 'storage_upload_failed', detail: error.message, path: storagePath },
      { status: 502 },
    )
  }

  const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${storagePath}`

  return NextResponse.json({
    ok: true,
    bucket: STORAGE_BUCKET,
    storage_path: storagePath,
    public_url: publicUrl,
    bytes: arrayBuffer.byteLength,
    content_type: contentType,
    filename,
  })
}

function sanitizeFilename(name: string): string {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : ''
  const base = name
    .slice(0, name.length - ext.length)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  const safeExt = ext.toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 12)
  return `${base || 'file'}${safeExt}`
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/onboarding/upload-asset',
    method: 'POST',
    purpose: 'Multipart upload from onboarding wizard · stores at client-websites/<slug>/<folder>/<timestamp>-<filename>',
    fields: {
      file: 'File (required · max 25MB)',
      slug: 'string (required · kebab-case)',
      folder: "string (optional · default 'onboarding-uploads' · 'brand' for logos)",
      filename: 'string (optional · default file.name)',
    },
  })
}
