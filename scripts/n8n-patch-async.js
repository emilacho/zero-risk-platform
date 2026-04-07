// Zero Risk V2 — n8n Agent Pipeline async patch
// Paste this ENTIRE snippet into the DevTools Console (F12) of the n8n workflow tab:
// https://zerorisk.app.n8n.cloud/workflow/Eg18Ci18cuzQcRXC
//
// It mutates the workflow in memory and then persists it via n8n's own
// authenticated REST helper (same auth as the UI uses when you click Save).
//
// Expected result: { ok: true, nodeCount: 9, webhookResponseMode: 'onReceived' }

(async () => {
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
  const wfStore = pinia._s.get('workflows');
  const wf = wfStore.$state.workflow;

  // 1. Webhook → responseMode = onReceived
  const webhook = wf.nodes.find(n => n.name === 'Webhook');
  webhook.parameters.responseMode = 'onReceived';

  // 2. Remove Respond node
  const ri = wf.nodes.findIndex(n => n.name === 'Respond');
  if (ri !== -1) wf.nodes.splice(ri, 1);

  // 3. Add Callback JARVIS node (idempotent)
  if (!wf.nodes.find(n => n.name === 'Callback JARVIS')) {
    wf.nodes.push({
      id: 'node-callback-jarvis',
      name: 'Callback JARVIS',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2128, 304],
      parameters: {
        method: 'POST',
        url: "={{ $('Webhook').item.json.body.callback_url }}",
        authentication: 'none',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'X-Pipeline-Secret', value: "={{ $('Webhook').item.json.body.callback_secret }}" },
            { name: 'Content-Type', value: 'application/json' }
          ]
        },
        sendBody: true,
        contentType: 'json',
        specifyBody: 'json',
        jsonBody: "={{ JSON.stringify({ pipeline_id: $('Webhook').item.json.body.pipeline_id, status: 'completed', result: $json }) }}",
        options: { timeout: 30000 }
      }
    });
  }

  // 4. Rewire: Jefe Consolidate → Callback JARVIS
  wf.connections['Jefe Consolidate'] = {
    main: [[{ node: 'Callback JARVIS', type: 'main', index: 0 }]]
  };
  delete wf.connections['Respond'];

  // 5. Persist via n8n's authenticated helper
  try {
    await wfStore.updateWorkflow(wf.id, {
      name: wf.name,
      nodes: wf.nodes,
      connections: wf.connections,
      settings: wf.settings || {},
      active: wf.active
    });
    console.log('%c✅ Workflow saved', 'color:lightgreen;font-weight:bold');
    return { ok: true, nodeCount: wf.nodes.length, webhookResponseMode: webhook.parameters.responseMode, nodes: wf.nodes.map(n => n.name) };
  } catch (e) {
    console.error('❌ Save failed:', e);
    return { ok: false, error: String(e && e.message || e) };
  }
})();
