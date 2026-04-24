#!/usr/bin/env python3
"""
Analyze all n8n workflow JSON files and classify patterns that correlate with
the bugs we fixed in Sesiones 31-33. Produces a master report with per-workflow
analysis + predicted fix strategy + priority ranking.

Patterns detected (from S31-33 debugging):
- Bad $node['slug'] refs (slug-style, fails in n8n 1.x) — FIX: patch to $('Exact Name')
- IF nodes typeValidation: 'strict' — FIX: sweep patcher to 'loose'
- Code nodes (VM2 sandbox TIMEOUT on Railway) — FIX: replace with HTTP to backend route
- JSON.stringify($json.X) no fallback — FIX: defensive ?? null
- External API URLs with no stub fallback — FIX: stub route or patcher with $env fallback
- Webhook trigger with responseMode=onReceived — OK (good pattern)
- Webhook trigger with responseMode=responseNode + no Respond node — BUG (hangs)
- Endpoint routes called that don't exist in backend — FIX: create stub route
"""

import json
import os
import re
from collections import defaultdict
from pathlib import Path

WF_ROOT = Path("/sessions/intelligent-practical-edison/mnt/Agentic Business Agency/zero-risk-platform/n8n-workflows")

# Workflows that PASSED in latest smoke (from smoke-2026-04-24T04-36-20-773Z.md)
PASSING = {
    "Zero Risk - Sentry Alert Router (Webhook)",
    "Zero Risk — Video Pipeline: Seedance → FFmpeg → Multi-Platform Export (Webhook)",
    "Zero Risk — SEO Rank-to-#1 v2 UPGRADED",
    "Zero Risk — RSA 15-Headline Variant Generator (Webhook)",
    "Zero Risk — Ad Creative → Landing Message Match Validator (Webhook)",
    "Zero Risk — Content Repurposing 1→N (Webhook or Cron)",
    "Zero Risk - RUFLO Smart Router (Webhook)",
    "Zero Risk — Incrementality Test Runner (15min + Webhook)",
    "Zero Risk — Subject Line A/B + A/A Validator",
    "Zero Risk — Client Onboarding E2E v2 (Webhook: Deal Won)",
    "Zero Risk — IndexNow + Real-Time Crawl Signaling",
    "Zero Risk — Influencer Authenticity Gate (Webhook)",
    "Zero Risk — Review Severity Tier Router (Real-time)",
    "Zero Risk — Email Lifecycle Orchestrator (Webhook-Driven)",
    "Zero Risk - Phase Gate Evidence Collector (Webhook)",
    "Zero Risk — UptimeRobot Webhook Handler (Webhook)",
    "Zero Risk - NEXUS 7-Phase Campaign Orchestrator (Webhook)",
    # 2 "ZR Agent Outcomes Writer" also PASS (names garbled with special char)
}
PASSING_NORMALIZED = {n.replace('â ', '— ') for n in PASSING}

FAILED = {
    "Zero Risk — Landing Page A/B Deployer (Webhook)",
}

CRON_SKIP = {
    "Zero Risk - Meta-Agent Weekly Learning Cycle (Cron Monday 9am)",
    "Zero Risk - HITL Inbox Processor (Every 15 Minutes)",
}

# Tracked status endpoints we know exist (from earlier `ls` of src/app/api/)
EXISTING_ROUTES = {
    '/api/admin/sync-identity', '/api/agent-outcomes/write', '/api/agent-routing/log',
    '/api/agents/classify-lead', '/api/agents/generate-content', '/api/agents/pipeline',
    '/api/agents/run', '/api/agents/run-sdk', '/api/agents/status',
    '/api/analytics/active-campaigns', '/api/analytics/agent-outcomes', '/api/analytics/agent-scores',
    '/api/analytics/campaign-results', '/api/analytics/meta-agent-run', '/api/analytics/performance',
    '/api/analytics/performance-metrics', '/api/analytics/proposals',
    '/api/campaign-pipeline/state', '/api/campaigns/block-launch',
    '/api/client-brain/query', '/api/client-brain/rag-search',
    '/api/client-reports', '/api/content/fetch', '/api/content-queue/store',
    '/api/dashboard', '/api/email-sequences/log',
    '/api/evidence/validate', '/api/experiments',
    '/api/ga4/conversion-data', '/api/ghl/add-task', '/api/ghl/create-calendar-event',
    '/api/headlines/library', '/api/health',
    '/api/hitl/approvals', '/api/hitl/pending', '/api/hitl/queue', '/api/hitl/resolve',
    '/api/identity-improvements/queue', '/api/influencer-list/approve',
    '/api/influencer-rejections/log', '/api/ingest',
    '/api/mc-sync', '/api/mc-sync/agents',
    '/api/meta-ads/apply-optimization', '/api/meta-ads/campaigns',
    '/api/meta-ads/creative', '/api/meta-ads/spend-data',
    '/api/n8n/lead-pipeline',
    '/api/nexus/advance-phase', '/api/nexus/handle-failure', '/api/nexus/parse-request', '/api/nexus/resolve-phase',
    '/api/notion/create-client-workspace', '/api/notion/create-success-plan',
    '/api/onboarding',
    '/api/outcomes/record',
    '/api/phase-gate/audit',
    '/api/pipeline/resume-delayed', '/api/pipeline/run', '/api/pipeline/status',
    '/api/rank-tracking/daily', '/api/rank-tracking/initialize',
    '/api/review-metrics/upsert', '/api/review-responses/queue-hitl',
    '/api/seo/cannibalization-store', '/api/seo/content-refresh-enqueue',
    '/api/social-metrics', '/api/social-schedules',
    '/api/storage/upload',
    '/api/stubs/firecrawl/scrape', '/api/stubs/higgsfield/generate',
    '/api/stubs/slack-webhook', '/api/stubs/whisper',
    '/api/subject-line-tests/aa-control', '/api/subject-line-tests/create',
    '/api/tracking/attribution-audits',
    '/api/uptime-incidents',
    '/api/video/transcode',
    '/api/webhook',
}


def normalize_name(s):
    """Strip non-ASCII variants for fuzzy matching."""
    if not s: return ""
    return s.replace('—', '-').replace('→', '->').strip()


def analyze_workflow(path):
    """Analyze one workflow JSON. Return dict with patterns found."""
    try:
        with open(path, encoding='utf-8-sig') as f:
            wf = json.load(f)
    except Exception as e:
        return {'path': str(path), 'error': str(e)}

    result = {
        'path': str(path.relative_to(WF_ROOT)),
        'name': wf.get('name', '<no name>'),
        'node_count': len(wf.get('nodes', [])),
        'trigger_type': None,
        'webhook_path': None,
        'webhook_response_mode': None,
        'has_respond_node': False,
        'code_nodes': [],
        'if_nodes_strict': [],
        'if_nodes_loose': [],
        'bad_node_refs': [],  # $node['slug'] where slug is NOT a display name
        'jsonstringify_no_fallback': [],  # JSON.stringify($json.X) without ?? or ||
        'external_urls': set(),  # full URLs (not our own)
        'internal_routes_called': set(),  # /api/... patterns
        'missing_routes': set(),
        'all_node_names_and_ids': [],  # (name, id)
    }

    nodes = wf.get('nodes', [])
    node_name_set = {n.get('name') for n in nodes}
    node_id_set = {n.get('id') for n in nodes}

    for n in nodes:
        node_type = n.get('type', '')
        node_name = n.get('name', '')
        node_id = n.get('id', '')
        result['all_node_names_and_ids'].append((node_name, node_id))

        # Trigger detection
        if node_type == 'n8n-nodes-base.webhook':
            result['trigger_type'] = 'webhook'
            params = n.get('parameters') or {}
            result['webhook_path'] = params.get('path')
            result['webhook_response_mode'] = params.get('responseMode')
        elif node_type == 'n8n-nodes-base.cron' or node_type == 'n8n-nodes-base.scheduleTrigger':
            if not result['trigger_type']:
                result['trigger_type'] = 'cron'
        elif node_type == 'n8n-nodes-base.manualTrigger':
            if not result['trigger_type']:
                result['trigger_type'] = 'manual'
        elif node_type == 'n8n-nodes-base.respondToWebhook':
            result['has_respond_node'] = True

        # Code nodes (TIMEOUT_NO_EXEC risk in Railway VM2 sandbox)
        if node_type == 'n8n-nodes-base.code':
            result['code_nodes'].append({
                'name': node_name,
                'id': node_id,
                'has_js_code_field': bool((n.get('parameters') or {}).get('jsCode')),
            })

        # IF nodes typeValidation analysis
        if node_type == 'n8n-nodes-base.if':
            conds = (n.get('parameters') or {}).get('conditions') or {}
            opts = conds.get('options') or {}
            tv = opts.get('typeValidation')
            entry = {'name': node_name, 'typeValidation': tv}
            if tv == 'strict':
                result['if_nodes_strict'].append(entry)
            else:
                result['if_nodes_loose'].append(entry)

        # Scan parameters deep for patterns
        params_json = json.dumps(n.get('parameters') or {})

        # Bad $node[] refs — matches $node['slug-or-id']
        for m in re.finditer(r"\$node\[['\"]([^'\"]+)['\"]\]", params_json):
            ref = m.group(1)
            # If ref is not a node DISPLAY NAME, it's a bad ref
            if ref not in node_name_set and ref != node_name:
                # Could be matching by id (some workflows use id)
                if ref in node_id_set:
                    result['bad_node_refs'].append({
                        'node_in': node_name,
                        'ref': ref,
                        'kind': 'by_id',
                        'note': 'Uses node ID — works in some n8n versions, safer to rewrite to display name',
                    })
                else:
                    result['bad_node_refs'].append({
                        'node_in': node_name,
                        'ref': ref,
                        'kind': 'unknown',
                        'note': 'Ref not found as name or id — definitely broken',
                    })

        # JSON.stringify($json.X) without fallback
        # Look for JSON.stringify(something) where something doesn't have ?? or ||
        for m in re.finditer(r"JSON\.stringify\(([^)]+)\)", params_json):
            inner = m.group(1)
            if '??' not in inner and '||' not in inner:
                # Filter out simple cases like JSON.stringify({...}) or JSON.stringify(body)
                # We care about JSON.stringify($json.X) or JSON.stringify($('X').item.json.Y)
                if '$json.' in inner or '$(' in inner or '.item.json.' in inner:
                    result['jsonstringify_no_fallback'].append({
                        'node_in': node_name,
                        'expression': inner[:120],
                    })

        # External URLs (not our Vercel app, not $env placeholders, not localhost)
        if node_type == 'n8n-nodes-base.httpRequest':
            url = (n.get('parameters') or {}).get('url', '')
            if url:
                # Strip {{ $env ... }} prefix if any
                clean_url = re.sub(r"\{\{[^}]+\}\}", "", url).strip()
                clean_url = re.sub(r"^=", "", clean_url)
                if clean_url.startswith('http'):
                    # Extract hostname
                    host_match = re.match(r"https?://([^/]+)", clean_url)
                    if host_match:
                        host = host_match.group(1)
                        if 'zero-risk-platform.vercel.app' in host:
                            # internal
                            pass
                        elif 'localhost' in host:
                            pass
                        else:
                            result['external_urls'].add(host)
                # Extract internal routes
                for m in re.finditer(r"/api/[a-z0-9\-_/\[\]]+", url):
                    result['internal_routes_called'].add(m.group(0).rstrip('/'))

    # Check missing routes
    for rt in result['internal_routes_called']:
        # Normalize (remove query params, trailing slashes)
        rt_clean = rt.split('?')[0].rstrip('/')
        # Check if this route or a prefix is in existing
        if rt_clean not in EXISTING_ROUTES:
            # Try stripping [param] if any
            rt_no_param = re.sub(r"\[[^\]]+\]", "", rt_clean).rstrip('/').replace('//', '/')
            if rt_no_param not in EXISTING_ROUTES:
                result['missing_routes'].add(rt_clean)

    # Convert sets to lists for JSON serialization
    result['external_urls'] = sorted(result['external_urls'])
    result['internal_routes_called'] = sorted(result['internal_routes_called'])
    result['missing_routes'] = sorted(result['missing_routes'])

    # Status classification
    norm_name = normalize_name(result['name'])
    if any(normalize_name(p) == norm_name for p in PASSING):
        result['status'] = 'PASS'
    elif any(normalize_name(f) == norm_name for f in FAILED):
        result['status'] = 'FAIL_manual'  # landing page
    elif any(normalize_name(c) == norm_name for c in CRON_SKIP):
        result['status'] = 'CRON_SKIP'
    else:
        result['status'] = 'UNTESTED'

    # Predicted fix strategy
    strategies = []
    risk_score = 0

    if result['code_nodes']:
        cnt = len(result['code_nodes'])
        strategies.append(f"Replace {cnt} Code node(s) → HTTP (NEXUS pattern)")
        risk_score += cnt * 3  # high risk each

    if result['if_nodes_strict']:
        cnt = len(result['if_nodes_strict'])
        strategies.append(f"Run patch-if-loose-typevalidation.mjs (catches {cnt} IF nodes)")
        risk_score += cnt

    if result['bad_node_refs']:
        cnt = len(result['bad_node_refs'])
        strategies.append(f"Patcher rewrite {cnt} bad $node[] refs (Subject Line pattern)")
        risk_score += cnt * 2

    if result['jsonstringify_no_fallback']:
        cnt = len(result['jsonstringify_no_fallback'])
        strategies.append(f"Patcher add ?? null to {cnt} JSON.stringify calls (Ad Creative pattern)")
        risk_score += cnt

    if result['missing_routes']:
        cnt = len(result['missing_routes'])
        strategies.append(f"Create {cnt} missing backend route stub(s): {', '.join(result['missing_routes'][:3])}")
        risk_score += cnt * 2

    if result['external_urls']:
        extern_non_common = [u for u in result['external_urls']
                             if 'hc-ping.com' not in u and 'slack' not in u.lower()]
        if extern_non_common:
            strategies.append(f"External API call(s): {', '.join(extern_non_common[:3])} — may need stub fallback")
            risk_score += 1

    if (result['trigger_type'] == 'webhook'
            and result['webhook_response_mode'] == 'responseNode'
            and not result['has_respond_node']):
        strategies.append("⚠️ BUG: responseMode=responseNode but NO respond node — webhook will hang")
        risk_score += 5

    result['strategies'] = strategies
    result['risk_score'] = risk_score

    return result


def main():
    all_files = sorted(WF_ROOT.rglob("*.json"))
    all_files = [f for f in all_files if not f.name.endswith('.meta.json')]

    results = []
    for f in all_files:
        r = analyze_workflow(f)
        results.append(r)

    # Stats
    total = len(results)
    pass_count = sum(1 for r in results if r.get('status') == 'PASS')
    fail_count = sum(1 for r in results if r.get('status') == 'FAIL_manual')
    cron_count = sum(1 for r in results if r.get('status') == 'CRON_SKIP')
    untested = sum(1 for r in results if r.get('status') == 'UNTESTED')

    print(f"\n=== ANALYSIS SUMMARY ===")
    print(f"Total workflow files: {total}")
    print(f"  PASS:       {pass_count}")
    print(f"  FAIL_manual: {fail_count}")
    print(f"  CRON_SKIP:  {cron_count}")
    print(f"  UNTESTED:   {untested}")

    print(f"\n=== UNTESTED (priority analysis) ===")
    untested_results = [r for r in results if r.get('status') == 'UNTESTED']
    untested_results.sort(key=lambda r: r.get('risk_score', 0))
    for r in untested_results:
        print(f"\n[{r.get('trigger_type','?').upper():7}] risk={r.get('risk_score',0):3} {r['name']}")
        print(f"  path: {r['path']}")
        print(f"  nodes: {r.get('node_count')}, code={len(r.get('code_nodes',[]))}, if_strict={len(r.get('if_nodes_strict',[]))}, bad_refs={len(r.get('bad_node_refs',[]))}")
        for s in r.get('strategies', []):
            print(f"    - {s}")

    # Write JSON for downstream consumption
    out_path = Path("/sessions/intelligent-practical-edison/mnt/Agentic Business Agency/zero-risk-platform/scripts/smoke-test/out/workflow-analysis.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, 'w') as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nFull JSON saved: {out_path}")


if __name__ == "__main__":
    main()
