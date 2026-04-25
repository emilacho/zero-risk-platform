// Fixes the Notify MC Inbox node in RSA workflow to use correct MC inbox schema
const https = require('https');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxYTI4NzdlYS1kNTM3LTRjY2QtOWFjYi0wZDkxODdkYTYzMjciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiZDRkNWI5OTQtOTNlNC00ZGUzLTllOTctODkyMjA1MjllZjUyIiwiaWF0IjoxNzc2NTg1ODk4LCJleHAiOjE3NzkxNjMyMDB9.4caQItA7jteiAmNkMOQ9f7oDzXPLReo1yavUhsz5qII';
const N8N_BASE = 'https://n8n-production-72be.up.railway.app';
const WF_ID = 'CQBo37jBsyApY8DN';

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

async function main() {
  // Get current workflow
  const wf = await apiCall('GET', `/api/v1/workflows/${WF_ID}`);
  console.log('Got workflow:', wf.name, '| nodes:', wf.nodes.length);

  // Find and update the Notify MC Inbox node
  const mcNode = wf.nodes.find(n => n.name === 'Notify MC Inbox');
  if (!mcNode) {
    console.error('Notify MC Inbox node not found!');
    process.exit(1);
  }

  // n8n HTTP Request jsonBody: string starting with "=" for expression interpolation
  // Uses {{ expr }} blocks evaluated by n8n at runtime
  const jsonBodyStr = [
    '={',
    '"from":"rsa-generator",',
    '"to":"leader",',
    '"type":"report",',
    '"taskId":"{{ $(\'Code: Validate Brief\').item.json.task_id }}",',
    '"subject":"RSA generado: {{ $(\'Code: Validate Brief\').item.json.keyword }}",',
    '"body":"Creative Director generó RSA matrix para keyword \'{{ $(\'Code: Validate Brief\').item.json.keyword }}\' | client={{ $(\'Code: Validate Brief\').item.json.client_id }}"',
    '}'
  ].join('');

  mcNode.parameters.jsonBody = jsonBodyStr;
  console.log('Updated jsonBody:', mcNode.parameters.jsonBody.substring(0, 150));

  // PUT updated workflow
  const putBody = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || {},
    staticData: wf.staticData || null
  };

  const result = await apiCall('PUT', `/api/v1/workflows/${WF_ID}`, putBody);
  if (result.id) {
    console.log('PUT OK - nodes:', result.nodes.length);
  } else {
    console.error('PUT ERROR:', JSON.stringify(result).substring(0, 200));
    process.exit(1);
  }

  // Deactivate + activate to reload
  await apiCall('POST', `/api/v1/workflows/${WF_ID}/deactivate`, {});
  await new Promise(r => setTimeout(r, 800));
  const activated = await apiCall('POST', `/api/v1/workflows/${WF_ID}/activate`, {});
  console.log('Reactivated: active=', activated.active);
}

main().catch(console.error);
