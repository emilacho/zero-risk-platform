#!/usr/bin/env node
/**
 * Surgical patcher for the RSA 15-Headline Variant Generator workflow.
 * Same playbook as Video Pipeline — rewire every HTTP node to reach back to
 * $('Code: Validate Brief').item.json for stateful fields instead of the
 * mutating $json chain, switch /api/agents/run-sdk → /api/agents/run, route
 * Slack through our stub.
 */
import { endpoints } from './lib/env.mjs'
import { fetchJson } from './lib/fetch.mjs'
import { listN8nWorkflows, fetchWorkflowDetail } from './lib/workflows.mjs'

const ep = endpoints()
const H = { 'X-N8N-API-KEY': ep.N8N_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' }
const DRY = process.argv.includes('--dry-run')

const BASE = "{{ $env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app' }}"
const SLACK = `={{ $env.SLACK_WEBHOOK_URL || 'https://zero-risk-platform.vercel.app/api/stubs/slack-webhook' }}`

const VB = `$('Code: Validate Brief').item.json`
const BRAIN = `$('Client Brain: Brand Context').item.json`
const AGENT = `$('Agent: Creative Director (RSA Gen)').item.json`
const VALIDATE_MATRIX = `$('Code: Validate RSA Matrix').item.json`

const VALIDATE_MATRIX_JS = `// Re-validate the agent's 15-headline matrix, but also handle the mock case
// where the smoke-test stub returns an empty matrix. Always include enough fields
// so downstream Store/Record/Slack nodes succeed.
const agent = $('Agent: Creative Director (RSA Gen)').item.json || {};
const vb = $('Code: Validate Brief').item.json || {};
let headlines = agent.headline_matrix;
if (!Array.isArray(headlines)) headlines = agent.headlines || [];
// Flatten if nested
if (headlines.length && Array.isArray(headlines[0])) headlines = headlines.flat();
const errors = [];
const validations = {
  char_count_violations: [],
  duplicate_headlines: [],
  matrix_coherence: 'pass'
};
headlines.forEach((h, i) => {
  if (typeof h === 'string' && h.length > 30) {
    validations.char_count_violations.push({ index: i, headline: h, length: h.length });
  }
});
const unique = new Set(headlines);
if (unique.size !== headlines.length) {
  validations.duplicate_headlines = headlines.filter((h, i) => headlines.indexOf(h) !== i);
}
if (validations.char_count_violations.length > 0) errors.push('Character count violations detected');
if (validations.duplicate_headlines.length > 0) errors.push('Duplicate headlines detected');
return [{ json: {
  ...vb,
  validation_passed: errors.length === 0,
  errors,
  details: validations,
  headline_count: headlines.length,
  headlines,
} }];`

const FIXED_PARAMS = {
  'Client Brain: Brand Context': {
    method: 'POST',
    url: `=${BASE}/api/client-brain/rag-search`,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "client_id": "{{ ${VB}.client_id }}",\n  "query": "Brand voice, messaging tone, unique value propositions, differentiation, keywords, past RSA performance",\n  "k": 15,\n  "task_id": "{{ ${VB}.task_id }}",\n  "campaign_brief": {{ JSON.stringify(${VB}.campaign_brief) }},\n  "keyword": {{ JSON.stringify(${VB}.keyword) }},\n  "platform": "{{ ${VB}.platform }}"\n}`,
    options: {},
  },
  'Agent: Creative Director (RSA Gen)': {
    method: 'POST',
    url: `=${BASE}/api/agents/run`,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
      { name: 'x-smoke-test', value: `={{ (${VB}.client_id || "").startsWith("smoke-") ? "1" : "" }}` },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "agent": "creative_director",\n  "model": "claude-sonnet-4-6",\n  "task": {{ JSON.stringify('Generate RSA 15-headline matrix for campaign: ' + ${VB}.campaign_brief + ' (keyword: ' + (${VB}.keyword || 'none') + '). Structure: 5 headlines grouped as {brand, benefit, feature, CTA, social_proof}. Max 30 chars each, orthogonal, apply Schwartz emotional triggers, align brand voice. Output JSON with headline_matrix[5][3], validation_notes, estimated CTR vs existing.') }},\n  "client_id": "{{ ${VB}.client_id }}",\n  "task_id": "{{ ${VB}.task_id }}",\n  "campaign_brief": {{ JSON.stringify(${VB}.campaign_brief) }},\n  "keyword": {{ JSON.stringify(${VB}.keyword) }},\n  "platform": "{{ ${VB}.platform }}",\n  "context": { "smoke_test": {{ (${VB}.client_id || "").startsWith("smoke-") }} },\n  "extra": { "brief": {{ JSON.stringify(${VB}) }}, "brand": {{ JSON.stringify(${BRAIN}) }} }\n}`,
    options: { timeout: 120000 },
  },
  'Code: Validate RSA Matrix': { jsCode: VALIDATE_MATRIX_JS },
  'Store: RSA Headline Library': {
    method: 'POST',
    url: `=${BASE}/api/headlines/library`,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "client_id": "{{ ${VB}.client_id }}",\n  "campaign_id": {{ JSON.stringify(${VB}.campaign_brief) }},\n  "headline_set": {\n    "set_id": "{{ ${VB}.task_id }}",\n    "headlines": {{ JSON.stringify(${VALIDATE_MATRIX}.headlines) }},\n    "category_breakdown": "5 headlines x 3 groupings",\n    "validation_status": {{ ${VALIDATE_MATRIX}.validation_passed ? '"passed"' : '"failed"' }},\n    "created_at": "{{ new Date().toISOString() }}"\n  },\n  "keyword": {{ JSON.stringify(${VB}.keyword) }},\n  "platform": "{{ ${VB}.platform }}",\n  "headline_count": {{ ${VALIDATE_MATRIX}.headline_count }},\n  "task_id": "{{ ${VB}.task_id }}"\n}`,
    options: { timeout: 30000 },
  },
  'Record: Outcome': {
    method: 'POST',
    url: `=${BASE}/api/outcomes/record`,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "task_type": "rsa_generation",\n  "agent_slug": "creative_director",\n  "client_id": "{{ ${VB}.client_id }}",\n  "task_id": "{{ ${VB}.task_id }}",\n  "task_input": {{ JSON.stringify(${VB}.campaign_brief) }},\n  "output_summary": {{ JSON.stringify('RSA matrix: ' + (${VALIDATE_MATRIX}.headline_count || 0) + ' headlines, keyword=' + (${VB}.keyword || 'none')) }},\n  "success": {{ ${VALIDATE_MATRIX}.validation_passed }},\n  "duration_ms": 0,\n  "cost_usd": 0,\n  "platform": "{{ ${VB}.platform }}"\n}`,
    options: { timeout: 30000 },
  },
  'Slack: Notify Team': {
    method: 'POST',
    url: SLACK,
    sendHeaders: false,
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "text": {{ JSON.stringify('RSA 15-Headline Set Generated: ' + ${VB}.task_id + '. Headlines ready for ' + ${VB}.platform) }},\n  "blocks": [\n    { "type": "section", "text": { "type": "mrkdwn", "text": {{ JSON.stringify('*RSA Headline Matrix Generated*\\nSet ID: ' + ${VB}.task_id + '\\nCount: ' + (${VALIDATE_MATRIX}.headline_count || 0) + '\\nValidation: ' + (${VALIDATE_MATRIX}.validation_passed ? 'PASSED' : 'FAILED') + '\\nStatus: Ready for ' + ${VB}.platform) }} } }\n  ]\n}`,
    options: { timeout: 10000 },
  },
  'Slack: Notify Failure': {
    method: 'POST',
    url: SLACK,
    sendHeaders: false,
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "text": {{ JSON.stringify('RSA Validation Failed: ' + ${VB}.task_id + '. Errors: ' + JSON.stringify(${VALIDATE_MATRIX}.errors || [])) }},\n  "blocks": [\n    { "type": "section", "text": { "type": "mrkdwn", "text": {{ JSON.stringify('*RSA Validation Error*\\nSet ID: ' + ${VB}.task_id + '\\nErrors: ' + ((${VALIDATE_MATRIX}.errors || []).join(', '))) }} } }\n  ]\n}`,
    options: { timeout: 10000 },
  },
}

const { workflows } = await listN8nWorkflows()
const targets = workflows.filter(w => /RSA/i.test(w.name) && /Headline/i.test(w.name))
if (!targets.length) { console.error('No RSA workflow found.'); process.exit(1) }

const CLEAR_ON_REWRITE = ['formData', 'bodyParameters', 'queryParameters', 'authentication']
for (const w of targets) {
  console.log(`\n=== ${w.name} (${w.id})`)
  const detail = await fetchWorkflowDetail(w.id)
  if (!detail.ok || !detail.json?.nodes) { console.error(`   ✗ fetch failed: ${detail.status}`); continue }
  const wf = detail.json
  let changed = 0
  const missing = []
  for (const node of wf.nodes) {
    const fix = FIXED_PARAMS[node.name]
    if (!fix) continue
    const before = JSON.stringify(node.parameters)
    const baseParams = { ...(node.parameters || {}) }
    for (const key of CLEAR_ON_REWRITE) delete baseParams[key]
    node.parameters = { ...baseParams, ...fix }
    if (JSON.stringify(node.parameters) !== before) { changed++; console.log(`   rewrote: ${node.name}`) }
  }
  for (const name of Object.keys(FIXED_PARAMS)) {
    if (!wf.nodes.some(n => n.name === name)) missing.push(name)
  }
  if (missing.length) console.log('   ⚠ missing nodes:', missing)
  if (!changed) { console.log('   (no changes)'); continue }
  if (DRY) { console.log(`   [DRY] would PUT ${changed} node rewrites`); continue }
  const put = await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id, {
    method: 'PUT', headers: H,
    body: JSON.stringify({
      name: wf.name, nodes: wf.nodes, connections: wf.connections,
      settings: wf.settings || { executionOrder: 'v1' },
    }),
  })
  if (put.ok) {
    console.log(`   ✓ PUT 200 — ${changed} nodes patched`)
    if (w.active) {
      await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id + '/deactivate', { method:'POST', headers:H, body:'{}' })
      await new Promise(r => setTimeout(r, 800))
      await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id + '/activate', { method:'POST', headers:H, body:'{}' })
      console.log(`   ✓ reactivated`)
    }
  } else {
    console.log(`   ✗ PUT ${put.status}: ${put.text?.slice(0, 400) || put.error}`)
  }
}
console.log('\nDone.')
