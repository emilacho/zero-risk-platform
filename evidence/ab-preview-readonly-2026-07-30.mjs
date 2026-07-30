// A/B SOLO-LECTURA · PR #304 · autorizado por Lenovo (endoso del Consejero §3)
// Pasos 1-3, 5, 6 del plan de verificación. PASO 4 (escritura) NO se ejecuta.
// Cero escrituras: todas las llamadas son GET.
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);

const PROD = 'https://zero-risk-platform.vercel.app';
const PREVIEW = 'https://zero-risk-platform-git-fix-supabase-no-store-cache-zero-risk1.vercel.app';
const SB = env.NEXT_PUBLIC_SUPABASE_URL;
const BYPASS = process.env.VERCEL_BYPASS;

const appHeaders = (bypass) => ({
  'x-api-key': env.INTERNAL_API_KEY,
  ...(bypass ? { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'false' } : {}),
});
const sbHeaders = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };

const out = [];
const log = (s) => { console.log(s); out.push(s); };

async function getJson(url, headers) {
  const r = await fetch(url, { headers });
  const text = await r.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* html u otra cosa */ }
  return { status: r.status, body, raw: text.slice(0, 160) };
}

const pct = (a, b) => (b === 0 ? 'n/a' : `${((a / b) * 100).toFixed(1)}%`);

(async () => {
  log(`# A/B solo-lectura · ${new Date().toISOString()}`);
  log(`prod=${PROD}`);
  log(`preview=${PREVIEW}`);
  log('');

  // ---------- PASO 2 · la VERDAD en la base ----------
  const truth = await getJson(
    `${SB}/rest/v1/hitl_pending_approvals?select=item_id,status,created_at&status=eq.pending&order=created_at.asc&limit=100`,
    sbHeaders
  );
  const truthIds = new Set((truth.body || []).map((r) => r.item_id));
  log(`## PASO 2 · verdad en la base`);
  log(`filas pending (tope 100): ${truthIds.size}`);
  log('');

  // ---------- PASO 1 · el endpoint, en los dos lados ----------
  const path = '/api/hitl/approvals/pending?limit=100';
  const arms = [
    ['A · PRODUCCIÓN (sin arreglo)', `${PROD}${path}`, false],
    ['B · VISTA PREVIA (con arreglo)', `${PREVIEW}${path}`, true],
  ];

  log(`## PASOS 1+3 · endpoint vs verdad`);
  const results = {};
  for (const [label, url, bypass] of arms) {
    const res = await getJson(url, appHeaders(bypass));
    if (res.status !== 200 || !res.body?.items) {
      log(`${label}: HTTP ${res.status} · ${res.raw}`);
      results[label] = null;
      continue;
    }
    const ids = (res.body.items || []).map((i) => i.item_id);
    const inTruth = ids.filter((id) => truthIds.has(id)).length;
    const statuses = {};
    for (const i of res.body.items) statuses[i.status] = (statuses[i.status] || 0) + 1;
    log(`${label}`);
    log(`  count=${res.body.count} · estados servidos=${JSON.stringify(statuses)}`);
    log(`  coincidencia con la verdad: ${inTruth}/${ids.length} = ${pct(inTruth, ids.length)}`);
    results[label] = { ids, inTruth, count: res.body.count };
  }
  log('');

  // ---------- PASO 5+6 · muestreo de otras rutas afectadas ----------
  log(`## PASOS 5+6 · otras rutas afectadas · prod vs vista previa`);
  const sample = [
    '/api/dashboard',                    // paso 6 · pasaba de horneada a dinámica
    '/api/agents/status',                // paso 6 · idem
    '/api/dashboard/metrics',            // paso 5
    '/api/agent-invocations/recent?limit=5',
    '/api/cost-usage',
  ];
  for (const p of sample) {
    const a = await getJson(`${PROD}${p}`, appHeaders(false));
    const b = await getJson(`${PREVIEW}${p}`, appHeaders(true));
    const sa = a.body ? JSON.stringify(a.body).length : 0;
    const sb = b.body ? JSON.stringify(b.body).length : 0;
    const igual = a.body && b.body ? JSON.stringify(a.body) === JSON.stringify(b.body) : null;
    log(`${p}`);
    log(`  prod HTTP ${a.status} (${sa}b) · preview HTTP ${b.status} (${sb}b) · cuerpos idénticos: ${igual === null ? 'n/a' : igual}`);
  }
  log('');
  log('## PASO 4 · NO EJECUTADO (es una escritura · diferido a momento controlado)');

  fs.writeFileSync(new URL('./ab-preview-readonly-2026-07-30.log', import.meta.url), out.join('\n') + '\n');
})();
