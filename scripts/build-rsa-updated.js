const fs = require('fs');
const path = require('path');

const wf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rsa_workflow_temp.json'), 'utf8'));

// n8n expression template for the body
// Uses {{ expression }} syntax inside the JSON string
const bodyTemplate = JSON.stringify({
  type: 'task_completed',
  title: "RSA generado: ={{ $('Code: Validate Brief').item.json.task_id }}",
  body: "Creative Director generó RSA matrix para keyword '={{ $('Code: Validate Brief').item.json.keyword }}'",
  priority: 'medium',
  metadata: {
    workflow: 'rsa-generator',
    client_id: "={{ $('Code: Validate Brief').item.json.client_id }}"
  }
});

const mcNode = {
  id: 'notify-mc-inbox',
  name: 'Notify MC Inbox',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [2200, 300],
  parameters: {
    method: 'POST',
    url: 'https://zero-risk-mission-control-production.up.railway.app/api/inbox?masterPassword=zerorisk2026',
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: 'Content-Type', value: 'application/json' }
      ]
    },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: bodyTemplate,
    options: {
      timeout: 10000,
      response: {
        response: {
          neverError: true
        }
      }
    }
  }
};

// Remove old notify-mc-inbox if already added
wf.nodes = wf.nodes.filter(n => n.id !== 'notify-mc-inbox');

// Add new node
wf.nodes.push(mcNode);

// Add connection: Slack: Notify Team -> Notify MC Inbox
if (!wf.connections['Slack: Notify Team']) {
  wf.connections['Slack: Notify Team'] = { main: [[]] };
}
if (!wf.connections['Slack: Notify Team'].main[0]) {
  wf.connections['Slack: Notify Team'].main[0] = [];
}
// Remove duplicate if exists
wf.connections['Slack: Notify Team'].main[0] = wf.connections['Slack: Notify Team'].main[0].filter(
  c => c.node !== 'Notify MC Inbox'
);
wf.connections['Slack: Notify Team'].main[0].push({
  node: 'Notify MC Inbox',
  type: 'main',
  index: 0
});

const putBody = {
  name: wf.name,
  nodes: wf.nodes,
  connections: wf.connections,
  settings: wf.settings || {},
  staticData: wf.staticData || null
};

const outPath = path.join(__dirname, '..', 'rsa_updated_temp.json');
fs.writeFileSync(outPath, JSON.stringify(putBody));

console.log('Node count:', wf.nodes.length);
console.log('Last node:', wf.nodes[wf.nodes.length - 1].name);
console.log('jsonBody:', JSON.parse(fs.readFileSync(outPath)).nodes.find(n => n.name === 'Notify MC Inbox').parameters.jsonBody.substring(0, 100));
console.log('Connection:', JSON.stringify(wf.connections['Slack: Notify Team'].main[0]));
