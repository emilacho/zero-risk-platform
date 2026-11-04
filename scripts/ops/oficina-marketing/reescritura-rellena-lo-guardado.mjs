/**
 * 04-nov · GO Lenovo «el juez ve lo mismo que el redactor» · flujo «Manual · pedir cambios (reescritura)» `ujka3yHnKbjzXJJS`.
 * En una reescritura el descubrimiento no se repite, así que «③ Armar la entrada del manual» dejaba `discovery_package` con un texto de relleno: sin materia del cliente y sin competidores.
 * Ni el redactor (las lentes) ni el juez recibían lo que SÍ recibió el alta. Ahora la entrada se rellena con lo ya guardado y DECLARA su origen (`materia_origen: 'guardado'`):
 *   · el sitio propio: filas de `client_web_pages` con `owner_role = propio`, enteras (sin corte), la más reciente primero
 *   · los competidores: filas de `client_competitive_landscape` del cliente
 *   · el Instagram propio no se guarda aparte: se declara `instagram_estado: 'no_guardado_aparte'` (no se inventa)
 * Dos lecturas nuevas (`onError: continueRegularOutput`, nunca frenan la reescritura: si fallan, queda como hoy y se dice `sin_guardado`).
 */
import { agregarNodo, cambiarCodigo, conectar, nodo, redirigir } from './lib.mjs'

const N_FICHA = '② Leer la ficha del cliente'
const N_ARMAR = '③ Armar la entrada del manual'
export const N_SITIO = '② Leer el sitio guardado del cliente'
export const N_COMPETIDORES = '② Leer los competidores guardados'
const NL = String.fromCharCode(92) + 'n' // la secuencia «\n» ESCRITA en el código del nodo

const clon = (f, nombre, ruta) => {
  const o = nodo(f, N_FICHA)
  const p = JSON.parse(JSON.stringify(o.parameters))
  p.url = `={{ ($env.SUPABASE_URL || $env.NEXT_PUBLIC_SUPABASE_URL) }}/rest/v1/${ruta}`
  return { name: nombre, type: 'n8n-nodes-base.httpRequest', typeVersion: o.typeVersion, onError: 'continueRegularOutput', parameters: p }
}
const CID = "{{ $('⓪ Llave · Webhook · manual-cambios').first().json.sobre.client_id }}"

const AYUDAS = [
  '// 04-nov · lo ya guardado del cliente (la reescritura no repite el descubrimiento): el juez y el redactor ven lo mismo que vieron en el alta',
  'const _filas = (n) => { try { const r = $(n).first().json; return r.statusCode === 200 && Array.isArray(r.body) ? r.body : null } catch (e) { return null } }',
  "const _sitio = _filas('" + N_SITIO + "')",
  "const _comp = _filas('" + N_COMPETIDORES + "')",
  "const _paginas = (_sitio || []).filter((p) => p && String(p.content_text || '').trim())",
  `const _sitioTexto = _paginas.map((p) => '### ' + String(p.title || p.url || 'sitio') + (p.url ? ' (' + p.url + ')' : '') + '${NL}' + String(p.content_text)).join('${NL}${NL}')`,
  'const _materia = {',
  "  idioma: '', materia_origen: 'guardado',",
  "  sitio_estado: _sitio === null ? 'sin_guardado' : (_paginas.length ? 'guardado' : 'sin_texto_guardado'), sitio_texto: _sitioTexto, sitio_caracteres_total: _sitioTexto.length,",
  "  instagram_estado: 'no_guardado_aparte', instagram_propio: '',",
  '}',
  'const _competidores = (_comp || []).map((c) => ({',
  '  name: c.competitor_name, type: c.competitor_type || null, website: c.competitor_website || null, value_proposition: c.value_proposition || null,',
  '  key_differentiators: c.key_differentiators || [], weaknesses: c.weaknesses || [], pricing_range: c.pricing_range || null, target_audience: c.target_audience || null,',
  '})).filter((c) => c.name)',
  '',
].join('\n')

export function construirReescrituraRellenaLoGuardado(f) {
  agregarNodo(f, clon(f, N_SITIO, `client_web_pages?client_id=eq.${CID}&owner_role=eq.propio&select=url,title,content_text,crawled_at&order=crawled_at.desc`), N_FICHA, 0, 220)
  agregarNodo(f, clon(f, N_COMPETIDORES, `client_competitive_landscape?client_id=eq.${CID}&select=competitor_name,competitor_type,competitor_website,value_proposition,key_differentiators,weaknesses,pricing_range,target_audience`), N_FICHA, 0, 440)
  redirigir(f, N_FICHA, N_ARMAR, N_SITIO)
  conectar(f, N_SITIO, N_COMPETIDORES)
  conectar(f, N_COMPETIDORES, N_ARMAR)

  cambiarCodigo(f, N_ARMAR, 'return [{ json: {\n  client_id: sobre.client_id,', AYUDAS + 'return [{ json: {\n  client_id: sobre.client_id,')
  cambiarCodigo(f, N_ARMAR, "la ficha y el cerebro.', reescritura: true },", "la ficha y el cerebro.' + (_paginas.length || _competidores.length ? ' Se rellenó con lo ya guardado del cliente (origen: guardado): ' + (_paginas.length ? 'el sitio propio' : '') + (_paginas.length && _competidores.length ? ' y ' : '') + (_competidores.length ? 'los competidores' : '') + '.' : ''), reescritura: true, materia_cliente: _materia, competitors: _competidores },")
}
