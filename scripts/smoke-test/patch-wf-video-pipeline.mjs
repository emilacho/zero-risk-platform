#!/usr/bin/env node
/**
 * Surgical patcher for the Video Pipeline (Seedance → FFmpeg → Multi-Platform)
 * workflow. Rebuilds every HTTP node's body/url with references that actually
 * resolve in n8n v1+, plus rewires external calls (Higgsfield, Whisper, Slack)
 * to our stub endpoints so smoke runs are cost-free and don't need external creds.
 *
 * Idempotent — safe to re-run. Only writes if changes are detected.
 *
 * Usage:
 *   node scripts/smoke-test/patch-wf-video-pipeline.mjs
 *   node scripts/smoke-test/patch-wf-video-pipeline.mjs --dry-run
 */
import { endpoints } from './lib/env.mjs'
import { fetchJson } from './lib/fetch.mjs'
import { listN8nWorkflows, fetchWorkflowDetail } from './lib/workflows.mjs'

const ep = endpoints()
const H = { 'X-N8N-API-KEY': ep.N8N_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' }
const DRY = process.argv.includes('--dry-run')

const BASE = "{{ $env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app' }}"
const HIGGS = `={{ $env.HIGGSFIELD_API_URL || 'https://zero-risk-platform.vercel.app/api/stubs/higgsfield/generate' }}`
const WHISPER = `={{ $env.WHISPER_API_URL || 'https://zero-risk-platform.vercel.app/api/stubs/whisper' }}`
const SLACK = `={{ $env.SLACK_WEBHOOK_URL || 'https://zero-risk-platform.vercel.app/api/stubs/slack-webhook' }}`

// Reach back to the single source of workflow-state truth: Validate Brief.
const VB = `$('Code: Validate Brief').item.json`
const BRAIN = `$('Client Brain: Style Guides').item.json`
const AGENT = `$('Agent: Video Editor (Script → Storyboard)').item.json`
const SEEDANCE = `$('Higgsfield Seedance 2.0: Generate Video').item.json`
const WHISPER_NODE = `$('OpenAI Whisper: Auto-Subtitle').item.json`
const PLATFORM_SPECS = `$('Code: Platform Export Specs').item.json`
const TRANSCODE = `$('FFmpeg: Transcode All Platforms').item.json`

// Full corrected node parameter sets, keyed by node name.
const FIXED_PARAMS = {
  'Client Brain: Style Guides': {
    method: 'POST',
    url: `=${BASE}/api/client-brain/rag-search`,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "client_id": "{{ ${VB}.client_id }}",\n  "query": "Brand guidelines, visual identity, video production style, color palette, tone, messaging",\n  "k": 20,\n  "duration_s": {{ ${VB}.duration_s }},\n  "aspect_ratio": "{{ ${VB}.aspect_ratio }}",\n  "video_brief": {{ JSON.stringify(${VB}.video_brief) }},\n  "style": "{{ ${VB}.style }}",\n  "task_id": "{{ ${VB}.task_id }}"\n}`,
    options: {},
  },
  'Agent: Video Editor (Script → Storyboard)': {
    method: 'POST',
    url: `=${BASE}/api/agents/run`,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
      { name: 'x-smoke-test', value: '={{ ($json.client_id || "").startsWith("smoke-") ? "1" : "" }}' },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "agent": "video_editor",\n  "model": "claude-sonnet-4-6",\n  "task": {{ JSON.stringify('Produce video production brief for: ' + ${VB}.video_brief + ' (' + ${VB}.duration_s + 's, ' + ${VB}.aspect_ratio + ', style: ' + ${VB}.style + '). Deliver: storyboard (5-6 scenes), Seedance 2.0 prompt, color grading notes, audio specs, subtitle script, multi-platform export specs.') }},\n  "client_id": "{{ ${VB}.client_id }}",\n  "task_id": "{{ ${VB}.task_id }}",\n  "duration_s": {{ ${VB}.duration_s }},\n  "aspect_ratio": "{{ ${VB}.aspect_ratio }}",\n  "style": "{{ ${VB}.style }}",\n  "video_brief": {{ JSON.stringify(${VB}.video_brief) }},\n  "target_platforms": {{ JSON.stringify(${VB}.target_platforms) }},\n  "reference_image": {{ JSON.stringify(${VB}.reference_image) }},\n  "context": { "smoke_test": {{ (${VB}.client_id || "").startsWith("smoke-") }} },\n  "extra": { "brief": {{ JSON.stringify(${VB}) }}, "brand_context": {{ JSON.stringify(${BRAIN}) }} }\n}`,
    options: { timeout: 120000 },
  },
  'Higgsfield Seedance 2.0: Generate Video': {
    method: 'POST',
    url: HIGGS,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Authorization', value: '=Bearer {{ $env.HIGGSFIELD_API_KEY || "stub" }}' },
      { name: 'Content-Type', value: 'application/json' },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "model": "seedance-2.0",\n  "prompt": {{ JSON.stringify(${AGENT}.seedance_prompt || (${AGENT}.response && ${AGENT}.response.seedance_prompt) || ${VB}.video_brief) }},\n  "duration": {{ Number(${VB}.duration_s) || 15 }},\n  "aspect_ratio": "{{ ${VB}.aspect_ratio }}",\n  "reference_image": {{ JSON.stringify(${VB}.reference_image) }},\n  "style": "{{ ${VB}.style }}",\n  "quality": "720p",\n  "task_id": "{{ ${VB}.task_id }}",\n  "client_id": "{{ ${VB}.client_id }}"\n}`,
    options: { timeout: 120000 },
  },
  'Upload: Base Video → Supabase': {
    method: 'POST',
    url: `=${BASE}/api/storage/upload`,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "bucket": "video_assets",\n  "path": "{{ ${VB}.client_id }}/generated/{{ ${VB}.task_id }}/{{ ${VB}.task_id }}_base.mp4",\n  "file_url": {{ JSON.stringify(${SEEDANCE}.video_url) }},\n  "task_id": "{{ ${VB}.task_id }}",\n  "client_id": "{{ ${VB}.client_id }}",\n  "video_url": {{ JSON.stringify(${SEEDANCE}.video_url) }},\n  "target_platforms": {{ JSON.stringify(${VB}.target_platforms) }},\n  "duration_s": {{ Number(${VB}.duration_s) || 15 }},\n  "aspect_ratio": "{{ ${VB}.aspect_ratio }}",\n  "metadata": {\n    "prompt": {{ JSON.stringify(${AGENT}.seedance_prompt || '') }},\n    "model": "seedance-2.0",\n    "duration": {{ Number(${VB}.duration_s) || 15 }},\n    "aspect_ratio": "{{ ${VB}.aspect_ratio }}"\n  }\n}`,
    options: { timeout: 45000 },
  },
  'OpenAI Whisper: Auto-Subtitle': {
    method: 'POST',
    url: WHISPER,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Authorization', value: '=Bearer {{ $env.OPENAI_API_KEY || "stub" }}' },
      { name: 'Content-Type', value: 'application/json' },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "model": "whisper-1",\n  "audio_url": {{ JSON.stringify(${SEEDANCE}.video_url) }},\n  "response_format": "vtt",\n  "task_id": "{{ ${VB}.task_id }}",\n  "client_id": "{{ ${VB}.client_id }}",\n  "video_url": {{ JSON.stringify(${SEEDANCE}.video_url) }},\n  "target_platforms": {{ JSON.stringify(${VB}.target_platforms) }},\n  "duration_s": {{ Number(${VB}.duration_s) || 15 }},\n  "aspect_ratio": "{{ ${VB}.aspect_ratio }}"\n}`,
    options: { timeout: 90000 },
  },
  'Code: Platform Export Specs': {
    jsCode: `// Rebuild per-platform export specs, pulling state back from Validate Brief
const vb = $('Code: Validate Brief').item.json;
const whisper = $('OpenAI Whisper: Auto-Subtitle').item.json || {};
const platforms = vb.target_platforms || ['instagram_reels'];
const specs = {
  tiktok: { aspect: '9:16', res: '1080x1920', bitrate: '4M', fps: 30 },
  instagram_reels: { aspect: '9:16', res: '1080x1920', bitrate: '5M', fps: 30 },
  youtube_shorts: { aspect: '9:16', res: '1080x1920', bitrate: '5M', fps: 30 },
  youtube: { aspect: '16:9', res: '1920x1080', bitrate: '8M', fps: 30 }
};
const exportsCfg = platforms.map(p => {
  const s = specs[p] || specs.instagram_reels;
  return {
    platform: p,
    aspect_ratio: s.aspect,
    resolution: s.res,
    bitrate: s.bitrate,
    fps: s.fps,
    ffmpeg_cmd: \`ffmpeg -i input.mp4 -vf scale=\${s.res} -b:v \${s.bitrate} -r \${s.fps} output_\${p}.mp4\`,
    subtitles: whisper.content || ''
  };
});
return [{ json: {
  ...vb,
  exports_config: exportsCfg,
  subtitle_vtt: whisper.content || ''
} }];`,
  },
  'FFmpeg: Transcode All Platforms': {
    method: 'POST',
    url: `=${BASE}/api/video/transcode`,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "task_id": "{{ ${VB}.task_id }}",\n  "client_id": "{{ ${VB}.client_id }}",\n  "input_url": {{ JSON.stringify(${SEEDANCE}.video_url) }},\n  "exports": {{ JSON.stringify(${PLATFORM_SPECS}.exports_config) }},\n  "add_subtitles": true,\n  "subtitle_vtt": {{ JSON.stringify(${WHISPER_NODE}.content || '') }},\n  "target_platforms": {{ JSON.stringify(${VB}.target_platforms) }},\n  "duration_s": {{ Number(${VB}.duration_s) || 15 }},\n  "video_brief": {{ JSON.stringify(${VB}.video_brief) }}\n}`,
    options: { timeout: 300000 },
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
    jsonBody: `={\n  "task_type": "video_generation",\n  "agent_slug": "video_editor",\n  "client_id": "{{ ${VB}.client_id }}",\n  "task_id": "{{ ${VB}.task_id }}",\n  "task_input": {{ JSON.stringify(${VB}.video_brief) }},\n  "output_summary": {{ JSON.stringify('Video generated for ' + ((${VB}.target_platforms || []).join(', ')) + ' (' + ${VB}.duration_s + 's)') }},\n  "success": true,\n  "duration_ms": 0,\n  "cost_usd": 0,\n  "target_platforms": {{ JSON.stringify(${VB}.target_platforms) }},\n  "duration_s": {{ Number(${VB}.duration_s) || 15 }},\n  "export_urls": {{ JSON.stringify(${TRANSCODE}.export_urls || {}) }}\n}`,
    options: { timeout: 30000 },
  },
  'Slack: Notify Team': {
    method: 'POST',
    url: SLACK,
    sendHeaders: false,
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "text": {{ JSON.stringify('Video Pipeline Complete: Task ' + ${VB}.task_id + '. Platforms: ' + ((${VB}.target_platforms || []).join(', ')) + '. All exports ready.') }},\n  "blocks": [\n    { "type": "section", "text": { "type": "mrkdwn", "text": {{ JSON.stringify('*Video Generation Complete*\\nTask: ' + ${VB}.task_id + '\\nPlatforms: ' + ((${VB}.target_platforms || []).join(', ')) + '\\nDuration: ' + ${VB}.duration_s + 's\\nStatus: All transcodes done') }} } }\n  ]\n}`,
    options: { timeout: 10000 },
  },
}

const { workflows } = await listN8nWorkflows()
const targets = workflows.filter(w => /Video Pipeline/i.test(w.name) && /Seedance/i.test(w.name))
if (!targets.length) {
  console.error('No Video Pipeline workflow found in n8n. Check name contains "Video Pipeline" + "Seedance".')
  process.exit(1)
}

for (const w of targets) {
  console.log(`\n=== ${w.name} (${w.id})`)
  const detail = await fetchWorkflowDetail(w.id)
  if (!detail.ok || !detail.json?.nodes) {
    console.error(`   ✗ fetch failed: ${detail.status}`)
    continue
  }
  const wf = detail.json
  let changed = 0
  const missing = []
  // Fields that we want to strip entirely when the node is being rewritten
  // (prevents leftovers like `formData` staying around when switching to json).
  const CLEAR_ON_REWRITE = ['formData', 'bodyParameters', 'queryParameters', 'authentication']
  for (const node of wf.nodes) {
    const fix = FIXED_PARAMS[node.name]
    if (!fix) continue
    const before = JSON.stringify(node.parameters)
    const baseParams = { ...(node.parameters || {}) }
    for (const key of CLEAR_ON_REWRITE) delete baseParams[key]
    // Preserve any fields not in `fix` (e.g. typeVersion-specific defaults),
    // but overwrite the ones we're rewriting.
    node.parameters = { ...baseParams, ...fix }
    if (JSON.stringify(node.parameters) !== before) {
      changed++
      console.log(`   rewrote: ${node.name}`)
    }
  }
  for (const name of Object.keys(FIXED_PARAMS)) {
    if (!wf.nodes.some(n => n.name === name)) missing.push(name)
  }
  if (missing.length) console.log('   ⚠ missing nodes:', missing)
  if (!changed) {
    console.log('   (no changes)')
    continue
  }
  if (DRY) {
    console.log(`   [DRY] would PUT ${changed} node rewrites`)
    continue
  }
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
