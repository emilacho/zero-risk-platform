// E110 · corre UNA prueba en el motor real: crea el flujo de prueba, lo activa, lo dispara, espera, guarda la
// ejecución (llave de despacho tachada), lo apaga y lo BORRA. Nunca toca la cadena.
// node correr-prueba.cjs <prueba.json> <carpeta-evidencia> <etiqueta>
const fs = require('fs')
const [, , archivo, carpeta, etiqueta] = process.argv
const N8N = process.env.N8N_BASE_URL, H = { 'X-N8N-API-KEY': process.env.N8N_API_KEY, 'Content-Type': 'application/json' }
const j = async (u, o) => { const r = await fetch(u, o); const t = await r.text(); let b; try { b = JSON.parse(t) } catch { b = t } if (!r.ok) throw new Error(`${(o && o.method) || 'GET'} ${u} → ${r.status} ${String(t).slice(0, 300)}`); return b }
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const tachar = (o) => JSON.parse(JSON.stringify(o), (k, v) => (k === 'x-sala-dispatch-key' ? '[TACHADO]' : v))
;(async () => {
  const cuerpo = JSON.parse(fs.readFileSync(archivo, 'utf8'))
  if (!/BORRAR/.test(cuerpo.name)) throw new Error('el flujo de prueba debe llevar BORRAR en el nombre')
  const path = cuerpo.nodes.find((n) => n.type === 'n8n-nodes-base.webhook').parameters.path
  const creado = await j(`${N8N}/api/v1/workflows`, { method: 'POST', headers: H, body: JSON.stringify(cuerpo) })
  const id = creado.id
  console.log(`creado ${id} «${creado.name}» · nodos ${creado.nodes.length} · active ${creado.active}`)
  let resultado = null
  try {
    await j(`${N8N}/api/v1/workflows/${id}/activate`, { method: 'POST', headers: H })
    const t0 = new Date().toISOString()
    const disparo = await fetch(`${N8N}/webhook/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prueba: 'E110', etiqueta, t0 }) })
    console.log(`activado · disparo → ${disparo.status} · ${t0}`)
    let ex = null
    for (let i = 0; i < 90; i++) {
      await espera(4000)
      const l = await j(`${N8N}/api/v1/executions?workflowId=${id}&limit=5`, { headers: H })
      const e = (l.data || [])[0]
      if (e && e.status !== 'running' && e.status !== 'new' && e.status !== 'waiting') { ex = e; break }
      if (i % 5 === 0) process.stdout.write(`   … ${e ? e.status : 'sin ejecución'} (${(i + 1) * 4}s)\n`)
    }
    if (!ex) throw new Error('la prueba no terminó en 6 min')
    const full = await j(`${N8N}/api/v1/executions/${ex.id}?includeData=true`, { headers: H })
    fs.mkdirSync(carpeta, { recursive: true })
    fs.writeFileSync(`${carpeta}/prueba-${etiqueta}-ejecucion-${ex.id}.json`, JSON.stringify(tachar(full), null, 2) + '\n')
    fs.writeFileSync(`${carpeta}/prueba-${etiqueta}-flujo-${id}.json`, JSON.stringify(tachar({ ...creado, id, borrado: true }), null, 2) + '\n')
    const rd = full.data.resultData
    const runData = rd.runData || {}
    console.log(`\nEJECUCIÓN ${ex.id} · status ${full.status} · último nodo «${rd.lastNodeExecuted}» · error: ${rd.error ? String(rd.error.message).slice(0, 300) : 'ninguno'}`)
    for (const k of Object.keys(runData)) {
      const runs = runData[k]
      const items = runs.map((r) => ((r.data || {}).main || []).map((a) => (a || []).length).join('/')).join(',')
      const first = (((runs[0].data || {}).main || [[]])[0] || [])[0]
      const p0 = first ? first.pairedItem : undefined
      const err = runs.find((r) => r.error)
      const pr = runs.flatMap((r) => ((((r.data || {}).main || [[]])[0]) || []).map((it) => it.json && it.json._prueba_e110)).filter(Boolean)
      console.log(`  ${k.padEnd(62)} runs ${String(runs.length).padStart(2)} · items ${items.padEnd(22)} · paired0 ${JSON.stringify(p0 === undefined ? null : p0)}${err ? ' · ERROR ' + String(err.error.message).slice(0, 120) : ''}${pr.length ? ' · resueltos ' + JSON.stringify(pr[0].resueltos) : ''}`)
    }
    resultado = { id: ex.id, status: full.status, lastNode: rd.lastNodeExecuted, error: rd.error ? rd.error.message : null }
  } finally {
    try { await j(`${N8N}/api/v1/workflows/${id}/deactivate`, { method: 'POST', headers: H }) } catch (e) { console.log('desactivar:', e.message) }
    await j(`${N8N}/api/v1/workflows/${id}`, { method: 'DELETE', headers: H })
    let sigue = 'sí'
    try { await j(`${N8N}/api/v1/workflows/${id}`, { headers: H }) } catch (e) { sigue = /404/.test(e.message) ? 'no (404)' : e.message }
    console.log(`\nBORRADO ${id} · ¿sigue existiendo? ${sigue}`)
  }
  fs.writeFileSync(`${carpeta}/prueba-${etiqueta}-resultado.json`, JSON.stringify(resultado, null, 2) + '\n')
  if (resultado.status !== 'success') process.exit(2)
})().catch((e) => { console.error('🔴', e.message); process.exit(1) })
