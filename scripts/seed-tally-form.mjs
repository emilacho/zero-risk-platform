#!/usr/bin/env node
/**
 * scripts/seed-tally-form.mjs · Sprint 5 Track A · CC#2
 *
 * Idempotent seed for the canonical intake Tally form en la tabla `forms`.
 *
 * Pre-requisito · migrations PR #60 + #61 aplicadas a prod (forms + form_submissions + landings).
 *
 * Usage · `node scripts/seed-tally-form.mjs <tally_form_id>`
 *   donde <tally_form_id> es el ID del form que Emilio creó en Tally.
 *   Si se omite · usa placeholder 'PLACEHOLDER_UPDATE_POST_TALLY_CREATE'.
 *
 * Canonical schema · 6 campos · per vault decision 2026-05-20-tally-form-fields-canonical-schema.md
 *
 * Requires .env.local con · NEXT_PUBLIC_SUPABASE_URL + SUPABASE_ACCESS_TOKEN
 * Si PAT 401 · imprime SQL fallback para correr en Supabase SQL Editor.
 */
import fs from 'node:fs'
import path from 'node:path'

const env = fs
  .readFileSync(path.resolve('.env.local'), 'utf8')
  .split('\n')
  .reduce((acc, l) => {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) acc[m[1]] = m[2].replace(/^"|"$/g, '')
    return acc
  }, {})

const url = env.NEXT_PUBLIC_SUPABASE_URL
const pat = env.SUPABASE_ACCESS_TOKEN
if (!url) {
  console.error('FAIL · missing NEXT_PUBLIC_SUPABASE_URL in .env.local')
  process.exit(2)
}

const tallyFormId = process.argv[2] ?? 'PLACEHOLDER_UPDATE_POST_TALLY_CREATE'

const CANONICAL_SCHEMA = [
  { key: 'name', type: 'INPUT_TEXT', required: true, label: 'Nombre completo' },
  { key: 'email', type: 'INPUT_EMAIL', required: true, label: 'Email' },
  { key: 'phone', type: 'INPUT_PHONE_NUMBER', required: false, label: 'WhatsApp / teléfono' },
  {
    key: 'vertical',
    type: 'DROPDOWN',
    required: true,
    label: '¿En qué industria opera tu negocio?',
    options: ['surf', 'saas', 'b2b', 'ecom', 'agency', 'other'],
  },
  {
    key: 'journey_type',
    type: 'DROPDOWN',
    required: true,
    label: '¿Qué necesitás de Zero Risk?',
    options: ['ONBOARD', 'PRODUCE', 'ALWAYS_ON'],
    default: 'ONBOARD',
  },
  {
    key: 'brand_book_url',
    type: 'INPUT_TEXT',
    required: false,
    label: '¿Tenés un brand book existente? (URL opcional)',
  },
]

const seedDescription =
  'Form maestro de intake · dispatcha L1 ONBOARD journey via /api/forms/submit · 6 campos canónicos per decision 2026-05-20-tally-form-fields-canonical-schema.'

function buildSql(formId) {
  const desc = seedDescription.replace(/'/g, "''")
  const fields = JSON.stringify(CANONICAL_SCHEMA).replace(/'/g, "''")
  return `INSERT INTO forms (name, vertical, tally_form_id, description, schema_fields, is_active)
VALUES (
  'Cliente Intake · Onboarding · Sprint 5 canon',
  NULL,
  '${formId}',
  '${desc}',
  '${fields}'::jsonb,
  true
)
ON CONFLICT (tally_form_id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  schema_fields = EXCLUDED.schema_fields,
  is_active = true,
  updated_at = now()
RETURNING id, name, tally_form_id;`
}

async function main() {
  console.log(`tally_form_id: ${tallyFormId}`)
  console.log(`schema_fields: ${CANONICAL_SCHEMA.length} canonical fields`)

  const sql = buildSql(tallyFormId)

  if (!pat) {
    console.log('\nNo SUPABASE_ACCESS_TOKEN · printing SQL fallback for manual Supabase SQL Editor ·\n')
    console.log(sql)
    process.exit(0)
  }

  const ref = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i)[1]
  console.log(`project_ref: ${ref}`)

  const runQuery = async (query) => {
    const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
    return { status: r.status, body: await r.text() }
  }

  const preflight = await runQuery('SELECT 1 AS ok;')
  if (preflight.status === 401) {
    console.log('\nPAT 401 · printing SQL fallback for manual Supabase SQL Editor ·\n')
    console.log(sql)
    process.exit(1)
  }
  console.log(`preflight ok · status ${preflight.status}`)

  console.log('\n--- seeding canonical Tally intake form ---')
  const res = await runQuery(sql)
  if (res.status < 200 || res.status >= 300) {
    console.error(`FAIL · status ${res.status} · body ${res.body.slice(0, 500)}`)
    process.exit(1)
  }
  console.log(`status: ${res.status}`)
  console.log(`row: ${res.body}`)

  console.log('\n--- verify · forms table ---')
  const verify = await runQuery(
    `SELECT id, name, tally_form_id, is_active, jsonb_array_length(schema_fields) AS field_count FROM forms WHERE tally_form_id = '${tallyFormId}';`,
  )
  console.log(`verify: ${verify.body}`)

  if (tallyFormId === 'PLACEHOLDER_UPDATE_POST_TALLY_CREATE') {
    console.log(
      '\nReminder · cuando Emilio cree el form real en Tally · re-correr `node scripts/seed-tally-form.mjs <real_form_id>` para reemplazar el placeholder.',
    )
  }
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
