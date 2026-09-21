// E109 · el manual se escribe con la materia del cliente · lado del ALTA · cambios 1, 2 y la mitad del 3.
//
// Medido (E107 · alta 146532 · Paso 0 confirmado en la versión viva ea4a3486):
//   1. «[APIFY-WIRE] Gate · drop skip-markers (lazo)» corre en runOnceForAllItems y lee `$input.item`
//      ⇒ de 2 objetivos (own_web · instagram @naufrago.ec) dejó pasar SÓLO el primero. Instagram propio se perdió.
//   2. Ese primero era `own_web` (apify_function: null) y el Servicio Apify lo rechazó («apify_function invalid»).
//      El sitio ya lo lee «Leer el sitio del cliente» por otro camino: no hay que mandarlo al Servicio.
//   3. «El texto del sitio, o el hueco» trajo 16.006 caracteres (4 páginas) y el paquete al cimiento
//      («[JEFATURA] Transform discovery→package») no lleva ningún texto del cliente ⇒ las lentes no lo ven.
// Cambios (mínimos): Gate → pasa TODOS los válidos y filtra own_web · Transform → discovery_package.materia_cliente
// (sitio_texto con tope · instagram propio con tope · idioma). Nada más se toca.
//
// node scripts/worker-staging/LyVoKcrypS5uLyuu/construir-e109.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const vivo = JSON.parse(readFileSync(join(aqui, 'alta-antes-e109-ea4a3486.json'), 'utf8'))

export const GATE = '[APIFY-WIRE] Gate · drop skip-markers (lazo)'
export const TRANSFORM = '[JEFATURA] Transform discovery→package'
export const SITIO = 'El texto del sitio, o el hueco'
export const CALL = '[APIFY-WIRE] Call Apify Service Workflow (onboarding_e2e)'
export const TOPE_SITIO = 3500
export const TOPE_IG = 1000
export const IDIOMA = 'español de Ecuador · sin voseo (tú, no vos: «sabes», «pides», «pagas»)'
const SETTINGS_OK = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder']

export const CODIGO_GATE = `// Gate · drop items that signaled skip (_discovery_ok=false or _skip_reason)
// Canon §148 · log skip but never crash the worker · always safe pass.
// E109 (CC#1 2026-09-21) · corre UNA vez para TODOS los ítems: antes leía $input.item y dejaba pasar
// sólo el primero (en 146532 se perdió instagram_scraper @naufrago.ec). Y own_web (apify_function null)
// NO va al Servicio Apify: lo rechaza («apify_function invalid») y el sitio ya lo lee «Leer el sitio del cliente».
const pasan = [];
for (const it of $input.all()) {
  const item = it.json || {};
  if (item._discovery_ok === false || item._skip_reason) continue;   // señaló saltar · no pasa
  if (!item.apify_function) continue;                                 // own_web · el sitio va por otro camino
  pasan.push({ json: item });
}
return pasan;`

export const ANEXO_TRANSFORM = `
// E109 (CC#1 2026-09-21) · LA MATERIA DEL CLIENTE viaja en el paquete: el texto del sitio (ya leído por
// «${SITIO}» · guardado en client_web_pages) y lo raspado del Instagram propio (la llamada del
// Servicio Apify cuyo objetivo fue own:instagram) · con tope · más la línea de idioma. Sin esto las lentes
// escribían «no hay textos web» con el sitio leído (146544). No se reescribe ninguna lente ni el juez.
const materia_cliente = (() => {
  const m = { idioma: ${JSON.stringify(IDIOMA)}, sitio_estado: null, sitio_texto: '', sitio_caracteres_total: 0, instagram_propio: '', instagram_estado: null };
  try {
    const s = $('${SITIO}').first().json || {};
    m.sitio_estado = s.sitio_estado || null;
    m.sitio_caracteres_total = Number(s.sitio_caracteres) || 0;
    m.sitio_texto = String(s.sitio_texto || '').slice(0, ${TOPE_SITIO});
  } catch (e) { m.sitio_estado = 'no_disponible'; }
  try {
    const gate = $('${GATE}').all();
    const calls = $('${CALL}').all();
    calls.forEach((c, i) => {
      const t = (gate[i] && gate[i].json) || {};
      const r = c.json || {};
      if (t.target_kind === 'own' && t.apify_function === 'instagram_scraper') {
        m.instagram_estado = r.ok === true ? 'trajo' : 'sin_respuesta';
        if (r.ok === true) m.instagram_propio = String(r.datos || '').slice(0, ${TOPE_IG});
      }
    });
    if (m.instagram_estado === null) m.instagram_estado = 'no_pedido';
  } catch (e) { m.instagram_estado = 'no_disponible'; }
  return m;
})();
discovery_package.materia_cliente = materia_cliente;
`

export function construir(flujo) {
  const byName = new Map(flujo.nodes.map((n) => [n.name, n]))
  for (const n of [GATE, TRANSFORM, SITIO, CALL]) if (!byName.has(n)) throw new Error(`no encontré «${n}»`)
  const gate = byName.get(GATE)
  if (!String(gate.parameters.jsCode).includes('$input.item')) throw new Error('el Gate ya no lee $input.item · no es la forma esperada (ea4a3486)')
  if (gate.parameters.mode) throw new Error('el Gate tiene modo explícito · no es la forma esperada')
  const tr = byName.get(TRANSFORM)
  const code = String(tr.parameters.jsCode)
  if (code.includes('materia_cliente')) throw new Error('el Transform ya trae E109 · no construir dos veces')
  const marca = 'return [{ json: {\n  client_id: dealData.client_id'
  if (!code.includes(marca)) throw new Error('no encuentro el return del Transform (ea4a3486)')
  if (!/const discovery_package\b/.test(code)) throw new Error('el Transform no declara discovery_package como const · revisar antes de anexar')
  const gateNuevo = { ...gate, parameters: { ...gate.parameters, jsCode: CODIGO_GATE }, notes: ((gate.notes || '') + '\nE109 · pasa TODOS los objetivos válidos · own_web no va al Servicio (el sitio ya se leyó).').trim() }
  const trNuevo = { ...tr, parameters: { ...tr.parameters, jsCode: code.replace(marca, ANEXO_TRANSFORM + marca) }, notes: ((tr.notes || '') + '\nE109 · discovery_package.materia_cliente: sitio_texto + instagram propio (con tope) + idioma.').trim() }
  const nodes = flujo.nodes.map((n) => (n.name === GATE ? gateNuevo : n.name === TRANSFORM ? trNuevo : n))
  const settings = {}
  for (const k of SETTINGS_OK) if (flujo.settings?.[k] !== undefined) settings[k] = flujo.settings[k]
  return { name: flujo.name, nodes, connections: flujo.connections, settings }
}

const construido = construir(vivo)
writeFileSync(join(aqui, 'alta-construida-e109.json'), JSON.stringify(construido, null, 2) + '\n')
console.log('construida ·', construido.nodes.length, 'nodos · Gate (1+2) · Transform.materia_cliente (3)')
