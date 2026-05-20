#!/usr/bin/env node
/**
 * Apply Sprint 4 Forms + Landings migrations to production Supabase.
 *
 * Usage · `node scripts/apply-sprint4-forms-landings-prod.mjs`
 *
 * Requires .env.local with ·
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_ACCESS_TOKEN  (Personal Access Token · scope · projects.database)
 *
 * Idempotent · uses CREATE TABLE IF NOT EXISTS · seed uses ON CONFLICT DO UPDATE.
 *
 * Per CC#2 dispatch [CC2-SPRINT4-FORMS-LANDINGS] · PARKED state pending PAT restore
 * (PAT 401 during initial run · likely rotated by parallel CC writing .env.local).
 */
import fs from 'node:fs';
import path from 'node:path';

const env = fs.readFileSync(path.resolve('.env.local'), 'utf8')
  .split('\n')
  .reduce((acc, l) => {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) acc[m[1]] = m[2].replace(/^"|"$/g, '');
    return acc;
  }, {});

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const pat = env.SUPABASE_ACCESS_TOKEN;
if (!url || !pat) {
  console.error('FAIL · missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_ACCESS_TOKEN in .env.local');
  process.exit(2);
}
const ref = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i)[1];
console.log(`project_ref: ${ref}`);

const files = [
  '202605201000_forms.sql',
  '202605201100_form_submissions.sql',
  '202605201300_landings.sql',
];

const runQuery = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return { status: r.status, body: await r.text() };
};

console.log('\n--- preflight · PAT validity probe ---');
const preflight = await runQuery(`SELECT 1 AS ok;`);
if (preflight.status === 401) {
  console.error('FAIL · PAT returns 401 · refresh SUPABASE_ACCESS_TOKEN in .env.local');
  console.error('  body:', preflight.body);
  process.exit(1);
}
console.log(`preflight ok · status ${preflight.status}`);

console.log('\n--- applying 3 migrations ---');
for (const f of files) {
  const sql = fs.readFileSync(path.resolve('supabase/migrations', f), 'utf8');
  const res = await runQuery(sql);
  const ok = res.status >= 200 && res.status < 300;
  console.log(`${ok ? 'OK ' : 'FAIL'}  ${f.padEnd(40)} → ${res.status}`);
  if (!ok) {
    console.error(`   body: ${res.body.slice(0, 600)}`);
    process.exit(1);
  }
}

console.log('\n--- seed Náufrago Surf landing (ON CONFLICT DO UPDATE) ---');
const seedSql = `INSERT INTO landings (
  slug, title, hero_headline, hero_subhead, cta_text, cta_url,
  sections, meta_description, vertical, is_active
) VALUES (
  'naufrago-surf',
  'Náufrago Surf Escape',
  'Aprende a surfear donde rompe la mejor ola del Pacífico',
  'Retiros de surf de 3 días en Mompiche · clases para todos los niveles · instructores certificados ISA · alojamiento incluido',
  'Reservá tu cupo',
  'https://tally.so/r/naufrago-surf-booking',
  '[
    {"type":"feature_grid","title":"¿Qué incluye tu retiro?","items":[
      {"icon":"🌊","title":"6 sesiones de surf","body":"3 clases prácticas + 3 sesiones libres con instructor cerca · todos los niveles bienvenidos"},
      {"icon":"🏄","title":"Tabla + traje incluidos","body":"Equipamiento profesional Channel Islands · trajes Quiksilver 2/2mm calibrados para Mompiche"},
      {"icon":"🏡","title":"Alojamiento frente al mar","body":"Cabañas privadas a 80 metros de la rompiente · desayuno + cena incluidos"}
    ]},
    {"type":"testimonial","quote":"Llegué sin saber pararme en la tabla y a los 3 días estaba surfeando olas de pecho · el equipo es buenísimo.","author":"Mariana C.","role":"Sprint 1 · marzo 2026"},
    {"type":"text_block","title":"Mompiche · el secreto mejor guardado","body":"Mompiche es una rompiente de izquierdas que funciona 320 días al año. Olas largas, sin multitudes, agua templada todo el año (24-27°C). Tres horas desde Quito en bus · una vida de distancia del estrés. Llegás un viernes a las 6pm · te vas el lunes con la cabeza limpia."},
    {"type":"cta_band","headline":"Próximos retiros · junio 2026","cta_text":"Reservá ahora","cta_url":"https://tally.so/r/naufrago-surf-booking"}
  ]'::jsonb,
  'Retiros de surf en Mompiche Ecuador · 3 días · clases + alojamiento incluido · Náufrago Surf Escape',
  'surf',
  true
) ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  hero_headline = EXCLUDED.hero_headline,
  hero_subhead = EXCLUDED.hero_subhead,
  cta_text = EXCLUDED.cta_text,
  cta_url = EXCLUDED.cta_url,
  sections = EXCLUDED.sections,
  meta_description = EXCLUDED.meta_description,
  vertical = EXCLUDED.vertical,
  is_active = true,
  updated_at = now()
RETURNING slug, title;`;
const seedRes = await runQuery(seedSql);
console.log(`seed status: ${seedRes.status}`);
console.log(`seed rows: ${seedRes.body}`);

console.log('\n--- verify · 3 tables exist ---');
const v1 = await runQuery(`SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('forms','form_submissions','landings') ORDER BY table_name;`);
console.log(`rows: ${v1.body}`);

console.log('\n--- verify · RLS policies ---');
const v2 = await runQuery(`SELECT tablename, policyname, roles, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('forms','form_submissions','landings')
ORDER BY tablename, policyname;`);
console.log(`rows: ${v2.body}`);

console.log('\n--- verify · Náufrago landing seeded ---');
const v3 = await runQuery(`SELECT slug, title, vertical, is_active FROM landings WHERE slug = 'naufrago-surf';`);
console.log(`rows: ${v3.body}`);

console.log('\n--- DONE ---');
