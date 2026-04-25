// Adds "Notify MC Inbox" HTTP node to workflows that don't have it.
// Wires it after the last node in the main execution chain.
// Safe: only modifies workflows in TARGETS list.

const https = require('https');

const N8N_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxYTI4NzdlYS1kNTM3LTRjY2QtOWFjYi0wZDkxODdkYTYzMjciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiZDRkNWI5OTQtOTNlNC00ZGUzLTllOTctODkyMjA1MjllZjUyIiwiaWF0IjoxNzc2NTg1ODk4LCJleHAiOjE3NzkxNjMyMDB9.4caQItA7jteiAmNkMOQ9f7oDzXPLReo1yavUhsz5qII';
const N8N_BASE = 'https://n8n-production-72be.up.railway.app';
const MC_BASE = 'https://zero-risk-mission-control-production.up.railway.app';
const MC_PASS = 'zerorisk2026';

const TARGETS = [
  { id: 'rX26RJeifPRkH4ny', slug: 'content-repurposing',  label: 'Content Repurposing completado' },
  { id: 'V9pAg0P6AP8aJBx2', slug: 'ad-creative-validator', label: 'Ad Creative validado' },
  { id: 'LyVoKcrypS5uLyuu', slug: 'client-onboarding',    label: 'Client Onboarding completado' },
  { id: '7OMw3lArwxhuyNbH', slug: 'subject-line-ab',      label: 'Subject Line A/B completado' },
  { id: 'sCcaRT0NNQiE7JaR', slug: 'review-severity',      label: 'Review Severity procesado' },
  { id: 'Yo1j0LlBqFVqrihh', slug: 'email-lifecycle',      label: 'Email Lifecycle completado' },
  { id: '5nOu3EMssRzZwrl6', slug: 'ruflo-router',         label: 'RUFLO routing completado' },
];

function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : '';
    const url = new URL(N8N_BASE + path);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'X-N8N-API-KEY': N8N_KEY,
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(chunks.join('')) }); }
        catch { resolve({ status: res.statusCode, data: { raw: chunks.join('') } }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function makeMCNode(wfId, slug, label, anchorX, anchorY) {
  const jsonBody = '={"from":"' + slug + '","to":"leader","type":"report","taskId":"{{ $json.task_id ?? $json.client_id ?? (\'wf-\' + $now) }}","subject":"' + label + '","body":"client={{ $json.client_id ?? \'unknown\' }} | workflow={{ $workflow.name }}"}';

  return {
    id: `mc-inbox-${wfId.slice(-6)}`,
    name: 'Notify MC Inbox',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [anchorX + 240, anchorY],
    parameters: {
      method: 'POST',
      url: `${MC_BASE}/api/inbox`,
      authentication: 'none',
      sendQuery: true,
      queryParameters: {
        parameters: [{ name: 'masterPassword', value: MC_PASS }]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody,
      options: { allowUnauthorizedCerts: false },
    },
  };
}

function findAnchorNode(nodes) {
  // Priority: Slack notify → Record Outcome → last node by x position
  const priorities = ['Slack: Notify Team', 'Record: Outcome', 'Record Outcome'];
  for (const name of priorities) {
    const n = nodes.find(nd => nd.name === name);
    if (n) return n;
  }
  // Fallback: rightmost node (highest x)
  return nodes.reduce((best, n) => (n.position[0] > best.position[0] ? n : best), nodes[0]);
}

async function addMCNode(target) {
  const { id: wfId, slug, label } = target;

  const { data: wf } = await apiCall('GET', `/api/v1/workflows/${wfId}`);
  if (!wf.nodes) { console.error(`  [${slug}] Failed to fetch workflow`); return; }

  if (wf.nodes.find(n => n.name === 'Notify MC Inbox')) {
    console.log(`  [${slug}] Already has MC node — skipping`);
    return;
  }

  const anchor = findAnchorNode(wf.nodes);
  const mcNode = makeMCNode(wfId, slug, label, anchor.position[0], anchor.position[1]);

  // Wire: anchor → MC node
  const conns = wf.connections || {};
  if (!conns[anchor.name]) conns[anchor.name] = { main: [[]] };
  if (!conns[anchor.name].main) conns[anchor.name].main = [[]];
  if (!conns[anchor.name].main[0]) conns[anchor.name].main[0] = [];
  conns[anchor.name].main[0].push({ node: mcNode.name, type: 'main', index: 0 });

  const putBody = {
    name: wf.name,
    nodes: [...wf.nodes, mcNode],
    connections: conns,
    settings: wf.settings || {},
    staticData: wf.staticData || null,
  };

  const { status, data: result } = await apiCall('PUT', `/api/v1/workflows/${wfId}`, putBody);
  if (status !== 200 || !result.id) {
    console.error(`  [${slug}] PUT failed ${status}: ${JSON.stringify(result).slice(0, 120)}`);
    return;
  }

  // Deactivate → sleep → activate
  await apiCall('POST', `/api/v1/workflows/${wfId}/deactivate`, {});
  await new Promise(r => setTimeout(r, 800));
  const { data: act } = await apiCall('POST', `/api/v1/workflows/${wfId}/activate`, {});
  console.log(`  [${slug}] ✅ Added after "${anchor.name}" | active=${act.active}`);
}

(async () => {
  console.log(`Adding MC Inbox node to ${TARGETS.length} workflows...`);
  for (const t of TARGETS) {
    try { await addMCNode(t); }
    catch (e) { console.error(`  [${t.slug}] ERROR: ${e.message}`); }
  }
  console.log('Done.');
})();
