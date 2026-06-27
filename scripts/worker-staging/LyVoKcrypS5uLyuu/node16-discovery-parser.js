// Discovery Parser canon · CC#3↔CC#4 convergence PR #182 + Opus Maxx 2026-06-09.
// AUGMENTED 2026-06-27 (dispatch multi-source) · §144 rama · NO prod ·
//   + deterministic webhook-URL classifier (Tarea 1)
//   + source / trust_level / type taxonomy on every scrape_target
//   + §150 G5 guardrails (max_competitors=10 · max_actors=3 · dedup)
//   + google_serp fallback when no website (Tarea 2)
//   + discovery_package.sources[] initialized (filled by Aggregate node · Tarea 3)
// Mirror of src/lib/onboarding-discovery/url-classifier.ts (tested · keep in sync).
//
// EMITS A SINGLE consolidated item · Camino III reviews ONE discovery package.

const agentResponse = $input.first().json;
const responseBody = agentResponse.body || agentResponse;
const dealData = $('Validate Deal Data').first().json;
const clientId = dealData.client_id;
const clientName = dealData.client_name;
const journeyId = dealData._journey_id;

// ════════════════════════════════════════════════════════════════════
// DETERMINISTIC CLASSIFIER + GUARDRAILS (mirror of url-classifier.ts)
// ════════════════════════════════════════════════════════════════════
const GUARDRAILS = { max_competitors_to_scrape: 10, max_actors_per_run: 3 };

function normalizeUrl(raw) {
  if (typeof raw !== 'string') return null;
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  return t.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
}
function classifyUrl(raw) {
  const n = normalizeUrl(raw);
  if (!n) return null;
  if (n.includes('instagram.com') || n.includes('instagr.am'))
    return { kind: 'apify', apify_function: 'instagram_scraper', source: 'apify_scrape' };
  if (n.includes('linkedin.com/company'))
    return { kind: 'apify', apify_function: 'linkedin_company', source: 'apify_scrape' };
  if (n.includes('facebook.com') || n.includes('fb.com'))
    return { kind: 'apify', apify_function: 'facebook_ads', source: 'apify_scrape' };
  if (n.includes('tiktok.com'))
    return { kind: 'apify', apify_function: 'tiktok_profile', source: 'apify_scrape' };
  if (n.includes('twitter.com') || n === 'x.com' || n.startsWith('x.com/'))
    return { kind: 'apify', apify_function: 'tweet_scraper', source: 'apify_scrape' };
  if (n.includes('google.com/maps') || n.includes('maps.google.com') || n.includes('goo.gl/maps'))
    return { kind: 'apify', apify_function: 'google_maps_scraper', source: 'apify_scrape' };
  return { kind: 'web_generic', apify_function: null, source: 'onboarding_discovery' };
}

const discoveryOutput =
  responseBody && typeof responseBody === 'object' && responseBody.discovery_output
    ? responseBody.discovery_output : null;
const discoveryPersist =
  responseBody && typeof responseBody === 'object' && responseBody.discovery_persist
    ? responseBody.discovery_persist : null;

// ─── PATH C · HITL branch · canon parse_kind absent/malformed ─────
if (!discoveryOutput && discoveryPersist) {
  const parseKind = discoveryPersist.parse_kind || 'unknown';
  const source = discoveryPersist.source || 'unknown';
  if (parseKind === 'absent' || parseKind === 'malformed') {
    const parseFailure = {
      parse_kind: parseKind, source: source,
      parse_reason: discoveryPersist.parse_reason || null,
      tool_emission_count: discoveryPersist.tool_emission_count || 0,
      errors: discoveryPersist.errors || [],
      duration_ms: discoveryPersist.duration_ms || null,
      workflow_execution_id: $execution.id, calling_workflow_id: $workflow.id,
    };
    return [{ json: {
      client_id: clientId, client_name: clientName, _journey_id: journeyId,
      _hitl_required: true, _discovery_ok: false,
      _skip_reason: 'discovery_persist_' + parseKind,
      discovery_package: {
        competitors: [], scrape_targets: [], icp_signals: [],
        discovery_summary: 'HITL · agent discovery parse_kind=' + parseKind,
        own_handles: {}, sources: [], parse_failure: parseFailure,
      },
      competitor_count: 0, scrape_target_count: 0, ready_for_review: true,
      hitl_payload: parseFailure,
    }}];
  }
}

const ownHandles = (discoveryOutput && discoveryOutput.own_handles) || {};
const competitors =
  discoveryOutput && Array.isArray(discoveryOutput.competitors)
    ? discoveryOutput.competitors.slice(0, 8) : [];
const icpRaw = discoveryOutput && discoveryOutput.icp;
const icpSegments = Array.isArray(icpRaw) ? icpRaw : (icpRaw ? [icpRaw] : []);
const primaryIcp = icpSegments[0] || null;
const discoverySummary = (discoveryOutput && discoveryOutput.competitive_landscape_summary) || '';

const scrapeTargets = [];
const seenLabels = new Set();
const actorsUsed = new Set();
let droppedCompetitorCap = 0, droppedActorCap = 0, droppedDup = 0;

// pushTarget · canon shape + taxonomy + §150 guardrails enforced here.
// trust_level · 'tenant_trusted' for the client's OWN data · 'untrusted' for
// competitors/search/scraped third parties.
function pushTarget(apify_function, params, target_kind, target_label, source, trust_level) {
  if (seenLabels.has(target_label)) { droppedDup++; return; }
  if (scrapeTargets.length >= GUARDRAILS.max_competitors_to_scrape) { droppedCompetitorCap++; return; }
  if (apify_function && !actorsUsed.has(apify_function) && actorsUsed.size >= GUARDRAILS.max_actors_per_run) {
    droppedActorCap++; return;
  }
  seenLabels.add(target_label);
  if (apify_function) actorsUsed.add(apify_function);
  scrapeTargets.push({
    client_id: clientId, client_name: clientName, _journey_id: journeyId,
    _discovery_ok: true, apify_function, params,
    target_kind, target_label, destination: 'brain_rag', dry_run: false,
    source: source, trust_level: trust_level, type: 'evidence',
    metadata: {
      calling_workflow_id: $workflow.id,
      calling_workflow_execution_id: $execution.id,
      scope: 'onboarding_e2e_lazo_dynamic',
      sprint: 'discovery-multisource-2026-06-27',
      target_kind, target_label, source, trust_level,
    },
  });
}

// ─── PATH A · agent-derived OWN handles (tenant_trusted · direct client data) ─
if (ownHandles.instagram) pushTarget('instagram_scraper', { usernames: [String(ownHandles.instagram).replace(/^@/, '')], resultsLimit: 5 }, 'own', 'own:instagram:' + ownHandles.instagram, 'apify_scrape', 'tenant_trusted');
if (ownHandles.tiktok) pushTarget('tiktok_profile', { usernames: [String(ownHandles.tiktok).replace(/^@/, '')], maxItems: 5 }, 'own', 'own:tiktok:' + ownHandles.tiktok, 'apify_scrape', 'tenant_trusted');
if (ownHandles.linkedin) pushTarget('linkedin_company', { companies: [ownHandles.linkedin], maxItems: 1 }, 'own', 'own:linkedin:' + ownHandles.linkedin, 'apify_scrape', 'tenant_trusted');

// ─── Tarea 1 · classify the client's webhook URLs (website + socials) ─
// Own data from the webhook = tenant_trusted. Generic website → web_fetch
// (onboarding_discovery · NO apify actor fired).
const webhookUrls = [
  dealData.website, dealData.domain,
  dealData.instagram, dealData.facebook, dealData.tiktok, dealData.linkedin,
  ...(dealData.own_social_handles && typeof dealData.own_social_handles === 'object'
    ? Object.values(dealData.own_social_handles) : []),
].filter((u) => typeof u === 'string' && u.trim().length > 0);

for (const url of webhookUrls) {
  const cls = classifyUrl(url);
  if (!cls) continue;
  const norm = normalizeUrl(url);
  if (cls.kind === 'apify') {
    pushTarget(cls.apify_function, { startUrls: [{ url: 'https://' + norm }] }, 'own', 'own:web:' + norm, cls.source, 'tenant_trusted');
  } else {
    // generic web URL · agent web_fetch · no actor · still recorded as evidence
    pushTarget(null, { url: 'https://' + norm }, 'own_web', 'own:webfetch:' + norm, cls.source, 'tenant_trusted');
  }
}

// ─── COMPETITOR scrapes (untrusted) · canon competitor fields ─────────
for (let i = 0; i < competitors.length; i++) {
  const c = competitors[i];
  if (!c || typeof c !== 'object' || !c.name) continue;
  const cName = c.name; const h = c.handles || {};
  pushTarget('facebook_ads', { searchTerms: [cName], country: 'US', maxItems: 3 }, 'competitor', 'comp:fb_ads:' + cName, 'apify_scrape', 'untrusted');
  if (h.instagram) pushTarget('instagram_scraper', { usernames: [String(h.instagram).replace(/^@/, '')], resultsLimit: 3 }, 'competitor', 'comp:ig:' + cName, 'apify_scrape', 'untrusted');
  if (h.tiktok) pushTarget('tiktok_profile', { usernames: [String(h.tiktok).replace(/^@/, '')], maxItems: 3 }, 'competitor', 'comp:tiktok:' + cName, 'apify_scrape', 'untrusted');
  if (h.linkedin) pushTarget('linkedin_company', { companies: [h.linkedin], maxItems: 1 }, 'competitor', 'comp:linkedin:' + cName, 'apify_scrape', 'untrusted');
}

// ─── SEO · canon icp.industries[] + icp.geography (search · untrusted) ─
if (primaryIcp) {
  const industry = (Array.isArray(primaryIcp.industries) && primaryIcp.industries.length > 0)
    ? primaryIcp.industries[0] : primaryIcp.audience_segment;
  const geography = primaryIcp.geography || '';
  if (industry) pushTarget('google_serp', { queries: industry + (geography ? (' ' + geography) : ''), resultsPerPage: 5, maxPagesPerQuery: 1 }, 'seo', 'seo:industry:' + industry, 'search', 'untrusted');
}

// ─── Tarea 2 · FALLBACK · no website AND no actor targets → google_serp ─
// + extended · if a location/city is provided, ALSO probe local presence via
//   google_maps_scraper (compass/crawler-google-places).
const hasWebsite = typeof dealData.website === 'string' && dealData.website.trim().length > 0;
const hasActorTarget = scrapeTargets.some((t) => t.apify_function);
if (!hasWebsite && !hasActorTarget) {
  const q = [String(clientName || '').trim() + ' competitors', String(dealData.industry || '').trim()]
    .filter((s) => s.length > 1).join(' ');
  pushTarget('google_serp', { queries: q, resultsPerPage: 5, maxPagesPerQuery: 1 }, 'fallback', 'fallback:serp:' + q, 'search', 'untrusted');

  const location = String(dealData.location || dealData.city || '').trim();
  if (location.length > 0) {
    const subject = String(clientName || dealData.industry || '').trim();
    const mq = [subject, location].filter((s) => s.length > 0).join(' ');
    pushTarget('google_maps_scraper', { searchStringsArray: [mq], maxCrawledPlacesPerSearch: 5 }, 'fallback', 'fallback:maps:' + mq, 'search', 'untrusted');
  }
}

// ─── Shadow-safe · no agent signal AND no deterministic targets → skip ─
if (!discoveryOutput && scrapeTargets.length === 0) {
  return [{ json: {
    client_id: clientId, client_name: clientName, _journey_id: journeyId,
    _discovery_ok: false, _skip_reason: 'discovery_output_missing_no_signal',
    discovery_package: {
      competitors: [], scrape_targets: [], icp_signals: [],
      discovery_summary: 'NO_SIGNAL · agent returned neither discovery_output nor discovery_persist · no webhook URLs',
      own_handles: {}, sources: [],
    },
    competitor_count: 0, scrape_target_count: 0, ready_for_review: false,
  }}];
}

// ─── Final · single consolidated item ──────────────────────────────
return [{ json: {
  client_id: clientId, client_name: clientName, _journey_id: journeyId,
  _discovery_ok: true,
  discovery_package: {
    competitors: competitors, scrape_targets: scrapeTargets,
    icp_signals: icpSegments, discovery_summary: discoverySummary,
    own_handles: ownHandles,
    // Tarea 3 · filled by the Aggregate node post-Apify · init here so the
    // shape is stable for Camino III review even if discovery is shadow.
    sources: [],
    guardrails_applied: GUARDRAILS,
    dropped: { by_competitor_cap: droppedCompetitorCap, by_actor_cap: droppedActorCap, duplicates: droppedDup },
  },
  competitor_count: competitors.length,
  scrape_target_count: scrapeTargets.length,
  ready_for_review: true,
}}];
