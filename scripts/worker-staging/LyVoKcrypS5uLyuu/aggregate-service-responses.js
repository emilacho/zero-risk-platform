// Aggregate Service responses · AUGMENTED 2026-06-27 (dispatch multi-source) ·
// Tarea 3 · graceful degradation + discovery_package.sources[].
// Mirror of aggregateDiscoverySources() in src/lib/onboarding-discovery/url-classifier.ts.
//
// A failed actor is marked status:'failed' and the run CONTINUES · one down
// source NEVER aborts the whole discovery. The sources[] array (what ran ·
// status · count · trust_level) is surfaced for Camino III + the brain write.

const items = $input.all();
const summary = { total_calls: items.length, successes: 0, errors: 0, skipped_gate: 0, by_function: {} };
const sources = [];
let okCount = 0, failedCount = 0, totalResults = 0;

for (const it of items) {
  const r = it.json || {};
  const fn = r.apify_function || 'unknown';
  summary.by_function[fn] = (summary.by_function[fn] || 0) + 1;

  if (r.status === 'skipped' || r.skip_reason) {
    summary.skipped_gate++;
    continue; // gate skip-markers are not a source success/failure
  }

  const failed = r.success === false || !!r.error;
  const count =
    typeof r.result_count === 'number' ? r.result_count
    : Array.isArray(r.results) ? r.results.length
    : typeof r.count === 'number' ? r.count : 0;

  if (failed) {
    summary.errors++;
    failedCount++;
    sources.push({
      apify_function: fn, status: 'failed', count: 0,
      trust_level: r.trust_level || 'untrusted',
      source: r.source || 'apify_scrape',
      error: (r.error && (r.error.message || String(r.error))) || 'actor failed',
    });
  } else {
    summary.successes++;
    okCount++;
    totalResults += count;
    sources.push({
      apify_function: fn, status: 'ok', count: count,
      trust_level: r.trust_level || 'untrusted',
      source: r.source || 'apify_scrape',
    });
  }
}

return [{ json: {
  scope: 'onboarding_e2e',
  destination_table: 'client_competitive_landscape',
  summary,
  // Tarea 3 · top-level sources[] · merged into discovery_package downstream.
  sources,
  sources_summary: { ok_count: okCount, failed_count: failedCount, total_results: totalResults },
  ran_at: new Date().toISOString(),
} }];
