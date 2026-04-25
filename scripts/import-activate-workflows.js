// Imports and activates P5 low-risk workflows into n8n
// Fixes typeValidation: strict → loose before import
const fs = require('fs');
const path = require('path');
const https = require('https');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxYTI4NzdlYS1kNTM3LTRjY2QtOWFjYi0wZDkxODdkYTYzMjciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiZDRkNWI5OTQtOTNlNC00ZGUzLTllOTctODkyMjA1MjllZjUyIiwiaWF0IjoxNzc2NTg1ODk4LCJleHAiOjE3NzkxNjMyMDB9.4caQItA7jteiAmNkMOQ9f7oDzXPLReo1yavUhsz5qII';
const N8N_BASE = 'https://n8n-production-72be.up.railway.app';

function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : '';
    const url = new URL(N8N_BASE + path);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      }
    };
    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(chunks.join(''))); }
        catch (e) { resolve({ raw: chunks.join(''), status: res.statusCode }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function fixWorkflow(wf) {
  // Fix typeValidation: strict → loose in all IF nodes
  let fixes = 0;
  (wf.nodes || []).forEach(node => {
    if (node.type === 'n8n-nodes-base.if') {
      const opts = node.parameters?.conditions?.options;
      if (opts && opts.typeValidation === 'strict') {
        opts.typeValidation = 'loose';
        fixes++;
        console.log(`  Fixed typeValidation in node: "${node.name}"`);
      }
    }
  });
  if (fixes === 0) console.log('  No typeValidation fixes needed');
  return wf;
}

async function importAndActivate(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const wfName = raw.name;
  console.log(`\n=== Processing: ${wfName} ===`);

  // Check if already exists in n8n
  const existing = await apiCall('GET', '/api/v1/workflows?limit=100');
  const found = (existing.data || []).find(w => w.name === wfName);
  if (found) {
    console.log(`  Already exists in n8n with id=${found.id}, active=${found.active}`);
    if (!found.active) {
      const act = await apiCall('POST', `/api/v1/workflows/${found.id}/activate`, {});
      console.log(`  Activated: active=${act.active}`);
    } else {
      console.log(`  Already active — no action needed`);
    }
    return { id: found.id, active: true, action: 'existing' };
  }

  // Fix and prepare for import
  fixWorkflow(raw);

  // Build clean import payload (strip local-only fields)
  const importPayload = {
    name: raw.name,
    nodes: raw.nodes,
    connections: raw.connections || {},
    settings: raw.settings || { executionOrder: 'v1' },
    staticData: raw.staticData || null
  };

  // Create workflow
  const created = await apiCall('POST', '/api/v1/workflows', importPayload);
  if (!created.id) {
    console.log('  CREATE ERROR:', JSON.stringify(created).substring(0, 300));
    return { error: true, details: created };
  }
  console.log(`  Created: id=${created.id}, active=${created.active}`);

  // Activate
  const activated = await apiCall('POST', `/api/v1/workflows/${created.id}/activate`, {});
  console.log(`  Activated: active=${activated.active}`);

  return { id: created.id, active: activated.active, action: 'created' };
}

async function main() {
  const workflowsDir = path.join(__dirname, '..', 'n8n-workflows');
  const targets = [
    'pipeline-delay-resume.json',
    'meta-agent-weekly-cron.json'
  ];

  const results = [];
  for (const file of targets) {
    const result = await importAndActivate(path.join(workflowsDir, file));
    results.push(result);
  }

  console.log('\n=== SUMMARY ===');
  results.forEach((r, i) => console.log(`${targets[i]}: ${JSON.stringify(r)}`));
}

main().catch(console.error);
