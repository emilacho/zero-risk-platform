// AUDITORÍA · ¿QUIÉN LEE A UN NODO QUE NO ESTÁ GARANTIZADO ANTES QUE ÉL? · CC#1 · 2026-09-30 · sólo lectura.
//   node auditar-referencias-fuera-de-orden.mjs [--salida=archivo.json]
// La clase de defecto (encontrada en planeación, ver el hallazgo del 30-sep): un nodo lee con `$('X')` a otro nodo X que NO es su ANTECESOR en el grafo (cuelga de una rama
// paralela). En n8n v1 el orden entre ramas hermanas depende de la posición en el lienzo y de que las ramas vecinas estén vacías o no: funciona «de casualidad» y se rompe cuando cambia
// el volumen de una rama. Esta auditoría lista, en TODOS los flujos, cada lectura `$('X')` / `$node["X"]` donde X no es antecesor del que lee.
// Es una heurística: una lectura a un no-antecesor puede ser legítima (nodo webhook de entrada que se lee por su nombre, `try/catch` que tolera ausencia). Se separa por gravedad.
import fs from 'node:fs'
const envPath = process.env.ENV_FILE || 'C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local'
for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '') }
const N8N = process.env.N8N_BASE_URL, H = { 'X-N8N-API-KEY': process.env.N8N_API_KEY }
const salida = (process.argv.find((a) => a.startsWith('--salida=')) || '').slice(9)

const lista = []
let cursor = ''
do {
  const r = await (await fetch(`${N8N}/api/v1/workflows?limit=100${cursor ? '&cursor=' + cursor : ''}`, { headers: H })).json()
  lista.push(...(r.data || []))
  cursor = r.nextCursor || ''
} while (cursor)

const hallazgos = []
for (const meta of lista) {
  const w = await (await fetch(`${N8N}/api/v1/workflows/${meta.id}`, { headers: H })).json()
  if (!w.nodes) continue
  const nombres = new Set(w.nodes.map((n) => n.name))
  // padres: quién apunta a quién
  const padres = {}
  for (const [de, c] of Object.entries(w.connections || {})) for (const salidas of (c.main || [])) for (const h of (salidas || [])) (padres[h.node] = padres[h.node] || new Set()).add(de)
  const antecesores = (n) => { const vistos = new Set(); const pila = [...(padres[n] || [])]; while (pila.length) { const x = pila.pop(); if (vistos.has(x)) continue; vistos.add(x); for (const p of (padres[x] || [])) pila.push(p) } return vistos }
  const hijosDe = {}
  for (const [de, c] of Object.entries(w.connections || {})) for (const salidas of (c.main || [])) for (const h of (salidas || [])) (hijosDe[de] = hijosDe[de] || new Set()).add(h.node)
  const triggers = new Set(w.nodes.filter((n) => /webhook|trigger|schedule|manual/i.test(n.type)).map((n) => n.name))
  for (const n of w.nodes) {
    const texto = JSON.stringify(n.parameters || {})
    const refs = new Set()
    for (const m of texto.matchAll(/\$\(\\?["']([^"'\\]+?)\\?["']\)/g)) refs.add(m[1])
    for (const m of texto.matchAll(/\$node\[\\?["']([^"'\\]+?)\\?["']\]/g)) refs.add(m[1])
    const anc = antecesores(n.name)
    for (const r of refs) {
      if (r === n.name || !nombres.has(r)) continue
      if (anc.has(r)) continue
      // ¿es hermano paralelo? comparten un antecesor directo distinto de ambos
      const comparten = [...(padres[r] || [])].some((p) => anc.has(p) || p === n.name || (padres[n.name] || new Set()).has(p))
      hallazgos.push({
        flujo: w.name, id: w.id, activo: !!w.active, nodo_que_lee: n.name, lee_a: r,
        es_disparador: triggers.has(r),
        rama_paralela: comparten,
        tolerante: /try\s*\{|catch/.test(texto) ,
      })
    }
  }
}
const relevantes = hallazgos.filter((h) => !h.es_disparador)
const porFlujo = {}
for (const h of relevantes) (porFlujo[h.flujo + ' [' + h.id + ']' + (h.activo ? '' : ' (inactivo)')] = porFlujo[h.flujo + ' [' + h.id + ']' + (h.activo ? '' : ' (inactivo)')] || []).push(h)
const resumen = { flujos_revisados: lista.length, lecturas_a_no_antecesor: hallazgos.length, sin_contar_disparadores: relevantes.length, flujos_con_hallazgos: Object.keys(porFlujo).length, porFlujo }
if (salida) fs.writeFileSync(salida, JSON.stringify(resumen, null, 1))
console.log('flujos revisados:', lista.length, '· lecturas a un no-antecesor (sin contar disparadores):', relevantes.length, '· flujos afectados:', Object.keys(porFlujo).length)
for (const [f, hs] of Object.entries(porFlujo)) {
  console.log('\n' + f)
  for (const h of hs) console.log('  ·', h.nodo_que_lee, '→', h.lee_a, h.rama_paralela ? '[RAMA PARALELA]' : '[no antecesor]', h.tolerante ? '(con try/catch)' : '(SIN tolerancia)')
}
