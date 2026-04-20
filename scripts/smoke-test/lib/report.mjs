// Render smoke-test results as CSV + markdown report.

import { writeFileSync } from 'fs'

function csvEscape(v) {
  if (v === null || v === undefined) return ''
  const s = String(v).replace(/"/g, '""').replace(/\r?\n/g, ' ')
  return s.includes(',') || s.includes('"') ? `"${s}"` : s
}

export function writeCsv(path, rows) {
  const keys = ['type', 'name_or_slug', 'status', 'duration_ms', 'http_status', 'exec_id', 'nodes_ran', 'last_node', 'output_len', 'model', 'tokens', 'error']
  const out = [keys.join(',')]
  for (const r of rows) {
    const name = r.slug || r.name
    out.push([
      r.type, name, r.status, r.duration_ms ?? '',
      r.http_status ?? r.exec_status ?? '',
      r.exec_id ?? '',
      r.nodes_ran ?? '',
      r.last_node ?? '',
      r.output_len ?? '',
      r.model ?? '',
      r.tokens ?? '',
      r.error ?? '',
    ].map(csvEscape).join(','))
  }
  writeFileSync(path, out.join('\n'))
}

export function writeMarkdown(path, rows, meta = {}) {
  const totals = rows.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1
    return acc
  }, {})
  const byType = rows.reduce((acc, r) => {
    acc[r.type] = acc[r.type] || { PASS: 0, FAIL: 0, OTHER: 0, total: 0 }
    acc[r.type].total++
    if (r.status === 'PASS') acc[r.type].PASS++
    else if (r.status === 'FAIL' || r.status === 'TIMEOUT_NO_EXEC') acc[r.type].FAIL++
    else acc[r.type].OTHER++
    return acc
  }, {})
  // Group failures by error pattern
  const patterns = {}
  for (const r of rows) {
    if (r.status !== 'FAIL' && r.status !== 'TIMEOUT_NO_EXEC') continue
    const sig = classifyError(r.error || '')
    patterns[sig] = patterns[sig] || { count: 0, examples: [] }
    patterns[sig].count++
    if (patterns[sig].examples.length < 3) patterns[sig].examples.push(r.slug || r.name)
  }
  const lines = []
  lines.push(`# Zero Risk Smoke Test — ${meta.when || new Date().toISOString()}`)
  lines.push('')
  lines.push(`**Totals:** ${Object.entries(totals).map(([k, v]) => `${k}=${v}`).join(', ')}`)
  lines.push('')
  lines.push('## By type')
  lines.push('')
  lines.push('| Type | Total | PASS | FAIL | OTHER |')
  lines.push('|------|-------|------|------|-------|')
  for (const [t, s] of Object.entries(byType)) {
    lines.push(`| ${t} | ${s.total} | ${s.PASS} | ${s.FAIL} | ${s.OTHER} |`)
  }
  lines.push('')
  lines.push('## Failure patterns (root-cause buckets)')
  lines.push('')
  lines.push('| Pattern | Count | Examples |')
  lines.push('|---------|-------|----------|')
  for (const [sig, info] of Object.entries(patterns).sort((a, b) => b[1].count - a[1].count)) {
    lines.push(`| ${sig} | ${info.count} | ${info.examples.join(', ')} |`)
  }
  lines.push('')
  lines.push('## All results')
  lines.push('')
  lines.push('| Type | Name | Status | ms | Nodes | Last | Error |')
  lines.push('|------|------|--------|----|-------|------|-------|')
  for (const r of rows) {
    const name = r.slug || r.name
    const err = (r.error || '').slice(0, 220).replace(/\|/g, '\\|').replace(/\n/g, ' ')
    lines.push(`| ${r.type} | ${name} | **${r.status}** | ${r.duration_ms ?? ''} | ${r.nodes_ran ?? ''} | ${r.last_node ?? ''} | ${err} |`)
  }
  writeFileSync(path, lines.join('\n'))
}

// Classify an error message into a coarse "pattern" bucket for batch fixing.
export function classifyError(msg) {
  const m = String(msg || '').toLowerCase()
  if (!m) return 'no_error_message'
  if (m.includes('task request timed out')) return 'n8n_runner_timeout'
  if (m.includes('invalid syntax')) return 'n8n_expression_invalid'
  if (m.includes('hasnt been executed') || m.includes("hasn't been executed")) return 'n8n_node_not_executed'
  if (m.includes('bad control character')) return 'n8n_json_body_unescaped'
  if (m.includes('invalid signature')) return 'n8n_jwt_invalid'
  if (m.includes('not loadable') || m.includes('slug not found') || m.includes('not found in agents table')) return 'agent_slug_not_registered'
  if (m.includes('identity content') || m.includes('identity_md is empty')) return 'agent_identity_missing'
  if (m.includes('unauthorized')) return 'auth_unauthorized'
  if (m.includes('not_found') || m.includes('404')) return 'missing_route_or_resource'
  if (m.includes('connection') || m.includes('econnrefused') || m.includes('enotfound')) return 'network_connection'
  if (m.includes('db_error')) return 'supabase_db_error'
  if (m.includes('rate') && m.includes('limit')) return 'claude_rate_limit'
  if (m.includes('credential')) return 'missing_credential'
  if (m.includes('timeout')) return 'generic_timeout'
  return 'other:' + m.slice(0, 40)
}
