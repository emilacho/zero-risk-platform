/**
 * Orquesta el smoke aislado del brand book (Opción 1 · CC#4 2026-06-30).
 * Fetch datos reales Náufrago → arma discovery_package → build wf → crea + activa + dispara.
 */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = 'C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform'
const env = readFileSync(join(ROOT, '.env.local'), 'utf8')
const get = (k) => { const m = env.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim() : null }
const base = get('N8N_BASE_URL'); const key = get('N8N_API_KEY')
const url = get('NEXT_PUBLIC_SUPABASE_URL'); const srk = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' }
const SH = { apikey: srk, Authorization: 'Bearer ' + srk }
const CID = 'd69100b5-8ad7-4bb0-908c-68b5544065dc'

const main = async () => {
  // 1 · config.apify (own_handles + competitors reales)
  const c = await fetch(url + '/rest/v1/clients?id=eq.' + CID + '&select=config', { headers: SH })
  const apify = (((await c.json())[0] || {}).config || {}).apify || {}
  // 2 · brain ICP chunks (evidencia real)
  const b = await fetch(
    url + '/rest/v1/client_brain_chunks?client_id=eq.' + CID +
    '&select=section_label,chunk_text&order=created_at.desc&limit=40', { headers: SH })
  const chunks = await b.json()
  const byLabel = {}
  for (const ch of (Array.isArray(chunks) ? chunks : [])) {
    const k = ch.section_label || 'other'
    ;(byLabel[k] = byLabel[k] || []).push(String(ch.chunk_text || '').replace(/\s+/g, ' ').trim())
  }
  const pick = (k) => (byLabel[k] || []).slice(0, 2).join(' · ')

  const discovery_summary =
    'Náufrago es un restaurante de mariscos en Olón (Santa Elena, costa de Ecuador · Ruta del ' +
    'Spondylus), especializado en encebollado y pescado fresco frente al mar. Segmentos ICP reales ' +
    '(del brain): ' + ((byLabel['segment_name'] || []).join(' / ') || 'viajero extranjero + local') +
    '. Dolores: ' + pick('pain_points') + '. Objetivos: ' + pick('goals') +
    '. Objeciones: ' + pick('objections') + '. Canales: ' + pick('preferred_channels') +
    '. Preferencias de contenido: ' + pick('content_preferences') + '.'

  const discoveryPackage = {
    discovery_summary,
    own_handles: apify.own_handles || {},
    competitors: (apify.competitor_list || []).slice(0, 8),
    icp_signals: {
      segments: byLabel['segment_name'] || [],
      pain_points: byLabel['pain_points'] || [],
      goals: byLabel['goals'] || [],
      objections: byLabel['objections'] || [],
      jobs_to_be_done: byLabel['jtbd'] || [],
      decision_criteria: byLabel['decision_criteria'] || [],
      preferred_channels: byLabel['preferred_channels'] || [],
      content_preferences: byLabel['content_preferences'] || [],
    },
    _source: 'isolated_smoke_real_data',
  }
  console.log('discovery_package · summary len:', discovery_summary.length,
    '· competitors:', discoveryPackage.competitors.length,
    '· icp segments:', discoveryPackage.icp_signals.segments.length)

  // 3 · build wf inyectando el package
  execSync('node "' + join(DIR, 'build-isolated-smoke.mjs') + '"', {
    env: { ...process.env, BB_DISCOVERY_PACKAGE: JSON.stringify(discoveryPackage) }, stdio: 'inherit',
  })
  const wf = JSON.parse(readFileSync(join(DIR, 'isolated-smoke.json'), 'utf8'))
  // apuntar el Lazo A al sub-wf live
  const lazo = wf.nodes.find((n) => n.name === '[BB] Lazo A · corrección (sub-wf)')
  if (lazo) lazo.parameters.workflowId = 'kSSAvCbEfHs2Hoa0'

  // 4 · crear (o actualizar si ya existe por nombre)
  const list = await (await fetch(base + '/api/v1/workflows?limit=200', { headers: { 'X-N8N-API-KEY': key } })).json()
  const existing = (list.data || []).find((w) => w.name === wf.name)
  let wid
  if (existing) {
    wid = existing.id
    await fetch(base + '/api/v1/workflows/' + wid, {
      method: 'PUT', headers: H,
      body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings }),
    })
    console.log('updated existing wf', wid)
  } else {
    const cr = await fetch(base + '/api/v1/workflows', {
      method: 'POST', headers: H,
      body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings }),
    })
    const cj = await cr.json(); wid = cj.id
    console.log('created wf', wid, '· status', cr.status)
  }
  // 5 · activar (webhook necesita active)
  const ac = await fetch(base + '/api/v1/workflows/' + wid + '/activate', { method: 'POST', headers: H })
  console.log('activate:', ac.status)
  console.log('WORKFLOW_ID=' + wid)
}
main().catch((e) => { console.log('ERR', e.message); process.exit(1) })
